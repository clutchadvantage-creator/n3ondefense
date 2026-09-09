// Cold, assisted first-round completion. Trace overhead excludes this run from
// sustained performance qualification; the clean gameplay runs stay separate.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const targets=await fetch('http://127.0.0.1:9225/json/list').then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&/^http:\/\/(localhost|127\.0\.0\.1):/.test(t.url));
if(!target)throw new Error('Isolated DEV browser required');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r=>socket.addEventListener('open',r,{once:true}));
let id=0,tracing=false;
const call=(method,params={})=>new Promise((resolve,reject)=>{
  const request=++id,timer=setTimeout(()=>{socket.removeEventListener('message',handler);reject(new Error(`Timeout: ${method}`));},30000);
  const handler=e=>{const m=JSON.parse(e.data);if(m.id!==request)return;clearTimeout(timer);socket.removeEventListener('message',handler);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);};
  socket.addEventListener('message',handler);socket.send(JSON.stringify({id:request,method,params}));
});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
try {
  if(await evaluate('Boolean(globalThis.__n3onMixedSoak?.running||globalThis.__n3onLayoutAudit?.running)'))throw new Error('Another fixture is active');
  await call('Page.reload');
  const readyAt=Date.now();
  while(true){await new Promise(r=>setTimeout(r,250));try{if(await evaluate("Boolean(globalThis.n3onGame?.scene?.keys?.arena)"))break;}catch{}if(Date.now()-readyAt>30000)throw new Error('Reload timed out');}
  await evaluate(`(() => {
    const restores=[];
    for(const [sceneKey,key] of [['arena','completeRound'],['arena','endCurrentRoundRuntime'],['round-finished','create']]) {
      const scene=n3onGame.scene.getScene(sceneKey),original=scene[key];
      scene[key]=function(...args){performance.mark('quality:'+sceneKey+':'+key+':start');try{return original.apply(this,args);}finally{performance.mark('quality:'+sceneKey+':'+key+':end');}};
      restores.push(()=>scene[key]=original);
    }
    globalThis.__qualityTraceRestore=()=>{for(const restore of restores)restore();delete globalThis.__qualityTraceRestore;};
  })()`);
  await call('Tracing.start',{categories:'blink.user_timing,devtools.timeline,v8,disabled-by-default-v8.gc',transferMode:'ReturnAsStream'});tracing=true;
  const fixture=JSON.parse(await readFile('docs/polish-validation-measurements.json','utf8')).normal.options;
  const options={...fixture,rounds:1,heists:false,menuEvery:0,sustainedRounds:[]};
  const child=spawn(process.execPath,['scripts/run-mixed-session.mjs','artifacts/quality-debrief-gameplay.json','./benchmark-progression-session.browser.js'],
    {stdio:'inherit',env:{...process.env,N3ON_SOAK_ROUNDS:'1',N3ON_SOAK_OPTIONS:JSON.stringify(options)}});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  const complete=new Promise(resolve=>{const handler=e=>{const m=JSON.parse(e.data);if(m.method==='Tracing.tracingComplete'){socket.removeEventListener('message',handler);resolve(m.params);}};socket.addEventListener('message',handler);});
  await call('Tracing.end');tracing=false;
  const {stream}=await complete;let text='';
  while(true){const part=await call('IO.read',{handle:stream});text+=part.base64Encoded?Buffer.from(part.data,'base64').toString():part.data;if(part.eof)break;}
  await call('IO.close',{handle:stream});await writeFile('artifacts/quality-debrief-trace.json',text);
  const events=JSON.parse(text).traceEvents;
  const marks=events.filter(e=>e.name.startsWith('quality:'));
  const debrief=marks.find(e=>e.name==='quality:round-finished:create:start');
  if(!debrief||code!==0)throw new Error('Traced completion did not finish');
  const thread=events.filter(e=>e.pid===debrief.pid&&e.tid===debrief.tid&&e.ph==='X'&&e.dur);
  const containing=thread.filter(e=>e.ts<=debrief.ts&&e.ts+e.dur>=debrief.ts).sort((a,b)=>b.dur-a.dur);
  const window=thread.filter(e=>e.ts>=debrief.ts-2000000&&e.ts<=debrief.ts+500000);
  const row=e=>({name:e.name,durationMs:e.dur/1000,relativeStartMs:(e.ts-debrief.ts)/1000,args:e.args});
  const summary={traced:true,assisted:true,performanceQualification:false,options,
    marks:marks.map(e=>({name:e.name,relativeMs:(e.ts-debrief.ts)/1000})),
    enclosingTasks:containing.map(row),largestNearbySlices:window.sort((a,b)=>b.dur-a.dur).slice(0,20).map(row),
    gcSlices:window.filter(e=>/gc|garbage/i.test(e.name)).map(row)};
  await writeFile('artifacts/quality-debrief-trace.summary.json',JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({enclosingTasks:summary.enclosingTasks,marks:summary.marks,gcSlices:summary.gcSlices.length}));
} finally {
  if(tracing)await call('Tracing.end').catch(()=>{});
  await evaluate('globalThis.__qualityTraceRestore?.()').catch(()=>{});socket.close();
}
