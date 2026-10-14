// Measure the UNMODIFIED bomb detonation/Arcade clock path at deterministic 60 Hz.
// Re-run unchanged after rebound integration; no substituted explosion impulses.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,checks:[],cases:[],errors:[],samples:[]};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  report.promise=(async()=>{let context;try{
    const {kineticAuditArena}=await import('/scripts/kinetic-audit-setup.js');context=await kineticAuditArena();
    const {a,renderer}=context;report.renderer=renderer;const p=a.player,b=p.body,w=a.physics.world;
    a.destroyDynamicFloor();for(const e of [...a.enemies])a.removeArcadeEnemy(e);
    const sites=a.bombSites.sites,site=sites[0];check(sites.length>1,'multiple real bombsites available');
    let origin;
    // Choose a deterministic open point with a clear 600px horizontal runway.
    for(let y=240;y<1300&&!origin;y+=40)for(let x=200;x<1600&&!origin;x+=40)
      if(!a.wallRects.some(r=>x+600>r.x&&x<r.x+r.w&&y+35>r.y&&y-35<r.y+r.h))origin={x,y};
    check(!!origin,'open diagnostic runway');report.origin=origin;site.x=origin.x-80;site.y=origin.y;
    const sceneUpdate=a.sys.sceneUpdate,pressed=a.playerInput.pressed,held=a.playerInput.held,aim=a.getAimWorldPoint;
    a.playerInput.pressed=()=>false;a.playerInput.held=()=>false;a.getAimWorldPoint=()=>({x:origin.x+1000,y:origin.y});
    // Run actual scene event order, clock timers, Arcade World and body postUpdate.
    // Isolate input movement from unrelated enemy spawns/hazards during measurement.
    a.sys.sceneUpdate=()=>{if(a.state.state!=='Victory')a.updatePlayerMovement(a.time.now);};
    const cases=[['standing',0,0,false,false],['walking',.35,0,false,false],['full-speed',1,0,false,false],
      ['speed-boost',1,0,true,false],['dash',1,0,false,true],['diagonal',Math.SQRT1_2,Math.SQRT1_2,false,false],
      ['upgraded-boost',1,0,true,false]];
    let clock=a.time.now;
    for(const multi of [false,true])for(const [name,mx,my,boost,dash] of cases){
      for(const s of sites)s.state='Available';site.state='Armed';if(multi)sites[1].state='Armed';
      a.detonatingSiteIds.clear();a.state.set('Defense');w.timeScale=1;w._elapsed=0;
      b.reset(origin.x,origin.y);p.setScale(1);p.stats.moveSpeed=name==='upgraded-boost'?900:240;
      p.buffs.speedBoostUntil=boost?clock+10000:0;p.buffs.speedBoostStacks=boost?1:0;p.dashUntil=0;
      a.playerInput.move.x=mx;a.playerInput.move.y=my;
      a.updatePlayerMovement(clock);if(dash)p.dashTowardPoint(origin.x+1000,origin.y,clock);
      const before={vx:b.velocity.x,vy:b.velocity.y,speed:b.velocity.length()},positions=[],velocities=[],steps=[];
      a.detonateSite(site);const after={vx:b.velocity.x,vy:b.velocity.y,speed:b.velocity.length()};
      let distance=0,lastX=p.x,lastY=p.y,maximumEffectiveSpeed=0,maximumBodySpeed=before.speed;
      for(let i=0;i<90;i++){
        clock+=1000/60;a.sys.step(clock,1000/60);
        const d=Math.hypot(p.x-lastX,p.y-lastY);distance+=d;lastX=p.x;lastY=p.y;
        maximumEffectiveSpeed=Math.max(maximumEffectiveSpeed,d*60);maximumBodySpeed=Math.max(maximumBodySpeed,b.velocity.length());
        if(i<54){positions.push([p.x,p.y]);velocities.push([b.velocity.x,b.velocity.y]);steps.push(w.stepsLastFrame);}
      }
      report.samples.push({name,multipleArmed:multi,before,after,maximumBodySpeed,maximumEffectiveSpeed,pathDistance1500ms:distance,
        displacement850ms:Math.hypot(positions[50][0]-origin.x,positions[50][1]-origin.y),positions,velocities,steps});
      check(before.speed===after.speed,name+' detonation does not directly change velocity ('+multi+')');
      check(p.x>=w.bounds.x+12&&p.x<=w.bounds.right-12&&p.y>=w.bounds.y+12&&p.y<=w.bounds.bottom-12,name+' remains contained ('+multi+')');
      report.cases.push({name:name+(multi?' / continuing defense':' / victory hold'),passed:true});
    }
    a.sys.sceneUpdate=sceneUpdate;a.playerInput.pressed=pressed;a.playerInput.held=held;a.getAimWorldPoint=aim;
    report.explanation='detonateSite sets Arcade timeScale=.35 for 850ms. Phaser divides step cadence by this value: ~2.86 fixed steps per real frame; no blast impulse. Victory hold skips movement overwrites; ongoing Defense continues input each render frame. Existing .0005 damping remains active every physics substep.';
  }catch(error){report.errors.push(error.stack??String(error));}finally{context?.restoreInput();report.running=false;}})();return 'Slingshot measurement started';
})()
