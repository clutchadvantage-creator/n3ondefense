// Actual Arcade contacts and Arena mechanics in an isolated profile.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,checks:[],cases:[],errors:[],samples:[]};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  report.promise=(async()=>{let context;try{
    const {kineticAuditArena}=await import('/scripts/kinetic-audit-setup.js');context=await kineticAuditArena(globalThis.__n3onLayoutAuditOptions);
    const {a,game,dep,wait}=context;report.renderer=context.renderer;
    const p=a.player,b=p.body,w=a.physics.world;a.destroyDynamicFloor();
    for(const e of [...a.enemies])a.removeArcadeEnemy(e);
    let spot;
    const bounds=a.layout.generation.bounds;
    for(let y=bounds.y+145;y<bounds.y+bounds.h-145&&!spot;y+=20)for(let x=bounds.x+120;x<bounds.x+bounds.w-450&&!spot;x+=20)
      if(!a.wallRects.some(r=>x+450>r.x&&x-80<r.x+r.w&&y+145>r.y&&y-100<r.y+r.h))spot={x,y};
    check(!!spot,'clear live collision test area');const x=spot.x,y=spot.y;report.spot=spot;
    const wall=a.walls.create(x+190,y+30,'pixel').setDisplaySize(20,200).setVisible(false).setData('kineticSurface','inner');wall.refreshBody();
    const low=p.stats.moveSpeed,pressed=a.playerInput.pressed,held=a.playerInput.held,aim=a.getAimWorldPoint;
    a.playerInput.pressed=()=>false;a.playerInput.held=()=>false;a.getAimWorldPoint=()=>({x:x+1000,y});
    p.invulnUntil=Infinity;a.state.set('Defense');p.dashUntil=0;w.timeScale=1;w._elapsed=0;
    const tick=(ms=1000/60,control=false)=>{
      a.time.now+=ms;a.kinetics.beginFrame();a.enemySeparationGrid.rebuild(a.enemies);w.update(a.time.now,ms);w.postUpdate();
      if(control)a.updatePlayerMovement(a.time.now,ms/1000);a.kineticVfx.update(a.time.now);
    };
    const reset=(xx=x,yy=y)=>{b.reset(xx,yy);b.enable=true;p.setActive(true).setVisible(true).setScale(1);p.dashUntil=0;w._elapsed=0;};
    reset(x+160);p.stats.moveSpeed=65;a.playerInput.move.x=1;a.playerInput.move.y=0;const hits=b.kinetic.impacts;
    for(let i=0;i<120;i++)tick(1000/60,true);
    check(p.x<=x+168.01&&b.kinetic.impacts===hits,'slow held contact slides without bounce jitter');
    const runs=[];
    for(const speed of [265,900,2400,8000]){
      reset(x+155);b.setVelocity(speed,0);const before=b.kinetic.impacts;
      for(let i=0;i<8&&b.kinetic.impacts===before;i++)tick();
      check(b.velocity.x<0&&b.kinetic.impacts>before,'live wall reverses incoming '+speed);
      const after=b.velocity.x;a.updatePlayerMovement(a.time.now,1/60);
      check(b.velocity.x<0,'movement input preserves rebound '+speed);
      runs.push({speed,reflected:after,x:p.x});
    }
    reset(x+150,y-30);b.setVelocity(1600,600);tick();tick();
    check(b.velocity.x<0&&b.velocity.y>0,'glancing wall banks along its tangent');
    reset(x+150);p.stats.moveSpeed=265;p.dashTowardPoint(x+1000,y,a.time.now);tick();tick();
    check(b.velocity.x<0&&p.dashUntil>a.time.now,'Dash ricochets during its original active window');
    p.dashUntil=0;reset(x+155);p.stats.moveSpeed=265;const heldStart=b.kinetic.impacts;
    for(let i=0;i<240;i++)tick(1000/60,true);
    check(b.kinetic.impacts-heldStart<12,'holding toward wall creates separated impacts, no per-frame pump');
    check(b.velocity.length()<400,'held wall input does not create runaway energy');
    reset(x+160);b.setVelocity(0,0);tick();
    b.position.x+=80;b.updateCenter();b.setVelocity(8000,0);tick();
    check(p.x<x+168&&b.velocity.x<0,'post-sweep overlap separation cannot push through a solid wall');
    wall.destroy();p.stats.moveSpeed=low;
    report.samples.push({wallResponses:runs,heldImpacts:b.kinetic.impacts-heldStart});
    // Same actual colliders, damage owner and shield/iframe rules.
    const velocities=[];
    for(const type of ['grunt','shooter','tank','star']){
      reset();const enemy=a.spawnEnemy(type,false,{x:x+70,y});check(!!enemy,'spawn '+type);
      enemy.body.reset(x+70,y);enemy.body.setVelocity(0,0);enemy.hp=100000;
      p.invulnUntil=0;p.shieldUntil=a.time.now+10000;const hp=p.hp;
      b.setVelocity(1200,0);for(let i=0;i<5;i++)tick();
      check(enemy.body.velocity.x>0,type+' receives player momentum');check(p.hp===hp,type+' contact respects shield');
      velocities.push({type,enemy:enemy.body.velocity.x,player:b.velocity.x});a.removeArcadeEnemy(enemy);
    }
    check(velocities[0].enemy>velocities[2].enemy,'heavy chassis resists more than light chassis');report.samples.push({bodyResponses:velocities});
    reset();const contact=a.spawnEnemy('grunt',false,{x:x+50,y});contact.body.reset(x+50,y);contact.body.setVelocity(0,0);
    p.shieldUntil=0;p.invulnUntil=0;const hp=p.hp; b.setVelocity(900,0);for(let i=0;i<5;i++)tick();
    check(p.hp===hp-contact.stats.damage,'swept contact applies existing damage once');
    a.applyEnemyContactDamage(contact);check(p.hp===hp-contact.stats.damage,'duplicate overlap obeys original hit immunity');
    a.removeArcadeEnemy(contact);p.invulnUntil=Infinity;
    // A genuinely launched enemy meets another via the existing spatial grid.
    reset(x-60,y-70);const first=a.spawnEnemy('grunt',false,{x,y}),second=a.spawnEnemy('shooter',false,{x:x+80,y});
    first.body.reset(x,y);second.body.reset(x+80,y);second.body.setVelocity(0,0);first.setExternalVelocity(1000,0);
    for(let i=0;i<5;i++)tick();check(second.body.velocity.x>150,'enemy-enemy collision transfers a launch');
    check(first.body.kinetic.remaining>0&&second.body.kinetic.remaining>0,'both displaced units retain temporary momentum');
    const firstVelocity=first.body.velocity.clone();a.applyEnemySeparation();
    check(first.body.velocity.equals(firstVelocity),'legacy crowd nudges cannot add energy during retained momentum');
    a.removeArcadeEnemy(first);a.removeArcadeEnemy(second);
    reset();b.externalVelocity(600,0);b.reset(x+60,y);check(b.kinetic.remaining===0,'teleport reset clears stale contact momentum');
    b.externalVelocity(600,0);const remain=b.kinetic.remaining;b.moveWithSupport(x+62,y);
    check(b.kinetic.remaining===remain&&b.velocity.x===600,'moving-panel rider translation preserves genuine momentum');
    // Gaps keep their existing support/fall owner, with no kinetic edge barrier.
    reset();a.createDynamicFloor(9);const f=a.dynamicFloor;check(f.startEvent(),'validated floor event starts');
    for(let i=0;i<275;i++)a.updateDynamicFloor(20);const panel=f.panels.find(p=>p.phase==='open');check(!!panel,'real lava opening');
    const gx=panel.x+panel.w/2,gy=panel.y+panel.h/2;
    reset(gx,gy);a.floorPlayerRelocated();b.externalVelocity(700,0);const fallHp=p.hp;
    a.updateDynamicFloor(20);check(a.floorFalling(p),'kinetic movement over lava loses support');check(b.kinetic.remaining===0,'fall clears stale rebound energy');
    for(let i=0;i<70;i++)a.updateDynamicFloor(20);
    check(!a.floorFalling(p)&&b.enable,'lava ejects to safe active body');check(p.hp<fallHp,'existing lava damage still applies');
    check(b.kinetic.remaining===0&&f.isSupported(p.x,p.y,12,true),'ejection has safe support and no stale collision launch');
    // A genuine wall bank back into lava must reach the existing fall owner.
    reset(panel.x-28,gy);a.updateDynamicFloor(20);const lavaWall=a.walls.create(panel.x-60,gy,'pixel').setDisplaySize(8,64).setData('kineticSurface','inner').setVisible(false);lavaWall.refreshBody();
    b.setVelocity(-1200,0);const banks=b.kinetic.impacts;
    for(let i=0;i<14&&!a.floorFalling(p);i++){tick();a.updateDynamicFloor(20);}
    check(b.kinetic.impacts>banks&&a.floorFalling(p),'actual wall rebound sends operative into exposed lava');
    lavaWall.destroy();for(let i=0;i<75;i++)a.updateDynamicFloor(20);
    check(!a.floorFalling(p)&&b.kinetic.remaining===0,'rebound-induced fall recovers without carrying impact energy');
    // Ascension uses its large footprint and heavy response, not operative mass.
    const oldRandom=Math.random;let choose=true;Math.random=()=>{if(choose){choose=false;return 0;}return oldRandom();};
    try{check(a.beginPossession(p,a.time.now+60000),'controlled artillery frame');}finally{Math.random=oldRandom;}
    const boss=a.possession.boss;boss.body.updateFromGameObject();check(boss.body.kinetic.mass===9&&boss.body.kinetic.heavy,'controlled frame owns heavy kinetic body');
    const bx=boss.x,by=boss.y;boss.body.externalVelocity(500,0);boss.body.steer(0,100,1/60);
    check(boss.body.velocity.x>400&&boss.body.velocity.y>0,'controlled frame accepts steering without dropping momentum');
    check(Math.abs(boss.body.halfWidth-34)<1,'controlled collision footprint preserved');
    boss.body.reset(gx,gy);a.updateDynamicFloor(20);check(a.floorFalling(p),'controlled frame can fall into lava');
    for(let i=0;i<70;i++)a.updateDynamicFloor(20);check(!a.floorFalling(p)&&boss.body.kinetic.remaining===0,'controlled frame recovery clears momentum');
    a.endPossession(false);check(b.enable&&p.visible&&b.kinetic.mass===1,'return restores operative mass and body');
    // Pause freezes physics state; collection/round shutdown discard every hook.
    reset(bx,by);b.externalVelocity(700,0);const pause={x:p.x,remaining:b.kinetic.remaining};await wait(150);
    check(p.x===pause.x&&b.kinetic.remaining===pause.remaining,'paused scene freezes momentum clock');
    const kinetic=a.kinetics,vfx=a.kineticVfx,textureCount=game.textures.getTextureKeys().length;
    vfx.reset();for(let i=0;i<200;i++)vfx.emit(p,{x:p.x,y:p.y,nx:1,ny:0,speed:2000,surface:'outer'},a.time.now);
    check(vfx.pulses.length===12&&game.textures.getTextureKeys().length===textureCount,'200 impacts remain in fixed VFX slots without texture allocation');
    check(b.halfWidth===12&&p.texture.key===vfx.pulses[0].ghost.texture.key,'cosmetic squash preserves real circle and equipped artwork');
    context.S.setSettings({particles:false});a.onResumeFromOptions();
    check(vfx.pulses.every(p=>!p.ghost.visible),'Options reduced-effects change hides existing impact afterimages');
    vfx.emit(p,{x:p.x,y:p.y,nx:1,ny:0,speed:2000,surface:'outer'},a.time.now);
    check(vfx.pulses.every(p=>!p.ghost.visible),'new impacts respect reduced effects immediately');
    vfx.update(a.time.now+500);check(vfx.pulses.every(p=>!p.active&&!p.ghost.visible),'impact visuals fully retire');
    a.playerInput.pressed=pressed;a.playerInput.held=held;a.getAimWorldPoint=aim;
    report.cases.push({name:'walls, steering, Dash, mass contacts, damage, lava, Ascension, pause and pooled presentation',passed:true});
    if(!globalThis.__n3onLayoutAuditOptions?.capture){game.scene.stop('arena');await wait(100);
      check(kinetic.bodies.size===0&&vfx.pulses.length===0,'scene shutdown releases kinetic bodies and effects');}
  }catch(error){report.errors.push(error.stack??String(error));}finally{context?.restoreInput();report.running=false;}})();return 'Kinetic integration started';
})()
