import test from 'node:test';
import assert from 'node:assert/strict';
import { BOMBLET_HAZARD_BALANCE } from '../src/game/config/bombletHazards.ts';
import { LASER_HAZARD_BALANCE } from '../src/game/config/laserHazards.ts';
import { getHazardDamageMultiplier, getScaledHazardDamage, HAZARD_DAMAGE_SCALING } from '../src/game/config/hazardScaling.ts';
import { BOSS_ARCHETYPES, getBossHealth, getBossRewards, isBossRound, selectBossArchetype } from '../src/game/config/bossBalance.ts';
import { rollModDrop } from '../src/game/mods/ModDropService.ts';

test('arena hazards gain one percent per round and stop at the configured cap', () => {
  assert.equal(getHazardDamageMultiplier(1), 1);
  assert.equal(getHazardDamageMultiplier(2), 1.01);
  assert.equal(getHazardDamageMultiplier(50), 1.49);
  assert.equal(getHazardDamageMultiplier(10_000), HAZARD_DAMAGE_SCALING.maximumMultiplier);
  assert.equal(getScaledHazardDamage(100, 10_000, 130), 130);
});

test('player hazard hit caps remain well below starting health', () => {
  assert.ok(LASER_HAZARD_BALANCE.maximumPlayerDamagePerHit < 100);
  assert.ok(BOMBLET_HAZARD_BALANCE.maximumPlayerDamage < 100);
  assert.ok(BOMBLET_HAZARD_BALANCE.enemyDamageBase > 0);
});

test('boss gates occur every fifth completed round with bounded progression rewards', () => {
  assert.equal(isBossRound(4), false);
  assert.equal(isBossRound(5), true);
  assert.equal(isBossRound(10), true);
  assert.equal(isBossRound(11), false);
  assert.equal(getBossHealth(5, 'overdrive'), 7200);
  assert.equal(getBossHealth(10, 'overdrive'), 9100);
  assert.ok(getBossHealth(10, 'overdrive') > getBossHealth(5, 'overdrive'));
  assert.ok(getBossHealth(500, 'overdrive') < Number.POSITIVE_INFINITY);
  const early = getBossRewards(5);
  const late = getBossRewards(50);
  assert.ok(early.credits > 0 && early.coreTokens > 0 && early.plasmaChips > 0);
  assert.ok(late.credits > early.credits);
  assert.ok(late.plasmaChips >= early.plasmaChips);
  assert.equal(early.plasmaChips, 6);
  assert.equal(late.plasmaChips, 14);
});

test('boss selection is deterministic and uses only the three unique archetypes', () => {
  const first = selectBossArchetype(5, 123456);
  assert.equal(selectBossArchetype(5, 123456), first);
  assert.ok(Object.hasOwn(BOSS_ARCHETYPES, first));
  assert.equal(new Set(Object.values(BOSS_ARCHETYPES).map((boss) => boss.texture)).size, 3);
});

test('boss rewards have a deterministic chance to produce a legendary Mod', () => {
  let legendarySeed = null;
  for (let seed = 1; seed <= 2000; seed += 1) {
    const drop = rollModDrop({ source: 'boss', round: 25, seed, sequence: 0, protocol: 'normal' });
    if (drop?.rarity === 'legendary') {
      legendarySeed = seed;
      break;
    }
  }
  assert.notEqual(legendarySeed, null);
  const repeated = rollModDrop({ source: 'boss', round: 25, seed: legendarySeed, sequence: 0, protocol: 'normal' });
  assert.equal(repeated?.rarity, 'legendary');
});
