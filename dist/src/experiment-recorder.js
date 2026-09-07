import {createExperiment,measureSnapshot,summarizeExperiment} from './experiment-data.js';
import {encodeRecording} from './replay.js';

export class ExperimentRecorder {
  constructor(store,getCapture,onSaved){this.store=store;this.getCapture=getCapture;this.onSaved=onSaved;this.active=null;this.timer=0;this.revision=0;this.pendingSaves=0;}
  start(metadata,name,target){
    if(!this.active){this.active=createExperiment(metadata,crypto.randomUUID(),name);const rest=this.getCapture().recording.frames[0];if(rest)this.active.steps.push({...measureSnapshot(rest,'rest'),sequence:0,elapsedWallMs:0});}
    this.active.status='running';this.active.loadingSegments??=[];this.active.loadingSegments.push({targetStrain:target,startedAt:new Date().toISOString(),afterSequence:this.active.steps.length-1});this.markDirty();this.schedule();
  }
  markDirty(){this.revision++;}
  measure(row){if(!this.active)return;this.active.steps.push({...row,sequence:this.active.steps.length});this.markDirty();this.schedule();}
  schedule(){if(!this.timer)this.timer=setTimeout(()=>this.flush(),2000);}
  status(status){if(!this.active)return;this.active.status=status;this.markDirty();this.flush();}
  flush(){
    clearTimeout(this.timer);this.timer=0;if(!this.active)return Promise.resolve();
    const r=this.active,capture=this.getCapture();
    if(this.savedID===r.id&&this.savedRevision===this.revision&&this.savedState===capture.state&&this.savedFrames===capture.recording.frames.length)return this.store.queue;
    this.savedID=r.id;this.savedRevision=this.revision;this.savedState=capture.state;this.savedFrames=capture.recording.frames.length;
    r.updatedAt=new Date().toISOString();r.summary=summarizeExperiment(r);
    r.lastAttempt=capture.state?{...measureSnapshot(capture.state,'attempt'),positions:capture.state.positions,strains:capture.state.strains,stresses:capture.state.stresses,active:capture.state.active,q:capture.state.q,dofs:capture.state.dofs}:null;
    r.replay={frames:capture.recording.frames.length,bytes:capture.recording.bytes,truncated:capture.recording.full};
    // Preserve the design/material used for this run even when controls are changing for the next one.
    const metadata={...capture.metadata,...r.parameters,graph:r.graph};let replay=null;
    try{if(capture.recording.frames.length)replay=encodeRecording(capture.recording,metadata);}catch(error){r.replay.error=error.message;}
    const id=r.id,status=r.status;
    this.pendingSaves++;
    return this.store.put(r,replay).then(saved=>{this.onSaved({...saved,id,status});return saved;}).finally(()=>this.pendingSaves--);
  }
  end(interrupted=false){if(this.active){if(interrupted){this.active.status='interrupted';this.markDirty();}this.flush();this.active=null;}clearTimeout(this.timer);this.timer=0;}
  discard(){clearTimeout(this.timer);this.timer=0;this.active=null;}
}
