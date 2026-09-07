import {FrameSolver,makeFrame} from './mechanics.js';
import {SpatialFrameSolver,makeSpatialFrame} from './mechanics3d.js';
import {compactFrame} from './replay.js';
import {measureSnapshot} from './experiment-data.js';
let solver=null,running=false,token=0,target=0,nextLoad=0,lastSend=0,recording=true,started=0;
function record(state,kind,before=null){postMessage({type:'measurement',measurement:{...measureSnapshot(state,kind,solver.frame.elements,before),elapsedWallMs:performance.now()-started}});if(!recording)return;const frame=compactFrame(state,kind);postMessage({type:'recorded-frame',frame},[frame.positions.buffer,frame.stresses.buffer,frame.strains.buffer,frame.active.buffer]);}
function send(){if(!solver)return;const state=solver.snapshot();postMessage({type:'state',state});lastSend=performance.now();}
function loop(t){
  if(!running||t!==token)return;
  try{
    const started=performance.now();
    while(performance.now()-started<28&&running){
      const done=solver.iterate();
      if(done){
        if(solver.status!=='equilibrium'){running=false;send();break;}
        const before=solver.snapshot();
        if(!solver.commit()){
          record(before,'equilibrium');solver.assemble(false);record(solver.snapshot(),'fracture',before);
          continue;
        }
        record(solver.snapshot(),'equilibrium');
        send();
        if(Math.abs(solver.strain-target)<1e-9){running=false;postMessage({type:'complete'});break;}
        const step=solver.experiment.increment;nextLoad=solver.strain+Math.sign(target-solver.strain)*Math.min(step,Math.abs(target-solver.strain));solver.setLoad(nextLoad);
      }
    }
    if(performance.now()-lastSend>100)send();
    if(running)setTimeout(()=>loop(t),0);
  }catch(error){running=false;postMessage({type:'error',message:error.message});}
}
self.onmessage=({data})=>{
  if(data.type==='init'){
    running=false;token++;recording=true;started=performance.now();const spatial=data.graph.dimension===3,frame=(spatial?makeSpatialFrame:makeFrame)(data.graph,data.experiment.subdivisions);solver=new (spatial?SpatialFrameSolver:FrameSolver)(frame,data.material,data.experiment);solver.status='ready';
    postMessage({type:'initialized',nodes:frame.nodes,dofs:spatial?6:3,elements:frame.elements.map(({a,b,r,level,parent,active,notched})=>({a,b,r,level,parent,active,notched}))});send();record(solver.snapshot(),'rest');
  }
  if(data.type==='run'&&solver){target=Math.max(0,Math.min(.35,data.target));running=true;token++;if(solver.status==='ready'||solver.status==='equilibrium')solver.setLoad(solver.strain+Math.sign(target-solver.strain)*Math.min(solver.experiment.increment,Math.abs(target-solver.strain)));else if(solver.status==='not-converged'){postMessage({type:'error',message:'This step did not converge. Reset and reduce the load increment or target strain.'});running=false;return;}loop(token);}
  if(data.type==='pause'){running=false;token++;send();postMessage({type:'paused'});}
  if(data.type==='stop-recording')recording=false;
};
