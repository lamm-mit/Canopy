// Versioned, unit-explicit experiment data used by the UI, exports, and future analysis tools.
export const DATA_VERSION=1;
export const APP_VERSION='2.3.0';
export const UNITS={length:'mm',force:'N',stress:'MPa',energy:'mJ',strain:'fraction',rotation:'rad',torque:'N mm',time:'wall-clock ms; not physical simulation time'};
export const STEP_COLUMNS=['sequence','kind','status','converged','elapsedWallMs','strain','displacement','force','nominalStress','maxMemberStressMPa','p95MemberStressMPa','maxAxialStrain','minAxialStrain','maxAbsAxialStrain','meanAxialStrain','maxAbsTorqueNmm','storedEnergy','torsionEnergy','deletedElasticEnergy','plasticDissipation','broken','activeElements','loadPath','maxOutOfPlane','rotation','residual','iterations'];
const measured=['strain','displacement','force','nominalStress','storedEnergy','torsionEnergy','deletedElasticEnergy','plasticDissipation','broken','residual','iterations','converged','rotation','loadPath','maxOutOfPlane'];
export function measureSnapshot(state,kind='equilibrium',elements=null,before=null){
  const out={kind,status:state.status};for(const k of measured)out[k]=state[k]??0;
  let max=-Infinity,min=Infinity,sum=0,maxTorque=0;const stresses=[];
  for(let i=0;i<state.active.length;i++)if(state.active[i]){const e=state.strains[i];max=Math.max(max,e);min=Math.min(min,e);sum+=e;stresses.push(state.stresses[i]);maxTorque=Math.max(maxTorque,Math.abs(state.torques?.[i]||0));}
  stresses.sort((a,b)=>a-b);const n=stresses.length;
  Object.assign(out,{activeElements:n,maxMemberStressMPa:stresses.at(-1)||0,p95MemberStressMPa:stresses[Math.max(0,Math.ceil(.95*n)-1)]||0,maxAxialStrain:n?max:0,minAxialStrain:n?min:0,maxAbsAxialStrain:n?Math.max(Math.abs(max),Math.abs(min)):0,meanAxialStrain:n?sum/n:0,maxAbsTorqueNmm:maxTorque});
  if(before&&elements){
    const failed=[];for(let i=0;i<state.active.length;i++)if(before.active[i]&&!state.active[i])failed.push({element:i,parent:elements[i].parent,stressMPa:before.stresses[i],axialStrain:before.strains[i]});
    out.failure={parentIds:[...new Set(failed.map(e=>e.parent))],elements:failed,triggerForceN:before.force,triggerNominalStressMPa:before.nominalStress,triggerAppliedStrain:before.strain};
  }
  return out;
}
export function createExperiment(metadata,id,name){
  const now=new Date().toISOString();
  return {format:'canopy-experiment',schemaVersion:DATA_VERSION,appVersion:APP_VERSION,id,name,notes:'',tags:[],createdAt:now,updatedAt:now,status:'running',units:UNITS,parameters:{design:structuredClone(metadata.design),material:structuredClone(metadata.material),experiment:structuredClone(metadata.experiment),print:structuredClone(metadata.print)},graph:structuredClone(metadata.graph),steps:[],summary:{},lastAttempt:null,replay:{frames:0,bytes:0,truncated:false}};
}
export function summarizeExperiment(record){
  const solved=record.steps.filter(s=>s.kind==='equilibrium'&&s.converged),failure=record.steps.filter(s=>s.kind==='fracture'),first=solved.find(s=>s.strain>1e-10&&Math.abs(s.displacement)>1e-10);
  const max=(key,list=solved,abs=false)=>list.length?list.reduce((m,p)=>Math.max(m,abs?Math.abs(p[key]??0):p[key]??0),-Infinity):null;
  let work=0,prev={force:0,displacement:0};for(const s of solved){work+=.5*(prev.force+s.force)*(s.displacement-prev.displacement);prev=s;}
  const firstFailure=failure[0],lastFailure=failure.at(-1),separation=record.steps.find(s=>s.kind==='fracture'&&!s.loadPath);
  const atFailure=(event,key)=>event?(event.failure?.[key]??null):null;
  const maxFailedMemberStrain=firstFailure?.failure?.elements?.length?Math.max(...firstFailure.failure.elements.map(e=>Math.abs(e.axialStrain))):null;
  return {convergedStates:solved.length,fractureEvents:failure.length,maxForceN:max('force',solved,true),maxNominalStressMPa:max('nominalStress',solved,true),maxMemberStressMPa:max('maxMemberStressMPa'),maxAppliedStrain:max('strain'),maxAbsAxialStrain:max('maxAbsAxialStrain'),maxStoredEnergy_mJ:max('storedEnergy'),maxTorsionEnergy_mJ:max('torsionEnergy'),maxOutOfPlaneMM:max('maxOutOfPlane'),maxResidual:max('residual'),initialNominalSlopeMPa:first?first.nominalStress/first.strain:null,initialStiffnessNPerMM:first?first.force/first.displacement:null,initialSlopeAtStrain:first?.strain??null,netInputWork_mJ:solved.length?work:null,finalPlasticDissipation_mJ:solved.at(-1)?.plasticDissipation??null,finalDeletedEnergy_mJ:solved.at(-1)?.deletedElasticEnergy??null,failedStruts:record.steps.at(-1)?.broken??0,firstRuptureStrain:atFailure(firstFailure,'triggerAppliedStrain'),lastRuptureStrain:atFailure(lastFailure,'triggerAppliedStrain'),maxRuptureStrain:failure.length?max('strain',failure):null,forceAtFirstRuptureN:atFailure(firstFailure,'triggerForceN'),stressAtFirstRuptureMPa:atFailure(firstFailure,'triggerNominalStressMPa'),maxFailedMemberAxialStrainAtFirstRupture:maxFailedMemberStrain,separationStrain:separation?.strain??null,finalStrain:solved.at(-1)?.strain??null,finalForceN:solved.at(-1)?.force??null};
}
export const SUMMARY_FIELDS={maxForceN:['Peak |reaction|','N'],maxNominalStressMPa:['Peak |nominal stress|','MPa'],maxMemberStressMPa:['Peak member tensile stress','MPa'],maxAppliedStrain:['Maximum applied strain','%'],maxAbsAxialStrain:['Peak |member axial strain|','%'],firstRuptureStrain:['First strut rupture strain','%'],lastRuptureStrain:['Last strut rupture strain','%'],maxRuptureStrain:['Maximum strain at strut rupture','%'],separationStrain:['Loss of spanning path at strain','%'],forceAtFirstRuptureN:['Reaction before first rupture','N'],stressAtFirstRuptureMPa:['Nominal stress before first rupture','MPa'],maxFailedMemberAxialStrainAtFirstRupture:['Failed member |axial strain| at first rupture','%'],initialNominalSlopeMPa:['Initial nominal secant slope','MPa'],initialStiffnessNPerMM:['Initial secant stiffness','N/mm'],maxStoredEnergy_mJ:['Peak stored energy','mJ'],netInputWork_mJ:['Net input work','mJ'],finalPlasticDissipation_mJ:['Final plastic dissipation','mJ'],finalDeletedEnergy_mJ:['Final deleted elastic energy','mJ'],maxTorsionEnergy_mJ:['Peak torsion energy','mJ'],maxOutOfPlaneMM:['Maximum global Z displacement','mm'],failedStruts:['Failed struts','count'],convergedStates:['Converged states','count'],fractureEvents:['Fracture events','count'],maxResidual:['Maximum relative residual','fraction']};
export const CURVES={stress:['strain','nominalStress','Applied strain (%)','Nominal stress (MPa)',100,1],force:['strain','force','Applied strain (%)','Grip reaction (N)',100,1],displacement:['displacement','force','Grip displacement (mm)','Grip reaction (N)',1,1],member:['strain','maxMemberStressMPa','Applied strain (%)','Peak member tensile stress (MPa)',100,1],energy:['strain','storedEnergy','Applied strain (%)','Stored energy (mJ)',100,1],damage:['strain','broken','Applied strain (%)','Failed struts',100,1],plastic:['strain','plasticDissipation','Applied strain (%)','Plastic dissipation (mJ)',100,1]};
const safeCell=v=>{let s=v==null?'':String(v);if(/^[=+@\t\r]/.test(s)||(/^-[^\d.]/.test(s)))s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
export function recordsCSV(records,summary=false){
  const keys=summary?Object.keys(summarizeExperiment({steps:[]})):STEP_COLUMNS,rows=[['experiment_id','experiment_name',...keys]];
  for(const r of records)for(const row of summary?[r.summary]:r.steps)rows.push([r.id,r.name,...keys.map(k=>row[k])]);
  return rows.map(r=>r.map(safeCell).join(',')).join('\n')+'\n';
}
export function jsonStringify(value,space=0){return JSON.stringify(value,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v,space);}
export function validateDataset(data){
  if(data?.format!=='canopy-dataset'||data.schemaVersion!==DATA_VERSION||!Array.isArray(data.experiments)||data.experiments.length>10000)throw Error('Choose a Canopy dataset ZIP or JSON (schema version 1).');
  const ids=new Set();let totalSteps=0;
  for(const r of data.experiments){
    if(r.format!=='canopy-experiment'||r.schemaVersion!==1||typeof r.id!=='string'||!/^[\w-]{1,90}$/.test(r.id)||ids.has(r.id)||typeof r.name!=='string'||r.name.length>300||!r.parameters?.design||!r.parameters.material||!r.parameters.experiment||!r.graph||!Array.isArray(r.steps)||r.steps.length>100000)throw Error('Invalid or duplicate experiment record.');
    ids.add(r.id);totalSteps+=r.steps.length;if(totalSteps>1000000)throw Error('Dataset exceeds one million measurement rows. Import smaller batches.');
    if(!['running','paused','complete','not-converged','interrupted','error','imported'].includes(r.status))throw Error('Invalid experiment status.');
    for(const s of r.steps){if(!['rest','equilibrium','fracture'].includes(s.kind)||!Number.isFinite(s.strain)||!Number.isFinite(s.force)||typeof s.converged!=='boolean'||!Number.isInteger(s.sequence)||s.sequence<0)throw Error('Invalid measurement row.');for(const key of STEP_COLUMNS)if(typeof s[key]==='number'&&!Number.isFinite(s[key]))throw Error('Nonfinite measurement.');}
    if(r.notes!==undefined&&(typeof r.notes!=='string'||r.notes.length>10000))throw Error('Experiment notes are too long.');
    r.summary=summarizeExperiment(r);r.units=UNITS;
  }
  return data;
}
