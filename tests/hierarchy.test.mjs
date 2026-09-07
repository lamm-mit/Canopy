import test from 'node:test';
import assert from 'node:assert/strict';
import {generateNetwork,sanitizeDesign} from '../dist/src/geometry.js';
import {FrameSolver,makeFrame} from '../dist/src/mechanics.js';
import {SpatialFrameSolver,makeSpatialFrame} from '../dist/src/mechanics3d.js';

const settings=dimension=>({dimension,family:dimension==='3d'?'diamond':'honeycomb',width:60,height:60,depth:60,columns:dimension==='2d'?3:1,rows:dimension==='2d'?4:1,hierarchy:5,disorder:0,radius:1.1,hierarchyScale:.55,fineRatio:.65});

test('six-scale planar and spatial graphs contain all levels and remain connected',()=>{
 for(const dimension of ['2d','3d']){
  const g=generateNetwork(settings(dimension));
  assert.deepEqual([...new Set(g.edges.map(e=>e.level))].sort(),[0,1,2,3,4,5]);
  assert.equal(g.stats.components,1);
  assert.ok(g.edges.every(e=>e.r>=.06 && e.a!==e.b));
  assert.deepEqual(g,generateNetwork(settings(dimension)));
 }
});

test('deep design parameters survive JSON save and regeneration',()=>{
 for(const dimension of ['2d','3d']){
  const original=generateNetwork(settings(dimension));
  const restored=generateNetwork(JSON.parse(JSON.stringify(original.design)));
  assert.deepEqual(restored,original);
  assert.equal(sanitizeDesign({...settings(dimension),hierarchy:99}).hierarchy,5);
 }
});

test('deep planar and spatial models recover small-load equilibrium and force balance',()=>{
 for(const dimension of ['2d','3d']){
  const graph=generateNetwork({...settings(dimension),hierarchy:3});
  const solver=dimension==='3d'?new SpatialFrameSolver(makeSpatialFrame(graph,2),{E:1200,fracture:false},{increment:.001}):new FrameSolver(makeFrame(graph,2),{E:1200,fracture:false},{increment:.001});
  solver.setLoad(.001);
  for(let i=0;i<145;i++)if(solver.iterate())break;
  assert.equal(solver.status,'equilibrium',`${dimension}: ${solver.residual}`);
  const state=solver.snapshot();
  assert.ok(state.force>0 && state.storedEnergy>0);
  assert.ok(state.residual<1e-4);
 }
});
