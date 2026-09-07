import {buildPrintMesh,binarySTL} from './fabrication.js';
import {simplifyPrintMesh} from './mesh-simplify.js';
self.onmessage=async ({data})=>{try{
  const progress=p=>postMessage({type:'progress',...p});
  let mesh=buildPrintMesh(data.graph,data.options,data.simulation,progress);
  mesh=await simplifyPrintMesh(mesh,data.options,progress);
  progress({phase:'Writing STL',progress:.97});
  const buffer=binarySTL(mesh);postMessage({type:'complete',buffer,check:mesh.check,voxel:mesh.voxel,simplification:mesh.simplification,meshing:mesh.meshing,grid:mesh.grid},[buffer]);
}catch(error){postMessage({type:'error',message:error.message});}};
