import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {SpecimenViewer,FlatViewer} from '../dist/src/viewer.js';
import {MovieExporter} from '../dist/src/movie.js';
import {displayPoint,normalizeDisplacementScale,drawDisplacementLabel} from '../dist/src/deformation-view.js';
import {printPrimitives} from '../dist/src/fabrication.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} ≠ ${b}`);
const vector=(a,b)=>a.forEach((x,i)=>close(x,b[i]));
function specimen(){
  const nodes=[{x:2,y:4,z:6},{x:12,y:24,z:16}],elements=[{id:0,a:0,b:1,r:.5,level:0,active:true}];
  const graph={dimension:3,width:12,height:24,depth:16,nodes,edges:elements,design:{radius:.5,notch:false}};
  const state={positions:new Float64Array([2.1,4.2,6.3,12.4,24.5,16.6]),stresses:new Float32Array([17]),strains:new Float32Array([.02]),active:new Uint8Array([1]),force:3,strain:.01};
  // Exercise real Three.js geometry/matrix code on the CPU. No WebGL context,
  // browser, rendering QA, or production navigation is used by these tests.
  const v=Object.assign(Object.create(SpecimenViewer.prototype),{
    graph,nodes,elements,state,field:'stress',displacementScale:1,axis:1,aspect:1.5,viewMode:'iso',
    bounds:{width:12,height:24,depth:16},group:new THREE.Group(),decor:new THREE.Group(),
    temp:new THREE.Object3D(),color:new THREE.Color(),up:new THREE.Vector3(0,1,0),dir:new THREE.Vector3(),
    camera:new THREE.OrthographicCamera(-60,60,60,-60,.1,1500),controls:{target:new THREE.Vector3(),update(){}},
    renderer:{},topGrip:new THREE.Object3D(),topIds:[1],restLines:{visible:false},ghost:true
  });
  v.camera.position.set(65,32,160);v.rebuild();
  return {v,state,graph};
}
function matrix(mesh,index=0){const m=new THREE.Matrix4();mesh.getMatrixAt(index,m);return m;}

test('displacement scaling uses unloaded coordinates in 2D/3D and 1× preserves physical positions exactly',()=>{
  const nodes=[{x:4,y:8},{x:10,y:20,z:30}],q=new Float64Array([4.2,7.9,0,10.3,20.4,29.5]),before=q.slice();
  vector(displayPoint(nodes,q,0,10),[6,7,0]);vector(displayPoint(nodes,q,1,10),[13,24,25]);
  assert.deepEqual(displayPoint(nodes,q,1,1),Array.from(q.slice(3)));
  assert.deepEqual(displayPoint(nodes,null,1,100),[10,20,30]);assert.deepEqual(q,before);
  assert.equal(normalizeDisplacementScale(NaN),1);assert.equal(normalizeDisplacementScale(-5),1);assert.equal(normalizeDisplacementScale(1000),100);
});

test('actual viewer scales nodes and moving grips while preserving radii, fields, damage, and source states',()=>{
  const {v,state}=specimen(),before=structuredClone(state);v.setDisplacementScale(10);
  vector(new THREE.Vector3().setFromMatrixPosition(matrix(v.spheres,1)).toArray(),[10,17,14]);
  vector(v.topGrip.position.toArray(),[4,18.8,6]);
  const radius=new THREE.Vector3().setFromMatrixScale(matrix(v.beams));close(radius.x,.5);close(radius.z,.5);
  assert.equal(v.maximum,17);assert.equal(v.restLines.visible,true);assert.deepEqual(state,before);
  v.update({...state,active:new Uint8Array([0])});close(new THREE.Vector3().setFromMatrixScale(matrix(v.beams)).x,0);
  v.update(state);v.setDisplacementScale(1);
  vector(new THREE.Vector3().setFromMatrixPosition(matrix(v.spheres,1)).toArray(),[6.4,12.5,8.6]);
  assert.deepEqual(state,before);
});

test('fit contains the entire exaggerated recording and the camera remains stationary during playback',()=>{
  const {v,state,graph}=specimen(),rest={...state,positions:new Float64Array([2,4,6,12,24,16])},peak={...state,positions:new Float64Array([-20,4,100,120,200,-300])};
  v.getFitFrames=()=>[rest,peak,rest];v.update(rest);v.setDisplacementScale(100);v.camera.updateMatrixWorld(true);
  for(const f of [rest,peak])for(let i=0;i<2;i++){
    const p=displayPoint(graph.nodes,f.positions,i,100).map((x,k)=>x-[6,12,8][k]),ndc=new THREE.Vector3(...p).project(v.camera);
    assert.ok(Math.abs(ndc.x)<=1&&Math.abs(ndc.y)<=1&&Math.abs(ndc.z)<=1,'Every recorded pose must fit');
  }
  const camera=v.camera.matrixWorld.clone(),projection=v.camera.projectionMatrix.clone();v.update(peak);
  assert.deepEqual(v.camera.matrixWorld,camera);assert.deepEqual(v.camera.projectionMatrix,projection);
});

test('movie capture uses the same exaggerated pose and restores the selected physical frame',()=>{
  const {v,state}=specimen();v.setDisplacementScale(10);let captured;
  v.renderer={getRenderTarget:()=>null,setRenderTarget(){},render:()=>{captured=new THREE.Vector3().setFromMatrixPosition(matrix(v.spheres,1)).toArray();},readRenderTargetPixels:(t,x,y,w,h,bytes)=>bytes.fill(0)};
  const capture=v.createMovieCapture(32,24),next={...state,positions:new Float64Array([2,4,6,12.8,25,17])};
  assert.equal(capture.read(next).length,32*24*4);vector(captured,[14,22,18]);capture.dispose();
  assert.equal(v.state,state);assert.equal(v.displacementScale,10);vector(new THREE.Vector3().setFromMatrixPosition(matrix(v.spheres,1)).toArray(),[10,17,14]);
});

test('exaggeration is labeled in exported images/movies and physical STL inputs remain identical',()=>{
  const {v,state,graph}=specimen(),text=[],ctx={save(){},restore(){},fillRect(){},measureText:s=>({width:s.length*8}),fillText:s=>text.push(s)};
  drawDisplacementLabel(ctx,1280,720,10);assert.match(text[0],/×10.*view only/);
  const movie=Object.assign(Object.create(MovieExporter.prototype),{ctx,canvas:{width:1280,height:720},displacementScale:10,frames:[state,state],viewer:v,metadata:{graph,experiment:{mode:'tension',axis:'y'},material:{model:'linear'}}});
  movie.drawOverlay({...state,broken:0,kind:'equilibrium'},1);
  assert.ok(text.some(t=>t.includes('Reaction 3.00 N')));assert.ok(text.some(t=>t.includes('×10')&&t.includes('Quasi-static')));
  for(const profile of ['round','nodes','ribbon']){
    const physical={...state,elements:v.elements},options={deformed:true,profile};
    const before=printPrimitives(graph,options,physical);v.setDisplacementScale(100);
    assert.deepEqual(printPrimitives(graph,options,physical),before);
  }
});

test('canvas fallback keeps one framing extent across an exaggerated replay',()=>{
  const {graph,state}=specimen(),points=[],ctx={setTransform(){},fillRect(){},beginPath(){},moveTo:(...p)=>points.push(p),lineTo:(...p)=>points.push(p),stroke(){}};
  const v=Object.assign(Object.create(FlatViewer.prototype),{graph,nodes:graph.nodes,elements:graph.edges,state,field:'material',container:{clientWidth:600,clientHeight:500},canvas:{getContext:()=>ctx},getFitFrames:()=>[state]});
  // Supply the normal draw pixel ratio explicitly without depending on browser globals.
  const draw=v.draw;v.draw=function(){return draw.call(this,this.canvas,600,500,1);};
  v.setDisplacementScale(10);const bounds=v.viewBounds,end=points.at(-1).slice();
  v.update({...state,positions:new Float64Array([2,4,6,12,24,16])});
  assert.equal(v.viewBounds,bounds);assert.notDeepEqual(points.at(-1),end);
});
