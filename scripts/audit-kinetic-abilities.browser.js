// Real deployables, Relay/Echo, rendered movement, and round owner recreation.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,checks:[],cases:[],errors:[],samples:[]};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  report.promise=(async()=>{let context;try{
    const {kineticAuditArena}=await import('/scripts/kinetic-audit-setup.js');context=await kineticAuditArena(globalThis.__n3onLayoutAuditOptions);
    const {a,game,wait}=context;report.renderer=context.renderer;
    const p=a.player,b=p.body,w=a.physics.world;a.destroyDynamicFloor();for(const e of [...a.enemies])a.removeArcadeEnemy(e);
    const origin={x:p.x,y:p.y},aim=a.getAimWorldPoint;
    const tick=()=>{a.time.now+=1000/60;a.kinetics.beginFrame();a.enemySeparationGrid.rebuild(a.enemies);w.update(a.time.now,1000/60);w.postUpdate();a.kineticVfx.update(a.time.now);};
    let point;
    for(let y=origin.y-50;y<=origin.y+50&&!point;y+=25)for(let x=origin.x-150;x<=origin.x+150&&!point;x+=25)
      if(a.isValidPlacement(x,y)&&!a.wallRects.some(r=>x+125>r.x&&x-125<r.x+r.w&&y+100>r.y&&y-100<r.y+r.h))point={x,y};
    check(point,'clear actual deployable placement');p.rotation=0;
    a.getAimWorldPoint=()=>point;p.energy=p.energyStats.max;a.placeAbility('fence',a.time.now);check(a.fences.length===1,'real friendly fence placed');
    const fence=a.fences[0],cx=(fence.x1+fence.x2)/2,cy=(fence.y1+fence.y2)/2;
    const d=Math.hypot(fence.x2-fence.x1,fence.y2-fence.y1),nx=-(fence.y2-fence.y1)/d,ny=(fence.x2-fence.x1)/d;
    b.reset(cx-nx*55,cy-ny*55);b.externalVelocity(nx*700,ny*700);const impacts=b.kinetic.impacts;
    for(let i=0;i<12;i++){tick();a.updateFenceObstruction(a.time.now);}
    check((p.x-cx)*nx+(p.y-cy)*ny>20&&b.kinetic.impacts===impacts,'friendly fence remains passable during fast movement');
    b.reset(origin.x+230,origin.y);const enemy=a.spawnEnemy('grunt',false,{x:cx-nx*55,y:cy-ny*55});
    enemy.body.reset(cx-nx*55,cy-ny*55);a.updateFenceObstruction(a.time.now);enemy.setExternalVelocity(nx*700,ny*700);
    for(let i=0;i<12;i++){tick();a.updateFenceObstruction(a.time.now);}
    check((enemy.x-cx)*nx+(enemy.y-cy)*ny<0,'launched enemy remains blocked by fence');
    const fenceHp=fence.hp;a.time.now+=3000;a.updateFenceObstruction(a.time.now);check(fence.hp<fenceHp,'blocked enemy still attacks fence');
    a.removeArcadeEnemy(enemy);fence.destroy();a.fences.length=0;
    for(const type of ['turret','mine']){
      b.reset(origin.x,origin.y);a.getAimWorldPoint=()=>point;p.energy=p.energyStats.max;a.abilityCooldownUntil[type]=0;
      a.placeAbility(type,a.time.now);check((type==='turret'?a.turrets:a.mines).length>0,'real '+type+' placed');
      b.reset(point.x-55,point.y);b.externalVelocity(700,0);const before=b.kinetic.impacts;
      for(let i=0;i<12;i++)tick();check(p.x>point.x+20&&b.kinetic.impacts===before,'friendly '+type+' remains passable');
    }
    const has=a.modRuntime.hasActiveInfusion,active=a.modRuntime.getActiveInfusions;
    a.modRuntime.hasActiveInfusion=id=>id==='relay-jump';a.modRuntime.getActiveInfusions=()=>['relay-jump'];
    a.updateSystemInfusions(a.time.now,16);check(!!a.systemInfusions,'actual infusion runtime');
    b.externalVelocity(1400,0);check(a.systemInfusions.relay(a.turrets[0],a.time.now),'Relay Jump executes through valid destination selection');
    check(b.kinetic.remaining===0&&b.velocity.length()===0&&a.infusionLandingValid(p),'Relay clears rebound energy at a legal landing');
    a.modRuntime.hasActiveInfusion=has;a.modRuntime.getActiveInfusions=active;
    // Echo records the actual banked positions and replays them independently.
    b.reset(origin.x,origin.y);const echo=a.echo.timeline;echo.reset();
    const wall=a.walls.create(p.x+75,p.y,'pixel').setDisplaySize(16,100).setData('kineticSurface','inner').setVisible(false);wall.refreshBody();
    echo.advance(0,false,false,p.x,p.y,p.rotation,false);echo.advance(0,true,true,p.x,p.y,p.rotation,false);b.setVelocity(1600,0);
    for(let i=0;i<45;i++){tick();echo.advance(1000/60,false,false,p.x,p.y,p.rotation,false);}
    const xs=Array.from({length:echo.sampleCount},(_,i)=>echo.samples[i*5+1]);
    check(xs.some((x,i)=>i>0&&x<xs[i-1])&&Math.max(...xs)>origin.x+10,'Echo records outbound and reflected movement');
    b.externalVelocity(-900,0);echo.advance(0,true,true,p.x,p.y,p.rotation,false);
    check(echo.replaying&&Math.hypot(p.x-origin.x,p.y-origin.y)<1&&b.kinetic.remaining===0&&b.velocity.length()===0,'Echo return resets physics momentum');
    const sampleX=echo.samples[6],sampleY=echo.samples[7];echo.advance(echo.samples[5]/echo.config.replaySpeed,false,false,p.x,p.y,0,false);
    check(Math.hypot(a.echo.root.x-sampleX,a.echo.root.y-sampleY)<1,'Echo hologram follows the recorded bank');
    echo.reset();wall.destroy();a.getAimWorldPoint=aim;
    // Full scene updates and hardware rendering, normal input remains live.
    b.reset(origin.x,origin.y);p.dashUntil=0;p.invulnUntil=Infinity;p.stats.moveSpeed=900;p.buffs.speedBoostUntil=a.time.now+10000;p.buffs.speedBoostStacks=1;
    const oldPads=navigator.getGamepads;const pad=oldPads()[0];pad.axes=[1,0,1,0];navigator.getGamepads=()=>[pad];
    const before=b.kinetic.impacts,positions=[];const observe=()=>{positions.push([p.x,p.y,b.velocity.x,b.velocity.y]);p.invulnUntil=Infinity;};game.events.on('step',observe);
    a.state.set('Defense');game.scene.resume('arena');await wait(3500);game.scene.pause('arena');game.events.off('step',observe);navigator.getGamepads=oldPads;
    check(b.kinetic.impacts>before,'rendered high-speed gameplay produces rebounds with real input');
    check(positions.some(pos=>pos[2]<-100),'rendered gameplay retains an outward wall rebound');
    check(positions.every(pos=>pos[0]>a.layout.generation.bounds.x&&pos[0]<a.layout.generation.bounds.x+a.layout.generation.bounds.w),'rendered gameplay stays inside generated arena');
    report.samples.push({renderedFrames:positions.length,impacts:b.kinetic.impacts-before,positions});
    // Capture a real contact with the cosmetic surface and native actor artwork.
    const edge=a.layout.generation.bounds.x+a.layout.generation.bounds.w-30;
    b.reset(edge-30,origin.y);b.setVelocity(1800,0);tick();tick();a.kineticVfx.update(a.time.now+65);
    if(globalThis.__n3onLayoutAuditOptions?.capture)a.cameras.main.stopFollow().setZoom(1.5).centerOn(edge-170,origin.y+150);
    report.cases.push({name:'fences, deployables, Relay, Echo and rendered boosted wall banks',passed:true});
    if(!globalThis.__n3onLayoutAuditOptions?.capture){
      const old=a.kinetics;a.createOrMovePlayer();check(old.bodies.size===0&&a.kinetics!==old&&p.body.kinetic.remaining===0,'new round movement owner releases old hooks and resets energy');
      game.scene.stop('arena');await wait(100);check(!a.kinetics&&!a.kineticVfx,'shutdown removes recreated owners');
    }
  }catch(error){report.errors.push(error.stack??String(error));}finally{context?.restoreInput();report.running=false;}})();return 'Kinetic abilities and live movement started';
})()
