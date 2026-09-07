import {notchCrosses} from './geometry.js';
import {MeshBuffer,inspectMesh} from './mesh-quality.js';
export {inspectMesh} from './mesh-quality.js';
export const DEFAULT_PRINT={profile:'round',thickening:1,minDiameter:0.8,outputWidth:40,layers:1,layerSpacing:4,voxel:0.28,deformed:false,maxTriangles:8000000,maxGridPoints:128000000,simplify:true,targetRatio:.2,surfaceError:.03,protectJunctions:true,normalWeight:1};
export function printPrimitives(graph,options={},simulation=null){
  const o={...DEFAULT_PRINT,...options},scale=o.outputWidth/graph.width,segments=[],junctions=new Map();
  let sourceNodes=graph.nodes,sourceEdges=graph.edges.filter(e=>!notchCrosses(graph,e));
  if(o.deformed&&simulation?.elements&&(simulation.positions||simulation.q)){const p=simulation.positions,q=simulation.q,stride=simulation.dofs||3,n=p?p.length/3:q.length/stride;sourceNodes=Array.from({length:n},(_,i)=>({x:p?p[3*i]:q[stride*i],y:p?p[3*i+1]:q[stride*i+1],z:p?p[3*i+2]:stride===6?q[stride*i+2]:0}));sourceEdges=simulation.elements.filter((e,i)=>simulation.active[i]).map(e=>({...e}));}
  const nz=graph.dimension===3?1:Math.max(1,Math.min(4,Math.round(o.layers))),spacing=Math.max(.2,o.layerSpacing);
  for(let k=0;k<nz;k++){
    const z=k*spacing;
    for(const e of sourceEdges){
      const r=Math.max(e.r*scale*o.thickening,o.minDiameter/2),a=sourceNodes[e.a],b=sourceNodes[e.b];
      const start=[a.x*scale,a.y*scale,(a.z||0)*scale+z],end=[b.x*scale,b.y*scale,(b.z||0)*scale+z];segments.push({a:start,b:end,r,flat:o.profile==='ribbon',square:graph.dimension===3&&o.profile==='ribbon'});
      for(const [id,p] of [[e.a,start],[e.b,end]]){const key=`${k}:${id}`;if(!junctions.has(key)||junctions.get(key).r<r)junctions.set(key,{p,r,id,k});}
    }
  }
  if(nz>1){for(const j of junctions.values())if(j.k<nz-1){const upper=junctions.get(`${j.k+1}:${j.id}`);if(upper)segments.push({a:j.p,b:upper.p,r:Math.max(j.r*.85,o.minDiameter/2),flat:false});}}
  if(o.profile==='nodes')for(const j of junctions.values())segments.push({a:j.p,b:j.p,r:1.45*j.r,flat:false});
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const s of segments)for(let a=0;a<3;a++){const r=s.r*(s.square?Math.sqrt(3):1);bounds.min[a]=Math.min(bounds.min[a],s.a[a]-r,s.b[a]-r);bounds.max[a]=Math.max(bounds.max[a],s.a[a]+r,s.b[a]+r);}
  return {segments,bounds,scale,options:o,minDiameter:2*Math.min(...segments.map(s=>s.r))};
}
// Slice-streamed implicit union and conforming marching tetrahedra. Only two
// scalar planes and the shared edges of the current/next plane stay in memory.
export function meshBudget(options={}){
  const cap=(x,fallback,lo,hi)=>Math.round(Math.max(lo,Math.min(hi,Number.isFinite(+x)?+x:fallback)));
  return {maxTriangles:cap(options.maxTriangles,DEFAULT_PRINT.maxTriangles,1000,16000000),maxGridPoints:cap(options.maxGridPoints,DEFAULT_PRINT.maxGridPoints,1000,512000000)};
}
export function estimatePrintGrid(spec,h){const origin=spec.bounds.min.map(x=>x-3*h),dims=spec.bounds.max.map((x,i)=>Math.ceil((x-origin[i])/h)+4);return {origin,dims,total:dims[0]*dims[1]*dims[2],plane:dims[0]*dims[1]};}
export function buildPrintMesh(graph,options={},simulation=null,onProgress=()=>{}){
  const spec=printPrimitives(graph,options,simulation),{segments,bounds}=spec,budget=meshBudget(options);
  if(!segments.length)throw Error('No intact struts are available to export.');
  const h=options.voxel||DEFAULT_PRINT.voxel;
  if(!Number.isFinite(h)||h<.06)throw Error('Voxel size must be at least 0.06 mm.');
  if(h>spec.minDiameter/2.6)throw Error(`Use a voxel size ≤ ${(spec.minDiameter/2.6).toFixed(2)} mm to resolve the thinnest strut.`);
  const {origin,dims,total,plane}=estimatePrintGrid(spec,h),[nx,ny,nz]=dims;
  if(!Number.isSafeInteger(total)||total>budget.maxGridPoints)throw Error(`This export needs ${(total/1e6).toFixed(1)}M grid samples. Raise the grid budget (currently ${(budget.maxGridPoints/1e6).toFixed(0)}M), increase voxel size, or reduce the specimen size/repeats.`);
  if(plane>16000000)throw Error('A single mesh slice is too large. Increase voxel size or reduce width/height.');
  const prepared=segments.map(s=>{
    const v=s.b.map((x,i)=>x-s.a[i]),vv=v.reduce((a,x)=>a+x*x,0),pad=s.r*(s.square?Math.sqrt(3):1)+2*h;
    const lo=s.a.map((x,i)=>Math.max(0,Math.floor((Math.min(x,s.b[i])-pad-origin[i])/h))),hi=s.a.map((x,i)=>Math.min(dims[i]-1,Math.ceil((Math.max(x,s.b[i])+pad-origin[i])/h)));
    let axis,u,w,halfLength;if(s.square){const L=Math.sqrt(vv);axis=v.map(x=>x/L);const k=axis.reduce((b,x,i)=>Math.abs(x)<Math.abs(axis[b])?i:b,0),base=[0,0,0];base[k]=1;u=base.map((x,i)=>x-axis[i]*axis[k]);const len=Math.hypot(...u);u=u.map(x=>x/len);w=[axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]];halfLength=L/2+s.r;}
    return {s,v,vv,lo,hi,axis,u,w,halfLength};
  });
  const lower=new Float32Array(plane),upper=new Float32Array(plane);
  function fillPlane(field,k){
    field.fill(-4*h);
    for(const p of prepared){if(k<p.lo[2]||k>p.hi[2])continue;const {s,v,vv,lo,hi,axis,u,w,halfLength}=p,z=origin[2]+k*h-s.a[2];
      for(let j=lo[1];j<=hi[1];j++)for(let i=lo[0];i<=hi[0];i++){
        const x=origin[0]+i*h-s.a[0],y=origin[1]+j*h-s.a[1];let d;
        if(s.square){const px=x-v[0]/2,py=y-v[1]/2,pz=z-v[2]/2;d=Math.max(Math.abs(px*axis[0]+py*axis[1]+pz*axis[2])-halfLength,Math.abs(px*u[0]+py*u[1]+pz*u[2])-s.r,Math.abs(px*w[0]+py*w[1]+pz*w[2])-s.r);}
        else if(s.flat&&Math.abs(v[2])<1e-9){const t=vv>0?Math.max(0,Math.min(1,(x*v[0]+y*v[1])/vv)):0;d=Math.max(Math.hypot(x-t*v[0],y-t*v[1])-s.r,Math.abs(z)-s.r);}
        else{const t=vv>0?Math.max(0,Math.min(1,(x*v[0]+y*v[1]+z*v[2])/vv)):0;d=Math.hypot(x-t*v[0],y-t*v[1],z-t*v[2])-s.r;}
        const id=i+nx*j;if(-d>field[id])field[id]=-d;
      }
    }
  }
  const vertices=new MeshBuffer(Float32Array),faces=new MeshBuffer(Uint32Array),tets=[[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6],[0,5,1,6]],offsets=[0,1,1+nx,nx,plane,plane+1,plane+nx+1,plane+nx];
  const edgeType=new Map([1,nx,nx+1,plane,plane+1,plane+nx,plane+nx+1].map((n,i)=>[n,i]));
  let low=lower,high=upper,currentEdges=new Map(),nextEdges=new Map(),slice=0,peakCachedEdges=0;
  // Move exactly-on-surface samples by a tiny fraction of a voxel. This resolves
  // grid degeneracies above Float32 precision, without visible feature smoothing.
  const value=id=>{const z=Math.floor(id/plane),f=z===slice?low:high,v=f[id-z*plane];return Math.abs(v)<h*.001?h*.001:v;};
  const coord=id=>{const i=id%nx,j=Math.floor(id/nx)%ny,k=Math.floor(id/plane);return [origin[0]+i*h,origin[1]+j*h,origin[2]+k*h];};
  function cut(a,b){if(a>b)[a,b]=[b,a];const key=a*8+edgeType.get(b-a),map=a<(slice+1)*plane?currentEdges:nextEdges;if(map.has(key))return map.get(key);const va=value(a),vb=value(b),t=va/(va-vb),pa=coord(a),pb=coord(b),id=vertices.length/3;vertices.push3(pa[0]+t*(pb[0]-pa[0]),pa[1]+t*(pb[1]-pa[1]),pa[2]+t*(pb[2]-pa[2]));map.set(key,id);return id;}
  function tri(a,b,c,out){
    if(faces.length/3>=budget.maxTriangles)throw Error(`The raw surface reached the ${(budget.maxTriangles/1e6).toFixed(2)}M triangle budget before simplification. Raise the raw triangle budget, increase voxel size, or reduce size/repeats. Simplification needs the complete input surface.`);
    const v=vertices.data,ax=v[3*b]-v[3*a],ay=v[3*b+1]-v[3*a+1],az=v[3*b+2]-v[3*a+2],bx=v[3*c]-v[3*a],by=v[3*c+1]-v[3*a+1],bz=v[3*c+2]-v[3*a+2];if((ay*bz-az*by)*out[0]+(az*bx-ax*bz)*out[1]+(ax*by-ay*bx)*out[2]<0)[b,c]=[c,b];faces.push3(a,b,c);
  }
  onProgress({phase:'Meshing volume slices',progress:.03,grid:total});fillPlane(low,0);
  for(slice=0;slice<nz-1;slice++){
    fillPlane(high,slice+1);
    for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
      const local=i+nx*j,threshold=-h*.001;
      const mask=(low[local]>threshold?1:0)|(low[local+1]>threshold?2:0)|(low[local+nx+1]>threshold?4:0)|(low[local+nx]>threshold?8:0)|(high[local]>threshold?16:0)|(high[local+1]>threshold?32:0)|(high[local+nx+1]>threshold?64:0)|(high[local+nx]>threshold?128:0);
      if(mask===0||mask===255)continue;const base=local+plane*slice,ids=offsets.map(o=>base+o);
      for(const tet of tets){const ins=[],outs=[];for(const n of tet)(value(ids[n])>0?ins:outs).push(ids[n]);if(!ins.length||!outs.length)continue;
        const pi=coord(ins[0]),po=coord(outs[0]),out=po.map((x,i)=>x-pi[i]);
        if(ins.length===1){const a=ins[0];tri(cut(a,outs[0]),cut(a,outs[1]),cut(a,outs[2]),out);}
        else if(ins.length===3){const a=outs[0];tri(cut(a,ins[0]),cut(a,ins[1]),cut(a,ins[2]),out);}
        else{const [a,b]=ins,[c,d]=outs,ac=cut(a,c),ad=cut(a,d),bc=cut(b,c),bd=cut(b,d);tri(ac,ad,bd,out);tri(ac,bd,bc,out);}
      }
    }
    peakCachedEdges=Math.max(peakCachedEdges,currentEdges.size+nextEdges.size);
    [low,high]=[high,low];[currentEdges,nextEdges]=[nextEdges,currentEdges];nextEdges.clear();
    if(slice%3===0)onProgress({phase:'Meshing volume slices',progress:.03+.68*slice/(nz-1),triangles:faces.length/3,grid:total});
  }
  onProgress({phase:'Checking original surface',progress:.73});
  const mesh={vertices:vertices.finish(),faces:faces.finish(),voxel:h,grid:total,spec,budget,meshing:{scalarBytes:2*plane*4,peakCachedEdges,gridDimensions:dims}};
  mesh.check=inspectMesh(mesh);if(mesh.check.nonManifoldEdges||mesh.check.orientationErrors)throw Error(`Surface check found ${mesh.check.nonManifoldEdges} nonmanifold edges and ${mesh.check.orientationErrors} orientation errors; change the voxel size and export again.`);
  return mesh;
}
export function binarySTL(mesh){
  const {vertices:v,faces:f}=mesh,count=f.length/3,buffer=new ArrayBuffer(84+count*50),view=new DataView(buffer),header=new TextEncoder().encode('CANOPY | fused implicit union | units mm | outward normals');new Uint8Array(buffer).set(header);view.setUint32(80,count,true);let offset=84;
  for(let t=0;t<count;t++){
    const ids=[f[3*t],f[3*t+1],f[3*t+2]],a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,ux=v[b]-v[a],uy=v[b+1]-v[a+1],uz=v[b+2]-v[a+2],wx=v[c]-v[a],wy=v[c+1]-v[a+1],wz=v[c+2]-v[a+2],n=[uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx],norm=Math.hypot(...n)||1;
    for(const x of n){view.setFloat32(offset,x/norm,true);offset+=4;}for(const id of ids)for(let j=0;j<3;j++){view.setFloat32(offset,v[3*id+j],true);offset+=4;}view.setUint16(offset,0,true);offset+=2;
  }return buffer;
}
