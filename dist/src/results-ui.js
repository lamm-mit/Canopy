import {SUMMARY_FIELDS,recordsCSV,summarizeExperiment} from './experiment-data.js';
import {PALETTE,SCATTER_FIELDS,resultPlotSVG} from './result-plots.js';
import {decodeRecording} from './replay.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class ResultsUI {
  constructor({store,recorder,download,toast,onReplay,onClear}){
    Object.assign(this,{store,recorder,download,toast,onReplay,onClear});this.records=[];this.selected=new Set();this.known=new Set();this.focus=null;this.$=id=>document.getElementById(id);
    this.$('results-open').onclick=()=>this.open();this.$('results-close').onclick=()=>this.$('results-dialog').close();
    for(const id of ['results-plot','results-x','results-y'])this.$(id).onchange=()=>this.plot();
    this.$('results-search').oninput=()=>this.renderList();
    this.$('results-select-all').onclick=()=>{this.visible().forEach(r=>this.selected.add(r.id));this.renderList();this.plot();};
    this.$('results-select-none').onclick=()=>{this.selected.clear();this.renderList();this.plot();};
    const options=Object.entries(SCATTER_FIELDS).map(([k,[label,unit]])=>`<option value="${k}">${esc(label)} (${unit})</option>`).join('');
    this.$('results-x').innerHTML=options;this.$('results-y').innerHTML=options;this.$('results-x').value='firstRuptureStrain';this.$('results-y').value='maxForceN';
    this.$('results-save-plot').onclick=()=>this.download(this.plot(true),'canopy-comparison.svg','image/svg+xml');
    this.$('results-csv').onclick=()=>this.download(recordsCSV(this.selectedRecords(),true),'canopy-selected-summary.csv','text/csv');
    this.$('results-export').onclick=()=>this.exportData();this.$('results-import').onclick=()=>this.$('dataset-input').click();this.$('dataset-input').onchange=e=>this.importData(e);
    this.$('results-cancel-job').onclick=()=>this.cancelJob();this.$('results-dialog').addEventListener('close',()=>this.cancelJob());
    this.$('results-reset').onclick=()=>{this.$('results-clear-panel').hidden=false;this.$('results-clear-confirm').textContent=`Clear ${this.records.length} experiments`;};
    this.$('results-clear-cancel').onclick=()=>this.$('results-clear-panel').hidden=true;
    this.$('results-clear-confirm').onclick=async()=>{try{this.recorder.discard();this.onClear();await this.store.clear();this.selected.clear();this.known.clear();this.focus=null;this.$('results-clear-panel').hidden=true;await this.refresh();this.$('results-message').textContent='All experimental results cleared. The next run starts a blank collection.';}catch(error){this.toast('Could not clear saved results: '+error.message);}};
    this.refresh();
  }
  async open(){await this.recorder.flush();await this.refresh();this.$('results-dialog').showModal();this.plot();}
  async refresh(){
    try{this.records=await this.store.all();for(const r of this.records)if(!this.known.has(r.id)){this.known.add(r.id);this.selected.add(r.id);}this.$('results-count').textContent=this.records.length;this.$('results-storage').textContent=this.store.warning||'Automatically saved in this browser. Export a backup to move or preserve the full collection.';
      if(!this.focus&&this.records.length)this.focus=this.records[0].id;
      this.renderList();this.plot();this.details();
    }catch(error){this.$('results-storage').textContent='Could not read saved results: '+error.message;}
  }
  visible(){const query=this.$('results-search').value.toLowerCase();return this.records.filter(r=>[r.name,r.parameters.material.model,r.parameters.design.family,r.status,...(r.tags||[])].join(' ').toLowerCase().includes(query));}
  selectedRecords(){return this.records.filter(r=>this.selected.has(r.id));}
  value(n,unit=''){return Number.isFinite(n)?(unit==='%'?n*100:n).toLocaleString('en-US',{maximumSignificantDigits:5}):'—';}
  renderList(){
    this.$('results-list').innerHTML=this.visible().map(r=>{const i=this.selectedRecords().findIndex(x=>x.id===r.id),s=r.summary;return `<div class="result-row ${this.focus===r.id?'focused':''}"><input type="checkbox" data-result-select="${r.id}" aria-label="Include ${esc(r.name)} in plots" ${this.selected.has(r.id)?'checked':''}><button class="result-row-main" data-result-detail="${r.id}"><span class="result-color" style="background:${i>=0?PALETTE[i%PALETTE.length]:'#cbd6c5'}"></span><strong>${esc(r.name)}</strong><small>${esc(r.status)} · ${r.steps.length} states · ${r.graph.dimension}D</small><span>${this.value(s.maxForceN)} N peak · ${this.value(s.firstRuptureStrain,'%')}% first rupture</span></button></div>`;}).join('')||'<p class="control-note">No experiments yet. Run a specimen or import a dataset.</p>';
    this.$('results-selection').textContent=`${this.selectedRecords().length} selected / ${this.records.length} saved`;
    this.$('results-list').querySelectorAll('[data-result-select]').forEach(el=>el.onchange=()=>{if(el.checked)this.selected.add(el.dataset.resultSelect);else this.selected.delete(el.dataset.resultSelect);this.renderList();this.plot();});
    this.$('results-list').querySelectorAll('[data-result-detail]').forEach(el=>el.onclick=()=>{this.focus=el.dataset.resultDetail;this.dirtyDetails=false;this.renderList();this.details();});
  }
  plot(exporting=false){
    const type=this.$('results-plot').value;this.$('results-scatter-controls').hidden=type!=='scatter';
    const svg=resultPlotSVG(this.selectedRecords(),{type,xMetric:this.$('results-x').value,yMetric:this.$('results-y').value,legend:exporting});
    if(!exporting)this.$('results-chart').innerHTML=svg;return svg;
  }
  details(){
    if(this.dirtyDetails&&this.detailID===this.focus)return;
    this.detailID=this.focus;
    const r=this.records.find(r=>r.id===this.focus),el=this.$('results-detail');if(!r){el.innerHTML='<p class="control-note">Select a saved experiment to inspect its measurements and parameters.</p>';return;}
    el.innerHTML=`<div class="result-detail-heading"><div><label for="result-name">Experiment name</label><input id="result-name" type="text" maxlength="300" value="${esc(r.name)}"></div><button id="result-open-replay" class="button quiet" ${!r.replay?.frames||r.replay?.missing?'disabled':''}>Open replay</button></div><p class="control-note">${esc(r.id)} · ${esc(r.createdAt)} · ${esc(r.parameters.experiment.mode)} · axis ${esc(r.parameters.experiment.axis||'y')} · ${esc(r.parameters.material.model)}<br>${r.replay?.truncated?'Replay reached its storage limit; scalar measurements continue. ':''}${r.status==='running'&&r.id!==this.recorder.active?.id?'This saved checkpoint ended while the experiment was running. ':''}Blank values mean the event was not observed or the metric is unavailable.</p><div class="result-summary-grid">${Object.entries(SUMMARY_FIELDS).map(([k,[label,unit]])=>`<div><span>${esc(label)}</span><strong>${this.value(r.summary[k],unit)} <small>${esc(unit)}</small></strong></div>`).join('')}</div><label for="result-notes">Notes / research context</label><textarea id="result-notes" rows="2" maxlength="10000" placeholder="Hypothesis, candidate label, print batch…">${esc(r.notes)}</textarea><div class="result-detail-actions"><button id="result-save-notes" class="button quiet">Save name & notes</button><button id="result-steps-csv" class="button quiet">Measurement CSV</button></div><details><summary>Exact input parameters and final attempt</summary><pre>${esc(JSON.stringify({parameters:r.parameters,loadingSegments:r.loadingSegments,finalAttempt:r.lastAttempt?Object.fromEntries(Object.entries(r.lastAttempt).filter(([k])=>!['q','positions','stresses','strains','active'].includes(k))):null},null,2))}</pre></details>`;
    this.$('result-name').oninput=this.$('result-notes').oninput=()=>this.dirtyDetails=true;
    this.$('result-save-notes').onclick=async()=>{r.name=this.$('result-name').value.trim()||r.name;r.notes=this.$('result-notes').value;r.updatedAt=new Date().toISOString();this.dirtyDetails=false;if(this.recorder.active?.id===r.id){this.recorder.active.name=r.name;this.recorder.active.notes=r.notes;this.recorder.markDirty();await this.recorder.flush();}else await this.store.put(r);await this.refresh();this.toast('Experiment name and notes saved.');};
    this.$('result-steps-csv').onclick=()=>this.download(recordsCSV([r]),`canopy-${r.id}-measurements.csv`,'text/csv');
    this.$('result-open-replay').onclick=async()=>{try{await this.recorder.flush();const blob=await this.store.replay(r.id);if(!blob)throw Error('This dataset does not include replay geometry.');const saved=decodeRecording(await blob.arrayBuffer());this.$('results-dialog').close();this.onReplay(saved);}catch(error){this.toast(error.message);}};
  }
  job(type,payload,transfer=[]){
    if(this.worker)return Promise.reject(Error('A data operation is already running.'));
    this.$('results-cancel-job').hidden=false;this.$('results-progress').hidden=false;this.$('results-progress').value=0;
    for(const id of ['results-export','results-import','results-reset'])this.$(id).disabled=true;
    return new Promise((resolve,reject)=>{this.jobReject=reject;this.worker=new Worker(new URL('./dataset-worker.js',import.meta.url),{type:'module'});const owner=this.worker;this.worker.onerror=()=>{if(this.worker!==owner)return;this.finishJob();reject(Error('Dataset processing failed. Try a smaller batch.'));};this.worker.onmessage=({data})=>{if(this.worker!==owner)return;if(data.type==='progress')this.$('results-progress').value=data.progress;else if(data.type==='error'){this.finishJob();reject(Error(data.message));}else if(data.type==='exported'||data.type==='imported'){this.finishJob();resolve(data);}};this.worker.postMessage({type,...payload},transfer);});
  }
  finishJob(){this.worker?.terminate();this.worker=null;this.jobReject=null;this.$('results-cancel-job').hidden=true;this.$('results-progress').hidden=true;for(const id of ['results-export','results-import','results-reset'])this.$(id).disabled=false;}
  cancelJob(){if(!this.worker)return;const reject=this.jobReject;this.finishJob();reject?.(Error('Data operation cancelled.'));}
  async exportData(){try{await this.recorder.flush();await this.refresh();const records=this.$('results-export-scope').value==='selected'?this.selectedRecords():this.records;if(!records.length)throw Error('There are no experiment results to export.');this.$('results-message').textContent='Collecting measurements and replay geometry…';const replays=new Map();for(const r of records){const blob=await this.store.replay(r.id);if(blob)replays.set(r.id,blob);}const result=await this.job('export',{records,replays});this.download(result.blob,'Canopy_Experiment_Data.zip','application/zip');this.$('results-message').textContent=`Exported ${records.length} experiments, CSV tables, exact parameters, final states, and ${replays.size} replays.`;}catch(error){this.$('results-message').textContent=error.message;}}
  async importData(event){
    const file=event.target.files?.[0];if(!file)return;
    try{if(file.size>512*1048576)throw Error('Dataset files must be smaller than 512 MiB.');this.$('results-message').textContent='Validating the dataset…';const buffer=await file.arrayBuffer(),result=await this.job('import',{buffer,isJSON:file.name.toLowerCase().endsWith('.json')},[buffer]);await this.recorder.flush();const existing=new Set((await this.store.all()).map(r=>r.id)),records=[],replays=new Map();let skipped=0;
      for(const r of result.records){const oldID=r.id;if(existing.has(r.id)){if(this.$('results-import-mode').value==='merge'){skipped++;continue;}r.sourceExperimentId=r.id;r.id=crypto.randomUUID();r.name=r.name+' · imported copy';}records.push(r);if(result.replays.has(oldID))replays.set(r.id,result.replays.get(oldID));}
      const saved=await this.store.import(records,replays);await this.refresh();this.$('results-message').textContent=`Imported ${records.length} experiments; skipped ${skipped} existing IDs.${saved.persistent?'':' Session only: export a backup before closing.'}`;
    }catch(error){this.$('results-message').textContent='Import failed: '+error.message;}event.target.value='';
  }
}
