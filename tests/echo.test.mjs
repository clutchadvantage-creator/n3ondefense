import test from 'node:test';
import assert from 'node:assert/strict';
import { EchoTimeline } from '../src/game/echo/EchoTimeline.ts';
import { authoritativeEchoDamage, stampEchoDamage, nearestSafeEchoOrigin } from '../src/game/echo/EchoRules.ts';
import { DEFAULT_ABILITY_BINDINGS, normalizeAbilityBindings } from '../src/game/config/controls.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { StandardGamepadReader, resolveActionPrompt } from '../src/game/input/ActionInput.ts';
import { DEFAULT_CONTROLLER_SETTINGS } from '../src/game/config/controllerSettings.ts';

const shot = (mode = 'normal') => ({ x: 5, y: 8, angle: .7, mode, speed: 800, damage: 100,
  critical: true, ricochets: 2, grenadeSequence: 4, texture: 'test', width: 12, height: 4, nativePalette: true });
function fixture(config) {
  const events = [], fired = [], poses = [], snaps = [];
  const timeline = new EchoTimeline({ validOrigin: () => true,
    snap: (x, y, out) => { snaps.push([x, y]); out.x = x; out.y = y; return true; },
    pose: (...args) => poses.push(args), fire: (s, x, y, multiplier) => fired.push({ ...s, xOffset: x, yOffset: y, multiplier }),
    event: e => events.push(e) }, config);
  const step = (ms, held = true, pressed = false, x = 10, y = 20, angle = 0, dash = false) => timeline.advance(ms, held, pressed, x, y, angle, dash);
  const finish = (ms, x = 10, y = 20, angle = 0, dash = false) => { step(ms, false, false, x, y, angle, dash); step(0, true, true, x, y, angle, dash); };
  return { timeline, step, finish, events, fired, poses, snaps };
}
for (const duration of [1, 1000, 1700, 2000, 4000]) test(`Second Echo press at ${duration} ms with independent 12-second cooldown`, () => {
  const f = fixture(); f.step(0, true, true); f.finish(duration, 90, 100);
  assert.equal(f.timeline.recording, false); assert.equal(f.timeline.durationMs, duration);
  assert.equal(f.timeline.cooldownMs, 12000); assert.deepEqual(f.snaps, [[10, 20]]);
  f.step(duration, false); assert.equal(f.timeline.replaying, false);
  assert.equal(f.timeline.cooldownMs, 12000 - duration);
  assert.equal(f.timeline.sampleCount, 0); assert.equal(f.timeline.shotCount, 0);
});
test('automatic cap, held-key protection, and fresh press after cooldown', () => {
  const f = fixture(); f.step(0, true, true); f.step(4000);
  assert.equal(f.timeline.durationMs, 4000); assert.equal(f.timeline.replaying, true);
  f.step(12000, true, true); assert.equal(f.timeline.recording, false);
  f.step(0, false); f.step(0, true, true); assert.equal(f.timeline.recording, true);
});
test('first tap release continues recording; only a fresh second press or timeout completes it', () => {
  const f = fixture(); f.step(0, true, true); f.step(100, true, true);
  assert.equal(f.timeline.recording, true, 'repeat while held is not a second press');
  f.step(200, false); assert.equal(f.timeline.recording, true, 'release does not end recording');
  f.step(1400, false); assert.equal(f.timeline.recording, true, 'recording needs no held key');
  f.step(0, true, true); assert.equal(f.timeline.durationMs, 1700); assert.equal(f.timeline.replaying, true);
  assert.equal(f.timeline.cooldownMs, 12000);
});
test('untouched recording automatically completes four seconds after the first tap', () => {
  const f = fixture(); f.step(0, true, true); f.step(3999, false);
  assert.equal(f.timeline.recording, true); f.step(1, false);
  assert.equal(f.timeline.recording, false); assert.equal(f.timeline.durationMs, 4000);
  assert.equal(f.timeline.cooldownMs, 12000);
});
test('cooldown rejects new recordings, including during replay', () => {
  const f = fixture(); f.step(0, true, true); f.finish(1000);
  f.step(1, true, true); assert.equal(f.timeline.recording, false);
  f.finish(1000); f.step(1, true, true); assert.equal(f.timeline.recording, false);
});
for (const frameMs of [1000 / 144, 16.7, 33.3, 121]) test(`fixed movement sampling remains ordered and bounded at ${frameMs} ms frames`, () => {
  const f = fixture(); f.step(0, true, true, 0, 0);
  let time = 0;
  while (time < 4000) { const dt = Math.min(frameMs, 4000 - time); time += dt; f.step(dt, true, false, time, 0, 0, time > 1000 && time < 1300); }
  const t = f.timeline;
  assert.equal(t.sampleCount, 241);
  for (let i = 1; i < t.sampleCount; i++) {
    assert.ok(t.samples[i * 5] > t.samples[(i - 1) * 5]);
    assert.ok(Math.abs(t.samples[i * 5] - i * 1000 / 60) < .00001);
    assert.ok(Math.abs(t.samples[i * 5 + 1] - t.samples[i * 5]) < .00001);
  }
  f.step(1250, false); assert.ok(Math.abs(f.poses.at(-1)[0] - 1250) < .0001); assert.equal(f.poses.at(-1)[3], true);
});
test('replay uses shortest rotation across wrap and preserves the recorded route', () => {
  const f = fixture(); f.step(0, true, true, 0, 0, Math.PI - .1);
  f.finish(1000, 100, 100, -Math.PI + .1);
  f.step(500, false); const pose = f.poses.at(-1);
  assert.ok(Math.abs(pose[0] - 50) < .001); assert.ok(Math.abs(pose[1] - 50) < .001);
  assert.ok(Math.abs(pose[2] - Math.PI) < .001);
});
test('shot-time mixed ammo, ordering, modifiers and grenade sequence survive later live changes', () => {
  const f = fixture(); f.step(0, true, true);
  const live = shot('scattershot'); f.step(400); f.timeline.recordShot(live);
  live.mode = 'grenade'; live.damage = 170; f.step(600); f.timeline.recordShot(live);
  live.mode = 'normal'; live.damage = 80; f.step(1800); f.timeline.recordShot(live);
  live.damage = 999; live.texture = 'changed'; f.finish(600);
  assert.equal(f.fired.length, 0);
  f.step(399, false); assert.equal(f.fired.length, 0); f.step(1, false);
  assert.equal(f.fired[0].time, 400); assert.equal(f.fired[0].damage, 100);
  f.step(600, false); f.step(1800, false);
  assert.deepEqual(f.fired.map(s => s.mode), ['scattershot', 'grenade', 'normal']);
  assert.deepEqual(f.fired.map(s => s.damage), [100, 170, 80]);
  assert.deepEqual(f.fired.map(s => s.time), [400, 1000, 2800]);
  assert.ok(f.fired.every(s => s.multiplier === .5 && s.texture === 'test' && s.grenadeSequence === 4));
});
test('weapon reserve remains bounded at extreme rates and rejects recursive Echo recording', () => {
  const f = fixture(); f.step(0, true, true); const reserve = f.timeline.shots;
  assert.equal(f.timeline.recordShot(shot(), 'echo'), false);
  for (let i = 0; i < 700; i++) f.timeline.recordShot(shot());
  assert.equal(f.timeline.shotCount, 512); assert.equal(f.timeline.rejectedShots, 188);
  f.step(4000, false); f.step(4000, false); assert.equal(f.fired.length, 512);
  assert.equal(f.timeline.shots, reserve); assert.equal(f.timeline.shots[0].texture, '');
});
test('reset cancels recording and replay without a snap or subsequent weapon event', () => {
  for (const duringReplay of [false, true]) {
    const f = fixture(); f.step(0, true, true); f.step(500); f.timeline.recordShot(shot());
    if (duringReplay) f.finish(500);
    f.timeline.reset(); f.step(20000, true, true);
    assert.equal(f.timeline.recording, false); assert.equal(f.timeline.replaying, false);
    assert.equal(f.fired.length, 0); assert.equal(f.timeline.cooldownMs, 0);
    assert.ok(f.timeline.samples.every(n => n === 0));
    assert.ok(f.timeline.shots.every(s => s.damage === 0 && s.texture === ''));
  }
});
test('authoritative Echo health damage is 50% by default and never exceeds 70% after later modifiers', () => {
  for (const requestedMultiplier of [.5, .6, .7, .74, .95, 5]) {
    const stamp = stampEchoDamage(100, requestedMultiplier);
    assert.ok(Object.isFrozen(stamp));
    assert.equal(authoritativeEchoDamage(10000, stamp), 100 * Math.min(.7, requestedMultiplier));
    assert.equal(authoritativeEchoDamage(2, stamp), 2);
  }
  assert.equal(authoritativeEchoDamage(999, { equivalentDamage: 100, multiplier: 999 }), 70);
  assert.equal(authoritativeEchoDamage(999), 0);
  assert.equal(authoritativeEchoDamage(NaN, stampEchoDamage(100, .5)), 0);
  assert.equal(authoritativeEchoDamage(999, stampEchoDamage(100, -1)), 0);
});
test('safe origin preserves exact location or chooses nearby valid full-body location before fallback', () => {
  const out = { x: 0, y: 0 };
  assert.equal(nearestSafeEchoOrigin(20, 20, () => true, 100, 100, out), true); assert.deepEqual(out, { x: 20, y: 20 });
  assert.equal(nearestSafeEchoOrigin(0, 0, (x, y) => x >= 13 && y >= 13, 100, 100, out), true);
  assert.ok(out.x >= 13 && out.y >= 13 && Math.hypot(out.x, out.y) <= 24);
  assert.equal(nearestSafeEchoOrigin(0, 0, (x, y) => x === 1000 && y === 1000, 1000, 1000, out), true);
  assert.deepEqual(out, { x: 1000, y: 1000 });
  assert.equal(nearestSafeEchoOrigin(0, 0, () => false, 0, 0, out), false);
});
test('Echo default, rebind, save migration, reload and reset use the shared binding schema', () => {
  assert.equal(DEFAULT_ABILITY_BINDINGS.echo, 'Keyboard:AltLeft');
  for (const echo of ['Keyboard:KeyZ', 'Mouse:4', 'Gamepad:6']) {
    const save = createDefaultLocalSave('echo-test', 'Echo Test'); save.settings.abilityBindings.echo = echo;
    assert.equal(normalizeLocalSave(JSON.parse(JSON.stringify(save))).settings.abilityBindings.echo, echo);
  }
  assert.equal(normalizeAbilityBindings(undefined).echo, 'Keyboard:AltLeft');
  assert.equal(normalizeAbilityBindings({ echo: 'Gamepad:7' }).echo, 'Keyboard:AltLeft');
});
test('Echo controller binding preserves fire, shield and dash and displays the assigned glyph', () => {
  const reader = new StandardGamepadReader();
  const pad = { index: 0, id: 'Xbox Wireless Controller', mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: [4, 5, 6, 7].includes(i), value: [4, 5, 6, 7].includes(i) ? 1 : 0 })) };
  const state = reader.poll([pad], DEFAULT_CONTROLLER_SETTINGS, { ...DEFAULT_ABILITY_BINDINGS, echo: 'Gamepad:6' });
  for (const action of ['echo', 'fire', 'shield', 'dash']) assert.equal(state.held(action), true);
  assert.equal(resolveActionPrompt('echo', 'gamepad', 'xbox', 'L ALT', 'Gamepad:6'), 'LT');
});
