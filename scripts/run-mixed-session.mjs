import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const port=Number(process.env.N3ON_CDP_PORT??9225);
const output=process.argv[2]??'artifacts/mixed-soak-after.json';
const rounds=Number(process.env.N3ON_SOAK_ROUNDS??32);
const extraOptions=JSON.parse(process.env.N3ON_SOAK_OPTIONS??'{}');
const browserScript=process.argv[3]??'./benchmark-mixed-session.browser.js';
const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&/^http:\/\/(127\.0\.0\.1|localhost):/.test(t.url));
if(!target) throw new Error('Start an isolated DEV browser with remote debugging first.');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let id=0;
let checkpointWrites=Promise.resolve();
let checkpointWriteError;
socket.addEventListener('message',event=>{
  const message=JSON.parse(event.data);
  if(message.method!=='Runtime.bindingCalled'||message.params.name!=='__n3onSaveSoakCheckpoint')return;
  const snapshot=message.params.payload;
  checkpointWrites=checkpointWrites.then(async()=>{
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output.replace(/\.json$/,'.partial.json'),snapshot);
  }).catch(error=>{checkpointWriteError=error;});
});
const evaluate=expression=>new Promise((resolve,reject)=>{
  const request=++id;
  const timeout=setTimeout(()=>reject(new Error('Browser evaluation timed out')),30000);
  const listener=event=>{
    const message=JSON.parse(event.data);
    if(message.id!==request)return;
    clearTimeout(timeout);socket.removeEventListener('message',listener);
    if(message.error||message.result.exceptionDetails)reject(new Error(JSON.stringify(message.error??message.result.exceptionDetails)));
    else resolve(message.result.result.value);
  };
  socket.addEventListener('message',listener);
  socket.send(JSON.stringify({id:request,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true,includeCommandLineAPI:true}}));
});
try{
  if(await evaluate(`Boolean(globalThis.__n3onLayoutAudit?.running||globalThis.__n3onMixedSoak?.running)`))
    throw new Error('Another browser fixture is still running');
  // Browser snapshots are emitted only at stopped-scene boundaries, outside
  // combat timing windows. Keep completed evidence if the browser is closed.
  socket.send(JSON.stringify({id:++id,method:'Runtime.addBinding',params:{name:'__n3onSaveSoakCheckpoint'}}));
  const readyStarted=Date.now();
  while(!await evaluate(`Boolean(globalThis.n3onGame?.scene?.getScene('arena'))`)) {
    if(Date.now()-readyStarted>30000)throw new Error('DEV scenes did not finish registering');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  // Inspector reads browser-owned registrations without wrapping EventTarget
  // or retaining application listeners in the benchmark itself.
  await evaluate(`{ const inspect=getEventListeners; globalThis.__n3onGlobalListenerCounts=()=>({
    window:Object.fromEntries(Object.entries(inspect(window)).map(([k,v])=>[k,v.length])),
    document:Object.fromEntries(Object.entries(inspect(document)).map(([k,v])=>[k,v.length])) }); }`);
  await evaluate(`globalThis.__n3onMixedSoakOptions=${JSON.stringify({rounds,sampleMs:8000,primePressure:true,...extraOptions})}`);
  console.log(await evaluate(await readFile(new URL(browserScript,import.meta.url),'utf8')));
  let status;
  do{
    await new Promise(resolve=>setTimeout(resolve,15000));
    status=await evaluate(`({running:__n3onMixedSoak.running,round:__n3onMixedSoak.round,checkpoint:__n3onMixedSoak.checkpoints.at(-1)?.label,errors:__n3onMixedSoak.errors})`);
    console.log(JSON.stringify(status));
  }while(status.running);
  const report=await evaluate(`(({promise,...report})=>report)(__n3onMixedSoak)`);
  await checkpointWrites;
  if(checkpointWriteError)throw checkpointWriteError;
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,coverage:report.coverage,boundaries:report.boundaries.length,errors:report.errors}));
  if(report.errors.length||report.coverage.ordinaryRound<rounds)process.exitCode=1;
}finally{socket.close();}
