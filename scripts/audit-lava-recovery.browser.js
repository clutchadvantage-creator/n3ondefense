// Extends the actual deployment/floor lifecycle fixture with Flux support and recovery presentation.
(() => {
  (async()=>{
    // Vite's ?raw endpoint is a JS module, so use its default source export.
    const {default:fixture}=await import('/scripts/audit-dynamic-floor.browser.js?raw');
    (0,eval)(fixture);
    const report=globalThis.__n3onLayoutAudit;await report.promise;if(report.errors.length)return;
    report.running=true;
    const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
    try{
      const a=globalThis.__floorArena,flux=a.fluxCores;
      for(const core of flux.cores)flux.destroyCoreVisual(core);flux.cores.length=0;
      a.destroyDynamicFloor();a.createDynamicFloor(9);let f=a.dynamicFloor,p=f.panels[0];
      const x=p.x+p.w/2,y=p.y+p.h/2;
      const point=()=>{const original=flux.random.float;let axis=0;flux.random.float=()=>axis++%2?y:x;
        try{return flux.findSpawnPoint(-1000,-1000);}finally{flux.random.float=original;}};
      flux.recentSpawnLocations.length=0;
      check(point()?.x===x,'Flux deployment accepts supported cassette');
      const core=flux.createCore(x,y,9000,a.time.now);flux.cores.push(core);
      check(!f.startEvent([p.id]),'new opening does not remove support beneath a live core');
      flux.cores.length=0;flux.destroyCoreVisual(core);
      check(f.startEvent([p.id]),'empty hatch can open');
      for(let i=0;i<189;i++)a.updateDynamicFloor(20);
      check(p.phase==='retracting'&&p.gap.w>0&&p.gap.w<18,'partially open supported moving deck');
      check(point()?.x===x,'Flux deployment accepts full supported footprint on moving panel');
      const rider=flux.createCore(x,y,9001,a.time.now);flux.cores.push(rider);
      const start=rider.x;
      for(let i=0;i<100;i++)a.updateDynamicFloor(20);
      check(p.phase==='open','lava exposed beneath hatch');
      check(flux.cores.includes(rider)&&Math.abs(rider.x-start)>50,'live Flux container rides deck onto receiver');
      check(f.isRectSupported(rider.x,rider.y,38,46),'entire Flux footprint remains supported');
      check(Math.abs(rider.root.x-rider.x)<.01&&Math.abs(rider.floorHatch.x-rider.x)<.01,'container and hatch visuals travel together');
      check(point()===null,'spawn search rejects all candidates inside exposed lava');
      check(flux.isBlocked(p.x-37,y,38,46)||flux.isBlocked(p.x+p.w+37,y,38,46),'edge overlap checks full container footprint');
      const invalid=flux.createCore(x,y,9002,a.time.now);flux.cores.push(invalid);
      flux.spawnedCoreCount=2;flux.plannedCoreCount=2;flux.cyclePhase='engaged';const until=flux.laserSuppressedUntil;
      flux.updateFloorSupport(f,a.time.now);
      check(!flux.cores.includes(invalid)&&!invalid.root.active,'unexpected lost support retires an unsupported core');
      check(flux.cyclePhase==='spawning'&&flux.spawnedCoreCount===1&&flux.laserSuppressedUntil===until,'lost core retries deployment without loot or laser-shutdown credit');
      flux.destroyCoreVisual(rider);flux.cores.length=0;
      a.player.hp=a.player.stats.maxHealth;a.player.body.reset(x,y);a.floorPlayerRelocated();
      let peak=0,spin=0,flame=false;
      for(let i=0;i<75;i++){
        a.updateDynamicFloor(20);
        const active=a.lavaRecoveryVfx.flares.find(s=>s.actor?.kind==='player');
        if(active){peak=Math.max(peak,-active.descent);flame||=active.flame.visible;spin=Math.max(spin,Math.abs(a.player.rotation));}
      }
      check(peak>100&&flame,'actual player takes a high fiery arc');
      check(!a.floorFalling(a.player)&&a.player.body.enable,'player lands with controls restored');
      check(a.player.originX===.5&&a.player.originY===.5,'landing restores sprite origin');
      check(a.lavaRecoveryVfx.cinders.some(c=>c.smoke&&c.image.visible),'smoke persists briefly after landing');
      const v=a.lavaRecoveryVfx,count=a.children.length,driver=a.floorDrivers.get(a.player);
      const timers=a.captureRoundRuntimeDiagnostics().timers,tweens=a.tweens.getTweens().length;
      for(let i=0;i<100;i++)v.launch(driver,f.elapsed);
      v.update(f.elapsed);
      check(a.children.length===count&&v.displayObjectCount===88,'overlapping recovery reuses fixed 88-object pool');
      check(a.captureRoundRuntimeDiagnostics().timers===timers&&a.tweens.getTweens().length===tweens,'no recovery timers or tweens');
      const before=f.elapsed;await new Promise(r=>setTimeout(r,120));check(f.elapsed===before,'paused scene freezes recovery clock');
      const old=v;a.destroyDynamicFloor();check(old.flares.every(s=>!s.flame.active&&!s.halo.active)&&old.cinders.every(s=>!s.image.active),'round teardown releases every pooled recovery object');
      const moduleSource=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
      const path=moduleSource.match(/import\s*\{\s*LavaRecoveryVfx\s*\}\s*from\s*["']([^"']+)/)[1];
      const {LavaRecoveryVfx}=await import(path),reduced=new LavaRecoveryVfx(a,false);
      reduced.launch(driver,0);reduced.update(100);check(reduced.displayObjectCount===34,'particles-disabled recovery uses reduced pool');reduced.destroy();
      for(const [index,archetype] of ['artillery','storm-mage','void-brawler'].entries()){
        a.player.body.reset(a.layout.playerSpawn.x,a.layout.playerSpawn.y);a.player.hp=a.player.stats.maxHealth;
        a.createDynamicFloor(9);f=a.dynamicFloor;check(f.startEvent(),'boss recovery floor event '+archetype);p=f.panels.find(p=>p.phase==='warning');
        for(let i=0;i<275;i++)a.updateDynamicFloor(20);
        const random=Math.random;let choose=true;Math.random=()=>{if(choose){choose=false;return (index+.1)/3;}return random();};
        try{check(a.beginPossession(a.player,a.time.now+60000),'controlled body '+archetype);}finally{Math.random=random;}
        const boss=a.possession.boss;check(boss.archetype===archetype,'selected archetype '+archetype);
        boss.body.reset(p.x+p.w/2,p.y+p.h/2);
        for(let i=0;i<75;i++)a.updateDynamicFloor(20);
        check(!a.floorFalling(a.player)&&boss.body.enable&&boss.visualRoot.scaleX===1&&boss.legRig.root.scaleX===1&&boss.legRig.root.rotation===0,'full layered recovery '+archetype);
        check(f.isSupported(boss.x,boss.y,boss.hazardRadius,true),'safe large-body landing '+archetype);
        for(let i=0;i<10;i++)a.updateDynamicFloor(20);
        check(!a.floorFalling(a.player),'no repeated fall at a supported corner '+archetype);a.endPossession(false);
      }
      // Final paused apex for visual inspection.
      a.player.body.reset(a.layout.playerSpawn.x,a.layout.playerSpawn.y);
      a.createDynamicFloor(9);f=a.dynamicFloor;check(f.startEvent(),'final visual event validates');p=f.panels.find(p=>p.phase==='warning');for(let i=0;i<275;i++)a.updateDynamicFloor(20);
      a.player.hp=a.player.stats.maxHealth;a.player.body.reset(p.x+p.w/2,p.y+p.h/2);a.floorPlayerRelocated();
      for(let i=0;i<40;i++)a.updateDynamicFloor(20);
      // Manual floor stepping freezes scene time; expire the normal 90ms hit flash for this apex still.
      a.player.updatePresentation(a.time.now+200);
      check(a.floorFalling(a.player)&&a.lavaRecoveryVfx.flares.some(s=>s.actor?.kind==='player'),'visual inspection is airborne recovery');
      a.cameras.main.stopFollow().centerOn(p.x+75,p.y-10).setZoom(2.4);
      globalThis.__lavaFixture={a,f,p};
      report.cases.push({name:'Flux support and premium recovery',peakHeight:peak,maximumDisplayObjects:88,reducedDisplayObjects:34});
    }catch(e){report.errors.push(e.stack??String(e));}finally{report.running=false;}
  })();return 'Flux/lava recovery integration started';
})()
