// Uses Arena's actual upgrade/Mod stat construction, then checks shared difficulty.
// Isolated DEV profile only; assisted snapshots, not a claim of human playtesting.
(() => {
  (async()=>{
    globalThis.__skyPreview=true;
    const {default:source}=await import('/scripts/audit-skybreach.browser.js?raw');(0,eval)(source);
    const report=globalThis.__n3onLayoutAudit;await report.promise;delete globalThis.__skyPreview;
    if(report.errors.length)return;report.running=true;report.builds=[];report.screenshots=[];
    const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    try {
      const sky=globalThis.__sky,a=globalThis.__skyArena,game=globalThis.n3onGame;
      sky.returnToArena(false,'player-dead');await wait(600);a.scene.pause();a.physics.pause();
      const [{ModRuntime},{UPGRADE_DEFINITIONS},{getCampaignProtocol},{skyBreachDifficulty},
        {getDifficultyCurve},{MOD_BY_ID},{validateModEquip},{getRecalibrationSlots}]=await Promise.all([
        import('/src/game/mods/ModRuntime.ts'),import('/src/data/upgrades.ts'),
        import('/src/game/progression/CampaignProgression.ts'),import('/src/game/anomalies/skybreach/SkyBreachDifficulty.ts'),
        import('/src/game/config/balance/index.ts'),import('/src/game/mods/definitions.ts'),
        import('/src/game/mods/ModLoadoutRules.ts'),import('/src/game/mods/PlasmaRecalibration.ts')]);
      const slots=['weapon','player','defense','bombSite','wildcard'];
      const standard=['black-star-engine','phase-armor','siege-firmware','bomb-chronometer','coolant-jacket'];
      const profiles=[
        {name:'starter',upgrades:0,mods:[]},
        {name:'developing',upgrades:.5,mods:['calibrated-barrel','aegis-battery','siege-firmware','bomb-chronometer','coolant-jacket'],rank:1},
        {name:'full upgrades',upgrades:1,mods:[]},
        {name:'rank 3 strong',upgrades:1,mods:standard},
        {name:'recalibrated strong',upgrades:1,mods:standard,calibrate:true},
        {name:'Supreme rank 3',upgrades:1,mods:['black-star-engine','phase-armor','supreme-eventide-arsenal','supreme-singularity-chamber','coolant-jacket'],supreme:true}
      ];
      for(const mode of ['normal','overdrive','supreme'])for(const profile of profiles) {
        if(profile.supreme&&mode!=='supreme')continue;
        const protocol=getCampaignProtocol(mode,15),slotState=Object.fromEntries(slots.map(s=>[s,null]));
        const snapshot=profile.mods.map((id,index)=>{
          const definition=MOD_BY_ID.get(id),slot=slots[index];
          check(validateModEquip(slotState,definition,slot,protocol).ok,`${mode}/${profile.name}: valid ${slot}`);slotState[slot]=id;
          const targets=['weaponDamage','weaponCritChance','weaponCooling','weaponCritDamage'];
          const calibrations=profile.calibrate?getRecalibrationSlots(definition).filter(s=>!s.protected).map((s,i)=>({
            slotIndex:s.slotIndex,stat:targets[i%targets.length],mode:targets[i%targets.length]==='weaponCritChance'?'add':'multiply',
            normalizedPower:1,quality:'optimal',calibratedAt:'2026-10-11T00:00:00Z'})):undefined;
          return {id,slot,rank:profile.rank??3,calibrations};
        });
        a.protocol=protocol;a.runUpgrades=Object.fromEntries(UPGRADE_DEFINITIONS.map(u=>[u.id,Math.floor(u.maxLevel*profile.upgrades)]));
        a.modRuntime=new ModRuntime({loadouts:[],cards:[]},snapshot,protocol);
        a.player.destroy();a.createOrMovePlayer();a.captureLoadoutDifficulty();
        const power=a.loadoutScaling;
        const entry={round:15,protocol,player:{stats:a.player.stats,energyStats:a.player.energyStats,weapon:a.player.weapon},
          difficulty:{...getDifficultyCurve(a.currentCombatPosition()),loadout:{...power},activeCount:20,rewardMultiplier:1,contractHealthMultiplier:1}};
        const difficulty=skyBreachDifficulty(entry);
        check(power.health<=1.55&&power.damage<=1.08,`${mode}/${profile.name}: bounded adaptation`);
        report.builds.push({mode,profile:profile.name,mods:snapshot,health:a.player.stats.maxHealth,energy:a.player.energyStats.max,
          weaponDps:Math.round(power.weaponDps),weightedSupportDps:Math.round(power.supportDps),
          offenseRatio:+power.offenseRatio.toFixed(2),enemyHealthMultiplier:+power.health.toFixed(3),
          enemyDamageMultiplier:+power.damage.toFixed(3),pressureMultiplier:+power.pressure.toFixed(3),
          oldShipHealth:difficulty.bossHealth*9,shipHealth:difficulty.bossTotalHealth,
          hardpointHealth:difficulty.hardpointHealth,coreHealth:difficulty.coreHealth,
          weaponOnlySeconds:+(difficulty.bossTotalHealth/power.weaponDps).toFixed(1)});
      }
      // Real arena bounds are offset inside the world; test the actual owned hazard.
      const laser=a.laserSecurity,bounds=a.layout.generation.bounds,inside=laser.playfield;
      check(inside.x>bounds.x&&inside.y>bounds.y&&inside.w<bounds.w,'Arena passes its inner perimeter to security lasers');
      for(let pattern=0;pattern<9;pattern++)for(let frame=0;frame<=20;frame++) {
        const count=laser.buildSegments(pattern,frame/20);
        check(laser.segments.slice(0,count).every(s=>[s.x1,s.x2].every(x=>x>=inside.x+12.99&&x<=inside.x+inside.w-12.99)
          &&[s.y1,s.y2].every(y=>y>=inside.y+12.99&&y<=inside.y+inside.h-12.99)),`laser ${pattern}/${frame}: beam and glow inside walls`);
      }
      laser.patternIndex=4;laser.draw(laser.buildSegments(4,.42),a.time.now,false);
      a.cameras.main.stopFollow();a.cameras.main.setZoom(Math.min(game.scale.width/2400,game.scale.height/1600));a.cameras.main.centerOn(1200,800);
      await wait(100);report.screenshots.push({label:'arena-laser-bounds',png:await new Promise(resolve=>game.renderer.snapshot(img=>resolve(img.src)))});
      report.cases.push({name:'actual permanent build stats in three modes, bounded scaling, and all nine arena laser patterns'});
      // All assisted mutations belong to the test scene; never resume it into a run.
      game.scene.stop('arena');game.scene.start('menu');
    }catch(e){report.errors.push(String(e.stack??e));}finally{report.running=false;}
  })();return {started:true};
})();
