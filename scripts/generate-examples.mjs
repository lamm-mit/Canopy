import fs from 'node:fs';
import {generateNetwork,PRESETS} from '../dist/src/geometry.js';
import {DEFAULT_MATERIAL,DEFAULT_EXPERIMENT} from '../dist/src/mechanics.js';
import {SpatialFrameSolver,makeSpatialFrame} from '../dist/src/mechanics3d.js';
import {buildPrintMesh,binarySTL,DEFAULT_PRINT} from '../dist/src/fabrication.js';
// A fresh source checkout does not contain generated output directories.
for(const directory of ["docs/results", "examples/designs", "examples/prints"])fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync('docs/results/unit-cell-geometry.json',JSON.stringify(generateNetwork(),null,2));
const summary={version:2,dimension:3,generatedAt:new Date().toISOString(),units:{length:'mm',force:'N',stress:'MPa',energy:'mJ'},experiments:[],prints:[]};
for(const p of PRESETS)fs.writeFileSync(`examples/designs/${p.id}.json`,JSON.stringify({format:'canopy-studio',version:2,design:p.settings,material:DEFAULT_MATERIAL,experiment:DEFAULT_EXPERIMENT,print:DEFAULT_PRINT},null,2));
for(const [name,design] of [['diamond',{...PRESETS[0].settings,family:'diamond',hierarchy:0}],['xyz_repeat',{...PRESETS[0].settings,repeatsX:2,repeatsY:2,repeatsZ:2,hierarchy:0}]])fs.writeFileSync(`examples/designs/${name}.json`,JSON.stringify({format:'canopy-studio',version:2,design,material:DEFAULT_MATERIAL,experiment:DEFAULT_EXPERIMENT,print:DEFAULT_PRINT},null,2));
const cases=[
  {name:'canopy_tension',design:PRESETS[0].settings,material:DEFAULT_MATERIAL,mode:'tension',axis:'y',target:.02,step:.002},
  {name:'crystal_tension',design:PRESETS[1].settings,material:DEFAULT_MATERIAL,mode:'tension',axis:'x',target:.02,step:.002},
  {name:'notched_fracture',design:{...PRESETS[0].settings,notch:true,notchDepth:.26,notchZ:.6},material:{...DEFAULT_MATERIAL,strength:3,fracture:true},mode:'tension',axis:'y',target:.025,step:.001},
  {name:'neo_compression',design:PRESETS[3].settings,material:{...DEFAULT_MATERIAL,model:'neo',E:12},mode:'compression',axis:'z',target:.04,step:.002},
  {name:'plastic_cycle',design:PRESETS[4].settings,material:{...DEFAULT_MATERIAL,model:'plastic',E:1000,yieldStress:5,hardening:.02},mode:'tension',axis:'y',target:.025,step:.001,unload:true},
  {name:'canopy_shear',design:PRESETS[0].settings,material:DEFAULT_MATERIAL,mode:'shear',axis:'y',shearAxis:'z',target:.02,step:.002}
];
for(const c of cases){
  const g=generateNetwork(c.design),s=new SpatialFrameSolver(makeSpatialFrame(g,2),c.material,{mode:c.mode,axis:c.axis,shearAxis:c.shearAxis||'x',increment:c.step,maxIterations:140}),start=performance.now();let failure=null;
  const n=Math.ceil(c.target/c.step),loads=Array.from({length:n},(_,i)=>Math.min(c.target,(i+1)*c.step));if(c.unload)for(let i=n-1;i>=0;i--)loads.push(Math.min(c.target,i*c.step));
  for(const strain of loads){s.setLoad(strain);let stable=false;for(let cascade=0;cascade<=g.edges.length&&!stable;cascade++){for(let i=0;i<150;i++)if(s.iterate())break;if(s.status!=='equilibrium'){failure={strain,status:s.status,residual:s.residual};break;}stable=s.commit();}if(failure)break;}
  const seconds=(performance.now()-start)/1000,keys=['strain','displacement','force','nominalStress','storedEnergy','torsionEnergy','deletedElasticEnergy','plasticDissipation','broken','residual','iterations','converged'];
  fs.writeFileSync(`docs/results/${c.name}.csv`,[keys.join(','),...s.history.map(p=>keys.map(k=>p[k]).join(','))].join('\n')+'\n');
  const state=s.snapshot(),item={name:c.name,design:c.design,material:c.material,mode:c.mode,axis:c.axis,shearAxis:c.shearAxis,target:c.target,step:c.step,nodes:g.nodes.length,struts:g.edges.length,points:s.history.length,failedStruts:s.broken.size,final:s.history.at(-1),maxOutOfPlane:state.maxOutOfPlane,maximumReaction:Math.max(0,...s.history.map(p=>p.force)),maximumResidual:Math.max(0,...s.history.map(p=>p.residual)),seconds,failure};summary.experiments.push(item);console.log(JSON.stringify({name:c.name,points:item.points,failed:item.failedStruts,seconds,failure}));
  fs.writeFileSync(`examples/designs/${c.name}.json`,JSON.stringify({format:'canopy-studio',version:2,design:c.design,material:c.material,experiment:{...DEFAULT_EXPERIMENT,mode:c.mode,axis:c.axis,shearAxis:c.shearAxis||'x',target:c.target,increment:c.step},print:DEFAULT_PRINT},null,2));
  fs.writeFileSync('docs/results/summary.json',JSON.stringify(summary,null,2));
}
const printGraph=generateNetwork({...PRESETS[0].settings,width:36,depth:36});
for(const profile of ['round','nodes','ribbon']){
  const mesh=buildPrintMesh(printGraph,{...DEFAULT_PRINT,profile,outputWidth:32,voxel:.28,layers:1}),buffer=binarySTL(mesh),filename=`canopy_3d_${profile==='ribbon'?'square':profile}_32mm.stl`;fs.writeFileSync(`examples/prints/${filename}`,new Uint8Array(buffer));summary.prints.push({filename,profile:profile==='ribbon'?'square':profile,...mesh.check,bytes:buffer.byteLength,voxel:mesh.voxel});console.log(JSON.stringify({print:filename,...mesh.check}));
}
fs.writeFileSync('docs/results/summary.json',JSON.stringify(summary,null,2));
