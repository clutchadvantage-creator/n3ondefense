(() => {
  const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],startedAt:new Date().toISOString()};
  const check=(ok,label,detail)=>{report.cases.push({ok:!!ok,label,detail});if(!ok)throw new Error(label);};
  const size={width:game.scale.width,height:game.scale.height};
  const parent=game.scale.parent,parentStyle={width:parent.style.width,height:parent.style.height};
  const resize=(width,height)=>{parent.style.width=`${width}px`;parent.style.height=`${height}px`;game.scale.resize(width,height);game.scale.refresh();};
  const pads=Object.getOwnPropertyDescriptor(navigator,'getGamepads');
  const pad={id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',index:0,connected:true,mapping:'standard',axes:[0,0,1,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),timestamp:0};
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{pad.timestamp=performance.now();return [pad];}});
  report.promise=(async()=>{
    try{
      const {UiNavigationController}=await import('/src/game/input/UiNavigationController.ts');
      const {SaveSystem}=await import('/src/game/systems/SaveSystem.ts');
      const {TUTORIAL_SEQUENCES}=await import('/src/game/tutorial/TutorialRegistry.ts');
      SaveSystem.createProfile(`Resize ${Date.now().toString().slice(-7)}`);
      SaveSystem.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;p.completedSequences=TUTORIAL_SEQUENCES.map(s=>s.id);});
      for(const s of game.scene.getScenes(true))game.scene.stop(s.scene.key);
      game.scene.start('arena',{baseSeed:550055,round:68,protocol:'normal',objectiveMode:'open',runStartedAt:Date.now()});
      const arena=game.scene.getScene('arena');
      const start=performance.now();
      while(arena.roundRuntime?.phase!=='active'){if(performance.now()-start>15000)throw new Error('Arena start timeout');await wait(50);}
      arena.player.invulnUntil=Infinity;
      arena.playerInput.adoptDevice('gamepad');arena.pointerLockInitialGate=false;arena.resumeGameplay();
      arena.togglePause();arena.scene.launch('options',{returnScene:'arena',resumeGameplay:true});arena.scene.pause();await wait(350);
      let options=game.scene.getScene('options');
      const player=arena.player,roundRuntime=arena.roundRuntime,resizeListeners=game.scale.listenerCount('resize');
      for(const [width,height] of [[1280,720],[960,600],[1440,900],[960,600]]){
        options.selectTab('interface');options.scrollActiveTab(10000);
        const previous=options.scrollStates.get('interface');
        const fraction=previous.max>0?previous.offset/previous.max:0;
        resize(width,height);await wait(500);options=game.scene.getScene('options');
        check(options.sys.isActive()&&options.activeTab==='interface',`resize retains active tab at ${width}x${height}`);
        const state=options.scrollStates.get('interface');
        check(Math.abs(state.offset-fraction*state.max)<1,`resize retains scroll fraction at ${width}x${height}`,{fraction,offset:state.offset,max:state.max});
        check(options.viewport.right<=width&&options.viewport.bottom<=height,`viewport fits after resize to ${width}x${height}`,{viewport:options.viewport,width:game.scale.width,height:game.scale.height});
        check(arena.player===player&&arena.roundRuntime===roundRuntime&&arena.sys.isPaused(),`resize preserves paused round at ${width}x${height}`);
        check(game.scale.listenerCount('resize')===resizeListeners,`resize listener remains bounded at ${width}x${height}`);
        for(const tab of ['audio','gameplay','interface','profile','system']){
          options.selectTab(tab);options.scrollActiveTab(10000);
          check(options.tabContainers.get(tab).visible,`${tab} remains available at ${width}x${height}`);
        }
        const png=await new Promise(r=>game.renderer.snapshot(img=>r(img.src)));
        report.cases.push({label:`options-${width}-${height}`,png});
      }
      options.selectTab('gameplay');
      const state=options.scrollStates.get('gameplay');state.offset=0;options.applyTabScroll('gameplay');
      const nav=UiNavigationController.get().layers.find(l=>l.id==='phaser:options');
      const binding=[...nav.manager.controls.values()].find(c=>c.id==='options:gameplay:binding:mine');
      check(binding&&nav.manager.focus(binding.id),'ability binding is controller focusable');
      nav.manager.activate();check(!!options.cancelBindingCapture,'controller activates binding capture');
      nav.back();check(!options.cancelBindingCapture&&options.sys.isActive(),'controller Back cancels binding capture');
      options.selectTab('system');options.returnToMainMenu();check(!!options.quitConfirmation,'quit confirmation opens');
      resize(1280,720);await wait(500);options=game.scene.getScene('options');
      check(!!options.quitConfirmation&&arena.sys.isPaused(),'resize preserves quit confirmation without ending deployment');
      UiNavigationController.get().layers.find(l=>l.id==='phaser:options').back();
      check(!options.quitConfirmation&&options.sys.isActive(),'Back cancels resized quit confirmation');
      options.feedbackReportUi.open();await wait(50);
      const draft=document.querySelector('.feedback-dialog textarea');draft.value='Resize preserves this unsent report.';
      const oldMask=options.contentMask;
      resize(960,600);await wait(400);
      check(document.querySelector('.feedback-dialog textarea')===draft&&draft.value==='Resize preserves this unsent report.','feedback draft survives live resize');
      check(options.contentMask===oldMask,'Phaser reflow waits for the open report');
      draft.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(500);
      options=game.scene.getScene('options');
      check(!document.querySelector('.feedback-dialog')&&options.viewport.right<=960&&options.contentMask!==oldMask,'closing feedback completes pending resize');
      options.handleEscReturn();await wait(300);
      check(arena.sys.isActive()&&arena.player===player&&!arena.physics.world.isPaused,'Back after repeated resize restores the same live Arena');
      arena.quitToMenu();await wait(300);
      check(Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e.parent?.scene===options).length===0,'resized Options releases Text canvases');
    }catch(e){report.errors.push(String(e.stack??e));}
    finally{if(pads)Object.defineProperty(navigator,'getGamepads',pads);else delete navigator.getGamepads;Object.assign(parent.style,parentStyle);game.scale.resize(size.width,size.height);game.scale.refresh();report.running=false;report.finishedAt=new Date().toISOString();}
  })();return {started:true};
})();
