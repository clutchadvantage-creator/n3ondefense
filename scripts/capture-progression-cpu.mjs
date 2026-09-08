import {writeFile} from 'node:fs/promises';
const targets=await fetch('http://127.0.0.1:9225/json/list').then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&/^http:\/\/(localhost|127\.0\.0\.1):/.test(t.url));
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let id=0;
const call=(method,params={})=>new Promise((resolve,reject)=>{
  const request=++id;
  const listener=event=>{const data=JSON.parse(event.data);if(data.id!==request)return;
    socket.removeEventListener('message',listener);data.error?reject(data.error):resolve(data.result);};
  socket.addEventListener('message',listener);socket.send(JSON.stringify({id:request,method,params}));
});
try{
  const round=Number(process.argv[2]??68);
  const output=process.argv[3]??`artifacts/round-${round}-cpu.json`;
  while(true){
    const result=await call('Runtime.evaluate',{expression:`({round:n3onGame.scene.getScene('arena').roundManager?.round,active:n3onGame.scene.isActive('arena'),phase:n3onGame.scene.getScene('arena').roundRuntime?.phase})`,returnByValue:true});
    const state=result.result.value;
    if(state.round===round&&state.active&&state.phase==='active')break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  await call('Profiler.enable');await call('Profiler.start');
  await new Promise(resolve=>setTimeout(resolve,10000));
  const {profile}=await call('Profiler.stop');await call('Profiler.disable');
  await writeFile(output,JSON.stringify(profile));
  const totals=new Map();
  for(const n of profile.nodes){const key=`${n.callFrame.functionName||'(anonymous)'} ${n.callFrame.url.split('/').at(-1)}`;totals.set(key,(totals.get(key)??0)+(n.hitCount??0));}
  console.log(JSON.stringify({round,output,top:[...totals].sort((a,b)=>b[1]-a[1]).slice(0,30)},null,2));
}finally{socket.close();}
