import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateModLibraryLayout,
  resolveModLibraryPage
} from '../src/game/garage/modLibraryLayout.ts';
import { MOD_BY_ID, MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import {
  filterModDatabaseEntries,
  getModDatabaseEntries,
  getModDatabaseEntry
} from '../src/game/mods/ModDatabaseService.ts';
import {
  getEffectiveModDefinitionDropChance,
  getModDefinitionProbability,
  getModDropChance,
  getModRarityProbability
} from '../src/game/mods/ModDropService.ts';
import {
  addModDrop,
  createDefaultModCollection,
  getModRecycleValue,
  getModUpgradeCost
} from '../src/game/mods/ModInventoryService.ts';
import { MOD_BALANCE } from '../src/game/mods/modBalance.ts';
import { ECONOMY_BALANCE } from '../src/game/economy/economyBalance.ts';

test('Mod Library layout always uses three rows and invests available height in larger cards', () => {
  for (const [width, height] of [[1920, 1080], [1600, 900], [1366, 768]]) {
    const layout = calculateModLibraryLayout(width, height);
    assert.equal(layout.rows, 3);
    assert.equal(layout.perPage, layout.columns * 3);
    assert.ok(layout.cardWidth > 118, `${width}x${height} cards should exceed the former 118px maximum`);
    const cardsBottom = layout.gridContentTop + layout.cardHeight * 3 + layout.cardGapY * 2;
    assert.ok(cardsBottom < layout.paginationY - layout.toolbarButtonHeight / 2);
    assert.ok(layout.viewer.x > layout.grid.x + layout.grid.width);
    assert.ok(layout.viewer.x + layout.viewer.width <= width);
  }
});

test('Library page resolution clamps filtered pages and never leaves a stale selection', () => {
  const entries = Array.from({ length: 25 }, (_, index) => ({ id: `entry-${index}` }));
  const first = resolveModLibraryPage(entries, 0, 9, 'entry-4', (entry) => entry.id);
  assert.equal(first.pageCount, 3);
  assert.equal(first.entries.length, 9);
  assert.equal(first.selectedId, 'entry-4');
  const last = resolveModLibraryPage(entries, 99, 9, 'entry-4', (entry) => entry.id);
  assert.equal(last.page, 2);
  assert.equal(last.entries.length, 7);
  assert.equal(last.selectedId, 'entry-18');
  const empty = resolveModLibraryPage([], 4, 9, 'stale', (entry) => entry.id);
  assert.equal(empty.page, 0);
  assert.equal(empty.selectedId, '');
});

test('database separates undiscovered, discovered-not-owned, and owned Mods', () => {
  const mods = createDefaultModCollection();
  const [ownedDefinition, discoveredDefinition, hiddenDefinition] = MOD_DEFINITIONS;
  addModDrop(mods, ownedDefinition.id);
  mods.inventory[discoveredDefinition.id] = {
    rank: 0,
    duplicates: 0,
    discovered: true,
    acquiredCount: 1
  };
  const entries = getModDatabaseEntries(mods);
  assert.equal(entries.find((entry) => entry.definition.id === ownedDefinition.id)?.status, 'owned');
  assert.equal(entries.find((entry) => entry.definition.id === discoveredDefinition.id)?.status, 'discovered');
  assert.equal(entries.find((entry) => entry.definition.id === hiddenDefinition.id)?.status, 'undiscovered');
  assert.equal(filterModDatabaseEntries(entries, { category: 'all', rarity: 'all', status: 'owned' }).length, 1);
  assert.equal(filterModDatabaseEntries(entries, { category: 'all', rarity: 'all', status: 'discovered' }).length, 1);
  assert.equal(filterModDatabaseEntries(entries, { category: 'all', rarity: 'all', status: 'undiscovered' }).length, MOD_DEFINITIONS.length - 2);
});

test('rank and stat progression are transformed directly from authoritative Mod definitions', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'gas-mask');
  const card = mods.cards.find((candidate) => candidate.modId === 'gas-mask');
  card.upgradeLevel = 2;
  const entry = getModDatabaseEntry(mods, 'gas-mask');
  const definition = MOD_BY_ID.get('gas-mask');
  assert.ok(entry && definition);
  assert.equal(entry.currentRank, 2);
  assert.equal(entry.ranks.find((rank) => rank.rank === 2)?.current, true);
  assert.deepEqual(entry.ranks.map((rank) => rank.description), [0, 1, 2, 3].map((rank) => definition.rankDescriptions[rank]));
  assert.deepEqual(entry.stats[0].values, definition.modifiers[0].values);
  assert.equal(entry.stats[0].displays.baseline, '0%');
  assert.equal(entry.stats[0].displays[2], '-65%');
});

test('database upgrade totals and recycle values use the same economy resolvers as card operations', () => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'nanite-fuel');
  const entry = getModDatabaseEntry(mods, 'nanite-fuel');
  assert.ok(entry);
  const expectedCosts = [1, 2, 3].map((rank) => getModUpgradeCost('nanite-fuel', rank));
  assert.deepEqual(entry.economy.upgradeSteps.map(({ credits, coreTokens }) => ({ credits, coreTokens })), expectedCosts);
  assert.equal(entry.economy.fullCredits, Object.values(MOD_BALANCE.rankCreditCosts).reduce((sum, value) => sum + value, 0));
  assert.equal(entry.economy.fullCoreTokens, Object.values(MOD_BALANCE.rankCoreTokenCostsByRarity.legendary).reduce((sum, value) => sum + value, 0));
  assert.deepEqual(
    { credits: entry.economy.recycleCredits, plasmaChips: entry.economy.recyclePlasmaChips },
    getModRecycleValue('nanite-fuel')
  );
  assert.equal(entry.economy.recycleRankIndependent, true);
});

test('specific-card drop probability is opportunity chance times exact weighted-pool share', () => {
  const request = { source: 'boss', round: 50, seed: 0, sequence: 0, protocol: 'overdrive-pegasus', guaranteed: false };
  const expected = getModDropChance(request) * getModDefinitionProbability(request, 'nanite-fuel');
  assert.equal(getEffectiveModDefinitionDropChance(request, 'nanite-fuel'), expected);
  const entry = getModDatabaseEntry(createDefaultModCollection(), 'nanite-fuel');
  const overdrive = entry.acquisition.protocols.find((profile) => profile.family === 'overdrive');
  const boss = overdrive.sources.find((source) => source.source === 'boss');
  assert.equal(boss.effectiveChance, expected);
  assert.equal(boss.rarityPoolChance, getModRarityProbability(request, 'legendary'));
  assert.equal(Math.max(...entry.acquisition.bestSources.map((source) => source.effectiveChance)), Math.max(
    ...entry.acquisition.protocols.flatMap((profile) => profile.sources.map((source) => source.effectiveChance))
  ));
});

test('Supreme acquisition is exclusive to Supreme protocols and Signal weighting is authoritative', () => {
  const supreme = MOD_DEFINITIONS.find((definition) => definition.rarity === 'supreme');
  assert.ok(supreme);
  const entry = getModDatabaseEntry(createDefaultModCollection(), supreme.id);
  assert.ok(entry);
  assert.equal(entry.acquisition.supremeExclusive, true);
  assert.equal(entry.acquisition.protocols.find((profile) => profile.family === 'normal')?.available, false);
  assert.equal(entry.acquisition.protocols.find((profile) => profile.family === 'overdrive')?.available, false);
  assert.equal(entry.acquisition.protocols.find((profile) => profile.family === 'supreme')?.available, true);
  assert.equal(entry.acquisition.signalWeightMultiplier, ECONOMY_BALANCE.modFocus.categoryWeightMultiplier);
});

test('Corrupted database entries expose authoritative positive and negative effects', () => {
  const corrupted = MOD_DEFINITIONS.find((definition) => definition.variant === 'corrupted');
  assert.ok(corrupted?.positiveEffect);
  assert.ok(corrupted?.negativeEffect);
  const entry = getModDatabaseEntry(createDefaultModCollection(), corrupted.id);
  assert.equal(entry.definition.positiveEffect, corrupted.positiveEffect);
  assert.equal(entry.definition.negativeEffect, corrupted.negativeEffect);
  assert.equal(filterModDatabaseEntries(getModDatabaseEntries(createDefaultModCollection()), {
    category: 'all', rarity: 'all', status: 'corrupted'
  }).every((candidate) => candidate.definition.variant === 'corrupted'), true);
});
