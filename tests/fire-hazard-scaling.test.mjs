import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIRE_HAZARD_BALANCE,
  getFireExposureDamage,
  getFireExposurePulseCount,
  getFireHazardDamageProfile
} from '../src/game/config/fireHazards.ts';
import { getScaledHazardDamage } from '../src/game/config/hazardScaling.ts';
import { getProtocolModeBalance } from '../src/game/config/modeBalance.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `expected ${expected}, received ${actual}`);

test('fire resolves through the authoritative round curve and exact protocol multiplier', () => {
  for (const [round, protocol] of [
    [5, 'normal'], [25, 'normal'], [45, 'normal'],
    [5, 'overdrive'], [30, 'overdrive'], [50, 'overdrive'],
    [51, 'supreme-leo'], [75, 'supreme-scorpius'], [100, 'supreme-centaurus']
  ]) {
    const expected = getScaledHazardDamage(
      FIRE_HAZARD_BALANCE.playerDamagePerPulse,
      round,
      FIRE_HAZARD_BALANCE.maximumPlayerDamagePerPulse
    ) * getProtocolModeBalance(protocol).hazardDamageMultiplier;
    approximately(getFireHazardDamageProfile(round, protocol).damagePerPulse, expected);
  }
});

test('fire pressure rises within Normal, Overdrive, and Supreme without bypassing the shared cap', () => {
  const normal = [5, 25, 45].map((round) => getFireHazardDamageProfile(round, 'normal').damagePerPulse);
  const overdrive = [5, 30, 50].map((round) => getFireHazardDamageProfile(round, 'overdrive').damagePerPulse);
  const supreme = [
    getFireHazardDamageProfile(51, 'supreme-leo').damagePerPulse,
    getFireHazardDamageProfile(75, 'supreme-scorpius').damagePerPulse,
    getFireHazardDamageProfile(100, 'supreme-centaurus').damagePerPulse
  ];
  for (const series of [normal, overdrive, supreme]) {
    assert.ok(series[0] < series[1] && series[1] < series[2]);
  }
  assert.ok(normal.at(-1) < overdrive.at(-1));
  assert.ok(overdrive.at(-1) < supreme[0]);
  approximately(
    getFireHazardDamageProfile(10_000, 'supreme-centaurus').damagePerPulse,
    FIRE_HAZARD_BALANCE.maximumPlayerDamagePerPulse
      * getProtocolModeBalance('supreme-centaurus').hazardDamageMultiplier
  );
});

test('sustained fire uses a deterministic cadence compatible with operative invulnerability', () => {
  assert.ok(FIRE_HAZARD_BALANCE.damagePulseIntervalMs >= 500);
  assert.equal(getFireExposurePulseCount(0), 1);
  assert.equal(getFireExposurePulseCount(500), 1);
  assert.equal(getFireExposurePulseCount(1_000), 2);
  assert.equal(getFireExposurePulseCount(1_100), 3);
  assert.equal(getFireExposurePulseCount(-1), 0);
  const profile = getFireHazardDamageProfile(30, 'overdrive');
  approximately(getFireExposureDamage(1_100, 30, 'overdrive'), profile.damagePerPulse * 3);
});

test('continuous exposure produces the same pulse total from 15 through 144 FPS', () => {
  const exposureMs = 1_100;
  const simulate = (fps) => {
    const frameMs = 1_000 / fps;
    let delivered = 0;
    for (let now = 0; now <= exposureMs; now += frameMs) {
      const due = 1 + Math.floor(now / FIRE_HAZARD_BALANCE.damagePulseIntervalMs);
      if (due > delivered) delivered = due;
    }
    return delivered;
  };
  for (const fps of [15, 30, 60, 120, 144]) assert.equal(simulate(fps), 3, `${fps} FPS`);
});

test('Arena and HEIST inject resolved profiles while shared fire owns no static difficulty formula', () => {
  const shared = source('../src/game/hazards/SharedFireTrapSystem.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const heist = source('../src/game/anomalies/heist/HeistTrapSystem.ts');
  assert.match(shared, /damageProfile: FireHazardDamageProfile/);
  assert.match(shared, /damageContactStartedAt/);
  assert.match(shared, /damagePulsesDelivered/);
  assert.doesNotMatch(shared, /damagePerTick|damageIntervalMs|\?\? 4\.2|\?\? 260/);
  assert.match(arena, /damageProfile: getFireHazardDamageProfile\(round, this\.protocol\)/);
  assert.match(heist, /damageProfile: getFireHazardDamageProfile\(difficulty\.round, difficulty\.protocol\)/);
});
