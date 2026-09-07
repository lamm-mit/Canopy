// Deterministic planar and spatial cellular networks. All dimensions are mm.
import {generateSpatialNetwork} from './geometry3d.js';
export const MAX_HIERARCHY=5;
export const DEFAULT_DESIGN = {
  dimension:'3d', family: 'cellular', columns: 1, rows: 1, slices:1, width: 36, height:36, depth:36, disorder: 0.35,
  hierarchy: 1, hierarchyScale: 0.46, radius: 0.58, fineRatio: 0.58,
  gradient: 0, gradientAxis: 'y', anisotropy: 1, repeatsX: 1, repeatsY: 1,repeatsZ:1,
  seed: 42, notch: false, notchDepth: 0.26, notchY: 0.5,notchZ:1,
  interpretation: 'Interconnected cellular pores carry the primary load. Smaller nested cells and branching bridges introduce secondary length scales. Order, anisotropy, and thickness gradients move the design from a regular lattice toward the organic, redundant networks in the reference.'
};
export const PRESETS = [
  {id:'canopy', name:'Canopy', detail:'Nested · organic', settings:{...DEFAULT_DESIGN}},
  {id:'crystal',name:'Crystal',detail:'Ordered · cellular',settings:{...DEFAULT_DESIGN,family:'honeycomb',disorder:0,hierarchy:0,radius:0.65}},
  {id:'venation',name:'Venation',detail:'Branching · graded',settings:{...DEFAULT_DESIGN,family:'branches',hierarchy:1,disorder:0.4,gradient:0.7,radius:0.75}},
  {id:'auxetic',name:'Re-entrant',detail:'Concave · compliant',settings:{...DEFAULT_DESIGN,family:'reentrant',disorder:0.08,hierarchy:0,radius:0.42}},
  {id:'mineral',name:'Mineral',detail:'Braced · stiff',settings:{...DEFAULT_DESIGN,family:'triangular',disorder:0,hierarchy:0,radius:0.48}},
  {id:'extreme',name:'Wild growth',detail:'Disordered · three scales',settings:{...DEFAULT_DESIGN,disorder:1,hierarchy:2,columns:1,rows:1,slices:1,radius:0.7,hierarchyScale:0.4,fineRatio:0.7,gradient:-0.65}}
];
export function random(seed) {let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function sanitizeDesign(data={}) {
  const d={...DEFAULT_DESIGN,...data};
  d.dimension=d.dimension==='2d'?'2d':'3d';
  const ranges={columns:d.dimension==='3d'?[1,4]:[3,9],rows:d.dimension==='3d'?[1,4]:[3,10],slices:[1,4],width:[20,160],height:[12,160],depth:[12,160],disorder:[0,1],hierarchy:[0,MAX_HIERARCHY],hierarchyScale:[0.28,0.65],radius:[0.25,1.8],fineRatio:[0.35,0.85],gradient:[-0.8,0.8],anisotropy:[0.5,1.8],repeatsX:[1,3],repeatsY:[1,3],repeatsZ:[1,3],seed:[1,999999],notchDepth:[0.05,0.55],notchY:[0.15,0.85],notchZ:[.1,1]};
  for(const [k,[lo,hi]] of Object.entries(ranges))d[k]=clamp(Number.isFinite(+d[k])?+d[k]:DEFAULT_DESIGN[k],lo,hi);
  for(const k of ['columns','rows','slices','hierarchy','repeatsX','repeatsY','repeatsZ','seed'])d[k]=Math.round(d[k]);
  if(!['cellular','honeycomb','branches','triangular','reentrant','diamond'].includes(d.family))d.family='cellular';
  if(!['x','y','z','radial'].includes(d.gradientAxis))d.gradientAxis='y';
  d.notch=!!d.notch;d.interpretation=String(d.interpretation).slice(0,3000);return d;
}
function clip(poly,nx,ny,c) {
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length],da=a[0]*nx+a[1]*ny-c,db=b[0]*nx+b[1]*ny-c;
    if(da<=1e-8)out.push(a);
    if((da<0)!==(db<0)){const t=da/(da-db);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
  }return out;
}
function cellsFor(d,w,h){
  const rng=random(d.seed),n=d.columns,m=d.rows,dx=w/n,dy=h/m,cells=[];
  if(d.family==='triangular'){
    const pts=Array.from({length:m+1},(_,j)=>Array.from({length:n+1},(_,i)=>[i*dx+(i>0&&i<n?(rng()-.5)*dx*d.disorder*.6:0),j*dy+(j>0&&j<m?(rng()-.5)*dy*d.disorder*.6:0)]));
    for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a=pts[j][i],b=pts[j][i+1],c=pts[j+1][i+1],e=pts[j+1][i];cells.push([a,b,c],[a,c,e]);}return cells;
  }
  if(d.family==='reentrant'){
    // Hourglass cells with inward side corners; adjacent cells meet at shared corner nodes.
    const point=(i,j)=>[i*dx+(i>0&&i<n?(rng()-.5)*d.disorder*dx*.2:0),j*dy/2];
    const grid=Array.from({length:2*m+1},(_,j)=>Array.from({length:n+1},(_,i)=>point(i,j)));
    for(let j=0;j<m;j++)for(let i=0;i<n;i++){
      const left=grid[2*j][i],right=grid[2*j][i+1],tl=grid[2*j+2][i],tr=grid[2*j+2][i+1];
      // Narrow waist creates re-entrant side corners; shared edges remain conforming.
      const yy=(j+.5)*dy, neck=.25*dx;
      cells.push([left,right,[(i+1)*dx-neck,yy],tr,tl,[i*dx+neck,yy]]);
    }return cells;
  }
  const disorder=d.family==='honeycomb'?0:d.disorder,primary=[];
  // Periodic point pattern gives matching opposite tile boundaries, also with disorder.
  for(let j=0;j<m;j++)for(let i=0;i<n;i++)primary.push([((i+.25+.5*(j%2))*dx+(rng()-.5)*dx*disorder*.85+w)%w,((j+.5)*dy+(rng()-.5)*dy*disorder*.85+h)%h]);
  const points=[];
  for(let iy=-1;iy<=1;iy++)for(let ix=-1;ix<=1;ix++)for(const p of primary)points.push([p[0]+ix*w,p[1]+iy*h]);
  for(const p of points){
    if(p[0]<-dx||p[0]>w+dx||p[1]<-dy||p[1]>h+dy)continue;
    let poly=[[0,0],[w,0],[w,h],[0,h]];
    for(const q of points){if(q===p)continue;const nx=q[0]-p[0],ny=q[1]-p[1];if(nx*nx+ny*ny>16*(dx*dx+dy*dy))continue;poly=clip(poly,nx,ny,(q[0]**2+q[1]**2-p[0]**2-p[1]**2)/2);if(poly.length<3)break;}
    if(poly.length>=3){poly=poly.filter((p,i)=>Math.hypot(p[0]-poly[(i+1)%poly.length][0],p[1]-poly[(i+1)%poly.length][1])>1e-5);if(poly.length>=3)cells.push(poly);}
  }return cells;
}
export function generateNetwork(input={}){
  const d=sanitizeDesign(input);
  if(d.dimension==='3d'){const g=generateSpatialNetwork(d);g.stats=networkStats(g);return g;}
  const tileW=d.width*d.anisotropy,tileH=d.width*d.rows/d.columns*.8660254;
  const width=tileW*d.repeatsX,height=tileH*d.repeatsY;
  const nodes=[],edges=[],map=new Map(),edgeMap=new Map(),cells=cellsFor(d,tileW,tileH);
  function node(x,y){const key=`${Math.round(x*1e5)},${Math.round(y*1e5)}`;if(map.has(key))return map.get(key);const id=nodes.length;nodes.push({x,y});map.set(key,id);return id;}
  function edge(a,b,level=0){if(a===b)return;const key=a<b?`${a},${b}`:`${b},${a}`;if(edgeMap.has(key)){edges[edgeMap.get(key)].level=Math.min(level,edges[edgeMap.get(key)].level);return;}
    if(Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y)<.015)return;
    edgeMap.set(key,edges.length);edges.push({a,b,level});}
  for(let iy=0;iy<d.repeatsY;iy++)for(let ix=0;ix<d.repeatsX;ix++)for(const poly of cells){
    const p=poly.map(([x,y])=>[x+ix*tileW,y+iy*tileH]),cx=p.reduce((s,v)=>s+v[0],0)/p.length,cy=p.reduce((s,v)=>s+v[1],0)/p.length;
    let ids=p.map(([x,y])=>node(x,y));for(let i=0;i<ids.length;i++)edge(ids[i],ids[(i+1)%ids.length]);
    const area=Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2);
    if(area<tileW*tileH/(d.columns*d.rows)*.1)continue;
    for(let lev=1;lev<=d.hierarchy;lev++){
      const sc=d.hierarchyScale**lev,inner=p.map(([x,y])=>node(cx+(x-cx)*sc,cy+(y-cy)*sc));
      for(let i=0;i<inner.length;i++){
        edge(inner[i],inner[(i+1)%inner.length],lev);
        if(d.family==='branches'){
          const a=nodes[ids[i]],b=nodes[inner[i]],c=nodes[inner[(i+1)%inner.length]];
          const branch=node(.48*a.x+.26*b.x+.26*c.x,.48*a.y+.26*b.y+.26*c.y);
          edge(ids[i],branch,lev);edge(branch,inner[i],lev);edge(branch,inner[(i+1)%inner.length],lev);
        }else edge(ids[i],inner[i],lev);
      }ids=inner;
    }
  }
  // Split at collinear existing nodes so repeat seams and re-entrant boundaries share DOFs.
  const split=[];
  for(const e of edges){const a=nodes[e.a],b=nodes[e.b],vx=b.x-a.x,vy=b.y-a.y,ll=vx*vx+vy*vy,parts=[[0,e.a],[1,e.b]];
    // Tile/perimeter seams only: cellular interiors are already conforming.
    if(Math.abs(vx)<1e-7||Math.abs(vy)<1e-7)for(let i=0;i<nodes.length;i++){if(i===e.a||i===e.b)continue;const p=nodes[i],t=((p.x-a.x)*vx+(p.y-a.y)*vy)/ll;if(t>1e-6&&t<1-1e-6&&Math.abs((p.x-a.x)*vy-(p.y-a.y)*vx)<1e-6)parts.push([t,i]);}
    parts.sort((a,b)=>a[0]-b[0]);for(let j=0;j<parts.length-1;j++)split.push({...e,a:parts[j][1],b:parts[j+1][1]});
  }
  const seen=new Set(),final=[];
  for(const e of split){const key=e.a<e.b?`${e.a},${e.b}`:`${e.b},${e.a}`;if(seen.has(key))continue;seen.add(key);const a=nodes[e.a],b=nodes[e.b],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    let g=d.gradientAxis==='x'?2*mx/width-1:d.gradientAxis==='radial'?2*Math.min(1,Math.hypot(mx/width-.5,my/height-.5)*Math.SQRT2)-1:2*my/height-1;
    const r=d.radius*d.fineRatio**e.level*(1+d.gradient*g);final.push({...e,r:Math.max(.06,r),id:final.length});
  }
  const graph={nodes,edges:final,width,height,depth:0,dimension:2,tileW,tileH,design:d};
  graph.stats=networkStats(graph);return graph;
}
export function notchCrosses(graph,e){
  const d=graph.design;if(!d.notch)return false;const a=graph.nodes[e.a],b=graph.nodes[e.b],y=graph.height*d.notchY,depth=graph.width*d.notchDepth;
  if(Math.abs(b.y-a.y)<1e-9){const matches=Math.abs(a.y-y)<e.r&&Math.min(a.x,b.x)<=depth;if(!matches||graph.dimension!==3)return matches;const half=graph.depth*(d.notchZ??1)/2;return Math.max(a.z,b.z)>=graph.depth/2-half&&Math.min(a.z,b.z)<=graph.depth/2+half;}
  const t=(y-a.y)/(b.y-a.y);if(t<0||t>1||a.x+t*(b.x-a.x)>depth)return false;
  if(graph.dimension===3){const z=a.z+t*(b.z-a.z),half=graph.depth*(d.notchZ??1)/2;return Math.abs(z-graph.depth/2)<=half+1e-6;}return true;
}
export function networkStats(g){
  let volume=0,minRadius=Infinity,notched=0;const adj=Array.from({length:g.nodes.length},()=>[]);
  for(const e of g.edges){if(notchCrosses(g,e)){notched++;continue;}const a=g.nodes[e.a],b=g.nodes[e.b];volume+=Math.PI*e.r**2*Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));minRadius=Math.min(minRadius,e.r);adj[e.a].push(e.b);adj[e.b].push(e.a);}
  let components=0,connected=false;const visited=new Set();
  for(let i=0;i<g.nodes.length;i++)if(!visited.has(i)&&adj[i].length){components++;let bottom=false,top=false;const q=[i];visited.add(i);for(let k=0;k<q.length;k++){const a=q[k];bottom||=g.nodes[a].y<1e-5;top||=g.nodes[a].y>g.height-1e-5;for(const b of adj[a])if(!visited.has(b)){visited.add(b);q.push(b);}}connected||=bottom&&top;}
  return {nodes:g.nodes.length,edges:g.edges.length,volume,minRadius,components,connected,notched};
}
