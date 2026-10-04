// Isolated profile; storage failure injection is restored in finally.
(() => {
  if(globalThis.__n3onLayoutAudit?.running)throw Error('Another fixture is running');
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],errors:[]};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const game=globalThis.n3onGame;
  report.promise=(async()=>{
    const write=Storage.prototype.setItem;
    try{
      const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
      const path=source.match(/import\s*\{[^}]*\bSaveSystem\b[^}]*\}\s*from\s*["']([^"']+)/)[1];
      const {SaveSystem:S}=await import(path);
      for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);
      await wait(120);
      check(S.createProfile('Cards '+Date.now().toString().slice(-7)).ok,'isolated card profile');
      S.setSettings({masterVolume:0,contextualTutorials:false});
      S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
      const profile=S.getActiveProfileSummary().id;
      const exportSave=()=>S.exportProfile(profile).file.save;
      check(!S.purchaseAccessCard('heist').ok,'insufficient credits rejected');
      S.addCredits(200000);
      const before=exportSave();
      Storage.prototype.setItem=function(key,value){if(key.endsWith('.profile.'+profile))throw Error('fixture quota failure');return write.call(this,key,value);};
      check(!S.purchaseAccessCard('heist').ok,'persistent write failure rejects purchase');
      check(S.get().credits===200000&&S.getAccessCards().owned.heist===0,'failed purchase changes neither credits nor ownership');
      check(JSON.stringify(exportSave().accessCards)===JSON.stringify(before.accessCards),'failed purchase leaves persisted inventory intact');
      Storage.prototype.setItem=write;
      game.scene.start('upgrades');await wait(350);
      const access=()=>document.querySelector('[data-controller-focus-id="store-category-access-cards"]');
      check(!!access(),'Upgrades contains Access Cards category');access().click();
      check(document.querySelectorAll('.anomaly-access-card').length===2,'both premium consumable cards rendered');
      document.querySelector('[data-controller-focus-id="buy-access-heist"]').click();
      document.querySelector('[data-controller-focus-id="buy-access-skybreach"]').click();
      document.querySelector('[data-controller-focus-id="buy-access-heist"]').click();
      check(S.get().credits===50000&&S.getAccessCards().purchases===3,'store charges 50,000 per card and counts combined purchases');
      check([...document.querySelectorAll('.access-card-panel button')].every(b=>b.disabled),'store disables purchases at combined cap');
      check(exportSave().accessCards.owned.heist===2&&exportSave().accessCards.owned.skybreach===1,'purchases reach real profile storage');
      S.selectProfile(profile);check(S.getAccessCards().owned.heist===2,'inventory survives profile reload');
      check(!S.useAccessCard('heist','anomaly:heist').ok,'repeat protection rejects card without consuming');
      Storage.prototype.setItem=function(key,value){if(key.endsWith('.profile.'+profile))throw Error('fixture quota failure');return write.call(this,key,value);};
      check(!S.useAccessCard('heist').ok,'persistent failure rejects use');
      check(S.getAccessCards().owned.heist===2&&S.getAccessCards().uses===0,'failed use restores card and daily quota');
      Storage.prototype.setItem=write;
      check(S.useAccessCard('heist').ok&&S.useAccessCard('skybreach').ok&&S.useAccessCard('heist').ok,'combined three uses persist');
      const exhausted=exportSave();exhausted.accessCards.owned.heist=2;
      check(S.importProfile(exhausted,'replace',profile).ok,'fixture gives spare owned cards for cap check');
      check(!S.useAccessCard('heist').ok&&S.getAccessCards().owned.heist===2,'fourth use blocked despite ownership');
      const yesterday=exportSave();yesterday.accessCards.day=new Date(Date.now()-86400000).toISOString().slice(0,10);
      check(S.importProfile(yesterday,'replace',profile).ok,'prior day profile reload');
      check(S.getAccessCards().purchases===0&&S.getAccessCards().uses===0&&S.getAccessCards().owned.heist===2,'both daily quotas reset without losing owned cards');
      check(S.purchaseAccessCard('skybreach').ok&&S.useAccessCard('heist').ok,'new day allows both purchase and use');
      document.querySelectorAll('.store-mode-tab')[1].click();
      check(!access(),'Cosmetics does not list Access Cards');
      document.querySelectorAll('.store-mode-tab')[0].click();access().click();
      check(document.querySelector('.access-card-panel').textContent.includes('1 / 3 purchased'),'reopened panel displays updated day counters');
      report.cases.push({name:'store persistence, failure rollback, caps and daily reset',passed:true});
    }catch(error){report.errors.push(String(error.stack??error));}
    finally{Storage.prototype.setItem=write;report.running=false;}
  })();return {started:true};
})();
