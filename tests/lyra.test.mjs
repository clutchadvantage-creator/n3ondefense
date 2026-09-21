import test from 'node:test';
import assert from 'node:assert/strict';
import { LyraQueue } from '../src/game/lyra/LyraQueue.ts';
import { DEFAULT_LYRA_SETTINGS, normalizeLyraSettings } from '../src/game/lyra/LyraTypes.ts';
import { selectLyraVoice, BrowserTTSProvider, RecordedAudioProvider } from '../src/game/lyra/LyraVoiceProviders.ts';
import { LYRA_MESSAGES, LYRA_MESSAGE_BY_ID } from '../src/game/lyra/LyraRegistry.ts';
import { createTutorialProgress, completeFirstRunTeachingRound, setFirstRunTeachingStage } from '../src/game/tutorial/TutorialProgress.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { TUTORIAL_SEQUENCES } from '../src/game/tutorial/TutorialRegistry.ts';
import { LYRA_TUTORIAL_SCRIPT } from '../src/game/lyra/LyraTutorialScript.ts';
import { resolveTutorialCopy } from '../src/game/tutorial/TutorialCopy.ts';
import { DEFAULT_ABILITY_BINDINGS } from '../src/game/config/controls.ts';
import { existsSync } from 'node:fs';

const message = (id, priority = 40, extra = {}) => ({ id, text: id, priority, mode: 'SYSTEM', ...extra });
const context = { scope: 'profile:arena:1', scene: 'arena', blocked: false, training: false, ambientSafe: false };
function fixture() {
  let now = 0, stopped = 0; const started = [], seen = new Set();
  const queue = new LyraQueue(() => now, id => seen.has(id), m => started.push(m.id), () => stopped++);
  queue.setContext(context);
  return { queue, seen, started, stopCount: () => stopped, advance(ms) { now += ms; queue.tick(); } };
}
test('critical danger interrupts ambient, cancels its voice, and does not overlap', () => {
  const f = fixture(); f.queue.setContext({ ...context, ambientSafe: true, lowHealth: true });
  f.queue.submit(message('ambient', 10, { mode: 'AMBIENT' }));
  f.queue.submit(LYRA_MESSAGE_BY_ID.get('warning.health'));
  assert.equal(f.stopCount(), 1); assert.deepEqual(f.started, ['ambient', 'warning.health']);
  f.queue.setContext(context); assert.equal(f.queue.active, null, 'recovered health cancels stale warning');
});
test('scene boundary drops speech and pending lines; returning cannot revive them', () => {
  const f = fixture(); f.queue.submit(message('one')); f.queue.submit(message('two'));
  f.queue.setContext({ ...context, scope: 'profile:heist:2', scene: 'anomaly-heist' });
  f.advance(50000); f.queue.setContext(context); f.advance(50000);
  assert.deepEqual(f.started, ['one']); assert.equal(f.stopCount(), 1); assert.equal(f.queue.pending.length, 0);
});
test('queued contextual messages expire instead of teaching an obsolete encounter', () => {
  const f = fixture(); f.queue.submit(message('training', 90)); f.queue.submit(message('pickup', 60, { expiryMs: 1000 }));
  f.advance(1500); f.queue.finish(); f.advance(2000); assert.deepEqual(f.started, ['training']);
});
test('required tutorial excludes ambient and context while retaining critical danger', () => {
  const f = fixture(); f.queue.setContext({ ...context, training: true, lowHealth: true });
  assert.equal(f.queue.submit(message('hint', 60)), false);
  assert.equal(f.queue.submit(message('training', 90, { tutorial: true })), true);
  assert.equal(f.queue.submit(LYRA_MESSAGE_BY_ID.get('warning.health')), true);
});
test('repeat suppression, once policies, and bounded pending capacity survive bursts', () => {
  const f = fixture(); f.seen.add('seen'); assert.equal(f.queue.submit(message('seen', 40, { once: 'profile' })), false);
  f.queue.submit(message('active', 100)); assert.equal(f.queue.submit(message('active', 100)), false);
  for (let i = 0; i < 100; i++) f.queue.submit(message(`pending${i}`));
  assert.equal(f.queue.pending.length, 12);
  f.queue.clear(); f.advance(2000); f.queue.submit(message('run', 40, { once: 'run', cooldownMs: 0 }));
  f.queue.finish(); f.advance(2000); assert.equal(f.queue.submit(message('run', 40, { once: 'run' })), false);
  f.queue.resetRun(); assert.equal(f.queue.submit(message('run', 40, { once: 'run' })), true);
});
test('pause/reveal exclusion cancels both voice and pending lines', () => {
  const f = fixture(); f.queue.submit(message('one')); f.queue.submit(message('two'));
  f.queue.setContext({ ...context, blocked: true });
  assert.equal(f.queue.active, null); assert.equal(f.queue.pending.length, 0);
  assert.equal(f.queue.submit(message('critical', 100)), false);
});
test('voice selection uses explicit local preference, then named local English, never a network voice', () => {
  const voices = [{ name: 'Jenny online', lang: 'en-US', localService: false },
    { name: 'David', lang: 'en-US', localService: true }, { name: 'Microsoft Zira', lang: 'en-US', localService: true }];
  assert.equal(selectLyraVoice(voices, DEFAULT_LYRA_SETTINGS).name, 'Microsoft Zira');
  assert.equal(selectLyraVoice(voices, { ...DEFAULT_LYRA_SETTINGS, voiceName: 'David' }).name, 'David');
  assert.equal(selectLyraVoice([voices[0]], DEFAULT_LYRA_SETTINGS), undefined);
  assert.equal(selectLyraVoice([], DEFAULT_LYRA_SETTINGS), undefined);
});
test('absent speech synthesis and unregistered recording both return text-fallback eligibility', () => {
  const provider = new BrowserTTSProvider();
  assert.equal(provider.play(message('one'), DEFAULT_LYRA_SETTINGS, () => {}, () => {}, () => {}), null);
  assert.equal(new RecordedAudioProvider({}, '').play(message('one'), DEFAULT_LYRA_SETTINGS, () => {}, () => {}, () => {}), null);
  provider.destroy();
});
test('asynchronous local voice discovery works and late callbacks after cancellation cannot complete another line', () => {
  const oldWindow = globalThis.window, oldUtterance = globalThis.SpeechSynthesisUtterance;
  const synth = new EventTarget(); let voices = [], utterance, cancelled = 0, starts = 0, ends = 0;
  synth.getVoices = () => voices; synth.speak = value => { utterance = value; }; synth.cancel = () => cancelled++;
  globalThis.window = { speechSynthesis: synth };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const provider = new BrowserTTSProvider();
  try {
    assert.equal(provider.play(message('one'), DEFAULT_LYRA_SETTINGS, () => starts++, () => ends++, () => {}), null);
    voices = [{ name: 'Zira', lang: 'en-US', localService: true }]; synth.dispatchEvent(new Event('voiceschanged'));
    const handle = provider.play(message('one'), DEFAULT_LYRA_SETTINGS, () => starts++, () => ends++, () => {});
    assert.ok(handle); utterance.onstart(); const lateEnd = utterance.onend; handle.cancel(); lateEnd();
    assert.equal(starts, 1); assert.equal(ends, 0); assert.equal(cancelled, 1);
    provider.destroy(); voices = []; synth.dispatchEvent(new Event('voiceschanged'));
    assert.equal(provider.listVoices().length, 1, 'destroy removes the voice-discovery subscription');
  } finally { provider.destroy(); globalThis.window = oldWindow; globalThis.SpeechSynthesisUtterance = oldUtterance; }
});
test('recorded playback failures fall through once and release their media resource', async () => {
  const oldAudio = globalThis.Audio; let audio, failures = 0;
  globalThis.Audio = class {
    constructor(src) { this.src = src; audio = this; }
    play() { return Promise.reject(new Error('missing local recording')); }
    pause() { this.paused = true; } removeAttribute() { this.src = ''; } load() {}
  };
  try {
    const provider = new RecordedAudioProvider({ 'en-US': { one: 'one.mp3' } }, '/local/');
    provider.play(message('one'), DEFAULT_LYRA_SETTINGS, () => {}, () => {}, () => failures++);
    const lateError = audio.onerror; await new Promise(resolve => setImmediate(resolve)); lateError();
    assert.equal(failures, 1); assert.equal(audio.src, ''); assert.equal(audio.paused, true);
  } finally { globalThis.Audio = oldAudio; }
});
test('settings normalization tolerates old saves and invalid values without changing other mixer channels', () => {
  assert.deepEqual(normalizeLyraSettings(undefined), DEFAULT_LYRA_SETTINGS);
  const settings = normalizeLyraSettings({ voice: false, subtitles: false, volume: -4, rate: Infinity, pitch: 20, language: '<script>' });
  assert.equal(settings.voice, false); assert.equal(settings.subtitles, false); assert.equal(settings.volume, 0);
  assert.equal(settings.rate, .96); assert.equal(settings.pitch, 1.2); assert.equal(settings.language, 'en-US');
  const save = createDefaultLocalSave('lyra-test', 'Lyra Test'); save.settings.soundVolumes.shot = .37;
  const normalized = normalizeLocalSave(save); assert.equal(normalized.settings.soundVolumes.shot, .37);
  assert.equal(normalized.settings.lyra.volume, .8);
});
test('new curriculum continues round one and two; third completion opens post-run teaching', () => {
  const progress = createTutorialProgress(); setFirstRunTeachingStage(progress, 'arena-teaching');
  assert.equal(completeFirstRunTeachingRound(progress, 1), false); assert.equal(progress.trainingRoundsCompleted, 1);
  assert.equal(completeFirstRunTeachingRound(progress, 2), false); assert.equal(progress.firstRunStage, 'arena-teaching');
  assert.equal(completeFirstRunTeachingRound(progress, 3), true); assert.equal(progress.firstRunStage, 'waiting-for-store');
});
test('established profiles are not enrolled in the new curriculum during normalization', () => {
  const save = createDefaultLocalSave('lyra-old', 'Existing');
  delete save.tutorials.lyraCurriculum; save.tutorials.firstRunStage = 'complete'; save.tutorials.firstRunWelcomePending = false;
  const old = normalizeLocalSave(save); assert.equal(old.tutorials.lyraCurriculum, 0); assert.equal(old.tutorials.firstRunStage, 'complete');
  delete save.tutorials; assert.equal(normalizeLocalSave(save).tutorials.firstRunStage, 'complete');
});
test('action gates are separated across rounds and all tutorial lines have stable unique communication IDs', () => {
  const tactics = TUTORIAL_SEQUENCES.find(s => s.id === 'onboarding.tactics');
  assert.equal(tactics.minimumTrainingRound, 2);
  assert.deepEqual(tactics.steps.filter(s => s.completion.type === 'event').map(s => s.completion.event),
    ['combat.ability.shield', 'combat.ability.dash', 'combat.ability.mine', 'combat.ability.fence', 'combat.ability.turret']);
  assert.equal(TUTORIAL_SEQUENCES.find(s => s.id === 'onboarding.certification').minimumTrainingRound, 3);
  assert.equal(new Set(LYRA_MESSAGES.map(m => m.id)).size, LYRA_MESSAGES.length);
  for (const sequence of TUTORIAL_SEQUENCES) for (const step of sequence.steps) {
    assert.ok(LYRA_MESSAGE_BY_ID.has(`tutorial.${sequence.id}.${step.id}`));
    assert.notEqual(step.completion.type, 'auto');
  }
});
test('all 17 authored recordings have exact default-control subtitle parity and existing files', () => {
  assert.equal(Object.keys(LYRA_TUTORIAL_SCRIPT).length, 17);
  for (const [id, line] of Object.entries(LYRA_TUTORIAL_SCRIPT)) {
    const sequence = TUTORIAL_SEQUENCES.find(s => id.startsWith(s.id + '.'));
    const step = sequence.steps.find(s => id === `${sequence.id}.${s.id}`);
    assert.ok(step, id);
    assert.equal(resolveTutorialCopy(step, 'keyboardMouse', 'generic', DEFAULT_ABILITY_BINDINGS).body, line.text, id);
    assert.equal(LYRA_MESSAGE_BY_ID.get(`tutorial.${id}`).recordedText, line.text);
    assert.ok(existsSync(new URL(`../public/assets/audio/lyra/${line.file}`, import.meta.url)), line.file);
  }
});
test('controller and remapped instructions cannot play a recording naming the wrong control', () => {
  const sequence = TUTORIAL_SEQUENCES.find(s => s.id === 'onboarding.tactics');
  const step = sequence.steps.find(s => s.id === 'shield');
  const definition = LYRA_MESSAGE_BY_ID.get('tutorial.onboarding.tactics.shield');
  const provider = new RecordedAudioProvider({ 'en-US': { [definition.id]: 'lyrashield.mp3' } }, '/local/');
  for (const [device, bindings] of [['gamepad', DEFAULT_ABILITY_BINDINGS], ['keyboardMouse', { ...DEFAULT_ABILITY_BINDINGS, shield: 'Keyboard:KeyZ' }]]) {
    const copy = resolveTutorialCopy(step, device, 'xbox', bindings);
    assert.notEqual(copy.body, definition.recordedText);
    assert.equal(provider.play({ ...definition, text: copy.body }, DEFAULT_LYRA_SETTINGS, () => {}, () => {}, () => {}), null);
    assert.ok(!copy.body.includes('MIDDLE MOUSE BUTTON'));
  }
});
