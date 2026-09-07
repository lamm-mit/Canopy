import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrintMesh,binarySTL} from '../dist/src/fabrication.js';
import {simplifyPrintMesh,detailFields} from '../dist/src/mesh-simplify.js';
const cylinder={dimension:3,width:12,height:2,depth:2,nodes:[{x:0,y:1,z:1},{x:12,y:1,z:1}],edges:[{a:0,b:1,r:.65,id:0,level:0}],design:{notch:false}};
const closed=(mesh,source)=>{assert.equal(mesh.check.nonManifoldEdges,0);assert.equal(mesh.check.orientationErrors,0);assert.equal(mesh.check.degenerateTriangles,0);assert.equal(mesh.check.components,source.check.components);assert.equal(mesh.check.eulerCharacteristic,source.check.eulerCharacteristic);assert.ok(Math.abs(mesh.check.volume/source.check.volume-1)<.01);};
test('fine capsule simplifies while retaining surface shape, volume, and closed topology',async()=>{
  const raw=buildPrintMesh(cylinder,{outputWidth:12,voxel:.12,minDiameter:.3}),s=await simplifyPrintMesh(raw,{surfaceError:.02,normalWeight:1});closed(s,raw);assert.equal(s.simplification.warning,null);assert.ok(s.faces.length<raw.faces.length*.55);
  // Independent analytic capsule distance, sampled at face centers and edge midpoints.
  let worst=0;for(let i=0;i<s.faces.length;i+=3)for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){
    const p=[0,0,0];for(let k=0;k<3;k++)for(let j=0;j<3;j++)p[j]+=weights[k]*s.vertices[3*s.faces[i+k]+j];const t=Math.max(0,Math.min(12,p[0])),d=Math.hypot(p[0]-t,p[1]-1,p[2]-1)-.65;worst=Math.max(worst,Math.abs(d));
  }
  assert.ok(worst<.025,`sampled geometric deviation ${worst} mm`);assert.ok(s.simplification.errorEstimate<=.02*1.001);assert.equal(binarySTL(s).byteLength,84+50*s.check.triangles);
});
test('junction and tip vertices remain in the simplified mesh for each thickening profile',async()=>{
  const g={...cylinder,nodes:[{x:0,y:1,z:1},{x:6,y:1,z:1},{x:12,y:1,z:1},{x:6,y:6,z:4}],edges:[{a:0,b:1,r:.6,id:0},{a:1,b:2,r:.6,id:1},{a:1,b:3,r:.4,id:2}]};
  for(const profile of ['round','nodes','ribbon']){const raw=buildPrintMesh(g,{profile,outputWidth:12,voxel:.18,minDiameter:.3}),fields=detailFields(raw,true),s=await simplifyPrintMesh(raw,{surfaceError:.03});closed(s,raw);assert.equal(s.simplification.warning,null,profile);assert.ok(s.faces.length<raw.faces.length*.9,profile);
    const retained=new Set();for(let i=0;i<s.vertices.length;i+=3)retained.add(s.vertices.subarray(i,i+3).join(','));let protectedCount=0;for(let i=0;i<fields.locks.length;i++)if(fields.locks[i]){protectedCount++;assert.ok(retained.has(raw.vertices.subarray(3*i,3*i+3).join(',')),profile+' protected vertex');}assert.ok(protectedCount>0);
  }
});
test('thin neck and separate small component survive an aggressive requested reduction',async()=>{
  const g={...cylinder,nodes:[{x:0,y:1,z:1},{x:12,y:1,z:1},{x:6,y:5,z:1}],edges:[{a:0,b:1,r:.18,id:0},{a:0,b:0,r:1,id:1},{a:1,b:1,r:1,id:2},{a:2,b:2,r:.3,id:3}]};
  const raw=buildPrintMesh(g,{outputWidth:12,voxel:.08,minDiameter:.3}),s=await simplifyPrintMesh(raw,{surfaceError:1,targetRatio:.02});closed(s,raw);assert.equal(s.check.components,2);assert.ok(s.simplification.effectiveError<=.036+1e-9);assert.equal(s.simplification.warning,null);assert.ok(s.faces.length<raw.faces.length);
  let crossings=0,smallest=Infinity;for(let i=0;i<s.faces.length;i+=3)for(let j=0;j<3;j++){const a=s.faces[i+j]*3,b=s.faces[i+(j+1)%3]*3,x=s.vertices[a],dx=s.vertices[b]-x;if(Math.abs(dx)<1e-10)continue;const t=(6-x)/dx;if(t>=0&&t<=1){const y=s.vertices[a+1]+t*(s.vertices[b+1]-s.vertices[a+1]),z=s.vertices[a+2]+t*(s.vertices[b+2]-s.vertices[a+2]);if(y<2){crossings++;smallest=Math.min(smallest,Math.hypot(y-1,z-1));}}}
  assert.ok(crossings>0);assert.ok(smallest>.15,`neck radius ${smallest}`);
});
test('turning simplification off exports the original surface unchanged',async()=>{
  const raw=buildPrintMesh(cylinder,{outputWidth:12,voxel:.2}),s=await simplifyPrintMesh(raw,{simplify:false});assert.deepEqual(s.vertices,raw.vertices);assert.deepEqual(s.faces,raw.faces);assert.equal(s.simplification.enabled,false);
});
test('raw mesh and grid budgets are adjustable and enforced before reduction',()=>{
  assert.throws(()=>buildPrintMesh(cylinder,{outputWidth:12,voxel:.2,maxTriangles:1000}),/raw surface reached/i);
  assert.throws(()=>buildPrintMesh(cylinder,{outputWidth:12,voxel:.2,maxGridPoints:1000}),/grid budget/);
  const m=buildPrintMesh(cylinder,{outputWidth:12,voxel:.2,maxTriangles:100000,maxGridPoints:100000});assert.ok(m.check.triangles>1000);assert.ok(m.meshing.scalarBytes<m.grid*4/5);
});
