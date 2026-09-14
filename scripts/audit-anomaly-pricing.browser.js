(() => {
 const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
 const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[]};
 const check=(ok,label,detail)=>{report.cases.push({ok:!!ok,label,detail});if(!ok)throw new Error(label);};
 const until=async(fn,label)=>{const start=performance.now();while(!fn()){if(performance.now()-start>20000)throw new Error(label);await wait(50);}};
 report.promise=(async()=>{
  let arena;
  try{
   const {SaveSystem}=await import('/src/game/systems/SaveSystem.ts');
   const {TUTORIAL_SEQUENCES}=await import('/src/game/tutorial/TutorialRegistry.ts');
   SaveSystem.createProfile('Anomaly pricing '+Date.now().toString().slice(-5));
   SaveSystem.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;p.completedSequences=TUTORIAL_SEQUENCES.map(s=>s.id);});
   SaveSystem.addFluxCores(2000);
   for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
   game.scene.start('arena',{baseSeed:550055,round:4,protocol:'normal',objectiveMode:'open',runStartedAt:Date.now(),modsEarned:[],modFocus:null,contract:null,creditsSpentBeforeRun:0,upgradeCompletionPercentage:0,accountProgressionTier:'endgame',runCreditsEarned:0});
   arena=game.scene.getScene('arena');await until(()=>arena.roundRuntime?.phase==='active','Arena starts');
   arena.pointerLockInitialGate=false;arena.player.invulnUntil=Infinity;
   arena.arcadeController.options.enabled=false;
   const original=arena.anomalyController,Ctor=original.constructor,context=original.context;
   original.destroy();arena.anomalyController=null;arena.physics.pause();
   for(const forced of [35,90,-100,1000,35.9,NaN,null,null,null,null]){
    let request;const metrics=[];
    const controller=new Ctor({...context,beginTransition:r=>request=r,emitMetric:e=>metrics.push(e)}, {...original.options,enabled:false});
    controller.setForcedCost(forced);
    check(controller.force('heist')&&controller.forceCharge(),'HEIST opens with shared quote',String(forced));
    const cost=controller.cost;
    check(Number.isInteger(cost)&&cost>=35&&cost<=90,'Quote stays 35-90',cost);
    if(forced===35||forced===90)check(cost===forced,'Inclusive endpoint accepted',cost);
    check(controller.hud.detail.text.includes(cost+' FLUX CORES'),'Portal display matches quote',controller.hud.detail.text);
    Object.defineProperty(controller.visual,'readyForInteraction',{configurable:true,value:true});
    arena.player.setPosition(controller.visual.x,controller.visual.y);
    controller.update(16);
    check(controller.hud.detail.text.includes(cost+' FLUX CORES'),'Entry prompt uses same quote');
    const actualAvailable=controller.context.availableFluxCores;
    controller.context.availableFluxCores=()=>cost-1;
    const walletBefore=SaveSystem.getWalletSnapshot().fluxCores,roundBefore=arena.roundFluxCores;
    check(!controller.tryEnter(),'Insufficient funds denied');
    check(SaveSystem.getWalletSnapshot().fluxCores===walletBefore&&arena.roundFluxCores===roundBefore,'Denial leaves funds unchanged');
    check(metrics.at(-1).cost===cost&&controller.hud.detail.text.includes('/ '+cost),'Denial and telemetry use quote');
    controller.context.availableFluxCores=actualAvailable;
    arena.roundFluxCores=15;arena.refreshHudWallet();
    const before=SaveSystem.getWalletSnapshot().fluxCores+arena.roundFluxCores;
    check(controller.tryEnter(),'Paid entry accepted');
    check(before-SaveSystem.getWalletSnapshot().fluxCores-arena.roundFluxCores===cost,'Displayed price equals actual combined-wallet deduction',cost);
    check(!controller.tryEnter(),'Repeated confirmation cannot double-charge');
    controller.launchActive();check(request.cost===cost&&metrics.filter(e=>e.cost!==undefined).every(e=>e.cost===cost),'Session and all fee telemetry preserve exact quote');
    controller.destroy();arena.player.setVisible(true).setActive(true).setAlpha(1).setScale(1);
   }
   for(const cost of [0,34,91,NaN,Infinity,35.5])check(!arena.spendAnomalyEntryCost(cost),'Transaction rejects invalid direct fee',String(cost));
   report.walletAfter=SaveSystem.getWalletSnapshot();
  }catch(e){report.errors.push(String(e.stack??e));}
  finally{if(arena?.sys.isActive())game.scene.stop('arena');report.running=false;}
 })();return 'Anomaly pricing audit started';
})();
