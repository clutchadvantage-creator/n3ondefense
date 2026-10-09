// Run after audit-infusion-overhaul.browser.js in an isolated DEV browser.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],samples:[],errors:[]};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  report.promise=(async()=>{try {
    const {a,anchor}=globalThis.__infusionFixture,p=a.player;
    a.endPossession(true);a.playerInput.clear();
    a.enemies.slice().forEach(e=>{a.destroyEnemyColliders(e);e.destroy();});a.enemies=[];
    for(const group of ['fences','turrets','mines']){a[group].forEach(o=>o.destroy());a[group]=[];}
    const clearShots=()=>{a.projectiles.forEach(s=>a.retireProjectile(s));a.projectiles=[];};
    clearShots();a.updateSystemInfusions(a.time.now,.016);
    p.weapon.damage=173;p.weapon.critChance=0;p.weapon.fireRate=12;p.buffs.damageBoostUntil=0;p.buffs.rapidFireUntil=0;
    const playerHp=p.hp;
    for(const [index,archetype] of ['artillery','storm-mage','void-brawler'].entries()) {
      report.current=archetype;
      const random=Math.random;let first=true;
      Math.random=()=>{if(first){first=false;return (index+.2)/3;}return random();};
      try{check(a.beginPossession(anchor,a.time.now+60000),archetype+': possession starts');}finally{Math.random=random;}
      const e=a.possession,b=e.boss;
      check(e.archetype===archetype,archetype+': selected chassis');
      const aim={x:b.x+55,y:b.y};
      const target=a.spawnEnemy('grunt',false,anchor);target.body.reset(aim.x,aim.y);target.hp=10000;
      const input={move:{x:0,y:0},aim,primary:true,secondary:false};
      const placeAtMaceHead=delta=>{
        if(archetype!=='void-brawler')return;
        const pose=Object.assign(Object.create(Object.getPrototypeOf(b.maceMotion)),b.maceMotion);
        pose.update(delta,true,800);
        const head=pose.head(b.x,b.y,Math.atan2(aim.y-b.y,aim.x-b.x));
        target.body.reset(head.x,head.y);
      };
      placeAtMaceHead(1);
      e.updateControlled(1,input);if(archetype==='storm-mage')e.updateControlled(45,input);
      if(archetype==='void-brawler')check(target.hp===9827,'brawler primary uses operative damage');
      else {
        const shot=a.projectiles.find(s=>s.from==='player');check(shot?.damage===173,archetype+': projectile matches operative damage');
        const before=target.hp;shot.sprite.body.reset(target.x,target.y);shot.previousX=target.x;shot.previousY=target.y;
        a.updateProjectiles(16);check(target.hp<before&&target.lastDamageSource==='weapon',archetype+': real enemy takes player weapon damage');
      }
      clearShots();p.buffs.damageBoostUntil=a.time.now+5000;p.buffs.rapidFireUntil=a.time.now+5000;
      const expected=a.rollPlayerWeaponDamage(a.time.now).damage;
      placeAtMaceHead(200);
      e.updateControlled(200,input);if(archetype==='storm-mage')e.updateControlled(45,input);
      check(archetype==='void-brawler'?target.hp===9827-expected:a.projectiles.filter(s=>s.from==='player').every(s=>s.damage===expected),archetype+': active damage pickup carries into chassis');
      const rate=p.fireRate*(a.bombsiteMods?.playerFireRateMultiplier(p.x,p.y)??1)*.75;
      check(Math.abs(e.options.controlledWeapon.fireRate()-rate)<.0001,archetype+': active Rapid Fire and field cadence carry into chassis');
      p.buffs.damageBoostUntil=0;p.buffs.rapidFireUntil=0;clearShots();
      a.destroyEnemyColliders(target);target.destroy();a.enemies=[];
      const placement={x:anchor.x+65,y:anchor.y+45};check(a.isValidPlacement(placement.x,placement.y),'safe ability fixture');
      a.mineChargeRack.reset(3);
      a.aimWorldPoint.set(placement.x,placement.y);
      const press=action=>{a.playerInput.clear();a.playerInput.pendingPulses.add(action);a.playerInput.update('gameplay');a.updatePlayerMovement(a.time.now);};
      for(const [ability,group] of [['fence','fences'],['turret','turrets'],['mine','mines']]) {
        p.energy=p.energyStats.max;a.abilityCooldownUntil[ability]=0;
        const before=a[group].length,energy=p.energy;press(ability);
        check(a[group].length===before+1&&p.energy<energy,archetype+': '+ability+' input places real deployable and spends energy');
      }
      p.energy=p.energyStats.max;a.shieldCooldownUntil=0;press('shield');
      check(a.shieldVisual&&p.shieldUntil>a.time.now,archetype+': shield input activates');
      check(a.shieldVisual.field.scaleX>1.5,archetype+': shield fits chassis radius');
      const before=b.hp;check(!p.takeDamage(37)&&b.hp===before,archetype+': shield blocks chassis damage');
      a.projectiles.push(a.obtainProjectile({x:b.x+25,y:b.y,texture:'circle',width:7,height:7,tint:0xff7744,rotation:0,velocityX:0,velocityY:0,depth:8,damage:13,from:'enemy',lifeMs:1000,trailColor:0xff7744}));
      a.updateProjectiles(16);check(b.hp===before,archetype+': shield blocks real incoming projectile');
      a.destroyShieldOrb();a.shieldActiveUntil=0;check(p.takeDamage(13)&&b.hp===before-13,archetype+': damage resumes after shield');
      check(p.hp===playerHp,archetype+': operative health remains intact');
      a.endPossession(true);a.playerInput.clear();clearShots();
      for(const group of ['fences','turrets','mines']){a[group].forEach(o=>o.destroy());a[group]=[];}
    }
    a.clearRoundInfusionEffects();report.cases.push({name:'all three forms: live build, deployables, shields, damage ownership'});
  }catch(e){report.errors.push(String(e.stack??e));}finally{report.running=false;}})();return {started:true};
})();
