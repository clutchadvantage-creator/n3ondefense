// Use the isolated development browser; never point this fixture at a personal profile.
import { writeFile } from 'node:fs/promises';
const targets = await fetch('http://127.0.0.1:9225/json/list').then(r => r.json());
const target = targets.find(t => t.type === 'page' && /127\.0\.0\.1:5182/.test(t.url));
if (!target) throw Error('Isolated collection browser required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timeout = setTimeout(() => reject(Error('CDP timeout: ' + method)), 30000);
  const listener = event => {
    const r = JSON.parse(event.data); if (r.id !== id) return;
    socket.removeEventListener('message', listener); clearTimeout(timeout);
    r.error || r.result?.exceptionDetails ? reject(Error(JSON.stringify(r))) : resolve(r.result);
  };
  socket.addEventListener('message', listener); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
const report = { checks: [], errors: [] };
const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, detail }); if (!pass) throw Error(name); };
const installHelpers = async () => evaluate(`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(fn)=>{const end=performance.now()+20000;while(!fn()){if(performance.now()>end)throw Error('Browser state timeout');await wait(40);}};
  await until(()=>globalThis.n3onGame?.scene.keys.menu && globalThis.n3onGame.textures.exists('trophy-veteran-operative'));
  const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
  const dep=source.match(/import\\s*\\{[^}]*\\bSaveSystem\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)/)[1];
  const {SaveSystem:S}=await import(dep),game=n3onGame;
  const walk=o=>[o,...(o.list??[]).flatMap(walk)];
  const click=(scene,label)=>{const b=scene.children.list.flatMap(walk).find(o=>o.type==='Container'&&o.list.some(c=>c.text===label));if(!b)throw Error('Missing '+label);b.list.find(c=>c.input).emit('pointerdown');};
  globalThis.__reloadAudit={S,game,wait,until,walk,click};
})()`);
try {
  if (await evaluate('Boolean(globalThis.__n3onLayoutAudit?.running)')) throw Error('Another browser audit is running');
  await installHelpers();
  const expected = await evaluate(`(async()=>{
    const {S,game,wait}=__reloadAudit;
    for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);
    await wait(100);S.createProfile('Reload '+Date.now().toString().slice(-7));S.setSettings({masterVolume:0,contextualTutorials:false});
    S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
    for(const id of ['cipher-crown','cipher-sigil','cipher-seal','core-housing'])if(!S.collectRelicFragment(id))throw Error('Failed pickup');
    S.recordCollectionMetric('round',29,true);
    if(S.getCollection().unlockedTrophies.includes('veteran-operative'))throw Error('Veteran unlocked early');
    S.recordCollectionMetric('round',30,true);
    S.toggleCollectionDisplay('trophies','veteran-operative');S.toggleCollectionDisplay('relics','identity-cipher');
    return{profile:S.getActiveProfileSummary().id,collection:S.getCollection()};
  })()`);
  check('Veteran unlocks at Round 30', expected.collection.unlockedTrophies.includes('veteran-operative'));
  await call('Page.reload', { ignoreCache: true });
  await new Promise(resolve => setTimeout(resolve, 800));
  await installHelpers();
  const restored = await evaluate(`(()=>{const {S}=__reloadAudit;return{profile:S.getActiveProfileSummary()?.id,collection:S.getCollection()};})()`);
  check('actual browser reload preserves profile and collection', JSON.stringify(restored) === JSON.stringify(expected));
  check('pending fragment and trophy receipts survive reload', restored.collection.pending.length === 5);
  check('both display selections survive reload', restored.collection.displayedTrophies[0] === 'veteran-operative' && restored.collection.displayedRelics[0] === 'identity-cipher');
  await evaluate(`(async()=>{const g=__reloadAudit;for(const s of g.game.scene.getScenes(false))if(s.sys.isActive())g.game.scene.stop(s.scene.key);await g.wait(100);g.game.scene.start('menu');await g.until(()=>g.game.scene.keys.menu.collectionCelebrations?.active);await g.wait(1400);})()`);
  const firstReveal = await evaluate(`(()=>{const g=__reloadAudit,s=g.game.scene.keys.menu;const texts=s.children.list.flatMap(g.walk).filter(o=>o.type==='Text').map(o=>o.text);s.input.keyboard.emit('keydown-ESC');return{first:texts.includes('1 / 3 FRAGMENTS SECURED'),dismissed:!s.collectionCelebrations.active,pending:g.S.getCollection().pending.length,menu:g.game.scene.isActive('menu')};})()`);
  check('reloaded queue reveals one fragment at a time', firstReveal.first);
  check('Escape defers the menu reveal without consuming ownership', firstReveal.dismissed && firstReveal.pending === 5 && firstReveal.menu);
  await evaluate(`(async()=>{const g=__reloadAudit;g.game.scene.stop('menu');g.game.scene.start('garage');await g.until(()=>g.game.scene.keys.garage.collectionCelebrations?.active);await g.wait(1400);const s=g.game.scene.keys.garage;g.click(s,'NEXT REWARD');await g.wait(1400);s.input.keyboard.emit('keydown-ESC');})()`);
  check('Garage acknowledgment consumes exactly one receipt', await evaluate('__reloadAudit.S.getCollection().pending.length===4'));
  await call('Page.reload', { ignoreCache: true });
  await new Promise(resolve => setTimeout(resolve, 800));
  await installHelpers();
  const after = await evaluate('__reloadAudit.S.getCollection()');
  check('acknowledgment persists through a second reload', after.pending.length === 4 && after.pending[0].itemId === 'cipher-sigil' && after.fragments.length === 4);
  report.profile = expected.profile;
} catch (error) { report.errors.push(String(error.stack ?? error)); process.exitCode = 1; }
finally { await writeFile('artifacts/collection-persistence.json', JSON.stringify(report,null,2)+'\n'); socket.close(); }
console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors }));
