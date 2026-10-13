// Actual Arena handoff, shared pickup effects, and paced supply lifecycle in an isolated profile.
(() => {
  (async()=>{
    globalThis.__skyPreview=true;
    const {default:source}=await import('/scripts/audit-skybreach.browser.js?raw');(0,eval)(source);
    const report=globalThis.__n3onLayoutAudit;await report.promise;
    delete globalThis.__skyPreview;if(report.errors.length)return;
    report.running=true;
    const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    try {
      const sky=globalThis.__sky,p=sky.player;sky.scene.pause();sky.physics.pause();sky.retireFlights();sky.clearThreats();
      const {PICKUP_BALANCE:P}=await import('/src/game/config/balance/index.ts');
      const {SkyBreachSupplies}=await import('/src/game/anomalies/skybreach/SkyBreachSupplies.ts');
      for(const pickup of sky.pickups)pickup.root.destroy(true);sky.pickups.length=0;
      sky.supplies=new SkyBreachSupplies(42);sky.missionTime=0;
      p.body.reset(35,sky.pickupBounds.h-45);p.hp=p.stats.maxHealth;p.energy=p.energyStats.max;
      const resources=()=>sky.pickups.filter(s=>(s.kind==='health'||s.kind==='energy')&&s.root.active);
      const advance=ms=>{for(let t=0;t<ms;t+=100){sky.time.now+=100;sky.missionTime+=100;sky.updatePickups(sky.time.now,.1);}};
      advance(7000);check(resources().length===0,'no perpetual supplies at entry');
      advance(6000);check(resources().length===1,'first timed supply arrives within thirteen active seconds');
      const first=resources()[0];p.hp=10;p.energy=0;first.root.setPosition(p.x,p.y);
      sky.updatePickups(sky.time.now,0);
      check(!first.root.active&&resources().length===0,'collection does not immediately replace the supply');
      check(first.kind==='health'?p.hp===10+Math.max(P.healthRestore,p.stats.maxHealth*.22)*sky.modRuntime.multiplier('healthPickupValue')
        :p.energy===p.energyStats.max*P.energyRestoreFraction*sky.modRuntime.multiplier('energyPickupValue'),'flight health scales with maximum HP and shared pickup Mods remain active');
      advance(22000);check(resources().length>0&&resources().length<=2,'supplies return after a randomized interval');
      const old=resources()[0];old.root.y=sky.pickupBounds.h+31;
      const roots=sky.pickups.map(p=>p.root);
      sky.pickupMotion.update(roots,r=>r,sky.pickupBounds,[],sky.time.now,.1);
      sky.pickupMotion.separate(roots,r=>r,sky.pickupBounds,[]);sky.updatePickups(sky.time.now,.1);
      check(!old.root.active,'offscreen supplies retire through the complete motion pipeline');
      for(let i=0;i<300;i++)sky.spawnEnemyDrops({x:720,y:230,stats:{valueCredits:3,valueCoreTokens:0}});
      check(resources().length<=2&&['health','energy'].every(kind=>resources().filter(p=>p.kind===kind).length<=1),'rapid enemy kills share the supply budget');
      for(let i=0;i<10;i++)sky.recoveryPickups();
      check(resources().length<=2,'recovery sectors cannot refill four resource slots');
      advance(60000);check(resources().length<=2,'uncollected resources remain bounded over a minute');
      const parked=resources().map(s=>s.root.y);await wait(120);
      check(resources().every((s,i)=>s.root.y===parked[i]),'pause freezes supply scrolling and cadence');
      sky.returning=true;for(const pickup of sky.pickups)pickup.root.destroy(true);sky.pickups.length=0;
      advance(30000);check(resources().length===0,'returning scene cannot spawn supplies');sky.returning=false;
      report.cases.push({name:'randomized resource collection, kill-drop pacing, scroll retirement, recovery and pause'});
    }catch(e){report.errors.push(String(e.stack??e));}finally{report.running=false;}
  })();return {started:true};
})();
