// Isolated DEV browser only. Real Arena entities/ports with controlled combat fixtures.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],samples:[],errors:[],startedAt:new Date().toISOString()};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(value,label)=>{report.checks.push({ok:!!value,label});if(!value)throw Error(label);};
  const until=async(fn,label)=>{for(let i=0;i<450;i++){if(fn())return;await wait(40);}throw Error('Timeout '+label);};
  report.promise=(async()=>{
    try {
      const game=globalThis.n3onGame;
      const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
      const dep=name=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+name+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
      const {SaveSystem:S}=await import(dep('SaveSystem'));
      const {RunTransitionManager:T}=await import(dep('RunTransitionManager'));
      const {Turret}=await import(dep('Turret')),{Fence}=await import(dep('Fence'));
      const {MOD_DEFINITIONS}=await import('/src/game/mods/definitions.ts');
      const {NORMAL_MOD_SLOTS}=await import('/src/game/mods/types.ts');
      const {ModRuntime}=await import(dep('ModRuntime'));
      const {getCampaignProtocol}=await import('/src/game/progression/CampaignProgression.ts');
      const ids=['relay-jump','gridlink','fence-rail','ascension-protocol','target-designator'];
      const used=new Set();
      const equippedMods=NORMAL_MOD_SLOTS.map((slot,i)=>{const d=MOD_DEFINITIONS.find(d=>!used.has(d.id)&&d.category===(slot==='wildcard'?'utility':slot)&&!['legendary','supreme'].includes(d.rarity));used.add(d.id);return {id:d.id,rank:0,slot,infusionId:ids[i]};});
      for(const scene of game.scene.getScenes(false))game.scene.stop(scene.scene.key);
      await wait(100);check(S.createProfile('Infusions '+Date.now().toString().slice(-7)).ok,'isolated profile');
      S.setSettings({masterVolume:0,contextualTutorials:false});S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
      game.scene.start('menu');await wait(100);const menu=game.scene.keys.menu;T.clearForMenu(menu);
      const mode=globalThis.__infusionTestMode??'normal',round=globalThis.__infusionTestRound??14;
      const session={baseSeed:550055,round,protocol:getCampaignProtocol(mode,round),objectiveMode:'open',equippedMods,modsEarned:[]};
      T.requestArenaTransition(menu,{reason:'new-run',session});
      await until(()=>game.scene.isActive('loading')&&T.snapshot(game.scene.keys.loading).lastStep==='awaiting-user-deploy-confirmation','deploy');
      game.scene.keys.loading.confirmDeployment(session,'new-run');
      await until(()=>game.scene.isActive('arena')&&game.scene.keys.arena.roundRuntime?.phase==='active','arena');
      const a=game.scene.keys.arena;globalThis.__infusionArena=a;
      const pad=globalThis.__infusionPad={id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:1};
      navigator.getGamepads=()=>[pad];a.playerInput.adoptDevice('gamepad');a.pointerLock.hidePrompt();
      if(a.bossFlowPhase==='intro')a.startBossCombat();
      if(a.state.state==='Paused')a.resumeGameplay();
      await wait(200);game.scene.pause('arena');a.physics.pause();
      a.updateSystemInfusions(a.time.now,.016);
      check(a.systemInfusions&&a.modRuntime.getActiveInfusions().length===5,'real five-slot build activates runtime');
      const runtime=a.systemInfusions,player=a.player,originalHp=player.hp;
      const points=[];const bounds=a.layout.generation.bounds;
      for(let y=bounds.y+100;y<bounds.y+bounds.h-160;y+=55)for(let x=bounds.x+100;x<bounds.x+bounds.w-260;x+=55)
        if(a.infusionLandingValid({x,y})&&!a.intersectsWallGeometry(x,y,40,40))points.push({x,y});
      check(points.length>1,'clear fixture locations');
      const anchor=points.find(p=>!a.intersectsWallGeometry(p.x+100,p.y+50,130,85));check(anchor,'clear turning rail fixture');
      const far=points.reduce((best,p)=>Math.hypot(p.x-anchor.x,p.y-anchor.y)>Math.hypot(best.x-anchor.x,best.y-anchor.y)?p:best,anchor);
      player.body.reset(anchor.x,anchor.y);
      const turret=p=>{const t=new Turret(a,p.x,p.y,0x70ffdf,500,30,3,500);a.turrets.push(t);return t;};
      const near=turret({x:anchor.x+65,y:anchor.y}),distant=turret(far);
      let now=a.time.now+100;
      const input=(aim,pressed=false,held=false,released=false,direction=undefined)=>runtime.update(now+=120,.016,aim,{pressed,held,released,prompt:'C',aimDirection:direction});
      input(distant.sprite);check(runtime.selection?.target===distant,'distant turret selected');
      input({x:-100,y:-100});check(runtime.selection?.target===distant,'target persists off aim');
      a.infusionReticle.update(now,runtime);check(a.infusionReticle.graphic.visible&&a.infusionReticle.graphic.depth<distant.sprite.depth,'reticle on floor below turret');
      input({x:-100,y:-100},true,true);check(Math.hypot(player.x-far.x,player.y-far.y)<90&&Math.hypot(anchor.x-far.x,anchor.y-far.y)>800,'teleport across arena');
      check(!runtime.selection,'consumed reticle clears');
      now+=5100;input(near.sprite);near.hp=0;input({x:-100,y:-100});check(runtime.selection?.target===distant,'destroyed target reassigns');
      distant.hp=0;input({x:-100,y:-100});check(!runtime.selection,'last turret clears');
      a.turrets.forEach(t=>t.destroy());a.turrets=[];
      runtime.reset();player.body.reset(anchor.x,anchor.y);
      const fence=(x1,y1,x2,y2)=>{const f=new Fence(a,(x1+x2)/2,(y1+y2)/2,Math.atan2(y2-y1,x2-x1),0x70ffdf,Math.hypot(x2-x1,y2-y1),60000,500,25,.6);a.fences.push(f);return f;};
      const first=fence(anchor.x,anchor.y,anchor.x+100,anchor.y),second=fence(anchor.x+100,anchor.y+100,anchor.x+200,anchor.y+100);
      runtime.refreshNetwork(a.time.now);check(runtime.generatedLinks.length===1,'real connected link created');
      // Real keyboard action buffer, no extra rail interaction or destination.
      a.playerInput.adoptDevice('keyboardMouse');a.playerInput.fixedKeys.infusion.isDown=true;a.playerInput.update('gameplay');
      a.aimWorldPoint.set(first.x1,first.y1);a.updateSystemInfusions(a.time.now,.016);
      a.playerInput.fixedKeys.infusion.isDown=false;a.playerInput.update('gameplay');
      check(runtime.railActive&&player.railInvulnerable,'single keyboard C enters protected rail');
      for(const source of ['contact','projectile','laser','bomblet','fire','explosion']){player.invulnUntil=0;check(!player.takeDamage(10)&&player.hp===originalHp,'rail ignores '+source);}
      a.playerInput.move.x=1;a.updatePlayerMovement(now);check(player.body.velocity.lengthSq()===0,'movement input cannot break rail');
      const path=[];for(let i=0;i<60&&runtime.railActive;i++){runtime.update(a.time.now,.01,{x:-10,y:-10},{pressed:true,held:true,released:false,prompt:'C'});path.push({x:player.x,y:player.y});}
      check(path.some(p=>p.x>anchor.x+95&&p.y>anchor.y+20&&p.y<anchor.y+90),'rail follows generated connector');
      check(!runtime.railActive&&!player.railInvulnerable&&player.visible,'automatic exit restores state');
      player.invulnUntil=0;check(player.takeDamage(1)&&player.hp===originalHp-1,'damage restored immediately after rail');player.hp=originalHp;
      runtime.reset();runtime.refreshNetwork(a.time.now);player.body.reset(first.x1+40,first.y1+40);
      a.playerInput.clear();a.playerInput.adoptDevice('gamepad');pad.axes[2]=-.71;pad.axes[3]=-.71;pad.buttons[11]={pressed:true,value:1,touched:true};a.playerInput.update('gameplay');
      a.updateSystemInfusions(a.time.now,.016);check(runtime.railActive&&player.railInvulnerable,'single controller interaction enters rail');
      pad.buttons[11]={pressed:false,value:0,touched:false};pad.axes[2]=pad.axes[3]=0;a.playerInput.update('gameplay');
      const pausedRail={x:player.x,y:player.y};await wait(60);check(player.x===pausedRail.x&&player.y===pausedRail.y,'paused rail remains attached without advancing');
      runtime.generatedLinks[0].fence.hp=0;runtime.update(a.time.now,.1,{x:-10,y:-10},{pressed:false,held:false,released:false,prompt:'RS'});
      check(!runtime.railActive&&!player.railInvulnerable&&player.x===first.x2&&player.y===first.y2,'broken upcoming connector stops at last node and clears immunity');
      runtime.reset();runtime.refreshNetwork(a.time.now);
      // Every fan descendant traverses/splits at generated geometry with its history intact.
      const link=runtime.generatedLinks[0].fence;
      for(const angle of [-.45,0,.45])for(let volley=0;volley<3;volley++){
        const spawned=[];
        const x=(link.x1+link.x2)/2,y=(link.y1+link.y2)/2;
        const p=a.obtainProjectile({x,y,texture:'circle',width:8,height:8,tint:0xffffff,rotation:angle,velocityX:300*Math.cos(angle),velocityY:300*Math.sin(angle),depth:8,damage:10,from:'player',lifeMs:1000,trailColor:0xffffff,crossedFences:new Set([first]),previousX:x-10,previousY:y-10});
        check(a.splitProjectileAtFence(p,spawned)===2&&spawned.every(s=>s.from==='player'&&s.crossedFences.has(link)&&s.crossedFences.has(first)),`fan descendants pass connected segment ${angle}/${volley}`);
        a.retireProjectile(p);spawned.forEach(p=>a.retireProjectile(p));
      }
      const oldMods=a.modRuntime;
      a.modRuntime=new ModRuntime(S.getModCollection(),equippedMods.map(m=>m.infusionId==='gridlink'?{...m,infusionId:undefined}:m),a.protocol);
      runtime.refreshNetwork(a.time.now);check(runtime.generatedLinks.length===0,'unequipped Gridlink removes generated geometry');
      const inactive=a.obtainProjectile({x:(link.x1+link.x2)/2,y:(link.y1+link.y2)/2,texture:'circle',width:8,height:8,tint:0xffffff,rotation:0,velocityX:300,velocityY:0,depth:8,damage:10,from:'player',lifeMs:1000,trailColor:0xffffff});
      check(a.splitProjectileAtFence(inactive,[])===0,'inactive Gridlink cannot split fan shots at removed links');a.retireProjectile(inactive);a.modRuntime=oldMods;
      // Remove linked network before chassis tests.
      runtime.reset();a.fences.forEach(f=>f.destroy());a.fences=[];
      player.body.reset(anchor.x,anchor.y);player.invulnUntil=0;
      const oldRandom=Math.random;
      for(const [index,archetype] of ['artillery','storm-mage','void-brawler'].entries()){
        report.current=archetype;player.body.reset(anchor.x,anchor.y);
        const turrets=[turret({x:anchor.x+50,y:anchor.y}),turret({x:anchor.x+70,y:anchor.y+30}),turret({x:anchor.x+30,y:anchor.y+30})];
        let forceChoice=true;Math.random=()=>{if(forceChoice){forceChoice=false;return (index+.1)/3;}return oldRandom();};
        try { check(runtime.ascend(turrets[0],a.time.now),archetype+': sacrifice activation'); } finally { Math.random=oldRandom; }
        const encounter=a.possession,boss=encounter?.boss;
        check(a.possessionRemainingMs===60000,archetype+': full minute duration');
        check(boss?.archetype===archetype&&boss.faction==='player'&&boss.ownerId==='operative',archetype+': real player-owned boss');
        check(turrets.every(t=>t.hp===0)&&!player.visible&&!player.body.enable&&player.combatBody===boss,archetype+': transfer and sacrifice');
        const hp=boss.hp;player.takeDamage(27);check(boss.hp===hp-27&&player.hp===originalHp,archetype+': incoming damage uses integrity');
        const before=a.projectiles.length,aim={x:boss.x+240,y:boss.y};
        encounter.updateControlled(1500,{move:{x:1,y:0},aim,primary:true,secondary:false});
        encounter.updateControlled(500,{move:{x:1,y:0},aim,primary:false,secondary:false});
        check(boss.body.velocity.x>0,archetype+': direct movement');
        if(archetype!=='void-brawler')check(a.projectiles.length>before&&a.projectiles.slice(before).every(p=>p.from==='player'&&p.telemetryOwner==='weapon'),archetype+': player-owned primary');
        else check(encounter.lastContactAt>=0,archetype+': primary slam');
        encounter.updateControlled(9000,{move:{x:0,y:0},aim,primary:false,secondary:true});
        check(archetype==='artillery'?encounter.lastRocketAt>0:archetype==='storm-mage'?encounter.mageSuperVolleyAt>0:encounter.pounceStartsAt>0,archetype+': secondary');
        a.updateHud(a.time.now);check(a.hudPayload.healthLabel?.includes('CHASSIS INTEGRITY')&&a.hudPayload.maxHp===boss.maxHp,archetype+': chassis HUD');
        const timer=a.possessionRemainingMs;await wait(80);check(a.possessionRemainingMs===timer,archetype+': paused timer remains frozen');
        if(index===1)boss.takeDamage(boss.hp);else {
          a.updatePossession(a.time.now,30000);check(a.possession===encounter&&a.possessionRemainingMs===30000,archetype+': still controlled after old 20-second limit');
          a.updatePossession(a.time.now,29999);check(a.possession===encounter&&a.possessionRemainingMs===1,archetype+': controlled until full minute');
        }
        a.updatePossession(a.time.now,16);
        check(!a.possession&&!player.combatBody&&player.visible&&player.body.enable&&player.hp===originalHp,archetype+': safe restoration');
        check(!a.intersectsWallGeometry(player.x,player.y,24,24)&&!boss.active,archetype+': no orphan or invalid landing');
        runtime.reset();a.turrets.forEach(t=>t.destroy());a.turrets=[];
      }
      a.clearRoundInfusionEffects();check(!a.infusionReticle&&!a.systemInfusions&&!a.possession&&!player.railInvulnerable,'round cleanup owns all new state');
      report.cases.push({mode,round,checks:report.checks.length});
      globalThis.__infusionFixture={a,Turret,Fence,anchor,far,pad,ModRuntime,S,equippedMods};
    } catch(error){report.errors.push(String(error.stack??error));}
    finally {report.running=false;report.finishedAt=new Date().toISOString();}
  })();
  return {started:true};
})();
