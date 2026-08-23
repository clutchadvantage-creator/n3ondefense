import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ActionStateBuffer,
  StandardGamepadReader,
  applyRadialDeadZoneInto,
  classifyGamepad,
  resolveActionPrompt
} from '../src/game/input/ActionInput.ts';
import {
  DEFAULT_CONTROLLER_SETTINGS,
  normalizeControllerSettings
} from '../src/game/config/controllerSettings.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const pad = ({ index = 0, id = 'Xbox Wireless Controller', mapping = 'standard', axes = [0, 0, 0, 0], down = [], values = {} } = {}) => ({
  index,
  id,
  mapping,
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, (_, buttonIndex) => ({
    pressed: down.includes(buttonIndex),
    value: values[buttonIndex] ?? (down.includes(buttonIndex) ? 1 : 0)
  }))
});

test('radial dead zones reject drift, preserve direction, and remap to full scale', () => {
  const output = { x: 99, y: 99, magnitude: 99 };
  applyRadialDeadZoneInto(0.08, -0.06, 0.2, 1, output);
  assert.deepEqual(output, { x: 0, y: 0, magnitude: 0 });
  applyRadialDeadZoneInto(0.6, 0.8, 0.2, 1, output);
  assert.ok(Math.abs(output.x - 0.6) < 0.0001);
  assert.ok(Math.abs(output.y - 0.8) < 0.0001);
  assert.equal(output.magnitude, 1);
});

test('action state exposes pressed, held, and released edges while respecting contexts', () => {
  const state = new ActionStateBuffer();
  state.beginFrame();
  state.setHeld('fire', true);
  state.finishFrame('gameplay');
  assert.equal(state.pressed('fire'), true);
  assert.equal(state.held('fire'), true);
  state.beginFrame();
  state.setHeld('fire', true);
  state.finishFrame('gameplay');
  assert.equal(state.pressed('fire'), false);
  state.beginFrame();
  state.finishFrame('gameplay');
  assert.equal(state.released('fire'), true);

  state.beginFrame();
  state.setHeld('fire', true);
  state.setHeld('pause', true);
  state.finishFrame('paused');
  assert.equal(state.held('fire'), false);
  assert.equal(state.held('pause'), true);
  state.clear();
  state.beginFrame();
  state.setHeld('pause', true);
  state.finishFrame('paused');
  assert.equal(state.pressed('pause'), false, 'clearing a pause transition must not retrigger a held Start/Escape button');
});

test('standard mapping supplies movement, aim, fire, abilities, interaction, and pause', () => {
  const reader = new StandardGamepadReader();
  const result = reader.poll([pad({ axes: [0.7, -0.4, 0.5, 0.5], down: [0, 2, 4, 5, 7, 9] })], DEFAULT_CONTROLLER_SETTINGS);
  assert.equal(result.supported, true);
  assert.equal(result.family, 'xbox');
  assert.ok(result.move.magnitude > 0);
  assert.ok(result.aim.magnitude > 0);
  assert.equal(result.held('interact'), true);
  assert.equal(result.held('fence'), true);
  assert.equal(result.held('dash'), true);
  assert.equal(result.held('shield'), true);
  assert.equal(result.held('fire'), true);
  assert.equal(result.held('pause'), true);
});

test('drift does not become meaningful, latest active standard pad wins, and disconnect clears state', () => {
  const reader = new StandardGamepadReader();
  const drift = reader.poll([pad({ axes: [0.04, 0.03, -0.02, 0.01] })], DEFAULT_CONTROLLER_SETTINGS);
  assert.equal(drift.meaningful, false);
  const active = reader.poll([
    pad({ index: 0, axes: [0.8, 0, 0, 0] }),
    pad({ index: 1, id: 'DualSense Wireless Controller', down: [3] })
  ], DEFAULT_CONTROLLER_SETTINGS);
  assert.equal(active.index, 1);
  assert.equal(active.family, 'playstation');
  assert.equal(active.held('turret'), true);
  const switched = reader.poll([
    pad({ index: 0, axes: [-0.8, 0, 0, 0] }),
    pad({ index: 1, id: 'DualSense Wireless Controller', down: [3] })
  ], DEFAULT_CONTROLLER_SETTINGS);
  assert.equal(switched.index, 0, 'fresh input on another pad should become authoritative');
  const disconnected = reader.poll([], DEFAULT_CONTROLLER_SETTINGS);
  assert.equal(disconnected.connected, false);
  assert.equal(disconnected.held('turret'), false);
  assert.equal(disconnected.move.magnitude, 0);
});

test('non-standard controllers are reported without unsafe gameplay mapping', () => {
  const reader = new StandardGamepadReader();
  const result = reader.poll([pad({ id: 'Unknown USB Pad', mapping: '', down: [0, 7] })], DEFAULT_CONTROLLER_SETTINGS);
  assert.equal(result.connected, true);
  assert.equal(result.supported, false);
  assert.equal(result.held('fire'), false);
  assert.equal(result.held('interact'), false);
});

test('controller settings clamp malformed data and safely migrate older profiles', () => {
  assert.deepEqual(normalizeControllerSettings({ leftStickDeadZone: -1, rightStickDeadZone: 8, aimSensitivity: 99 }), {
    leftStickDeadZone: 0.05,
    rightStickDeadZone: 0.45,
    aimSensitivity: 2
  });
  const legacy = structuredClone(createDefaultLocalSave('controller-migrate', 'Controller Migrate'));
  delete legacy.settings.controller;
  const migrated = normalizeLocalSave(legacy);
  assert.ok(migrated);
  assert.deepEqual(migrated.settings.controller, DEFAULT_CONTROLLER_SETTINGS);
});

test('glyph resolver identifies common families and has a generic fallback', () => {
  assert.equal(classifyGamepad('Wireless Controller (STANDARD GAMEPAD Vendor: 054c)'), 'playstation');
  assert.equal(resolveActionPrompt('fire', 'gamepad', 'xbox', 'LMB'), 'RT');
  assert.equal(resolveActionPrompt('fence', 'gamepad', 'playstation', 'Q'), 'SQUARE');
  assert.equal(resolveActionPrompt('interact', 'gamepad', 'generic', 'E'), 'SOUTH');
  assert.equal(resolveActionPrompt('interact', 'keyboardMouse', 'xbox', 'E'), 'E');
});
