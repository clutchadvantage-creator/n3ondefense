// DEV-only isolated profile: store transactions, annual availability, persistence, live combat art and bounded celebrations.
(() => {
  if(globalThis.__n3onLayoutAudit?.running) throw Error('An audit is already running');
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],samples:[],errors:[],startedAt:new Date().toISOString()};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(fn,label)=>{const end=performance.now()+18000;while(!fn()){if(performance.now()>end)throw Error('Timeout: '+label);await wait(30);}};
  const game=n3onGame, RealDate=Date, originalError=console.error;
  let calendarInstant=new RealDate(2026,9,31,14).getTime();
  console.error=(...args)=>{report.errors.push(args.map(String).join(' '));originalError.apply(console,args);};
  let savedPads;
  const stopScenes=async()=>{for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);await wait(100);};
  report.promise=(async()=>{
    try {
      globalThis.Date=class extends RealDate {constructor(...args){if(args.length)super(...args);else super(calendarInstant);}};
      const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
      const dep=name=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+name+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
      const {SaveSystem:S}=await import(dep('SaveSystem'));
      const {RunTransitionManager:T}=await import(dep('RunTransitionManager'));
      const {COSMETICS,getCosmeticPurchaseCosts}=await import('/src/data/cosmetics.ts');
      const items=COSMETICS.filter(item=>item.holiday==='halloween');
      await stopScenes();
      check(S.createProfile('Halloween '+RealDate.now().toString().slice(-6)).ok,'isolated profile created');
      const profileId=S.getActiveProfileSummary().id;
      S.setSettings({masterVolume:0,contextualTutorials:false,particles:true});
      S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
      S.addCredits(1000000);S.addCoreTokens(10000);S.addPlasmaChips(10000);
      game.scene.start('cosmetics'); await until(()=>document.querySelectorAll('.store-card').length===15,'seasonal showroom');
      const store=game.scene.keys.cosmetics.storefront;
      check(store.selectedCategory==='seasonal','seasonal collection featured on entry');
      check(document.querySelectorAll('.store-card .hw-svg').length===15,'all 15 cards render authored SVG art');
      for(const card of document.querySelectorAll('.store-card[data-halloween-set]')){
        check(card.querySelector('.cosmetic-visual').getBoundingClientRect().bottom<=card.querySelector('h3').getBoundingClientRect().top,
          card.dataset.itemId+': art stays above its readable name');
      }
      check(document.querySelector('.store-season-banner').textContent.includes('OCT 1 - NOV 1'),'inclusive seasonal dates displayed');
      for(const item of items){
        for(const key of [item.textureKey,item.nativeTextureKey].filter(Boolean))check(game.textures.exists(key),item.id+': combat texture loaded');
      }
      const first=items.find(item=>item.id==='bomb-witch-signal');
      document.querySelector(`[data-item-id="${first.id}"]`).click();
      document.querySelector('.store-action').click();
      check(!!document.querySelector('.store-dialog'),'premium confirmation shown');
      const before=S.getWalletSnapshot(),cost=getCosmeticPurchaseCosts(first);
      document.querySelector('.store-dialog .confirm').click();
      await wait(50);
      const after=S.getWalletSnapshot();
      for(const currency of ['credits','coreTokens','plasmaChips'])check(before[currency]-after[currency]===cost[currency],currency+': exact multi-currency purchase charge');
      check(S.getEquippedCosmeticId('bombColor')===first.id,'purchase equips selected signature');
      check(document.querySelector('.store-action').textContent==='EQUIPPED','successful purchase reflected in store');
      check(document.querySelector('.store-set-collection h3').textContent.includes('1/5'),'set ownership progress updated');
      const retryBefore=JSON.stringify(S.getWalletSnapshot());
      check(S.purchaseAndEquipCosmetic(first.id).ok,'repeat owned purchase equips');
      check(JSON.stringify(S.getWalletSnapshot())===retryBefore,'owned equip never charges again');
      const pending=items.find(item=>item.id==='bomb-pumpkin-reactor');
      document.querySelector(`[data-item-id="${pending.id}"]`).click();document.querySelector('.store-action').click();
      calendarInstant=new RealDate(2026,10,2,0).getTime();
      window.dispatchEvent(new Event('focus'));await wait(40);
      check(!document.querySelector('.store-dialog'),'calendar rollover dismisses stale purchase dialog');
      check(!document.querySelector('.store-season-banner')&&!document.querySelector('[data-halloween-set]'),'off-season goods hidden from store');
      const seasonalBalance=JSON.stringify(S.getWalletSnapshot());
      check(!S.purchaseAndEquipCosmetic(pending.id).ok,'purchase service rejects stale out-of-season item');
      check(JSON.stringify(S.getWalletSnapshot())===seasonalBalance,'out-of-season rejection spends nothing');
      check(S.purchaseAndEquipCosmetic(first.id).ok,'owned holiday signature equip allowed off-season');
      calendarInstant=new RealDate(2027,9,1,0).getTime();window.dispatchEvent(new Event('focus'));await wait(40);
      check(!!document.querySelector('[data-controller-focus-id="store-category-seasonal"]'),'collection returns next October automatically');
      for(const item of items)check(S.purchaseAndEquipCosmetic(item.id).ok,item.id+': purchase all five-piece sets');
      S.persist();check(S.selectProfile(profileId).ok,'saved profile reloaded');
      for(const item of items)check(S.get().unlockedCosmetics.includes(item.id),item.id+': ownership persisted');
      report.cases.push('holiday storefront, purchase, rollover and saved ownership');

      await stopScenes();game.scene.start('menu');await wait(100);const menu=game.scene.keys.menu;T.clearForMenu(menu);
      const session={baseSeed:810811,round:1,protocol:'normal',objectiveMode:'open',equippedMods:[],modsEarned:[]};
      T.requestArenaTransition(menu,{reason:'new-run',session});
      await until(()=>game.scene.isActive('loading')&&T.snapshot(game.scene.keys.loading).lastStep==='awaiting-user-deploy-confirmation','deployment confirmation');
      game.scene.keys.loading.confirmDeployment(session,'new-run');
      await until(()=>game.scene.isActive('arena')&&game.scene.keys.arena.roundRuntime?.phase==='active','arena');
      const arena=game.scene.keys.arena;globalThis.__halloweenArena=arena;
      arena.pointerLock.hidePrompt();arena.player.invulnUntil=Infinity;
      savedPads=navigator.getGamepads;
      navigator.getGamepads=()=>[{id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:performance.now()}];
      arena.playerInput.adoptDevice('gamepad');if(arena.state.state==='Paused')arena.resumeGameplay();await wait(100);
      check(arena.player.texture.key==='player-premium-halloween-pumpkin','equipped operative loaded in actual Arena');
      check(arena.player.body.radius===12,'operative retains standard collision radius');
      check(arena.projectileTextureKey==='projectile-premium-halloween-pumpkin','equipped projectile loaded in actual Arena');
      const originalAim=arena.getAimWorldPoint;
      let placement;
      for(let y=arena.player.y-100;y<=arena.player.y+100&&!placement;y+=25)for(let x=arena.player.x-100;x<=arena.player.x+100&&!placement;x+=25)if(arena.isValidPlacement(x,y))placement={x,y};
      check(!!placement,'valid ability placement found');arena.getAimWorldPoint=()=>placement;
      arena.player.energy=arena.player.energyStats.max;arena.abilityCooldownUntil.turret=0;arena.placeAbility('turret',arena.time.now);
      check(arena.turrets.length===1,'equipped Halloween turret placed');
      check(arena.turrets[0].premiumVisual.head.list.some(child=>child.texture?.key==='turret-halloween-pumpkin'),'placed turret uses premium art');
      arena.player.energy=arena.player.energyStats.max;arena.placeAbility('mine',arena.time.now);arena.getAimWorldPoint=originalAim;
      check(arena.mines.length>0&&arena.mines[0].frameArt.texture.key==='mine-halloween-pumpkin','placed mine uses premium art');
      report.cases.push('purchased frames and projectile reach actual Arena');

      // Evaluate every animation at several moments using the live renderer. This avoids timing-sensitive screenshots.
      game.scene.pause('arena');const vfx=arena.bombExplosionCosmeticVfx;
      const effectItems=items.filter(item=>item.bombExplosionEffect);
      for(const item of effectItems){
        vfx.reset();check(vfx.emitEquipped(item.id,arena.player.x,arena.player.y,520,0)===item.bombExplosionEffect,item.id+': effect resolved');
        vfx.update(1400);check(vfx.activeEffectCount===1,item.id+': active during celebration');
        const visual=[...vfx.halloween.values()].find(visual=>visual.root.visible);
        check(visual&&visual.root.scaleX<=300/128,item.id+': scene-sized bounded centerpiece');
        const rotation=visual.seal.rotation,jawY=visual.jaw.y,wingScale=visual.bats[0].left.scaleY;
        vfx.update(1530);check(visual.seal.rotation!==rotation,item.id+': seal rotates');
        if(item.halloweenSet==='bats')check(visual.bats[0].left.scaleY!==wingScale,'bat wings flap independently');
        else check(visual.jaw.y!==jawY,item.id+': jaw cackles');
        vfx.update(3300);check(visual.root.alpha>0&&visual.root.alpha<1,item.id+': release dissolves');
        vfx.update(4200);check(vfx.activeEffectCount===0&&!visual.root.visible,item.id+': automatic expiry');
      }
      for(let i=0;i<20;i++)vfx.emit('neon-bats',arena.player.x,arena.player.y,520,i*3);
      vfx.update(1000);check(vfx.activeEffectCount===6&&vfx.halloween.size<=6,'simultaneous effects bounded by six reusable slots');
      const children=arena.children.length;
      for(let repeat=0;repeat<4;repeat++){vfx.reset();for(let i=0;i<6;i++)vfx.emit(effectItems[i%3].bombExplosionEffect,arena.player.x,arena.player.y,520,i);vfx.update(1200);}
      check(arena.children.length===children,'repeated celebrations reuse objects without scene growth');
      const visual=[...vfx.halloween.values()].find(visual=>visual.root.visible);
      visual.update('bats',0,0,520,1400,true);
      check(visual.bats.filter(bat=>bat.root.visible).length===6&&visual.sparks.filter(spark=>spark.visible).length===8,'reduced detail keeps smaller particle budget');
      vfx.reset();check([...vfx.halloween.values()].every(visual=>!visual.root.visible),'reset hides every pooled celebration');

      arena.detonateSite(arena.bombSites.sites[0]);
      check(vfx.activeEffectCount===1&&vfx.states.some(state=>state.active&&state.effectId==='pumpkin-reactor'),'real site detonation resolves purchased Pumpkin effect');
      check(vfx.recommendedSceneHoldMs(1400,arena.time.now)>=4240,'round handoff holds until celebration finishes');
      report.cases.push('authoritative site detonation and round handoff');
      // Keep a live scene available for visual review after the integration checks.
      vfx.reset();vfx.emit('witch-signal',arena.cameras.main.worldView.centerX,arena.cameras.main.worldView.centerY+70,520,0);vfx.update(1400);
      report.cases.push('animation phases, performance cap, reduced effects, reset');
      report.samples.push({viewport:[innerWidth,innerHeight],holidayPieces:items.length,poolSize:vfx.halloween.size});
    } catch(error){report.errors.push(error.stack??String(error));}
    finally{globalThis.Date=RealDate;console.error=originalError;if(savedPads)navigator.getGamepads=savedPads;report.running=false;report.finishedAt=new RealDate().toISOString();}
  })();
  return 'Halloween audit started';
})()
