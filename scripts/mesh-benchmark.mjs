import fs from 'node:fs';
import {generateNetwork} from '../dist/src/geometry.js';
import {buildPrintMesh,binarySTL,DEFAULT_PRINT} from '../dist/src/fabrication.js';
import {simplifyPrintMesh} from '../dist/src/mesh-simplify.js';
// A fresh source checkout does not contain generated output directories.
for(const directory of ["docs/results", "examples/prints"])fs.mkdirSync(directory,{recursive:true});
const options={...DEFAULT_PRINT,outputWidth:32,voxel:.12,profile:'round'},graph=generateNetwork(),start=performance.now();
console.log('Generating a fine spatial cell with the slice-streamed mesher.');
const raw=buildPrintMesh(graph,options),meshed=performance.now();
console.log(JSON.stringify({rawTriangles:raw.check.triangles,gridSamples:raw.grid,scalarMB:raw.meshing.scalarBytes/1e6}));
const reduced=await simplifyPrintMesh(raw,options),finished=performance.now();
if(raw.check.triangles<=2000000)throw Error('Benchmark did not exceed the former triangle cap.');
if(reduced.simplification.warning)throw Error(reduced.simplification.warning);
const buffer=binarySTL(reduced),filename='canopy_3d_adaptive_fine_32mm.stl';fs.writeFileSync('examples/prints/'+filename,new Uint8Array(buffer));
const summary={generatedAt:new Date().toISOString(),implementation:'Canopy 2.1 / meshoptimizer 0.25',design:graph.design,options,raw:raw.check,simplified:reduced.check,meshing:raw.meshing,gridSamples:raw.grid,simplification:reduced.simplification,seconds:{meshing:(meshed-start)/1000,simplification:(finished-meshed)/1000},originalSTLBytes:84+50*raw.check.triangles,finalSTLBytes:buffer.byteLength,peakNodeRSSMiB:process.resourceUsage().maxRSS/1024,filename};
fs.writeFileSync('docs/results/meshing-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
