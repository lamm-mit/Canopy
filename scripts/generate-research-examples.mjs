import fs from 'node:fs';
import {generateNetwork} from '../dist/src/geometry.js';
import {SpatialFrameSolver,makeSpatialFrame} from '../dist/src/mechanics3d.js';
import {createExperiment,measureSnapshot,summarizeExperiment,jsonStringify} from '../dist/src/experiment-data.js';
import {ExperimentRecording,compactFrame,encodeRecording} from '../dist/src/replay.js';
import {exportDataset} from '../dist/src/dataset-archive.js';
import {resultPlotSVG} from '../dist/src/result-plots.js';

const records=[],replays=new Map();fs.mkdirSync('examples/research',{recursive:true});
for(const name of ['canopy_tension','notched_fracture','plastic_cycle']){
  const input=JSON.parse(fs.readFileSync(`examples/designs/${name}.json`,'utf8')),graph=generateNetwork(input.design),frame=makeSpatialFrame(graph,input.experiment.subdivisions),s=new SpatialFrameSolver(frame,input.material,input.experiment),recording=new ExperimentRecording(),metadata={...input,graph,nodes:frame.nodes,elements:frame.elements,history:[]},result=createExperiment(metadata,`example-${name.replaceAll('_','-')}`,name.replaceAll('_',' ')),start=performance.now();
  const capture=(kind,before=null)=>{const state=s.snapshot();result.steps.push({...measureSnapshot(state,kind,frame.elements,before),sequence:result.steps.length,elapsedWallMs:performance.now()-start});recording.append(compactFrame(state,kind));};
  s.status='ready';capture('rest');const e=input.experiment,n=Math.round(e.target/e.increment),loads=Array.from({length:n},(_,i)=>(i+1)*e.increment);if(name==='plastic_cycle')for(let i=n-1;i>=0;i--)loads.push(i*e.increment);
  result.loadingSegments=[{targetStrain:e.target,afterSequence:0},...(name==='plastic_cycle'?[{targetStrain:0,afterSequence:n}]:[])];
  outer:for(const load of loads){s.setLoad(load);for(let cascade=0;cascade<=graph.edges.length;cascade++){
    for(let i=0;i<e.maxIterations+2&&!s.iterate();i++);if(s.status!=='equilibrium'){result.status='not-converged';break outer;}
    const before=s.snapshot();if(s.commit()){capture('equilibrium');break;}
    result.steps.push({...measureSnapshot(before),sequence:result.steps.length,elapsedWallMs:performance.now()-start});recording.append(compactFrame(before));s.assemble(false);capture('fracture',before);
  }}
  if(result.status!=='not-converged')result.status='complete';result.updatedAt=new Date().toISOString();result.summary=summarizeExperiment(result);result.notes='Included reproducible solver example. Material values are illustrative.';result.tags=['example','3d'];result.replay={frames:recording.frames.length,bytes:recording.bytes,truncated:recording.full};const state=s.snapshot();result.lastAttempt={...measureSnapshot(state,'attempt'),positions:state.positions,stresses:state.stresses,strains:state.strains,active:state.active,q:state.q,dofs:state.dofs};
  metadata.history=s.history;const replay=encodeRecording(recording,metadata);records.push(result);replays.set(result.id,replay);fs.writeFileSync(`examples/research/${name}.canopy-replay`,new Uint8Array(await replay.arrayBuffer()));
  console.log(JSON.stringify({name,status:result.status,states:result.steps.length,ruptures:result.summary.fractureEvents,maxForceN:result.summary.maxForceN,seconds:(performance.now()-start)/1000}));
}
const blob=await exportDataset(records,replays);fs.writeFileSync('examples/research/Canopy_Example_Experiments.zip',new Uint8Array(await blob.arrayBuffer()));
fs.writeFileSync('examples/research/stress-strain-comparison.svg',resultPlotSVG(records,{type:'stress',legend:true}));
fs.writeFileSync('examples/research/measurement-summary.json',jsonStringify(records.map(({name,status,summary})=>({name,status,summary})),2)+'\n');
console.log(`Saved ${records.length} importable examples with complete measurements and replay geometry.`);
