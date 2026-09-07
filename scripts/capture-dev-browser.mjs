import { writeFile } from 'node:fs/promises';
const targets=await fetch('http://127.0.0.1:9225/json/list').then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1:5173'));
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let id=0;
const call=(method,params={})=>new Promise(resolve=>{
  const next=++id;
  const listener=event=>{const message=JSON.parse(event.data);if(message.id!==next)return;
    socket.removeEventListener('message',listener);resolve(message.result);};
  socket.addEventListener('message',listener);socket.send(JSON.stringify({id:next,method,params}));
});
const desired=process.argv[3];
const started=Date.now();
while(desired){
  const state=await call('Runtime.evaluate',{expression:`({active:n3onGame.scene.isActive(${JSON.stringify(desired)}),options:n3onGame.scene.isActive('options')})`,returnByValue:true});
  if(state.result.value.active&&!state.result.value.options)break;
  if(Date.now()-started>180000)throw new Error('Scene capture timed out');
  await new Promise(resolve=>setTimeout(resolve,1000));
}
await new Promise(resolve=>setTimeout(resolve,Number(process.argv[4]??0)));
const screenshot=await call('Page.captureScreenshot',{format:'png'});
await writeFile(process.argv[2]??'artifacts/browser.png',Buffer.from(screenshot.data,'base64'));
socket.close();
