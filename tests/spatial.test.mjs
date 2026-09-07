import test from 'node:test';
import assert from 'node:assert/strict';
import {spatialElementResponse,referenceDirections,makeSpatialFrame,SpatialFrameSolver} from '../dist/src/mechanics3d.js';
import {generateNetwork,PRESETS,notchCrosses} from '../dist/src/geometry.js';
import {buildPrintMesh,printPrimitives} from '../dist/src/fabrication.js';
const mat={model:'linear',E:1000,poisson:.3,yieldStress:3,hardening:.02,strength:10,fracture:false};
const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol*Math.max(1,Math.abs(b)),`${a} versus ${b}`);
function solve(s){for(let i=0;i<160;i++)if(s.iterate())break;assert.equal(s.status,'equilibrium',`relative residual ${s.residual}`);}
const ref=()=>({...referenceDirections({x:0,y:0,z:0},{x:20,y:0,z:0}),r:.5,state:{ep:0,alpha:0}});
test('spatial element forces equal energy derivatives for all three materials',()=>{
  const q=[.1,.2,-.1,.03,-.02,.05,20.4,.3,.2,-.02,.04,.01],h=1e-6,e=ref();
  for(const model of ['linear','neo','plastic']){const m={...mat,model},r=spatialElementResponse(q,e,m);for(let j=0;j<12;j++){const a=[...q],b=[...q];a[j]+=h;b[j]-=h;const exact=(spatialElementResponse(a,e,m,false).energy-spatialElementResponse(b,e,m,false).energy)/(2*h);close(r.f[j],exact,3e-6);}}
});
test('spatial tangent recovers the exact linearized stiffness at rest',()=>{
  const q=[0,0,0,0,0,0,20,0,0,0,0,0],e=ref(),r=spatialElementResponse(q,e,mat),h=1e-6;
  for(let j=0;j<12;j++){const a=[...q],b=[...q];a[j]+=h;b[j]-=h;const fa=spatialElementResponse(a,e,mat).f,fb=spatialElementResponse(b,e,mat).f;for(let i=0;i<12;i++)close(r.K[12*i+j],(fa[i]-fb[i])/(2*h),1e-5);}
});
test('spatial rigid translation and arbitrary-axis rotation create no force or energy',()=>{
  const rotation=[.6,-.7,.5],theta=Math.hypot(...rotation),k=rotation.map(x=>x/theta),v=[20,0,0],cross=[0,k[2]*20,-k[1]*20],rot=v.map((x,i)=>x*Math.cos(theta)+cross[i]*Math.sin(theta)+k[i]*20*k[0]*(1-Math.cos(theta))),translation=[4,-3,6],q=[...translation,...rotation,...rot.map((x,i)=>x+translation[i]),...rotation],r=spatialElementResponse(q,ref(),mat);close(r.energy,0,1e-20);for(const f of r.f)close(f,0,1e-9);
});
test('axial 3D bar gives EA strain along each selectable load axis',()=>{
  for(const [axis,key] of ['x','y','z'].entries()){const a={x:5,y:5,z:5},b={...a};a[key]=0;b[key]=20;const dims=[10,10,10];dims[axis]=20;const g={nodes:[a,b],edges:[{a:0,b:1,id:0,r:.5,level:0}],dimension:3,width:dims[0],height:dims[1],depth:dims[2],design:{notch:false,radius:.5,columns:1,slices:1},tileW:20,tileD:20},s=new SpatialFrameSolver(makeSpatialFrame(g,3),mat,{axis:key});s.setLoad(.001);solve(s);close(s.reaction,mat.E*Math.PI*.5**2*.001,1e-5);close(s.measure().nominalStress,s.reaction/100,1e-7);}
});
function cantilever(){const g={nodes:[{x:0,y:0,z:0},{x:20,y:0,z:0}],edges:[{a:0,b:1,id:0,r:.5,level:0}],dimension:3,width:20,height:1,depth:1,design:{notch:false,radius:.5,columns:1,slices:1},tileW:20,tileD:20},s=new SpatialFrameSolver(makeSpatialFrame(g,3),mat,{axis:'x'});s.fixed.fill(0);for(let i=0;i<6;i++)s.fixed[i]=1;s.top=[];s.status='solving';return s;}
test('3D cantilever bends correctly in both transverse planes',()=>{
  const F=.0001,exact=F*20**3/(3*mat.E*Math.PI*.5**4/4);
  for(const axis of [1,2]){const s=cantilever();s.external[6+axis]=-F;solve(s);close(-s.q[6+axis],exact,2e-5);}
});
test('spatial beam reproduces torsion theta = TL/(GJ) and its stored energy',()=>{
  const s=cantilever(),torque=.001,G=mat.E/(2*(1+mat.poisson)),J=Math.PI*.5**4/2;s.external[9]=torque;solve(s);const exact=torque*20/(G*J);close(s.q[9],exact,1e-7);close(s.torsionEnergy,.5*torque*exact,1e-8);
});
test('all spatial presets and diamond lattice are connected in a true 3D volume',()=>{
  for(const d of [...PRESETS.map(p=>p.settings),{...PRESETS[0].settings,family:'diamond'}]){const g=generateNetwork(d);assert.equal(g.dimension,3);assert.equal(g.stats.components,1,d.family);assert.ok(g.stats.connected,d.family);assert.ok(g.nodes.some(p=>p.z>1e-6&&p.z<g.depth-1e-6));assert.ok(g.edges.some(e=>Math.abs(g.nodes[e.a].z-g.nodes[e.b].z)>1e-6));}
});
test('XYZ repeats share unique face nodes; partial-depth notch cuts fewer struts',()=>{
  const g=generateNetwork({...PRESETS[0].settings,width:37.25,height:31,depth:24,anisotropy:1.12,repeatsX:2,repeatsY:2,repeatsZ:2});assert.equal(g.stats.components,1);close(g.width,37.25*1.12*2);close(g.height,62);close(g.depth,48);const keys=new Set(g.nodes.map(p=>[p.x,p.y,p.z].map(x=>Math.round(x*1e5)).join(',')));assert.equal(keys.size,g.nodes.length);
  const a=generateNetwork({...PRESETS[0].settings,notch:true,notchDepth:.45,notchZ:1}),b=generateNetwork({...a.design,notchZ:.2});assert.ok(a.stats.notched>b.stats.notched);assert.ok(b.stats.notched>0);
});
test('3D export preserves Z coordinates and ignores legacy fabrication layers',()=>{
  const g=generateNetwork(PRESETS[1].settings),p=printPrimitives(g,{outputWidth:g.width,layers:4});assert.ok(p.segments.some(e=>e.a[2]!==e.b[2]));assert.equal(p.segments.length,g.edges.length);const q=makeSpatialFrame(g,1),s=new SpatialFrameSolver(q,mat),state=s.snapshot();state.positions[2]+=1;const deformed=printPrimitives(g,{outputWidth:g.width,deformed:true},{...state,elements:q.elements});assert.ok(deformed.segments.some(e=>e.a[2]===1+g.nodes[0].z||e.b[2]===1+g.nodes[0].z));
});
test('spatial circular, reinforced and square STL profiles are closed connected solids',()=>{
  const g=generateNetwork({...PRESETS[1].settings,width:20,depth:20,radius:.8});
  for(const profile of ['round','nodes','ribbon']){const mesh=buildPrintMesh(g,{profile,outputWidth:20,minDiameter:1.2,voxel:.4});assert.equal(mesh.check.nonManifoldEdges,0,profile);assert.equal(mesh.check.orientationErrors,0,profile);assert.equal(mesh.check.components,1,profile);assert.ok(mesh.check.dimensions[2]>19);}
});
test('default spatial specimen equilibrates and develops genuine out-of-plane response',()=>{
  const s=new SpatialFrameSolver(makeSpatialFrame(generateNetwork(),2),mat);s.setLoad(.002);solve(s);const state=s.snapshot();assert.ok(state.maxOutOfPlane>1e-5);assert.ok(state.torsionEnergy>0);assert.ok(state.residual<1e-4);const bottom=s.bottom.reduce((sum,i)=>sum+s.force[6*i+1],0);close(s.reaction+bottom,0,1e-5);
});
