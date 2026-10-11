// Real Arena owners and WebAudio playback; movement/stop scenarios are assisted.
(() => {
  const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[]};
  const check=(ok,label)=>{report.cases.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const until=async(fn,label)=>{for(let i=0;i<550;i++){if(fn())return;await wait(30);}throw Error('Timeout: '+label);};
  const stop=async()=>{for(const s of game.scene.getScenes(false))game.scene.stop(s.scene.key);await wait(100);};
  const all=scene=>{const out=[];const visit=o=>{out.push(o);o.list?.forEach(visit);};scene.children.list.forEach(visit);return out;};
  report.promise=(async()=>{try{
    const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
    const dep=name=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+name+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
    const {SaveSystem:S}=await import(dep('SaveSystem'));
    const {RoundManager}=await import(dep('RoundManager'));
    const {selectBossArchetype}=await import(dep('selectBossArchetype'));
    const {MOD_DEFINITIONS}=await import('/src/game/mods/definitions.ts');
    const {NORMAL_MOD_SLOTS}=await import('/src/game/mods/types.ts');
    const used=new Set(),equippedMods=NORMAL_MOD_SLOTS.map((slot,i)=>{
      const d=MOD_DEFINITIONS.find(d=>!used.has(d.id)&&d.category===(slot==='wildcard'?'utility':slot)&&!['legendary','supreme'].includes(d.rarity));
      used.add(d.id);return {id:d.id,rank:0,slot,infusionId:i===0?'ascension-protocol':undefined};
    });
    await stop();check(S.createProfile('Walk audio '+Date.now().toString().slice(-6)).ok,'isolated audio profile');
    S.setSettings({masterVolume:.5,sfxVolume:.5,musicVolume:0,contextualTutorials:false,lyra:{...S.get().settings.lyra,voice:false}});
    S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
    // Existing generated mixer controls must expose and persist the new channel.
    game.scene.start('options',{returnScene:'menu'});await wait(350);
    const options=game.scene.keys.options;options.selectTab('audio');
    const category=all(options).find(o=>o.text?.includes('ENEMIES & BOSSES'))?.parentContainer?.getByName('button-hit');
    check(category,'Enemies & Bosses category exists');
    if(!options.expandedAudioCategories.has('enemies'))category.emit('pointerdown');
    await wait(100);
    check(all(options).some(o=>o.text==='BOSS WALKING'),'Boss Walking slider rendered in Options');
    options.updateSoundVolume('bossWalking',.37);
    check(S.get().settings.soundVolumes.bossWalking===.37,'Options change saved');
    await stop();
    const archetypes=['artillery','storm-mage','void-brawler'];
    for(const [index,desired] of archetypes.entries()){
      report.current=desired;
      let baseSeed=1;while(selectBossArchetype(5,new RoundManager(baseSeed,'open',5,'normal').currentDefinition().seed)!==desired)baseSeed++;
      game.scene.start('arena',{baseSeed,round:5,protocol:'normal',objectiveMode:'open',equippedMods,modsEarned:[]});
      const a=game.scene.keys.arena;
      await until(()=>a.bossIntroOverlay?.ready,'boss intro');
      a.player.invulnUntil=Infinity;a.playerInput.adoptDevice('gamepad');a.pointerLockInitialGate=false;
      a.bossIntroOverlay.ready.element.click();await until(()=>a.bossFlowPhase==='combat','boss combat');
      await a.audio.bossWalkingAudio.ready;await a.audio.context.resume();
      check(a.audio.bossWalkingAudioDiagnostics().loaded&&a.audio.bossWalkingAudioDiagnostics().duration>0,'clip decoded: '+desired);
      check(Math.abs(a.audio.getSfxVolume('bossWalking')-.5*.5*.37)<1e-8,'Master × SFX × Boss Walking mix: '+desired);
      const encounter=a.bossEncounter,b=encounter.boss;
      await until(()=>a.audio.bossWalkingAudioDiagnostics().active===1,'enemy walking loop');
      check(b.archetype===desired,'real moving '+desired+' owns walking loop');
      const original=encounter.update;
      encounter.update=()=>b.setVelocity(0,0);
      await until(()=>a.audio.bossWalkingAudioDiagnostics().fading===1,'fade begins');
      check(a.audio.bossWalkingAudioDiagnostics().active===1,'stop initially fades instead of cutting: '+desired);
      await until(()=>a.audio.bossWalkingAudioDiagnostics().active===0,'fade stops');
      encounter.update=original;
      await until(()=>a.audio.bossWalkingAudioDiagnostics().active===1,'walking returns');
      check(true,'movement restarts sound: '+desired);
      a.togglePause();await wait(100);check(a.audio.bossWalkingAudioDiagnostics().active===0,'pause retires walking audio: '+desired);
      a.playerInput.adoptDevice('gamepad');a.resumeGameplay();await until(()=>a.audio.bossWalkingAudioDiagnostics().active===1,'resume audio');
      S.setSettings({masterVolume:0});a.audio.refreshMix();await wait(70);
      check(a.audio.bossWalkingAudioDiagnostics().active===0,'Master mute silences walking: '+desired);
      S.setSettings({masterVolume:.5});a.audio.refreshMix();await until(()=>a.audio.bossWalkingAudioDiagnostics().active===1,'unmute walking');
      if(index===0){
        S.setSettings({sfxVolume:0});a.audio.refreshMix();
        check(a.audio.bossWalkingAudioDiagnostics().active===0,'SFX mute immediately stops walking');
        S.setSettings({sfxVolume:.5});a.audio.refreshMix();await until(()=>a.audio.bossWalkingAudioDiagnostics().active===1,'SFX restore');
        S.setSettings({soundVolumes:{...S.get().settings.soundVolumes,bossWalking:0}});a.audio.refreshMix();
        check(a.audio.bossWalkingAudioDiagnostics().active===0,'Boss Walking channel mute immediately stops walking');
        S.setSettings({soundVolumes:{...S.get().settings.soundVolumes,bossWalking:.37}});a.audio.refreshMix();await until(()=>a.audio.bossWalkingAudioDiagnostics().active===1,'channel restore');
        game.events.emit('blur');check(a.audio.bossWalkingAudioDiagnostics().active===0,'focus-loss audio hook stops walking immediately');
        await until(()=>a.audio.bossWalkingAudioDiagnostics().active===1,'focused gameplay resumes walking');
        game.events.emit('hidden');check(a.audio.bossWalkingAudioDiagnostics().active===0,'hidden-page audio hook stops walking immediately');
      }
      encounter.cancelCombat();await wait(400);
      const random=Math.random;let first=true;Math.random=()=>{if(first){first=false;return (index+.2)/3;}return random();};
      try{check(a.beginPossession({x:a.player.x,y:a.player.y},a.time.now+60000),'existing boss possession: '+desired);}finally{Math.random=random;}
      const owned=a.possession,boss=owned.boss;
      check(boss.archetype===desired&&boss.faction==='player','player-controlled '+desired);
      // Exercise its real movement controller while Arena owns the sound update.
      const updatePossession=a.updatePossession;
      a.updatePossession=(_now,delta)=>owned.updateControlled(delta,{move:{x:.5,y:.3},aim:{x:boss.x+200,y:boss.y},primary:false,secondary:false});
      await until(()=>a.audio.bossWalkingAudio.voices.get(boss)?.source,'controlled walking audio');
      check(true,'controlled movement owns sound: '+desired);
      a.updatePossession=(_now,delta)=>owned.updateControlled(delta,{move:{x:0,y:0},aim:{x:boss.x+200,y:boss.y},primary:false,secondary:false});
      await until(()=>!a.audio.bossWalkingAudio.voices.get(boss)?.source,'controlled idle');
      check(true,'controlled stop fades out: '+desired);
      a.updatePossession=updatePossession;
      await stop();check(a.audio.bossWalkingAudioDiagnostics().owners===0&&a.audio.bossWalkingAudioDiagnostics().active===0,'scene shutdown releases owners: '+desired);
    }
  }catch(error){const a=game.scene.keys.arena;report.failureState={focus:document.hasFocus(),hidden:document.hidden,state:a?.state.state,audio:a?.audio.bossWalkingAudioDiagnostics()};report.errors.push(String(error.stack??error));}
  finally{await stop();report.running=false;}})();return {started:true};
})();
