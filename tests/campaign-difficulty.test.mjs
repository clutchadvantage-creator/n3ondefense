import test from 'node:test';
import assert from 'node:assert/strict';
import { getCampaignCombatPosition, getCampaignHazardAvailability } from '../src/game/progression/CampaignDifficulty.ts';
import { getCampaignProtocol } from '../src/game/progression/CampaignProgression.ts';
import { getDifficultyCurve, getSpawnProfile } from '../src/game/config/balance/index.ts';
import { getProtocolModeBalance } from '../src/game/config/modeBalance.ts';
import { getBossHealth, getBossDamageMultiplier } from '../src/game/config/bossBalance.ts';

test('combat pressure never resets at mode boundaries and stays within existing terminal caps', () => {
  let previous = { health: 0, damage: 0, speed: 0, count: 0, weight: 0, cadence: Infinity };
  for (const mode of ['normal', 'overdrive', 'supreme']) {
    for (let round = 1; round <= 30; round++) {
      const position = getCampaignCombatPosition(mode, round);
      const curve = getDifficultyCurve(position);
      const profile = getSpawnProfile(position, 0, mode);
      const multipliers = getProtocolModeBalance(getCampaignProtocol(mode, round));
      const current = {
        health: curve.healthMultiplier * multipliers.enemyHealthMultiplier,
        damage: curve.damageMultiplier * multipliers.enemyDamageMultiplier,
        speed: curve.speedMultiplier * multipliers.enemySpeedMultiplier,
        count: Math.round(profile.activeCountCap * multipliers.activePressureMultiplier),
        weight: profile.activeWeightCap * multipliers.activePressureMultiplier,
        // Compare the round curve independently: Normal's existing 0.92
        // mode cadence intentionally differs from Overdrive's 1.0.
        cadence: profile.defenseCadenceMs
      };
      for (const key of ['health', 'damage', 'speed', 'count', 'weight']) assert.ok(current[key] >= previous[key], `${mode} ${round} ${key}`);
      assert.ok(current.cadence <= previous.cadence);
      assert.ok(profile.activeCountCap <= 26);
      assert.ok(profile.activeWeightCap <= 39);
      assert.ok(curve.healthMultiplier <= 2.1 && curve.damageMultiplier <= 1.65 && curve.speedMultiplier <= 1.28);
      previous = current;
    }
  }
});

test('Normal teaches hazards in four stages while every later-mode round has the full sandbox', () => {
  for (let round = 1; round <= 30; round++) {
    const normal = getCampaignHazardAvailability('normal', round);
    assert.equal(normal.lasers, true);
    assert.equal(normal.bomblets, round >= 6);
    assert.equal(normal.gas, round >= 11);
    assert.equal(normal.fire, round >= 16);
    for (const mode of ['overdrive', 'supreme']) assert.ok(Object.values(getCampaignHazardAvailability(mode, round)).every(Boolean));
  }
});

test('boss base health and damage do not reset in later modes or exceed their historical capped inputs', () => {
  let previousHealth = 0;
  let previousDamage = 0;
  for (const mode of ['normal', 'overdrive', 'supreme']) {
    for (const round of [5, 10, 15, 20, 25, 30]) {
      const position = getCampaignCombatPosition(mode, round);
      const health = getBossHealth(position, mode);
      const damage = getBossDamageMultiplier(position, mode);
      assert.ok(health >= previousHealth);
      assert.ok(damage >= previousDamage);
      assert.ok(health <= getBossHealth(148, mode));
      assert.ok(damage <= getBossDamageMultiplier(148, mode));
      previousHealth = health;
      previousDamage = damage;
    }
  }
});
