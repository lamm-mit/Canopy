import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {ExperimentRecording,compactFrame,sampleRecording,movieSchedule,encodeRecording,decodeRecording} from '../dist/src/replay.js';
import {generateNetwork,DEFAULT_DESIGN} from '../dist/src/geometry.js';
import {makeSpatialFrame,SpatialFrameSolver} from '../dist/src/mechanics3d.js';
import {DEFAULT_EXPERIMENT,DEFAULT_MATERIAL} from '../dist/src/mechanics.js';

const raw=(strain=0,active=[1,1])=>({positions:new Float64Array([0,0,0,1+strain,1,1]),strains:new Float32Array([strain,strain]),stresses:new Float32Array([strain*1000,0]),active:new Uint8Array(active),history:[],strain,force:strain*1000,status:'equilibrium',broken:active.filter(x=>!x).length});
test('replay owns immutable snapshots; sampling does not alter the live solver and keeps fracture discrete',()=>{
  const live=raw(),a=compactFrame(live),b=compactFrame(raw(.1)),c=compactFrame(raw(.1,[1,0]),'fracture');
  live.positions[3]=99;assert.equal(a.positions[3],1);
  const shown=sampleRecording([a,b,c],.5,true);assert.equal(shown.positions[3],1.05);assert.equal(shown.strain,0);assert.equal(shown.interpolated,true);
  assert.equal(sampleRecording([a,b,c],1.99,true),b);assert.equal(sampleRecording([a,b,c],2,true).active[1],0);assert.equal(b.active[1],1);
  assert.equal(sampleRecording([a,b],1.9),b);assert.equal(sampleRecording([a,b],-10),a);
});
test('recording budget stops explicitly and retains the recorded prefix',()=>{
  const r=new ExperimentRecording(700),f=compactFrame(raw());assert.equal(r.append(f),true);assert.equal(r.append(f),false);assert.equal(r.full,true);assert.equal(r.frames.length,1);
});
test('movie timing includes every state, first and last, even when duration is shorter than the event count',()=>{
  for(const n of [2,21,601,10000]){
    const schedule=movieSchedule(n,2,30),seen=new Set(Array.from({length:schedule.count},(_,i)=>Math.floor(schedule.cursor(i)+1e-10)));
    assert.equal(seen.size,n);assert.equal(schedule.cursor(0),0);assert.equal(schedule.cursor(schedule.count-1),n-1);assert.equal(schedule.count/schedule.fps,schedule.duration);
  }
  assert.throws(()=>movieSchedule(0,12,30));assert.throws(()=>movieSchedule(20,0,30));assert.throws(()=>movieSchedule(20,12,29));
});
test('saved binary replay round-trips actual 3D solved positions and fields exactly, and rejects truncation',async()=>{
  const graph=generateNetwork({...DEFAULT_DESIGN,hierarchy:0}),frame=makeSpatialFrame(graph,1),s=new SpatialFrameSolver(frame,DEFAULT_MATERIAL,DEFAULT_EXPERIMENT),r=new ExperimentRecording();
  s.status='ready';r.append(compactFrame(s.snapshot(),'rest'));s.setLoad(.001);for(let i=0;i<180&&!s.iterate();i++);assert.equal(s.status,'equilibrium');s.commit();r.append(compactFrame(s.snapshot()));
  const metadata={graph,design:graph.design,material:DEFAULT_MATERIAL,experiment:{...DEFAULT_EXPERIMENT,subdivisions:1},nodes:frame.nodes,elements:frame.elements,history:s.history};
  const binary=await encodeRecording(r,metadata).arrayBuffer(),loaded=decodeRecording(binary);assert.equal(loaded.recording.frames.length,2);
  for(const key of ['positions','stresses','strains','active'])assert.deepEqual(loaded.recording.frames[1][key],r.frames[1][key]);
  assert.equal(loaded.metadata.graph.depth,graph.depth);assert.throws(()=>decodeRecording(binary.slice(0,-8)),/truncated/);
  const bad=binary.slice(0);new Uint8Array(bad)[0]=0;assert.throws(()=>decodeRecording(bad),/Choose/);
});

function workerSession(graph,material={}){
  const worker=new Worker(new URL('./support/worker-host.mjs',import.meta.url),{workerData:{script:'simulation-worker.js'}}),frames=[],messages=[];
  let resolve,reject;const ready=new Promise((a,b)=>{resolve=a;reject=b});
  worker.on('error',reject);worker.on('message',m=>{messages.push(m);if(m.type==='recorded-frame'){frames.push(m.frame);if(m.frame.kind==='rest')resolve();}});
  worker.postMessage({type:'init',graph,material:{...DEFAULT_MATERIAL,...material},experiment:{...DEFAULT_EXPERIMENT,subdivisions:1,increment:.001}});
  return {worker,frames,messages,ready,run:target=>new Promise((resolve,reject)=>{const listen=m=>{if(m.type==='complete'){worker.off('message',listen);resolve();}if(m.type==='error'){worker.off('message',listen);reject(Error(m.message));}};worker.on('message',listen);worker.postMessage({type:'run',target});})};
}
function barGraph(dimension=3){return {dimension,width:10,height:20,depth:dimension===3?10:0,tileW:20,tileD:10,nodes:[{x:5,y:0,z:dimension===3?5:0},{x:5,y:20,z:dimension===3?5:0}],edges:[{id:0,a:0,b:1,r:.5,level:0}],design:{radius:.5,notch:false,columns:1,slices:1}};}
test('actual simulation worker records loading then unloading in sequence in both 2D and 3D',async()=>{
  for(const dimension of [2,3]){
    const session=workerSession(barGraph(dimension));try{await session.ready;await session.run(.003);await session.run(0);
      assert.deepEqual(session.frames.map(f=>Number(f.strain.toFixed(5))),[0,.001,.002,.003,.002,.001,0]);
      assert.ok(session.frames.every(f=>f.kind==='rest'||f.status==='equilibrium'));assert.ok(session.frames.every(f=>!('q' in f)&&!('history' in f)));
    }finally{await session.worker.terminate();}
  }
});
test('actual worker preserves the instant of failure with correct topology and pending-equilibrium label',async()=>{
  const session=workerSession(barGraph(),{E:1000,strength:.5,fracture:true});try{await session.ready;await session.run(.001);
    const i=session.frames.findIndex(f=>f.kind==='fracture');assert.ok(i>0);const before=session.frames[i-1],event=session.frames[i];
    assert.equal(before.active[0],1);assert.equal(event.active[0],0);assert.equal(event.status,'solving');assert.equal(event.converged,false);assert.equal(event.storedEnergy,0);assert.equal(event.stresses[0],0);
    assert.deepEqual(event.positions,before.positions);assert.equal(event.broken,1);assert.ok(session.frames.at(-1).converged);
  }finally{await session.worker.terminate();}
});
