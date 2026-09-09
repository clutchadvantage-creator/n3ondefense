// Browser-only instrumentation. Restored after the soak; it does not change
// scheduling, save contents, rendering settings, or gameplay outcomes.
export async function createProgressionProbe(game, report) {
  const {PlayerProfileStore}=await import('/src/game/state/PlayerProfileStore.ts');
  const {LocalSaveManager}=await import('/src/game/save/LocalSaveManager.ts');
  const {GameplayTelemetryRecorder}=await import('/src/game/telemetry/GameplayTelemetryRecorder.ts');
  const {OnlineRunManager}=await import('/src/online/OnlineRunManager.ts');
  const restores=[], observers=[];
  let phase='setup';
  const metrics=report.probe={phases:{},longTasks:[],network:[],checkpoints:[]};
  const record=(name,ms,bytes=0)=>{
    const bucket=metrics.phases[phase]??(metrics.phases[phase]={});
    const s=bucket[name]??(bucket[name]={calls:0,totalMs:0,maxMs:0,bytes:0});
    s.calls++;s.totalMs+=ms;s.maxMs=Math.max(s.maxMs,ms);s.bytes+=bytes;
  };
  const wrap=(object,key,name=key)=>{
    if(!object||typeof object[key]!=='function')return;
    const original=object[key];
    object[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{record(name,performance.now()-start);}};
    restores.push(()=>object[key]=original);
  };
  wrap(PlayerProfileStore,'save','profile.save');
  wrap(LocalSaveManager,'importProfile','profile.import');
  wrap(LocalSaveManager,'writeProfile','profile.write');
  wrap(GameplayTelemetryRecorder,'persistNow','telemetry.persist');
  wrap(OnlineRunManager,'recordMilestone','online.milestone');
  const stringify=JSON.stringify;
  JSON.stringify=function(...args){const start=performance.now();const result=stringify.apply(this,args);record('JSON.stringify',performance.now()-start,result?.length??0);return result;};
  restores.push(()=>JSON.stringify=stringify);
  const setItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){const start=performance.now();try{return setItem.call(this,key,value);}finally{record('storage.write',performance.now()-start,String(value).length);}};
  restores.push(()=>Storage.prototype.setItem=setItem);
  for(const key of ['preRender','render','postRender'])wrap(game.renderer,key,`renderer.${key}`);
  const arena=game.scene.getScene('arena');
  // Inclusive setup/transition timings, outside steady combat hot paths.
  for (const key of ['create', 'startRoundRuntime', 'initializeStandardRound', 'initializeBossRound',
    'drawProceduralArena', 'prepareCombatRuntime', 'createHudLayer', 'createCombatPools',
    'createCombatPresentationSystems', 'endCurrentRoundRuntime', 'completeRound']) wrap(arena,key,`setup.${key}`);
  for(const key of ['updateEnemies','updateProjectiles','updateHud','updatePickups','updateModPickups','updateTurrets','updateMines',
    'updateHazards','updateDefusers','updatePlayerShooting','createRoundFromDefinition','endCurrentRoundRuntime','completeRound'])wrap(arena,key,`arena.${key}`);
  // Arcade World.update contains the first fixed step inline; step alone only
  // measures catch-up substeps. These are inclusive, never summed together.
  const worldPrototype=globalThis.Phaser.Physics.Arcade.World.prototype;
  wrap(worldPrototype,'update','physics.update');
  wrap(worldPrototype,'step','physics.catchUpStep');
  for(const type of ['longtask','resource']) {
    if(!PerformanceObserver.supportedEntryTypes.includes(type))continue;
    const observer=new PerformanceObserver(list=>{
      for(const e of list.getEntries()){
        if(type==='longtask'&&metrics.longTasks.length<1000)metrics.longTasks.push({phase,at:e.startTime,ms:e.duration});
        if(type==='resource'&&['fetch','xmlhttprequest'].includes(e.initiatorType)&&metrics.network.length<1000)
          metrics.network.push({phase,path:new URL(e.name).pathname,ms:e.duration,bytes:e.transferSize});
      }
    });
    observer.observe({type});observers.push(observer);
  }
  return {
    phase(value){phase=value;},
    checkpoint(label){
      const save=PlayerProfileStore.getActiveSave();
      metrics.checkpoints.push({label,at:performance.now(),phase,heap:performance.memory?.usedJSHeapSize,
        cards:save.mods.cards.length,saveRevision:save.metadata.saveRevision,highest:save.progress.supremeHighestRound,
        domNodes:document.getElementsByTagName('*').length,canvasNodes:document.querySelectorAll('canvas').length,
        textures:game.textures.getTextureKeys().length,camera:{zoom:arena.cameras.main?.zoom,shake:arena.cameras.main?.shakeEffect.isRunning},
        layout:arena.layout?{seed:arena.layout.seed,template:arena.layout.template,walls:arena.wallRects.length}:null,
        mods:arena.modRuntime?.snapshot(),diagnostic:arena.captureRoundRuntimeDiagnostics?.()});
    },
    destroy(){for(const observer of observers)observer.disconnect();for(const restore of restores.reverse())restore();}
  };
}
