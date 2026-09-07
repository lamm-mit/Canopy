import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrintMesh,binarySTL} from '../dist/src/fabrication.js';
const g={width:10,height:10,nodes:[{x:0,y:0},{x:10,y:0},{x:5,y:8}],edges:[{a:0,b:1,r:.7,id:0},{a:1,b:2,r:.7,id:1},{a:2,b:0,r:.7,id:2}],design:{notch:false}};
test('all thickening versions produce closed, oriented, connected union meshes',()=>{
  for(const profile of ['round','nodes','ribbon']){const mesh=buildPrintMesh(g,{profile,outputWidth:10,voxel:.3,minDiameter:.8,layers:1,thickening:1});assert.equal(mesh.check.nonManifoldEdges,0,profile);assert.equal(mesh.check.orientationErrors,0,profile);assert.equal(mesh.check.components,1,profile);assert.ok(mesh.check.volume>0);const stl=binarySTL(mesh);assert.equal(stl.byteLength,84+50*mesh.check.triangles);assert.equal(new DataView(stl).getUint32(80,true),mesh.check.triangles);}
});
test('stacked print layers are joined into one solid',()=>{
  const mesh=buildPrintMesh(g,{profile:'round',outputWidth:10,voxel:.3,minDiameter:.8,layers:2,layerSpacing:3});assert.equal(mesh.check.components,1);assert.equal(mesh.check.nonManifoldEdges,0);assert.equal(mesh.check.orientationErrors,0);assert.ok(mesh.check.dimensions[2]>4);
});
test('under-resolved and oversized grids fail explicitly',()=>{
  assert.throws(()=>buildPrintMesh(g,{voxel:2,outputWidth:10}),/resolve/);
  assert.throws(()=>buildPrintMesh(g,{voxel:.06,outputWidth:1000,layers:4,layerSpacing:10}),/grid budget/);
});
