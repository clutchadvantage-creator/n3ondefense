import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETICS, getCosmeticDisplayColor, getCosmeticTextureKey, getPrismColor } from '../src/data/cosmetics.ts';
import { UPGRADE_DEFINITIONS, getUpgradeEffect } from '../src/data/upgrades.ts';
import { ABILITY_BALANCE, PICKUP_BALANCE, PLAYER_BALANCE, WEAPON_BALANCE } from '../src/game/config/balance/index.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const maximumLevels = Object.fromEntries(UPGRADE_DEFINITIONS.map((definition) => [definition.id, definition.maxLevel]));

test('fully upgraded energy still depletes under sustained weapon use', () => {
  const capacity = PLAYER_BALANCE.energyMax + getUpgradeEffect(maximumLevels, 'player.energyMax');
  const regeneration = PLAYER_BALANCE.energyRegenPerSecond + getUpgradeEffect(maximumLevels, 'player.energyRegen');
  const heatPerShot = Math.max(WEAPON_BALANCE.minimumHeatPerShot, WEAPON_BALANCE.heatPerShot + getUpgradeEffect(maximumLevels, 'weapon.heatEfficiency'));
  const fireRate = Math.min(WEAPON_BALANCE.maximumFireRate, WEAPON_BALANCE.fireRate + getUpgradeEffect(maximumLevels, 'weapon.fireRate'));
  const sustainedShotRate = Math.min(fireRate, WEAPON_BALANCE.cooldownRate / heatPerShot);
  assert.equal(capacity, 160);
  assert.equal(regeneration, 2);
  assert.ok(sustainedShotRate * WEAPON_BALANCE.energyCostPerShot > regeneration);
  assert.equal(capacity * 0.5, 80);
  assert.equal(PICKUP_BALANCE.enemyDropChance * PICKUP_BALANCE.energyShare, 0.025);
  assert.equal(PICKUP_BALANCE.energyRestoreFraction, 0.5);
});

test('operative shield duration upgrades monotonically to five seconds', () => {
  const definition = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === 'player.shieldDuration');
  assert.ok(definition);
  let previous = ABILITY_BALANCE.shield.durationMs;
  for (let level = 1; level <= definition.maxLevel; level += 1) {
    const duration = Math.min(ABILITY_BALANCE.shield.maximumDurationMs, ABILITY_BALANCE.shield.durationMs + definition.effectPerLevel * level);
    assert.ok(duration > previous);
    previous = duration;
  }
  assert.equal(previous, 5000);
});

test('projectile shape cosmetics are unique, renderable, and migrate into existing profiles', () => {
  const ids = COSMETICS.map((cosmetic) => cosmetic.id);
  assert.equal(new Set(ids).size, ids.length);
  const shapes = COSMETICS.filter((cosmetic) => cosmetic.category === 'projectileShape');
  assert.deepEqual(shapes.map((cosmetic) => cosmetic.visualShape), ['pulse', 'missile', 'lightning', 'orb']);
  for (const cosmetic of shapes) assert.ok(getCosmeticTextureKey(cosmetic.id, '').startsWith('projectile-'));

  const save = createDefaultLocalSave('cosmetic-test', 'Cosmetic Test');
  assert.equal(save.cosmetics.equipped.projectileShape, 'projectile-shape-pulse');
  const migrated = normalizeLocalSave({ ...save, cosmetics: { ...save.cosmetics, equipped: { playerColor: 'player-cyan' } } });
  assert.equal(migrated?.cosmetics.equipped.projectileShape, 'projectile-shape-pulse');
});

test('the Starhopper is a renderable side-view operative frame', () => {
  const frame = COSMETICS.find((cosmetic) => cosmetic.id === 'player-spaceship');
  assert.ok(frame);
  assert.equal(frame.category, 'playerShape');
  assert.equal(frame.visualShape, 'spaceship');
  assert.equal(getCosmeticTextureKey(frame.id, ''), 'player-spaceship');
});

test('the clover, ice cream, and airplane operative frames are uniquely renderable', () => {
  const expectedFrames = [
    ['player-clover', 'clover', 'player-clover'],
    ['player-ice-cream', 'iceCream', 'player-ice-cream'],
    ['player-airplane', 'airplane', 'player-airplane']
  ];
  for (const [id, shape, texture] of expectedFrames) {
    const frame = COSMETICS.find((cosmetic) => cosmetic.id === id);
    assert.ok(frame);
    assert.equal(frame.category, 'playerShape');
    assert.equal(frame.visualShape, shape);
    assert.equal(getCosmeticTextureKey(frame.id, ''), texture);
  }
});

test('every color-driven cosmetic category has a cycling prism option', () => {
  const expectedCategories = ['playerColor', 'projectileColor', 'trailColor', 'bombColor', 'turretSkin', 'fenceStyle', 'dashTrail'];
  const prismItems = COSMETICS.filter((cosmetic) => cosmetic.colorMode === 'prism');
  assert.deepEqual(prismItems.map((cosmetic) => cosmetic.category), expectedCategories);
  assert.notEqual(getPrismColor(0), getPrismColor(800));
  for (const item of prismItems) {
    const color = getCosmeticDisplayColor(item, 1200);
    assert.ok(Number.isInteger(color));
    assert.ok(color >= 0 && color <= 0xffffff);
  }
});
