// Focused CDP input regression check; isolated DEV browser/profile, no score uploads.
// Uses actual mouse/key dispatch. Aim, energy, cooldowns and enemy placement are
// test controls; encounter initialization, placement validation and firing are real.
import { writeFile } from 'node:fs/promises';
const output = process.argv[2] ?? 'artifacts/boss-input-turret.json';
const pages = await fetch('http://127.0.0.1:9225/json/list').then(r => r.json());
const page = pages.find(p => p.type === 'page' && /localhost:5173|127\.0\.0\.1:5173/.test(p.url));
if (!page) throw Error('Start an isolated DEV browser on port 9225 with Vite on 5173.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => socket.addEventListener('open', r, { once: true }));
let sequence = 0;
const pending = new Map(), report = { checks: [], errors: [], samples: [] };
socket.addEventListener('message', e => {
  const message = JSON.parse(e.data);
  if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  if (message.method === 'Runtime.exceptionThrown') report.errors.push(message.params.exceptionDetails);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => reject(Error('CDP timeout: ' + method)), 20000);
  pending.set(id, message => { clearTimeout(timer); message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result); });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const check = (ok, label) => { report.checks.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
const until = async (expression, label) => {
  const end = Date.now() + 15000;
  while (!(await evaluate(expression))) { if (Date.now() > end) throw Error('Timeout: ' + label); await wait(50); }
};
const key = async (code, key, number, duration = 70) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number });
  await wait(duration);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number });
  await wait(70);
};
const click = async point => {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
  await wait(150);
};
const buttonPoint = () => evaluate(`(()=>{const b=a.bossIntroOverlay?.ready.element??a.supremeFinaleOverlay?.ready.element;
 const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)===b};})()`);
try {
  await send('Runtime.enable');
  await send('Page.reload');
  await wait(1000);
  await until('!!globalThis.n3onGame?.scene?.keys?.arena', 'boot');
  await evaluate(`(async()=>{
    if(globalThis.__n3onLayoutAudit?.running || globalThis.__n3onMixedSession?.running)throw Error('Another fixture is running');
    const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
    const dependency=name=>source.split(String.fromCharCode(10)).find(line=>line.startsWith('import { '+name+' }')).split('"')[1];
    globalThis.S=(await import(dependency('SaveSystem'))).SaveSystem;
    globalThis.Transitions=(await import(dependency('RunTransitionManager'))).RunTransitionManager;
    globalThis.protocolFor=(await import('/src/game/progression/CampaignProgression.ts')).getCampaignProtocol;
    for(const s of n3onGame.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())n3onGame.scene.stop(s.scene.key);
    if(!S.createProfile('Boss input '+Date.now().toString().slice(-6)).ok)throw Error('Profile setup failed');
    S.setSettings({masterVolume:0,contextualTutorials:false});S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
  })()`);
  for (const [mode, round, startKind] of [['normal',5,'mouse'],['normal',4,'mouse'],['normal',5,'mouse'],['overdrive',5,'mouse'],['supreme',5,'controller'],['supreme',30,'mouse']]) {
    const label = `${mode} ${round} ${startKind}`;
    console.log('Checking ' + label);
    await evaluate(`(async()=>{
      for(const s of n3onGame.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())n3onGame.scene.stop(s.scene.key);
      await new Promise(r=>setTimeout(r,100));
      n3onGame.scene.start('menu'); await new Promise(r=>setTimeout(r,100));
      const menu=n3onGame.scene.keys.menu;Transitions.clearForMenu(menu);
      Transitions.requestArenaTransition(menu,{reason:'new-run',session:{baseSeed:550055,round:${round},protocol:protocolFor('${mode}',${round}),objectiveMode:'open',equippedMods:[],modsEarned:[]}});
    })()`);
    await until('n3onGame.scene.isActive("loading") && Transitions.snapshot(n3onGame.scene.keys.loading).lastStep === "awaiting-user-deploy-confirmation"', label + ' deploy ready');
    await click(await evaluate(`(()=>{const r=n3onGame.canvas.getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.81};})()`));
    await until('n3onGame.scene.isActive("arena") && !!n3onGame.scene.keys.arena.player?.active && n3onGame.scene.keys.arena.roundRuntime.phase === "active"', label + ' initialized');
    await evaluate(`{globalThis.a=n3onGame.scene.keys.arena;a.player.invulnUntil=Infinity;globalThis.shots=0;globalThis.attacks=0;
      globalThis.originalObtain=a.obtainProjectile;globalThis.originalCue=a.playBossAttackCue;
      a.obtainProjectile=(spec)=>{if(spec.from==='turret')shots++;return originalObtain.call(a,spec);};
      a.playBossAttackCue=(kind)=>{attacks++;return originalCue.call(a,kind);};
      globalThis.oldBombsiteOwner=globalThis.currentBombsiteOwner;globalThis.currentBombsiteOwner=a.bombsiteMods;void 0;}`);
    check(await evaluate('!!a.bombsiteMods && a.bombsiteMods!==oldBombsiteOwner'), label + ': fresh bombsite effects owner');
    if (round % 5 === 0) {
      const point = await buttonPoint();
      report.samples.push(await evaluate(`({label:${JSON.stringify(label)},phase:a.bossFlowPhase,lockedDuringIntro:!!document.pointerLockElement,capturePromptHidden:a.pointerLock.overlay.hidden})`));
      check(await evaluate('!document.pointerLockElement'), label + ': Loading mouse capture released for intro');
      check(point.hit, label + ': READY is the actual mouse hit target immediately');
      await key('KeyF','f',70);
      check(await evaluate('a.turrets.length===0 && a.bossFlowPhase==="intro"'), label + ': F gated during intro');
      if (startKind === 'controller') {
        await evaluate(`globalThis.originalPads=navigator.getGamepads.bind(navigator);globalThis.pad={id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:performance.now()};navigator.getGamepads=()=>[pad];`);
        await wait(100);
        await evaluate('pad.buttons[0]={pressed:true,value:1,touched:true};pad.timestamp=performance.now()');
        await wait(100);
        await evaluate('pad.buttons[0]={pressed:false,value:0,touched:false};pad.timestamp=performance.now()');
      } else await click(point);
      await until('a.bossFlowPhase==="combat" && a.state.state!=="Paused"', label + ' starts without pause');
      check(true, label + ': immediate fight start without pause/unpause');
      if (startKind === 'controller') {
        check(await evaluate('a.playerInput.activeDevice==="gamepad"'), label + ': controller confirm');
        await evaluate('navigator.getGamepads=originalPads');
        await wait(100);
        // Explicit capture before switching this controller case to F-key tests.
        await evaluate('a.state.set("Paused");a.physics.pause();a.pointerLock.showResume()');
        await click({x:620,y:350});
      }
    } else {
      check(await evaluate('a.pointerLock.locked || !a.pointerLock.overlay.hidden'), label + ': ordinary capture or explicit click-to-play');
      if (!(await evaluate('a.pointerLock.locked'))) await click({x:620,y:350});
      await until('a.state.state!=="Paused"', label + ' ordinary start');
    }
    check(await evaluate('a.playerInput.bindings.turret === "Keyboard:KeyF"'), label + ': F binding unchanged');
    await evaluate(`globalThis.originalAim=a.getAimWorldPoint.bind(a);globalThis.aim={x:a.player.x,y:a.player.y};a.getAimWorldPoint=()=>aim;
      globalThis.choosePoint=(kind)=>{
        const b=a.layout.generation.bounds,site=a.bombSites.sites[0],boss=a.activeMajorBosses()[0];let center=kind==='boss'&&boss?boss:kind==='site'&&site?site:a.player;
        if(kind==='wall'){const w=a.wallRects.find(w=>w.x>b.x+60&&w.x<b.x+b.w-60);if(w)center={x:w.x,y:w.y};}
        if(kind==='edge')center={x:b.x+40,y:b.y+b.h/2};
        for(let radius=kind==='site'?90:60;radius<=260;radius+=20)for(let i=0;i<32;i++){const x=center.x+Math.cos(i*Math.PI/16)*radius,y=center.y+Math.sin(i*Math.PI/16)*radius;if(a.isValidPlacement(x,y)&&!a.intersectsWallGeometry(x,y,18,18))return {x,y};}
        throw Error('No valid '+kind+' point');
      };
      globalThis.prepare=(kind)=>{aim=choosePoint(kind);a.player.energy=a.player.energyStats.max;a.abilityCooldownUntil.turret=0;a.abilityCooldownUntil.fence=0;return aim;};`);
    // Exact invalid wall/site/edge positions must remain denied.
    for (const kind of round % 5 ? ['edge','wall','site'] : ['edge','wall']) {
      await evaluate(`{prepare('edge');const b=a.layout.generation.bounds,w=a.wallRects[0],s=a.bombSites.sites[0];aim=${kind==='edge'?'{x:b.x,y:b.y}':kind==='wall'?'{x:w.x+w.w/2,y:w.y+w.h/2}':'{x:s.x,y:s.y}'};}`);
      const before=await evaluate('a.turrets.length'); await key('KeyF','f',70);
      check(await evaluate(`a.turrets.length===${before}`), label + ': invalid ' + kind + ' denied');
    }
    for (const kind of ['boss','wall','edge', ...(round % 5 ? ['site'] : [])]) {
      await evaluate(`for(const t of a.turrets)t.takeDamage(1e9);a.updateAbilities(a.time.now,0);prepare('${kind}');`);
      await key('KeyQ','q',81); // Real fence placement before the turret.
      const before=await evaluate('a.turrets.length');
      await key('KeyF','f',70);
      check(await evaluate(`a.turrets.length===${before+1}`), label + ': F turret near ' + kind + ', with deployables');
      // Aim at a nearby real enemy through the normal target list on ordinary rounds.
      if (round % 5) await evaluate(`{const t=a.turrets.at(-1);globalThis.testEnemy=a.spawnEnemy('shooter',false,{x:t.sprite.x+90,y:t.sprite.y});void 0;}`);
      await wait(250);
    }
    // Keep two turrets alive if the authored active limit allows it.
    await evaluate(`prepare('boss');`);
    const before=await evaluate('a.turrets.length'), cap=await evaluate('a.getAbilityConfig("turret").maxActive');
    await key('KeyF','f',70);
    check(await evaluate(`a.turrets.length===${Math.min(before+1,cap)}`), label + ': repeated placement respects active limit');
    await wait(1600);
    const sample=await evaluate(`({label:${JSON.stringify(label)},shots,attacks,turrets:a.turrets.length,enemyCount:a.enemies.length,state:a.state.state})`);
    report.samples.push(sample);check(sample.shots>0, label + ': turret acquires target and registers projectiles');
    const position=await evaluate('({x:a.player.x,y:a.player.y})');
    await key('KeyD','d',68,150);
    check(await evaluate(`Math.hypot(a.player.x-${position.x},a.player.y-${position.y})>0`), label + ': keyboard movement');
    await key('Escape','Escape',27);
    check(await evaluate('a.state.state==="Paused"'), label + ': pause');
    await wait(200); // The production pause console debounces input for 150 ms.
    await key('Escape','Escape',27);
    await wait(1300); // Chromium refuses immediate recapture after Escape.
    await click({x:620,y:350});
    await until('a.state.state!=="Paused"', label + ': resume');
    check(true,label + ': pause/resume and capture prompt mouse interaction');
    await evaluate(`globalThis.deadTurrets=a.turrets.slice();for(const t of deadTurrets)t.takeDamage(1e9);`);
    await wait(100);
    check(await evaluate('a.turrets.length===0 && deadTurrets.every(t=>!t.sprite.active)'), label + ': turret destruction');
    await evaluate(`a.getAimWorldPoint=originalAim;a.obtainProjectile=originalObtain;a.playBossAttackCue=originalCue;n3onGame.scene.stop('arena');void 0;`);await wait(100);
    check(await evaluate('a.children.list.length===0 && a.turrets.length===0 && currentBombsiteOwner.stateBySite.size===0 && !document.querySelector(".arena-command-button") && !document.querySelector(".gameplay-pointer-lock")'), label + ': encounter cleanup');
  }
  check(report.errors.length===0,'no browser exceptions');
} catch (error) { report.failure=String(error.stack??error);process.exitCode=1; }
finally {
  await evaluate(`if(globalThis.originalPads)navigator.getGamepads=originalPads;for(const s of n3onGame.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())n3onGame.scene.stop(s.scene.key);void 0;`).catch(()=>{});
  await writeFile(output,JSON.stringify(report,null,2));socket.close();
  console.log(JSON.stringify({checks:report.checks.length,errors:report.errors.length,failure:report.failure,output}));
}
