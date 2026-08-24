import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModArchiveAnalytics,
  createArchiveSignalTrace
} from '../src/game/mods/ModArchiveAnalytics.ts';
import { MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';

const collection = {
  inventory: {
    'split-current': { rank: 2, duplicates: 0, discovered: true, acquiredCount: 1 },
    'emergency-capacitor': { rank: 0, duplicates: 0, discovered: true, acquiredCount: 1 },
    'magnetic-payload': { rank: 0, duplicates: 0, discovered: true, acquiredCount: 1 }
  },
  cards: [
    { instanceId: 'card-a', modId: 'split-current', acquiredAt: '2026-01-01T00:00:00.000Z', upgradeLevel: 2 },
    { instanceId: 'card-b', modId: 'emergency-capacitor', acquiredAt: '2026-01-02T00:00:00.000Z', upgradeLevel: 0, infusionId: 'arcade-pop' },
    { instanceId: 'card-c', modId: 'magnetic-payload', acquiredAt: '2026-01-03T00:00:00.000Z', upgradeLevel: 0 }
  ],
  plasmaChips: 0,
  purchasedLoadoutSlots: 1,
  loadouts: [],
  activeLoadoutId: 'default'
};

test('archive analytics derive real collection, loadout, rarity, category, and salvage state', () => {
  const analytics = buildModArchiveAnalytics({
    collection,
    matchingCards: [collection.cards[0], collection.cards[2]],
    equippedCardIds: new Set(['card-a']),
    recyclableCards: [collection.cards[2]],
    selectedCardId: 'card-a',
    page: 1,
    pageCount: 3
  });

  assert.equal(analytics.totalCards, 3);
  assert.equal(analytics.matchingCards, 2);
  assert.equal(analytics.discoveredDefinitions, 3);
  assert.equal(analytics.totalDefinitions, MOD_DEFINITIONS.length);
  assert.equal(analytics.equippedCards, 1);
  assert.equal(analytics.infusedCards, 1);
  assert.equal(analytics.recyclableCards, 1);
  assert.ok(analytics.salvagePlasma > 0);
  assert.equal(analytics.rarityCounts.common, 1);
  assert.equal(analytics.rarityCounts.uncommon, 1);
  assert.equal(analytics.rarityCounts.rare, 1);
  assert.equal(analytics.categoryCounts.weapon, 1);
  assert.equal(analytics.categoryCounts.player, 1);
  assert.equal(analytics.categoryCounts.utility, 1);
  assert.deepEqual(analytics.rankCounts, [2, 0, 1, 0]);
  assert.equal(analytics.signalTrace.length, 14);
});

test('archive signal traces are deterministic, bounded, and selection-sensitive', () => {
  const first = createArchiveSignalTrace('card-a');
  const repeat = createArchiveSignalTrace('card-a');
  const other = createArchiveSignalTrace('card-b');
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first, other);
  assert.ok(first.every((value) => value >= 0.16 && value < 0.86));
});

