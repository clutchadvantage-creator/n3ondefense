// Actual input translation, Arcade bodies and rendering in an isolated profile.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,current:'bootstrap',checks:[],cases:[],samples:[],errors:[]};
  const check=(ok,label,detail)=>{report.checks.push({ok:!!ok,label,detail});if(!ok)throw Error(label+': '+JSON.stringify(detail));};
  const near=(a,b)=>Math.abs(a-b)<1e-6;
  report.promise=(async()=>{let context;try{
    const {kineticAuditArena}=await import('/scripts/kinetic-audit-setup.js');context=await kineticAuditArena();
    const {a,game,wait}=context,p=a.player,b=p.body,w=a.physics.world;report.renderer=context.renderer;
    a.destroyDynamicFloor();for(const e of [...a.enemies])a.removeArcadeEnemy(e);
    let spot;const bounds=a.layout.generation.bounds;
    // The furthest staged obstacle ends at x+200. Reserve its actual footprint
    // plus clearance so this fixture also fits the fortress's side corridors.
    for(let y=bounds.y+145;y<bounds.y+bounds.h-145&&!spot;y+=20)for(let x=bounds.x+120;x<bounds.x+bounds.w-260&&!spot;x+=20)
      if(!a.wallRects.some(r=>x+260>r.x&&x-80<r.x+r.w&&y+145>r.y&&y-100<r.y+r.h))spot={x,y};
    check(!!spot,'clear real Arena runway');const {x,y}=spot;report.spot=spot;
    const aim=a.getAimWorldPoint;a.getAimWorldPoint=()=>({x:x+1200,y});
    a.state.set('Defense');p.invulnUntil=Infinity;p.stats.moveSpeed=265;p.permanentModSpeedMultiplier=1;
    p.buffs.speedBoostUntil=0;p.modSpeedBoostUntil=0;p.dashUntil=0;w.timeScale=1;
    const reset=(px=x,py=y)=>{b.reset(px,py);b.enable=true;p.setActive(true).setVisible(true).setScale(1);p.dashUntil=0;w._elapsed=0;};
    const keys=(mx,my)=>{
      const k=a.playerInput.fixedKeys;k.left.isDown=mx<0;k.right.isDown=mx>0;k.up.isDown=my<0;k.down.isDown=my>0;
      a.playerInput.adoptDevice('keyboardMouse');a.playerInput.update('gameplay');a.updatePlayerMovement(a.time.now);
    };
    const tick=(ms=1000/60)=>{a.time.now+=ms;a.kinetics.beginFrame();a.enemySeparationGrid.rebuild(a.enemies);w.update(a.time.now,ms);w.postUpdate();a.kineticVfx.update(a.time.now);};
    report.current='direct movement';reset();
    for(const [mx,my] of [[1,0],[0,0],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[0,0]]){
      keys(mx,my);const length=Math.hypot(mx,my)||1;
      check(near(b.velocity.x,mx/length*p.speed)&&near(b.velocity.y,my/length*p.speed),'instant keyboard command '+mx+','+my,{x:b.velocity.x,y:b.velocity.y});
      const px=p.x,py=p.y;tick();if(!mx&&!my)check(near(p.x,px)&&near(p.y,py),'release produces zero displacement');
      check(b.kinetic.remaining===0,'input never starts momentum window');
    }
    p.buffs.speedBoostUntil=a.time.now+10000;p.buffs.speedBoostStacks=1;p.permanentModSpeedMultiplier=1.3;p.modSpeedBoostUntil=a.time.now+10000;p.modSpeedMultiplier=1.2;
    keys(1,0);check(near(b.velocity.x,p.speed)&&p.speed>265,'pickup and Mod speed multipliers apply instantly');
    keys(-1,0);check(near(b.velocity.x,-p.speed),'boosted instant reversal');keys(0,0);check(b.velocity.length()===0,'boosted instant stop');
    p.buffs.speedBoostUntil=0;p.modSpeedBoostUntil=0;p.permanentModSpeedMultiplier=1;
    const pad=navigator.getGamepads()[0],pads=navigator.getGamepads;navigator.getGamepads=()=>[pad];pad.axes=[.5,0,0,0];
    a.playerInput.adoptDevice('gamepad');a.playerInput.update('gameplay');a.updatePlayerMovement(a.time.now);
    check(near(b.velocity.x,a.playerInput.move.x*p.speed)&&b.velocity.x>0&&b.velocity.x<p.speed,'analog magnitude stays authoritative');pad.axes=[0,0,0,0];navigator.getGamepads=pads;
    report.cases.push({name:'keyboard directions, release, diagonal, boosts, Mods and analog input',passed:true});

    report.current='solid contacts';
    const wall=a.walls.create(x+190,y+30,'pixel').setDisplaySize(20,200).setVisible(false).setData('kineticSurface','obstacle');wall.refreshBody();
    reset(x+155);keys(1,0);const heldStart=b.kinetic.impacts,positions=[];
    for(let i=0;i<240;i++){keys(1,0);tick();positions.push(p.x);}
    check(b.kinetic.impacts===heldStart+1,'held full-speed contact rebounds exactly once',b.kinetic.impacts-heldStart);
    check(Math.min(...positions)<x+155,'visible outward wall displacement');
    check(Math.max(...positions)<=x+168.001&&Math.max(...positions.slice(-60))-Math.min(...positions.slice(-60))<.001,'wall hold settles without jitter or penetration');
    check(b.kinetic.remaining===0&&b.kinetic.operative.remaining===0,'no operative momentum after rebound');
    reset(x+160);keys(1,0);const hit=b.kinetic.impacts;for(let i=0;i<6&&b.kinetic.impacts===hit;i++){keys(1,0);tick();}
    check(b.velocity.x<0&&b.kinetic.operative.remaining>0,'obstacle creates short outward bounce');
    keys(-1,0);check(near(b.velocity.x,-p.speed)&&b.kinetic.operative.remaining===0,'collision followed by reversal restores full command immediately');
    keys(0,0);const stopped=p.x;for(let i=0;i<20;i++){keys(0,0);tick();}check(near(p.x,stopped),'no release drift after a collision');
    for(const speed of [900,2400,8000]){
      reset(x+160);keys(0,0);b.setVelocity(speed,0);tick();
      check(p.x<=x+168&&b.velocity.x<0,'high-speed wall containment '+speed);
      for(let i=0;i<20;i++)tick();const px=p.x;tick();check(b.velocity.length()===0&&near(p.x,px),'uncommanded rebound expires without drift '+speed);
    }
    reset(x+140);keys(1,0);p.lastDashMs=-999999;p.energy=p.energyStats.max;a.playerInput.pendingPulses.add('dash');keys(1,0);
    const dashUntil=p.dashUntil;check(dashUntil>a.time.now&&b.velocity.x>p.speed,'existing Dash ability starts at authored speed');
    const dashHit=b.kinetic.impacts;for(let i=0;i<4&&b.kinetic.impacts===dashHit;i++){keys(1,0);tick();}
    check(b.kinetic.impacts>dashHit&&b.velocity.x<0&&p.x<=x+168,'Dash collision rebounds safely');check(p.dashUntil===dashUntil,'Dash duration is unchanged');
    keys(-1,0);check(near(b.velocity.x,-p.speed),'reverse input cancels Dash collision response');
    keys(0,0);check(b.velocity.length()===0&&p.dashUntil>a.time.now,'release remains immediate after cancelling Dash rebound');
    reset(x+160);keys(0,0);tick();b.position.x+=80;b.updateCenter();b.setVelocity(8000,0);tick();
    check(p.x<x+168&&b.velocity.x<0,'Arcade separation correction still cannot tunnel through walls');
    wall.destroy();report.cases.push({name:'obstacles, held walls, reversals, stop, Dash and high-speed sweeps',passed:true});

    report.current='ground and flying contacts';
    for(const type of ['grunt','tank','drone']){
      reset();keys(1,0);const enemy=a.spawnEnemy(type,false,{x:x+60,y});enemy.body.reset(x+60,y);enemy.body.setVelocity(0,0);enemy.hp=100000;
      p.invulnUntil=0;p.shieldUntil=a.time.now+10000;const hp=p.hp,before=b.kinetic.impacts;b.setVelocity(1200,0);
      for(let i=0;i<8;i++)tick();
      check(type==='drone'?b.kinetic.impacts===before:b.kinetic.impacts>before,type==='drone'?'flying enemy adds no physical rebound':type+' produces physical rebound');
      check(p.hp===hp,type+' existing shield handling preserved');a.removeArcadeEnemy(enemy);
    }
    reset();keys(1,0);const contact=a.spawnEnemy('grunt',false,{x:x+55,y});contact.body.reset(x+55,y);contact.body.setVelocity(0,0);
    p.invulnUntil=0;p.shieldUntil=0;const hp=p.hp;b.setVelocity(900,0);for(let i=0;i<5;i++)tick();
    check(p.hp===hp-contact.stats.damage,'ground collision deals existing contact damage once');a.applyEnemyContactDamage(contact);
    check(p.hp===hp-contact.stats.damage,'later overlap cannot duplicate contact damage');a.removeArcadeEnemy(contact);p.invulnUntil=Infinity;
    reset();keys(0,0);const incoming=a.spawnEnemy('grunt',false,{x:x+65,y});incoming.body.reset(x+65,y);incoming.setExternalVelocity(-900,0);
    const beforeIncoming=b.kinetic.impacts;for(let i=0;i<8;i++)tick();check(b.kinetic.impacts>beforeIncoming,'incoming ground-body collision uses separate operative response');
    a.removeArcadeEnemy(incoming);for(let i=0;i<20;i++)tick();check(b.velocity.length()===0&&b.kinetic.remaining===0,'incoming enemy cannot leave persistent operative momentum');
    report.cases.push({name:'ground enemies, incoming bodies, drones and contact damage',passed:true});

    report.current='rendered gamepad movement';reset();keys(0,0);p.dashUntil=0;
    const livePads=navigator.getGamepads,livePad=livePads()[0];livePad.axes=[1,0,0,0];navigator.getGamepads=()=>[livePad];
    a.playerInput.adoptDevice('gamepad');const observed=[];const observe=()=>observed.push({x:p.x,y:p.y,vx:b.velocity.x,vy:b.velocity.y});game.events.on('step',observe);
    game.scene.resume('arena');await wait(220);livePad.axes=[-1,0,0,0];await wait(140);livePad.axes=[0,0,0,0];await wait(180);game.scene.pause('arena');
    game.events.off('step',observe);navigator.getGamepads=livePads;
    check(observed.some(v=>v.vx>200)&&observed.some(v=>v.vx< -200),'rendered loop responds at full speed in both directions');
    check(observed.slice(-5).every(v=>v.vx===0&&v.vy===0),'rendered loop stops on input release');
    check(observed.slice(-5).every(v=>near(v.x,observed.at(-1).x)&&near(v.y,observed.at(-1).y)),'rendered release has zero residual travel');
    report.samples.push({renderedMovement:observed,heldWallImpacts:1});
    report.cases.push({name:'actual rendered input to physics to position flow',passed:true});
    a.getAimWorldPoint=aim;globalThis.__arcadeMovement=context;
  }catch(error){report.errors.push(error.stack??String(error));}finally{context?.restoreInput();report.running=false;}})();
  return 'Arcade movement regression audit started';
})();
