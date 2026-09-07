// Compact typed buffers and topology checks for large indexed triangle meshes.
export class MeshBuffer {
  constructor(Type,initial=12288){this.Type=Type;this.data=new Type(initial);this.length=0;}
  push3(a,b,c){
    if(this.length+3>this.data.length){const next=new this.Type(Math.ceil(this.data.length*1.5/3)*3);next.set(this.data);this.data=next;}
    this.data[this.length++]=a;this.data[this.length++]=b;this.data[this.length++]=c;
  }
  finish(){return this.data.subarray(0,this.length);}
}
export function inspectMesh({vertices:v,faces:f},collectDefects=false){
  const defects=collectDefects?new Set():null;
  const count=v.length/3,parent=new Int32Array(count),used=new Uint8Array(count),edges=new Float64Array(f.length);
  for(let i=0;i<count;i++)parent[i]=i;
  const root=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
  let volume=0,area=0,degenerateTriangles=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<f.length;i+=3){
    const a=f[i],b=f[i+1],c=f[i+2];
    for(let k=0;k<3;k++){
      const u=f[i+k],w=f[i+(k+1)%3];if(u>=count||w>=count)throw Error('Surface contains an invalid vertex index.');
      // Exact integer encoding (< 2^53 at the supported mesh budget), with orientation bit.
      edges[i+k]=2*(Math.min(u,w)*count+Math.max(u,w))+(u<w?1:0);
      parent[root(u)]=root(w);used[u]=1;
      for(let j=0;j<3;j++){const x=v[3*u+j];if(!Number.isFinite(x))throw Error('Surface contains a non-finite coordinate.');min[j]=Math.min(min[j],x);max[j]=Math.max(max[j],x);}
    }
    const ax=v[3*a],ay=v[3*a+1],az=v[3*a+2],bx=v[3*b],by=v[3*b+1],bz=v[3*b+2],cx=v[3*c],cy=v[3*c+1],cz=v[3*c+2];
    volume+=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;
    const twiceArea=Math.hypot((by-ay)*(cz-az)-(bz-az)*(cy-ay),(bz-az)*(cx-ax)-(bx-ax)*(cz-az),(bx-ax)*(cy-ay)-(by-ay)*(cx-ax));area+=twiceArea/2;
    if(a===b||b===c||c===a||twiceArea===0){degenerateTriangles++;if(defects){defects.add(a);defects.add(b);defects.add(c);}}
  }
  edges.sort();let nonManifoldEdges=0,orientationErrors=0,uniqueEdges=0;
  for(let i=0;i<edges.length;){const key=Math.floor(edges[i]/2);uniqueEdges++;let n=0,orientation=0;do{orientation+=edges[i]%2?1:-1;n++;i++;}while(i<edges.length&&Math.floor(edges[i]/2)===key);if(n!==2)nonManifoldEdges++;if(orientation!==0)orientationErrors++;if(defects&&(n!==2||orientation!==0)){defects.add(Math.floor(key/count));defects.add(key%count);}}
  let components=0,usedVertices=0;for(let i=0;i<count;i++)if(used[i]){usedVertices++;if(root(i)===i)components++;}
  return {...(defects?{defectVertices:[...defects]}:{}),vertices:count,triangles:f.length/3,nonManifoldEdges,orientationErrors,degenerateTriangles,components,eulerCharacteristic:usedVertices-uniqueEdges+f.length/3,volume,area,bounds:{min,max},dimensions:max.map((x,i)=>x-min[i])};
}
