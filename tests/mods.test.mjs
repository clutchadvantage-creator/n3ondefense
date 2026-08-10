import test from 'node:test';
import assert from 'node:assert/strict';
import { addModDrop, createDefaultModCollection, deleteModCard, equipMod, infuseModCard, rankUpMod, recycleDuplicateMod, sellDuplicateMod } from '../src/game/mods/ModInventoryService.ts';
import { normalizeModCollection, normalizeProtocolPreference } from '../src/game/mods/ModSaveNormalizer.ts';
import { ModRuntime } from '../src/game/mods/ModRuntime.ts';
import { applyOperativeSpeedMultipliers, magneticResistanceForEnemy, prioritizeTurretTargets, protocolStart, splitCurrentSecondaryDamage } from '../src/game/mods/ModRules.ts';
import { rollModDrop } from '../src/game/mods/ModDropService.ts';
import { normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { MOD_BY_ID, MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { MOD_INFUSIONS } from '../src/game/mods/infusions.ts';
import { MOD_BALANCE, RUN_PROTOCOL_IDS, RUN_PROTOCOLS, cycleUnlockedProtocol } from '../src/game/mods/modBalance.ts';

const equippedRuntimeAtRank = (modId, rank) => {
  const mods = createDefaultModCollection();
  addModDrop(mods, modId);
  mods.cards[0].upgradeLevel = rank;
  const category = MOD_BY_ID.get(modId).category;
  equipMod(mods, category === 'utility' ? 'wildcard' : category, modId);
  return new ModRuntime(mods);
};

test('the expanded collection adds at least ten discoveries to every rarity', () => {
  const expectedMinimums = { common: 13, uncommon: 13, rare: 13, epic: 12, legendary: 12 };
  const counts = Object.fromEntries(Object.keys(expectedMinimums).map((rarity) => [
    rarity,
    MOD_DEFINITIONS.filter((definition) => definition.rarity === rarity).length
  ]));
  assert.deepEqual(counts, expectedMinimums);
  assert.equal(MOD_DEFINITIONS.length, 63);
  assert.equal(new Set(MOD_DEFINITIONS.map((definition) => definition.id)).size, MOD_DEFINITIONS.length);
});

test('every Mod has a colored icon, ranked copy, and reachable positive drop weight', () => {
  for (const definition of MOD_DEFINITIONS) {
    assert.ok(definition.icon.length > 0, `${definition.id} is missing an icon`);
    assert.ok(Number.isInteger(definition.iconColor) && definition.iconColor > 0 && definition.iconColor <= 0xffffff);
    assert.notEqual(definition.iconColor, 0xffffff, `${definition.id} still uses a plain white icon`);
    assert.equal(Object.keys(definition.rankDescriptions).length, 4);
    assert.ok(definition.dropWeight > 0);
  }
});

test('data-driven modifiers are finite, ranked, and use safe multiplier values', () => {
  const definitionsWithModifiers = MOD_DEFINITIONS.filter((definition) => definition.modifiers?.length);
  assert.equal(definitionsWithModifiers.length, 50);
  for (const definition of definitionsWithModifiers) {
    for (const modifier of definition.modifiers) {
      assert.deepEqual(Object.keys(modifier.values), ['0', '1', '2', '3']);
      for (const value of Object.values(modifier.values)) {
        assert.equal(Number.isFinite(value), true, `${definition.id}/${modifier.stat} is not finite`);
        if (modifier.mode === 'multiply') assert.ok(value > 0, `${definition.id}/${modifier.stat} has a non-positive multiplier`);
      }
    }
  }
});

test('new corrupted cards pair exceptional positives with explicit mechanical penalties', () => {
  const ids = ['ruptured-heat-sink', 'glass-cannon', 'volatile-reactor', 'black-star-engine'];
  for (const id of ids) {
    const definition = MOD_BY_ID.get(id);
    assert.equal(definition.variant, 'corrupted');
    assert.ok(definition.positiveEffect.length > 20);
    assert.ok(definition.negativeEffect.length > 20);
    assert.ok(definition.modifiers.length >= 2);
    assert.ok(definition.tags.includes('tradeoff'));
  }
  assert.ok(MOD_DEFINITIONS.filter((definition) => definition.variant === 'corrupted').length >= 5);
});

test('generic Mod effects stack by equipped card and preserve corrupted tradeoffs', () => {
  const glass = equippedRuntimeAtRank('glass-cannon', 3);
  assert.equal(glass.multiplier('weaponDamage'), 1.52);
  assert.equal(glass.multiplier('playerMaxHealth'), 0.78);

  const mods = createDefaultModCollection();
  addModDrop(mods, 'glass-cannon');
  addModDrop(mods, 'promethean-core');
  mods.cards[0].upgradeLevel = 3;
  mods.cards[1].upgradeLevel = 3;
  equipMod(mods, 'weapon', 'glass-cannon', mods.cards[0].instanceId);
  equipMod(mods, 'wildcard', 'promethean-core', mods.cards[1].instanceId);
  const stacked = new ModRuntime(mods);
  assert.ok(Math.abs(stacked.multiplier('weaponDamage') - 1.52 * 1.31) < 1e-12);
  assert.equal(stacked.multiplier('playerMaxHealth'), 0.78);
});

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
  assert.equal(migrated.version, 6);
  assert.equal(migrated.progress.totalCreditsSpent, 0);
  assert.equal(migrated.mods.purchasedLoadoutSlots, 1);
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
  assert.deepEqual(MOD_INFUSIONS.map((infusion) => infusion.id), [
    'enemy-growth',
    'detonation-fireworks',
    'prismatic-rounds',
    'holo-afterimage',
    'pickup-orbit',
    'ghost-echoes',
    'arcade-pop'
  ]);
  for (const infusion of MOD_INFUSIONS) {
    assert.equal(infusion.cosmeticOnly, true);
    assert.ok(infusion.plasmaCost > 0);
    assert.equal(infusion.plasmaCost, MOD_BALANCE.infusionPlasmaCost[infusion.id]);
    assert.ok(infusion.description.length > 20);
  }
});

test('each new cosmetic infusion installs on its exact card and reaches the runtime snapshot', () => {
  for (const infusionId of ['prismatic-rounds', 'holo-afterimage', 'pickup-orbit', 'ghost-echoes', 'arcade-pop']) {
    const mods = createDefaultModCollection();
    addModDrop(mods, 'split-current');
    equipMod(mods, 'weapon', 'split-current', mods.cards[0].instanceId);
    mods.plasmaChips = 20;
    assert.equal(infuseModCard(mods, mods.cards[0].instanceId, infusionId).ok, true);
    assert.equal(new ModRuntime(mods).hasInfusion(infusionId), true);
    assert.equal(new ModRuntime(mods).snapshot()[0].infusionId, infusionId);
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

test('equipped-card infusions survive run snapshots and legacy id/rank snapshots', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'split-current');
  mods.plasmaChips = 20;
  infuseModCard(mods, mods.cards[0].instanceId, 'detonation-fireworks');
  equipMod(mods, 'weapon', 'split-current', mods.cards[0].instanceId);

  const snapshot = new ModRuntime(mods).snapshot();
  assert.equal(snapshot[0].infusionId, 'detonation-fireworks');
  assert.equal(new ModRuntime(mods, snapshot).hasInfusion('detonation-fireworks'), true);
  assert.equal(new ModRuntime(mods, snapshot.map(({ id, rank }) => ({ id, rank }))).hasInfusion('detonation-fireworks'), true);
});

test('Corrupted cards declare both their positive effect and tradeoff', () => {
  const corrupted = MOD_BY_ID.get('fractured-current');
  assert.equal(corrupted.variant, 'corrupted');
  assert.ok(corrupted.positiveEffect);
  assert.ok(corrupted.negativeEffect);
  assert.ok(corrupted.dropWeight < 0.1);
});

test('Nanite Fuel is a rare legendary Player Mod with three upgrades', () => {
  const naniteFuel = MOD_BY_ID.get('nanite-fuel');
  assert.equal(naniteFuel.category, 'player');
  assert.equal(naniteFuel.rarity, 'legendary');
  assert.equal(naniteFuel.maxRank, 3);
  assert.ok(naniteFuel.dropWeight < 0.05);
  assert.match(naniteFuel.rankDescriptions[3], /12\.5%/);
});

test('Nanite Fuel can drop in both protocols and is favored by boss rewards', () => {
  const findNaniteFuelSeed = (source, protocol) => {
    for (let seed = 0; seed < 1_000_000; seed += 1) {
      if (rollModDrop({ source, round: 10, seed, sequence: 0, protocol })?.id === 'nanite-fuel') return seed;
    }
    return null;
  };
  for (const protocol of ['normal', 'overdrive']) {
    assert.notEqual(findNaniteFuelSeed('milestone', protocol), null);
    assert.notEqual(findNaniteFuelSeed('boss', protocol), null);
  }
  assert.ok(MOD_BALANCE.dropChance.boss > MOD_BALANCE.dropChance.milestone);
  assert.ok(MOD_BALANCE.raritySourceMultipliers.boss.legendary > MOD_BALANCE.raritySourceMultipliers.milestone.legendary);
});

test('Nanite Fuel stacks after purchased speed and with temporary speed effects', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'nanite-fuel');
  equipMod(mods, 'player', 'nanite-fuel');
  assert.equal(new ModRuntime(mods).naniteFuelSpeedMultiplier(), 1.05);

  mods.cards[0].upgradeLevel = 3;
  assert.equal(new ModRuntime(mods).naniteFuelSpeedMultiplier(), 1.125);
  assert.equal(applyOperativeSpeedMultipliers(300, 1.125, 1.3, 1.18), 517.725);
});

test('the expanded collection includes ranked fence, mine, pickup, and turret cards', () => {
  const expected = [
    ['conductive-fencing', 'common'],
    ['high-yield-mines', 'common'],
    ['hardlight-weave', 'uncommon'],
    ['quick-fuse', 'uncommon'],
    ['magnetic-service', 'rare'],
    ['jailbroke-turrets', 'epic']
  ];
  for (const [id, rarity] of expected) {
    const definition = MOD_BY_ID.get(id);
    assert.equal(definition.rarity, rarity);
    assert.equal(definition.maxRank, 3);
  }
});

test('Magnetic Service multiplies final pickup collection range and pull speed by card rank', () => {
  assert.deepEqual(equippedRuntimeAtRank('magnetic-service', 0).magneticServiceField(104), {
    attractionRadius: 182,
    pullSpeed: 155
  });
  assert.deepEqual(equippedRuntimeAtRank('magnetic-service', 3).magneticServiceField(104), {
    attractionRadius: 364,
    pullSpeed: 315
  });
  assert.deepEqual(new ModRuntime(createDefaultModCollection()).magneticServiceField(104), {
    attractionRadius: 104,
    pullSpeed: 0
  });
});

test('Jailbroke Turrets scales fence-crossing streams from one through the operative four-stream fan', () => {
  assert.deepEqual(equippedRuntimeAtRank('jailbroke-turrets', 0).jailbrokeTurretFan(), { streamCount: 1, damageShare: 1 });
  assert.deepEqual(equippedRuntimeAtRank('jailbroke-turrets', 1).jailbrokeTurretFan(), { streamCount: 2, damageShare: 0.7 });
  assert.deepEqual(equippedRuntimeAtRank('jailbroke-turrets', 2).jailbrokeTurretFan(), { streamCount: 3, damageShare: 0.55 });
  assert.deepEqual(equippedRuntimeAtRank('jailbroke-turrets', 3).jailbrokeTurretFan(), { streamCount: 4, damageShare: 0.45 });
  assert.equal(new ModRuntime(createDefaultModCollection()).jailbrokeTurretFan(), null);
});

test('fence and mine cards multiply the final permanent ability upgrades', () => {
  assert.equal(70 * equippedRuntimeAtRank('conductive-fencing', 3).fenceDamageMultiplier(), 87.5);
  assert.equal(270 * equippedRuntimeAtRank('hardlight-weave', 3).fenceHealthMultiplier(), 405);
  assert.equal(142 * equippedRuntimeAtRank('high-yield-mines', 3).mineDamageMultiplier(), 177.5);
  assert.equal(440 * equippedRuntimeAtRank('quick-fuse', 3).mineArmTimeMultiplier(), 220);
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

test('rare, epic, and legendary ranks require escalating Core Tokens', () => {
  assert.deepEqual(MOD_BALANCE.rankCoreTokenCostsByRarity.common, { 1: 0, 2: 0, 3: 0 });
  assert.deepEqual(MOD_BALANCE.rankCoreTokenCostsByRarity.uncommon, { 1: 0, 2: 0, 3: 0 });
  assert.deepEqual(MOD_BALANCE.rankCoreTokenCostsByRarity.rare, { 1: 2, 2: 5, 3: 10 });
  assert.deepEqual(MOD_BALANCE.rankCoreTokenCostsByRarity.epic, { 1: 15, 2: 40, 3: 90 });
  assert.deepEqual(MOD_BALANCE.rankCoreTokenCostsByRarity.legendary, { 1: 100, 2: 250, 3: 500 });

  const rare = createDefaultModCollection(); addModDrop(rare, 'priority-targeting');
  const rareBlocked = rankUpMod(rare, 'priority-targeting', 10_000, 1);
  assert.equal(rareBlocked.ok, false);
  assert.match(rareBlocked.message, /2 Core Tokens/);
  assert.equal(rare.cards[0].upgradeLevel, 0);
  const rareUpgrade = rankUpMod(rare, 'priority-targeting', 10_000, 2);
  assert.equal(rareUpgrade.ok, true);
  assert.equal(rareUpgrade.coreTokenCost, 2);
  assert.equal(rare.cards[0].upgradeLevel, 1);

  const epic = createDefaultModCollection(); addModDrop(epic, 'emergency-shield');
  assert.equal(rankUpMod(epic, 'emergency-shield', 10_000, 14).ok, false);
  assert.equal(rankUpMod(epic, 'emergency-shield', 10_000, 15).coreTokenCost, 15);

  const legendary = createDefaultModCollection(); addModDrop(legendary, 'nanite-fuel');
  assert.equal(rankUpMod(legendary, 'nanite-fuel', 10_000, 99).ok, false);
  assert.equal(rankUpMod(legendary, 'nanite-fuel', 10_000, 100).coreTokenCost, 100);
  assert.equal(rankUpMod(legendary, 'nanite-fuel', 10_000, 249).ok, false);
  assert.equal(rankUpMod(legendary, 'nanite-fuel', 10_000, 250).coreTokenCost, 250);
  assert.equal(rankUpMod(legendary, 'nanite-fuel', 10_000, 499).ok, false);
  assert.equal(rankUpMod(legendary, 'nanite-fuel', 10_000, 500).coreTokenCost, 500);
  assert.equal(legendary.cards[0].upgradeLevel, 3);
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

test('purchased saved-loadout capacity preserves configurations without adding combat slots', () => {
  const normalized = normalizeModCollection({ purchasedLoadoutSlots: 3, loadouts: [{ id: 'default', name: 'Primary', slots: {} }] });
  assert.equal(normalized.purchasedLoadoutSlots, 3);
  assert.equal(normalized.loadouts.length, 3);
  for (const loadout of normalized.loadouts) assert.deepEqual(Object.keys(loadout.slots), ['weapon', 'player', 'defense', 'bombSite', 'wildcard']);
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

test('the named Overdrive ladder starts every five rounds without skipped rewards', () => {
  assert.equal(protocolStart('normal', 0).startingRound, 1);
  assert.equal(protocolStart('overdrive', 7).protocol, 'normal');
  const overdrive = protocolStart('overdrive', 8);
  assert.equal(overdrive.startingRound, 5);
  assert.deepEqual(overdrive.skippedRewards, { credits: 0, coreTokens: 0, mods: 0, kills: 0, score: 0 });

  const tiers = RUN_PROTOCOL_IDS.slice(1).map((id) => RUN_PROTOCOLS[id]);
  assert.equal(tiers.length, 10);
  assert.deepEqual(tiers.map((definition) => definition.startingRound), [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  assert.deepEqual(tiers.map((definition) => definition.tier), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(tiers.slice(0, 3).map((definition) => definition.label), ['OVERDRIVE', 'OVERDRIVE ORION', 'OVERDRIVE ARES']);
  assert.ok(tiers.every((definition) => definition.family === 'overdrive'));
  assert.ok(tiers.every((definition) => definition.scoreMultiplier === RUN_PROTOCOLS.overdrive.scoreMultiplier));
  assert.ok(tiers.every((definition) => definition.modDropMultiplier === RUN_PROTOCOLS.overdrive.modDropMultiplier));
  assert.equal(protocolStart('overdrive-orion', 12).protocol, 'normal');
  assert.equal(protocolStart('overdrive-orion', 13).startingRound, 10);
  assert.equal(protocolStart('overdrive-ares', 18).startingRound, 15);
});

test('protocol selection cycles only through unlocked named tiers and saves them', () => {
  assert.equal(cycleUnlockedProtocol('normal', 7, 1), 'normal');
  assert.equal(cycleUnlockedProtocol('normal', 13, 1), 'overdrive');
  assert.equal(cycleUnlockedProtocol('overdrive', 13, 1), 'overdrive-orion');
  assert.equal(cycleUnlockedProtocol('overdrive-orion', 13, 1), 'normal');
  assert.equal(cycleUnlockedProtocol('normal', 13, -1), 'overdrive-orion');
  assert.deepEqual(normalizeProtocolPreference({ preferred: 'overdrive-ares' }), { preferred: 'overdrive-ares' });
  assert.deepEqual(normalizeProtocolPreference({ preferred: 'unknown-protocol' }), { preferred: 'normal' });
});

test('mod drops are deterministic and run result fields serialize', () => {
  const request = { source: 'milestone', round: 10, seed: 12345, sequence: 2, protocol: 'overdrive', guaranteed: true };
  assert.equal(rollModDrop(request)?.id, rollModDrop(request)?.id);
  const result = { protocol: 'overdrive', equippedMods: [{ id: 'split-current', rank: 2 }], modsEarned: [{ modId: 'split-current', duplicate: false, source: 'milestone' }], highestRound: 9, credits: 100, runCreditsEarned: 2100, creditsSpentBeforeRun: 20_000, modFocus: 'weapon', contract: 'elite-hunt', accountProgressionTier: 'advanced', upgradeCompletionPercentage: 68, runDurationMs: 5000 };
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
