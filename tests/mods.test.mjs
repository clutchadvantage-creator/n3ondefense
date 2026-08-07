import test from 'node:test';
import assert from 'node:assert/strict';
import { addModDrop, createDefaultModCollection, deleteModCard, equipMod, infuseModCard, rankUpMod, recycleDuplicateMod, sellDuplicateMod } from '../src/game/mods/ModInventoryService.ts';
import { normalizeModCollection, normalizeProtocolPreference } from '../src/game/mods/ModSaveNormalizer.ts';
import { ModRuntime } from '../src/game/mods/ModRuntime.ts';
import { magneticResistanceForEnemy, prioritizeTurretTargets, protocolStart, splitCurrentSecondaryDamage } from '../src/game/mods/ModRules.ts';
import { rollModDrop } from '../src/game/mods/ModDropService.ts';
import { normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { MOD_BY_ID } from '../src/game/mods/definitions.ts';
import { MOD_INFUSIONS } from '../src/game/mods/infusions.ts';

test('old profiles receive empty mod and normal protocol defaults', () => {
  const mods = normalizeModCollection(undefined);
  assert.deepEqual(mods.inventory, {});
  assert.deepEqual(mods.cards, []);
  assert.equal(mods.plasmaChips, 0);
  assert.equal(mods.loadouts.length, 1);
  assert.equal(normalizeProtocolPreference(undefined).preferred, 'normal');
});

test('a complete version-two profile migrates without losing progression or purchases', () => {
  const old = {
    version: 2,
    profile: { id: 'legacy-v2', name: 'Runt', createdAt: '2025-01-01T00:00:00.000Z', lastPlayedAt: '2025-01-02T00:00:00.000Z' },
    wallet: { credits: 4321, coreTokens: 17 },
    upgrades: { 'weapon.damage': 4 },
    cosmetics: { owned: ['player-cyan', 'player-pink'], equipped: { playerColor: 'player-pink' } },
    progress: { highestRound: 9, roundsCompleted: 8, enemiesDestroyed: 120, bombSitesDestroyed: 15, totalCreditsEarned: 9000, totalCoreTokensEarned: 20, totalPlaytimeSeconds: 600 },
    settings: { masterVolume: 0.7, musicVolume: 0.5, sfxVolume: 0.8, screenShake: false, particles: true },
    metadata: { updatedAt: '2025-01-02T00:00:00.000Z', saveRevision: 4, gameVersion: '0.0.1' }
  };
  const migrated = normalizeLocalSave(old);
  assert.equal(migrated.version, 5);
  assert.equal(migrated.wallet.credits, 4321);
  assert.equal(migrated.upgrades['weapon.damage'], 4);
  assert.equal(migrated.cosmetics.equipped.playerColor, 'player-pink');
  assert.equal(migrated.progress.highestRound, 9);
  assert.deepEqual(migrated.mods.inventory, {});
  assert.equal(migrated.protocol.preferred, 'normal');
});

test('first acquisition starts at zero upgrades and later acquisitions store duplicates', () => {
  const mods = createDefaultModCollection();
  assert.equal(addModDrop(mods, 'split-current').ok, true);
  assert.equal(mods.inventory['split-current'].rank, 0);
  assert.equal(mods.cards[0].upgradeLevel, 0);
  addModDrop(mods, 'split-current');
  assert.equal(mods.inventory['split-current'].duplicates, 1);
  assert.equal(mods.cards.length, 2);
});

test('legacy aggregate duplicates migrate into individual card instances', () => {
  const mods = normalizeModCollection({ inventory: { 'split-current': { rank: 2, duplicates: 3, discovered: true, acquiredCount: 4 } } });
  assert.equal(mods.cards.length, 4);
  assert.equal(new Set(mods.cards.map((card) => card.instanceId)).size, 4);
});

test('any card can be sold or recycled by rarity, including the final copy', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'split-current'); addModDrop(mods, 'split-current'); addModDrop(mods, 'split-current');
  const sold = sellDuplicateMod(mods, mods.cards[1].instanceId);
  assert.equal(sold.credits, 100);
  const recycled = recycleDuplicateMod(mods, mods.cards[1].instanceId);
  assert.equal(recycled.plasmaChips, 1);
  assert.equal(mods.plasmaChips, 1);
  assert.equal(sellDuplicateMod(mods, mods.cards[0].instanceId).ok, true);
  assert.equal(mods.cards.length, 0);
  assert.equal(mods.inventory['split-current'], undefined);
});

test('the selected original card can be recycled when another copy remains', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'split-current'); addModDrop(mods, 'split-current');
  const selectedId = mods.cards[0].instanceId;
  assert.equal(recycleDuplicateMod(mods, selectedId).ok, true);
  assert.equal(mods.cards.some((card) => card.instanceId === selectedId), false);
  assert.equal(mods.cards.length, 1);
});

test('deleting an equipped final card removes ownership and clears its loadout slot', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'split-current');
  equipMod(mods, 'weapon', 'split-current', mods.cards[0].instanceId);
  assert.equal(deleteModCard(mods, mods.cards[0].instanceId).ok, true);
  assert.equal(mods.inventory['split-current'], undefined);
  assert.equal(mods.loadouts[0].slots.weapon, null);
  assert.equal(mods.loadouts[0].cardSlots.weapon, null);
});

test('Plasma Chip infusions spend chips and remain cosmetic runtime flags', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'split-current');
  equipMod(mods, 'weapon', 'split-current');
  mods.plasmaChips = 12;
  assert.equal(infuseModCard(mods, mods.cards[0].instanceId, 'detonation-fireworks').ok, true);
  assert.equal(mods.plasmaChips, 5);
  assert.equal(new ModRuntime(mods).hasInfusion('detonation-fireworks'), true);
});

test('every listed infusion is explicitly cosmetic-only with a positive Plasma Chip cost', () => {
  assert.equal(MOD_INFUSIONS.length, 2);
  for (const infusion of MOD_INFUSIONS) {
    assert.equal(infusion.cosmeticOnly, true);
    assert.ok(infusion.plasmaCost > 0);
    assert.ok(infusion.description.length > 20);
  }
});

test('the specifically equipped card controls cosmetic infusion activation', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'split-current'); addModDrop(mods, 'split-current');
  mods.plasmaChips = 20;
  infuseModCard(mods, mods.cards[1].instanceId, 'enemy-growth');
  equipMod(mods, 'weapon', 'split-current', mods.cards[0].instanceId);
  assert.equal(new ModRuntime(mods).hasInfusion('enemy-growth'), false);
  equipMod(mods, 'weapon', 'split-current', mods.cards[1].instanceId);
  assert.equal(new ModRuntime(mods).hasInfusion('enemy-growth'), true);
});

test('Corrupted cards declare both their positive effect and tradeoff', () => {
  const corrupted = MOD_BY_ID.get('fractured-current');
  assert.equal(corrupted.variant, 'corrupted');
  assert.ok(corrupted.positiveEffect);
  assert.ok(corrupted.negativeEffect);
  assert.ok(corrupted.dropWeight < 0.1);
});

test('one card upgrades from zero through three without duplicate requirements', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'split-current');
  const rankOne = rankUpMod(mods, 'split-current', 10_000);
  assert.equal(rankOne.ok, true);
  assert.equal(rankOne.cost, 600);
  assert.equal(rankUpMod(mods, 'split-current', 1199).ok, false);
  assert.equal(rankUpMod(mods, 'split-current', 1200).ok, true);
  assert.equal(rankUpMod(mods, 'split-current', 1999).ok, false);
  assert.equal(rankUpMod(mods, 'split-current', 2000).ok, true);
  assert.equal(mods.cards[0].upgradeLevel, 3);
  assert.equal(rankUpMod(mods, 'split-current', 99999).ok, false);
});

test('slot validation, wildcard behavior, and duplicate equip prevention work', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'split-current'); addModDrop(mods, 'emergency-capacitor');
  assert.equal(equipMod(mods, 'player', 'split-current').ok, false);
  assert.equal(equipMod(mods, 'wildcard', 'split-current').ok, true);
  assert.equal(equipMod(mods, 'weapon', 'split-current').ok, false);
  assert.equal(equipMod(mods, 'player', 'emergency-capacitor').ok, true);
  assert.equal(equipMod(mods, 'weapon', 'missing').ok, false);
});

test('invalid saved mods and invalid or duplicate loadout references are removed', () => {
  const normalized = normalizeModCollection({
    inventory: { 'split-current': { rank: 9, duplicates: 2, discovered: true }, bogus: { rank: 1, discovered: true } },
    activeLoadoutId: 'bad',
    loadouts: [{ id: 'default', slots: { weapon: 'split-current', wildcard: 'split-current', player: 'bogus' } }]
  });
  assert.equal(normalized.inventory.bogus, undefined);
  assert.equal(normalized.inventory['split-current'].rank, 2);
  assert.equal(normalized.loadouts[0].slots.weapon, 'split-current');
  assert.equal(normalized.loadouts[0].slots.wildcard, null);
  assert.equal(normalized.activeLoadoutId, 'default');
});

test('Split Current uses final hit damage and cannot recurse', () => {
  assert.equal(splitCurrentSecondaryDamage(100, 3, false), 40);
  assert.equal(splitCurrentSecondaryDamage(100, 3, true), 0);
});

test('Emergency Capacitor crosses threshold once per round and resets', () => {
  const mods = createDefaultModCollection(); addModDrop(mods, 'emergency-capacitor'); mods.inventory['emergency-capacitor'].rank = 3; mods.cards[0].upgradeLevel = 3; equipMod(mods, 'player', 'emergency-capacitor');
  const runtime = new ModRuntime(mods); runtime.beginRound(1);
  assert.equal(runtime.checkEmergencyCapacitor(0.24)?.energyShare, 0.5);
  assert.equal(runtime.checkEmergencyCapacitor(0.1), null);
  runtime.beginRound(0.2);
  assert.equal(runtime.checkEmergencyCapacitor(0.19), null);
  runtime.checkEmergencyCapacitor(0.5);
  assert.notEqual(runtime.checkEmergencyCapacitor(0.2), null);
});

test('Priority Targeting favors active and rank-two marked defusers', () => {
  const targets = [{ id: 'near', distance: 10, activelyDefusing: false, marked: false }, { id: 'active', distance: 80, activelyDefusing: true, marked: false }, { id: 'marked', distance: 50, activelyDefusing: false, marked: true }];
  assert.equal(prioritizeTurretTargets(targets, 1)[0].id, 'active');
  assert.equal(prioritizeTurretTargets(targets, 2)[0].id, 'marked');
  assert.equal(prioritizeTurretTargets(targets, 0)[0].id, 'active');
  assert.equal(prioritizeTurretTargets(targets, -1)[0].id, 'near');
});

test('Emergency Shield cooldown is per site', () => {
  const mods = createDefaultModCollection(); addModDrop(mods, 'emergency-shield'); equipMod(mods, 'bombSite', 'emergency-shield');
  const runtime = new ModRuntime(mods); runtime.beginRound();
  assert.ok(runtime.activateBombShield('A', 1000));
  assert.equal(runtime.activateBombShield('A', 2000), null);
  assert.ok(runtime.activateBombShield('B', 2000));
  assert.ok(runtime.activateBombShield('A', 31_001));
});

test('Magnetic Payload gives heavy enemies strong resistance', () => {
  assert.equal(magneticResistanceForEnemy('grunt'), 1);
  assert.ok(magneticResistanceForEnemy('tank') < magneticResistanceForEnemy('grunt'));
  assert.ok(magneticResistanceForEnemy('star') < magneticResistanceForEnemy('tank'));
});

test('Normal and Overdrive starts are explicit and skipped rewards remain zero', () => {
  assert.equal(protocolStart('normal', 0).startingRound, 1);
  assert.equal(protocolStart('overdrive', 7).protocol, 'normal');
  const overdrive = protocolStart('overdrive', 8);
  assert.equal(overdrive.startingRound, 5);
  assert.deepEqual(overdrive.skippedRewards, { credits: 0, coreTokens: 0, mods: 0, kills: 0, score: 0 });
});

test('mod drops are deterministic and run result fields serialize', () => {
  const request = { source: 'milestone', round: 10, seed: 12345, sequence: 2, protocol: 'overdrive', guaranteed: true };
  assert.equal(rollModDrop(request)?.id, rollModDrop(request)?.id);
  const result = { protocol: 'overdrive', equippedMods: [{ id: 'split-current', rank: 2 }], modsEarned: [{ modId: 'split-current', duplicate: false, source: 'milestone' }], highestRound: 9, credits: 100, runDurationMs: 5000 };
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
