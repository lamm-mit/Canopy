import {MeshoptSimplifier} from '../vendor/meshopt_simplifier.module.js';
import {inspectMesh} from './mesh-quality.js';

export function detailFields(mesh,protectJunctions){
  const v=mesh.vertices,f=mesh.faces,count=v.length/3,normals=new Float32Array(v.length),locks=new Uint8Array(count);
  for(let i=0;i<f.length;i+=3){
    const a=3*f[i],b=3*f[i+1],c=3*f[i+2],ux=v[b]-v[a],uy=v[b+1]-v[a+1],uz=v[b+2]-v[a+2],wx=v[c]-v[a],wy=v[c+1]-v[a+1],wz=v[c+2]-v[a+2],nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;
    for(const j of [a,b,c]){normals[j]+=nx;normals[j+1]+=ny;normals[j+2]+=nz;}
  }
  for(let i=0;i<v.length;i+=3){const n=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;normals[i]/=n;normals[i+1]/=n;normals[i+2]/=n;}
  if(!protectJunctions||!mesh.spec)return {normals,locks,lockedVertices:0};
  const nodes=new Map();let maxRadius=0;
  for(const s of mesh.spec.segments){const zero=s.a.every((x,k)=>x===s.b[k]);for(const p of zero?[s.a]:[s.a,s.b]){const key=p.join(':'),n=nodes.get(key)||{p,r:0,degree:0};n.r=Math.max(n.r,s.r);n.degree+=zero?0:1;nodes.set(key,n);maxRadius=Math.max(maxRadius,s.r);}}
  const cell=Math.max(.01,maxRadius*3),origin=mesh.spec.bounds.min,sx=Math.ceil((mesh.spec.bounds.max[0]-origin[0])/cell)+3,sy=Math.ceil((mesh.spec.bounds.max[1]-origin[1])/cell)+3,bins=new Map();
  const index=(i,j,k)=>i+sx*(j+sy*k);
  for(const n of nodes.values()){
    if(n.degree===2||n.degree===0)continue;const radius=n.r*1.35,lo=n.p.map((x,i)=>Math.max(0,Math.floor((x-radius-origin[i])/cell))),hi=n.p.map((x,i)=>Math.floor((x+radius-origin[i])/cell));
    n.radius2=radius*radius;
    for(let k=lo[2];k<=hi[2];k++)for(let j=lo[1];j<=hi[1];j++)for(let i=lo[0];i<=hi[0];i++){const key=index(i,j,k);if(!bins.has(key))bins.set(key,[]);bins.get(key).push(n);}
  }
  let lockedVertices=0;
  for(let i=0;i<count;i++){
    const x=v[3*i],y=v[3*i+1],z=v[3*i+2],key=index(Math.floor((x-origin[0])/cell),Math.floor((y-origin[1])/cell),Math.floor((z-origin[2])/cell));
    for(const n of bins.get(key)||[]){if((x-n.p[0])**2+(y-n.p[1])**2+(z-n.p[2])**2<=n.radius2){locks[i]=1;lockedVertices++;break;}}
  }
  return {normals,locks,lockedVertices};
}

// Normal-aware quadric edge collapse. No pruning, sloppy simplification, or
// vertex relocation: selected vertices remain on the original sampled surface.
export async function simplifyPrintMesh(mesh,options={},onProgress=()=>{}){
  const original=mesh.check||inspectMesh(mesh),originalTriangles=original.triangles;
  const bounded=(v,f,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(+v)?+v:f));
  const ratio=bounded(options.targetRatio,.2,.02,1),requestedError=bounded(options.surfaceError,.03,.001,1),effectiveError=Math.min(requestedError,(mesh.spec?.minDiameter||Infinity)*.1),normalWeight=bounded(options.normalWeight,1,0,3);
  const summary={enabled:options.simplify!==false,originalTriangles,finalTriangles:originalTriangles,targetTriangles:Math.max(4,Math.floor(originalTriangles*ratio)),requestedError,effectiveError,errorEstimate:0,lockedVertices:0,reduction:0,volumeChange:0,targetReached:false,warning:null};
  const unchanged=warning=>({...mesh,check:original,simplification:{...summary,warning}});
  if(options.simplify===false)return unchanged(null);
  if(!MeshoptSimplifier.supported)return unchanged('WebAssembly is unavailable. The original mesh was exported.');
  onProgress({phase:'Preparing detail protection',progress:.78});
  await MeshoptSimplifier.ready;
  const {normals,locks,lockedVertices}=detailFields(mesh,options.protectJunctions!==false);summary.lockedVertices=lockedVertices;
  onProgress({phase:'Simplifying smooth regions',progress:.82});
  let errorLimit=effectiveError;
  for(let attempt=0;attempt<4;attempt++){
    const [indices,errorEstimate]=MeshoptSimplifier.simplifyWithAttributes(mesh.faces,mesh.vertices,3,normals,3,[normalWeight,normalWeight,normalWeight],locks,3*summary.targetTriangles,errorLimit,['LockBorder','ErrorAbsolute']);
    const [remap,count]=MeshoptSimplifier.compactMesh(indices),positions=new Float32Array(count*3),source=new Uint32Array(count);
    for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff){const k=remap[i];source[k]=i;positions[3*k]=mesh.vertices[3*i];positions[3*k+1]=mesh.vertices[3*i+1];positions[3*k+2]=mesh.vertices[3*i+2];}
    const candidate={...mesh,vertices:positions,faces:indices};
    onProgress({phase:'Checking simplified surface',progress:.88+attempt*.02});
    const {defectVertices,...check}=inspectMesh(candidate,true),volumeChange=Math.abs(check.volume-original.volume)/Math.max(Math.abs(original.volume),1e-12);
    const valid=!check.nonManifoldEdges&&!check.orientationErrors&&check.components===original.components&&check.eulerCharacteristic===original.eulerCharacteristic&&check.degenerateTriangles<=original.degenerateTriangles&&volumeChange<=.01&&Number.isFinite(errorEstimate)&&errorEstimate<=errorLimit*1.001;
    if(valid){
      summary.finalTriangles=check.triangles;summary.errorEstimate=errorEstimate;summary.reduction=1-check.triangles/originalTriangles;summary.volumeChange=volumeChange;summary.targetReached=check.triangles<=summary.targetTriangles;summary.effectiveError=errorLimit;summary.attempts=attempt+1;
      delete summary.rejectedCheck;delete summary.rejectedVolumeChange;delete summary.rejectedErrorEstimate;
      return {...candidate,check,simplification:summary};
    }
    // Preserve the original neighborhoods that produced pinches or collapsed
    // facets, then retry from the original mesh. Never repair by deleting holes.
    onProgress({phase:'Refining topology protection',progress:.89+attempt*.02});
    if(defectVertices.length){
      const mask=new Uint8Array(locks.length);for(const i of defectVertices)mask[source[i]]=1;
      for(let ring=0;ring<2;ring++){const next=mask.slice();for(let i=0;i<mesh.faces.length;i+=3){const a=mesh.faces[i],b=mesh.faces[i+1],c=mesh.faces[i+2];if(mask[a]||mask[b]||mask[c])next[a]=next[b]=next[c]=1;}mask.set(next);}
      for(let i=0;i<mask.length;i++)if(mask[i]&&!locks[i]){locks[i]=1;summary.lockedVertices++;}
    }else errorLimit*=.5;
    if(volumeChange>.01)errorLimit*=.5;
    summary.rejectedCheck=check;summary.rejectedVolumeChange=volumeChange;summary.rejectedErrorEstimate=errorEstimate;
  }
  return unchanged('Simplification did not pass topology, orientation, or volume checks. The original mesh was exported; try a smaller error target.');
}
