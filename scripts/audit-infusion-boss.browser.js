// Runs the same integration suite in a real boss round, then resolves the encounter.
(() => {
  (async()=>{
    globalThis.__infusionTestRound=10;globalThis.__infusionTestMode='normal';
    const {default:source}=await import('/scripts/audit-infusion-overhaul.browser.js?raw');
    (0,eval)(source);
    const report=globalThis.__n3onLayoutAudit;await report.promise;
    if(report.errors.length)return;
    report.running=true;
    const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
    try{
      const {a,Turret,anchor}=globalThis.__infusionFixture,player=a.player;
      const hostile=a.bossEncounter,hostileHp=hostile?.boss.hp,playerHp=player.hp;
      check(hostile?.boss.faction==='enemy'&&a.bossFlowPhase==='combat','actual enemy boss objective active');
      check(hostile.boss.shielded&&hostile.shield,'enemy boss shields at combat entrance');
      check(hostile.boss.takeDamage(100)===0&&hostile.boss.hp===hostileHp,'enemy shield blocks player damage');
      hostile.update(2500,player);
      check(!hostile.boss.shielded&&!hostile.shield,'enemy shield expires during actual encounter update');
      const activate=()=>{
        a.clearRoundInfusionEffects();a.turrets.forEach(t=>t.destroy());a.turrets=[];
        a.projectiles.forEach(p=>a.retireProjectile(p));a.projectiles=[];
        player.body.reset(anchor.x,anchor.y);a.updateSystemInfusions(a.time.now,.016);
        const turrets=[0,1,2].map(i=>{const t=new Turret(a,anchor.x+50+i*24,anchor.y,0x70ffdf,500,30,3,500);a.turrets.push(t);return t;});
        const random=Math.random;let choice=true;Math.random=()=>{if(choice){choice=false;return 0;}return random();};
        try{check(a.systemInfusions.ascend(turrets[0],a.time.now),'possession in boss round');}finally{Math.random=random;}
        return a.possession;
      };
      const first=activate(),deadBody=first.boss;deadBody.takeDamage(deadBody.hp);a.updatePossession(a.time.now,16);
      check(!a.possession&&!a.bossVictoryHandled&&a.bossFlowPhase==='combat'&&hostile.boss.hp===hostileHp,'friendly chassis death cannot complete enemy objective');
      const owned=activate();a.updateHud(a.time.now);
      check(hostile.healthTrack.visible&&!owned.healthTrack.visible&&a.hudPayload.maxHp===owned.boss.maxHp,'independent enemy boss bar and chassis integrity HUD');
      a.updateSystemInfusions(a.time.now,.016);check(a.infusionInteracting,'possessed input cannot also plant bombs');
      // Fire through the actual controlled boss attack path and existing projectile resolver.
      owned.updateControlled(1600,{move:{x:0,y:0},aim:hostile.boss,primary:true,secondary:false});
      const shot=a.projectiles.find(p=>p.from==='player');check(shot,'controlled boss fires against enemy boss');
      shot.sprite.body.reset(hostile.boss.x,hostile.boss.y);shot.previousX=hostile.boss.x;shot.previousY=hostile.boss.y;
      a.updateProjectiles(16);check(hostile.boss.hp<hostileHp&&player.hp===playerHp,'player boss weapon damages enemy boss and preserves operative HP');
      const remaining=a.projectiles.find(p=>p.from==='player');check(remaining,'remaining boss volley');
      hostile.boss.hp=1;remaining.sprite.body.reset(hostile.boss.x,hostile.boss.y);remaining.previousX=hostile.boss.x;remaining.previousY=hostile.boss.y;
      a.updateProjectiles(16);check(a.bossVictoryHandled&&a.roundRuntime.phase!=='active','enemy boss defeat enters existing victory flow');
      a.scene.resume();
      for(let i=0;i<120&&a.bossFlowPhase!=='loot-collection';i++)await new Promise(r=>setTimeout(r,50));
      check(!a.possession&&!player.combatBody&&player.visible&&player.body.enable,'victory teardown restores operative');
      check(!owned.boss.active&&!a.systemInfusions&&!a.infusionReticle,'boss transition retires all Infusion state');
      check(a.bossFlowPhase==='loot-collection','existing boss loot/progression flow reached');
      a.scene.pause();a.physics.pause();report.cases.push({name:'boss-versus-boss victory and lifecycle'});
    }catch(error){report.errors.push(String(error.stack??error));}
    finally{report.running=false;delete globalThis.__infusionTestRound;delete globalThis.__infusionTestMode;}
  })();return {started:true};
})();
