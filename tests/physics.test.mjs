import test from 'node:test';
import assert from 'node:assert/strict';
import {constitutive,elementResponse,FrameSolver,makeFrame} from '../dist/src/mechanics.js';
import {generateNetwork as generateAnyNetwork,notchCrosses,PRESETS} from '../dist/src/geometry.js';
const generateNetwork=(d={})=>generateAnyNetwork({...d,dimension:'2d',columns:Math.max(3,d.columns||5),rows:Math.max(3,d.rows||6)});
const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} vs ${b}`);
function solve(s){for(let i=0;i<180;i++)if(s.iterate())break;assert.equal(s.status,'equilibrium',`residual ${s.residual}`);}
const material={model:'linear',E:1000,yieldStress:10,hardening:.05,strength:20,fracture:false};
test('linear and Neo-Hookean uniaxial constitutive laws and energy derivatives',()=>{
  close(constitutive(.01,material).stress,10);
  const m={...material,model:'neo'},eps=.3,l=1+eps,r=constitutive(eps,m);close(r.stress,m.E/3*(l-l**-2));
  const h=1e-6;close((constitutive(eps+h,m).energy-constitutive(eps-h,m).energy)/(2*h),r.stress);close((constitutive(eps+h,m).stress-constitutive(eps-h,m).stress)/(2*h),r.tangent);
  close(constitutive(0,m).tangent,m.E);
});
test('plastic return mapping retains permanent strain and unloads elastically',()=>{
  const m={...material,model:'plastic'},r=constitutive(.04,m),H=m.E*m.hardening/(1-m.hardening);close(r.stress,m.yieldStress+H*r.alpha);assert.ok(r.ep>0);const unloaded=constitutive(r.ep,m,{ep:r.ep,alpha:r.alpha});close(unloaded.stress,0);close(unloaded.ep,r.ep);close(unloaded.tangent,m.E);
});
test('element force is the energy gradient and stiffness is its Hessian',()=>{
  const e={r:.6,L:10,phi:0,state:{ep:0,alpha:0}},q=[.2,.1,.05,10.1,.3,-.02],h=1e-6;
  for(const model of ['linear','neo','plastic']){const m={...material,model},r=elementResponse(q,e,m);for(let j=0;j<6;j++){const p=[...q],n=[...q];p[j]+=h;n[j]-=h;const a=elementResponse(p,e,m),b=elementResponse(n,e,m);close((a.energy-b.energy)/(2*h),r.f[j],1e-6);for(let i=0;i<6;i++)close((a.f[i]-b.f[i])/(2*h),r.K[6*i+j],2e-6);}}
});
test('objectivity: rigid translation and 1.2-radian rotation store zero energy',()=>{
  const angle=1.2,e={r:.6,L:10,phi:0,state:{ep:0,alpha:0}},q=[4,-3,angle,4+10*Math.cos(angle),-3+10*Math.sin(angle),angle],r=elementResponse(q,e,material);close(r.energy,0,1e-20);for(const f of r.f)close(f,0,1e-9);
});
test('clamped bar reproduces EA strain and stored strain energy',()=>{
  const g={nodes:[{x:0,y:0},{x:0,y:20}],edges:[{a:0,b:1,id:0,r:.5,level:0}],width:10,height:20,tileW:10,design:{notch:false,radius:.5,columns:1}},s=new FrameSolver(makeFrame(g,3),material);s.setLoad(.001);solve(s);const A=Math.PI*.5**2;close(s.reaction,material.E*A*.001,1e-5);close(s.stored,.5*material.E*A*20*.001**2,1e-5);
});
test('cantilever tip deflection matches FL^3/(3EI)',()=>{
  const L=20,r=.5,F=.0001,nodes=Array.from({length:5},(_,i)=>({x:i*L/4,y:0})),elements=Array.from({length:4},(_,i)=>({a:i,b:i+1,parent:i,L:L/4,phi:0,r,level:0,active:true,state:{ep:0,alpha:0}})),frame={nodes,elements,width:L,height:1},s=new FrameSolver(frame,material,{maxIterations:180});
  s.fixed.fill(0);s.fixed[0]=s.fixed[1]=s.fixed[2]=1;s.top=[];s.external[3*4+1]=-F;s.status='solving';solve(s);const exact=F*L**3/(3*material.E*Math.PI*r**4/4);close(-s.q[13],exact,2e-5);
});
test('notch removes crossing members and fracture deletes an entire parent strut',()=>{
  const g=generateNetwork({...PRESETS[1].settings,notch:true});assert.ok(g.edges.some(e=>notchCrosses(g,e)));const f=makeFrame(g,3);assert.equal(f.elements.filter(e=>e.notched).length,g.stats.notched*3);
  const bar={nodes:[{x:0,y:0},{x:0,y:20}],edges:[{a:0,b:1,id:0,r:.5,level:0}],width:10,height:20,tileW:10,design:{notch:false,radius:.5,columns:1}},s=new FrameSolver(makeFrame(bar,3),{...material,fracture:true,strength:1});s.setLoad(.002);solve(s);assert.equal(s.commit(),false);assert.equal(s.broken.size,1);assert.ok(s.frame.elements.every(e=>!e.active));assert.ok(s.deletedEnergy>0);
});
test('all presets generate deterministic connected networks; repeats share seams',()=>{
  for(const p of PRESETS){const g=generateNetwork(p.settings),h=generateNetwork(p.settings);assert.deepEqual(g.nodes,h.nodes);assert.ok(g.stats.connected,p.name);assert.equal(g.stats.components,1,p.name);assert.ok(g.edges.every(e=>e.r>0));}
  const g=generateNetwork({...PRESETS[0].settings,repeatsX:2,repeatsY:2});assert.equal(g.stats.components,1);assert.ok(g.stats.connected);const keys=new Set(g.nodes.map(p=>`${Math.round(p.x*1e5)}:${Math.round(p.y*1e5)}`));assert.equal(keys.size,g.nodes.length);
});
test('default hierarchical specimen reaches equilibrium with force balance',()=>{
  const g=generateNetwork(),s=new FrameSolver(makeFrame(g,2),material);s.setLoad(.002);solve(s);assert.ok(s.residual<1e-4);const bottom=s.bottom.reduce((v,i)=>v+s.force[3*i+1],0);close(s.reaction+bottom,0,1e-4);assert.ok(s.reaction>0);
});
