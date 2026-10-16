(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],errors:[]};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  report.promise=(async()=>{
    let restore;
    try {
      const {kineticAuditArena}=await import('/scripts/kinetic-audit-setup.js');
      const {a,game,restoreInput}=await kineticAuditArena({round:26});restore=restoreInput;
      const {FLUX_CORE_BALANCE:B}=await import('/src/game/config/fluxCores.ts');
      const {LASER_HAZARD_BALANCE:L}=await import('/src/game/config/laserHazards.ts');
      // Loading may already have advanced the first stagger. Recreate this owner
      // through its real constructor so all four selected-count probes start fresh.
      const old=a.fluxCores;old.destroy();
      const f=a.fluxCores=new old.constructor(a,old.round,550055,old.theme,old.bounds,old.isBlocked,old.isReserved,
        old.particlesEnabled,old.onDestroyed,old.onProximityChanged,old.onRecoveryAlarm,old.onLasersShutdown);
      const laser=a.laserSecurity;let now=a.time.now;const randomInt=f.random.int.bind(f.random);
      const tick=t=>{now=t;a.time.now=t;f.update(t,a.player,false);laser.update(t,.016,a.player,[],true,f.isLaserSuppressed(t));};
      check(f.isLaserSuppressed(now),'startup stays off until first complete group');
      // Arena gas may have vetoed initial scheduling before this paused probe.
      if(!Number.isFinite(f.nextSpawnAt))tick(now+1);
      check(Number.isFinite(f.nextSpawnAt),'gas recovery schedules a finite next deployment');
      for(const count of [1,3,6,3]) {
        f.random.int=(min,max)=>min===1&&max===f.capacity?count:randomInt(min,max);
        tick(f.nextSpawnAt);
        while(f.spawnedCoreCount<count) { check(f.isLaserSuppressed(now),'selected group incomplete stays off');tick(f.nextSpawnAt); }
        const last=Math.max(...f.cores.map(c=>c.spawnedAt));tick(last+B.floorRiseMs+B.windowOpenMs-1);
        check(f.isLaserSuppressed(now)&&laser.liveSegmentCount===0,'last partially open window cannot activate beams');
        check(f.cores.at(-1).upperWindowShutter.visible,'actual final core window still visibly deploying');
        tick(now+1);check(!f.isLaserSuppressed(now)&&f.cores.every(c=>!c.upperWindowShutter.visible&&!c.lowerWindowShutter.visible&&c.root.scaleY===1),'gate releases only after every actual visual completes');
        laser.createdAt=now-L.initialDelayMs-L.telegraphMs-L.activeMs/2;laser.update(now,.016,a.player,[],true,false);
        check(laser.liveSegmentCount>0,'normal laser pattern operates after gate release');
        while(f.cores.length>1){f.damageCombatTarget(f.cores[0],1e9,'weapon');check(!f.isLaserSuppressed(now)&&laser.liveSegmentCount>0,'partial clear keeps lasers active');}
        f.damageCombatTarget(f.cores[0],1e9,'weapon');check(f.isLaserSuppressed(now)&&laser.liveSegmentCount===0,'final death immediately clears beam render and damage segments');
        const until=f.laserSuppressedUntil;check(Math.abs(until-now-9000)<.000001,'shutdown remains exactly nine seconds');
        tick(until-1);check(f.activeCount===0,'shutdown interval does not spawn cores');tick(until);
        check(f.isLaserSuppressed(now),'timer expiry leaves lasers off through existing next-cycle wait');
        report.cases.push({selected:count,passed:true});
      }
      // Stop/recreate the actual Arena owner with a pending core deployment.
      tick(f.nextSpawnAt);check(f.activeCount>0,'cleanup probe has rising cores');
      f.destroy();check(f.activeCount===0&&f.isLaserSuppressed(now),'destroy retires deployment state');
      f.update(now+1e6,a.player,false);check(f.activeCount===0,'retired core system cannot respawn or release gate');
      game.scene.stop('arena');
    } catch(e){report.errors.push(String(e.stack??e));}finally{restore?.();report.running=false;}
  })();return{started:true};
})();
