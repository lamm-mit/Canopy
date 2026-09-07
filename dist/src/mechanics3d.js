// Objective spatial director beams. Six DOFs per node; exact first derivatives
// of the discrete energy by forward automatic differentiation, quasi-Newton tangent.
import {constitutive,DEFAULT_MATERIAL,DEFAULT_EXPERIMENT,FrameSolver} from './mechanics.js';
import {notchCrosses} from './geometry.js';
const N=12;
const constant=v=>({v,g:new Float64Array(N)});
const variable=(v,i)=>{const a=constant(v);a.g[i]=1;return a;};
const add=(a,b)=>{const c=constant(a.v+b.v);for(let i=0;i<N;i++)c.g[i]=a.g[i]+b.g[i];return c;};
const sub=(a,b)=>{const c=constant(a.v-b.v);for(let i=0;i<N;i++)c.g[i]=a.g[i]-b.g[i];return c;};
const mul=(a,b)=>{const c=constant(a.v*b.v);for(let i=0;i<N;i++)c.g[i]=a.g[i]*b.v+a.v*b.g[i];return c;};
const scale=(a,s)=>{const c=constant(a.v*s);for(let i=0;i<N;i++)c.g[i]=a.g[i]*s;return c;};
const unary=(a,v,derivative)=>{const c=constant(v);for(let i=0;i<N;i++)c.g[i]=a.g[i]*derivative;return c;};
const div=(a,b)=>mul(a,unary(b,1/b.v,-1/(b.v*b.v)));
const sqrt=a=>{const v=Math.sqrt(a.v);return unary(a,v,.5/v);};
const sin=a=>unary(a,Math.sin(a.v),Math.cos(a.v));
const cos=a=>unary(a,Math.cos(a.v),-Math.sin(a.v));
const atan2=(y,x)=>{const den=x.v*x.v+y.v*y.v;if(den<1e-16)throw Error('A local beam director became singular. Reduce the load.');const r=constant(Math.atan2(y.v,x.v));for(let i=0;i<N;i++)r.g[i]=(x.v*y.g[i]-y.v*x.g[i])/den;return r;};
const dot=(a,b)=>add(add(mul(a[0],b[0]),mul(a[1],b[1])),mul(a[2],b[2]));
const cross=(a,b)=>[sub(mul(a[1],b[2]),mul(a[2],b[1])),sub(mul(a[2],b[0]),mul(a[0],b[2])),sub(mul(a[0],b[1]),mul(a[1],b[0]))];
const vadd=(a,b)=>a.map((x,i)=>add(x,b[i]));
const vsub=(a,b)=>a.map((x,i)=>sub(x,b[i]));
const vmul=(a,s)=>a.map(x=>mul(x,s));
function rotate(r,v){
  const t2=dot(r,r);let a,b;
  if(t2.v<1e-8){const t4=mul(t2,t2);a=add(sub(constant(1),scale(t2,1/6)),scale(t4,1/120));b=add(sub(constant(.5),scale(t2,1/24)),scale(t4,1/720));}
  else{const theta=sqrt(t2);a=div(sin(theta),theta);b=div(sub(constant(1),cos(theta)),t2);}
  const u=v.map(constant),rv=cross(r,u);return vadd(vadd(u,vmul(rv,a)),vmul(cross(r,rv),b));
}
function bend(t,u){const c=cross(t,u),ss=dot(c,c),dp=dot(t,u);let factor;if(ss.v<1e-10&&dp.v>0)factor=add(constant(1),scale(ss,1/6));else{const s=sqrt(ss);factor=div(atan2(s,dp),s);}return vmul(c,factor);}
export function spatialElementResponse(q,e,m,withTangent=true){
  const z=q.map((v,i)=>variable(v,i)),a=z.slice(0,3),b=z.slice(6,9),ra=z.slice(3,6),rb=z.slice(9,12),chord=vsub(b,a),length=sqrt(dot(chord,chord));
  if(length.v<1e-8)throw Error('A spatial strut collapsed to zero length. Reduce the load.');
  const t=chord.map(x=>div(x,length)),strain=sub(scale(length,1/e.L),constant(1));
  const ua=rotate(ra,e.t0),ub=rotate(rb,e.t0),ba=bend(t,ua),bb=bend(t,ub),da=rotate(ra,e.n0),db=rotate(rb,e.n0),pa=vsub(da,vmul(t,dot(t,da))),pb=vsub(db,vmul(t,dot(t,db)));
  const twist=atan2(dot(t,cross(pa,pb)),dot(pa,pb)),law=constitutive(strain.v,m,e.state),A=Math.PI*e.r**2,I=Math.PI*e.r**4/4,J=2*I,G=m.model==='neo'?m.E/3:m.E/(2*(1+(m.poisson??.35))),kb=2*m.E*I/e.L,kt=G*J/e.L;
  const f=new Float64Array(N),K=withTangent?new Float64Array(N*N):null,Ma=ba.map((v,i)=>kb*(2*v.v+bb[i].v)),Mb=ba.map((v,i)=>kb*(v.v+2*bb[i].v));
  let bendEnergy=0;for(let k=0;k<3;k++)bendEnergy+=kb*(ba[k].v**2+ba[k].v*bb[k].v+bb[k].v**2);
  const torque=kt*twist.v,torsionEnergy=.5*kt*twist.v**2,energy=A*e.L*law.energy+bendEnergy+torsionEnergy;
  for(let i=0;i<N;i++){f[i]=A*e.L*law.stress*strain.g[i]+torque*twist.g[i];for(let k=0;k<3;k++)f[i]+=Ma[k]*ba[k].g[i]+Mb[k]*bb[k].g[i];}
  if(K){for(let i=0;i<N;i++)for(let j=0;j<N;j++){let x=A*e.L*law.tangent*strain.g[i]*strain.g[j]+kt*twist.g[i]*twist.g[j];for(let k=0;k<3;k++)x+=kb*(2*ba[k].g[i]*ba[k].g[j]+ba[k].g[i]*bb[k].g[j]+bb[k].g[i]*ba[k].g[j]+2*bb[k].g[i]*bb[k].g[j]);K[i*N+j]=x;}
    // Exact geometric contribution of axial force; rotational geometric terms
    // are omitted in this quasi-Newton tangent, but retained in the energy/force.
    const force=A*law.stress,unit=t.map(x=>x.v);for(const [u,su] of [[0,-1],[6,1]])for(const [v,sv] of [[0,-1],[6,1]])for(let i=0;i<3;i++)for(let j=0;j<3;j++)K[(u+i)*N+v+j]+=su*sv*force/length.v*((i===j?1:0)-unit[i]*unit[j]);
  }
  const bendingStress=Math.max(Math.hypot(...Ma),Math.hypot(...Mb))*e.r/I,normal=law.stress+bendingStress,tau=Math.abs(torque)*e.r/J,peak=Math.max(0,normal/2+Math.hypot(normal/2,tau));
  return {f,K,energy,stored:A*e.L*law.stored+bendEnergy+torsionEnergy,strain:strain.v,stress:law.stress,peak,N:A*law.stress,Ma,Mb,torque,torsionEnergy,bendEnergy,rotation:Math.max(Math.hypot(...ba.map(x=>x.v)),Math.hypot(...bb.map(x=>x.v))),law};
}
export function referenceDirections(a,b){const v=[b.x-a.x,b.y-a.y,(b.z||0)-(a.z||0)],L=Math.hypot(...v),t0=v.map(x=>x/L),idx=t0.reduce((best,x,i)=>Math.abs(x)<Math.abs(t0[best])?i:best,0),base=[0,0,0];base[idx]=1;const n0=base.map((x,i)=>x-t0[i]*t0[idx]),norm=Math.hypot(...n0);return {L,t0,n0:n0.map(x=>x/norm)};}
export function makeSpatialFrame(graph,subdivisions=2){
  const nodes=graph.nodes.map(p=>({...p,z:p.z||0})),elements=[];
  for(const edge of graph.edges){const a=nodes[edge.a],b=nodes[edge.b],ref=referenceDirections(a,b),cut=notchCrosses(graph,edge);let prev=edge.a;
    for(let i=1;i<=subdivisions;i++){let next=edge.b;if(i<subdivisions){next=nodes.length;nodes.push({x:a.x+(b.x-a.x)*i/subdivisions,y:a.y+(b.y-a.y)*i/subdivisions,z:a.z+(b.z-a.z)*i/subdivisions});}
      elements.push({a:prev,b:next,parent:edge.id,...ref,L:ref.L/subdivisions,r:edge.r,level:edge.level,active:!cut,notched:cut,state:{ep:0,alpha:0}});prev=next;
    }
  }return {nodes,elements,width:graph.width,height:graph.height,depth:graph.depth,graph};
}
export class SpatialFrameSolver{
  constructor(frame,material={},experiment={}){
    this.frame=frame;this.material={...DEFAULT_MATERIAL,poisson:.35,...material};this.experiment={...DEFAULT_EXPERIMENT,axis:'y',shearAxis:'x',...experiment};this.stride=6;
    const n=frame.nodes.length;this.q=new Float64Array(6*n);this.fixed=new Uint8Array(6*n);this.force=new Float64Array(6*n);this.external=new Float64Array(6*n);this.diag=new Float64Array(6*n);
    frame.nodes.forEach((p,i)=>{this.q[6*i]=p.x;this.q[6*i+1]=p.y;this.q[6*i+2]=p.z||0;});
    this.bottom=[];this.top=[];this.iterations=0;this.stepIterations=0;this.strain=0;this.broken=new Set();this.deletedEnergy=0;this.plasticDissipation=0;this.history=[];this.results=[];this.status='ready';this.residual=0;this.reaction=0;
    this.axis=['x','y','z'].indexOf(this.experiment.axis);if(this.axis<0)this.axis=1;this.shearAxis=['x','y','z'].indexOf(this.experiment.shearAxis);if(this.shearAxis<0||this.shearAxis===this.axis)this.shearAxis=(this.axis+1)%3;
    this.extents=[frame.width,frame.height,frame.depth];this.length=this.extents[this.axis];this.area=this.extents[(this.axis+1)%3]*this.extents[(this.axis+2)%3];
    frame.nodes.forEach((p,i)=>{const v=[p.x,p.y,p.z||0][this.axis];if(v<1e-5)this.bottom.push(i);if(v>this.length-1e-5)this.top.push(i);});
    for(const i of this.bottom)for(let k=0;k<6;k++)this.fixed[6*i+k]=1;
    for(const i of this.top){this.fixed[6*i+this.axis]=1;for(let k=3;k<6;k++)this.fixed[6*i+k]=1;if(this.experiment.mode==='shear')this.fixed[6*i+this.shearAxis]=1;}
    this.scale=Math.min(frame.graph?.tileW/(frame.graph?.design.columns||1)||10,frame.graph?.tileD/(frame.graph?.design.slices||1)||10);this.setLoad(0);this.assemble(false);
  }
  setLoad(strain){this.strain=strain;const mode=this.experiment.mode,sign=mode==='compression'?-1:1;for(const i of this.top){this.q[6*i+this.axis]=this.length+(mode==='shear'?0:sign*strain*this.length);if(mode==='shear'){const p=this.frame.nodes[i];this.q[6*i+this.shearAxis]=[p.x,p.y,p.z][this.shearAxis]+strain*this.length;}}this.stepIterations=0;this.status='solving';}
  assemble(tangent=true,q=this.q){
    const f=new Float64Array(q.length),diag=new Float64Array(q.length),local=[],results=[];let energy=0,stored=0,peak=0,rotation=0,torsionEnergy=0;
    for(const e of this.frame.elements){if(!e.active){results.push(null);local.push(null);continue;}const ids=[...Array.from({length:6},(_,i)=>6*e.a+i),...Array.from({length:6},(_,i)=>6*e.b+i)],r=spatialElementResponse(ids.map(i=>q[i]),e,this.material,tangent);
      energy+=r.energy;stored+=r.stored;peak=Math.max(peak,r.peak);rotation=Math.max(rotation,r.rotation);torsionEnergy+=r.torsionEnergy;for(let j=0;j<12;j++){f[ids[j]]+=r.f[j];if(tangent)diag[ids[j]]+=Math.abs(r.K[j*12+j]);}local.push(tangent?{ids,K:r.K}:null);results.push(r);
    }
    for(let i=0;i<f.length;i++){f[i]-=this.external[i];energy-=this.external[i]*q[i];}
    if(q===this.q){this.force=f;this.diag=diag;this.local=local;this.results=results;this.energy=energy;this.stored=stored;this.peak=peak;this.rotation=rotation;this.torsionEnergy=torsionEnergy;const axis=this.experiment.mode==='shear'?this.shearAxis:this.axis;this.reaction=this.top.reduce((s,i)=>s+f[6*i+axis],0);let residual=0;for(let i=0;i<f.length;i++)if(!this.fixed[i])residual=Math.max(residual,Math.abs(f[i])/(i%6>=3?this.scale:1));this.absoluteResidual=residual;this.residual=residual/Math.max(Math.abs(this.reaction),1e-3);}
    return {energy,f,results};
  }
  // Shared sparse solver and irreversible state updates, generalized by local DOF count.
  preconditioner(){return FrameSolver.prototype.preconditioner.call(this);}
  direction(){return FrameSolver.prototype.direction.call(this);}
  iterate(){return FrameSolver.prototype.iterate.call(this);}
  commit(){return FrameSolver.prototype.commit.call(this);}
  hasLoadPath(){return FrameSolver.prototype.hasLoadPath.call(this);}
  measure(){const sign=this.experiment.mode==='compression'?-1:1;return {strain:this.strain,displacement:this.strain*this.length,force:sign*this.reaction,nominalStress:sign*this.reaction/this.area,storedEnergy:this.stored,torsionEnergy:this.torsionEnergy,deletedElasticEnergy:this.deletedEnergy,plasticDissipation:this.plasticDissipation,broken:this.broken.size,residual:this.residual,iterations:this.iterations,converged:this.status==='equilibrium'};}
  snapshot(){const positions=new Float64Array(this.frame.nodes.length*3);let maxOutOfPlane=0;for(let i=0;i<this.frame.nodes.length;i++)for(let k=0;k<3;k++){positions[3*i+k]=this.q[6*i+k];if(k===2)maxOutOfPlane=Math.max(maxOutOfPlane,Math.abs(this.q[6*i+k]-(this.frame.nodes[i].z||0)));}return {q:this.q.slice(),positions,dofs:6,dimension:3,axis:this.axis,shearAxis:this.shearAxis,maxOutOfPlane,strains:Float32Array.from(this.results,r=>r?.strain||0),stresses:Float32Array.from(this.results,r=>r?.peak||0),torques:Float32Array.from(this.results,r=>r?.torque||0),active:Uint8Array.from(this.frame.elements,e=>e.active?1:0),status:this.status,rotation:this.rotation,loadPath:this.hasLoadPath(),...this.measure(),history:this.history};}
}
