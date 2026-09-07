// Node host for isolated worker protocol checks. This is not a browser/UI harness.
import {parentPort,workerData} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=new URL('../../dist/src/'+workerData.script,import.meta.url);
globalThis.self=globalThis;globalThis.location={href:script.href};
globalThis.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);
if(workerData.script==='movie-worker.js'){
  globalThis.importScripts=path=>vm.runInThisContext(readFileSync(new URL(path,script),'utf8'),{filename:path});
  vm.runInThisContext(readFileSync(script,'utf8'),{filename:script.pathname});
}else await import(script);
parentPort.on('message',data=>self.onmessage({data}));
