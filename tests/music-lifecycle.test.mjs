import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import ts from 'typescript';
import * as config from '../src/game/config/audio.ts';
import * as keys from '../src/game/flow/SceneKeys.ts';

// Execute the production controllers with controllable browser audio promises.
const compiled = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const lifecycleCode = compiled('../src/game/flow/RunTransitionManager.ts');
const audioCode = compiled('../src/game/systems/AudioManager.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const voices = [];
  let rejectNextPlay = false;
  class Audio extends EventTarget {
    constructor(src) { super(); this.src = src; this.paused = true; this.ended = false; this.currentTime = 0; this.duration = 100; this.volume = 1; voices.push(this); }
    play() {
      if (rejectNextPlay) { rejectNextPlay = false; return Promise.reject({ name: 'NotAllowedError' }); }
      this.paused = false; return Promise.resolve();
    }
    pause() { this.paused = true; }
    load() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
  }
  const settings = { masterVolume: .6, musicVolume: .5, sfxVolume: .5, soundVolumes: config.createDefaultSoundVolumes() };
  const document = new EventTarget();
  const lifecycle = { exports: {} };
  const dependencies = {
    '../config/audio': config, '../flow/SceneKeys': keys, './SceneKeys': keys,
    '../mods/modBalance.ts': { normalizeRunProtocolId: x => x },
    './SaveSystem': { SaveSystem: { get: () => ({ settings }) } },
    '../utils/assetUrl': { publicAssetUrl: x => x },
    './DroneAudioPool': { DroneAudioPool: class {} }
  };
  const globals = { performance: { now: () => 1000 }, document, Audio, AudioContext: class { state = 'running'; }, console };
  const require = key => { if (!dependencies[key]) throw Error('Unexpected dependency ' + key); return dependencies[key]; };
  vm.runInNewContext(lifecycleCode, { ...globals, exports: lifecycle.exports, require });
  dependencies['../flow/RunTransitionManager'] = lifecycle.exports;
  const output = { exports: {} };
  vm.runInNewContext(audioCode, { ...globals, exports: output.exports, require });
  const audio = output.exports.AudioManager.get();
  const registry = new Map(), events = new EventEmitter();
  const scene = (key, status = 'active') => ({ sys: { settings: { key }, isActive: () => status === 'active', isPaused: () => status === 'paused', isSleeping: () => status === 'sleeping' } });
  const game = { events, registry, scene: { scenes: [scene('splash')] } };
  audio.bindMusicLifecycle(game);
  const frame = async () => { events.emit('poststep'); await flush(); };
  const playing = () => audio.musicDiagnostics().voices.filter(v => v.playing).length;
  return { audio, game, scene, frame, playing, settings, voices, document, lifecycle: lifecycle.exports.RunTransitionManager, blockNext: () => { rejectNextPlay = true; } };
}

test('HEIST entered during a pending gameplay start still resumes the requested soundtrack', async () => {
  const f = fixture(); f.game.scene.scenes = [f.scene('arena')]; await f.frame();
  const gameplay = f.audio.musicAudio, play = gameplay.play.bind(gameplay);
  gameplay.pause(); f.audio.musicStarted = false;
  let resolve;
  gameplay.play = () => new Promise(done => { resolve = done; });
  f.audio.startMusicLoop(); f.audio.enterHeistMusic(); await flush();
  resolve(); await flush(); gameplay.play = play;
  f.audio.exitHeistMusic(); await flush();
  assert.equal(gameplay.paused, false); assert.equal(f.playing(), 1);
});

test('an older request for the same retained voice cannot overwrite a newer playback result', async () => {
  const f = fixture(); await f.frame();
  const menu = f.audio.menuMusicAudio, play = menu.play.bind(menu);
  menu.pause(); let reject;
  menu.play = () => new Promise((_resolve, fail) => { reject = fail; });
  f.audio.startMusicLoop();
  f.game.scene.scenes = [f.scene('arena')]; await f.frame();
  menu.play = play; f.game.scene.scenes = [f.scene('menu')]; await f.frame();
  reject({ name: 'NotAllowedError' }); await flush();
  assert.equal(f.audio.musicRetryPending, false); assert.equal(f.playing(), 1);
});

test('central music ownership survives paused/sleeping menus, results and deployment gaps', async () => {
  const f = fixture(); await f.frame();
  const menu = f.audio.menuMusicAudio; menu.currentTime = 23;
  for (const key of ['profile-loading', 'local-profiles', 'menu', 'garage', 'mods', 'options']) {
    f.game.scene.scenes = [f.scene(key)]; await f.frame();
    assert.equal(f.audio.menuMusicAudio, menu); assert.equal(menu.currentTime, 23); assert.equal(f.playing(), 1);
  }
  for (const status of ['active', 'paused', 'sleeping']) {
    f.game.scene.scenes = [f.scene('arena', status), f.scene('options')]; await f.frame();
    assert.equal(f.audio.musicContext, 'gameplay'); assert.equal(menu.paused, true); assert.equal(f.playing(), 1);
  }
  for (const key of ['results', 'round-finished', 'anomaly-heist', 'loading']) {
    f.game.scene.scenes = [f.scene(key)]; await f.frame(); assert.equal(f.audio.musicContext, 'gameplay');
  }
  f.game.scene.scenes = [f.scene('options')]; f.game.registry.set('arena-session', {}); await f.frame();
  assert.equal(f.audio.musicContext, 'gameplay');
  f.game.registry.clear(); f.lifecycle.inProgress = true; await f.frame(); assert.equal(f.audio.musicContext, 'gameplay');
  f.lifecycle.inProgress = false; await f.frame(); assert.equal(f.audio.musicContext, 'menu'); assert.equal(f.playing(), 1);
  f.audio.bindMusicLifecycle(f.game); await f.frame(); assert.equal(f.game.events.listenerCount('poststep'), 1);
  f.game.events.emit('destroy'); assert.equal(f.playing(), 0); assert.equal(f.game.events.listenerCount('poststep'), 0);
});

test('menu track completion wraps in order and retired callbacks cannot restart either playlist', async () => {
  const f = fixture(); await f.frame(); const first = f.audio.menuMusicAudio;
  first.dispatchEvent(new Event('ended')); await flush();
  const second = f.audio.menuMusicAudio; assert.match(second.src, /Neon Dub Pulse/); assert.equal(first.paused, true); assert.equal(first.src, '');
  first.dispatchEvent(new Event('error')); first.dispatchEvent(new Event('ended')); await flush(); assert.equal(f.audio.menuMusicAudio, second);
  second.dispatchEvent(new Event('ended')); await flush(); assert.match(f.audio.menuMusicAudio.src, /Neon Serenity/); assert.equal(f.playing(), 1);
  f.game.scene.scenes = [f.scene('arena')]; await f.frame();
  f.audio.menuMusicAudio.dispatchEvent(new Event('ended')); await flush(); assert.equal(f.audio.menuMusicAudio.paused, true); assert.equal(f.playing(), 1);
  f.audio.enterHeistMusic(); await flush(); f.audio.musicAudio.dispatchEvent(new Event('ended')); await flush();
  assert.equal(f.audio.musicAudio.paused, true); assert.equal(f.playing(), 1);
});

test('autoplay retries only after interaction and missing menu assets stop after one deck', async () => {
  const f = fixture(); f.blockNext(); await f.frame();
  assert.equal(f.audio.musicRetryPending, true); assert.equal(f.playing(), 0);
  await f.frame(); assert.equal(f.playing(), 0);
  f.document.dispatchEvent(new Event('keydown')); await flush(); assert.equal(f.playing(), 1); assert.equal(f.audio.musicRetryPending, false);
  const first = f.audio.menuMusicAudio; first.dispatchEvent(new Event('error')); await flush();
  const last = f.audio.menuMusicAudio; last.pause(); last.dispatchEvent(new Event('error')); await flush();
  assert.notEqual(first, last); assert.equal(f.audio.menuMusicAudio, last); await f.frame(); assert.equal(f.playing(), 0);
});

test('a delayed play rejection from the old context cannot suppress the replacement soundtrack', async () => {
  const f = fixture(); await f.frame(); const menu = f.audio.menuMusicAudio; menu.pause();
  let reject;
  menu.play = () => new Promise((_resolve, fail) => { reject = fail; });
  f.audio.startMusicLoop(); f.game.scene.scenes = [f.scene('arena')]; await f.frame();
  reject({ name: 'NotAllowedError' }); await flush();
  assert.equal(f.audio.musicContext, 'gameplay'); assert.equal(f.audio.musicRetryPending, false); assert.equal(f.playing(), 1);
});
