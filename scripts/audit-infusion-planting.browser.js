// Run after audit-infusion-overhaul.browser.js in an isolated normal Arena fixture.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],errors:[]};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  try{
    const {a,Turret,pad,far}=globalThis.__infusionFixture,player=a.player;
    const site=a.bombSites.sites.find(s=>a.bombSites.canPlant(s));check(site,'available real bombsite');
    a.clearRoundInfusionEffects();a.updateSystemInfusions(a.time.now,.016);const runtime=a.systemInfusions;
    const turret=p=>{const t=new Turret(a,p.x,p.y,0x70ffdf,500,30,3,500);a.turrets.push(t);return t;};
    const near=turret({x:site.x+50,y:site.y}),other=turret(far);
    turret({x:site.x-50,y:site.y}); // Ascension is available too: E must never sacrifice these.
    let now=a.time.now+500;
    for(const [device,target] of [['keyboardMouse',near],['keyboardMouse',other],['gamepad',other]]){
      player.body.reset(site.x,site.y);runtime.reset();a.playerInput.clear();a.playerInput.adoptDevice(device);
      a.playerInput.fixedKeys.interact.isDown=false;pad.buttons[0]={pressed:false,value:0,touched:false};
      pad.axes[2]=pad.axes[3]=0;a.playerInput.update('gameplay');
      runtime.update(now+=120,.016,target.sprite,{pressed:false,held:false,released:false,prompt:'C'});
      check(runtime.selection?.target===target,device+': turret remains selected beside planting site');
      a.aimWorldPoint.set(target.sprite.x,target.sprite.y);
      if(device==='keyboardMouse')a.playerInput.fixedKeys.interact.isDown=true;
      else pad.buttons[0]={pressed:true,value:1,touched:true};
      for(let i=0;i<10;i++){
        a.playerInput.update('gameplay');a.updateSystemInfusions(now+=120,.12);a.updatePlanting(120);
        check(player.x===site.x&&player.y===site.y&&!a.possession,device+': planting hold cannot teleport or possess '+i);
      }
      check(a.plantingProgressMs===1200&&a.activePlantingSite===site,device+': planting progresses despite selected turret');
      check(a.turrets.every(t=>t.hp>0),device+': planting preserves turrets');
      a.playerInput.fixedKeys.interact.isDown=false;pad.buttons[0]={pressed:false,value:0,touched:false};a.playerInput.update('gameplay');
      a.updateSystemInfusions(now+=120,.12);a.updatePlanting(16);
      check(player.x===site.x&&player.y===site.y&&!a.possession,device+': releasing Plant cannot trigger Infusion tap');
    }
    // Explicit C press/release still teleports with the shared tap/hold turret actions.
    a.playerInput.adoptDevice('keyboardMouse');a.aimWorldPoint.set(near.sprite.x,near.sprite.y);runtime.reset();
    a.playerInput.fixedKeys.infusion.isDown=true;a.playerInput.update('gameplay');a.updateSystemInfusions(now+=120,.016);
    check(a.infusionHint.text.includes('C'),'keyboard Infusion prompt uses C');
    check(a.infusionInteracting,'explicit Infusion input owns its activation');
    a.playerInput.fixedKeys.infusion.isDown=false;a.playerInput.update('gameplay');a.updateSystemInfusions(now+=120,.016);
    check(Math.hypot(player.x-site.x,player.y-site.y)>5,'C activates selected turret teleport');
    // Finish a real bomb plant while its turret reticle stays selected.
    player.body.reset(site.x,site.y);runtime.reset();a.aimWorldPoint.set(other.sprite.x,other.sprite.y);
    a.playerInput.fixedKeys.interact.isDown=true;
    for(let i=0;i<60&&!site.activeBomb;i++){
      a.playerInput.update('gameplay');a.updateSystemInfusions(now+=120,.12);a.updatePlanting(120);
    }
    check(site.activeBomb&&player.x===site.x&&player.y===site.y,'E completes bomb arming without teleporting');
    a.playerInput.fixedKeys.interact.isDown=false;a.playerInput.update('gameplay');
    report.cases.push({name:'selected turret and bomb planting input separation'});
  }catch(error){report.errors.push(String(error.stack??error));}
  finally{report.running=false;}
  return {started:true};
})();
