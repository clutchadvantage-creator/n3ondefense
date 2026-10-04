// Isolated profile: exercise Options radio controls against the real audio owner.
(() => {
 const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],errors:[]};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
 report.promise=(async()=>{try{
  const source=await fetch('/src/game/scenes/OptionsScene.ts').then(r=>r.text());
  const dep=n=>source.match(new RegExp('import\\s*\\{[^}]*\\b'+n+'\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
  const {SaveSystem:S}=await import(dep('SaveSystem'));
  const {AudioManager:A}=await import(dep('AudioManager'));
  const {UiNavigationController:U}=await import(dep('UiNavigationController'));
  A.get().exitHeistMusic();
  S.createProfile('Radio '+Date.now().toString().slice(-7));S.setSettings({masterVolume:0,contextualTutorials:false});
  S.updateTutorialProgress(p=>{p.firstRunStage='complete';p.firstRunWelcomePending=false;});
  for(const scene of n3onGame.scene.getScenes(true))n3onGame.scene.stop(scene.scene.key);
  n3onGame.scene.start('options',{returnScene:'menu'});await wait(500);
  const audio=A.get();let o=n3onGame.scene.keys.options;
  const text=name=>o.tabContainers.get('audio').list.find(c=>c.name===name);
  check(text('music-player-title').text===audio.musicPlayerState().title,'radio displays active song title');
  const layer=U.get().phaserLayer(o);
  const activate=id=>{check(layer.manager.focus('options:audio:music:'+id),'controller focuses '+id);layer.manager.activate();};
  audio.playMusic();await wait(500);activate('play-pause');await wait(150);
  check(audio.musicPlayerState().paused&&!audio.isMusicPlaying(),'controller Pause stops music');
  const title=audio.musicPlayerState().title;
  activate('next');await wait(300);check(audio.musicPlayerState().title!==title,'Next changes the current playlist');
  check(!audio.isMusicPlaying(),'Next preserves manual pause');
  activate('previous');await wait(300);check(audio.musicPlayerState().title===title,'Previous returns to earlier song');
  const play=o.tabContainers.get('audio').list.find(c=>c.getByName?.('button-label')?.text==='PLAY');
  play.getByName('button-hit').emit('pointerdown');await wait(500);
  check(audio.isMusicPlaying()&&!audio.musicPlayerState().paused,'mouse Play resumes music');
  audio.pauseMusicByUser();o.handleEscReturn();await wait(500);
  check(!audio.isMusicPlaying(),'return to menu preserves radio pause');
  n3onGame.scene.start('options',{returnScene:'menu'});await wait(500);o=n3onGame.scene.keys.options;
  check(text('music-player-status').text.includes('PAUSED'),'reopening Options shows paused state');
  audio.enterHeistMusic();await wait(300);
  check(text('music-player-title').text==='HEIST Anomaly','HEIST shows dedicated track');
  const navigation=U.get().phaserLayer(o).manager;
  check(navigation.controls.get('options:audio:music:next').isDisabled(),'HEIST Next is unavailable to controller');
  check(navigation.controls.get('options:audio:music:previous').isDisabled(),'HEIST Previous is unavailable to controller');
  audio.exitHeistMusic();audio.playMusic();await wait(300);
  check(text('music-player-status').text.includes('MENU'),'normal soundtrack controls recover after HEIST');
  const menuVoices=new Set();
  for(let i=0;i<4;i++){
    const old=audio.menuMusicAudio;menuVoices.add(old);
    for(let n=0;n<100&&(!Number.isFinite(old.duration)||old.readyState<3);n++)await wait(50);
    let endedAt=0;old.addEventListener('ended',()=>{endedAt=performance.now();},{once:true});
    old.currentTime=old.duration-.3;
    const deadline=performance.now()+5000;
    while((audio.menuMusicAudio===old||audio.menuMusicAudio.currentTime===0||audio.menuMusicAudio.paused)&&performance.now()<deadline)await wait(20);
    check(endedAt>0&&audio.menuMusicAudio!==old&&!audio.menuMusicAudio.paused,'menu ending automatically starts the next song '+i);
    report.checks.push({ok:true,label:'menu handoff milliseconds '+i,value:performance.now()-endedAt});
  }
  check(menuVoices.size===2,'repeated menu cycles reuse the same two buffered voices');
  report.cases.push({passed:true});
 }catch(e){report.errors.push(String(e.stack??e));}finally{report.running=false;}})();return {started:true};
})();
