import {Zip,ZipDeflate,unzipSync,strToU8,strFromU8} from '../vendor/fflate.js';
import {APP_VERSION,DATA_VERSION,UNITS,STEP_COLUMNS,SUMMARY_FIELDS,recordsCSV,jsonStringify,validateDataset} from './experiment-data.js';
import {decodeRecording} from './replay.js';
export const DATA_LIMIT=512*1024*1024;
export async function exportDataset(records,replays=new Map(),onProgress=()=>{}){
  const dataset={format:'canopy-dataset',schemaVersion:DATA_VERSION,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),units:UNITS,experiments:records};
  const files=[['dataset.json',new Blob([jsonStringify(dataset)])],['summary.csv',new Blob([recordsCSV(records,true)])],['measurements.csv',new Blob([recordsCSV(records)])],['schema.json',new Blob([jsonStringify({schemaVersion:DATA_VERSION,units:UNITS,stepColumns:STEP_COLUMNS,summaryFields:SUMMARY_FIELDS,missing:'null means not observed or not available',strain:'All stored strain values are fractions. UI plots use percent.',stress:'In 3D, nominalStress is reaction divided by full envelope area normal to the load axis. In planar mode the assumed area is specimen width times primary strut diameter. maxMemberStressMPa is the maximum tensile member criterion, including bending and (in 3D) torsion.',rupture:'Rupture metrics refer to discrete strut failures. separationStrain refers to loss of a spanning graph path, not a calibrated continuum crack criterion.',replay:'replays/<experiment ID>.canopy-replay contains exact Float64 positions, Float32 stress/strain, and member activity for retained states. See docs/REPLAY.md.',timing:'Quasi-static load sequence. Wall-clock timing is not physical simulation time.'},2)])]];
  for(const r of records)if(replays.has(r.id))files.push([`replays/${r.id}.canopy-replay`,replays.get(r.id)]);
  const size=files.reduce((n,f)=>n+f[1].size,0);if(size>DATA_LIMIT)throw Error('This dataset exceeds 512 MiB before compression. Export selected experiments in batches.');
  return new Promise(async(resolve,reject)=>{
    const parts=[],zip=new Zip((error,data,final)=>{if(error){reject(error);return;}parts.push(data);if(final)resolve(new Blob(parts,{type:'application/zip'}));});
    try{let i=0;for(const [name,blob] of files){const file=new ZipDeflate(name,{level:1});zip.add(file);const reader=blob.stream().getReader();while(true){const {value,done}=await reader.read();if(done)break;file.push(value,false);}file.push(new Uint8Array(),true);onProgress(++i/files.length);}zip.end();}catch(error){zip.terminate();reject(error);}
  });
}
export function importDataset(buffer,isJSON=false){
  if(buffer.byteLength>DATA_LIMIT)throw Error('Import files must be smaller than 512 MiB.');
  let data,files={};
  if(isJSON)data=JSON.parse(new TextDecoder().decode(buffer));
  else{
    let expanded=0;
    files=unzipSync(new Uint8Array(buffer),{filter:file=>{const known=file.name==='dataset.json'||/^replays\/[\w-]{1,90}\.canopy-replay$/.test(file.name);if(!known)return false;expanded+=file.originalSize;if(file.originalSize>DATA_LIMIT||expanded>DATA_LIMIT)throw Error('Expanded dataset exceeds 512 MiB.');return true;}});
    if(!files['dataset.json'])throw Error('This ZIP does not contain a Canopy dataset.json.');data=JSON.parse(strFromU8(files['dataset.json']));
  }
  validateDataset(data);const replays=new Map();
  for(const record of data.experiments){const raw=files[`replays/${record.id}.canopy-replay`];if(raw){const buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),loaded=decodeRecording(buffer);if(loaded.metadata.graph.nodes.length!==record.graph.nodes?.length||loaded.metadata.graph.edges.length!==record.graph.edges?.length)throw Error('Replay mesh does not match its experiment record.');replays.set(record.id,new Blob([raw]));}else if(record.replay?.frames){record.replay={...record.replay,missing:true};}}
  return {records:data.experiments,replays};
}
