import {writeFile} from 'node:fs/promises';
const targets=await fetch('http://127.0.0.1:9225/json/list').then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&/^http:\/\/(localhost|127\.0\.0\.1):/.test(t.url));
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
try {
  const result=await new Promise((resolve,reject)=>{
    socket.addEventListener('message',event=>{
      const data=JSON.parse(event.data);
      if(data.id===1)data.error?reject(data.error):resolve(data.result);
    });
    socket.send(JSON.stringify({id:1,method:'Page.captureScreenshot',params:{format:'png'}}));
  });
  await writeFile(process.argv[2]??'artifacts/gameplay-after.png',Buffer.from(result.data,'base64'));
} finally {socket.close();}
