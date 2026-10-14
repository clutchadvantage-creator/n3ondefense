import { mkdir, writeFile } from 'node:fs/promises';
const targets = await fetch('http://127.0.0.1:9225/json/list').then(r => r.json());
const target = targets.find(t => t.type === 'page' && /127\.0\.0\.1:5182/.test(t.url));
if (!target) throw Error('Isolated collection browser required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let seq = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq, timeout = setTimeout(() => reject(Error('CDP timeout ' + method)), 30000);
  const listener = event => { const r = JSON.parse(event.data); if (r.id !== id) return; socket.removeEventListener('message', listener); clearTimeout(timeout); r.error || r.result?.exceptionDetails ? reject(Error(JSON.stringify(r))) : resolve(r.result); };
  socket.addEventListener('message', listener); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
const report = { cases: [], errors: [] };
await mkdir('artifacts/collection-layout', { recursive: true });
try {
  if (await evaluate('Boolean(globalThis.__n3onLayoutAudit?.running)')) throw Error('Another audit is running');
  await evaluate(`(async()=>{
    const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
    const dep=source.match(/import\\s*\\{[^}]*\\bSaveSystem\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)/)[1];
    const {SaveSystem:S}=await import(dep);
    const saveSource=await fetch(dep).then(r=>r.text());
    const storeDep=saveSource.match(/import\\s*\\{[^}]*\\bPlayerProfileStore\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)/)[1];
    const {PlayerProfileStore:P}=await import(storeDep);
    const catalog=await import('/src/game/collection/CollectionCatalog.ts'),model=await import('/src/game/collection/CollectionProgress.ts');
    const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);
    await wait(100);S.createProfile('Gallery '+Date.now().toString().slice(-7));S.setSettings({masterVolume:0,contextualTutorials:false});S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
    const walk=o=>[o,...(o.list??[]).flatMap(walk)];
    const click=(scene,label)=>{const button=scene.children.list.flatMap(walk).find(o=>o.type==='Container'&&o.list.some(c=>c.text===label));if(!button)throw Error('Missing '+label);button.list.find(c=>c.input).emit('pointerdown');};
    if(P.getActiveSave().collection!==S.getCollection())throw Error('Wrong save singleton');
    globalThis.__gallery={S,P,game,wait,walk,click,...catalog,...model};game.scene.start('garage');await wait(200);
  })()`);
  for (const [width, height] of [[1600,1000],[1280,720],[800,600]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const owned of [false,true]) {
      await evaluate(`(async()=>{const g=__gallery;const save=g.P.getActiveSave();save.collection=g.createCollectionState();if(${owned}){for(const r of g.RELICS)for(const f of r.fragments)g.acquireFragment(save.collection,f.id);for(const t of g.TROPHIES)g.advanceCollection(save.collection,{[t.metric]:t.target},true);save.collection.pending=[];save.collection.displayedTrophies=g.TROPHIES.slice(0,4).map(t=>t.id);save.collection.displayedRelics=g.RELICS.map(r=>r.id);}g.P.save();g.game.scene.stop('mods');g.game.scene.keys.garage.scene.restart();await g.wait(350);g.game.scene.keys.garage.collectionCelebrations.dismiss();})()`);
      for (const view of ['garage','trophies','relics']) {
        if (view !== 'garage') await evaluate(`(()=>{const g=__gallery,s=g.game.scene.keys.garage;if(!s.collectionWing)g.click(s,'TROPHIES & RELICS');if('${view}'==='relics')g.click(s,'RELICS');})()`);
        await evaluate('__gallery.wait(120)');
        const name = `${width}x${height}-${owned?'earned':'locked'}-${view}`;
        const png = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(`artifacts/collection-layout/${name}.png`, Buffer.from(png.data, 'base64'));
        const result = await evaluate(`(()=>{const g=__gallery,s=g.game.scene.keys.garage,root=s.collectionWing?.root??s.collectionDisplays;const text=g.walk(root).filter(o=>o.type==='Text'&&o.visible);return{texts:text.map(o=>o.text),outside:text.filter(o=>{const b=o.getBounds();return b.x< -1||b.y< -1||b.right>s.scale.width+1||b.bottom>s.scale.height+1;}).map(o=>({text:o.text,bounds:o.getBounds()})),size:{width:s.scale.width,height:s.scale.height},page:s.collectionWing?.page};})()`);
        report.cases.push({ name, ...result });
        if (result.outside.length) throw Error(name + ' text outside screen: ' + JSON.stringify(result.outside));
      }
      if (!owned) {
        await evaluate(`(async()=>{const g=__gallery;g.game.scene.keys.garage.collectionWing.close();const {MOD_DEFINITIONS}=await import('/src/game/mods/definitions.ts');if(!g.S.getModCollection().cards.length)g.S.addMod(MOD_DEFINITIONS.find(m=>m.rarity==='common').id);g.game.scene.stop('garage');g.game.scene.start('mods',{returnScene:'garage'});await g.wait(200);g.game.scene.keys.mods.showInfusionModal(g.S.getModCollection().cards[0]);})()`);
        for (const category of ['BANNED TECHNOLOGY','COSMETIC INFUSIONS']) {
          await evaluate(`(()=>{const g=__gallery;g.click(g.game.scene.keys.mods,'${category}');})()`);
          await evaluate('__gallery.wait(100)');
          const png = await call('Page.captureScreenshot', { format: 'png' });
          await writeFile(`artifacts/collection-layout/${width}x${height}-${category.split(' ')[0].toLowerCase()}-locked.png`, Buffer.from(png.data,'base64'));
        }
        await evaluate(`(async()=>{const g=__gallery;g.game.scene.stop('mods');g.game.scene.start('garage');await g.wait(200);})()`);
      }
    }
    console.log('Verified layout', width, height);
  }
} catch (error) { report.errors.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  await writeFile('artifacts/collection-layout.json', JSON.stringify(report,null,2)+'\n');
  await call('Emulation.clearDeviceMetricsOverride'); socket.close();
}
