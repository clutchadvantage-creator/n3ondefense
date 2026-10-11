import {writeFile} from 'node:fs/promises';
const partial=process.argv.includes('--partial');
const targets=await fetch('http://127.0.0.1:9225/json/list').then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&/^http:\/\/(localhost|127\.0\.0\.1):5180\//.test(t.url));
if(!target)throw Error('Isolated DEV browser on port 5180 required');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r=>socket.addEventListener('open',r,{once:true}));
let next=0;
const call=(method,params={})=>new Promise((resolve,reject)=>{
 const id=++next,timeout=setTimeout(()=>{socket.removeEventListener('message',handler);reject(Error('CDP timeout'));},30000);
 const handler=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;clearTimeout(timeout);socket.removeEventListener('message',handler);m.error||m.result?.exceptionDetails?reject(Error(JSON.stringify(m))):resolve(m.result);};
 socket.addEventListener('message',handler);socket.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>(await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;
try{
 await call('Page.reload',{ignoreCache:true});
 let ready=false;
 for(let i=0;i<100&&!ready;i++){await new Promise(r=>setTimeout(r,200));ready=await evaluate('Boolean(globalThis.n3onGame?.scene.keys.menu&&!n3onGame.scene.isActive("boot"))');}
 if(!ready)throw Error('Game did not boot');
 const result=await evaluate(`(async()=>{
   const partial=${partial};
   const expected=JSON.parse(sessionStorage.getItem(partial?'adaptive-tutorial-partial':'adaptive-tutorial-reload'));
   if(!expected)throw Error('Run the tutorial audit first');
   const {SaveSystem:S}=await import('/src/game/systems/SaveSystem.ts');
   const before=JSON.stringify(S.getTutorialProgress());
   const profile=S.getActiveProfileSummary()?.id,collection=S.getModCollection();
   const chosen=collection.loadouts.find(l=>l.id===collection.activeLoadoutId).cardSlots.wildcard;
   for(const scene of n3onGame.scene.getScenes(false))n3onGame.scene.stop(scene.scene.key);
   await new Promise(r=>setTimeout(r,80));n3onGame.scene.start('menu');await new Promise(r=>setTimeout(r,350));
   const cases=partial?[{ok:profile===expected.profile,label:'partial profile remains selected after browser refresh'},
     {ok:before===JSON.stringify(expected.progress),label:'refresh during archive notice restores exact objective/message records'},
     {ok:!n3onGame.scene.keys.menu.tutorialDirector.isActive(),label:'delivered notice and initial introduction do not replay'},
     {ok:S.getTutorialProgress().trainingRoundsCompleted===0&&!S.getCampaignProgress().packages.training.eligible,label:'interrupted training stays incomplete; no reward'}]
     :[{ok:profile===expected.profile,label:'real browser reload retains the selected profile'},
     {ok:JSON.stringify(collection.cards.map(c=>c.instanceId).sort())===JSON.stringify(expected.cardIds),label:'real reload preserves exact card identities, no duplicate package'},
     {ok:chosen===expected.chosen,label:'real reload preserves chosen equipment'},
     {ok:S.getTutorialProgress().firstRunStage==='complete'&&!n3onGame.scene.keys.menu.tutorialDirector.isActive(),label:'completed teaching stays completed after real browser refresh'}];
   return {cases,errors:cases.filter(c=>!c.ok).map(c=>c.label)};
 })()`);
 await writeFile(partial?'artifacts/tutorial-partial-reload.json':'artifacts/adaptive-tutorial-reload.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));if(result.errors.length)process.exitCode=1;
}finally{socket.close();}
