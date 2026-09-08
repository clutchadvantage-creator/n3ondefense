import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
const output=process.argv[2]??'artifacts/layout-audit.json';
const port=Number(process.env.N3ON_CDP_PORT??9225);
const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&/^http:\/\/(localhost|127\.0\.0\.1):/.test(t.url));
if(!target)throw new Error('Isolated DEV browser required');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let id=0,writes=Promise.resolve(),writeError;
const call=(method,params={})=>new Promise((resolve,reject)=>{
  const request=++id;
  const timeout=setTimeout(()=>{socket.removeEventListener('message',listener);reject(new Error(`CDP timeout: ${method}`));},30000);
  const listener=event=>{const response=JSON.parse(event.data);if(response.id!==request)return;
    clearTimeout(timeout);socket.removeEventListener('message',listener);
    response.error||response.result?.exceptionDetails?reject(new Error(JSON.stringify(response))):resolve(response.result);};
  socket.addEventListener('message',listener);socket.send(JSON.stringify({id:request,method,params}));
});
const evaluate=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
await mkdir(dirname(output),{recursive:true});
socket.addEventListener('message',event=>{
  const message=JSON.parse(event.data);
  if(message.method==='Runtime.bindingCalled'&&message.params.name==='__n3onSaveLayoutCheckpoint')
    writes=writes.then(()=>writeFile(output.replace(/\.json$/,'.partial.json'),message.params.payload)).catch(e=>writeError=e);
});
try{
  if(await evaluate(`Boolean(globalThis.__n3onLayoutAudit?.running||globalThis.__n3onMixedSoak?.running)`))
    throw new Error('Another browser fixture is still running');
  await call('Runtime.addBinding',{name:'__n3onSaveLayoutCheckpoint'});
  await evaluate(`globalThis.__n3onLayoutAuditOptions=${JSON.stringify(JSON.parse(process.env.N3ON_LAYOUT_OPTIONS??'{}'))}`);
  console.log(await evaluate(await readFile(new URL(process.argv[3]??'./benchmark-layout-costs.browser.js',import.meta.url),'utf8')));
  let state;
  do{await new Promise(resolve=>setTimeout(resolve,15000));
    state=await evaluate(`({running:__n3onLayoutAudit.running,current:__n3onLayoutAudit.current,cases:__n3onLayoutAudit.cases.length,errors:__n3onLayoutAudit.errors})`);
    console.log(JSON.stringify(state));
  }while(state.running);
  const report=await evaluate(`(({promise,...report})=>report)(__n3onLayoutAudit)`);
  await writes;if(writeError)throw writeError;
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  if(report.errors.length)process.exitCode=1;
}finally{socket.close();}
