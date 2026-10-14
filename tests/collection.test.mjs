import test from 'node:test';
import assert from 'node:assert/strict';
import { RELICS, TROPHIES } from '../src/game/collection/CollectionCatalog.ts';
import { acquireFragment, advanceCollection, createCollectionState, normalizeCollection, syncCollectionEvidence, toggleCollectionDisplay } from '../src/game/collection/CollectionProgress.ts';
import { relicDropChance, rollRelicFragment } from '../src/game/collection/RelicDrops.ts';
import { getEffectiveModRarityDropChance } from '../src/game/mods/ModDropService.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { collectionArtAssets } from '../src/game/collection/CollectionArt.ts';
import { MOD_INFUSIONS } from '../src/game/mods/infusions.ts';
import { MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { RUN_PROTOCOLS } from '../src/game/mods/modBalance.ts';
import { addModDrop, infuseModCard } from '../src/game/mods/ModInventoryService.ts';

const reload = value => normalizeCollection(JSON.parse(JSON.stringify(value)));
test('relics need three unique pieces; ownership and receipts commit before any presentation', () => {
  let state = createCollectionState();
  for (const relic of RELICS) {
    for (let i = 0; i < relic.fragments.length; i++) {
      assert.equal(acquireFragment(state, relic.fragments[i].id, 100 + i), true);
      state = reload(state);
      assert.equal(state.pending.at(-1).itemId, relic.fragments[i].id);
      assert.equal(state.completedRelics.includes(relic.id), i === 2);
      assert.equal(state.unlockedCategories.includes(relic.category), i === 2);
      assert.equal(acquireFragment(state, relic.fragments[i].id), false);
    }
  }
  assert.equal(state.fragments.length, 6); assert.equal(state.pending.length, 6);
  assert.equal(acquireFragment(state, 'invented'), false);
  state.pending.shift(); assert.equal(reload(state).pending.length, 5);
  assert.equal(reload(state).fragments.length, 6);
});
test('corrupt saves cannot manufacture relic authorization, queue duplicates or invalid displays', () => {
  const state = normalizeCollection({ fragments: ['cipher-crown', 'cipher-crown', 'invalid'], completedRelics: RELICS.map(r => r.id),
    unlockedCategories: ['blacksite', 'cosmetic'], progress: { enemies: NaN, credits: Infinity, dashes: -5, portals: 1.9 },
    pending: [{ kind: 'fragment', itemId: 'cipher-crown' }, { kind: 'fragment', itemId: 'cipher-crown' }, { kind: 'fragment', itemId: 'core-reactor' }],
    displayedTrophies: ['untouchable'], displayedRelics: ['identity-cipher'] });
  assert.deepEqual(state.completedRelics, []); assert.deepEqual(state.unlockedCategories, []);
  assert.equal(state.pending.length, 1); assert.equal(state.progress.portals, 1);
  assert.equal(state.progress.enemies + state.progress.credits + state.progress.dashes, 0);
  assert.deepEqual(state.displayedRelics, []); assert.deepEqual(state.displayedTrophies, []);
});
test('all ten trophy thresholds are cumulative, durable, and queue exactly once', () => {
  for (const trophy of TROPHIES) {
    let state = createCollectionState();
    advanceCollection(state, { [trophy.metric]: trophy.target - 1 });
    assert.equal(state.unlockedTrophies.length, 0);
    state = reload(state);
    assert.equal(advanceCollection(state, { [trophy.metric]: 1 }), true);
    assert.deepEqual(state.unlockedTrophies, [trophy.id]);
    state.pending.length = 0; state = reload(state);
    advanceCollection(state, { [trophy.metric]: 5 });
    assert.equal(state.pending.length, 0, 'acknowledged trophies never replay');
    assert.equal(state.unlockedTrophies.length, 1);
  }
});
test('historical stats backfill exact evidence without guessing dashes, entries or flawless rounds', () => {
  const state = createCollectionState();
  const evidence = { bombSitesDestroyed: 1000, enemiesDestroyed: 5000, bossesDefeated: 100, highestRound: 30, totalCreditsEarned: 1000000 };
  const inventory = Object.fromEntries(Array.from({ length: 55 }, (_, i) => [String(i), { discovered: i < 50 }]));
  syncCollectionEvidence(state, evidence, inventory);
  assert.equal(state.unlockedTrophies.length, 6); assert.equal(state.pending.length, 6);
  syncCollectionEvidence(state, evidence, inventory); assert.equal(state.pending.length, 6);
  for (const key of ['dashes', 'portals', 'turrets', 'flawless']) assert.equal(state.progress[key], 0);
});
test('all sources and protocols use Epic rarity with increased boss and anomaly odds', () => {
  for (const protocol of Object.keys(RUN_PROTOCOLS)) {
    for (const source of ['normalEnemy', 'eliteEnemy', 'boss', 'anomaly', 'arcade']) {
      const request = { source, protocol, round: 26, seed: 44, sequence: 0 };
      const epic = getEffectiveModRarityDropChance(request, 'epic');
      assert.equal(relicDropChance(request), Math.min(.35, epic * (['boss', 'anomaly'].includes(source) ? 2 : 1)));
    }
  }
});
test('drop pools exclude owned and already-spawned pieces, and exhaust permanently', () => {
  const state = createCollectionState(), reserved = new Set();
  for (let i = 0; i < 6; i++) {
    const id = rollRelicFragment(state, reserved, 1, () => 0);
    assert.ok(id); assert.equal(reserved.has(id), false); reserved.add(id);
  }
  assert.equal(rollRelicFragment(state, reserved, 1, () => 0), null);
  for (const id of reserved) acquireFragment(state, id);
  assert.equal(rollRelicFragment(state, new Set(), 1, () => 0), null);
  assert.equal(rollRelicFragment(createCollectionState(), new Set(), .001, () => .5), null);
});
test('showcases accept only earned items and retain bounded user choices across reloads', () => {
  const state = createCollectionState();
  assert.equal(toggleCollectionDisplay(state, 'trophies', 'untouchable'), false);
  for (const trophy of TROPHIES) { advanceCollection(state, { [trophy.metric]: trophy.target }); toggleCollectionDisplay(state, 'trophies', trophy.id); }
  assert.deepEqual(reload(state).displayedTrophies, TROPHIES.slice(-4).map(t => t.id));
  for (const relic of RELICS) {
    assert.equal(toggleCollectionDisplay(state, 'relics', relic.id), false);
    for (const piece of relic.fragments) acquireFragment(state, piece.id);
    assert.equal(toggleCollectionDisplay(state, 'relics', relic.id), true);
  }
  assert.equal(reload(state).displayedRelics.length, 2);
  toggleCollectionDisplay(state, 'relics', RELICS[0].id); assert.equal(reload(state).displayedRelics.length, 1);
});
test('version 20 saves preserve cards, installed infusions, currency and progression with locked new categories', () => {
  const save = createDefaultLocalSave('collection', 'Collector');
  save.version = 20; delete save.collection;
  addModDrop(save.mods, MOD_DEFINITIONS.find(m => m.rarity === 'common').id);
  const card = save.mods.cards[0];
  assert.ok(card); save.mods.plasmaChips = 9999;
  assert.equal(infuseModCard(save.mods, card.instanceId, MOD_INFUSIONS[0].id).ok, true);
  save.wallet.credits = 4567; save.progress.enemiesDestroyed = 5000;
  const migrated = normalizeLocalSave(JSON.parse(JSON.stringify(save)));
  assert.equal(migrated.version, 21); assert.equal(migrated.wallet.credits, 4567);
  assert.equal(migrated.mods.cards[0].infusionId, card.infusionId);
  assert.deepEqual(migrated.collection.unlockedCategories, []);
  assert.ok(migrated.collection.unlockedTrophies.includes('exterminator'));
  assert.equal(migrated.collection.pending.length, 1);
  assert.deepEqual(normalizeLocalSave(migrated).collection, migrated.collection);
});
test('every collectible has distinct cached vector art including locked bases and complementary fragments', () => {
  const assets = collectionArtAssets();
  assert.equal(new Set(assets.map(a => a.key)).size, assets.length);
  assert.equal(new Set(assets.map(a => a.svg)).size, assets.length);
  assert.equal(assets.length, 30);
  for (const art of assets) { assert.match(art.svg, /<svg/); assert.doesNotMatch(art.svg, /<script|<image|http[^:]*:\/\/(?!www.w3.org)/); }
});
