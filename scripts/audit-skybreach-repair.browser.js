// Isolated profiles and assisted high-pressure probes. This is not an unassisted balance playthrough.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],errors:[],samples:[]};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const stats=a=>{a.sort((a,b)=>a-b);return{n:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1)}};
  report.promise=(async()=>{
    let restore;
    try {
      const {kineticAuditArena}=await import('/scripts/kinetic-audit-setup.js');
      const {ANOMALY_BY_ID}=await import('/src/game/anomalies/AnomalyRegistry.ts');
      const {getCampaignProtocol}=await import('/src/game/progression/CampaignProgression.ts');
      const {SkyBreachSupplies:After}=await import('/src/game/anomalies/skybreach/SkyBreachSupplies.ts');
      const {SkyBreachSupplies:Before}=await import('/artifacts/repair-before-supplies.ts');
      const {SkyBreachAmmoSupplies:Ammo}=await import('/src/game/anomalies/skybreach/SkyBreachAmmoSupplies.ts');
      const {SeededRandom}=await import('/src/game/systems/SeededRandom.ts');
      const {selectEnemyPickup}=await import('/src/game/player/PickupDropTable.ts');
      for(const [mode,round] of [['normal',9],['supreme',26]]) {
        report.current=mode;
        const mods=(mode==='supreme'?['calibrated-barrel','sentry-dominion','magnetic-service','supreme-crown-of-stars','supreme-singularity-chamber']:[]).map(id=>({id,rank:3}));
        const {a,game,wait,until,restoreInput,renderer}=await kineticAuditArena({round,protocol:getCampaignProtocol(mode,round),maxUpgrades:mode==='supreme',equippedMods:mods});restore=restoreInput;
        game.scene.resume('arena');a.player.invulnUntil=Infinity;
        a.beginAnomalyTransition({anomalyId:'skybreach',definition:ANOMALY_BY_ID.get('skybreach'),sessionId:'repair-sky-'+Date.now(),cost:60,portal:{x:a.player.x,y:a.player.y}});
        await until(()=>game.scene.isActive('anomaly-skybreach')&&game.scene.keys['anomaly-skybreach'].inputController,'SkyBreach');
        const s=game.scene.keys['anomaly-skybreach'];globalThis.__repairSky=s;s.session.inputBridge=undefined;s.inputController.adoptDevice('gamepad');s.player.invulnUntil=Infinity;
        s.scene.pause();s.physics.pause();s.retireFlights();s.clearThreats();
        const config=JSON.stringify(s.difficulty),weapon=JSON.stringify(s.player.weapon);
        if(mode==='supreme')check(s.player.stats.maxHealth>=230&&s.player.energyStats.max>110,'Supreme26 uses all permanent upgrades');
        const resourceCounts={};
        for(const kind of ['health','energy','grenadeRounds','scattershot']) {
          s.player.body.reset(s.pickupBounds.w/2,s.pickupBounds.h*.74);s.player.hp=s.player.stats.maxHealth*.2;s.player.energy=0;s.temporaryAmmo.reset();
          const hp=s.player.hp,energy=s.player.energy; s.spawnFlightSupply(kind,-1000,s.pickupBounds.h+900);
          const p=s.pickups.at(-1);
          check(p.root.x>=80&&p.root.x<=s.pickupBounds.w-80&&p.root.y<s.player.y&&Math.abs(p.root.x-s.player.x)<=240,mode+'/'+kind+': offscreen kill produces reachable pickup');
          check(p.expiresAt-s.time.now===22000,mode+'/'+kind+': 22-second lifetime');
          const y=p.root.y;s.updatePickups(s.time.now,.1);check(p.root.y>=y+4.9-.001,mode+'/'+kind+': pickup scrolls toward player, including equipped attraction');
          s.player.body.reset(p.root.x,p.root.y);s.updatePickups(s.time.now,0);
          check(!s.pickups.includes(p),mode+'/'+kind+': actual shared collection path succeeds');
          resourceCounts[kind]=kind==='health'?s.player.hp-hp:kind==='energy'?s.player.energy-energy:s.temporaryAmmo.remainingMs(s.time.now);
        }
        s.player.body.reset(s.pickupBounds.w/2,s.pickupBounds.h*.74);s.player.hp=s.player.stats.maxHealth;s.player.energy=s.player.energyStats.max;s.temporaryAmmo.reset();
        for(const p of s.pickups)p.root.destroy(true);s.pickups.length=0;
        // Both active and disabled ground threats must scroll and clean up.
        const tank=s.spawnAircraft('tank',s.world.groundLaneX(0),s.pickupBounds.h+45),disabled=s.spawnAircraft('tank',s.world.groundLaneX(1),s.pickupBounds.h+45);
        disabled.disabledUntil=s.time.now+1e6;const y0=tank.y;const warn=s.flights.get(tank).warning;
        const aa=s.spawnAircraft('aa',s.pickupBounds.w*.13,380),site=s.flights.get(aa).site;
        let maxAnchorError=0;const sampleAA=()=>{if(aa.active)maxAnchorError=Math.max(maxAnchorError,Math.hypot(aa.x-site.x,aa.y-site.y));};
        game.events.on('poststep',sampleAA);s.scene.resume();s.physics.resume();await wait(700);
        check(tank.active&&tank.y>y0+25&&Math.abs(tank.body.velocity.y-49)<.01,mode+': tank scrolls at street velocity');
        check(disabled.y>y0+25,mode+': disabled tank continues terrain scrolling');
        await wait(1300);game.events.off('poststep',sampleAA);s.scene.pause();s.physics.pause();
        check(!tank.active&&!disabled.active&&!warn.scene&&!s.flights.has(tank),mode+': offscreen tanks and their warning objects retire');
        check(maxAnchorError<1.5&&aa.depth>site.image.depth&&aa.depth<site.image.depth+.001,mode+': rendered AA stays attached and shares parent depth');
        s.damageEnemy(aa,1e9);s.updateEnemies(s.time.now,.016);s.world.update(0,s.pickupBounds.h);
        check(site.image.active&&site.wreck.visible&&!aa.active,mode+': AA destruction retains tower and rooftop wreck');
        // Deterministic supply-rate comparison: same kills, sustained deficits,
        // two seconds to collect. Values are opportunities, not automatic healing.
        const rates=[];
        for(const [label,C] of [['before',Before],['after',After]]) {
          const sums={health:0,energy:0,grenadeRounds:0,scattershot:0};
          for(let seed=1;seed<=100;seed++){
            const supply=new C(seed,s.difficulty.spawnCadence),ammo=label==='after'?new Ammo(seed,supply.tempo):null,rng=new SeededRandom(seed);
            const on=[],state={health:0,energy:0,missingHealth:mode==='supreme'?.75:.4,missingEnergy:mode==='supreme'?.8:.4};let activeUntil=0,activeKind=null;
            const spawn=(kind,now)=>{on.push({kind,until:now+2000});sums[kind]++;if(kind==='health'||kind==='energy')state[kind]++;};
            for(let now=0;now<300000;now+=100){
              for(let i=on.length-1;i>=0;i--)if(on[i].until<=now){const p=on.splice(i,1)[0];if(p.kind==='health'||p.kind==='energy')state[p.kind]--;else {activeUntil=now+resourceCounts[p.kind];activeKind=p.kind;}}
              const as={onScreen:on.filter(p=>p.kind==='grenadeRounds'||p.kind==='scattershot').length,activeRemainingMs:Math.max(0,activeUntil-now),activeKind:activeUntil>now?activeKind:null};
              if(now%(mode==='supreme'?700:1400)===0){
                if(supply.healthFromEnemy(now,state,1))spawn('health',now);
                if(supply.energyFromEnemy?.(now,state,1))spawn('energy',now);
                const m=ammo?.next(now,as,true,1);if(m){spawn(m,now);as.onScreen++;}
                if(rng.next()<.5){const k=selectEnemyPickup(rng.next());if(k==='health'||k==='energy'){if(supply.acceptEnemyDrop(k,now,state))spawn(k,now);}
                  else if(k==='grenadeRounds'||k==='scattershot'){if(!ammo||ammo.accept(k,now,as)){spawn(k,now);as.onScreen++;}}}
              }
              const m=ammo?.next(now,as);if(m)spawn(m,now);
              const k=supply.next(now,state);if(k)spawn(k,now);
            }
          }
          rates.push({label,opportunitiesPerMinute:Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,v/500]))});
        }
        // High-pressure rendering/update sample with the actual maxed build.
        s.retireFlights();s.clearThreats();s.startDreadnought();
        for(let i=0;i<s.difficulty.activeCap;i++)s.spawnAircraft(i%3===0?'tank':'interceptor',100+(i%8)*110,100+Math.floor(i/8)*170);
        const frames=[],updates=[];let previous;const onFrame=()=>{const n=performance.now();if(previous)frames.push(n-previous);previous=n;};
        const originalUpdate=s.sys.sceneUpdate;s.sys.sceneUpdate=function(...args){const t=performance.now();try{return originalUpdate.apply(s,args);}finally{updates.push(performance.now()-t);}};
        game.events.on('step',onFrame);s.scene.resume();s.physics.resume();await wait(8000);s.scene.pause();s.physics.pause();game.events.off('step',onFrame);s.sys.sceneUpdate=originalUpdate;
        check(JSON.stringify(s.difficulty)===config&&JSON.stringify(s.player.weapon)===weapon,mode+': enemy tuning and operative weapon stats unchanged');
        report.samples.push({mode,round,renderer,maxHealth:s.player.stats.maxHealth,maxEnergy:s.player.energyStats.max,weapon:s.player.weapon,mods,
          cadence:s.difficulty.spawnCadence,tempo:s.supplies.tempo,resources:resourceCounts,rates,aaMaxAnchorError:maxAnchorError,
          frames:stats(frames),updateMs:stats(updates),flights:s.flights.size,shots:s.skyShots.size,seekers:s.seekers.size,objects:s.children.length});
        report.cases.push({mode,round,passed:true});
        if(mode==='supreme'&&globalThis.__n3onLayoutAuditOptions?.capture){s.retireFlights();s.spawnAircraft('aa',s.pickupBounds.w*.13,380);s.spawnAircraft('aa',s.pickupBounds.w*.87,340);s.world.update(0,s.pickupBounds.h);s.updateEnemies(s.time.now,0);return;}
        s.scene.resume();s.physics.resume();s.onDevInstantReturn();await until(()=>game.scene.isActive('arena')&&!game.scene.isActive(s.scene.key),'Arena return');
        check(s.flights.size===0&&s.pickups.length===0,mode+': anomaly resources clean up on return');game.scene.pause('arena');restore();restore=null;
      }
    }catch(e){report.errors.push(String(e.stack??e));}finally{restore?.();report.running=false;}
  })();return{started:true};
})();
