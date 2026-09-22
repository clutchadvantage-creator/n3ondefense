// Browser-only fixtures for the separate extended run. Production balance is
// unchanged. Player invulnerability, fresh ability energy, and accelerated
// rewards/boss outcomes let the real runtime exercise each transition reliably.
export async function createProgressionExercises({game, report, pad, wait, until, coverage}) {
  const {GAS_HAZARD_BALANCE}=await import('/src/game/config/gasHazards.ts');
  const {TEMPORARY_AMMO_BALANCE}=await import('/src/game/player/TemporaryAmmoMode.ts');
  const {SaveSystem}=await import('/src/game/systems/SaveSystem.ts');
  const {LocalSaveManager}=await import('/src/game/save/LocalSaveManager.ts');
  const {PlayerProfileStore}=await import('/src/game/state/PlayerProfileStore.ts');
  const {getSupremeStage,isSupremeStageUnlocked,SUPREME_STAGE_DEFINITIONS}=await import('/src/game/progression/SupremeProgression.ts');
  const {TUTORIAL_SEQUENCES}=await import('/src/game/tutorial/TutorialRegistry.ts');
  const {isRunProtocolUnlocked}=await import('/src/game/mods/modBalance.ts');
  const {getHighestUnlockedNormalCheckpoint}=await import('/src/game/progression/OperationsConfiguration.ts');
  const checks=report.gameplayChecks=[];
  const check=(ok,label,detail={})=>{
    checks.push({ok,label,round:report.round,...detail});
    if(!ok)throw new Error(label);
  };
  let visits=0;
  const defend=()=>{
    const arena=game.scene.getScene('arena');
    if(!arena.sys.isActive()||arena.roundRuntime?.phase!=='active'||arena.state.state==='Paused')return;
    if(!arena.bombSites?.sites.some(s=>s.defuseMs>=1000))return;
    for(const enemy of [...arena.enemies])if(enemy.active&&arena.defuseAssignees.has(enemy)) {
      enemy.takeDamage(enemy.hp,'weapon');coverage('assistedDefuserKill');
    }
  };
  game.events.on('step',defend);
  const observedEcho = new WeakSet();
  const driveEcho = () => {
    const scene = game.scene.getScenes(true).find(s => s.echo && (s.scene.key === 'arena' || s.scene.key === 'anomaly-heist'));
    const echo = scene?.echo, t = echo?.timeline;
    if (t && !observedEcho.has(echo)) {
      observedEcho.add(echo);
      const original = t.host.event;
      t.host.event = event => {
        if (event === 'snap') {
          (report.echoActivations ??= []).push({ scene: scene.scene.key, round: report.round, durationMs: t.durationMs,
            shots: t.shotCount, samples: t.sampleCount, rejectedShots: t.rejectedShots });
          coverage('echoReplay');
        }
        original(event);
      };
    }
    const playing = t && !scene.manuallyPaused && !scene.inputCapturePaused && scene.state?.state !== 'Paused'
      && !scene.returning && !scene.legendaryRevealInProgress && !scene.anomalyController?.blocksArenaGameplay
      && (scene.scene.key !== 'arena' || scene.roundRuntime?.phase === 'active');
    const down = Boolean(playing && !pad.buttons[6].pressed && !t.recording && !t.replaying && t.cooldownMs === 0);
    pad.buttons[6].pressed = pad.buttons[6].touched = down; pad.buttons[6].value = Number(down);
  };
  if (report.options.includeEcho) game.events.on('step', driveEcho);
  return {
    destroy(){game.events.off('step',defend);game.events.off('step',driveEcho);},
    setupProfile(protocol, initialHighestRound) {
      const result=SaveSystem.createProfile(`Progression ${Date.now().toString().slice(-7)}`);
      check(result.ok,'fresh isolated progression profile');
      if (report.options.includeEcho) SaveSystem.setSettings({ abilityBindings: { ...SaveSystem.get().settings.abilityBindings, echo: 'Gamepad:6' } });
      // A late-round player has acknowledged contextual teaching. Otherwise a
      // fresh fixture correctly pauses for the first defuse/tutorial prompt.
      SaveSystem.updateTutorialProgress(p=>{
        p.firstRunStage='complete';p.firstRunWelcomePending=false;
        p.completedSequences=TUTORIAL_SEQUENCES.map(s=>s.id);
      });
      if(protocol.startsWith('supreme')) {
        // Match the prerequisite campaign completion of a real Supreme player,
        // while leaving Supreme highest-round progression fresh for 58/68.
        SaveSystem.recordRegularOverdriveCompletion();
        SaveSystem.markRegularOverdriveSupremeBridgeAwarded();
        if(initialHighestRound!==undefined)SaveSystem.recordRoundCompletion(initialHighestRound,protocol);
      }
    },
    loadout(protocol) {
      const ids=protocol.startsWith('supreme')
        ? ['split-current','supreme-eventide-arsenal','jailbroke-turrets','emergency-shield','supreme-singularity-chamber']
        : ['split-current','nanite-fuel','jailbroke-turrets','emergency-shield','magnetic-payload'];
      return ids.map(id=>({id,rank:3}));
    },
    prepareCombat(arena) {
      const now=arena.time.now;
      const site=arena.bombSites.sites.find(s=>s.state==='Available');
      if(site) { arena.bombSites.armSite(site,arena.getBombDefenseDurationMs(),now); coverage('armedBomb'); }
      const aim=arena.getAimWorldPoint;
      try {
        for(const [index,type] of ['fence','turret','mine'].entries()) {
          let point;
          for(let n=0;n<60&&!point;n++) {
            const angle=(n+index*20)*Math.PI/15, radius=70+Math.floor(n/15)*35;
            const x=arena.player.x+Math.cos(angle)*radius,y=arena.player.y+Math.sin(angle)*radius;
            if(arena.isValidPlacement(x,y))point={x,y};
          }
          check(Boolean(point),`valid ${type} placement`);
          arena.getAimWorldPoint=()=>point;
          arena.player.energy=arena.player.energyStats.max;
          arena.placeAbility(type,now);
        }
      } finally { arena.getAimWorldPoint=aim; }
      check(arena.fences.length>0&&arena.turrets.length>0&&arena.mines.length>0,'all deployable types active');
      coverage('deployables');
      arena.gasHazard?.forcePhaseForDevelopment(now);
      arena.bombletHazard?.forceStrikeForDevelopment(now);
      arena.devHazardIgnitionAt=now+GAS_HAZARD_BALANCE.telegraphMs+GAS_HAZARD_BALANCE.fallMs+GAS_HAZARD_BALANCE.staggerMs*3+20;
      arena.devHazardIgnitionRadius=arena.getAbilityConfig('mine').radius;
      arena.devHazardIgnitionPending=Boolean(arena.gasHazard);
      coverage('hazardOverlap');
      for(let n=0;n<18;n++)arena.dropPickup(arena.player.x+Math.cos(n)*90,arena.player.y+Math.sin(n)*90);
      arena.temporaryAmmo.activate(report.round%2?'grenade':'scattershot',now,arena.isOverdriveProtocol());
      coverage('specialAmmo');
      check(arena.modRuntime.snapshot().length===5,'five equipped Mods', {mods:arena.modRuntime.snapshot()});
      // Exercise the existing shared prop classification with the real provider.
      const prop=arena.arenaSmashables?.props.find(p=>p.active);
      if(prop) {
        const reach=Math.max(prop.placement.width,prop.placement.height)*.5;
        check(arena.arenaSmashables.hasTargetInRadius(prop.placement.x+reach+26,prop.placement.y,32),'Arena prop proximity footprint');
        arena.arenaSmashables.damageArea(prop.placement.x,prop.placement.y,32,prop.maximumHp);
        coverage('smashableDestruction');
      }
    },
    async menus(arena) {
      const generation=arena.roundRuntime.generation;
      arena.togglePause(); await wait(250);
      check(arena.state.state==='Paused'&&arena.physics.world.isPaused,'Arena pause');
      arena.resumeGameplay(); await wait(200);
      check(arena.state.state!=='Paused'&&!arena.physics.world.isPaused,'Arena resume');
      arena.togglePause();arena.hidePauseMenu();arena.scene.pause();
      arena.scene.launch('options',{returnScene:'arena',resumeGameplay:true});
      await until(()=>game.scene.isActive('options'),'Arena Options');await wait(250);
      game.scene.getScene('options').handleEscReturn();
      await until(()=>arena.sys.isActive()&&arena.state.state!=='Paused','Arena Options return');
      arena.togglePause();arena.hidePauseMenu();arena.scene.pause();
      arena.scene.launch('upgrades',{returnScene:'arena',resumePausedScene:true});
      await until(()=>game.scene.isActive('upgrades'),'store');await wait(300);
      check(document.querySelectorAll('.storefront').length>0||document.querySelectorAll('[data-tutorial-target]').length>0,'store DOM mounted');
      game.scene.getScene('upgrades').returnToPreviousScene({returnScene:'arena',resumePausedScene:true});
      await until(()=>arena.sys.isActive()&&arena.state.state!=='Paused','store return');
      check(arena.roundRuntime.generation===generation,'menu returns preserve generation');
      coverage('arenaPauseOptionsStore');
    },
    persistence(round,protocol) {
      const memory=PlayerProfileStore.getActiveSave();
      const disk=JSON.parse(LocalSaveManager.getActiveProfileSaveRaw());
      check(JSON.stringify(memory.progress)===JSON.stringify(disk.progress),'progress persisted exactly', {completedRound:round,highest:disk.progress.highestRound});
      check(memory.credits===disk.credits&&memory.coreTokens===disk.coreTokens&&memory.mods.plasmaChips===disk.mods.plasmaChips&&memory.mods.cards.length===disk.mods.cards.length,'wallet and Mod cards persisted exactly');
      if(protocol.startsWith('supreme')) {
        check(disk.progress.supremeHighestRound>=round,'Supreme highest round persisted', {completedRound:round,highest:disk.progress.supremeHighestRound});
        for(const stage of SUPREME_STAGE_DEFINITIONS.filter(s=>s.unlockSource==='supreme'&&(round===s.unlockRound-1||round===s.unlockRound))) {
          check(isSupremeStageUnlocked(stage,disk.progress)===(round>=stage.unlockRound),'Supreme stage unlock boundary', {completedRound:round,stage:stage.protocolId,unlocked:round>=stage.unlockRound});
        }
      }
      if(protocol==='normal'&&(round===24||round===25))check(getHighestUnlockedNormalCheckpoint(disk.progress.normalHighestRound)===(round<25?20:25),'Normal checkpoint 25 unlock boundary');
      if(protocol.startsWith('overdrive')&&(round===47||round===48))check(isRunProtocolUnlocked('overdrive-perseus',disk.progress)===(round>=48),'Overdrive Perseus unlock boundary');
      if(protocol.startsWith('supreme')&&(round===67||round===68)) {
        check(isSupremeStageUnlocked(getSupremeStage('supreme-cassiopeia'),disk.progress)===(round>=68),'round 68 constellation unlock boundary', {completedRound:round,highest:disk.progress.supremeHighestRound});
      }
      coverage('diskProgressionVerified');
    },
    async heist(heist) {
      visits++;
      const unownedTexts=Phaser.Display.Canvas.CanvasPool.pool.filter(entry=>{
        const owner=entry.parent;
        return owner?.scene===heist&&owner.type==='Text'&&!owner.displayList&&!owner.parentContainer;
      });
      check(unownedTexts.length===0,'HEIST text resources belong to the scene display list',{unownedTexts:unownedTexts.length});
      const layout=heist.facility.layout;
      const byId=new Map(layout.nodes.map(n=>[n.id,n]));
      const adjacency=new Map(layout.nodes.map(n=>[n.id,[]]));
      for(const [a,b] of layout.edges){adjacency.get(a).push(b);adjacency.get(b).push(a);}
      // Open doors for complete graph traversal; normal traps, enemy AI,
      // collision, player movement, and native camera follow remain running.
      heist.setPhase('looting');heist.facility.setVaultDoorOpen(true);
      const route=[layout.entryNodeId],visited=new Set();
      const visit=id=>{
        visited.add(id);
        for(const next of adjacency.get(id))if(!visited.has(next)){route.push(next);visit(next);route.push(id);}
      };
      const fullTraversal=visits===1&&report.options.fullHeistTraversal!==false;
      if(fullTraversal)visit(layout.entryNodeId);
      const zooms=[];
      for(const id of route) {
        const point=byId.get(id),started=performance.now();
        while(Math.hypot(heist.player.x-point.x,heist.player.y-point.y)>24) {
          if(performance.now()-started>20000)throw new Error(`HEIST traversal stalled at ${id}: ${heist.player.x},${heist.player.y} -> ${point.x},${point.y}`);
          const dx=point.x-heist.player.x,dy=point.y-heist.player.y,d=Math.hypot(dx,dy);
          pad.axes[0]=dx/d;pad.axes[1]=dy/d;
          zooms.push(heist.cameras.main.zoom);
          await wait(50);
        }
      }
      pad.axes[0]=0;pad.axes[1]=0;
      check(heist.cameras.main.zoom===.9&&zooms.every(z=>z===.9),'HEIST stable camera during traversal',
        {nodes:fullTraversal?visited.size:1,totalNodes:layout.nodes.length,samples:zooms.length,minZoom:Math.min(.9,...zooms),maxZoom:Math.max(.9,...zooms)});
      if(fullTraversal){check(visited.size===layout.nodes.length,'complete facility traversed');coverage('completeHeistTraversal');}
      for(const enemy of [...heist.enemies])heist.damageEnemy(enemy,enemy.hp);
      await wait(150);
      const detonations=[];
      const detonate=heist.detonateGrenade;
      heist.detonateGrenade=function(projectile,...args) {
        detonations.push({projectile,at:this.time.now,x:projectile.sprite.x,y:projectile.sprite.y});
        return detonate.call(this,projectile,...args);
      };
      try {
      for(const container of heist.containers) {
        const originalHp=container.hp;
        const x=container.root.x+64,y=container.root.y;
        check(!heist.findContainerHit(x,y,7),'near-container shot misses direct contact');
        heist.spawnPlayerAmmoProjectile('grenade',x,y,Math.PI,heist.player.weapon.damage,0xffffff,0xff8800,false,0);
        const projectile=heist.projectiles.at(-1);
        // A slow approach remains outside direct contact throughout the real
        // arming interval and is processed by the ordinary projectile update.
        projectile.sprite.body.setVelocity(-30,0);
        const armedAt=projectile.grenadeArmedAt;
        const eventStart=detonations.length;
        await until(()=>detonations.length>eventStart||!projectile.sprite.active,'container grenade fuse',3000);
        const event=detonations[eventStart];
        check(event?.projectile===projectile&&event.at>=armedAt&&event.at-armedAt<150
          &&Math.abs(event.x-container.root.x)>45&&container.hp<originalHp,'HEIST proximity grenade damages container',
          {container:container.index,damage:originalHp-container.hp,splashDamage:heist.player.weapon.damage*TEMPORARY_AMMO_BALANCE.grenade.splashDamageMultiplier,afterArmedMs:event?.at-armedAt});
        // Direct hits keep their original full damage and do not double-hit.
        const hp=container.hp;
        heist.spawnPlayerAmmoProjectile('grenade',container.root.x,container.root.y,0,1,0xffffff,0xff8800,false,0);
        const direct=heist.projectiles.at(-1);direct.sprite.body.setVelocity(0,0);
        const directEventStart=detonations.length;
        await until(()=>detonations.length>directEventStart,'direct container grenade',2000);
        check(Math.abs(hp-container.hp-1)<.001,'direct grenade damage preserved');
        heist.damageContainer(container,container.hp);
        check(container.opened,'grenade-damaged container uses normal reward destruction');
        coverage('grenadeContainer');
      }
      } finally {heist.detonateGrenade=detonate;}
      check(!heist.containerCombatTargets.hasTargetInRadius(heist.containers[0].root.x,heist.containers[0].root.y,32),'opened containers are not fuse targets');
      check(heist.cameras.main.zoom===.9,'HEIST alarm preserves zoom');
    }
  };
}
