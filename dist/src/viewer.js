import * as THREE from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {notchCrosses} from './geometry.js';
import {displayPoint,deformationBounds,normalizeDisplacementScale,captureWithDisplacementLabel} from './deformation-view.js';
export class SpecimenViewer{
  constructor(container){
    this.container=container;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#f2f5ee');
    this.camera=new THREE.OrthographicCamera(-60,60,60,-60,.1,1500);this.camera.position.set(65,32,160);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor('#f2f5ee');this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.appendChild(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.1;this.controls.minZoom=.2;this.controls.maxZoom=7;this.controls.enablePan=true;
    this.scene.add(new THREE.HemisphereLight('#ffffff','#8b9a70',2.5));const key=new THREE.DirectionalLight('#fffef4',3.4);key.position.set(-40,70,100);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-180;key.shadow.camera.right=180;key.shadow.camera.top=180;key.shadow.camera.bottom=-180;key.shadow.bias=-.001;this.scene.add(key);this.scene.add(new THREE.AmbientLight('#fff',.2));
    this.group=new THREE.Group();this.scene.add(this.group);this.decor=new THREE.Group();this.scene.add(this.decor);this.field='material';this.ghost=false;this.displacementScale=1;this.temp=new THREE.Object3D();this.color=new THREE.Color();this.up=new THREE.Vector3(0,1,0);this.dir=new THREE.Vector3();this.viewMode='iso';
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.animate();
  }
  clear(group){while(group.children.length){const c=group.children[0];group.remove(c);c.geometry?.dispose();if(Array.isArray(c.material))c.material.forEach(x=>x.dispose());else c.material?.dispose();}}
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.aspect=w/h;this.fit(false);}
  fit(reset=true,preserveView=false){
    if(!this.printMode&&this.graph&&this.state?.positions&&this.displacementScale>1){
      const {min,max}=deformationBounds(this.nodes,this.state.positions,this.displacementScale,this.graph,this.getFitFrames?.()||[]),origin=[this.graph.width/2,this.graph.height/2,(this.graph.depth||0)/2];
      const center=new THREE.Vector3(...min.map((x,k)=>(x+max[k])/2-origin[k]));
      const radius=Math.max(12,Math.hypot(...max.map((x,k)=>x-min[k]))/2+3*(this.graph.design.radius||1));
      const half=radius*1.12/Math.min(1,this.aspect||1),direction=preserveView?this.camera.position.clone().sub(this.controls.target):this.viewMode==='front'?new THREE.Vector3(0,0,1):new THREE.Vector3(65,32,160);
      this.camera.left=-half*(this.aspect||1);this.camera.right=half*(this.aspect||1);this.camera.top=half;this.camera.bottom=-half;
      this.camera.far=Math.max(1500,radius*6);
      if(reset){this.camera.zoom=1;this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(direction.normalize(),Math.max(180,radius*3));this.camera.lookAt(center);this.controls.update();}
      this.camera.updateProjectionMatrix();return;
    }
    const w=this.bounds?.width||60,h=this.bounds?.height||65,d=this.bounds?.depth||0;
    const half=Math.max((h+d*.3)*.73,(w+d*.5)/(this.aspect||1)*.69,24);this.camera.left=-half*(this.aspect||1);this.camera.right=half*(this.aspect||1);this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();
    if(reset){const direction=preserveView?this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(180):this.viewMode==='front'?new THREE.Vector3(0,0,180):new THREE.Vector3(65,32,160);this.camera.zoom=1;this.controls.target.set(0,0,0);this.camera.position.copy(direction);this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();this.controls.update();}
  }
  setDisplacementScale(value){this.displacementScale=normalizeDisplacementScale(value);if(!this.printMode){this.update(this.state);this.fit(true,true);}}
  setView(mode){if(mode!=='fit')this.viewMode=mode;this.fit(true);}
  setExperiment(experiment){this.axis=this.graph?.dimension===2?1:Math.max(0,['x','y','z'].indexOf(experiment.axis||'y'));if(this.graph&&!this.printMode)this.decorate();}
  setCutaway(active,fraction=.5){this.cutaway=active;this.cutFraction=fraction;const depth=this.bounds?.depth||0;this.renderer.clippingPlanes=active&&depth>0?[new THREE.Plane(new THREE.Vector3(0,0,-1),depth*(fraction-.5))]:[];}
  setGraph(graph){
    this.graph=graph;this.bounds={width:graph.width,height:graph.height,depth:graph.depth||0};this.printMode=false;this.nodes=graph.nodes;this.elements=graph.edges.map(e=>({...e,active:!notchCrosses(graph,e)}));this.state=null;this.rebuild();this.decorate();this.setCutaway(this.cutaway,this.cutFraction);this.fit(true);
  }
  setFrame(nodes,elements){this.nodes=nodes;this.elements=elements;this.printMode=false;this.rebuild();}
  setPrint(spec){
    this.printMode=true;this.printSpec=spec;const cx=(spec.bounds.min[0]+spec.bounds.max[0])/2,cy=(spec.bounds.min[1]+spec.bounds.max[1])/2,cz=(spec.bounds.min[2]+spec.bounds.max[2])/2;
    this.printCenter=[cx,cy,cz];this.bounds={width:spec.bounds.max[0]-spec.bounds.min[0],height:spec.bounds.max[1]-spec.bounds.min[1],depth:spec.bounds.max[2]-spec.bounds.min[2]};this.clear(this.group);this.clear(this.decor);this.setCutaway(false);
    const round=spec.segments.filter(s=>!s.flat),flat=spec.segments.filter(s=>s.flat),material=new THREE.MeshStandardMaterial({color:'#94aa72',roughness:.65,metalness:.03});
    if(round.length){const mesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,10),material,round.length);round.forEach((s,i)=>this.place(mesh,i,s.a,s.b,s.r,cx,cy,cz));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.frustumCulled=false;this.group.add(mesh);}
    if(flat.length){const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material.clone(),flat.length);flat.forEach((s,i)=>{if(!s.square){this.place(mesh,i,s.a,s.b,2*s.r,cx,cy,cz);return;}const axis=new THREE.Vector3(...s.b).sub(new THREE.Vector3(...s.a)),length=axis.length();axis.normalize();const k=[axis.x,axis.y,axis.z].reduce((b,x,j)=>Math.abs(x)<Math.abs(axis.getComponent(b))?j:b,0),u=new THREE.Vector3();u.setComponent(k,1);u.addScaledVector(axis,-u.dot(axis)).normalize();const w=new THREE.Vector3().crossVectors(u,axis),basis=new THREE.Matrix4().makeBasis(u,axis,w);this.temp.position.set((s.a[0]+s.b[0])/2-cx,(s.a[1]+s.b[1])/2-cy,(s.a[2]+s.b[2])/2-cz);this.temp.quaternion.setFromRotationMatrix(basis);this.temp.scale.set(2*s.r,length+2*s.r,2*s.r);this.temp.updateMatrix();mesh.setMatrixAt(i,this.temp.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;this.group.add(mesh);}
    const spheres=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),material.clone(),2*spec.segments.length);let j=0;
    for(const s of spec.segments)for(const p of [s.a,s.b]){this.temp.position.set(p[0]-cx,p[1]-cy,p[2]-cz);this.temp.quaternion.identity();this.temp.scale.setScalar(s.r);if(s.flat)this.temp.scale.z=s.r;this.temp.updateMatrix();spheres.setMatrixAt(j++,this.temp.matrix);}
    spheres.instanceMatrix.needsUpdate=true;spheres.frustumCulled=false;spheres.castShadow=true;this.group.add(spheres);this.addGrid(this.bounds.width,this.bounds.height,spec.bounds.min[2]-cz-1);this.fit(true);
  }
  rebuild(){
    this.clear(this.group);if(!this.elements)return;
    this.beams=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,10),new THREE.MeshStandardMaterial({roughness:.73,metalness:.02}),this.elements.length);this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.beams.castShadow=true;this.beams.receiveShadow=true;this.beams.frustumCulled=false;this.group.add(this.beams);
    this.spheres=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,7),new THREE.MeshStandardMaterial({color:'#9fb681',roughness:.85}),this.nodes.length);this.spheres.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.spheres.castShadow=true;this.spheres.frustumCulled=false;this.group.add(this.spheres);this.update(this.state);
  }
  place(mesh,i,a,b,r,cx,cy,cz=0){
    this.temp.position.set((a[0]+b[0])/2-cx,(a[1]+b[1])/2-cy,(a[2]+b[2])/2-cz);this.dir.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);const length=this.dir.length();this.temp.quaternion.setFromUnitVectors(this.up,this.dir.normalize());this.temp.scale.set(r,Math.max(length,.001),r);this.temp.updateMatrix();mesh.setMatrixAt(i,this.temp.matrix);
  }
  update(state){
    if(this.printMode)return;this.state=state;if(!this.beams)return;
    const cx=this.graph.width/2,cy=this.graph.height/2,cz=(this.graph.depth||0)/2,rad=new Float32Array(this.nodes.length),q=state?.positions;
    const point=id=>displayPoint(this.nodes,q,id,this.displacementScale);
    let vmax=1e-12;if(this.field==='stress'&&state)for(const s of state.stresses)vmax=Math.max(vmax,s);if(this.field==='strain'&&state)for(const s of state.strains)vmax=Math.max(vmax,Math.abs(s));this.maximum=vmax;
    for(let i=0;i<this.elements.length;i++){
      const e=this.elements[i],active=state?!!state.active[i]:e.active!==false,a=point(e.a),b=point(e.b),r=active?e.r:0;this.place(this.beams,i,a,b,r,cx,cy,cz);if(active){rad[e.a]=Math.max(rad[e.a],r);rad[e.b]=Math.max(rad[e.b],r);}
      if(this.field==='material')this.color.set(['#849c61','#abc28b','#cad8b0','#7fafa4','#608fb6','#805f9e'][Math.min(5,e.level||0)]);else{const x=this.field==='stress'?(state?.stresses[i]||0)/vmax:(state?.strains[i]||0)/vmax;this.color.setHSL(this.field==='strain'&&x<0?.54:(.28-.26*Math.max(0,x)),.34+.30*Math.abs(x),.55+.05*(1-Math.abs(x)));}this.beams.setColorAt(i,this.color);
    }
    for(let i=0;i<this.nodes.length;i++){const p=point(i);this.temp.position.set(p[0]-cx,p[1]-cy,p[2]-cz);this.temp.quaternion.identity();this.temp.scale.setScalar(rad[i]*1.025);this.temp.updateMatrix();this.spheres.setMatrixAt(i,this.temp.matrix);}
    this.beams.instanceMatrix.needsUpdate=true;if(this.beams.instanceColor)this.beams.instanceColor.needsUpdate=true;this.spheres.instanceMatrix.needsUpdate=true;
    if(this.topGrip&&q&&this.topIds.length){const shift=[0,0,0],axis=this.axis??1;for(const i of this.topIds){const ref=[this.nodes[i].x,this.nodes[i].y,this.nodes[i].z||0],p=point(i);for(let k=0;k<3;k++)shift[k]+=(p[k]-ref[k])/this.topIds.length;}shift[axis]+=[cx,cy,cz][axis]+1.8;this.topGrip.position.set(...shift);}
    if(this.restLines)this.restLines.visible=this.ghost;
  }
  addGrid(w,h,z=-1.6){
    const pos=[],extent=Math.max(w,h)*1.6,step=Math.max(5,Math.round(extent/130)*5);for(let x=-extent;x<=extent;x+=step)pos.push(x,-extent,z,x,extent,z,-extent,x,z,extent,x,z);
    const grid=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(pos,3)),new THREE.LineBasicMaterial({color:'#d9e2cf',transparent:true,opacity:.38}));this.decor.add(grid);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(extent*2,extent*2),new THREE.ShadowMaterial({color:'#62714b',opacity:.14}));floor.position.z=z+.05;floor.receiveShadow=true;this.decor.add(floor);
  }
  decorate(){
    this.clear(this.decor);const g=this.graph,w=g.width,h=g.height,d=g.depth||0,axis=g.dimension===2?1:(this.axis??1),dims=[w,h,d];this.axis=axis;this.addGrid(w,h,-d/2-g.design.radius*1.5);
    const gripMat=new THREE.MeshStandardMaterial({color:'#c8d3ba',transparent:true,opacity:d?.23:.72,roughness:1,depthWrite:false});this.topGrip=null;
    for(const sign of [-1,1]){const shape=dims.map(v=>Math.max(2,v+3));shape[axis]=1.1;const grip=new THREE.Mesh(new THREE.BoxGeometry(...shape),gripMat.clone()),p=[0,0,0];p[axis]=sign*(dims[axis]/2+1.8);grip.position.set(...p);this.decor.add(grip);if(sign===1)this.topGrip=grip;}
    this.topIds=[];this.nodes.forEach((p,i)=>{if([p.x,p.y,p.z||0][axis]>dims[axis]-1e-5)this.topIds.push(i);});
    const rest=[];for(const e of g.edges){const a=g.nodes[e.a],b=g.nodes[e.b];rest.push(a.x-w/2,a.y-h/2,(a.z||0)-d/2,b.x-w/2,b.y-h/2,(b.z||0)-d/2);}
    this.restLines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(rest,3)),new THREE.LineBasicMaterial({color:'#56746d',transparent:true,opacity:.2}));this.restLines.visible=this.ghost;this.decor.add(this.restLines);
    if(g.design.notch){const y=h*(g.design.notchY-.5),x=-w/2,depth=w*g.design.notchDepth,z=d*(g.design.notchZ||1)/2,points=d?[[x,y,-z],[x+depth,y,-z],[x+depth,y,z],[x,y,z],[x,y,-z]]:[[x-5,y,1.5],[x+depth,y,1.5]],line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineDashedMaterial({color:'#b67958',dashSize:.9,gapSize:.65,transparent:true,opacity:.8}));line.computeLineDistances();this.decor.add(line);}
  }
  animate(){requestAnimationFrame(()=>this.animate());this.controls.update();this.renderer.render(this.scene,this.camera);}
  capture(){this.renderer.render(this.scene,this.camera);return captureWithDisplacementLabel(this.renderer.domElement,this.printMode?1:this.displacementScale);}
  createMovieCapture(width,height){
    const renderer=this.renderer,camera=this.camera.clone(),aspect=width/height;
    const half=Math.max((camera.top-camera.bottom)/2,(camera.right-camera.left)/2/aspect)*1.12;
    camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
    const target=new THREE.WebGLRenderTarget(width,height,{samples:4});target.texture.colorSpace=THREE.SRGBColorSpace;
    const raw=new Uint8Array(width*height*4),flipped=new Uint8ClampedArray(raw.length),oldState=this.state,captureScale=this.displacementScale;
    return {
      read:state=>{this.displacementScale=captureScale;this.update(state);const previous=renderer.getRenderTarget();try{renderer.setRenderTarget(target);renderer.render(this.scene,camera);renderer.readRenderTargetPixels(target,0,0,width,height,raw);}finally{renderer.setRenderTarget(previous);}const stride=width*4;for(let y=0;y<height;y++)flipped.set(raw.subarray(y*stride,(y+1)*stride),(height-1-y)*stride);return flipped;},
      dispose:()=>{target.dispose();this.displacementScale=captureScale;this.update(oldState);}
    };
  }
}
// Canvas fallback retains the editor and numerical experiments when WebGL2 is unavailable.
export class FlatViewer{
  constructor(container){this.container=container;this.canvas=document.getElementById('fallback');this.canvas.hidden=false;this.ctx=this.canvas.getContext('2d');this.field='material';this.displacementScale=1;new ResizeObserver(()=>this.draw()).observe(container);}
  setGraph(g){this.graph=g;this.nodes=g.nodes;this.elements=g.edges.map(e=>({...e,active:!notchCrosses(g,e)}));this.state=null;this.printMode=false;this.viewBounds=null;this.draw();}
  setFrame(n,e){this.nodes=n;this.elements=e;this.draw();}update(s){this.state=s;this.draw();}setView(){this.fit();}
  fit(){this.viewBounds=this.graph&&this.displacementScale>1?deformationBounds(this.nodes,this.state?.positions,this.displacementScale,this.graph,this.getFitFrames?.()||[]):null;this.draw();}
  setPrint(s){this.printMode=true;this.printSpec=s;this.draw();}
  setDisplacementScale(value){this.displacementScale=normalizeDisplacementScale(value);this.fit();}
  setExperiment(){}setCutaway(){}
  draw(canvas=this.canvas,w=this.container.clientWidth,h=this.container.clientHeight,d=devicePixelRatio||1){if(!this.graph)return;const c=canvas.getContext('2d');canvas.width=w*d;canvas.height=h*d;c.setTransform(d,0,0,d,0,0);c.fillStyle='#f2f5ee';c.fillRect(0,0,w,h);
    const g=this.graph,bounds=this.viewBounds||{min:[0,0,0],max:[g.width,g.height,g.depth||0]},bw=bounds.max[0]-bounds.min[0],bh=bounds.max[1]-bounds.min[1],scale=Math.min((w-50)/bw,(h-190)/bh),ox=(w-bw*scale)/2-bounds.min[0]*scale,oy=(h+bh*scale)/2+35+bounds.min[1]*scale;c.lineCap='round';
    if(this.printMode){const spec=this.printSpec,sc=Math.min((w-50)/(spec.bounds.max[0]-spec.bounds.min[0]),(h-170)/(spec.bounds.max[1]-spec.bounds.min[1]));for(const s of spec.segments){c.strokeStyle='#92a876';c.lineWidth=2*s.r*sc;c.beginPath();c.moveTo(25+(s.a[0]-spec.bounds.min[0])*sc,h-45-(s.a[1]-spec.bounds.min[1])*sc);c.lineTo(25+(s.b[0]-spec.bounds.min[0])*sc,h-45-(s.b[1]-spec.bounds.min[1])*sc);c.stroke();}return;}
    const state=this.state,q=state?.positions;let max=1e-12;if(state)for(const x of this.field==='strain'?state.strains:state.stresses)max=Math.max(max,Math.abs(x));this.maximum=max;
    this.elements.forEach((e,i)=>{if(state?!state.active[i]:e.active===false)return;const a=displayPoint(this.nodes,q,e.a,this.displacementScale),b=displayPoint(this.nodes,q,e.b,this.displacementScale);c.strokeStyle=this.field==='material'?(['#859f66','#b0c393','#cad8b0','#7fafa4','#608fb6','#805f9e'][Math.min(5,e.level||0)]):`hsl(${100-90*Math.abs((this.field==='strain'?state?.strains[i]:state?.stresses[i])||0)/max} 45% 50%)`;c.lineWidth=Math.max(.6,e.r*2*scale);c.beginPath();c.moveTo(ox+a[0]*scale,oy-a[1]*scale);c.lineTo(ox+b[0]*scale,oy-b[1]*scale);c.stroke();});
  }
  capture(){return captureWithDisplacementLabel(this.canvas,this.printMode?1:this.displacementScale);}
  createMovieCapture(width,height){const canvas=document.createElement('canvas'),oldState=this.state,captureScale=this.displacementScale;return {read:state=>{this.displacementScale=captureScale;this.state=state;this.draw(canvas,width,height,1);return canvas.getContext('2d').getImageData(0,0,width,height).data;},dispose:()=>{this.displacementScale=captureScale;this.update(oldState);}};}
}
