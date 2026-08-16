import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENEMY_BALANCE, OBJECTIVE_BALANCE, getDifficultyCurve, getSpawnProfile } from '../src/game/config/balance/index.ts';
import {
  MODE_BALANCE,
  applyEnemyDamageMode,
  applyEnemyHealthMode,
  applyHazardDamageMode,
  getEnemyDefuseDuration,
  getModeSpawnCadence
} from '../src/game/config/modeBalance.ts';
import { getBossDamageMultiplier, getBossHealth, isBossRound } from '../src/game/config/bossBalance.ts';
import { getScaledHazardDamage } from '../src/game/config/hazardScaling.ts';
import {
  getEffectiveModRarityDropChance,
  getModDropChance,
  getModRarityProbability
} from '../src/game/mods/ModDropService.ts';
import { RUN_PROTOCOLS } from '../src/game/mods/modBalance.ts';
import { protocolStart } from '../src/game/mods/ModRules.ts';
import { nextPickupBuffStack, resourcePickupCap } from '../src/game/player/OverdriveRules.ts';

const arenaSource = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');

test('mode tuning is centralized and preserves Overdrive as the combat baseline', () => {
  assert.deepEqual(
    {
      health: MODE_BALANCE.normal.enemyHealthMultiplier,
      damage: MODE_BALANCE.normal.enemyDamageMultiplier,
      hazard: MODE_BALANCE.normal.hazardDamageMultiplier,
      defuse: MODE_BALANCE.normal.enemyDefuseTimeMultiplier,
      cadence: MODE_BALANCE.normal.spawnCadenceMultiplier,
      bossHealth: MODE_BALANCE.normal.bossHealthMultiplier,
      bossDamage: MODE_BALANCE.normal.bossDamageMultiplier
    },
    { health: 0.76, damage: 0.72, hazard: 0.7, defuse: 1.32, cadence: 0.92, bossHealth: 0.76, bossDamage: 0.78 }
  );
  for (const key of ['enemyHealthMultiplier', 'enemyDamageMultiplier', 'hazardDamageMultiplier', 'enemyDefuseTimeMultiplier', 'spawnCadenceMultiplier', 'bossHealthMultiplier', 'bossDamageMultiplier']) {
    assert.equal(MODE_BALANCE.overdrive[key], 1, `${key} should use the established Overdrive baseline`);
  }
  assert.equal(MODE_BALANCE.normal.enemySpeedMultiplier, 1);
  assert.equal(MODE_BALANCE.overdrive.enemySpeedMultiplier, 1);
});

test('same-round enemy stats, hazard damage, defuse duration, and cadence differ directly by mode', () => {
  const round = 12;
  const curve = getDifficultyCurve(round, 2);
  const scaledHealth = ENEMY_BALANCE.tank.hp * curve.healthMultiplier;
  const scaledDamage = ENEMY_BALANCE.tank.damage * curve.damageMultiplier;
  const normalHealth = applyEnemyHealthMode(scaledHealth, 'normal');
  const overdriveHealth = applyEnemyHealthMode(scaledHealth, 'overdrive');
  const normalDamage = applyEnemyDamageMode(scaledDamage, 'normal');
  const overdriveDamage = applyEnemyDamageMode(scaledDamage, 'overdrive');
  assert.ok(Math.abs(normalHealth / overdriveHealth - 0.76) < 1e-12);
  assert.ok(Math.abs(normalDamage / overdriveDamage - 0.72) < 1e-12);

  const scaledHazard = getScaledHazardDamage(16, round, 30);
  assert.equal(applyHazardDamageMode(scaledHazard, 'normal'), scaledHazard * 0.7);
  assert.equal(applyHazardDamageMode(scaledHazard, 'overdrive'), scaledHazard);
  assert.equal(getEnemyDefuseDuration(OBJECTIVE_BALANCE.defuseRequiredMs, 'normal'), 13_200);
  assert.equal(getEnemyDefuseDuration(OBJECTIVE_BALANCE.defuseRequiredMs, 'overdrive'), 10_000);

  const profile = getSpawnProfile(round, 2);
  assert.equal(getModeSpawnCadence(profile.defenseCadenceMs, 'normal'), profile.defenseCadenceMs * 0.92);
  assert.equal(getModeSpawnCadence(profile.defenseCadenceMs, 'overdrive'), profile.defenseCadenceMs);
  assert.equal(profile.activeCountCap, getSpawnProfile(round, 2).activeCountCap);
  assert.equal(profile.activeWeightCap, getSpawnProfile(round, 2).activeWeightCap);
});

test('same boss keeps its schedule and attack scaling while Normal is more forgiving', () => {
  assert.equal(isBossRound(5), true);
  assert.equal(isBossRound(10), true);
  assert.equal(isBossRound(6), false);
  assert.equal(getBossHealth(20, 'normal'), Math.round(getBossHealth(20, 'overdrive') * 0.76));
  assert.ok(Math.abs(getBossDamageMultiplier(20, 'normal') / getBossDamageMultiplier(20, 'overdrive') - 0.78) < 1e-12);
});

test('pickup caps remain x1/100% in Normal and x2/200% in Overdrive', () => {
  assert.equal(nextPickupBuffStack(1, true, false), 1);
  assert.equal(nextPickupBuffStack(1, true, true), 2);
  assert.equal(nextPickupBuffStack(2, true, true), 2);
  assert.equal(resourcePickupCap(130, false), 130);
  assert.equal(resourcePickupCap(130, true), 260);
  assert.equal(MODE_BALANCE.normal.overhealthEnabled, false);
  assert.equal(MODE_BALANCE.normal.overchargeEnabled, false);
  assert.equal(MODE_BALANCE.overdrive.overhealthEnabled, true);
  assert.equal(MODE_BALANCE.overdrive.overchargeEnabled, true);
});

test('Normal always starts at Round 1 while unlocked Overdrive tiers keep their starts', () => {
  assert.equal(protocolStart('normal', 999).startingRound, 1);
  assert.equal(MODE_BALANCE.normal.usesUnlockedStartingRounds, false);
  assert.equal(protocolStart('overdrive', 8).startingRound, 5);
  assert.equal(protocolStart('overdrive-orion', 13).startingRound, 10);
  assert.equal(protocolStart('overdrive-andromeda', 43).startingRound, 40);
  assert.equal(MODE_BALANCE.overdrive.usesUnlockedStartingRounds, true);
});

test('Overdrive improves one authoritative Mod chance and rarity roll without excluding Normal Legendaries', () => {
  const sources = ['normalEnemy', 'eliteEnemy', 'milestone', 'boss'];
  for (const source of sources) {
    const normal = { source, round: 25, seed: 1, sequence: 0, protocol: 'normal' };
    const overdrive = { ...normal, protocol: 'overdrive' };
    assert.equal(getModDropChance(overdrive), Math.min(1, getModDropChance(normal) * 1.35));
  }

  const normalBoss = { source: 'boss', round: 25, seed: 1, sequence: 0, protocol: 'normal' };
  const overdriveBoss = { ...normalBoss, protocol: 'overdrive' };
  const normalLegendary = getEffectiveModRarityDropChance(normalBoss, 'legendary');
  const overdriveLegendary = getEffectiveModRarityDropChance(overdriveBoss, 'legendary');
  assert.ok(normalLegendary > 0);
  assert.ok(overdriveLegendary > normalLegendary);
  assert.ok(getModRarityProbability(overdriveBoss, 'legendary') > getModRarityProbability(normalBoss, 'legendary'));
  assert.ok(overdriveLegendary < 0.2, 'Legendary boss rewards should remain rare');
  assert.equal(RUN_PROTOCOLS.overdrive.modDropMultiplier, MODE_BALANCE.overdrive.modDropChanceMultiplier);
});

test('Arena applies mode rules at the authoritative pipelines rather than duplicating round curves', () => {
  assert.match(arenaSource, /applyEnemyHealthMode\(/);
  assert.match(arenaSource, /applyEnemyDamageMode\(/);
  assert.match(arenaSource, /getModeSpawnCadence\(/);
  assert.match(arenaSource, /getEnemyDefuseDuration\(/);
  assert.match(arenaSource, /new BossEncounter\([\s\S]*?this\.currentModeFamily\(\)/);
  assert.match(arenaSource, /new LaserSecuritySystem\([\s\S]*?hazardDamageMultiplier/);
  assert.match(arenaSource, /new BombletHazardSystem\([\s\S]*?hazardDamageMultiplier/);
});
