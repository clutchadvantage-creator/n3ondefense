(() => {
  const game=n3onGame, wait=ms=>new Promise(r=>setTimeout(r,ms));
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[]};
  const check=(ok,label,detail)=>{report.cases.push({ok:!!ok,label,detail});if(!ok)throw new Error(label);};
  const oldPads=Object.getOwnPropertyDescriptor(navigator,'getGamepads');
  report.promise=(async()=>{
    let garage;
    try {
      const {SaveSystem}=await import('/src/game/systems/SaveSystem.ts');
      const {TUTORIAL_SEQUENCES}=await import('/src/game/tutorial/TutorialRegistry.ts');
      const navModule = performance.getEntriesByType('resource').findLast(e=>e.name.includes('/src/game/input/UiNavigationController.ts?t='))?.name
        ?? '/src/game/input/UiNavigationController.ts';
      const {UiNavigationController}=await import(navModule);
      SaveSystem.createProfile(`Exchange ${Date.now().toString().slice(-7)}`);
      SaveSystem.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;p.completedSequences=TUTORIAL_SEQUENCES.map(s=>s.id);});
      SaveSystem.addCredits(50000);
      for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);
      game.scene.start('garage');await wait(400);garage=game.scene.getScene('garage');
      const open=()=>{garage.exchangeSource='credits';garage.exchangeTarget='coreTokens';garage.exchangeAmount=200;garage.exchangeInitialBatch=true;garage.showCurrencyExchange();};
      open();await wait(150);
      const controls=()=>garage.overlay.list.filter(o=>o.type==='Container'&&o.getByName('button-label'));
      const button=label=>controls().find(o=>o.getByName('button-label').text===label);
      const click=label=>button(label).getByName('button-hit').emit('pointerdown');
      for(const [label,amount] of [['+STEP',400],['-STEP',200]]){click(label);check(garage.exchangeAmount===amount,`${label} single press`,garage.exchangeAmount);}
      open();for(const [label,amount] of [['x10',2000],['x10',4000],['x5',5000],['+STEP',5200],['-STEP',5000]]){click(label);check(garage.exchangeAmount===amount,`${label} cumulative ${amount}`);}
      const hold=async(label,ms)=>{const p={isDown:true,id:0};button(label).getByName('button-hit').emit('pointerdown',p);await wait(ms);return p;};
      let p=await hold('+STEP',700);const heldAmount=garage.exchangeAmount;
      check(heldAmount>5200,'pointer hold repeats after delay',heldAmount);
      p.isDown=false;garage.input.emit('pointerup',p);await wait(200);
      check(garage.exchangeAmount===heldAmount,'release immediately stops repeat');
      p=await hold('-STEP',550);check(garage.exchangeAmount<heldAmount-200,'negative hold repeats');
      button('-STEP').getByName('button-hit').emit('pointerout');const left=garage.exchangeAmount;await wait(160);check(garage.exchangeAmount===left,'pointer leaving cancels hold');p.isDown=false;
      p=await hold('+STEP',400);game.events.emit(Phaser.Core.Events.BLUR);const blurred=garage.exchangeAmount;await wait(160);check(garage.exchangeAmount===blurred,'blur cancels pointer hold');p.isDown=false;
      const activeRoot=garage.overlay;p=await hold('+STEP',400);garage.closeOverlay();const closed=garage.exchangeAmount;await wait(180);check(garage.exchangeAmount===closed&&!activeRoot.scene,'closing during hold retires repeat owner');p.isDown=false;
      open();const listeners={up:garage.input.listenerCount('pointerup'),update:garage.events.listenerCount('update'),blur:game.events.listenerCount('blur')};
      for(let i=0;i<4;i++){garage.closeOverlay();open();}
      check(JSON.stringify(listeners)===JSON.stringify({up:garage.input.listenerCount('pointerup'),update:garage.events.listenerCount('update'),blur:game.events.listenerCount('blur')}),'reopening does not accumulate repeat listeners');
      p=await hold('+STEP',400);click('SWAP');const swapped=garage.exchangeAmount;await wait(160);check(garage.exchangeAmount===swapped,'pair changes cancel old hold');p.isDown=false;
      open();const pad={id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),timestamp:0};
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{pad.timestamp=performance.now();return [pad];}});
      await wait(100);const nav=UiNavigationController.get().layers.find(l=>l.id==='phaser:garage');
      const plusId=[...nav.labels].find(([,label])=>label==='+STEP')?.[0];
      check(!!plusId&&nav.manager.focus(plusId),'controller focuses Step');
      pad.buttons[0]={pressed:true,touched:true,value:1};await wait(720);const controlled=garage.exchangeAmount;
      check(controlled>400,'controller confirm hold repeats', {controlled,hasFocus:document.hasFocus()});
      pad.buttons[0]={pressed:false,touched:false,value:0};await wait(200);check(garage.exchangeAmount===controlled,'controller release stops repeat');
      click('MAX');const maximum=garage.exchangeAmount;click('+STEP');check(garage.exchangeAmount===maximum&&maximum<=SaveSystem.getWalletSnapshot().credits,'maximum is affordable and cannot be exceeded');
      check(garage.overlay.getByName('exchange-amount').text===maximum.toLocaleString(),'amount display stays synchronized');
      const walletBefore=SaveSystem.getWalletSnapshot();click('CONFIRM SECURE EXCHANGE');const walletAfter=SaveSystem.getWalletSnapshot();
      check(walletBefore.credits-walletAfter.credits===maximum&&walletAfter.coreTokens-walletBefore.coreTokens===maximum/200,'displayed quote matches executed transaction');
      const amount=garage.exchangeAmount;click('+STEP');check(garage.exchangeAmount===amount,'wallet below one batch disables adjustment');
      report.cases.push({label:'exchange-console',png:await new Promise(r=>game.renderer.snapshot(img=>r(img.src)))});
      garage.closeOverlay();await wait(100);
      check(garage.input.listenerCount('pointerup')===listeners.up-2&&game.events.listenerCount('blur')===listeners.blur-2,'console closure removes both pointer repeat listeners');
    }catch(e){report.errors.push(String(e.stack??e));}
    finally{garage?.closeOverlay();if(oldPads)Object.defineProperty(navigator,'getGamepads',oldPads);else delete navigator.getGamepads;report.running=false;}
  })();return {started:true};
})();
