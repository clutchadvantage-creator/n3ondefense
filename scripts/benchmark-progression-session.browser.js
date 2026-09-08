// DEV-only, real Phaser simulation. Evaluate with dev-cdp-eval.mjs, then poll
// __n3onMixedSoak. No page reload, GC, enemy limits, or quality changes.
(() => {
  if (globalThis.__n3onMixedSoak?.running) throw new Error('Mixed soak already running');
  const options = { startRound:55, protocol:'supreme-gemini', heists:true, rounds:16, sampleMs:20000, primePressure:true, ...(globalThis.__n3onMixedSoakOptions ?? {}) };
  const previous=options.resumeExisting?globalThis.__n3onMixedSoak:null;
  const report = globalThis.__n3onMixedSoak = previous ? {
    ...previous,running:true,options,errors:[],
    interruptions:[...(previous.interruptions??[]),{at:new Date().toISOString(),round:previous.round,errors:previous.errors}],
  } : {
    running: true, options, startedAt: new Date().toISOString(), round: 0,
    checkpoints: [], encounters: [], boundaries: [], errors: [], coverage: {},
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (predicate, label, timeout = 20000) => {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now() - start > timeout) throw new Error(`Timed out: ${label}`);
      await wait(50);
    }
  };
  const game = globalThis.n3onGame;
  const count = emitter => emitter?.eventNames?.().reduce((n, e) => n + emitter.listenerCount(e), 0) ?? 0;
  const coverage = key => report.coverage[key] = (report.coverage[key] ?? 0) + 1;
  const sceneStats = scene => {
    const types = {};
    const visit = object => {
      types[object.type] = (types[object.type] ?? 0) + 1;
      if (object.type === 'Container') object.list?.forEach(visit);
    };
    scene.children?.list?.forEach(visit);
    const world = scene.physics?.world;
    const updateList = scene.sys.updateList;
    return {
      key: scene.scene.key, status: scene.sys.settings.status,
      active: scene.sys.isActive(), visible: scene.sys.isVisible(), sleeping: scene.sys.isSleeping(),
      display: scene.children?.list?.length ?? 0, types,
      update: updateList?._active?.length ?? 0, updatePending: updateList?._pending?.length ?? 0,
      bodies: world?.bodies?.size ?? 0, staticBodies: world?.staticBodies?.size ?? 0,
      pendingBodies: world?.pendingDestroy?.size ?? 0,
      physicsPaused: world?.isPaused ?? null,
      colliders: world?.colliders?._active?.length ?? 0,
      colliderPending: world?.colliders?._pending?.length ?? 0,
      timers: scene.time?._active?.length ?? 0, delayed: scene.time?._pendingInsertion?.length ?? 0,
      tweens: scene.tweens?.tweens?.length ?? 0,
      listeners: count(scene.events), input: count(scene.input), keyboard: count(scene.input?.keyboard),
      cameras: scene.cameras?.cameras?.length ?? 0,
      // Text made with add:false escapes DisplayList cleanup. The CanvasPool
      // retains its owner, so inspect that ownership as well as scene roots.
      canvasOwners: Phaser.Display.Canvas.CanvasPool.pool.filter(entry=>entry.parent?.scene===scene).length,
      retained: Object.fromEntries(Object.entries(scene).filter(([,v]) => Array.isArray(v) || v instanceof Map || v instanceof Set)
        .map(([k,v]) => [k, Array.isArray(v) ? v.length : v.size])),
    };
  };
  const snap = label => {
    const arena = game.scene.getScene('arena');
    const entry = {
      label, round: report.round, atMs: performance.now(),
      scenes: game.scene.scenes.map(sceneStats),
      resizeListeners: game.scale.listenerCount('resize'), gameListeners: count(game.events),
      audio: game.sound?.sounds?.length ?? 0,
      diagnostic: arena.captureRoundRuntimeDiagnostics?.(),
      ownership: arena.encounterResources?.snapshot?.(),
      lifecycle: arena.roundRuntime?.snapshot?.(),
      globals: globalThis.__n3onGlobalListenerCounts?.(),
      heist: globalThis.n3onHeistPerf?.(),
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
    };
    report.checkpoints.push(entry);
    return entry;
  };
  const errorHandler = event => report.errors.push(String(event.error?.stack ?? event.message ?? event.reason));
  const originalGamepads = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
  const pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true,
    mapping: 'standard', axes: [0, 0, 1, 0], buttons: Array.from({length:17}, () => ({ pressed:false, touched:false, value:0 })), timestamp: 0 };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => { pad.timestamp = performance.now(); return [pad]; } });
  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', errorHandler);
  // Observe the whole session, including events and presentations between the
  // focused combat windows. Keep handoff intervals distinct from steady phases.
  const continuous=report.continuousFrames={buckets:{},transitions:[]};
  let previousFrameAt,previousFramePhase;
  const frameClock=()=>{
    const now=performance.now(),arena=game.scene.getScene('arena');
    const active=game.scene.getScenes(true).map(scene=>scene.scene.key).join('+');
    const phase=active==='arena'
      ? arena.supremeVictorySequence?'arena/credits'
        : arena.arcadeController?.activeEventId?`arcade/${arena.arcadeController.activeEventId}`
          : arena.bossFlowPhase&&arena.bossFlowPhase!=='none'?`arena/boss/${arena.bossFlowPhase}`
            : `arena/${arena.roundRuntime?.phase}/${arena.state?.state}`
      : active||'transition';
    if(previousFrameAt!==undefined){
      const ms=now-previousFrameAt;
      if(phase!==previousFramePhase)continuous.transitions.push({from:previousFramePhase,to:phase,ms});
      else{
        const bucket=continuous.buckets[phase]??(continuous.buckets[phase]={count:0,totalMs:0,maxMs:0,histogram:{}});
        bucket.count++;bucket.totalMs+=ms;bucket.maxMs=Math.max(bucket.maxMs,ms);
        const bin=Math.ceil(ms);bucket.histogram[bin]=(bucket.histogram[bin]??0)+1;
      }
    }
    previousFrameAt=now;previousFramePhase=phase;
  };
  game.events.on('step',frameClock);
  const activate = arena => {
    arena.playerInput.adoptDevice('gamepad');
    arena.pointerLockInitialGate = false;
    if (arena.state.state === 'Paused') arena.state.set('PrePlant');
    arena.physics.resume();
    arena.player.invulnUntil = Infinity;
  };
  const collectArena = arena => {
    for (const pickup of [...arena.pickups, ...arena.modPickups]) {
      pickup.collectibleAt = 0;
      pickup.sprite.setPosition(arena.player.x, arena.player.y);
      if (pickup.lootMotion) { pickup.lootMotion.settled = true; pickup.lootMotion.z = 0; }
    }
    arena.updatePickups(arena.time.now, 0);
    arena.updateModPickups(arena.time.now, 0);
  };
  const dismissReveals = async () => {
    const reveal = game.scene.getScene('legendary-mod-reveal');
    if (!reveal.sys.isActive()) return;
    snap('mod-reveal'); coverage('modReveal');
    await wait(2200);
    reveal.completeOwnerHandoff();
    reveal.scene.stop();
    await wait(100);
  };
  let probe, exercises;
  report.promise = (async () => {
    try {
      if (!game) throw new Error('DEV game is not ready');
      const previousProbe=previous?.probe;
      probe=await (await import('/scripts/progression-probe.js')).createProgressionProbe(game,report);
      if(previousProbe) {
        Object.assign(report.probe.phases,previousProbe.phases);
        for(const key of ['longTasks','network','checkpoints'])report.probe[key].push(...previousProbe[key]);
      }
      const { SaveSystem } = await import('/src/game/systems/SaveSystem.ts');
      const { startArenaLoad } = await import('/src/game/utils/runFlow.ts');
      const { MOD_DEFINITIONS } = await import('/src/game/mods/definitions.ts');
      const { getSpawnProfile, getConcurrentSpawnPressure, ENEMY_BALANCE } = await import('/src/game/config/balance/index.ts');
      const supreme = MOD_DEFINITIONS.find(d => d.rarity === 'supreme');
      exercises = options.enhanced ? await (await import('/scripts/progression-exercises.js')).createProgressionExercises({game,report,pad,wait,until,coverage}) : null;
      if(previous?.gameplayChecks)report.gameplayChecks.unshift(...previous.gameplayChecks);
      if(!previous&&!options.reuseProfile)exercises?.setupProfile(options.protocol, options.initialHighestRound);
      try { SaveSystem.get(); } catch { SaveSystem.createProfile('Mixed Soak'); }
      if(options.reuseProfile&&SaveSystem.getSupremeHighestRound()!==options.startRound-1) {
        throw new Error('Saved Supreme round does not match the requested continuation');
      }
      SaveSystem.updateTutorialProgress(p => { p.firstRunStage = 'complete'; });
      const settings = SaveSystem.get().settings;
      SaveSystem.setSettings({ hud: { ...settings.hud, scale: 1.3, textScale: 1.15, edgePosition: 0.3, panelOpacity: 0.65 } });
      if(!previous)for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
      const session = { baseSeed: options.seed??550055, round: options.startRound, objectiveMode: 'open', protocol: options.protocol,
        equippedMods: exercises?.loadout(options.protocol),
        runStartedAt: Date.now(), modsEarned: [], modFocus: null, contract: null,
        creditsSpentBeforeRun: 0, upgradeCompletionPercentage: 0, accountProgressionTier: 'endgame', runCreditsEarned: 0 };
      if(!previous)game.scene.start('arena', session);
      await until(() => game.scene.getScene('arena').roundRuntime?.phase === 'active', 'first arena');
      if(!previous)globalThis.n3onRoundLifecycleSoak(options.rounds + 8);
      const firstIndex=previous?game.scene.getScene('arena').roundManager.round-options.startRound:0;
      if(previous)snap('harness-resumed-existing-generation');
      for (let i = firstIndex; i < options.rounds; i++) {
        report.round = i + 1;
        const arena = game.scene.getScene('arena');
        await until(() => arena.sys.isActive() && arena.roundRuntime.phase === 'active', 'arena active');
        activate(arena);
        const alreadySampled=report.encounters.some(e=>e.index===i+1);
        if(!alreadySampled) {
        probe.phase(`round-${arena.roundManager.round}/first-20s`);probe.checkpoint('initialized');
        if (options.primePressure) {
          // Start at the existing encounter's normal pressure budget so a
          // short soak sample includes mature combat, not just spawn grace.
          const pressure = getConcurrentSpawnPressure(getSpawnProfile(arena.roundManager.round,0),0);
          const multiplier = arena.currentModeBalance().activePressureMultiplier;
          const countCap = Math.round(pressure.activeCountCap*multiplier);
          let weight = arena.enemies.reduce((n,e)=>n+ENEMY_BALANCE[e.stats.type].weight,0);
          const types = ['grunt','shooter','grunt','tank','disruptor','star'];
          for(let n=arena.enemies.length;n<countCap;n++) {
            const type=types[n%types.length], cost=ENEMY_BALANCE[type].weight;
            if(weight+cost>pressure.activeWeightCap*multiplier) break;
            arena.spawnEnemy(type,false); weight+=cost;
          }
        }
        exercises?.prepareCombat(arena);
        snap('round-active');
        const frameTimes = [], updateTimes = [];
        const onStep = (time, delta) => {
          if(!arena.sys.isActive()||arena.legendaryRevealInProgress) return;
          if (Number.isFinite(delta)) frameTimes.push(delta);
          const target=arena.enemies.find(e=>e.active);
          if(target) { const dx=target.x-arena.player.x,dy=target.y-arena.player.y,d=Math.hypot(dx,dy)||1;
            pad.axes[2]=dx/d;pad.axes[3]=dy/d; }
          pad.axes[0]=Math.sin(time*.0007)*.4;pad.axes[1]=Math.cos(time*.0007)*.4;
          pad.buttons[7]={pressed:true,touched:true,value:1};
        };
        const originalUpdate = arena.sys.sceneUpdate;
        arena.sys.sceneUpdate = function (...args) {
          const start = performance.now();
          try { return originalUpdate.apply(this, args); }
          finally { updateTimes.push(performance.now() - start); }
        };
        game.events.on('step', onStep);
        await wait(options.sampleMs);
        probe.checkpoint('first-window-end');
        if((options.sustainedRounds ?? [67,68,69]).includes(arena.roundManager.round)){
          probe.phase(`round-${arena.roundManager.round}/sustained`);
          const framesStart=frameTimes.length,updatesStart=updateTimes.length;
          await wait(options.sustainedMs??20000);
          report.sustained??=[];
          const mean=xs=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);
          report.sustained.push({round:arena.roundManager.round,firstFrameMs:mean(frameTimes.slice(0,framesStart)),lateFrameMs:mean(frameTimes.slice(framesStart)),
            firstUpdateMs:mean(updateTimes.slice(0,updatesStart)),lateUpdateMs:mean(updateTimes.slice(updatesStart))});
          probe.checkpoint('sustained-window-end');
        }
        game.events.off('step', onStep);
        arena.sys.sceneUpdate = originalUpdate;
        pad.axes[0]=0;pad.axes[1]=0;pad.buttons[7]={pressed:false,touched:false,value:0};
        const summary = values => {
          values.sort((a,b) => a-b);
          return { n: values.length, mean: values.reduce((a,b)=>a+b,0)/Math.max(1,values.length),
            p95: values[Math.floor(values.length*.95)] ?? 0, p99: values[Math.floor(values.length*.99)] ?? 0 };
        };
        report.encounters.push({ index: i + 1, round: arena.roundManager.round,
          frames: summary(frameTimes), update: summary(updateTimes), diagnostic: arena.captureRoundRuntimeDiagnostics(),
          preparation: globalThis.n3onArenaPreparation?.(), performance: globalThis.n3onArenaPerformanceReport?.() });
        await dismissReveals();
        coverage('ordinaryRound');
        if(exercises && i%(options.menuEvery??3)===0){probe.phase(`round-${arena.roundManager.round}/menus`);await exercises.menus(arena);}
        }
        if (i % 4 === 0 || i % 4 === 3) {
          const ids=options.arcadeIds??['redline','hot-package'];
          const id=ids[(report.coverage.arcadeEvent??0)%ids.length];
          probe.phase(`round-${arena.roundManager.round}/arcade-${id}`);
          if(arena.arcadeController.activeEventId){
            arena.arcadeController.resolveActive({success:true});collectArena(arena);await dismissReveals();
            coverage('naturallyScheduledArcadeResolved');await wait(1200);
          }
          if (!globalThis.forceArcadeEvent(id)) throw new Error(`Cannot start event ${id}`);
          snap('event-active'); await wait(options.arcadeSampleMs??2000);
          arena.arcadeController.resolveActive({ success: true });
          collectArena(arena); await dismissReveals();
          await wait(1200); snap('event-retired'); coverage('arcadeEvent'); coverage(`arcade/${id}`);
        }
        if (options.heists && i % (options.heistEvery??4) === 2 && !alreadySampled) {
          probe.phase(`round-${arena.roundManager.round}/heist`);
          // A naturally scheduled Arcade event can begin during a long sample.
          // Resolve it through its normal outcome before requesting an anomaly.
          if(arena.arcadeController.activeEventId) {
            arena.arcadeController.resolveActive({success:true});
            collectArena(arena);await dismissReveals();await wait(200);
          }
          if (!globalThis.forceAnomaly('heist')) throw new Error('Cannot start HEIST');
          globalThis.forceAnomalyCharge();
          await until(() => arena.anomalyController.visual?.readyForInteraction, 'portal formation');
          arena.player.body.reset(arena.anomalyController.visual.x, arena.anomalyController.visual.y);
          if (!arena.anomalyController.tryEnterDevBypass()) throw new Error('Cannot enter HEIST');
          await until(() => game.scene.getScene('anomaly-heist').sys.isActive(), 'HEIST entry');
          const heist = game.scene.getScene('anomaly-heist');
          heist.inputController.adoptDevice('gamepad'); heist.player.invulnUntil = Infinity;
          await until(() => !heist.physics.world.isPaused, 'HEIST gameplay input');
          snap('heist-active'); coverage('heistEntry');
          // Exercise the actual Options return and resize paths with current,
          // non-default player settings during every preserved Arena visit.
          heist.pauseHeist();
          heist.scene.launch('options',{returnScene:'anomaly-heist',resumePausedScene:true});
          heist.scene.pause();
          await until(()=>game.scene.getScene('options').sys.isActive(),'HEIST Options');
          SaveSystem.setSettings({hud:{...SaveSystem.get().settings.hud,scale:i%8===2?1.4:.85,edgePosition:.2}});
          game.scene.getScene('options').handleEscReturn();
          await until(()=>heist.sys.isActive()&&!heist.manuallyPaused,'HEIST Options return');
          game.scale.resize(i%8===2?1280:1440,i%8===2?800:900);
          await wait(200);
          if(JSON.stringify(heist.hud.settings)!==JSON.stringify(SaveSystem.get().settings.hud)) throw new Error('HEIST settings not current');
          coverage('heistOptionsResize');
          heist.facility.setVaultDoorOpen(true); heist.setPhase('looting');
          if(exercises)await exercises.heist(heist);
          for (const container of heist.containers) heist.damageContainer(container, container.maximumHp);
          // Same high-value stack every run: preserves the exact currency roll.
          heist.lootPickups.spawn(heist.player.x, heist.player.y, { kind: 'plasmaChips', amount: 500 }, 90000);
          heist.lootPickups.spawn(heist.player.x, heist.player.y, { kind: 'mod', amount: 1, modId: supreme.id }, 90001);
          await wait(2000);
          const loot = heist.lootPickups.pickups;
          const expected = structuredClone(heist.pendingLoot);
          for (const item of loot) heist.rewards.add(expected, item.reward);
          const lootCount = heist.lootPickups.activeCount;
          snap('heist-physical-loot');
          for (const item of loot) {
            item.settled = true; item.z = 0; item.collectibleAt = 0;
            item.worldX = heist.player.x; item.worldY = heist.player.y;
          }
          heist.lootPickups.update(heist.time.now, 0, heist.player.x, heist.player.y, 100, 100, 0,
            (reward,x,y) => heist.collectLoot(reward,x,y));
          report.checkpoints.at(-1).loot = { count: lootCount, expected, collected: structuredClone(heist.pendingLoot) };
          coverage('physicalHeistLoot'); await wait(1200);
          heist.startAmbush(); await wait(1200);
          for(const enemy of [...heist.enemies]) heist.damageEnemy(enemy,enemy.hp);
          await wait(200); snap('heist-enemies-retired');
          heist.openExtraction(); await wait(1500);
          globalThis.forceHeistReturn(true);
          await until(() => arena.sys.isActive() && !game.scene.getScene('anomaly-heist').sys.isActive(), 'HEIST return');
          activate(arena); await wait(600); await dismissReveals();
          if(JSON.stringify(arena.hud.settings)!==JSON.stringify(SaveSystem.get().settings.hud)) throw new Error('Arena did not adopt HEIST settings');
          snap('heist-retired'); coverage('heistReturn');
        }
        probe.phase(`round-${arena.roundManager.round}/completion`);probe.checkpoint('before-completion');
        arena.completeRound();
        let bossDone = false;
        let bossPremiumSeeded = false;
        const handoffStarted = performance.now();
        while (!game.scene.getScene('round-finished').sys.isActive()) {
          if (performance.now() - handoffStarted > 40000) throw new Error(`Round handoff stalled: ${arena.bossFlowPhase}/${arena.state.state}`);
          await dismissReveals();
          if (arena.bossEncounter && !bossDone) {
            await wait(600); activate(arena); arena.startBossCombat();
            probe.phase(`round-${arena.roundManager.round}/boss-combat`);
            snap('boss-active'); await wait(options.bossSampleMs??3000);
            arena.completeBossFight(); bossDone = true; coverage('boss'); snap('boss-destruction');
          }
          if (arena.bossFlowPhase === 'loot-collection') {
            if (!bossPremiumSeeded) {
              arena.spawnModPickup(supreme, 'boss', arena.player.x, arena.player.y);
              bossPremiumSeeded = true;
            }
            if (arena.pickups.length || arena.modPickups.length) { snap('boss-physical-loot'); coverage('bossLoot'); }
            collectArena(arena);
            if (arena.canFinishBossCollection()) arena.finishBossCollection();
          }
          await wait(100);
        }
        await wait(100);
        const checkpoint = snap('quiescent');
        const history = globalThis.n3onRoundLifecycleReport?.() ?? arena.roundBoundaryHistory;
        report.boundaries.push(...history.filter(entry => !report.boundaries.some(old => old.generation === entry.generation)));
        checkpoint.encounterCheckpoints = globalThis.n3onEncounterLifecycleReport?.()
          ?? structuredClone(arena.encounterCheckpointHistory);
        coverage('roundFinished');
        if(exercises){probe.phase(`round-${options.startRound+i}/persistence-verification`);exercises.persistence(options.startRound+i,options.protocol);}
        if(globalThis.__n3onSaveSoakCheckpoint) {
          probe.phase(`round-${options.startRound+i}/harness-checkpoint`);
          const {promise,...snapshot}=report;
          globalThis.__n3onSaveSoakCheckpoint(JSON.stringify(snapshot));
        }
        if (i + 1 < options.rounds) {
          const finished = game.scene.getScene('round-finished');
          const payload = game.registry.get('round-finished');
          // Advance consecutive rounds through the actual result/loading flow.
          probe.phase(`round-${options.startRound+i+1}/loading`);
          startArenaLoad(finished, { reason: 'continue-next-round', session: { ...session,
            round: options.startRound+i+1, equippedMods: payload.equippedMods, modsEarned: payload.modsEarned }, message: 'Mixed lifecycle soak' });
          await wait(100); snap('loading'); coverage('loading');
          await until(() => arena.sys.isActive() && arena.roundRuntime.phase === 'active', 'next Arena');
        }
      }
      if(options.finishCampaign) {
        await (await import('/scripts/progression-finale.js')).exerciseProgressionFinale({
          game,report,probe,exercises,session,pad,wait,until,snap,coverage,activate,collectArena,dismissReveals
        });
      }
      report.finishedAt = new Date().toISOString();
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally {
      probe?.destroy();
      exercises?.destroy();
      game.events.off('step',frameClock);
      report.running = false;
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', errorHandler);
      if (originalGamepads) Object.defineProperty(navigator, 'getGamepads', originalGamepads);
      else delete navigator.getGamepads;
    }
  })();
  return { started: true, options };
})()
