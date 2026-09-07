import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const port=Number(process.env.N3ON_CDP_PORT??9225);
const output=process.argv[2]??'artifacts/mixed-soak-after.json';
const rounds=Number(process.env.N3ON_SOAK_ROUNDS??32);
const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&/^http:\/\/(127\.0\.0\.1|localhost):/.test(t.url));
if(!target) throw new Error('Start an isolated DEV browser with remote debugging first.');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let id=0;
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
  // Inspector reads browser-owned registrations without wrapping EventTarget
  // or retaining application listeners in the benchmark itself.
  await evaluate(`{ const inspect=getEventListeners; globalThis.__n3onGlobalListenerCounts=()=>({
    window:Object.fromEntries(Object.entries(inspect(window)).map(([k,v])=>[k,v.length])),
    document:Object.fromEntries(Object.entries(inspect(document)).map(([k,v])=>[k,v.length])) }); }`);
  await evaluate(`globalThis.__n3onMixedSoakOptions={rounds:${rounds},sampleMs:8000,primePressure:true}`);
  console.log(await evaluate(await readFile(new URL('./benchmark-mixed-session.browser.js',import.meta.url),'utf8')));
  let status;
  do{
    await new Promise(resolve=>setTimeout(resolve,15000));
    status=await evaluate(`({running:__n3onMixedSoak.running,round:__n3onMixedSoak.round,checkpoint:__n3onMixedSoak.checkpoints.at(-1)?.label,errors:__n3onMixedSoak.errors})`);
    console.log(JSON.stringify(status));
  }while(status.running);
  const report=await evaluate(`(({promise,...report})=>report)(__n3onMixedSoak)`);
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,coverage:report.coverage,boundaries:report.boundaries.length,errors:report.errors}));
  if(report.errors.length||report.coverage.ordinaryRound<rounds)process.exitCode=1;
}finally{socket.close();}
