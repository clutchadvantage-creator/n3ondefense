// Isolated DEV profile. Short assisted integration checks, not an unassisted campaign.
(() => {
  if(globalThis.__n3onLayoutAudit?.running||globalThis.__n3onMixedSession?.running)throw Error('Another fixture is running');
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],samples:[],errors:[],startedAt:new Date().toISOString()};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const until=async(fn,label)=>{const end=performance.now()+18000;while(!fn()){if(performance.now()>end)throw Error('Timeout: '+label);await wait(40);}};
  const game=globalThis.n3onGame;
  report.promise=(async()=>{
    try{
      const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
      const dep=name=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+name+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
      const {SaveSystem:S}=await import(dep('SaveSystem'));
      const {RunTransitionManager:T}=await import(dep('RunTransitionManager'));
      const {getCampaignProtocol}=await import('/src/game/progression/CampaignProgression.ts');
      for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
      await wait(150);
      check(S.createProfile('Portal '+Date.now().toString().slice(-7)).ok,'isolated profile');
      S.setSettings({masterVolume:0,contextualTutorials:false});
      S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
      S.addFluxCores(1000);
      const cases=[['normal',4]];
      for(const [mode,round] of cases){
        for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
        await wait(100);game.scene.start('menu');await wait(100);
        const menu=game.scene.keys.menu;T.clearForMenu(menu);
        const session={baseSeed:550055,round,protocol:getCampaignProtocol(mode,round),objectiveMode:'open',
          equippedMods:(mode==='supreme'?['calibrated-barrel','sentry-dominion','magnetic-service','supreme-crown-of-stars','supreme-singularity-chamber']:
            ['split-current','sentry-dominion','magnetic-service','calibrated-barrel','cycling-servo']).map(id=>({id,rank:3})),modsEarned:[]};
        T.requestArenaTransition(menu,{reason:'new-run',session});
        await until(()=>game.scene.isActive('loading')&&T.snapshot(game.scene.keys.loading).lastStep==='awaiting-user-deploy-confirmation','deployment');
        game.scene.keys.loading.confirmDeployment(session,'new-run');
        await until(()=>game.scene.isActive('arena')&&game.scene.keys.arena.roundRuntime?.phase==='active','Arena');
        const a=game.scene.keys.arena;
        a.pointerLock.hidePrompt();a.player.invulnUntil=Infinity;
        // Hold a real simulated controller so the headless capture gate can stay open.
        const pads=navigator.getGamepads;
        const pad={id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:performance.now()};
        navigator.getGamepads=()=>[pad];a.playerInput.adoptDevice('gamepad');
        if(a.state.state==='Paused')a.resumeGameplay();
        await wait(160);
        a.scene.pause();
        const {SeededRandom}=await import('/src/game/systems/SeededRandom.ts');
        const seedFor=id=>{
          for(let seed=1;seed<10000;seed++){
            const r=new SeededRandom((seed^Math.imul(1,0x6d2b79f5)^0xa1104a1f)>>>0);
            r.float(72000,138000);
            if(r.bool(.1)&&(r.next()<.5?'heist':'skybreach')===id)return seed;
          }
          throw Error('No selected seed');
        };
        for(const [stage,id] of [['arena-teaching','heist'],['waiting-for-garage','skybreach'],['waiting-for-store','heist']]){
          S.updateTutorialProgress(p=>{p.firstRunStage=stage;p.replaySequenceId='onboarding.tactics';});
          a.anomalyController.destroy();a.anomalyController=null;a.anomalyOpportunityMs=0;
          const seed=seedFor(id);a.createAnomalyController(1,seed);
          const c=a.anomalyController;
          check(c.options.enabled,stage+': no teaching/replay gate');
          // Due now, but the actual seeded chance, type choice, and real placement still run.
          c.update(16);
          check(c.state==='charging'&&c.activeAnomalyId===id,stage+': natural '+id+' signal at round 1');
          for(let k=0;k<c.chargeTarget;k++)c.handleEnemyKilled(c.visual.x,c.visual.y);
          check(c.state==='portal-ready'&&c.cost>=35&&c.cost<=90,stage+': kill charge opens valid portal');
          c.stop('round-ended');
          check(c.remainingOpportunityMs===330000,stage+': retired signal starts existing cooldown');
          c.update(250);c.stop('round-ended');
          check(c.remainingOpportunityMs===329750,stage+': repeated cleanup does not reset cooldown');
          report.cases.push({stage,id,seed,cost:c.cost});
        }
        a.anomalyController.destroy();a.anomalyController=null;a.anomalyOpportunityMs=60000;
        a.createAnomalyController(4,550055);
        let c=a.anomalyController;
        for(let i=0;i<80;i++)c.update(250);
        check(c.remainingOpportunityMs===40000,'20 seconds reduce carried delay');
        const oldBoss=a.bossEncounter;a.bossEncounter={};
        for(let i=0;i<80;i++)c.update(250);
        check(c.remainingOpportunityMs===40000,'boss exclusion holds timer');a.bossEncounter=oldBoss;
        const oldArcade=a.arcadeController;a.arcadeController={activeEventId:'redline'};
        for(let i=0;i<80;i++)c.update(250);
        check(c.remainingOpportunityMs===40000,'Arcade event holds timer');a.arcadeController=oldArcade;
        c.stop('round-ended');c.destroy();
        check(c.remainingOpportunityMs===40000,'waiting timer survives stop and destroy');
        S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.replaySequenceId=null;});
        const def=a.roundManager.currentDefinition();
        const payload={...session,runStartedAt:a.runStartedAt,completedRound:4,completedSeed:def.seed,completedTemplate:def.template,
          nextRound:5,nextSeed:def.seed+1,nextTemplate:def.template,creditsGained:0,coreTokensGained:0,plasmaChipsGained:0,fluxCoresGained:0,
          bossDefeated:null,modFocus:null,contract:null,creditsSpentBeforeRun:0,upgradeCompletionPercentage:0,accountProgressionTier:'new',runCreditsEarned:0};
        a.presentCompletedRound(payload);
        await until(()=>game.scene.isActive('round-finished'),'debrief');
        const finish=game.scene.keys['round-finished'];
        const saved=game.registry.get('round-finished');
        check(saved.anomalyOpportunityMs===40000,'debrief carries remaining countdown');
        const flatten=o=>[o,...(o.list||[]).flatMap(flatten)];
        const label=finish.children.list.flatMap(flatten).find(o=>o.text==='CONTINUE TO NEXT ROUND');
        check(!!label,'actual Continue action found');
        const button=label.parentContainer;
        const hit=button.list.find(o=>o.input?.enabled);
        (hit||button).emit('pointerdown');
        await until(()=>game.scene.isActive('arena')&&game.scene.keys.arena.roundManager?.round===5,'Continue to boss round');
        const bossArena=game.scene.keys.arena;
        check(bossArena.anomalyOpportunityMs===40000,'Continue/Loading/Arena keep countdown through boss round');
        check(bossArena.bossEncounter||bossArena.bossFlowPhase!=='none','boss round remains boss-owned');
        game.scene.stop('arena');
        navigator.getGamepads=pads;
      }
    }catch(error){report.errors.push(String(error.stack||error));}
    finally{report.running=false;report.finishedAt=new Date().toISOString();}
  })();
})();
