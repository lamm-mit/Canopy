// Replay stores solved states, never solver iterations or constitutive state.
export const RECORDING_LIMIT = 128 * 1024 * 1024;
export const FRAME_LIMIT = 10000;
const arrays = {positions: Float64Array, stresses: Float32Array, strains: Float32Array, active: Uint8Array};
const scalars = ['status','dimension','dofs','axis','shearAxis','strain','displacement','force','nominalStress','storedEnergy','torsionEnergy','deletedElasticEnergy','plasticDissipation','broken','residual','iterations','converged','rotation','loadPath','maxOutOfPlane','kind','historyCount'];
const magic = new TextEncoder().encode('CANOPYR1');

export function compactFrame(state, kind = 'equilibrium') {
  const frame = {};
  for (const key of scalars) if (state[key] !== undefined) frame[key] = state[key];
  for (const [key, Type] of Object.entries(arrays)) frame[key] = new Type(state[key]);
  frame.kind = kind;
  frame.historyCount = state.history?.length ?? state.historyCount ?? 0;
  return frame;
}

export class ExperimentRecording {
  constructor(limit = RECORDING_LIMIT) { this.frames = []; this.bytes = 0; this.limit = limit; this.full = false; }
  append(frame) {
    const bytes = Object.keys(arrays).reduce((n,k) => n + frame[k].byteLength, 512);
    if (this.full || this.bytes + bytes > this.limit || this.frames.length >= FRAME_LIMIT) { this.full = true; return false; }
    this.frames.push(frame); this.bytes += bytes; return true;
  }
}

// The timeline is ordered by solve sequence, so unloading and same-load fracture cascades survive.
export function sampleRecording(frames, cursor, smooth = false) {
  if (!frames.length) return null;
  const x = Math.max(0, Math.min(frames.length - 1, Number(cursor) || 0)), i = Math.floor(x), a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)], t = x - i;
  // A topology change is a discrete event. Never morph an intact member into a failed member.
  if (!smooth || t < 1e-8 || a === b || a.active.some((v,k) => v !== b.active[k])) return a;
  const positions = new Float64Array(a.positions.length);
  for (let j = 0; j < positions.length; j++) positions[j] = a.positions[j] + t * (b.positions[j] - a.positions[j]);
  // Readouts, colors, and chart cursor remain the preceding measured equilibrium.
  return {...a, positions, interpolated: true};
}

export function movieSchedule(frameCount, duration, fps) {
  if (!Number.isInteger(frameCount) || frameCount < 2 || ![15,24,30].includes(fps) || !Number.isFinite(duration) || duration < 2 || duration > 120) throw Error('Choose 2–120 seconds and 15, 24, or 30 fps.');
  // At least one movie frame per recorded event prevents skipping narrow fracture cascades.
  const count = Math.max(Math.round(duration * fps), frameCount);
  return {count, duration: count / fps, fps, cursor: i => Math.min(frameCount - 1, Math.max(0,i) * (frameCount - 1) / (count - 1))};
}

export function encodeRecording(recording, metadata) {
  if (!recording.frames.length) throw Error('Run an experiment before saving a replay.');
  const rows = recording.frames.map(f => Object.fromEntries(scalars.filter(k => f[k] !== undefined).map(k => [k,f[k]])));
  const header = new TextEncoder().encode(JSON.stringify({format:'canopy-replay',version:1,metadata,rows,full:recording.full}));
  if(header.length>16*1024*1024)throw Error('Replay metadata exceeds 16 MiB. Save the measurement dataset in smaller batches.');
  const padded = Math.ceil(header.length / 8) * 8, prefix = new Uint8Array(16 + padded);
  prefix.set(magic); new DataView(prefix.buffer).setUint32(8,header.length,true); prefix.set(header,16);
  // Blob parts avoid a second complete allocation of a large recording.
  const parts = [prefix];
  for (const frame of recording.frames) for (const key of Object.keys(arrays)) { const a=frame[key]; parts.push(a); const pad=(8-a.byteLength%8)%8; if(pad)parts.push(new Uint8Array(pad)); }
  return new Blob(parts,{type:'application/octet-stream'});
}

export function decodeRecording(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16 || buffer.byteLength > RECORDING_LIMIT + 16*1024*1024) throw Error('Invalid replay size (maximum 144 MiB).');
  const bytes = new Uint8Array(buffer);
  if (!magic.every((v,i) => bytes[i] === v)) throw Error('Choose a .canopy-replay file saved by Canopy.');
  const length = new DataView(buffer).getUint32(8,true);
  if (length > 16*1024*1024 || 16+length > buffer.byteLength) throw Error('Invalid replay header.');
  const data = JSON.parse(new TextDecoder().decode(bytes.subarray(16,16+length))), m = data.metadata, rows = data.rows;
  if (data.format !== 'canopy-replay' || data.version !== 1 || !m?.graph || !m.design || !m.material || !m.experiment || !Array.isArray(rows) || !rows.length || rows.length > FRAME_LIMIT) throw Error('Unsupported or incomplete replay.');
  const g = m.graph, nodes = m.nodes, elements = m.elements;
  if (![2,3].includes(g.dimension) || ![g.width,g.height,g.depth??0].every(v=>Number.isFinite(v)&&v>=0&&v<=10000) || !g.width || !g.height || !g.design || !g.stats || !Array.isArray(g.nodes) || !Array.isArray(g.edges) || !Array.isArray(nodes) || !Array.isArray(elements) || !nodes.length || !elements.length || nodes.length > 150000 || elements.length > 200000) throw Error('Invalid replay mesh.');
  for (const list of [g.nodes,nodes]) for (const n of list) if (![n.x,n.y,n.z??0].every(v=>Number.isFinite(v)&&Math.abs(v)<1e6)) throw Error('Invalid node coordinate.');
  for (const [list, count] of [[g.edges,g.nodes.length],[elements,nodes.length]]) for (const e of list) if (![e.a,e.b].every(i=>Number.isInteger(i)&&i>=0&&i<count) || !Number.isFinite(e.r) || e.r<=0 || e.r>1000) throw Error('Invalid beam connection.');
  if (!['linear','neo','plastic'].includes(m.material.model) || !['tension','compression','shear'].includes(m.experiment.mode) || !Number.isFinite(m.material.E) || m.material.E<=0 || ![1,2,3].includes(m.experiment.subdivisions) || !Number.isFinite(m.experiment.target) || m.experiment.target<=0 || m.experiment.target>.35) throw Error('Invalid replay parameters.');
  for(const [key,lo,hi] of [['E',.1,250000],['strength',.01,10000],['yieldStress',.01,5000],['hardening',.001,.3],['poisson',-.5,.5]])if(m.material[key]!==undefined&&(!Number.isFinite(m.material[key])||m.material[key]<lo||m.material[key]>hi))throw Error('Invalid replay material.');
  if(!['x','y','z'].includes(m.experiment.axis)||!['x','y','z'].includes(m.experiment.shearAxis)||!Number.isFinite(m.experiment.increment)||m.experiment.increment<.0005||m.experiment.increment>.005)throw Error('Invalid replay loading protocol.');
  if(m.print&&(!['round','nodes','ribbon'].includes(m.print.profile)||Object.values(m.print).some(v=>typeof v==='number'&&!Number.isFinite(v))))throw Error('Invalid replay print settings.');
  if(m.history!==undefined&&(!Array.isArray(m.history)||m.history.length>100000||m.history.some(p=>!Number.isFinite(p.strain)||!Number.isFinite(p.force))))throw Error('Invalid replay response history.');
  let offset = 16 + Math.ceil(length/8)*8;
  const recording = new ExperimentRecording();
  for (const row of rows) {
    const f={};
    for (const k of scalars) if(row[k]!==undefined) f[k]=row[k];
    if (!['rest','equilibrium','fracture'].includes(f.kind) || !['ready','equilibrium','solving'].includes(f.status) || (f.status==='solving'&&f.kind!=='fracture') || !Number.isFinite(f.strain) || !Number.isFinite(f.force) || !Number.isInteger(f.broken) || f.broken<0 || !Number.isInteger(f.historyCount) || f.historyCount<0) throw Error('Invalid recorded state.');
    for(const value of Object.values(f)) if(typeof value==='number'&&!Number.isFinite(value)) throw Error('Nonfinite recorded value.');
    for (const [key, Type] of Object.entries(arrays)) {
      const count=key==='positions'?3*nodes.length:elements.length, size=count*Type.BYTES_PER_ELEMENT;
      if (offset+size>buffer.byteLength) throw Error('Replay is truncated.');
      // Views retain one input buffer; no duplicated per-frame memory on import.
      const a = new Type(buffer,offset,count);
      if (!a.every(v=>Number.isFinite(v)&&(key!=='active'||v===0||v===1))) throw Error('Invalid recorded field.');
      f[key]=a; offset+=Math.ceil(size/8)*8;
    }
    if(!recording.append(f)) throw Error('Replay exceeds the recording memory limit.');
  }
  if(offset!==buffer.byteLength) throw Error('Unexpected trailing replay data.');
  recording.full=!!data.full;
  return {recording,metadata:m};
}
