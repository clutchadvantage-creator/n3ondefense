// Isolated DEV browser. Real Arena callbacks, entities, input and possession lifecycle.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],screenshots:[]};
  const game=globalThis.n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(ok,label)=>{report.cases.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const until=async fn=>{for(let i=0;i<450;i++){if(fn())return;await wait(40);}throw Error('Arena setup timeout');};
  report.promise=(async()=>{try{
    const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
    const dep=name=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+name+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
    const {SaveSystem:S}=await import(dep('SaveSystem'));
    const {RoundManager}=await import(dep('RoundManager'));
    const {selectBossArchetype}=await import(dep('selectBossArchetype'));
    const {MOD_DEFINITIONS}=await import('/src/game/mods/definitions.ts');
    const {NORMAL_MOD_SLOTS}=await import('/src/game/mods/types.ts');
    const used=new Set();
    const equippedMods=NORMAL_MOD_SLOTS.map((slot,i)=>{
      const d=MOD_DEFINITIONS.find(d=>!used.has(d.id)&&d.category===(slot==='wildcard'?'utility':slot)&&!['legendary','supreme'].includes(d.rarity));
      used.add(d.id);return {id:d.id,rank:0,slot,infusionId:i===0?'ascension-protocol':undefined};
    });
    for(const s of game.scene.getScenes(false))game.scene.stop(s.scene.key);
    await wait(100);check(S.createProfile('Mace review '+Date.now().toString().slice(-7)).ok,'isolated review profile');
    S.setSettings({masterVolume:0,contextualTutorials:false});
    S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
    let baseSeed=1;
    while(selectBossArchetype(5,new RoundManager(baseSeed,'open',5,'normal').currentDefinition().seed)!=='void-brawler')baseSeed++;
    game.scene.start('arena',{baseSeed,round:5,protocol:'normal',objectiveMode:'open',equippedMods,modsEarned:[]});
    const a=game.scene.keys.arena;
    await until(()=>a.bossIntroOverlay?.ready);
    a.playerInput.adoptDevice('gamepad');a.pointerLockInitialGate=false;
    a.bossIntroOverlay.ready.element.click();await until(()=>a.bossFlowPhase==='combat');
    await wait(150);a.scene.pause();a.physics.pause();
    const enemy=a.bossEncounter,b=enemy.boss,p=a.player;
    check(b.archetype==='void-brawler'&&b.faction==='enemy','actual hostile brawler encounter');
    check(Math.abs(b.body.halfWidth-34)<.01,'unchanged 68-pixel chassis collider');
    check(!b.weapons.some(w=>w.texture.key.includes('hammer'))&&b.maceRig,'hammer replaced by mace renderer');
    p.invulnUntil=Infinity;
    const capture=async(name,boss)=>{
      a.cameras.main.stopFollow().removeBounds().setZoom(.9).centerOn(boss.x+30,boss.y);
      await wait(60);
      await new Promise(resolve=>game.renderer.snapshotArea(Math.round(game.scale.width/2-300),Math.round(game.scale.height/2-210),600,420,img=>{
        report.screenshots.push({name,data:img.src});resolve();
      }));
    };
    enemy.elapsedMs=0;enemy.lastPounceAt=enemy.lastTeleportAt=enemy.lastSuperAt=0;b.maceMotion.reset();
    let enemyExtended=false,charged=false;
    const target={x:b.x+220,y:b.y,combatRadius:p.combatRadius};
    for(let i=0;i<300;i++){
      enemy.update(16,target);
      charged ||= b.body.velocity.length()>500;
      if(!enemyExtended&&b.maceMotion.extension===1){enemyExtended=true;await capture('enemy-extended',b);}
    }
    check(charged,'enemy retains automatic charge speed');
    check(enemyExtended,'hostile mace automatically extends after three rotations');
    // Retain the real hostile boss as a damage target during possession.
    enemy.cancelCombat();b.shielded=false;
    for(const e of a.enemies.slice()){a.destroyEnemyColliders(e);e.destroy();}a.enemies=[];
    const bounds=a.layout.generation.bounds;
    let anchor;
    for(let y=bounds.y+200;y<bounds.y+bounds.h-200&&!anchor;y+=70)
      for(let x=bounds.x+200;x<bounds.x+bounds.w-200;x+=70)
        if(a.infusionLandingValid({x,y})&&!a.intersectsWallGeometry(x+65,y+45,130,85)&&Math.hypot(x-b.x,y-b.y)>250){anchor={x,y};break;}
    check(anchor,'clear arena location for controlled sweep');
    p.body.reset(anchor.x,anchor.y);
    p.weapon.damage=173;p.weapon.critChance=0;p.weapon.fireRate=12;
    p.buffs.damageBoostUntil=p.buffs.rapidFireUntil=0;
    const originalRandom=Math.random;let first=true;
    Math.random=()=>{if(first){first=false;return .9;}return originalRandom();};
    try{check(a.beginPossession(anchor,a.time.now+60000),'existing Ascension possession entry');}finally{Math.random=originalRandom;}
    const owned=a.possession,boss=owned.boss;
    check(boss.archetype==='void-brawler'&&p.combatBody===boss&&!p.visible,'operative controls the brawler');
    a.playerInput.clear();a.playerInput.pointerButtons[0]=1;
    a.aimWorldPoint.set(boss.x+250,boss.y);
    const grunt=a.spawnEnemy('grunt',false,anchor);grunt.body.reset(boss.x+185,boss.y);grunt.hp=10000;
    b.body.reset(boss.x+185,boss.y+30);b.hp=b.maxHp;
    const hostileHp=b.hp;
    let extended=false,retracted=false,controlledCharge=false,maxDamagePerPulse=0;
    for(let i=0;i<270;i++){
      const hp=grunt.hp;
      a.playerInput.update('gameplay');a.updatePossession(a.time.now,16);
      maxDamagePerPulse=Math.max(maxDamagePerPulse,hp-grunt.hp);
      if(!extended&&boss.maceMotion.extension===1){extended=true;await capture('controlled-extended',boss);}
      if(extended&&boss.maceMotion.extension===0)retracted=true;
    }
    check(extended&&retracted,'holding existing fire input automatically extends and retracts');
    check(grunt.hp<10000&&maxDamagePerPulse===173,'extended sweep hits real enemies once per pulse for live operative damage');
    check(b.hp<hostileHp,'controlled mace damages the real enemy boss');
    check(owned.pounceStartsAt===0,'primary does not add or require a charge input');
    check(Math.abs(owned.options.controlledWeapon.fireRate()-p.fireRate*.75)<.001,'existing three-quarter fire-rate scaling');
    a.playerInput.clear();a.updatePossession(a.time.now,400);
    check(boss.maceMotion.extension===0&&!boss.maceMotion.swinging,'release stops swinging and retracts');
    await capture('controlled-retracted',boss);
    a.playerInput.pendingPulses.add('dash');a.playerInput.update('gameplay');a.updatePossession(a.time.now,16);
    a.playerInput.clear();
    for(let i=0;i<40;i++){a.updatePossession(a.time.now,16);controlledCharge ||= boss.body.velocity.length()>500;}
    check(controlledCharge,'existing dash input still triggers the boss charge');
    // Deployables and shield still belong to the operative while the chassis is controlled.
    a.destroyEnemyColliders(grunt);grunt.destroy();a.enemies=[];b.body.reset(boss.x+500,boss.y+500);
    a.aimWorldPoint.set(boss.x+65,boss.y+45);a.mineChargeRack.reset(3);
    for(const [action,group] of [['fence','fences'],['turret','turrets'],['mine','mines']]){
      p.energy=p.energyStats.max;a.abilityCooldownUntil[action]=0;
      const before=a[group].length;
      a.playerInput.clear();a.playerInput.pendingPulses.add(action);a.playerInput.update('gameplay');a.updatePlayerMovement(a.time.now);
      check(a[group].length===before+1,`controlled brawler retains ${action} deployment`);
    }
    p.energy=p.energyStats.max;a.shieldCooldownUntil=0;
    a.playerInput.clear();a.playerInput.pendingPulses.add('shield');a.playerInput.update('gameplay');a.updatePlayerMovement(a.time.now);
    check(a.shieldVisual&&p.shieldUntil>a.time.now,'controlled brawler retains operative shield');
    const root=boss.visualRoot;
    a.endPossession(true);
    check(!a.possession&&p.visible&&p.body.enable&&!root.active&&!boss.active,'possession exit restores operative and destroys mace graphics');
    game.scene.stop('arena');await wait(60);
    check(a.children.list.length===0,'scene teardown leaves no mace render objects');
  }catch(error){report.errors.push(String(error.stack??error));}
  finally{report.running=false;}})();
  return {started:true};
})();
