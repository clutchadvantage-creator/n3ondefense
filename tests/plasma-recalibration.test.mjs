import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOD_BY_ID } from '../src/game/mods/definitions.ts';
import { addModDrop, createDefaultModCollection, equipMod } from '../src/game/mods/ModInventoryService.ts';
import { normalizeModCollection } from '../src/game/mods/ModSaveNormalizer.ts';
import { ModRuntime } from '../src/game/mods/ModRuntime.ts';
import {
  PLASMA_RECALIBRATION_BALANCE,
  applyPlasmaRecalibration,
  getEffectiveModModifiers,
  getRecalibrationCandidatePool,
  getRecalibrationSlots,
  resolveCalibrationModifier,
  rollPlasmaRecalibrationCandidate
} from '../src/game/mods/PlasmaRecalibration.ts';
import { LOWER_IS_BETTER_MOD_STATS } from '../src/game/mods/types.ts';

const definition = (id) => {
  const value = MOD_BY_ID.get(id);
  assert.ok(value, `missing ${id}`);
  return value;
};

const cardFor = (id, rank = 0) => ({
  instanceId: `${id}-fixture`, modId: id, acquiredAt: '2026-01-01T00:00:00.000Z', upgradeLevel: rank
});

test('Plasma Recalibration uses the exact configured cost, reveal duration, and 90/10 quality split', () => {
  assert.equal(PLASMA_RECALIBRATION_BALANCE.rollCost, 125);
  assert.ok(PLASMA_RECALIBRATION_BALANCE.revealDurationMs >= 800);
  assert.ok(PLASMA_RECALIBRATION_BALANCE.revealDurationMs <= 1500);
  assert.deepEqual(PLASMA_RECALIBRATION_BALANCE.qualityWeights, {
    optimal: .15, enhanced: .40, stable: .35, degraded: .08, misaligned: .02
  });
  assert.equal(Object.values(PLASMA_RECALIBRATION_BALANCE.qualityWeights).reduce((sum, value) => sum + value, 0), 1);
});

test('stat capacity comes from each actual Mod and never from rarity', () => {
  assert.equal(getRecalibrationSlots(definition('calibrated-barrel')).length, 1);
  assert.equal(getRecalibrationSlots(definition('field-medic')).length, 2);
  assert.equal(getRecalibrationSlots(definition('architect-prime')).length, 5);
  assert.equal(getRecalibrationSlots(definition('split-current')).length, 1, 'legacy compound arc is one replaceable slot');
  assert.equal(getRecalibrationSlots(definition('emergency-capacitor')).length, 0, 'unique ability has no ordinary slot');
});

test('Corrupted drawbacks remain identity-locked while their intended positive slots can be engineered', () => {
  for (const [id, protectedSlots] of [
    ['ruptured-heat-sink', [1]], ['glass-cannon', [1]], ['volatile-reactor', [2]], ['black-star-engine', [3, 4]]
  ]) {
    const slots = getRecalibrationSlots(definition(id));
    assert.deepEqual(slots.filter((slot) => slot.protected).map((slot) => slot.slotIndex), protectedSlots, id);
    assert.ok(slots.some((slot) => !slot.protected), `${id} must retain a safe positive slot`);
  }
  assert.equal(getRecalibrationSlots(definition('fractured-current')).length, 0, 'fully bespoke Corrupted identity stays immutable');
});

test('candidate pools stay within the native system and exclude every active stat', () => {
  const turret = definition('siege-firmware');
  const turretCard = cardFor(turret.id);
  const active = new Set(turret.modifiers.map((modifier) => modifier.stat));
  const pool = getRecalibrationCandidatePool(turret, turretCard);
  assert.ok(pool.length > 0);
  assert.ok(pool.every((stat) => stat.startsWith('turret')));
  assert.ok(pool.every((stat) => !active.has(stat)));

  const mine = getRecalibrationCandidatePool(definition('cataclysm-mines'), cardFor('cataclysm-mines'));
  assert.ok(mine.every((stat) => stat.startsWith('mine')));
  assert.ok(!mine.some((stat) => stat.startsWith('player') || stat.startsWith('turret')));
});

test('quality selection hits every configured band and weak rolls remain beneficial in the correct direction', () => {
  const mod = definition('calibrated-barrel');
  const qualityRolls = [
    [.10, 'optimal'], [.20, 'enhanced'], [.60, 'stable'], [.93, 'degraded'], [.995, 'misaligned']
  ];
  for (const [qualityRoll, expected] of qualityRolls) {
    const values = [0, qualityRoll, 0];
    const rolled = rollPlasmaRecalibrationCandidate(mod, cardFor(mod.id), () => values.shift());
    assert.equal(rolled.ok, true);
    assert.equal(rolled.candidate.quality, expected);
    const modifier = resolveCalibrationModifier(rolled.candidate);
    assert.ok(modifier);
    const rank3 = modifier.values[3];
    if (LOWER_IS_BETTER_MOD_STATS.has(modifier.stat)) assert.ok(rank3 > 0 && rank3 < 1, modifier.stat);
    else if (modifier.mode === 'multiply') assert.ok(rank3 > 1, modifier.stat);
    else assert.ok(rank3 > 0, modifier.stat);
  }
});

test('accepting a candidate replaces one slot, cannot create a third stat, and scales through later ranks', () => {
  const mod = definition('field-medic');
  const card = cardFor(mod.id, 1);
  const rolled = rollPlasmaRecalibrationCandidate(mod, card, (() => {
    const values = [0, .2, .75];
    return () => values.shift();
  })());
  assert.equal(rolled.ok, true);
  assert.equal(applyPlasmaRecalibration(card, mod, 0, rolled.candidate).ok, true);
  assert.equal(card.calibrations.length, 1);
  assert.equal(getEffectiveModModifiers(mod, card).length, 2);
  const calibrated = getEffectiveModModifiers(mod, card)[0];
  assert.notEqual(calibrated.stat, mod.modifiers[0].stat);
  assert.notEqual(calibrated.values[1], calibrated.values[3]);
  assert.ok(Math.abs(calibrated.mode === 'add'
    ? calibrated.values[3]
    : calibrated.values[3] - 1) > Math.abs(calibrated.mode === 'add'
      ? calibrated.values[1]
      : calibrated.values[1] - 1));
  assert.equal(applyPlasmaRecalibration(card, mod, 99, rolled.candidate).ok, false);
});

test('Split Current replacement disables its native arc and activates only the calibrated stat', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'split-current');
  const card = mods.cards[0];
  const mod = definition('split-current');
  const candidate = { stat: 'weaponDamage', mode: 'multiply', quality: 'enhanced', normalizedPower: .8 };
  assert.equal(applyPlasmaRecalibration(card, mod, 0, candidate).ok, true);
  assert.equal(equipMod(mods, 'weapon', mod.id, card.instanceId).ok, true);
  const runtime = new ModRuntime(mods);
  assert.equal(runtime.nativeSlotActive('split-current', 0), false);
  assert.ok(runtime.multiplier('weaponDamage') > 1);
  assert.equal(runtime.snapshot()[0].calibrations[0].stat, 'weaponDamage');
});

test('old saves default to native stats and malformed calibration data is discarded safely', () => {
  const raw = createDefaultModCollection();
  addModDrop(raw, 'glass-cannon');
  raw.cards[0].calibrations = [
    { slotIndex: 1, stat: 'weaponDamage', mode: 'multiply', quality: 'optimal', normalizedPower: 1, calibratedAt: 'bad-protected' },
    { slotIndex: 0, stat: 'turretDamage', mode: 'multiply', quality: 'optimal', normalizedPower: 1, calibratedAt: 'bad-system' }
  ];
  const normalized = normalizeModCollection(raw);
  assert.equal(normalized.cards[0].calibrations?.length ?? 0, 0, 'protected and cross-system calibration data is rejected');

  const legacy = createDefaultModCollection();
  addModDrop(legacy, 'calibrated-barrel');
  const old = normalizeModCollection(legacy);
  assert.equal(old.cards[0].calibrations, undefined);
  assert.deepEqual(getEffectiveModModifiers(definition('calibrated-barrel'), old.cards[0]), definition('calibrated-barrel').modifiers);
});

test('profile transaction layer spends exactly once before reveal and never refunds Keep Current', () => {
  const store = readFileSync(new URL('../src/game/state/PlayerProfileStore.ts', import.meta.url), 'utf8');
  const roll = store.slice(store.indexOf('static rollPlasmaRecalibration'), store.indexOf('static applyPlasmaRecalibration'));
  assert.equal((roll.match(/save\.mods\.plasmaChips -= cost/g) ?? []).length, 1);
  assert.match(roll, /PlayerProfileStore\.save\(\)/);
  assert.doesNotMatch(roll, /plasmaChips \+=|refund/i);
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  assert.match(garage, /PLASMA RECALIBRATION/);
  assert.match(garage, /CURRENT CALIBRATION RETAINED \/\/ ROLL COST SPENT/);
  assert.match(garage, /configureSceneUiNavigation/);
});
