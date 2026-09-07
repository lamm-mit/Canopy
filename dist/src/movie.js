import {movieSchedule,sampleRecording} from './replay.js';
import {normalizeDisplacementScale,displacementLabel,drawDisplacementLabel} from './deformation-view.js';

export class MovieExporter {
  constructor({viewer,download,onRestore}) {
    this.viewer=viewer;this.download=download;this.onRestore=onRestore;
    this.$=id=>document.getElementById(id);
    this.$('movie-start').onclick=()=>this.start();
    this.$('movie-cancel').onclick=()=>this.$('movie-dialog').close();
    this.$('movie-dialog').addEventListener('close',()=>this.cancel());
    for(const id of ['movie-duration','movie-fps','movie-resolution'])this.$(id).addEventListener('change',()=>this.updateEstimate());
  }
  open(frames,metadata) {
    if(frames.length<2)throw Error('Run at least one load step before exporting a movie.');
    this.frames=frames.slice();this.metadata=metadata;
    this.$('movie-message').textContent=`The movie uses your current camera, cutaway, color field, and displacement scale (${normalizeDisplacementScale(this.viewer.displacementScale)}×). Measurements stay at physical values.`;
    this.$('movie-progress').value=0;this.$('movie-start').textContent='Export MP4';this.setBusy(false);this.updateEstimate();this.$('movie-dialog').showModal();
  }
  settings(){const [width,height]=this.$('movie-resolution').value.split('x').map(Number),fps=+this.$('movie-fps').value,duration=+this.$('movie-duration').value;return {width,height,...movieSchedule(this.frames.length,duration,fps)};}
  updateEstimate(){try{const s=this.settings();this.$('movie-estimate').textContent=`${s.width} × ${s.height} · ${s.count.toLocaleString()} frames · ${s.duration.toFixed(1)} s. Every recorded event appears at least once.`;}catch(error){this.$('movie-estimate').textContent=error.message;}}
  setBusy(busy){this.busy=busy;this.$('movie-start').disabled=busy;for(const id of ['movie-duration','movie-fps','movie-resolution','movie-smooth','movie-overlay'])this.$(id).disabled=busy;this.$('movie-cancel').textContent=busy?'Cancel export':'Close';}
  start(){
    if(this.busy)return;
    try {
      const s=this.settings();this.settingsValue=s;this.smooth=this.$('movie-smooth').checked;this.overlay=this.$('movie-overlay').checked;this.displacementScale=normalizeDisplacementScale(this.viewer.displacementScale);
      this.canvas=document.createElement('canvas');this.canvas.width=s.width;this.canvas.height=s.height;this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});
      this.capture=this.viewer.createMovieCapture(s.width,s.height);this.setBusy(true);this.started=performance.now();this.$('movie-progress').value=0;this.$('movie-message').textContent='Preparing the offline MP4 encoder…';
      this.worker=new Worker(new URL('./movie-worker.js',import.meta.url));
      const owner=this.worker;this.worker.onerror=()=>{if(this.worker===owner)this.fail('The MP4 encoder could not start. Reload the app through its local server and try 480p.');};
      this.worker.onmessage=({data})=>{if(this.worker!==owner)return;
        if(data.type==='ready')this.sendFrame(0);
        if(data.type==='encoded'){
          this.$('movie-progress').value=data.count/s.count;
          this.$('movie-message').textContent=`Encoding ${data.count.toLocaleString()} / ${s.count.toLocaleString()} frames · ${Math.round(100*data.count/s.count)}%`;
          if(data.count<s.count)this.sendFrame(data.count);else{this.$('movie-message').textContent='Finishing the MP4 file…';this.worker.postMessage({type:'finish'});}
        }
        if(data.type==='complete'){
          const blob=new Blob([data.buffer],{type:'video/mp4'});
          this.download(blob,`canopy-${this.metadata.design.seed}-${this.metadata.experiment.mode}.mp4`,'video/mp4');
          this.$('movie-progress').value=1;this.$('movie-message').textContent=`MP4 downloaded · ${s.duration.toFixed(1)} seconds · ${(blob.size/1e6).toFixed(1)} MB · silent H.264 video`;
          this.cleanup();this.$('movie-start').textContent='Export another MP4';
        }
        if(data.type==='error')this.fail(data.message);
      };
      this.worker.postMessage({type:'init',width:s.width,height:s.height,fps:s.fps,frames:s.count});
    }catch(error){this.fail(error.message);}
  }
  sendFrame(index){
    // One RGBA buffer is in flight; there is no unbounded queue of uncompressed video frames.
    try{const s=this.settingsValue,cursor=s.cursor(index),frame=sampleRecording(this.frames,cursor,this.smooth),pixels=this.capture.read(frame);
      this.ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels),s.width,s.height),0,0);
      if(this.overlay)this.drawOverlay(frame,cursor);else drawDisplacementLabel(this.ctx,s.width,s.height,this.displacementScale);
      const data=this.ctx.getImageData(0,0,s.width,s.height).data;
      this.worker.postMessage({type:'frame',buffer:data.buffer},[data.buffer]);
    }catch(error){this.fail(error.message);}
  }
  drawOverlay(frame,cursor){
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height,scale=w/1280,pad=32*scale;
    c.save();c.fillStyle='#f2f5eeed';c.fillRect(0,0,w,82*scale);c.fillRect(0,h-106*scale,w,106*scale);
    c.fillStyle='#234e40';c.font=`600 ${24*scale}px Arial`;c.fillText('canopy / experiment replay',pad,36*scale);
    c.font=`${15*scale}px Arial`;c.fillStyle='#65795d';
    const exp=this.metadata.experiment,dimension=this.metadata.graph.dimension;
    c.fillText(`${dimension}D · ${exp.mode} · ${dimension===3?(exp.axis||'y').toUpperCase():'Y'} axis · ${this.metadata.material.model} material · ${this.viewer.field} view`,pad,61*scale);
    c.textAlign='right';c.fillText(`${Math.floor(cursor)+1} / ${this.frames.length} recorded states`,w-pad,36*scale);
    c.textAlign='left';c.fillStyle='#234e40';c.font=`${20*scale}px Arial`;
    c.fillText(`Strain ${(frame.strain*100).toFixed(2)}%     Reaction ${frame.force.toFixed(2)} N     Failed struts ${frame.broken}`,pad,h-68*scale);
    c.fillStyle='#687c62';c.font=`${14*scale}px Arial`;
    const note=frame.kind==='fracture'?'Fracture event · equilibrium pending':frame.interpolated?'Interpolated geometry · readouts from preceding solved state':frame.kind==='rest'?'Initial unloaded state':'Converged equilibrium';
    c.fillText(note,pad,h-40*scale);c.fillText((this.displacementScale>1?displacementLabel(this.displacementScale)+' · ':'')+'Quasi-static sequence · playback duration is not physical time',pad,h-18*scale);
    c.fillStyle='#d8e2ce';c.fillRect(0,h-4*scale,w,4*scale);c.fillStyle='#7d9c58';c.fillRect(0,h-4*scale,w*cursor/(this.frames.length-1),4*scale);c.restore();
  }
  cleanup(){this.worker?.terminate();this.worker=null;this.capture?.dispose();this.capture=null;this.canvas=null;this.ctx=null;this.setBusy(false);this.onRestore();}
  cancel(){if(this.worker||this.capture)this.cleanup();}
  fail(message){this.$('movie-message').textContent='Could not export: '+message;this.cleanup();}
}
