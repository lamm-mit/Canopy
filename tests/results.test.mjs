import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from './vendor/fake-indexeddb/index.js';
import {createExperiment,measureSnapshot,summarizeExperiment,validateDataset,recordsCSV} from '../dist/src/experiment-data.js';
import {ExperimentStore} from '../dist/src/experiment-store.js';
import {ExperimentRecorder} from '../dist/src/experiment-recorder.js';
import {exportDataset,importDataset} from '../dist/src/dataset-archive.js';
import {resultPlotSVG,curvePoints} from '../dist/src/result-plots.js';
import {generateNetwork,DEFAULT_DESIGN} from '../dist/src/geometry.js';
import {DEFAULT_EXPERIMENT,DEFAULT_MATERIAL} from '../dist/src/mechanics.js';
import {DEFAULT_PRINT} from '../dist/src/fabrication.js';
import {SpatialFrameSolver,makeSpatialFrame} from '../dist/src/mechanics3d.js';
import {ExperimentRecording,compactFrame,encodeRecording,decodeRecording} from '../dist/src/replay.js';

function fixture(){
  const graph=generateNetwork({...DEFAULT_DESIGN,hierarchy:0}),frame=makeSpatialFrame(graph,1),s=new SpatialFrameSolver(frame,DEFAULT_MATERIAL,DEFAULT_EXPERIMENT);
  s.status='ready';const rest=s.snapshot();s.setLoad(.001);for(let i=0;i<180&&!s.iterate();i++);assert.equal(s.status,'equilibrium');s.commit();const state=s.snapshot();
  const metadata={graph,nodes:frame.nodes,elements:frame.elements,design:graph.design,material:DEFAULT_MATERIAL,experiment:{...DEFAULT_EXPERIMENT,subdivisions:1},print:DEFAULT_PRINT,history:s.history};
  const record=createExperiment(metadata,'result-one','Test 3D tension');record.steps=[{...measureSnapshot(rest,'rest'),sequence:0},{...measureSnapshot(state),sequence:1}];record.summary=summarizeExperiment(record);record.status='complete';record.replay={frames:2,bytes:0,truncated:false};
  const recording=new ExperimentRecording();recording.append(compactFrame(rest,'rest'));recording.append(compactFrame(state));
  return {record,recording,metadata,state,rest};
}
test('rich measurements distinguish active member statistics, nominal stress, and rupture triggers',()=>{
  const before={status:'equilibrium',converged:true,strain:.02,displacement:.4,force:40,nominalStress:.4,broken:0,active:new Uint8Array([1,1,0]),stresses:new Float32Array([2,8,10000]),strains:new Float32Array([-.01,.03,10]),torques:new Float32Array([1,-3,999])},state={...before,status:'solving',converged:false,force:10,broken:1,active:new Uint8Array([1,0,0]),stresses:new Float32Array([2,0,0]),strains:new Float32Array([-.01,0,0])};
  const a=measureSnapshot(before),event=measureSnapshot(state,'fracture',[{parent:1},{parent:2},{parent:3}],before);
  assert.equal(a.maxMemberStressMPa,8);assert.equal(a.maxAbsTorqueNmm,3);assert.equal(a.activeElements,2);assert.ok(Math.abs(a.maxAbsAxialStrain-.03)<1e-8);assert.equal(a.nominalStress,.4);
  assert.deepEqual(event.failure.parentIds,[2]);assert.equal(event.failure.elements[0].stressMPa,8);assert.equal(event.failure.triggerForceN,40);assert.equal(event.converged,false);
});
test('rupture summaries remain null when not observed and ignore unconverged last attempts',()=>{
  const {record}=fixture();record.lastAttempt={force:1e6,strain:.8};const s=summarizeExperiment(record);assert.equal(s.firstRuptureStrain,null);assert.equal(s.separationStrain,null);assert.equal(s.maxRuptureStrain,null);assert.ok(s.maxForceN<1e6);assert.equal(s.initialSlopeAtStrain,.001);
  record.steps.push({kind:'fracture',converged:false,broken:1,strain:.002,loadPath:true,failure:{triggerAppliedStrain:.002,triggerForceN:3,triggerNominalStressMPa:.03,elements:[{axialStrain:.05}]}});
  record.steps.push({kind:'fracture',converged:false,broken:2,strain:.0015,loadPath:false,failure:{triggerAppliedStrain:.0015,triggerForceN:2,triggerNominalStressMPa:.02,elements:[{axialStrain:.04}]}});
  const r=summarizeExperiment(record);assert.equal(r.firstRuptureStrain,.002);assert.equal(r.lastRuptureStrain,.0015);assert.equal(r.maxRuptureStrain,.002);assert.equal(r.separationStrain,.0015);assert.equal(r.maxFailedMemberAxialStrainAtFirstRupture,.05);
});
test('ZIP dataset round-trips rich measurements, exact inputs, and replay geometry',async()=>{
  const f=fixture(),replay=encodeRecording(f.recording,f.metadata);f.record.lastAttempt={positions:f.state.positions};
  const blob=await exportDataset([f.record],new Map([[f.record.id,replay]])),loaded=importDataset(await blob.arrayBuffer());
  assert.deepEqual(loaded.records[0].steps,f.record.steps);assert.deepEqual(loaded.records[0].parameters,f.record.parameters);assert.deepEqual(loaded.records[0].lastAttempt.positions,Array.from(f.state.positions));
  const decoded=decodeRecording(await loaded.replays.get(f.record.id).arrayBuffer());assert.deepEqual(decoded.recording.frames[1].positions,f.state.positions);
  const json={format:'canopy-dataset',schemaVersion:1,experiments:[f.record]};const importedJSON=importDataset(new TextEncoder().encode(JSON.stringify(json)).buffer,true);assert.equal(importedJSON.records[0].replay.missing,true);
  assert.throws(()=>importDataset(new Uint8Array([1,2,3]).buffer));
});
test('dataset validation rejects duplicate IDs and malformed measurement rows before storage',()=>{
  const {record}=fixture();assert.throws(()=>validateDataset({format:'canopy-dataset',schemaVersion:1,experiments:[record,record]}),/duplicate/);
  const bad=structuredClone(record);bad.steps[1].force='unmeasured';assert.throws(()=>validateDataset({format:'canopy-dataset',schemaVersion:1,experiments:[bad]}),/measurement/);
  record.name='=2+2, experiment';const csv=recordsCSV([record],true);assert.ok(csv.includes("'=2+2, experiment"));
});
test('plots retain unloading order, exclude pending states, and omit missing rupture scatter values',()=>{
  const {record}=fixture();record.steps.push({...record.steps[1],strain:.0005,force:2,sequence:2});record.steps.push({kind:'fracture',converged:false,strain:.1,force:999999,sequence:3});
  assert.deepEqual(curvePoints(record,'force').map(p=>p.x),[.1,.05]);assert.equal(curvePoints(record,'force').length,2);
  assert.ok(resultPlotSVG([record],{type:'scatter'}).includes('No observed values'));const withPending=resultPlotSVG([record],{type:'force'});record.steps.pop();assert.equal(resultPlotSVG([record],{type:'force'}),withPending);
  record.name='<script>bad</script>';assert.ok(!resultPlotSVG([record],{legend:true}).includes('<script>'));
});
test('IndexedDB persists across store instances; imports are atomic; queued reset leaves a blank collection',async()=>{
  const factory=new IDBFactory(),a=new ExperimentStore(factory),{record,recording,metadata}=fixture(),replay=encodeRecording(recording,metadata);
  assert.equal((await a.put(record,replay)).persistent,true);
  const b=new ExperimentStore(factory);assert.equal((await b.all()).length,1);assert.equal((await b.replay(record.id)).size,replay.size);
  const two={...record,id:'result-two'};await assert.rejects(b.import([two,record]));assert.equal((await a.all()).length,1);
  await b.import([two]);assert.equal((await a.all()).length,2);
  const pending=a.put({...record,id:'result-three'},replay),cleared=a.clear();await pending;await cleared;assert.equal((await b.all()).length,0);assert.equal(await b.replay(record.id),undefined);
  a.db.close();b.db.close();
});
test('automatic recording checkpoints preserve original design and new experiments survive solver reset',async()=>{
  const f=fixture(),store=new ExperimentStore(new IDBFactory()),capture={...f},events=[],recorder=new ExperimentRecorder(store,()=>capture,e=>events.push(e));
  recorder.start(f.metadata,'First',.001);recorder.measure({...measureSnapshot(f.state),elapsedWallMs:4});recorder.status('complete');await store.queue;
  const savedEvents=events.length;await recorder.flush();assert.equal(events.length,savedEvents,'Reading an unchanged checkpoint must not emit another save event');const firstID=recorder.active.id;f.metadata.design.radius=1.6;recorder.end();await store.queue;const saved=await store.get(firstID),loaded=decodeRecording(await (await store.replay(firstID)).arrayBuffer());
  assert.notEqual(saved.parameters.design.radius,1.6);assert.equal(loaded.metadata.design.radius,saved.parameters.design.radius);assert.equal(saved.status,'complete');assert.equal(saved.steps.length,2);
  recorder.start(f.metadata,'Second',.002);const secondID=recorder.active.id;assert.notEqual(secondID,firstID);recorder.end(true);await store.queue;assert.equal((await store.all()).length,2);assert.equal((await store.get(secondID)).status,'interrupted');assert.ok(events.every(e=>e.persistent));store.db.close();
});
test('storage unavailable mode retains exportable session data and reports lack of persistence',async()=>{
  const store=new ExperimentStore(null),{record}=fixture();assert.equal((await store.put(record)).persistent,false);assert.equal((await store.all()).length,1);assert.ok(store.warning.includes('this tab'));await store.clear();assert.equal((await store.all()).length,0);
});
