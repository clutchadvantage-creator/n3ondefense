// Assisted real-scene verification, using the existing local-only DEV browser.
(() => {
  const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[]};
  const check=(ok,label)=>{report.cases.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const until=async(fn,label)=>{for(let i=0;i<700;i++){if(fn())return;await wait(40);}throw Error('Timeout: '+label);};
  const all=scene=>{const out=[];const visit=o=>{out.push(o);o.list?.forEach(visit);};scene.children.list.forEach(visit);return out;};
  const click=(scene,label)=>{const root=all(scene).find(o=>o.text===label)?.parentContainer;const hit=root?.getByName('button-hit')??root;check(hit?.input,'button: '+label);hit.emit('pointerdown');};
  const stop=async()=>{for(const s of game.scene.getScenes(false))game.scene.stop(s.scene.key);await wait(90);};
  const acknowledge=async()=>{const b=document.querySelector('.tutorial-overlay:not([hidden]) .tutorial-continue');check(b&&!b.hidden,'visible acknowledgement');b.click();await wait(220);};
  let arena,originalUpdate;
  report.promise=(async()=>{try{
    const {SaveSystem:S}=await import('/src/game/systems/SaveSystem.ts');
    await stop();check(S.createProfile('Interrupt '+Date.now().toString().slice(-6)).ok,'isolated partial profile');
    S.setSettings({masterVolume:0,lyra:{...S.get().settings.lyra,voice:false}});
    game.scene.start('menu');await wait(260);
    click(game.scene.keys.menu,'OPERATOR GARAGE');await until(()=>game.scene.isActive('garage'),'early Garage');await wait(250);
    check(game.scene.keys.garage.tutorialDirector.active?.id==='onboarding.garage','early Garage teaching');
    await acknowledge();click(game.scene.keys.garage,'MOD COLLECTION');await until(()=>game.scene.isActive('mods'),'early Collection');await wait(250);
    await acknowledge();await acknowledge();await acknowledge();
    check(S.getTutorialProgress().learning.objectives['onboarding.mod-collection.equip']!=='COMPLETED','empty Collection fallback leaves equipment pending');
    const visited=JSON.stringify(S.getTutorialProgress().learning.messages);
    // Leave while the last explanation is visible, then rapidly visit unrelated screens.
    await stop();game.scene.start('upgrades',{returnScene:'menu'});await wait(30);
    await stop();game.scene.start('garage');await wait(30);
    await stop();game.scene.start('menu');await wait(450);
    check(document.querySelectorAll('.tutorial-overlay:not([hidden])').length<=1,'rapid navigation retires older overlays');
    check(S.getTutorialProgress().trainingRoundsCompleted===0&&!S.getCampaignProgress().packages.training.eligible,'early exploration grants no training win or reward');
    await stop();game.scene.start('arena',{baseSeed:522255,round:1,protocol:'normal',objectiveMode:'open',modsEarned:[]});
    arena=game.scene.keys.arena;
    const settle=async()=>{
      await until(()=>game.scene.isActive('arena')&&arena.roundRuntime.phase==='active'&&arena.player?.active,'Arena ready');
      arena.player.invulnUntil=Infinity;arena.playerInput.adoptDevice('gamepad');arena.pointerLockInitialGate=false;
      if(arena.state.state==='Paused')arena.restoreGameplayAfterPause();
      originalUpdate=arena.sys.sceneUpdate;arena.sys.sceneUpdate=()=>{};arena.physics.pause();await wait(180);
    };
    await settle();check(arena.tutorialDirector.isActive(),'training visible before pause');
    arena.togglePause();await wait(220);
    check(arena.pauseMenu&&!arena.tutorialDirector.isActive()&&arena.physics.world.isPaused,'Pause clears teaching and keeps physics paused');
    click(arena,'RESUME');await wait(230);
    check(arena.state.state!=='Paused'&&arena.tutorialDirector.active?.steps[arena.tutorialDirector.stepIndex]?.id!=='welcome','Resume skips delivered introduction');
    arena.physics.pause();arena.updatePlayerMovement(arena.time.now);arena.player.body.reset(arena.player.x+16,arena.player.y);arena.updatePlayerMovement(arena.time.now+16);
    check(S.getTutorialProgress().learning.objectives['onboarding.basic-controls.move']==='COMPLETED','movement committed before transition gap');
    arena.player.hp=0;arena.triggerDefeat('playerDead');await until(()=>game.scene.isActive('results'),'results');
    arena.sys.sceneUpdate=originalUpdate;originalUpdate=null;
    click(game.scene.keys.results,'TRY AGAIN');
    await until(()=>game.scene.isActive('loading'),'retry deployment loading');
    await until(()=>game.scene.keys.loading.statusText?.text==='DEPLOYMENT READY','retry deploy confirmation');
    const deployLabel=all(game.scene.keys.loading).find(o=>['PRESS A TO DEPLOY','CLICK TO DEPLOY'].includes(o.text))?.text;
    click(game.scene.keys.loading,deployLabel);
    await settle();
    check(S.getTutorialProgress().trainingRoundsCompleted===0,'real Try Again does not count failed round');
    check(!['welcome','move'].includes(arena.tutorialDirector.active?.steps[arena.tutorialDirector.stepIndex]?.id),'real Try Again skips recorded explanations/actions');
    arena.togglePause();click(arena,'QUIT TO MAIN MENU');await until(()=>game.scene.isActive('menu'),'pause quit');await wait(300);
    check(S.getTutorialProgress().learning.objectives['onboarding.basic-controls.move']==='COMPLETED','Pause quit preserves movement');
    check(document.querySelector('.tutorial-title')?.textContent==='PROGRESS ARCHIVED','first pause quit offers passive archive status');
    const dismiss=document.querySelector('.tutorial-overlay:not([hidden]) .tutorial-continue'),bounds=dismiss.getBoundingClientRect();
    check(document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2)===dismiss,'archive dismissal is unobstructed');
    // Leave the notice visible to test refresh during teaching, not after its acknowledgement.
    sessionStorage.setItem('adaptive-tutorial-partial',JSON.stringify({profile:S.getActiveProfileSummary().id,progress:S.getTutorialProgress(),earlyMessages:JSON.parse(visited)}));
  }catch(error){report.errors.push(String(error.stack??error));}
  finally{if(arena&&originalUpdate)arena.sys.sceneUpdate=originalUpdate;report.running=false;}})();
  return {started:true};
})();
