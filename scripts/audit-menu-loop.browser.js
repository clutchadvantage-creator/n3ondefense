// Play both complete menu songs (4x speed, no seeking) with rendering asleep.
// Inspect __menuLoopAudit after completion; only an isolated test profile is used.
(() => {
  const report = globalThis.__menuLoopAudit = { running: true, transitions: [], errors: [] };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  report.promise = (async () => {
    let audio;
    try {
      const source = await fetch('/src/game/scenes/OptionsScene.ts').then(r => r.text());
      const dep = name => source.match(new RegExp('import\\s*\\{[^}]*\\b' + name + '\\b[^}]*\\}\\s*from\\s*["\x27]([^"\x27]+)'))[1];
      const { AudioManager } = await import(dep('AudioManager'));
      const { SaveSystem } = await import(dep('SaveSystem'));
      SaveSystem.createProfile('Loop audit ' + Date.now().toString().slice(-6));
      SaveSystem.setSettings({ masterVolume: .1, musicVolume: .5, contextualTutorials: false });
      for (const scene of n3onGame.scene.getScenes(true)) n3onGame.scene.stop(scene.scene.key);
      n3onGame.scene.start('options', { returnScene: 'menu' });
      await wait(700);
      audio = AudioManager.get();
      if (audio.musicContext !== 'menu') throw Error('Menu music context unavailable');
      audio.pauseMusicByUser();
      if (audio.menuPlaylistIndex !== 0) audio.nextMusicTrack();
      audio.menuMusicAudio.currentTime = 0;
      for (const voice of audio.menuMusicVoices) voice.playbackRate = 4;
      n3onGame.loop.sleep();
      audio.playMusic();
      for (let index = 0; index < 2; index++) {
        const old = audio.menuMusicAudio;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { old.removeEventListener('ended', ended); reject(Error('Song failed to finish')); }, 75000);
          const ended = () => { clearTimeout(timer); resolve(); };
          old.addEventListener('ended', ended, { once: true });
        });
        await wait(800);
        const current = audio.menuMusicAudio;
        const result = { finished: old.src, current: current.src, volume: current.volume, time: current.currentTime, playing: !current.paused };
        report.transitions.push(result);
        if (current === old || current.paused || current.currentTime <= 0 || current.volume < .049) throw Error('Next song did not resume audibly');
      }
      if (audio.menuPlaylistIndex !== 0) throw Error('Playlist did not wrap to the first song');
    } catch (error) {
      report.errors.push(String(error.stack ?? error));
    } finally {
      for (const voice of audio?.menuMusicVoices ?? []) voice.playbackRate = 1;
      audio?.pauseMusicByUser();
      n3onGame.loop.wake();
      report.running = false;
    }
  })();
  return { started: true };
})();
