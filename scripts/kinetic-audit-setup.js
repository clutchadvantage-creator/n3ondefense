// Shared isolated-profile bootstrap. Invoked only by DEV browser audit scripts.
export async function kineticAuditArena(options={}) {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(fn,label)=>{const end=performance.now()+60000;while(!fn()){if(performance.now()>end)throw Error('Timeout '+label);await wait(40);}};
  await until(()=>globalThis.n3onGame?.scene.keys.menu&&globalThis.n3onGame.textures.exists('pixel'),'boot');
  const game=globalThis.n3onGame;
  const source=await fetch('/src/game/scenes/ArenaScene.ts').then(r=>r.text());
  const dep=name=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+name+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
  // Keep the exact live module URL. Vite rewrites variable imports in served
  // fixtures with ?import, which would create duplicate singleton managers.
  const moduleAt=new Function('path','return import(path)');
  const {SaveSystem:S}=await moduleAt(dep('SaveSystem')),{RunTransitionManager:T}=await moduleAt(dep('RunTransitionManager'));
  for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);
  await wait(150);
  if(!S.createProfile('Kinetic '+Date.now().toString().slice(-7)).ok)throw Error('Isolated profile');
  S.setSettings({masterVolume:0,contextualTutorials:false,particles:options.particles!==false});
  S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
  const pads=navigator.getGamepads;
  navigator.getGamepads=()=>[{id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:performance.now()}];
  game.scene.start('menu');await until(()=>game.scene.isActive('menu')&&game.scene.keys.menu.children.list.length>10,'menu');await wait(150);const menu=game.scene.keys.menu;T.clearForMenu(menu);
  const session={baseSeed:550055,round:options.round??9,protocol:options.protocol??'normal',objectiveMode:'open',equippedMods:[],modsEarned:[]};
  T.requestArenaTransition(menu,{reason:'new-run',session});
  await until(()=>game.scene.isActive('loading')&&T.snapshot(game.scene.keys.loading).lastStep==='awaiting-user-deploy-confirmation','loading');
  game.scene.keys.loading.confirmDeployment(session,'new-run');
  await until(()=>game.scene.isActive('arena')&&game.scene.keys.arena.roundRuntime?.phase==='active','arena');
  const a=game.scene.keys.arena;globalThis.__kineticArena=a;a.pointerLock.hidePrompt();a.playerInput.adoptDevice('gamepad');
  if(a.state.state==='Paused')a.resumeGameplay();await wait(100);game.scene.pause('arena');a.physics.resume();
  const gl=game.renderer.gl,ext=gl?.getExtension('WEBGL_debug_renderer_info');
  return {a,game,wait,until,dep,S,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',restoreInput:()=>{navigator.getGamepads=pads;}};
}
