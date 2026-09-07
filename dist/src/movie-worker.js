// Classic worker: the bundled WASM codec exposes HME through importScripts.
importScripts('../vendor/h264-mp4-encoder.js');
let encoder=null, count=0, expected=0;
self.onmessage=async ({data})=>{
  try {
    if(data.type==='init'){
      if(encoder)throw Error('A movie is already encoding.');
      const {width,height,fps,frames}=data;
      if(![[854,480],[1280,720],[1920,1080]].some(s=>s[0]===width&&s[1]===height)||![15,24,30].includes(fps)||!Number.isInteger(frames)||frames<2||frames>10000)throw Error('Invalid movie dimensions or frame count.');
      encoder=await HME.createH264MP4Encoder();
      encoder.width=width;encoder.height=height;encoder.frameRate=fps;
      encoder.quantizationParameter=22;encoder.speed=6;encoder.groupOfPictures=fps*2;
      encoder.initialize();count=0;expected=frames;
      postMessage({type:'ready'});
    }else if(data.type==='frame'){
      if(!encoder||count>=expected||!(data.buffer instanceof ArrayBuffer)||data.buffer.byteLength!==encoder.width*encoder.height*4)throw Error('Invalid movie frame.');
      encoder.addFrameRgba(new Uint8Array(data.buffer));count++;
      postMessage({type:'encoded',count});
    }else if(data.type==='finish'){
      if(!encoder||count!==expected)throw Error('Movie is missing frames.');
      encoder.finalize();const bytes=encoder.FS.readFile(encoder.outputFilename);
      encoder.FS.unlink(encoder.outputFilename);encoder.delete();encoder=null;
      postMessage({type:'complete',buffer:bytes.buffer},[bytes.buffer]);
    }
  }catch(error){try{encoder?.delete();}catch{}encoder=null;postMessage({type:'error',message:error.message||String(error)});}
};
