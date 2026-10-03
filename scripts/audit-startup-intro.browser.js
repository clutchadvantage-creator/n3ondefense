// Authored media playback plus short fallback/skip/cleanup checks.
(() => {
  const report = globalThis.__n3onLayoutAudit = { running: true, current: 'startup intro', cases: [], errors: [] };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const check = (ok, label) => { report.cases.push({ok:!!ok,label}); if (!ok) throw Error(label); };
  report.promise = (async () => {
    const {StartupIntro, STARTUP_INTRO_VIDEO} = await import('/src/game/ui/StartupIntro.ts');
    const mount = document.createElement('div'); document.body.append(mount);
    let intro;
    try {
      check(STARTUP_INTRO_VIDEO==='assets/video/runtwerkxgaming-intro.mp4', 'authored animation configured');
      intro=new StartupIntro(mount,'/'+STARTUP_INTRO_VIDEO);
      const authored=mount.querySelector('video');
      check(!mount.querySelector('.startup-intro-title') && !mount.textContent.includes('PRESENTS'), 'old title card is absent before playback');
      await intro.ready;
      check(authored.ended && authored.videoWidth>0 && authored.currentTime>0, 'real MP4 decodes and plays to natural completion');
      report.media={duration:authored.duration,width:authored.videoWidth,height:authored.videoHeight,muted:authored.muted};
      intro.destroy();check(mount.childElementCount===0,'authored video releases overlay');
      intro=new StartupIntro(mount);
      check(mount.textContent==='' && !mount.querySelector('video'), 'missing media leaves only the dark boot surface');
      check(await Promise.race([intro.ready.then(()=>true),wait(100).then(()=>false)]), 'missing media adds no startup delay');
      check(!!mount.querySelector('.startup-intro'), 'dark surface remains until Boot is ready');
      intro.destroy();intro.destroy();check(mount.childElementCount===0, 'idempotent owner cleanup');
      intro=new StartupIntro(mount);intro.destroy();await intro.ready;
      check(mount.childElementCount===0, 'early shutdown releases pending readiness');
      // Failure and skip controls are simulated separately from real playback.
      const play=HTMLMediaElement.prototype.play, load=HTMLMediaElement.prototype.load;
      try {
        HTMLMediaElement.prototype.play=()=>Promise.resolve();HTMLMediaElement.prototype.load=()=>{};
        intro=new StartupIntro(mount,'data:video/mp4;base64,');mount.querySelector('video').dispatchEvent(new Event('playing'));
        check(mount.firstElementChild.classList.contains('startup-intro-playing'), 'playing reveals the authored video');
        mount.querySelector('video').dispatchEvent(new Event('ended'));await intro.ready;intro.destroy();
        check(mount.childElementCount===0,'video completion retires media and overlay');
        intro=new StartupIntro(mount,'data:video/mp4;base64,');mount.querySelector('button').click();await intro.ready;intro.destroy();
        check(mount.childElementCount===0,'skip resolves intro');
        intro=new StartupIntro(mount,'data:video/mp4;base64,');mount.querySelector('video').dispatchEvent(new Event('error'));
        check(await Promise.race([intro.ready.then(()=>true),wait(100).then(()=>false)]), 'media failure adds no startup delay');
        check(!mount.firstElementChild.classList.contains('startup-intro-playing') && !mount.querySelector('.startup-intro-title') && !mount.textContent.includes('PRESENTS'),'media failure cannot show the old card');
      } finally { HTMLMediaElement.prototype.play=play;HTMLMediaElement.prototype.load=load; }
    } catch(e) { report.errors.push(String(e.stack??e)); }
    finally { intro?.destroy();mount.remove();report.running=false; }
  })(); return 'Startup intro check started';
})();

