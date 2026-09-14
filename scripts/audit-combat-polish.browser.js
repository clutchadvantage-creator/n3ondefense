(() => {
 const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
 const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],screenshots:[],frames:[]};
 const check=(ok,label,detail)=>{report.cases.push({ok:!!ok,label,detail});if(!ok)throw new Error(label);};
 const until=async(fn,label)=>{const start=performance.now();while(!fn()){if(performance.now()-start>25000)throw new Error(label);await wait(50);}};
 let arena,originalUpdate;
 report.promise=(async()=>{
  try{
   await until(()=>game.scene.getScene('arena'),'Arena registered');
   const {SaveSystem}=await import('/src/game/systems/SaveSystem.ts');
   const {TUTORIAL_SEQUENCES}=await import('/src/game/tutorial/TutorialRegistry.ts');
   SaveSystem.createProfile('Combat polish '+Date.now().toString().slice(-5));
   SaveSystem.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;p.completedSequences=TUTORIAL_SEQUENCES.map(s=>s.id);});
   for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
   for(const [protocol,round] of [['overdrive',25],['supreme-delphinus',148]]){
    report.current=protocol;
    game.scene.start('arena',{baseSeed:550055,round,protocol,objectiveMode:'open',runStartedAt:Date.now(),modsEarned:[],modFocus:null,contract:null,creditsSpentBeforeRun:0,upgradeCompletionPercentage:0,accountProgressionTier:'endgame',runCreditsEarned:0});
    arena=game.scene.getScene('arena');await until(()=>arena.roundRuntime?.phase==='active','Arena active');
    arena.player.invulnUntil=Infinity;arena.pointerLockInitialGate=false;
    originalUpdate=arena.sys.sceneUpdate;arena.sys.sceneUpdate=()=>{};arena.physics.pause();
    const audio=arena.audio,pool=audio.droneAudio;await pool.ready;await audio.context.resume();
    check(pool.stats().loaded&&!pool.stats().loadError,'Actual drone recording decoded '+protocol,pool.stats());
    check(Math.abs(pool.stats().duration-48.6)<.1,'Asset duration is measured, not assumed');
    for(const e of [...arena.enemies])arena.removeArcadeEnemy(e);
    const drones=Array.from({length:7},()=>arena.spawnEnemy('drone',false));
    drones.forEach((d,i)=>d.body.reset(arena.player.x+(i%2?-1:1)*(80+i*50),arena.player.y));
    audio.updateDroneAudio(arena.time.now+1000,arena.enemies,arena.player.x,arena.player.y);await wait(240);
    check(pool.stats().active===5&&pool.stats().owners===5,'Seven nearby drones use five owned emitters');
    check(pool.voices.every(v=>drones.slice(0,5).includes(v.owner)),'Closest drones receive channels');
    check(pool.voices.some(v=>v.pan.pan.value<0)&&pool.voices.some(v=>v.pan.pan.value>0),'Actual stereo panners track both sides');
    const ordered=pool.voices.slice().sort((a,b)=>Math.abs(a.owner.x-arena.player.x)-Math.abs(b.owner.x-arena.player.x));
    check(ordered[0].gain.gain.value>ordered.at(-1).gain.gain.value,'Farther channels have lower actual gain');
    const analyser=audio.context.createAnalyser();analyser.fftSize=2048;ordered[0].gain.connect(analyser);await wait(200);
    const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((n,s)=>n+s*s,0)/samples.length);
    ordered[0].gain.disconnect(analyser);analyser.disconnect();
    check(rms>1e-6,'Drone channel outputs a real WebAudio signal',rms);
    const victim=drones[0],ownedVoice=pool.voices.find(v=>v.owner===victim),source=ownedVoice.source;
    // Fill the normal death pool with the quiet tails of the original recording.
    for(const voice of audio.enemyDeathSfxPool){voice.currentTime=.7;await voice.play();}
    await wait(60);audio.lastEnemyDeathSfxAt=-Infinity;
    const credits=arena.roundCredits,kills=arena.pendingProgressEnemyKills;
    victim.takeDamage(100000,'weapon');arena.updateEnemies(arena.time.now,0);
    check(!victim.active&&!pool.voices.some(v=>v.owner===victim||v.source===source),'Actual death immediately retires its drone emitter');
    check(arena.roundCredits>credits&&arena.pendingProgressEnemyKills===kills+1,'Drone death preserves credits and kill bookkeeping');
    check(audio.enemyDeathSfxPool.some(v=>!v.paused&&v.currentTime<.25),'Drone death reuses normal bang recording even when silent tails occupied the pool');
    for(const d of drones)if(d.active)d.body.reset(arena.player.x+1000,arena.player.y);
    audio.updateDroneAudio(arena.time.now+2000,arena.enemies,arena.player.x,arena.player.y);await wait(70);
    check(pool.stats().active===0,'Leaving radius fades and stops every old source');
    audio.updateDroneAudio(arena.time.now+2200,arena.enemies,arena.player.x,arena.player.y);
    check(pool.stats().owners===0,'Out-of-range ownership is recycled');
    const ordinary=drones.find(d=>d.active);ordinary.body.reset(arena.player.x+200,arena.player.y);
    audio.updateDroneAudio(arena.time.now+2400,arena.enemies,arena.player.x,arena.player.y);
    check(pool.stats().active===1,'Reentering radius starts exactly one source');
    const ctrl=arena.arcadeController;check(ctrl.force('redline'),'Redline activates with ordinary drones');
    const event=ctrl.active;for(let i=0;i<9;i++)event.momentum.kill();ctrl.activeElapsedMs+=7000;ctrl.update(16);
    const eventDrones=[...event.owned.keys()];check(eventDrones.length>0,'Unchanged Critical escalation creates event drones');
    eventDrones.forEach((d,i)=>d.body.reset(arena.player.x+20+i*30,arena.player.y));
    audio.updateDroneAudio(arena.time.now+2700,arena.enemies,arena.player.x,arena.player.y);
    check(eventDrones.every(d=>pool.voices.some(v=>v.owner===d)),'Event drones use shared proximity channels');
    check(eventDrones.every(d=>!d.isTinted&&d.stats.color===ordinary.stats.color),'Redline keeps original drone body palette');
    ctrl.activeElapsedMs=event.startedAt+event.definition.durationMs;ctrl.update(16);
    check(eventDrones.every(d=>!d.active)&&pool.voices.every(v=>!eventDrones.includes(v.owner)),'Redline deadline removes only event audio owners');
    check(ordinary.active&&pool.voices.some(v=>v.owner===ordinary),'Ordinary drone and audio survive Redline termination');ctrl.stop('round-ended');
    for(const d of [...arena.enemies])if(d.airborne){d.takeDamage(100000,'weapon');}
    arena.updateEnemies(arena.time.now,0);
    check(pool.stats().active===0&&pool.stats().owners===0,'Rapid drone deaths leave no ambient source');
    const grunt=arena.spawnEnemy('grunt',false);const before=arena.pendingProgressEnemyKills;await wait(60);grunt.takeDamage(100000,'weapon');arena.updateEnemies(arena.time.now,0);
    check(!grunt.active&&arena.pendingProgressEnemyKills===before+1,'Normal mechanical enemy still follows shared death path');
    const effects=arena.mechanicalDestructionVfx;
    check(effects.fragments.some(f=>f.effect==='smoke')&&effects.fragments.some(f=>f.effect==='arc')&&effects.fragments.some(f=>f.effect==='spark'),'Shared death layers include smoke, residual arcs, and sparks');
    effects.update(arena.time.now+60,16);
    report.screenshots.push({label:'death-layers-'+protocol,png:await new Promise(r=>game.renderer.snapshot(img=>r(img.src)))});
    for(let i=0;i<80;i++)effects.emitEnemy('drone',arena.player.x,arena.player.y,0x59e5ff,arena.time.now);
    check(effects.stats().activeFragments<=168&&effects.stats().activeBursts<=96,'Mass destruction respects existing pool ceilings');
    effects.update(arena.time.now+1500,16);check(effects.stats().activeFragments===0&&effects.stats().activeBursts===0,'All layered destruction expires');
    const final=arena.spawnEnemy('drone',false);final.body.reset(arena.player.x+60,arena.player.y);audio.updateDroneAudio(arena.time.now+3000,arena.enemies,arena.player.x,arena.player.y);
    game.scene.pause('arena');check(pool.stats().active===0,'Scene pause stops drone audio');game.scene.resume('arena');
    audio.updateDroneAudio(arena.time.now+3200,arena.enemies,arena.player.x,arena.player.y);check(pool.stats().active===1,'Resume can restore a live owner');
    arena.sys.sceneUpdate=originalUpdate;originalUpdate=null;game.scene.stop('arena');await wait(100);
    check(pool.stats().owners===0&&pool.stats().active===0,'Scene shutdown clears every drone channel');
    check(audio.roundAudioDiagnostics().activeCount===0,'No round audio is orphaned after shutdown');
    check(Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e.parent?.scene===arena).length===0,'Scene shutdown releases Text canvases');
   }
  }catch(e){report.errors.push(String(e.stack??e));}
  finally{if(originalUpdate&&arena)arena.sys.sceneUpdate=originalUpdate;if(arena?.sys.isActive())game.scene.stop('arena');report.running=false;}
 })();return 'Combat polish audio and lifecycle audit started';
})();
