import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ExperimentRecording,compactFrame,sampleRecording} from '../dist/src/replay.js';

// Unit-test the actual app handlers with small view/worker doubles. No browser,
// canvas rendering, production navigation, or duplicate transport implementation.
const source=readFileSync(new URL('../dist/src/app.js',import.meta.url),'utf8');
function block(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`Missing app handler boundary: ${start}`);
  return source.slice(a,b);
}
const handlers=[
  block('function updateRun()','function renderState('),
  block('function onWorker(','function run('),
  block('function displayState()','function recordingMetadata()'),
  block("$('#replay-play').onclick=", "$('#replay-smooth').onchange=")
].join('\n');
const frame=strain=>compactFrame({
  positions:new Float64Array([0,0,0,0,10*(1+strain),0]),
  stresses:new Float32Array([1000*strain]),strains:new Float32Array([strain]),
  active:new Uint8Array([1]),history:[],strain,force:100*strain,status:'equilibrium',loadPath:true
});
function harness({count=3,imported=false,running=false}={}){
  const recording=new ExperimentRecording();
  for(let i=0;i<count;i++)recording.append(frame(i*.01));
  const elements=new Map(),sent=[],rendered=[],raf=new Map();let clock=0,sequence=0,rebuilds=0;
  const element=id=>{
    if(!elements.has(id))elements.set(id,{disabled:false,hidden:false,checked:true,value:id==='#replay-speed'?'1':'0',style:{}});
    return elements.get(id);
  };
  const live={...frame(.025),q:new Float64Array([123,456]),history:[{strain:.01,force:1},{strain:.02,force:2}]};
  const recorder={active:{status:running?'running':'complete'},status(s){this.active.status=s;},measure(){}};
  const context=vm.createContext({
    $:element,recording,recordingImported:imported,replayCursor:imported?0:null,
    replayPlaying:false,replayPending:false,replayRaf:0,replayLastTime:0,running,
    movie:{busy:false},state:live,tab:'experiment',worker:{postMessage:m=>sent.push(m)},
    sampleRecording,performance:{now:()=>clock},requestAnimationFrame:fn=>{raf.set(++sequence,fn);return sequence;},
    cancelAnimationFrame:id=>raf.delete(id),icon:()=>'',fmt:n=>String(n),toast:()=>{},
    resultRecorder:recorder,viewer:{},setTab:t=>{context.tab=t;},updatePrint:()=>{},
    renderState:(s,isReplay)=>rendered.push({state:s,isReplay}),
    rebuild:()=>{rebuilds++;context.recordingImported=false;context.replayCursor=null;},
  });
  vm.runInContext(handlers,context);
  context.updateReplay();
  return {context,element,sent,rendered,live,recorder,rebuilds:()=>rebuilds,
    message:data=>context.onWorker({data}),
    click:id=>{const e=element('#'+id);assert.equal(e.disabled,false,`${id} must be enabled`);assert.equal(e.hidden,false,`${id} must be visible`);e.onclick();},
    tick:ms=>{clock+=ms;const next=[...raf.values()];raf.clear();next.forEach(fn=>fn(clock));}
  };
}

test('current experiment plays, pauses, scrubs, and returns to the untouched live solver state',()=>{
  const h=harness();
  assert.equal(h.element('#replay-live').hidden,true);
  assert.equal(h.element('#replay-play').innerHTML,'Play replay');
  h.click('replay-play');
  assert.equal(h.context.replayCursor,0);assert.equal(h.context.replayPlaying,true);
  assert.equal(h.rendered.at(-1).state.strain,0);
  assert.equal(h.element('#replay-live').hidden,false);
  h.tick(100);assert.ok(h.context.replayCursor>0);
  h.click('replay-play');const cursor=h.context.replayCursor;
  h.tick(100);assert.equal(h.context.replayCursor,cursor);
  h.element('#replay-timeline').oninput({target:{value:'1'}});
  assert.equal(h.rendered.at(-1).state.strain,.01);
  h.click('replay-live');
  assert.equal(h.context.replayCursor,null);assert.equal(h.context.replayPlaying,false);
  assert.equal(h.rendered.at(-1).state,h.live);
  assert.deepEqual(h.live.q,new Float64Array([123,456]));
  assert.equal(h.sent.length,0,'Replay must not send loads to the solver');
});

test('saved recording has a playable transport and an explicit fresh-experiment exit',()=>{
  const h=harness({imported:true});
  assert.equal(h.element('#replay-mode').textContent,'Saved replay');
  assert.equal(h.element('#replay-live').hidden,true);
  assert.equal(h.element('#replay-new').hidden,false);
  h.click('replay-play');h.tick(100);assert.ok(h.context.replayCursor>0);
  h.context.returnLive();assert.notEqual(h.context.replayCursor,null,'Imported fields cannot resume a solver');
  h.click('replay-new');assert.equal(h.rebuilds(),1);
});

test('a running experiment pauses once and waits for acknowledgment before starting replay',()=>{
  const h=harness({running:true});
  assert.equal(h.element('#replay-play').innerHTML,'Pause to replay');
  h.click('replay-play');h.context.toggleReplay();
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].type,'pause');
  assert.equal(h.context.running,true);assert.equal(h.context.replayPlaying,false);
  assert.equal(h.element('#replay-play').disabled,true);assert.equal(h.element('#run').disabled,true);
  h.message({type:'recorded-frame',frame:frame(.03)});
  h.message({type:'state',state:{...h.live,strain:.03}});
  h.tick(100);assert.equal(h.context.replayCursor,null);
  h.message({type:'paused'});
  assert.equal(h.context.running,false);assert.equal(h.context.replayPending,false);
  assert.equal(h.context.replayPlaying,true);assert.equal(h.context.replayCursor,0);
  assert.equal(h.context.recording.frames.length,4);
  h.tick(100);h.click('replay-live');assert.equal(h.rendered.at(-1).state.strain,.03);
});

test('completion racing a replay pause retains the completed result and starts playback only once',()=>{
  const h=harness({running:true});h.click('replay-play');
  h.message({type:'complete'});
  assert.equal(h.recorder.active.status,'complete');assert.equal(h.context.replayPlaying,false);
  h.message({type:'state',state:h.live});assert.equal(h.context.replayPlaying,false);
  h.message({type:'paused'});assert.equal(h.context.replayPlaying,true);
  assert.equal(h.recorder.active.status,'complete');
  h.tick(100);const cursor=h.context.replayCursor;
  h.message({type:'paused'});assert.equal(h.context.replayCursor,cursor);
});

test('failed convergence releases a pending replay and preserves the failure status after a late pause',()=>{
  const h=harness({running:true});h.click('replay-play');
  h.message({type:'state',state:{...h.live,status:'not-converged'}});
  assert.equal(h.context.replayPending,false);assert.equal(h.context.replayPlaying,true);
  h.message({type:'paused'});assert.equal(h.recorder.active.status,'not-converged');
});

test('a one-state recording explains missing playback, and movie export blocks replay transitions',()=>{
  for(const imported of [false,true]){
    const h=harness({count:1,imported});
    assert.equal(h.element('#replay-play').disabled,true);
    assert.match(h.element('#replay-status').textContent,imported?/only one state/:/Run an experiment/);
    h.context.toggleReplay();assert.equal(h.context.replayPlaying,false);
  }
  const h=harness();h.click('replay-play');h.context.movie.busy=true;h.context.updateReplay();
  assert.equal(h.element('#replay-play').disabled,true);assert.equal(h.element('#replay-live').disabled,true);
  h.context.returnLive();assert.equal(h.context.replayCursor,0);
});

test('replay can restart from its end and step buttons agree with the displayed state',()=>{
  const h=harness();
  assert.equal(h.element('#replay-next').disabled,true,'Live mode shows the last recorded state');
  h.click('replay-prev');assert.equal(h.context.replayCursor,1);
  h.click('replay-next');assert.equal(h.context.replayCursor,2);
  h.click('replay-play');assert.equal(h.context.replayCursor,0);
  h.element('#replay-speed').value='4';
  for(let i=0;i<22;i++)h.tick(100);
  assert.equal(h.context.replayPlaying,false);assert.equal(h.context.replayCursor,2);
  assert.equal(h.element('#replay-play').innerHTML,'Play replay');
  h.click('replay-play');assert.equal(h.context.replayCursor,0);
});
