// Continue the long progression fixture into the officially unlocked ending.
// No completion flags are injected: all three bosses must report real deaths.
export async function exerciseProgressionFinale({game,report,probe,exercises,session,pad,wait,until,snap,coverage,activate,dismissReveals}) {
  const {SaveSystem}=await import('/src/game/systems/SaveSystem.ts');
  const {LocalSaveManager}=await import('/src/game/save/LocalSaveManager.ts');
  const {getSupremeStage,isSupremeStageUnlocked}=await import('/src/game/progression/SupremeProgression.ts');
  const {startArenaLoad}=await import('/src/game/utils/runFlow.ts');
  const {getSpawnProfile,getConcurrentSpawnPressure,ENEMY_BALANCE}=await import('/src/game/config/balance/index.ts');
  const finale=report.finale={checks:[],samples:[],startedAt:new Date().toISOString()};
  const check=(ok,label,detail={})=>{
    finale.checks.push({ok,label,...detail});
    if(!ok)throw new Error(label);
  };
  const disk=()=>JSON.parse(LocalSaveManager.getActiveProfileSaveRaw());
  const stage=getSupremeStage('supreme-centaurus');
  finale.beforeProgress=structuredClone(disk().progress);
  check(isSupremeStageUnlocked(stage,finale.beforeProgress),'Centaurus unlocked by saved round 148');
  check(!finale.beforeProgress.supremeOverdriveCompleted,'Completion remains false before the terminal encounter');
  const finished=game.scene.getScene('round-finished');
  probe.phase('finale/loading');
  startArenaLoad(finished,{reason:'new-run',session:{...session,protocol:stage.protocolId,round:stage.level,
    runStartedAt:Date.now(),equippedMods:exercises.loadout(stage.protocolId),modsEarned:[]},message:'Endgame validation'});
  const loading=game.scene.getScene('loading');
  let deployButton;
  await until(()=>{
    deployButton=loading.children?.list.find(object=>object.visible&&/TO DEPLOY$/.test(object.getByName?.('button-label')?.text??''));
    return loading.sys.isActive()&&Boolean(deployButton);
  },'new-run deploy confirmation');
  deployButton.getByName('button-hit').emit('pointerdown');
  const arena=game.scene.getScene('arena');
  await until(()=>arena.sys.isActive()&&arena.roundRuntime.phase==='active','Centaurus Arena');
  activate(arena);
  check(arena.protocol===stage.protocolId&&arena.roundManager.round===100,'Final protocol starts at level 100');
  const pressure=getConcurrentSpawnPressure(getSpawnProfile(100,0),0);
  const multiplier=arena.currentModeBalance().activePressureMultiplier;
  let weight=arena.enemies.reduce((sum,e)=>sum+ENEMY_BALANCE[e.stats.type].weight,0);
  const types=['grunt','shooter','tank','disruptor','star'];
  for(let n=arena.enemies.length;n<Math.round(pressure.activeCountCap*multiplier);n++) {
    const type=types[n%types.length],cost=ENEMY_BALANCE[type].weight;
    if(weight+cost>pressure.activeWeightCap*multiplier)break;
    arena.spawnEnemy(type,false);weight+=cost;
  }
  exercises.prepareCombat(arena);
  const summary=values=>{
    const sorted=[...values].sort((a,b)=>a-b);
    return {n:sorted.length,mean:sorted.reduce((sum,n)=>sum+n,0)/Math.max(1,sorted.length),
      p95:sorted[Math.floor(sorted.length*.95)]??0,p99:sorted[Math.floor(sorted.length*.99)]??0,max:sorted.at(-1)??0};
  };
  const sample=async(label,durationMs,shoot=false)=>{
    probe.phase(`finale/${label}`);
    const frames=[],rawFrames=[],updates=[];
    let previousTime;
    const onStep=(time,delta)=>{
      if(!arena.sys.isActive()||arena.legendaryRevealInProgress){previousTime=undefined;return;}
      frames.push(delta);
      const now=performance.now();
      if(previousTime!==undefined)rawFrames.push(now-previousTime);
      previousTime=now;
      pad.axes[0]=Math.sin(time*.0007)*.4;pad.axes[1]=Math.cos(time*.0007)*.4;
      const target=arena.supremeFinale?.nearestTarget(arena.player.x,arena.player.y)??arena.enemies.find(e=>e.active);
      if(target) {
        const dx=target.x-arena.player.x,dy=target.y-arena.player.y,length=Math.hypot(dx,dy)||1;
        pad.axes[2]=dx/length;pad.axes[3]=dy/length;
      }
      pad.buttons[7]={pressed:shoot,touched:shoot,value:Number(shoot)};
    };
    const original=arena.sys.sceneUpdate;
    arena.sys.sceneUpdate=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{updates.push(performance.now()-start);}};
    game.events.on('step',onStep);
    let endsAt=performance.now()+durationMs;
    try {
      while(performance.now()<endsAt) {
        await wait(100);
        if(game.scene.isActive('legendary-mod-reveal')) {
          const pauseStarted=performance.now();
          await dismissReveals();
          endsAt+=performance.now()-pauseStarted;
        }
      }
    } finally {
      game.events.off('step',onStep);arena.sys.sceneUpdate=original;
      pad.axes[0]=0;pad.axes[1]=0;pad.buttons[7]={pressed:false,touched:false,value:0};
    }
    const result={label,durationMs,frames:summary(frames),rawFrames:summary(rawFrames),update:summary(updates),
      remainingBosses:arena.supremeFinale?.remaining??null,diagnostic:arena.captureRoundRuntimeDiagnostics()};
    finale.samples.push(result);probe.checkpoint(label);snap(`finale-${label}`);
    check(frames.length>=durationMs/50,`${label} records sustained active frames`);
  };
  await sample('centaurus-ordinary',40000,true);
  await dismissReveals();
  probe.phase('finale/ordinary-completion');
  arena.completeRound();
  // Completion can award a premium Mod before replacing the ordinary runtime.
  // Acknowledge that normal reward gate while waiting for the boss handoff.
  const awaitingAt=performance.now();
  while(!arena.supremeFinale) {
    if(performance.now()-awaitingAt>30000)throw new Error('Finale handoff remained blocked');
    await dismissReveals();await wait(100);
  }
  await wait(600);activate(arena);arena.startBossCombat();
  const controller=arena.supremeFinale;
  check(controller.encounters.length===3&&controller.remaining===3,'All three real boss encounters started');
  check(arena.bossFlowPhase==='combat','Finale enters combat');
  for(let window=1;window<=3;window++)await sample(`three-boss-${window}`,20000);
  check(controller.remaining===3,'All three bosses active throughout the 60-second pressure sample');
  for(let index=0;index<3;index++) {
    const boss=controller.bosses[index];
    probe.phase(`finale/boss-${index+1}-death`);
    boss.takeDamage(boss.hp,'weapon');
    await wait(200);
    check(controller.remaining===2-index,'Fatal damage retires exactly one boss',{boss:controller.encounters[index].archetype,remaining:controller.remaining});
    if(index<2) {
      check(!disk().progress.supremeOverdriveCompleted,'Partial boss clear cannot persist campaign completion',{defeated:index+1});
      await sample(`${2-index}-boss-remaining`,20000);
    }
  }
  coverage('terminalBoss');
  await until(()=>Boolean(arena.supremeVictorySequence),'victory credits');
  check(disk().progress.supremeOverdriveCompleted,'All three deaths persist completion before credits end');
  snap('finale-credits');coverage('victoryCredits');
  probe.phase('finale/credits');
  // Let the authored 18-second sequence finish through its own timer.
  await until(()=>finished.sys.isActive(),'terminal debrief',25000);
  const payload=game.registry.get('round-finished');
  finale.payload=structuredClone(payload);
  check(payload.supremeCompletion===true&&payload.terminalBossesDefeated===3&&payload.bossDefeated==='supreme-trinity','Debrief records the complete terminal victory');
  const labels=finished.children.list.flatMap(object=>object.getByName?.('button-label')?.text??[]);
  finale.debriefActions=labels;
  check(labels.includes('RETURN TO OPERATOR GARAGE')&&!labels.includes('CONTINUE TO NEXT ROUND'),'Terminal debrief offers completion routes');
  exercises.persistence(100,stage.protocolId);
  finale.afterProgress=structuredClone(disk().progress);
  check(finale.afterProgress.supremeHighestRound===finale.beforeProgress.supremeHighestRound,'Terminal completion preserves higher endless progress');
  check(!game.registry.has('arena-session'),'Completed run session cleared');
  await wait(200);snap('quiescent');
  const history=globalThis.n3onRoundLifecycleReport?.()??arena.roundBoundaryHistory;
  report.boundaries.push(...history.filter(entry=>!report.boundaries.some(old=>old.generation===entry.generation)));
  coverage('terminalDebrief');
  const garageButton=finished.children.list.find(object=>object.getByName?.('button-label')?.text==='RETURN TO OPERATOR GARAGE');
  garageButton.getByName('button-hit').emit('pointerdown');
  await until(()=>game.scene.isActive('garage'),'post-completion Garage');
  await wait(1000);snap('finale-garage');
  check(disk().progress.supremeOverdriveCompleted,'Completion survives the actual Garage return action');
  check(!arena.sys.isActive()&&!finished.sys.isActive(),'Gameplay and debrief retired after Garage return');
  coverage('terminalGarageReturn');
  finale.finishedAt=new Date().toISOString();
}
