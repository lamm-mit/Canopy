// 2D corotational Euler-Bernoulli frames: x, y, and rotation per node.
// N, mm, MPa. The same element routine serves the solver and verification suite.
import {notchCrosses} from './geometry.js';
export const DEFAULT_MATERIAL={model:'linear',E:1200,poisson:.35,yieldStress:24,hardening:0.03,strength:48,fracture:false};
export const DEFAULT_EXPERIMENT={mode:'tension',axis:'y',shearAxis:'x',target:0.02,increment:0.002,subdivisions:2,tolerance:1e-4,maxIterations:140};
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function constitutive(strain,m,state={ep:0,alpha:0}){
  const E=m.E;
  if(m.model==='neo'){
    const l=1+strain;if(l<=.08)return {stress:-1e20,tangent:1e20,energy:1e20,ep:0,alpha:0,stored:1e20};
    const mu=E/3,energy=mu/2*(l*l+2/l-3);
    return {stress:mu*(l-1/(l*l)),tangent:mu*(1+2/(l*l*l)),energy,stored:energy,ep:0,alpha:0};
  }
  if(m.model==='plastic'){
    const H=E*m.hardening/(1-m.hardening),trial=E*(strain-state.ep),sg=Math.sign(trial),f=Math.abs(trial)-m.yieldStress-H*state.alpha,dg=Math.max(0,f/(E+H)),ep=state.ep+sg*dg,alpha=state.alpha+dg;
    const stress=E*(strain-ep),stored=.5*stress*stress/E+.5*H*alpha*alpha;
    return {stress,tangent:dg>0?E*H/(E+H):E,energy:stored+m.yieldStress*dg,stored,ep,alpha};
  }
  const energy=.5*E*strain*strain;return {stress:E*strain,tangent:E,energy,stored:energy,ep:0,alpha:0};
}
export function elementResponse(q,e,m,withTangent=true){
  const dx=q[3]-q[0],dy=q[4]-q[1],l=Math.hypot(dx,dy),c=dx/l,s=dy/l;
  if(l<1e-9)throw Error('A beam collapsed to zero length. Reduce the load increment.');
  const phi=wrap(Math.atan2(dy,dx)-e.phi),a=wrap(q[2]-phi),b=wrap(q[5]-phi);
  const strain=l/e.L-1,law=constitutive(strain,m,e.state),A=Math.PI*e.r**2,I=Math.PI*e.r**4/4,kb=2*m.E*I/e.L;
  const N=A*law.stress,Ma=kb*(2*a+b),Mb=kb*(a+2*b),S=Ma+Mb;
  const B=[[-c,-s,0,c,s,0],[-s/l,c/l,1,s/l,-c/l,0],[-s/l,c/l,0,s/l,-c/l,1]];
  const f=new Float64Array(6);for(let i=0;i<6;i++)f[i]=B[0][i]*N+B[1][i]*Ma+B[2][i]*Mb;
  const bend=kb*(a*a+a*b+b*b),energy=A*e.L*law.energy+bend;
  const stress=law.stress,peak=Math.max(0,stress)+Math.max(Math.abs(Ma),Math.abs(Mb))*e.r/I;
  let K=null;
  if(withTangent){K=new Float64Array(36);const ka=A*law.tangent/e.L;
    for(let i=0;i<6;i++)for(let j=0;j<6;j++)K[6*i+j]=ka*B[0][i]*B[0][j]+kb*(2*B[1][i]*B[1][j]+B[1][i]*B[2][j]+B[2][i]*B[1][j]+2*B[2][i]*B[2][j]);
    const H=[N*s*s/l-S*2*c*s/(l*l),-N*c*s/l-S*(s*s-c*c)/(l*l),N*c*c/l+S*2*c*s/(l*l)];
    for(const [u,su] of [[0,-1],[3,1]])for(const [v,sv] of [[0,-1],[3,1]]){K[6*u+v]+=su*sv*H[0];K[6*u+v+1]+=su*sv*H[1];K[6*(u+1)+v]+=su*sv*H[1];K[6*(u+1)+v+1]+=su*sv*H[2];}
  }
  return {f,K,energy,stored:A*e.L*law.stored+bend,strain,stress,peak,N,Ma,Mb,rotation:Math.max(Math.abs(a),Math.abs(b)),law};
}
export function makeFrame(graph,subdivisions=2){
  const nodes=graph.nodes.map(p=>({...p})),elements=[];
  for(const edge of graph.edges){const a=nodes[edge.a],b=nodes[edge.b],L=Math.hypot(b.x-a.x,b.y-a.y),cut=notchCrosses(graph,edge);let prev=edge.a;
    for(let i=1;i<=subdivisions;i++){let next=edge.b;if(i<subdivisions){next=nodes.length;nodes.push({x:a.x+(b.x-a.x)*i/subdivisions,y:a.y+(b.y-a.y)*i/subdivisions});}
      elements.push({a:prev,b:next,parent:edge.id,L:L/subdivisions,phi:Math.atan2(b.y-a.y,b.x-a.x),r:edge.r,level:edge.level,active:!cut,notched:cut,state:{ep:0,alpha:0}});prev=next;
    }
  }
  return {nodes,elements,width:graph.width,height:graph.height,graph};
}
export class FrameSolver{
  constructor(frame,material={},experiment={}){
    this.frame=frame;this.stride=3;this.material={...DEFAULT_MATERIAL,...material};this.experiment={...DEFAULT_EXPERIMENT,...experiment};
    const n=frame.nodes.length;this.q=new Float64Array(3*n);this.fixed=new Uint8Array(3*n);this.force=new Float64Array(3*n);this.external=new Float64Array(3*n);this.diag=new Float64Array(3*n);
    frame.nodes.forEach((p,i)=>{this.q[3*i]=p.x;this.q[3*i+1]=p.y;});
    this.bottom=[];this.top=[];this.iterations=0;this.stepIterations=0;this.strain=0;this.broken=new Set();this.deletedEnergy=0;this.plasticDissipation=0;this.history=[];this.results=[];this.status='ready';this.residual=0;this.reaction=0;
    frame.nodes.forEach((p,i)=>{if(p.y<1e-5)this.bottom.push(i);if(p.y>frame.height-1e-5)this.top.push(i);});
    for(const i of this.bottom){this.fixed[3*i]=1;this.fixed[3*i+1]=1;this.fixed[3*i+2]=1;}
    for(const i of this.top){this.fixed[3*i+1]=1;this.fixed[3*i+2]=1;if(this.experiment.mode==='shear')this.fixed[3*i]=1;}
    this.scale=frame.graph?.tileW/(frame.graph?.design.columns||5)||10;
    this.setLoad(0);this.assemble(false);
  }
  setLoad(strain){
    this.strain=strain;const mode=this.experiment.mode,sign=mode==='compression'?-1:1;
    for(const i of this.top){this.q[3*i+1]=this.frame.height+(mode==='shear'?0:sign*strain*this.frame.height);if(mode==='shear')this.q[3*i]=this.frame.nodes[i].x+strain*this.frame.height;}
    this.stepIterations=0;this.status='solving';
  }
  assemble(tangent=true,q=this.q){
    const f=new Float64Array(q.length),diag=new Float64Array(q.length),local=[],results=[];let energy=0,stored=0,peak=0,rotation=0;
    for(const e of this.frame.elements){if(!e.active){results.push(null);local.push(null);continue;}
      const ids=[3*e.a,3*e.a+1,3*e.a+2,3*e.b,3*e.b+1,3*e.b+2],v=ids.map(i=>q[i]);
      const r=elementResponse(v,e,this.material,tangent);energy+=r.energy;stored+=r.stored;peak=Math.max(peak,r.peak);rotation=Math.max(rotation,r.rotation);
      for(let j=0;j<6;j++){f[ids[j]]+=r.f[j];if(tangent)diag[ids[j]]+=Math.abs(r.K[j*6+j]);}
      local.push(tangent?{ids,K:r.K}:null);results.push(r);
    }
    for(let i=0;i<f.length;i++){f[i]-=this.external[i];energy-=this.external[i]*q[i];}
    if(q===this.q){
      this.force=f;this.diag=diag;this.local=local;this.results=results;this.energy=energy;this.stored=stored;this.peak=peak;this.rotation=rotation;
      const axis=this.experiment.mode==='shear'?0:1;this.reaction=this.top.reduce((s,i)=>s+f[3*i+axis],0);
      let residual=0;for(let i=0;i<f.length;i++)if(!this.fixed[i])residual=Math.max(residual,Math.abs(f[i])/(i%3===2?this.scale:1));
      this.absoluteResidual=residual;this.residual=residual/Math.max(Math.abs(this.reaction),1e-3);
    }return {energy,f,results};
  }
  preconditioner(){
    // Incomplete Cholesky on the actual sparsity pattern, diagonally scaled.
    // This resolves the severe axial/bending conditioning of slender hierarchies.
    const n=this.q.length,rows=Array.from({length:n},()=>new Map()),scale=Float64Array.from(this.diag,d=>Math.sqrt(Math.max(d,1e-12)));
    for(const item of this.local){if(!item)continue;const {ids,K}=item,d=ids.length;for(let i=0;i<d;i++){const a=ids[i];if(this.fixed[a])continue;for(let j=0;j<d;j++){const b=ids[j];if(b>a||this.fixed[b])continue;rows[a].set(b,(rows[a].get(b)||0)+K[d*i+j]);}}}
    const indices=[],values=[],diag=new Float64Array(n);
    for(let i=0;i<n;i++){
      const keys=[...rows[i].keys()].filter(j=>j<i).sort((a,b)=>a-b),vals=new Float64Array(keys.length);let sq=0;
      for(let k=0;k<keys.length;k++){
        const j=keys[k];let s=rows[i].get(j)/(scale[i]*scale[j]),a=0,b=0;const kj=indices[j],vj=values[j];
        while(a<k&&b<kj.length){if(keys[a]===kj[b]){s-=vals[a]*vj[b];a++;b++;}else if(keys[a]<kj[b])a++;else b++;}
        vals[k]=s/diag[j];sq+=vals[k]*vals[k];
      }
      indices.push(keys);values.push(vals);diag[i]=Math.sqrt(Math.max(.03,(rows[i].get(i)||scale[i]*scale[i])/(scale[i]*scale[i])-sq));
    }
    return r=>{
      const z=new Float64Array(n);
      for(let i=0;i<n;i++){let s=this.fixed[i]?0:r[i]/scale[i];const ids=indices[i],v=values[i];for(let j=0;j<ids.length;j++)s-=v[j]*z[ids[j]];z[i]=s/diag[i];}
      for(let i=n-1;i>=0;i--){z[i]/=diag[i];const ids=indices[i],v=values[i];for(let j=0;j<ids.length;j++)z[ids[j]]-=v[j]*z[i];}
      for(let i=0;i<n;i++)z[i]=this.fixed[i]?0:z[i]/scale[i];return z;
    };
  }
  direction(){
    const n=this.q.length,r=new Float64Array(n),z=new Float64Array(n),p=new Float64Array(n),x=new Float64Array(n),Ap=new Float64Array(n);
    const maxdiag=Math.max(...this.diag.subarray(0,Math.min(n,20000))),floor=Math.max(1e-12,maxdiag*1e-12);
    const precondition=this.preconditioner();
    for(let i=0;i<n;i++)if(!this.fixed[i])r[i]=-this.force[i];z.set(precondition(r));
    let rz=0;for(let i=0;i<n;i++){p[i]=z[i];rz+=r[i]*z[i];}
    const initial=rz;if(initial===0)return x;
    for(let it=0;it<Math.min(n,650);it++){
      Ap.fill(0);for(const item of this.local){if(!item)continue;const {ids,K}=item,d=ids.length;for(let i=0;i<d;i++){let a=0;for(let j=0;j<d;j++)a+=K[d*i+j]*p[ids[j]];Ap[ids[i]]+=a;}}
      let pAp=0;for(let i=0;i<n;i++){if(this.fixed[i])Ap[i]=0;else Ap[i]+=1e-10*Math.max(this.diag[i],floor)*p[i];pAp+=p[i]*Ap[i];}
      if(pAp<=1e-30){if(it===0)for(let i=0;i<n;i++)x[i]=z[i];break;}
      const alpha=rz/pAp;for(let i=0;i<n;i++){x[i]+=alpha*p[i];r[i]-=alpha*Ap[i];}z.set(precondition(r));let next=0;for(let i=0;i<n;i++)next+=r[i]*z[i];
      if(next<initial*1e-10)break;const beta=next/rz;for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];rz=next;
    }return x;
  }
  iterate(){
    this.assemble(true);this.iterations++;this.stepIterations++;
    if(this.residual<=this.experiment.tolerance||this.absoluteResidual<1e-8){this.status='equilibrium';return true;}
    if(this.stepIterations>this.experiment.maxIterations){this.status='not-converged';return true;}
    let direction=this.direction(),slope=0;for(let i=0;i<direction.length;i++)slope+=direction[i]*this.force[i];
    if(!Number.isFinite(slope)||slope>=0){direction=this.force.map((f,i)=>this.fixed[i]?0:-f/Math.max(this.diag[i],1e-9));slope=direction.reduce((s,x,i)=>s+x*this.force[i],0);}
    let alpha=1,max=0;const stride=this.stride||3;for(let i=0;i<direction.length;i++)max=Math.max(max,Math.abs(direction[i])/(i%stride>=(stride===6?3:2)?.25:this.scale*.3));if(max>1)alpha=1/max;
    const candidate=new Float64Array(this.q.length);let accepted=false;
    for(let bt=0;bt<20;bt++){
      for(let i=0;i<candidate.length;i++)candidate[i]=this.q[i]+alpha*direction[i];
      let energy=Infinity;try{energy=this.assemble(false,candidate).energy;}catch{}
      if(Number.isFinite(energy)&&energy<=this.energy+1e-4*alpha*slope+1e-13*Math.max(1,Math.abs(this.energy))){this.q.set(candidate);accepted=true;break;}alpha*=.5;
    }
    if(!accepted){this.status='not-converged';return true;}return false;
  }
  commit(){
    this.assemble(false);
    // History variables are committed only at a converged displacement step.
    for(let i=0;i<this.frame.elements.length;i++){const e=this.frame.elements[i],r=this.results[i];if(!r)continue;this.plasticDissipation+=Math.PI*e.r**2*e.L*this.material.yieldStress*Math.max(0,r.law.alpha-e.state.alpha);e.state={ep:r.law.ep,alpha:r.law.alpha};}
    if(this.material.fracture){
      let worst=null,ratio=1;for(let i=0;i<this.results.length;i++){const r=this.results[i];if(r&&r.peak/this.material.strength>ratio){ratio=r.peak/this.material.strength;worst=this.frame.elements[i].parent;}}
      if(worst!==null){for(let i=0;i<this.frame.elements.length;i++){const e=this.frame.elements[i];if(e.parent===worst&&e.active){this.deletedEnergy+=this.results[i]?.stored||0;e.active=false;}}this.broken.add(worst);this.stepIterations=0;this.status='solving';return false;}
    }
    const row=this.measure();this.history.push(row);return true;
  }
  measure(){
    const sign=this.experiment.mode==='compression'?-1:1,radius=this.frame.graph?.design.radius||this.frame.elements[0]?.r||1;
    return {strain:this.strain,displacement:this.strain*this.frame.height,force:sign*this.reaction,nominalStress:sign*this.reaction/(this.frame.width*2*radius),storedEnergy:this.stored,deletedElasticEnergy:this.deletedEnergy,plasticDissipation:this.plasticDissipation,broken:this.broken.size,residual:this.residual,iterations:this.iterations,converged:this.status==='equilibrium'};
  }
  hasLoadPath(){
    const adjacency=Array.from({length:this.frame.nodes.length},()=>[]);
    for(const e of this.frame.elements)if(e.active){adjacency[e.a].push(e.b);adjacency[e.b].push(e.a);}
    const seen=new Set(this.bottom),queue=[...this.bottom],top=new Set(this.top);
    for(let k=0;k<queue.length;k++){const a=queue[k];if(top.has(a))return true;for(const b of adjacency[a])if(!seen.has(b)){seen.add(b);queue.push(b);}}
    return false;
  }
  snapshot(){
    const positions=new Float64Array(this.frame.nodes.length*3);for(let i=0;i<this.frame.nodes.length;i++){positions[3*i]=this.q[3*i];positions[3*i+1]=this.q[3*i+1];}return {q:this.q.slice(),positions,dofs:3,dimension:2,strains:Float32Array.from(this.results,r=>r?.strain||0),stresses:Float32Array.from(this.results,r=>r?.peak||0),active:Uint8Array.from(this.frame.elements,e=>e.active?1:0),status:this.status,rotation:this.rotation,loadPath:this.hasLoadPath(),...this.measure(),history:this.history};
  }
}
