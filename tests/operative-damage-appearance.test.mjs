import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COSMETICS, resolveOperativeFrameAppearance } from '../src/data/cosmetics.ts';
import { OperativeAppearanceController } from '../src/game/cosmetics/OperativeAppearanceController.ts';

const playerSource = readFileSync(new URL('../src/game/entities/Player.ts', import.meta.url), 'utf8');
const arenaSource = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');

const createTarget = (textureKey = 'player-circle') => {
  const state = {
    active: true,
    textureKey,
    tint: null,
    fillTint: null,
    textureChanges: 0
  };
  const target = {
    isActive: () => state.active,
    getTextureKey: () => state.textureKey,
    setTexture: (key) => { state.textureKey = key; state.textureChanges += 1; },
    clearTint: () => { state.tint = null; state.fillTint = null; },
    setTint: (color) => { state.tint = color; state.fillTint = null; },
    setTintFill: (color) => { state.fillTint = color; }
  };
  return { state, target };
};

test('normal and custom-colored Operatives restore through the current authoritative appearance', () => {
  const { state, target } = createTarget();
  let appearance = resolveOperativeFrameAppearance('player-circle', 'player-cyan', 0);
  const controller = new OperativeAppearanceController(target, () => appearance);
  controller.restore(0, true);
  assert.equal(state.tint, 0x00f5ff);
  controller.beginDamageFlash(10, 90);
  assert.equal(state.fillTint, 0xffffff);
  appearance = resolveOperativeFrameAppearance('player-circle', 'player-pink', 100);
  controller.update(100);
  assert.equal(state.textureKey, appearance.textureKey);
  assert.equal(state.tint, 0xff4df2, 'restoration resolves the color active at flash end');
  assert.equal(state.fillTint, null);
});

test('Native Palette restores cached authored textures without applying a white tint', () => {
  const premiumFrames = COSMETICS.filter((item) => item.category === 'playerShape' && item.nativeTextureKey);
  assert.equal(premiumFrames.length, 9);
  for (const frame of premiumFrames) {
    const { state, target } = createTarget(frame.textureKey);
    const expected = resolveOperativeFrameAppearance(frame.id, 'player-native', 1_000);
    const controller = new OperativeAppearanceController(target, () => expected);
    controller.restore(1_000, true);
    assert.equal(state.textureKey, frame.nativeTextureKey, frame.id);
    assert.equal(state.tint, null, frame.id);
    controller.beginDamageFlash(1_010, 90);
    assert.equal(state.fillTint, 0xffffff, frame.id);
    controller.update(1_100);
    assert.equal(state.textureKey, frame.nativeTextureKey, frame.id);
    assert.equal(state.tint, null, frame.id);
    assert.equal(state.fillTint, null, frame.id);
  }
});

test('rapid hits extend one owned flash window and cannot run a stale restoration', () => {
  const { state, target } = createTarget();
  let appearance = resolveOperativeFrameAppearance('player-ribbit-exe', 'player-lime', 0);
  const controller = new OperativeAppearanceController(target, () => appearance);
  controller.restore(0, true);
  controller.beginDamageFlash(10, 90);
  controller.beginDamageFlash(60, 90);
  appearance = resolveOperativeFrameAppearance('player-ribbit-exe', 'player-pink', 120);
  controller.update(100);
  assert.equal(state.fillTint, 0xffffff, 'the first hit deadline cannot restore over the later hit');
  controller.update(150);
  assert.equal(state.fillTint, null);
  assert.equal(state.tint, 0xff4df2);
  assert.equal(state.textureKey, 'player-premium-ribbit-exe');
});

test('Native-to-tint and tint-to-Native changes made during a flash restore the current mode', () => {
  const { state, target } = createTarget();
  let appearance = resolveOperativeFrameAppearance('player-air-superiority-complex', 'player-native', 0);
  const controller = new OperativeAppearanceController(target, () => appearance);
  controller.restore(0, true);

  controller.beginDamageFlash(10, 90);
  appearance = resolveOperativeFrameAppearance('player-air-superiority-complex', 'player-violet', 50);
  controller.update(100);
  assert.equal(state.textureKey, 'player-premium-air-superiority');
  assert.equal(state.tint, 0x9d6cff);

  controller.beginDamageFlash(110, 90);
  appearance = resolveOperativeFrameAppearance('player-air-superiority-complex', 'player-native', 150);
  controller.update(200);
  assert.equal(state.textureKey, 'player-premium-air-superiority-native');
  assert.equal(state.tint, null);
  assert.equal(state.fillTint, null);
});

test('premium Native, Cyan, Rose, Lime, and Prism modes all survive damage feedback', () => {
  for (const colorId of ['player-native', 'player-cyan', 'player-pink', 'player-lime', 'player-prism']) {
    const { state, target } = createTarget();
    const controller = new OperativeAppearanceController(
      target,
      (timeMs) => resolveOperativeFrameAppearance('player-eye-dont-like-that', colorId, timeMs)
    );
    controller.restore(1_000, true);
    controller.beginDamageFlash(1_010, 90);
    controller.update(1_100);
    const expected = resolveOperativeFrameAppearance('player-eye-dont-like-that', colorId, 1_100);
    assert.equal(state.textureKey, expected.textureKey, colorId);
    assert.equal(state.tint, expected.tint, colorId);
    assert.equal(state.fillTint, null, colorId);
  }
});

test('Player damage owns no delayed tint callback and Arena restores before early returns', () => {
  assert.doesNotMatch(playerSource, /delayedCall\(90/);
  assert.match(playerSource, /appearanceController\.beginDamageFlash\(now, 90\)/);
  assert.match(arenaSource, /const now = this\.time\.now;\s*\/\/ Presentation cleanup[\s\S]*?this\.player\.updatePresentation\(now\);/);
  assert.match(arenaSource, /setAppearanceResolver\(\(timeMs\) => SaveSystem\.getOperativeFrameAppearance\(timeMs\)\)/);
  assert.match(arenaSource, /restoreOperativeAppearance\(this\.time\.now, true\)/);
});
