import test from 'node:test';
import assert from 'node:assert/strict';
import { SFX_CATEGORIES, SFX_DEFINITIONS, createDefaultSoundVolumes } from '../src/game/config/audio.ts';
import { FIRE_HAZARD_BALANCE as FIRE, getFireExposureDamage } from '../src/game/config/fireHazards.ts';
import { PLAYER_BALANCE } from '../src/game/config/balance/index.ts';
import { BurningStatus } from '../src/game/hazards/BurningStatus.ts';

test('all mixer channels have one category, preserving the individual volume map', () => {
  const keys = SFX_CATEGORIES.flatMap(category => category.keys);
  assert.equal(SFX_CATEGORIES.length, 8);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual([...keys].sort(), SFX_DEFINITIONS.map(d => d.key).sort());
  assert.deepEqual(Object.keys(createDefaultSoundVolumes()).sort(), [...keys].sort());
  assert.ok(SFX_CATEGORIES.find(c => c.id === 'enemies').keys.includes('droneFlight'));
});

test('normal full activation deals 25–30 percent of unmodified health before burn', () => {
  const damage = getFireExposureDamage(FIRE.activeDurationMs - 1, 1, 'normal');
  assert.ok(Math.abs(damage - 35.7) < 1e-10);
  assert.ok(damage / PLAYER_BALANCE.maxHealth >= .25 && damage / PLAYER_BALANCE.maxHealth <= .30);
});

test('burn refreshes on contact, deals modest separated ticks after exit, and expires', () => {
  const burn = new BurningStatus();
  for (let now = 100; now <= 1100; now += 50) assert.equal(burn.update(now, true), 0);
  assert.equal(burn.expiresAt, 2350);
  let damage = 0;
  for (let now = 1150; now <= 2400; now += 50) damage += burn.update(now, false);
  assert.equal(damage, 4);
  assert.equal(burn.isActive(2400), false);
  assert.equal(burn.expiresAt, 0);
});

test('burn re-entry resets the tail and cleanup or a long gap never queues damage', () => {
  const burn = new BurningStatus();
  burn.update(100, true);
  assert.equal(burn.update(650, false), 2);
  burn.update(700, true);
  assert.equal(burn.update(1200, false), 0);
  assert.equal(burn.update(1250, false), 2);
  burn.reset();
  assert.equal(burn.update(1800, false), 0);
  burn.update(2000, true);
  assert.equal(burn.update(10000, false), 0);
});
