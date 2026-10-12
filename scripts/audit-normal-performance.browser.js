// Isolated Normal 9+ reproduction. Measures actual update/render CPU separately from raw frame intervals.
(() => {
  if(globalThis.__n3onLayoutAudit?.running)throw Error('Another audit is active');
  // Optional legacyLaserModule accepts a locally prepared pre-change module for A/B diagnosis.
  const options={rounds:[9,14],sampleMs:5000,legacyLaserModule:null,...globalThis.__n3onLayoutAuditOptions};
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],samples:[],errors:[],options};
  const game=n3onGame,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const until=async(fn,label)=>{const end=performance.now()+20000;while(!fn()){if(performance.now()>end)throw Error('Timeout: '+label);await wait(30);}};
  const stats=values=>{const sorted=values.slice().sort((a,b)=>a-b);return {n:values.length,mean:values.reduce((a,b)=>a+b,0)/Math.max(1,values.length),p95:sorted[Math.floor(sorted.length*.95)]??0,p99:sorted[Math.floor(sorted.length*.99)]??0,max:sorted.at(-1)??0,over33:values.filter(v=>v>33).length};};
  const pad={id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,1,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:0};
  const savedPads=navigator.getGamepads;navigator.getGamepads=()=>{pad.timestamp=performance.now();return[pad];};
  const originalError=console.error;console.error=(...args)=>{report.errors.push(args.map(String).join(' '));originalError.apply(console,args);};
  const sample=async(arena,label,detail={})=>{
    report.current=label;await wait(250);
    const raw=[],renders=[],updates=[],costs=new Map(),restores=[];let previous;
    const wrap=(object,key,name)=>{const original=object?.[key];if(typeof original!=='function')return;const owned=Object.hasOwn(object,key);
      object[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const ms=performance.now()-start;if(name==='render')renders.push(ms);else if(name==='update')updates.push(ms);else{const cost=costs.get(name)??{calls:0,totalMs:0};cost.calls++;cost.totalMs+=ms;costs.set(name,cost);}}};restores.push(()=>{if(owned)object[key]=original;else delete object[key];});};
    const visit=(object)=>{if(object.type==='Container'){object.list.forEach(visit);return;}wrap(object,'renderWebGL',`${object.type}@${object.parentContainer?.depth??object.depth}`);};
    arena.children.list.forEach(visit);wrap(game.renderer,'render','render');wrap(arena.sys,'sceneUpdate','update');
    for(const key of ['updateEnemies','updateProjectiles','updateSystemInfusions','updateHud','updatePlayerShooting','getHazardDamageTargets'])wrap(arena,key,key);
    for(const key of ['laserSecurity','gasHazard','bombletHazard'])wrap(arena[key],'update',key);
    wrap(arena.laserSecurity,'buildSegments','laserGeometry');
    const step=time=>{const now=performance.now();if(previous!==undefined)raw.push(now-previous);previous=now;arena.player.invulnUntil=Infinity;arena.player.energy=arena.player.energyStats.max;
      for(const site of arena.bombSites.sites)site.defuseMs=0;
      pad.axes[0]=Math.sin(time*.0008)*.35;pad.axes[1]=Math.cos(time*.0006)*.35;
      const target=arena.enemies.find(enemy=>enemy.active);if(target){const dx=target.x-arena.player.x,dy=target.y-arena.player.y,d=Math.hypot(dx,dy)||1;pad.axes[2]=dx/d;pad.axes[3]=dy/d;}
      pad.buttons[7]={pressed:true,value:1,touched:true};};
    game.events.on('step',step);
    try{await wait(options.sampleMs);}finally{game.events.off('step',step);for(const restore of restores.reverse())restore();pad.buttons[7]={pressed:false,value:0,touched:false};}
    const result={label,...detail,raw:stats(raw),render:stats(renders),update:stats(updates),costs:[...costs].map(([name,cost])=>({name,...cost,msPerFrame:cost.totalMs/Math.max(1,raw.length)})).sort((a,b)=>b.msPerFrame-a.msPerFrame),
      enemies:arena.enemies.length,projectiles:arena.projectiles.length,resources:arena.captureRoundRuntimeDiagnostics(),loadoutScaling:arena.loadoutScaling,laserSegments:arena.laserSecurity?.liveSegmentCount};
    report.cases.push(result);globalThis.__n3onSaveLayoutCheckpoint?.(JSON.stringify(report));
  };
  report.promise=(async()=>{
    try{
      check(game.renderer.type===Phaser.WEBGL,'WebGL renderer');
      const gl=game.renderer.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');report.environment={width:innerWidth,height:innerHeight,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'};
      const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
      const dep=name=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+name+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
      const {SaveSystem:S}=await import(dep('SaveSystem'));const {RunTransitionManager:T}=await import(dep('RunTransitionManager'));
      const {UPGRADE_DEFINITIONS}=await import('/src/data/upgrades.ts');
      const {getSpawnProfile,getConcurrentSpawnPressure,ENEMY_BALANCE}=await import('/src/game/config/balance/index.ts');
      const {LASER_HAZARD_BALANCE:L}=await import('/src/game/config/laserHazards.ts');
      const {LaserSecuritySystem:CurrentLaser}=await import('/src/game/systems/LaserSecuritySystem.ts');
      const LegacyLaser=options.legacyLaserModule?(await import(options.legacyLaserModule)).LaserSecuritySystem:null;
      for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);await wait(100);
      check(S.createProfile('Perf Normal '+Date.now().toString().slice(-6)).ok,'isolated performance profile');
      S.setSettings({masterVolume:0,contextualTutorials:false});S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
      for(const definition of UPGRADE_DEFINITIONS)S.setUpgradeLevel(definition.id,Math.floor(definition.maxLevel*.5));
      for(const round of options.rounds){
        for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);await wait(100);
        game.scene.start('menu');await wait(100);const menu=game.scene.keys.menu;T.clearForMenu(menu);
        const session={baseSeed:550055,round,protocol:'normal',objectiveMode:'open',equippedMods:[],modsEarned:[]};
        T.requestArenaTransition(menu,{reason:'new-run',session});await until(()=>game.scene.isActive('loading')&&T.snapshot(game.scene.keys.loading).lastStep==='awaiting-user-deploy-confirmation','loading');
        game.scene.keys.loading.confirmDeployment(session,'new-run');await until(()=>game.scene.isActive('arena')&&game.scene.keys.arena.roundRuntime?.phase==='active','arena');
        const a=game.scene.keys.arena;globalThis.__normalPerfArena=a;a.pointerLock.hidePrompt();a.playerInput.adoptDevice('gamepad');if(a.state.state==='Paused')a.resumeGameplay();
        a.player.invulnUntil=Infinity;const site=a.bombSites.sites.find(site=>site.state==='Available');
        if(site){a.bombSites.armSite(site,180000,a.time.now);a.state.set('Defense');}
        const pressure=getConcurrentSpawnPressure(getSpawnProfile(a.currentCombatPosition(),0,'normal'),site?1:0),scale=a.currentModeBalance().activePressureMultiplier*a.loadoutScaling.pressure;
        const cap=Math.round(pressure.activeCountCap*scale);let weight=a.enemies.reduce((sum,e)=>sum+ENEMY_BALANCE[e.stats.type].weight,0);
        const types=['grunt','shooter','grunt','tank','shooter','defuser'];
        for(let i=a.enemies.length;i<cap;i++){const type=types[i%types.length];if(weight+ENEMY_BALANCE[type].weight>pressure.activeWeightCap*scale)break;a.spawnEnemy(type,!!site);weight+=ENEMY_BALANCE[type].weight;}
        await sample(a,`normal-${round}/natural`,{round,cap});
        // Control only laser presentation/timing; all target damage and authored caps stay with Arena.
        const bounds=a.laserSecurity.playfield;
        for(const [label,Type] of [['bounded',CurrentLaser],...(LegacyLaser?[['before-clipping',LegacyLaser]]:[])]){
          a.laserSecurity.destroy();a.laserSecurity=new Type(a,round,a.layout.theme,undefined,undefined,1,bounds);
          const laser=a.laserSecurity,originalUpdate=laser.update.bind(laser),start=a.time.now;
          laser.update=(now,...args)=>{laser.createdAt=now-L.initialDelayMs-L.telegraphMs-((now-start)%L.activeMs);laser.lastCycle=0;laser.patternIndex=6;return originalUpdate(now,...args);};
          await sample(a,`normal-${round}/${label}-pinwheel`,{round,cap});
        }
        // Laser-off control; no production behavior is changed.
        const update=a.laserSecurity.update.bind(a.laserSecurity);a.laserSecurity.update=(now,dt,player,targets,immune)=>update(now,dt,player,targets,immune,true);
        await sample(a,`normal-${round}/lasers-off`,{round,cap});
      }
      game.scene.pause('arena');
    }catch(error){report.errors.push(error.stack??String(error));}
    finally{navigator.getGamepads=savedPads;console.error=originalError;report.running=false;report.current='complete';}
  })();return 'Normal performance investigation started';
})()
