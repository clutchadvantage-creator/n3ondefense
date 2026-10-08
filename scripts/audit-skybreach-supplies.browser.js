// Includes the real Arena -> SkyBreach handoff in an isolated DEV profile.
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
      const resources=kind=>sky.pickups.filter(s=>s.kind===kind&&s.root.active);
      const counts=()=>resources('health').length===2&&resources('energy').length===2;
      check(counts(),'two health and two energy supplies exist during Dreadnought fight');
      const health=resources('health')[0],energy=resources('energy')[0];
      p.hp=10;p.energy=0;health.root.setPosition(p.x,p.y);energy.root.setPosition(p.x,p.y);
      sky.updatePickups(sky.time.now,0);
      check(p.hp===10+P.healthRestore*sky.modRuntime.multiplier('healthPickupValue'),'health restores the Arena amount through shared collection');
      check(p.energy===p.energyStats.max*P.energyRestoreFraction*sky.modRuntime.multiplier('energyPickupValue'),'energy restores the Arena amount through shared collection');
      check(!health.root.active&&!energy.root.active&&counts(),'collected supplies are destroyed and replaced immediately');
      const old=resources('health')[0];old.root.y=sky.pickupBounds.h+31;
      // Exercise Arena drift and separation first: it must not clamp flight supplies onscreen.
      const roots=sky.pickups.map(p=>p.root);
      sky.pickupMotion.update(roots,r=>r,sky.pickupBounds,[],sky.time.now,.1);
      sky.pickupMotion.separate(roots,r=>r,sky.pickupBounds,[]);
      sky.updatePickups(sky.time.now,.1);
      check(!old.root.active&&counts(),'off-screen supply retires and respawns after the complete motion pipeline');
      const original=new Set(sky.pickups.map(s=>s.root));p.body.reset(35,sky.pickupBounds.h-45);
      for(let i=0;i<500;i++)sky.updatePickups(sky.time.now+i*100,.1);
      check(counts()&&sky.pickups.filter(s=>s.kind==='health'||s.kind==='energy').length===4,'fifty seconds of scrolling keeps exactly four supplies');
      check([...original].every(root=>!root.active),'old scrolling supplies release their render roots');
      for(let i=0;i<8;i++)for(const kind of ['health','energy'])sky.pickups.push({kind,
        root:sky.createGameplayPickup(kind,250+i*60,200),expiresAt:Infinity,source:'enemy'});
      sky.updatePickups(sky.time.now,0);
      for(let i=0;i<10;i++)sky.recoveryPickups();
      check(counts()&&sky.pickups.length===4,'enemy drops and recovery sectors do not accumulate extra resources');
      const parked=sky.pickups.map(s=>s.root.y);await wait(100);
      check(sky.pickups.every((s,i)=>s.root.y===parked[i]),'pause freezes supply scrolling');
      sky.returning=true;const retired=sky.pickups.pop();retired.root.destroy(true);sky.updatePickups(sky.time.now,1);
      check(sky.pickups.length===3,'returning scene cannot spawn new supplies');sky.returning=false;
      sky.replenishResourcePickups();check(counts(),'active scene replenishes the missing slot');
      report.cases.push({name:'SkyBreach resource collection, scroll retirement, bounded replenishment and pause'});
    }catch(e){report.errors.push(String(e.stack??e));}finally{report.running=false;}
  })();return {started:true};
})();
