// DEV browser audit of authored layout rendering, isolated from combat load.
// Follow with the mixed gameplay fixture: this sweep does not replace it.
(() => {
  if(globalThis.__n3onLayoutAudit?.running)throw new Error('Layout audit already running');
  const options={rounds:[1,30,148],seeds:[17,81337,550055],sampleMs:1200,menus:true,heists:true,authoredTemplates:['hub-spoke'],
    ...(globalThis.__n3onLayoutAuditOptions??{})};
  const report=globalThis.__n3onLayoutAudit={running:true,options,startedAt:new Date().toISOString(),cases:[],errors:[]};
  const game=globalThis.n3onGame;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(test,label)=>{const started=performance.now();while(!test()){
    if(performance.now()-started>30000)throw new Error(`Timed out: ${label}`);await wait(25);
  }};
  const stats=values=>{
    const sorted=[...values].sort((a,b)=>a-b);
    return {n:sorted.length,mean:values.reduce((sum,v)=>sum+v,0)/Math.max(1,values.length),
      p95:sorted[Math.floor(sorted.length*.95)]??0,max:sorted.at(-1)??0};
  };
  const snapshot=scene=>{
    const objects=[];
    const visit=o=>{objects.push(o);if(o.type==='Container')o.list.forEach(visit);};
    scene.children.list.forEach(visit);
    return {roots:scene.children.length,objects:objects.length,
      graphics:objects.filter(o=>o.type==='Graphics').map(o=>({depth:o.depth,parentDepth:o.parentContainer?.depth,
        commands:o.commandBuffer.length})),
      renderTextures:objects.filter(o=>o.type==='RenderTexture').map(o=>({width:o.width,height:o.height,depth:o.depth})),
      canvasOwners:Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e.parent?.scene===scene).length,
      textures:game.textures.getTextureKeys().length,resizeListeners:game.scale.listenerCount('resize'),
      domNodes:document.getElementsByTagName('*').length,storefronts:document.querySelectorAll('.storefront').length};
  };
  const sample=async(scene,label,detail={})=>{
    report.current=label;
    await wait(150);
    const frames=[],raw=[],renders=[],updates=[],costs=new Map(),restores=[];
    let previous;
    const step=(_time,delta)=>{frames.push(delta);const now=performance.now();if(previous!==undefined)raw.push(now-previous);previous=now;};
    const wrap=(object,key,callback)=>{
      const original=object[key];if(typeof original!=='function')return;
      const owned=Object.hasOwn(object,key);
      object[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{callback(performance.now()-start);}};
      restores.push(()=>{if(owned)object[key]=original;else delete object[key];});
    };
    const visit=o=>{
      if(o.type==='Container'){o.list.forEach(visit);return;}
      const key=`${o.type}@${o.parentContainer?.depth??o.depth}`;
      wrap(o,'renderWebGL',ms=>{const c=costs.get(key)??{calls:0,totalMs:0};c.calls++;c.totalMs+=ms;costs.set(key,c);});
    };
    scene.children.list.forEach(visit);
    wrap(game.renderer,'render',ms=>renders.push(ms));
    wrap(scene.sys,'sceneUpdate',ms=>updates.push(ms));
    game.events.on('step',step);
    try{await wait(options.sampleMs);}finally{game.events.off('step',step);for(const restore of restores.reverse())restore();}
    const result={label,...detail,frames:stats(frames),raw:stats(raw),render:stats(renders),update:stats(updates),
      costs:[...costs].map(([key,c])=>({key,...c,msPerFrame:c.totalMs/Math.max(1,frames.length)})).sort((a,b)=>b.msPerFrame-a.msPerFrame),
      resources:snapshot(scene)};
    if(frames.length<options.sampleMs/80)throw new Error(`Insufficient active frames: ${label}`);
    report.cases.push(result);return result;
  };
  const checkpoint=()=>globalThis.__n3onSaveLayoutCheckpoint?.(JSON.stringify(report));
  const stop=async scene=>{
    game.scene.stop(scene.scene.key);await until(()=>!scene.sys.isActive(),'scene stopped');await wait(50);
    const owners=Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e.parent?.scene===scene);
    if(owners.length)throw new Error(`${scene.scene.key} retained ${owners.length} canvas owners`);
  };
  const onError=e=>report.errors.push(String(e.error?.stack??e.reason??e.message));
  window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
  report.promise=(async()=>{
    let fixture;
    try{
      if(!game||game.renderer.type!==Phaser.WEBGL)throw new Error('WebGL DEV browser required');
      report.environment={width:game.scale.width,height:game.scale.height,dpr:devicePixelRatio,renderer:game.renderer.type,userAgent:navigator.userAgent};
      const {ArenaGenerator}=await import('/src/game/systems/ArenaGenerator.ts');
      const {ArenaVisualRenderer}=await import(options.rendererModule??'/src/game/arena/ArenaVisualRenderer.ts');
      const {ARENA_ARCHETYPES}=await import('/src/game/config/arenaGeneration.ts');
      const {getRoundSiteCount}=await import('/src/game/config/gameplay.ts');
      for(const scene of game.scene.getScenes(true))await stop(scene);
      fixture=new Phaser.Scene({key:'layout-audit'});
      game.scene.add('layout-audit',fixture,true);
      await until(()=>fixture.sys.isActive(),'fixture scene');
      const camera=fixture.cameras.main;
      for(const round of options.rounds)for(const template of ARENA_ARCHETYPES)for(const baseSeed of options.seeds){
        const seed=(baseSeed^Math.imul(round,0x9e3779b1))>>>0;
        ArenaGenerator.resetHistory();ArenaGenerator.forceArenaType(template);
        const generationStarted=performance.now();
        const layout=ArenaGenerator.generate(seed,template,round,getRoundSiteCount(round));
        const generationMs=performance.now()-generationStarted;
        ArenaGenerator.forceArenaType(null);
        const started=performance.now(),visuals=new ArenaVisualRenderer(fixture,layout);
        const setupMs=performance.now()-started;
        camera.setBounds(0,0,2400,1600).setZoom(.9).centerOn(1200,800);
        const row=await sample(fixture,`arena/${round}/${template}/${baseSeed}`,{kind:'arena',round,template:layout.template,
          requestedTemplate:template,seed,baseSeed,walls:layout.walls.length,obstacles:layout.obstacles.length,generationMs,setupMs,
          diagnostics:visuals.diagnostics,layout});
        visuals.destroy();await wait(50);
        row.retired=snapshot(fixture);
        if(row.retired.objects||row.retired.canvasOwners)throw new Error(`Arena visuals survived destroy: ${row.label}`);
        checkpoint();
      }
      ArenaGenerator.resetHistory();ArenaGenerator.forceArenaType(null);
      // Hub-spoke requests fell back in the accepted-layout sweep. Exercise
      // its authored radial artwork separately, without bypassing validation
      // or changing which layouts production gameplay accepts.
      for(const template of options.authoredTemplates)for(const seed of options.seeds){
        const {generateArenaTopology}=await import('/src/game/systems/ArenaTopology.ts');
        const {createArenaFingerprint}=await import('/src/game/systems/ArenaFingerprint.ts');
        const draft=generateArenaTopology(template,seed);
        const {ArenaThemeManager}=await import('/src/game/systems/ArenaThemeManager.ts');
        const {SeededRandom}=await import('/src/game/systems/SeededRandom.ts');
        const layout={seed,template,theme:ArenaThemeManager.pick(new SeededRandom(seed)),walls:draft.walls,obstacles:[],smashables:[],
          playerSpawn:draft.playerCandidates[0],enemySpawns:draft.enemySpawns,bombSites:draft.objectiveCandidates.slice(0,1),decorativeNeon:[],
          generation:createArenaFingerprint({archetype:template,bounds:draft.bounds,blockers:draft.walls,bombSites:draft.objectiveCandidates.slice(0,1),
            enemySpawns:draft.enemySpawns,attempt:0,majorStructureCount:draft.majorStructureCount,chokePointCount:draft.chokePointCount,
            connectedRegionCount:draft.connectedRegionCount,orientationBias:draft.orientationBias,validation:['render-only-authored-draft']})};
        const started=performance.now(),visuals=new ArenaVisualRenderer(fixture,layout);
        camera.setBounds(0,0,2400,1600).setZoom(.9).centerOn(1200,800);
        const row=await sample(fixture,`authored/${template}/${seed}`,{kind:'arena-authored',template,seed,setupMs:performance.now()-started,layout});
        visuals.destroy();await wait(50);row.retired=snapshot(fixture);
        if(row.retired.objects||row.retired.canvasOwners)throw new Error('Authored visuals survived destroy');checkpoint();
      }
      if(options.heists){
        const {createHeistFacility}=await import('/src/game/anomalies/heist/HeistFacility.ts');
        for(const seed of options.seeds){
          const started=performance.now(),facility=createHeistFacility(fixture,seed),setupMs=performance.now()-started;
          const layout=facility.layout;
          camera.setBounds(0,0,layout.world.width,layout.world.height).setZoom(.9);
          for(const [view,point] of [['entry',facility.route[0]],['vault',{x:layout.vaultBounds.x+layout.vaultBounds.w/2,y:layout.vaultBounds.y+layout.vaultBounds.h/2}],['escape',facility.extractionPoint]]){
            facility.setAlertLighting(view!=='entry');facility.setVaultDoorOpen(view==='escape');facility.setEscapeRoute(view==='escape');
            const update=()=>facility.update(fixture.time.now,point.x,point.y);
            camera.centerOn(point.x,point.y);fixture.events.on('update',update);
            try{await sample(fixture,`heist/${seed}/${view}`,{kind:'heist',seed,view,setupMs,diagnostics:facility.diagnostics});}
            finally{fixture.events.off('update',update);}
          }
          facility.destroy();await wait(100);
          const retired=snapshot(fixture);report.cases.at(-1).retired=retired;
          if(retired.objects||retired.canvasOwners)throw new Error('Facility visuals survived destroy');
          checkpoint();
        }
      }
      await stop(fixture);game.scene.remove('layout-audit');fixture=null;
      if(options.menus){
        for(const key of ['menu','garage','options','upgrades','cosmetics','mods','leaderboards','local-profiles']){
          const scene=game.scene.getScene(key);if(!scene)throw new Error(`Unknown menu ${key}`);
          const started=performance.now();game.scene.start(key);await until(()=>scene.sys.isActive(),key);
          await wait(1000);
          const row=await sample(scene,`menu/${key}`,{kind:'menu',setupMs:performance.now()-started});
          await stop(scene);row.retired=snapshot(scene);checkpoint();
        }
      }
      report.finishedAt=new Date().toISOString();
    }catch(error){report.errors.push(String(error.stack??error));}
    finally{
      if(fixture){game.scene.stop('layout-audit');game.scene.remove('layout-audit');}
      window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);
      report.running=false;checkpoint();
    }
  })();
  return {started:true,options};
})();
