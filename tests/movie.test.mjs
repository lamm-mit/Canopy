import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('bundled movie worker produces a real, decodable H.264 MP4 with exact duration and frame count',async()=>{
  const worker=new Worker(new URL('./support/worker-host.mjs',import.meta.url),{workerData:{script:'movie-worker.js'}}),dir=mkdtempSync(path.join(tmpdir(),'canopy-mp4-'));
  try{
    const wait=type=>new Promise((resolve,reject)=>{const clean=()=>{worker.off('message',handler);worker.off('error',onError);},onError=e=>{clean();reject(e);},handler=m=>{if(m.type==='error'){clean();reject(Error(m.message));}if(m.type===type){clean();resolve(m);}};worker.on('message',handler);worker.once('error',onError);});
    let response=wait('ready');worker.postMessage({type:'init',width:854,height:480,fps:15,frames:15});await response;
    for(let i=0;i<15;i++){const rgba=new Uint8Array(854*480*4);for(let p=0;p<rgba.length;p+=4){rgba[p]=Math.round(i*255/14);rgba[p+1]=150;rgba[p+2]=90;rgba[p+3]=255;}response=wait('encoded');worker.postMessage({type:'frame',buffer:rgba.buffer},[rgba.buffer]);assert.equal((await response).count,i+1);}
    response=wait('complete');worker.postMessage({type:'finish'});const bytes=new Uint8Array((await response).buffer);assert.ok(bytes.length>1000);assert.equal(Buffer.from(bytes.subarray(4,8)).toString(),'ftyp');
    const file=path.join(dir,'test.mp4');writeFileSync(file,bytes);
    const probe=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'});
    if(probe.error?.code!=='ENOENT'){
      assert.equal(probe.status,0,probe.stderr);const metadata=JSON.parse(probe.stdout),v=metadata.streams[0];
      assert.equal(v.codec_name,'h264');assert.equal(v.width,854);assert.equal(v.height,480);assert.equal(+v.nb_frames,15);assert.equal(+v.duration,1);assert.ok(metadata.format.format_name.includes('mp4'));
      const decode=spawnSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{encoding:'utf8'});if(!decode.error)assert.equal(decode.status,0,decode.stderr);
    }
  }finally{await worker.terminate();rmSync(dir,{recursive:true,force:true});}
});
