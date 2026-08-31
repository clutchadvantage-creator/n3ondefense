import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOD_BY_ID, MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { addModDrop, createDefaultModCollection, equipMod } from '../src/game/mods/ModInventoryService.ts';
import { normalizeModCollection } from '../src/game/mods/ModSaveNormalizer.ts';
import { ModRuntime } from '../src/game/mods/ModRuntime.ts';
import {
  PLASMA_RECALIBRATION_BALANCE,
  applyPlasmaRecalibration,
  getEffectiveModModifiers,
  getApplicableRecalibrationSlots,
  getRecalibrationCandidatePool,
  getRecalibrationSlots,
  isModRecalibrated,
  isModRecalibrationEligible,
  resetPlasmaRecalibrationTransaction,
  resetPlasmaRecalibrationToNative,
  resolveModStatState,
  resolveCalibrationModifier,
  rollPlasmaRecalibrationCandidate
} from '../src/game/mods/PlasmaRecalibration.ts';
import { LOWER_IS_BETTER_MOD_STATS } from '../src/game/mods/types.ts';
import { modStatEvents } from '../src/game/mods/ModStatEvents.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

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

test('candidate pools use the universal gameplay matrix and retain native stats for overclock rolls', () => {
  const temporal = definition('temporal-sovereign');
  const temporalCard = cardFor(temporal.id, 3);
  const pool = getRecalibrationCandidatePool(temporal, temporalCard);
  assert.ok(pool.length > 0);
  assert.ok(pool.includes('playerMoveSpeed'), 'native stats remain rollable');
  assert.ok(pool.includes('weaponDamage'), 'weapon stats cross into player Mods');
  assert.ok(pool.includes('mineDamage'), 'mine stats cross into player Mods');
  assert.ok(pool.includes('turretMaxActive'), 'ability-capacity stats participate in the matrix');

  assert.deepEqual(getApplicableRecalibrationSlots(temporal, temporalCard, 'playerMoveSpeed').map((slot) => slot.slotIndex), [0]);
  assert.equal(getApplicableRecalibrationSlots(temporal, temporalCard, 'mineDamage').length, 4);
});

test('a rare optimal same-stat roll can exceed the original Legendary native stat', () => {
  const temporal = definition('temporal-sovereign');
  const card = cardFor(temporal.id, 3);
  const pool = getRecalibrationCandidatePool(temporal, card);
  const moveSpeedIndex = pool.indexOf('playerMoveSpeed');
  assert.ok(moveSpeedIndex >= 0);
  const values = [(moveSpeedIndex + .1) / pool.length, .1, .999999];
  const rolled = rollPlasmaRecalibrationCandidate(temporal, card, () => values.shift());
  assert.equal(rolled.candidate.stat, 'playerMoveSpeed');
  const modifier = resolveCalibrationModifier(rolled.candidate);
  assert.ok(modifier.values[3] > temporal.modifiers[0].values[3]);
  assert.equal(applyPlasmaRecalibration(card, temporal, 1, rolled.candidate).ok, false, 'same stat cannot duplicate into another slot');
  assert.equal(applyPlasmaRecalibration(card, temporal, 0, rolled.candidate).ok, true, 'native slot accepts its overclock');
});

test('quality selection hits every configured band and weak rolls remain beneficial in the correct direction', () => {
  const mod = definition('calibrated-barrel');
  const qualityRolls = [
    [.10, 'optimal'], [.20, 'enhanced'], [.60, 'stable'], [.93, 'degraded'], [.995, 'misaligned']
  ];
  for (const [qualityRoll, expected] of qualityRolls) {
    const values = [0, qualityRoll, 0];
    const rolled = rollPlasmaRecalibrationCandidate(mod, cardFor(mod.id, 3), () => values.shift());
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
  const card = cardFor(mod.id, 3);
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
  card.upgradeLevel = 3;
  const mod = definition('split-current');
  const candidate = { stat: 'weaponDamage', mode: 'multiply', quality: 'enhanced', normalizedPower: .8 };
  assert.equal(applyPlasmaRecalibration(card, mod, 0, candidate).ok, true);
  assert.equal(equipMod(mods, 'weapon', mod.id, card.instanceId).ok, true);
  const runtime = new ModRuntime(mods);
  assert.equal(runtime.nativeSlotActive('split-current', 0), false);
  assert.ok(runtime.multiplier('weaponDamage') > 1);
  assert.equal(runtime.snapshot()[0].calibrations[0].stat, 'weaponDamage');
});

test('old saves default to native stats, cross-system rolls survive, and protected data is discarded safely', () => {
  const raw = createDefaultModCollection();
  addModDrop(raw, 'glass-cannon');
  raw.cards[0].calibrations = [
    { slotIndex: 1, stat: 'weaponDamage', mode: 'multiply', quality: 'optimal', normalizedPower: 1, calibratedAt: 'bad-protected' },
    { slotIndex: 0, stat: 'turretDamage', mode: 'multiply', quality: 'optimal', normalizedPower: 1, calibratedAt: 'bad-system' }
  ];
  const normalized = normalizeModCollection(raw);
  assert.equal(normalized.cards[0].calibrations?.length ?? 0, 1, 'cross-system calibration is valid while protected data is rejected');
  assert.equal(normalized.cards[0].calibrations[0].stat, 'turretDamage');

  const legacy = createDefaultModCollection();
  addModDrop(legacy, 'calibrated-barrel');
  const old = normalizeModCollection(legacy);
  assert.equal(old.cards[0].calibrations, undefined);
  assert.deepEqual(getEffectiveModModifiers(definition('calibrated-barrel'), old.cards[0]), definition('calibrated-barrel').modifiers);
});

test('only the definition max rank is eligible for new Plasma Recalibration rolls', () => {
  const mod = definition('calibrated-barrel');
  for (const rank of [0, 1, 2]) {
    const card = cardFor(mod.id, rank);
    assert.equal(isModRecalibrationEligible(mod, card), false);
    assert.equal(rollPlasmaRecalibrationCandidate(mod, card, () => 0).ok, false);
  }
  const maxed = cardFor(mod.id, mod.maxRank);
  assert.equal(isModRecalibrationEligible(mod, maxed), true);
  assert.equal(rollPlasmaRecalibrationCandidate(mod, maxed, () => 0).ok, true);
});

test('canonical state keeps native definitions immutable and derives feather/star from current values', () => {
  const mod = definition('calibrated-barrel');
  const card = cardFor(mod.id, 3);
  const original = structuredClone(mod.modifiers);
  const native = resolveModStatState(mod, card);
  assert.equal(native.presentation, 'native');
  assert.equal(native.recalibrated, false);
  assert.deepEqual(native.effectiveStats, native.nativeStats);

  assert.equal(applyPlasmaRecalibration(card, mod, 0, {
    stat: 'mineDamage', mode: 'multiply', quality: 'optimal', normalizedPower: .94
  }).ok, true);
  const calibrated = resolveModStatState(mod, card);
  assert.equal(calibrated.presentation, 'recalibrated');
  assert.equal(isModRecalibrated(mod, card), true);
  assert.notDeepEqual(calibrated.effectiveStats, calibrated.nativeStats);
  assert.deepEqual(mod.modifiers, original, 'instance overrides never mutate canonical native definitions');

  assert.equal(resetPlasmaRecalibrationToNative(card, mod).ok, true);
  const reset = resolveModStatState(mod, card);
  assert.equal(reset.presentation, 'native');
  assert.deepEqual(reset.effectiveStats, reset.nativeStats);
  assert.deepEqual(mod.modifiers, original);
});

test('Reset to Native is an atomic 75-chip instance transaction and preserves infusion/equip identity', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'calibrated-barrel');
  const card = mods.cards[0];
  card.upgradeLevel = 3;
  card.infusionId = 'arcade-pop';
  assert.equal(equipMod(mods, 'weapon', card.modId, card.instanceId).ok, true);
  assert.equal(applyPlasmaRecalibration(card, definition(card.modId), 0, {
    stat: 'mineDamage', mode: 'multiply', quality: 'enhanced', normalizedPower: .8
  }).ok, true);
  mods.plasmaChips = 75;
  const loadoutBefore = structuredClone(mods.loadouts);
  const result = resetPlasmaRecalibrationTransaction(mods, card.instanceId);
  assert.equal(result.ok, true);
  assert.equal(result.cost, 75);
  assert.equal(mods.plasmaChips, 0);
  assert.equal(card.calibrations, undefined);
  assert.equal(card.infusionId, 'arcade-pop');
  assert.deepEqual(mods.loadouts, loadoutBefore);
  assert.equal(resolveModStatState(definition(card.modId), card).presentation, 'native');
});

test('invalid Reset to Native paths never spend chips or partially mutate the card', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'calibrated-barrel');
  const card = mods.cards[0];
  card.upgradeLevel = 3;
  mods.plasmaChips = 75;
  assert.equal(resetPlasmaRecalibrationTransaction(mods, card.instanceId).ok, false, 'native card cannot reset');
  assert.equal(mods.plasmaChips, 75);

  assert.equal(applyPlasmaRecalibration(card, definition(card.modId), 0, {
    stat: 'mineDamage', mode: 'multiply', quality: 'enhanced', normalizedPower: .8
  }).ok, true);
  const calibration = structuredClone(card.calibrations);
  mods.plasmaChips = 74;
  assert.equal(resetPlasmaRecalibrationTransaction(mods, card.instanceId).ok, false, 'insufficient funds cannot reset');
  assert.equal(mods.plasmaChips, 74);
  assert.deepEqual(card.calibrations, calibration);
  assert.equal(resetPlasmaRecalibrationTransaction(mods, 'missing-card').ok, false);
  assert.equal(mods.plasmaChips, 74);
  assert.deepEqual(card.calibrations, calibration);
});

test('every recalibratable definition restores its exact native stat set losslessly', () => {
  for (const mod of MOD_DEFINITIONS) {
    const card = cardFor(mod.id, mod.maxRank);
    const pool = getRecalibrationCandidatePool(mod, card);
    if (!pool.length || !isModRecalibrationEligible(mod, card)) continue;
    const stat = pool[0];
    const slot = getApplicableRecalibrationSlots(mod, card, stat)[0];
    assert.ok(slot, `${mod.id} requires an applicable test slot`);
    const mode = resolveCalibrationModifier({ stat, mode: 'multiply', normalizedPower: .77 })
      ? 'multiply'
      : 'add';
    const candidate = { stat, mode, quality: 'enhanced', normalizedPower: .77 };
    const nativeBefore = structuredClone(resolveModStatState(mod, card).nativeStats);
    const applied = applyPlasmaRecalibration(card, mod, slot.slotIndex, candidate);
    if (!applied.ok && mode === 'multiply') {
      candidate.mode = 'add';
      assert.equal(applyPlasmaRecalibration(card, mod, slot.slotIndex, candidate).ok, true, mod.id);
    } else assert.equal(applied.ok, true, mod.id);
    assert.deepEqual(resolveModStatState(mod, card).nativeStats, nativeBefore, `${mod.id} native data changed`);
    assert.equal(resetPlasmaRecalibrationToNative(card, mod).ok, true, mod.id);
    assert.deepEqual(resolveModStatState(mod, card).effectiveStats, nativeBefore, `${mod.id} reset was not lossless`);
  }
});

test('recalibrated instance metadata and equipped identity survive normalization, then reset persists cleanly', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'calibrated-barrel');
  const card = mods.cards[0];
  card.upgradeLevel = 3;
  card.infusionId = 'arcade-pop';
  assert.equal(equipMod(mods, 'weapon', card.modId, card.instanceId).ok, true);
  assert.equal(applyPlasmaRecalibration(card, definition(card.modId), 0, {
    stat: 'turretDamage', mode: 'multiply', quality: 'optimal', normalizedPower: .9
  }).ok, true);
  const migrated = normalizeModCollection(structuredClone(mods));
  const migratedCard = migrated.cards[0];
  assert.equal(resolveModStatState(definition(migratedCard.modId), migratedCard).presentation, 'recalibrated');
  assert.equal(migratedCard.infusionId, 'arcade-pop');
  assert.equal(migrated.loadouts[0].cardSlots.weapon, migratedCard.instanceId);
  migrated.plasmaChips = 75;
  assert.equal(resetPlasmaRecalibrationTransaction(migrated, migratedCard.instanceId).ok, true);
  const reloaded = normalizeModCollection(structuredClone(migrated));
  assert.equal(resolveModStatState(definition(reloaded.cards[0].modId), reloaded.cards[0]).presentation, 'native');
  assert.equal(reloaded.cards[0].infusionId, 'arcade-pop');
  assert.equal(reloaded.loadouts[0].cardSlots.weapon, reloaded.cards[0].instanceId);
});

test('legacy full profiles migrate native and recalibrated cards without losing their effective values', () => {
  const save = createDefaultLocalSave('legacy-stats', 'Legacy Stats');
  addModDrop(save.mods, 'calibrated-barrel');
  addModDrop(save.mods, 'gas-mask');
  const calibrated = save.mods.cards.find((card) => card.modId === 'calibrated-barrel');
  const native = save.mods.cards.find((card) => card.modId === 'gas-mask');
  calibrated.upgradeLevel = 3;
  native.upgradeLevel = 3;
  assert.equal(applyPlasmaRecalibration(calibrated, definition(calibrated.modId), 0, {
    stat: 'mineDamage', mode: 'multiply', quality: 'optimal', normalizedPower: .91
  }).ok, true);
  const effectiveBefore = structuredClone(resolveModStatState(definition(calibrated.modId), calibrated).effectiveStats);
  save.version = 17;
  const migrated = normalizeLocalSave(structuredClone(save));
  assert.ok(migrated);
  const migratedCalibrated = migrated.mods.cards.find((card) => card.instanceId === calibrated.instanceId);
  const migratedNative = migrated.mods.cards.find((card) => card.instanceId === native.instanceId);
  assert.deepEqual(resolveModStatState(definition(calibrated.modId), migratedCalibrated).effectiveStats, effectiveBefore);
  assert.equal(resolveModStatState(definition(calibrated.modId), migratedCalibrated).presentation, 'recalibrated');
  assert.equal(resolveModStatState(definition(native.modId), migratedNative).presentation, 'native');
});

test('Mod stat change notifications carry identity only and unsubscribe cleanly', () => {
  const received = [];
  const unsubscribe = modStatEvents.subscribe((event) => received.push(event));
  const event = { profileId: 'profile-a', instanceId: 'card-a', modId: 'calibrated-barrel', reason: 'reset-native' };
  modStatEvents.publish(event);
  unsubscribe();
  modStatEvents.publish({ ...event, reason: 'recalibrated' });
  assert.deepEqual(received, [event]);
  const store = readFileSync(new URL('../src/game/state/PlayerProfileStore.ts', import.meta.url), 'utf8');
  assert.match(store, /modStatEvents\.publish\([\s\S]*?reason: 'recalibrated'/);
  assert.match(store, /modStatEvents\.publish\([\s\S]*?reason: 'reset-native'/);
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
  assert.match(garage, /RESET TO NATIVE/);
  assert.match(garage, /showConfirmDialog/);
  assert.match(garage, /configureSceneUiNavigation/);
  const cardView = readFileSync(new URL('../src/game/mods/ModCardView.ts', import.meta.url), 'utf8');
  assert.match(cardView, /createModStatStatusIcon/);
  assert.doesNotMatch(cardView, /SUPREME OD ONLY|ANY SLOT \/\/ 2 MAX/);
});
