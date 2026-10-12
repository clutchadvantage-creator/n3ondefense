// Reproduce Options opened over a retained combat scene, including after anomaly return.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[]};
  const check=(ok,label,detail)=>{report.cases.push({ok:!!ok,label,detail});if(!ok)throw Error(label);};
  const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(fn,label)=>{const end=performance.now()+20000;while(!fn()){if(performance.now()>end)throw Error('Timeout '+label);await wait(30);}};
  const all=scene=>{const out=[];const visit=o=>{out.push(o);o.list?.forEach(visit);};scene.children.list.forEach(visit);return out;};
  const click=(scene,label)=>{
    const text=all(scene).find(o=>o.text?.toUpperCase()===label.toUpperCase()),root=text?.parentContainer;
    const hit=root?.getByName('button-hit')??root;check(hit?.input,'live button '+label);hit.emit('pointerdown');
  };
  const visibleOrder=()=>game.scene.scenes.filter(s=>s.sys.settings.visible&&s.sys.settings.status>=5&&s.sys.settings.status<=7).map(s=>s.scene.key);
  const savedPads=navigator.getGamepads;
  navigator.getGamepads=()=>[{id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:performance.now()}];
  report.promise=(async()=>{try{
    const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
    const dep=name=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+name+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
    const {SaveSystem:S}=await import(dep('SaveSystem')),{RunTransitionManager:T}=await import(dep('RunTransitionManager')),{ANOMALY_BY_ID}=await import(dep('ANOMALY_BY_ID'));
    for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);await wait(100);
    check(S.createProfile('Pause '+Date.now().toString().slice(-6)).ok,'isolated profile');
    S.setSettings({masterVolume:0,contextualTutorials:false});S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
    game.scene.start('menu');await wait(100);const menu=game.scene.keys.menu;T.clearForMenu(menu);
    const session={baseSeed:550055,round:9,protocol:'normal',objectiveMode:'open',equippedMods:[],modsEarned:[]};
    T.requestArenaTransition(menu,{reason:'new-run',session});await until(()=>game.scene.isActive('loading')&&T.snapshot(game.scene.keys.loading).lastStep==='awaiting-user-deploy-confirmation','loading');
    game.scene.keys.loading.confirmDeployment(session,'new-run');await until(()=>game.scene.isActive('arena')&&game.scene.keys.arena.roundRuntime?.phase==='active','Arena');
    const a=game.scene.keys.arena;globalThis.__pauseOptionsArena=a;
    a.pointerLock.hidePrompt();a.playerInput.adoptDevice('gamepad');a.pointerLockInitialGate=false;if(a.state.state==='Paused')a.resumeGameplay();a.player.invulnUntil=Infinity;
    const player=a.player,round=a.roundRuntime,floor=a.dynamicFloor;
    const checkOptions=async(combat,label)=>{
      if(combat===a)a.togglePause();else combat.pauseHeist();
      await wait(200);click(combat,'Options');await until(()=>game.scene.isActive('options'),'Options launch');await wait(100);
      const options=game.scene.keys.options,order=visibleOrder();
      check(combat.sys.isPaused(),'combat frozen '+label);
      check(order.at(-1)==='options','Options renders above paused combat '+label,order);
      const held=floor.elapsed;await wait(100);check(floor.elapsed===held,'floor clock remains paused '+label);
      for(const tab of ['audio','gameplay','interface','profile','system']){options.selectTab(tab);check(options.tabContainers.get(tab).visible,'visible Options tab '+label+'/'+tab);}
      options.handleEscReturn();await until(()=>!game.scene.isActive('options')&&combat.sys.isActive(),'return from Options');
      check(!combat.physics.world.isPaused,'combat resumes '+label);
      check(a.player===player&&a.roundRuntime===round&&a.dynamicFloor===floor,'same deployment preserved '+label);
    };
    await checkOptions(a,'initial Arena');
    // Exercise the real return which promotes Arena above previously registered UI scenes.
    for(const id of ['heist','skybreach']){
      a.beginAnomalyTransition({anomalyId:id,definition:ANOMALY_BY_ID.get(id),sessionId:'pause-options-'+id+'-'+Date.now(),cost:60,portal:{x:a.player.x,y:a.player.y}});
      await until(()=>game.scene.isActive('anomaly-'+id)&&game.scene.keys['anomaly-'+id].player,id+' handoff');
      const anomaly=game.scene.keys['anomaly-'+id];anomaly.inputController.adoptDevice('gamepad');
      await checkOptions(anomaly,id);
      anomaly.returnToArena(false,'scene-shutdown');await until(()=>game.scene.isActive('arena')&&!a.anomalyReturnLifecycle.blocksExternalPause,id+' return');
      await checkOptions(a,'Arena after '+id);
    }
    await checkOptions(a,'repeated Arena');
    a.togglePause();await wait(200);click(a,'Options');await until(()=>game.scene.isActive('options'),'review Options');
  }catch(error){report.errors.push(error.stack??String(error));}finally{navigator.getGamepads=savedPads;report.running=false;}})();return 'Pause Options audit started';
})()
