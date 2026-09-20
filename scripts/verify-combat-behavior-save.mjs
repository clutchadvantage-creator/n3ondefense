import { writeFile } from 'node:fs/promises';
const port=Number(process.env.N3ON_CDP_PORT??9225);
const target=(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json()))
  .find(t=>t.type==='page'&&/^http:\/\/(127\.0\.0\.1|localhost):/.test(t.url));
if(!target)throw Error('Isolated DEV browser required');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let id=0;
const call=(method,params={})=>new Promise((resolve,reject)=>{
  const request=++id;
  const timeout=setTimeout(()=>{socket.removeEventListener('message',handler);reject(Error('CDP timeout: '+method));},30000);
  const handler=event=>{const r=JSON.parse(event.data);if(r.id!==request)return;clearTimeout(timeout);socket.removeEventListener('message',handler);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result);};
  socket.addEventListener('message',handler);socket.send(JSON.stringify({id:request,method,params}));
});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
try{
  const before=await evaluate(`(async()=>{
    const run=globalThis.__n3onMixedSoak;
    if(!run?.options.finishCampaign||run.running||run.errors.length||!run.finale?.finishedAt)throw Error('Completed isolated ending fixture required');
    const live=p=>performance.getEntriesByType('resource').findLast(e=>e.name.includes(p+'?t='))?.name??p;
    const {SaveSystem}=await import(live('/src/game/systems/SaveSystem.ts'));
    const {PlayerProfileStore}=await import(live('/src/game/state/PlayerProfileStore.ts'));
    SaveSystem.setSettings({soundVolumes:{...SaveSystem.get().settings.soundVolumes,shot:.37,droneFlight:.42}});
    const save=PlayerProfileStore.getActiveSave(),gl=n3onGame.renderer.gl,extension=gl?.getExtension('WEBGL_debug_renderer_info');
    return {profileId:SaveSystem.getActiveProfileSummary().id,highest:save.progress.supremeHighestRound,
      completed:save.progress.supremeOverdriveCompleted,shot:save.settings.soundVolumes.shot,droneFlight:save.settings.soundVolumes.droneFlight,
      environment:{viewport:{width:n3onGame.scale.width,height:n3onGame.scale.height},devicePixelRatio,
        userAgent:navigator.userAgent,renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):null}};
  })()`);
  if(before.highest!==148||!before.completed)throw Error('Ending was not persisted before reload');
  await call('Page.reload');
  let after;
  const started=Date.now();
  while(Date.now()-started<30000){
    await new Promise(r=>setTimeout(r,250));
    try{
      after=await evaluate(`(async()=>{
        if(globalThis.__n3onMixedSoak||!globalThis.n3onGame?.scene?.getScene('arena'))return null;
        const {PlayerProfileStore}=await import('/src/game/state/PlayerProfileStore.ts');
        const {LocalSaveManager}=await import('/src/game/save/LocalSaveManager.ts');
        const disk=JSON.parse(LocalSaveManager.getActiveProfileSaveRaw()),save=PlayerProfileStore.getActiveSave();
        return {profileId:disk.profile.id,highest:save.progress.supremeHighestRound,completed:save.progress.supremeOverdriveCompleted,
          shot:save.settings.soundVolumes.shot,droneFlight:save.settings.soundVolumes.droneFlight,
          diskHighest:disk.progress.supremeHighestRound,diskCompleted:disk.progress.supremeOverdriveCompleted,
          diskShot:disk.settings.soundVolumes.shot,diskDroneFlight:disk.settings.soundVolumes.droneFlight};
      })()`);
      if(after)break;
    }catch{/* The page can replace its execution context while reloading. */}
  }
  if(after?.profileId!==before.profileId||after.highest!==148||after.diskHighest!==148||!after.completed||!after.diskCompleted
    ||after.shot!==.37||after.diskShot!==.37||after.droneFlight!==.42||after.diskDroneFlight!==.42)throw Error('Reload mismatch: '+JSON.stringify(after));
  const report={passed:true,verifiedAt:new Date().toISOString(),before,after};
  await writeFile(process.argv[2]??'artifacts/combat-behavior-ending-reload.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{socket.close();}
