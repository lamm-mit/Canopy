// Spatial Kelvin, octet, diamond, and re-entrant cells in a conforming volume.
// Kelvin cells are the edges of truncated octahedra on a body-centered cubic lattice.
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function segmentBox(a,b,box){let lo=0,hi=1;for(let k=0;k<3;k++){const v=b[k]-a[k];if(Math.abs(v)<1e-12){if(a[k]<-1e-8||a[k]>box[k]+1e-8)return null;}else{let t0=-a[k]/v,t1=(box[k]-a[k])/v;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return null;}}return [a.map((v,i)=>v+lo*(b[i]-v)),a.map((v,i)=>v+hi*(b[i]-v))];}
function seeded(key,seed){let h=seed>>>0;for(let i=0;i<key.length;i++){h=Math.imul(h^key.charCodeAt(i),16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return (h>>>0)/4294967296;}
export function generateSpatialNetwork(d){
  if(d.columns*d.rows*d.slices*d.repeatsX*d.repeatsY*d.repeatsZ>64)throw Error('The interactive limit is 64 cubic repeat boxes. Reduce a cell count or an XYZ repeat.');
  const tileW=d.width*d.anisotropy,tileH=d.height,tileD=d.depth;
  const nx=d.columns,ny=d.rows,nz=d.slices,dx=tileW/nx,dy=tileH/ny,dz=tileD/nz,box=[tileW,tileH,tileD];
  const nodes=[],edges=[],nodeMap=new Map(),edgeMap=new Map();
  const node=p=>{const key=p.map(v=>Math.round(v*1e6)).join(',');if(nodeMap.has(key))return nodeMap.get(key);const id=nodes.length;nodes.push({x:p[0],y:p[1],z:p[2]});nodeMap.set(key,id);return id;};
  function edge(a,b,level){const clipped=segmentBox(a,b,box);if(!clipped||distance(...clipped)<.015)return;const i=node(clipped[0]),j=node(clipped[1]);if(i===j)return;const key=i<j?`${i}:${j}`:`${j}:${i}`;if(edgeMap.has(key)){edges[edgeMap.get(key)].level=Math.min(level,edges[edgeMap.get(key)].level);return;}edgeMap.set(key,edges.length);edges.push({a:i,b:j,level});}
  function cage(points,pairs,center){
    let prev=points;const used=new Set(pairs.flat());
    for(const [a,b] of pairs)edge(points[a],points[b],0);
    for(let level=1;level<=d.hierarchy;level++){
      const ratio=d.hierarchyScale**level,inner=points.map(p=>p.map((v,i)=>center[i]+(v-center[i])*ratio));
      for(const [a,b] of pairs)edge(inner[a],inner[b],level);
      for(let i=0;i<points.length;i++){
        if(!used.has(i))continue;
        if(d.family==='branches'){
          const pair=pairs.find(([a,b])=>a===i||b===i),j=pair?(pair[0]===i?pair[1]:pair[0]):(i+1)%points.length;
          const mid=prev[i].map((v,k)=>v*.48+inner[i][k]*.26+inner[j][k]*.26);
          edge(prev[i],mid,level);edge(mid,inner[i],level);edge(mid,inner[j],level);
        }else edge(prev[i],inner[i],level);
      }prev=inner;
    }
  }
  if(['cellular','honeycomb','branches'].includes(d.family)){
    const vertices=[],seen=new Set();
    for(const zero of [0,1,2])for(const swap of [false,true])for(const s of [-1,1])for(const t of [-1,1]){const p=[0,0,0],other=[0,1,2].filter(x=>x!==zero);p[other[0]]=s*(swap?2:1);p[other[1]]=t*(swap?1:2);const key=p.join(',');if(!seen.has(key)){seen.add(key);vertices.push(p);}}
    const pairs=[];for(let i=0;i<vertices.length;i++)for(let j=i+1;j<vertices.length;j++)if(Math.abs(distance(vertices[i],vertices[j])-Math.SQRT2)<1e-8)pairs.push([i,j]);
    for(let k=0;k<=nz;k++)for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)for(const body of [0,1]){
      if(body&&(i===nx||j===ny||k===nz))continue;const c=[(i+.5*body)*dx,(j+.5*body)*dy,(k+.5*body)*dz];
      cage(vertices.map(p=>[c[0]+p[0]*dx/4,c[1]+p[1]*dy/4,c[2]+p[2]*dz/4]),pairs,c);
    }
  }else{
    const corners=[];for(let z=0;z<=1;z++)for(let y=0;y<=1;y++)for(let x=0;x<=1;x++)corners.push([x,y,z]);
    const faceCenters=[[0,.5,.5],[1,.5,.5],[.5,0,.5],[.5,1,.5],[.5,.5,0],[.5,.5,1]],points=[...corners,...faceCenters],pairs=[];
    if(d.family==='triangular'){
      for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(Math.abs(distance(points[i],points[j])-Math.SQRT1_2)<1e-8)pairs.push([i,j]);
    }else if(d.family==='diamond'){
      points.push([.25,.25,.25],[.25,.75,.75],[.75,.25,.75],[.75,.75,.25]);
      for(let i=0;i<14;i++)for(let j=14;j<18;j++)if(Math.abs(distance(points[i],points[j])-Math.sqrt(3)/4)<1e-8)pairs.push([i,j]);
    }else{
      points.splice(8);for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)if(distance(corners[i],corners[j])===1){const p=corners[i].map((v,k)=>(v+corners[j][k])*.35+.15),m=points.length;points.push(p);pairs.push([i,m],[m,j]);}
    }
    for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)cage(points.map(p=>[(i+p[0])*dx,(j+p[1])*dy,(k+p[2])*dz]),pairs,[(i+.5)*dx,(j+.5)*dy,(k+.5)*dz]);
  }
  // Periodic nodal perturbations agree on opposing faces; face-normal motion is zero.
  const disorder=d.family==='honeycomb'?0:d.disorder;
  for(const p of nodes){const coords=[p.x,p.y,p.z].map((v,i)=>Math.abs(v)<1e-6?0:Math.abs(v-box[i])<1e-6?box[i]:v),key=coords.map((v,i)=>v===0||v===box[i]?0:Math.round(v*1e5)).join(',');
    for(let k=0;k<3;k++)if(coords[k]>1e-6&&coords[k]<box[k]-1e-6)coords[k]+=(seeded(key+':'+k,d.seed)-.5)*disorder*Math.min(dx,dy,dz)*.13;
    [p.x,p.y,p.z]=coords;
  }
  const width=tileW*d.repeatsX,height=tileH*d.repeatsY,depth=tileD*d.repeatsZ,allNodes=[],allEdges=[],globalNodes=new Map(),globalEdges=new Set();
  for(let k=0;k<d.repeatsZ;k++)for(let j=0;j<d.repeatsY;j++)for(let i=0;i<d.repeatsX;i++){
    const ids=nodes.map(p=>{const q={x:p.x+i*tileW,y:p.y+j*tileH,z:p.z+k*tileD},key=[q.x,q.y,q.z].map(v=>Math.round(v*1e5)).join(',');if(globalNodes.has(key))return globalNodes.get(key);const id=allNodes.length;allNodes.push(q);globalNodes.set(key,id);return id;});
    for(const e of edges){const a=ids[e.a],b=ids[e.b],key=a<b?`${a}:${b}`:`${b}:${a}`;if(globalEdges.has(key))continue;globalEdges.add(key);const p=allNodes[a],q=allNodes[b],mid=[(p.x+q.x)/width-1,(p.y+q.y)/height-1,(p.z+q.z)/depth-1];let g=d.gradientAxis==='radial'?2*Math.min(1,Math.hypot(...mid)/Math.sqrt(3))-1:mid[['x','y','z'].indexOf(d.gradientAxis)];if(!Number.isFinite(g))g=mid[1];
      allEdges.push({a,b,level:e.level,r:Math.max(.06,d.radius*d.fineRatio**e.level*(1+d.gradient*g)),id:allEdges.length});
    }
  }
  // Clipping and hierarchy can place a vertex on another strut. Split those members
  // so printed junctions and mechanical connectivity coincide (including repeat faces).
  const split=[],seen=new Set(),nodeCount=allNodes.length,bins=new Map(),binSize=Math.min(dx,dy,dz)/5;
  for(let i=0;i<nodeCount;i++){const p=allNodes[i],key=[p.x,p.y,p.z].map(x=>Math.floor(x/binSize)).join(',');if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);}
  for(const e of allEdges){const a=allNodes[e.a],b=allNodes[e.b],v=[b.x-a.x,b.y-a.y,b.z-a.z],ll=v.reduce((s,x)=>s+x*x,0),parts=[[0,e.a],[1,e.b]];
    const aa=[a.x,a.y,a.z],bb=[b.x,b.y,b.z],lo=aa.map((x,k)=>Math.floor((Math.min(x,bb[k])-1e-5)/binSize)),hi=aa.map((x,k)=>Math.floor((Math.max(x,bb[k])+1e-5)/binSize));
    for(let iz=lo[2];iz<=hi[2];iz++)for(let iy=lo[1];iy<=hi[1];iy++)for(let ix=lo[0];ix<=hi[0];ix++)for(const i of bins.get(`${ix},${iy},${iz}`)||[]){if(i===e.a||i===e.b)continue;const p=allNodes[i],u=[p.x-a.x,p.y-a.y,p.z-a.z],t=u.reduce((s,x,k)=>s+x*v[k],0)/ll;if(t>1e-6&&t<1-1e-6&&Math.hypot(...u.map((x,k)=>x-t*v[k]))<1e-5)parts.push([t,i]);}
    parts.sort((a,b)=>a[0]-b[0]);for(let i=0;i<parts.length-1;i++){const a=parts[i][1],b=parts[i+1][1],key=a<b?`${a}:${b}`:`${b}:${a}`;if(seen.has(key))continue;seen.add(key);split.push({...e,a,b,id:split.length});}
  }
  return {nodes:allNodes,edges:split,width,height,depth,tileW,tileH,tileD,dimension:3,design:d};
}
