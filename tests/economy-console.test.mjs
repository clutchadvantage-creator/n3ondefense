import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COSMETICS } from '../src/data/cosmetics.ts';
import { UPGRADE_DEFINITIONS } from '../src/data/upgrades.ts';
import {
  buildEconomyAnalytics,
  getCreditEquivalentRate,
  getExchangeRoundTrip
} from '../src/game/economy/EconomyAnalytics.ts';
import { MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { MOD_INFUSIONS } from '../src/game/mods/infusions.ts';
import { MOD_BALANCE } from '../src/game/mods/modBalance.ts';
import { createDefaultLocalSave } from '../src/game/save/SaveValidator.ts';

test('portfolio analytics use published currency-to-credit liquidation rates', () => {
  const save = createDefaultLocalSave('economy-portfolio', 'Economy Portfolio');
  save.wallet.credits = 1_000;
  save.wallet.coreTokens = 10;
  save.mods.plasmaChips = 5;
  save.wallet.fluxCores = 1;
  const snapshot = buildEconomyAnalytics(save);
  assert.equal(getCreditEquivalentRate('credits'), 1);
  assert.equal(getCreditEquivalentRate('coreTokens'), 80);
  assert.equal(getCreditEquivalentRate('plasmaChips'), 40);
  assert.equal(getCreditEquivalentRate('fluxCores'), 30_000);
  assert.equal(snapshot.totalPortfolioCreditEquivalent, 32_000);
  assert.equal(snapshot.portfolio.reduce((sum, entry) => sum + entry.creditEquivalent, 0), 32_000);
  assert.ok(Math.abs(snapshot.portfolio.reduce((sum, entry) => sum + entry.percentage, 0) - 100) < 0.02);
});

test('zero and very high wallets remain finite and produce deterministic purchasing power', () => {
  const empty = createDefaultLocalSave('economy-empty', 'Economy Empty');
  const emptySnapshot = buildEconomyAnalytics(empty);
  assert.equal(emptySnapshot.totalPortfolioCreditEquivalent, 0);
  assert.ok(emptySnapshot.portfolio.every((entry) => entry.percentage === 0));
  const rich = createDefaultLocalSave('economy-rich', 'Economy Rich');
  rich.wallet.credits = 999_999_999;
  rich.wallet.coreTokens = 999_999;
  rich.mods.plasmaChips = 999_999;
  rich.wallet.fluxCores = 999_999;
  const richSnapshot = buildEconomyAnalytics(rich);
  assert.ok(Number.isFinite(richSnapshot.totalPortfolioCreditEquivalent));
  assert.ok(richSnapshot.store.affordableNow >= emptySnapshot.store.affordableNow);
  assert.ok(richSnapshot.purchasingPower.anomalyEntriesAtMinimum > richSnapshot.purchasingPower.anomalyEntriesAtMaximum);
});

test('store ownership and affordability come from the live cosmetics catalog', () => {
  const save = createDefaultLocalSave('economy-store', 'Economy Store');
  save.wallet.credits = 1_000_000_000;
  save.wallet.coreTokens = 1_000_000;
  save.mods.plasmaChips = 1_000_000;
  const open = buildEconomyAnalytics(save);
  assert.equal(open.store.total, COSMETICS.length);
  assert.ok(open.store.affordableNow > 0);
  save.cosmetics.owned = COSMETICS.map((item) => item.id);
  const complete = buildEconomyAnalytics(save);
  assert.equal(complete.store.owned, COSMETICS.length);
  assert.equal(complete.store.completionPercentage, 100);
  assert.equal(complete.store.affordableNow, 0);
  assert.equal(complete.store.cheapestUnowned, null);
});

test('permanent upgrade analytics handle new, partial and fully maxed profiles', () => {
  const save = createDefaultLocalSave('economy-upgrades', 'Economy Upgrades');
  const fresh = buildEconomyAnalytics(save).upgrades;
  assert.ok(fresh.maximumLevels > 0);
  assert.ok(fresh.remainingCredits > 0);
  const first = UPGRADE_DEFINITIONS[0];
  save.upgrades[first.id] = Math.floor(first.maxLevel / 2);
  const partial = buildEconomyAnalytics(save).upgrades;
  assert.ok(partial.currentLevels > fresh.currentLevels);
  assert.ok(partial.remainingCredits < fresh.remainingCredits);
  for (const definition of UPGRADE_DEFINITIONS) save.upgrades[definition.id] = definition.maxLevel;
  const maxed = buildEconomyAnalytics(save).upgrades;
  assert.equal(maxed.completionPercentage, 100);
  assert.equal(maxed.remainingCredits, 0);
  assert.equal(maxed.nextUpgrade, null);
});

test('Mod and infusion analytics use owned card ranks and authoritative costs', () => {
  const save = createDefaultLocalSave('economy-mods', 'Economy Mods');
  const [first, second] = MOD_DEFINITIONS;
  save.wallet.credits = 1_000_000;
  save.wallet.coreTokens = 10_000;
  save.mods.plasmaChips = 1_000;
  save.mods.inventory[first.id] = { rank: 0, duplicates: 0, discovered: true, acquiredCount: 1 };
  save.mods.inventory[second.id] = { rank: 3, duplicates: 0, discovered: true, acquiredCount: 1 };
  save.mods.cards = [
    { instanceId: 'economy-card-1', modId: first.id, acquiredAt: new Date(0).toISOString(), upgradeLevel: 0, infusionId: MOD_INFUSIONS[0].id },
    { instanceId: 'economy-card-2', modId: second.id, acquiredAt: new Date(0).toISOString(), upgradeLevel: 3 }
  ];
  const snapshot = buildEconomyAnalytics(save);
  assert.equal(snapshot.mods.cardCount, 2);
  assert.equal(snapshot.mods.maxRankCards, 1);
  assert.equal(snapshot.mods.upgradeableCards, 1);
  assert.ok(snapshot.mods.remainingCredits > 0);
  assert.equal(snapshot.infusions.installedCount, 1);
  assert.equal(snapshot.infusions.uninfusedEligibleCards, 1);
  assert.equal(snapshot.infusions.swapCost, MOD_BALANCE.infusionReconfigurationPlasmaCost);
  assert.equal(snapshot.infusions.removalCost, MOD_BALANCE.infusionRemovalPlasmaCost);
  assert.deepEqual(snapshot.infusions.costs.map((entry) => entry.value), MOD_INFUSIONS.map((entry) => entry.plasmaCost));
});

test('exchange spread reports the real asymmetric round-trip retention', () => {
  const spread = getExchangeRoundTrip('credits', 'fluxCores');
  assert.ok(spread);
  assert.equal(spread.retentionPercentage, 50);
  assert.equal(spread.spreadPercentage, 50);
});

test('finite progression excludes repeatable exchange and anomaly spending', () => {
  const save = createDefaultLocalSave('economy-finite', 'Economy Finite');
  const before = structuredClone(save);
  const snapshot = buildEconomyAnalytics(save);
  assert.deepEqual(snapshot.finiteProgression.map((entry) => entry.label), [
    'PERMANENT UPGRADES', 'UNOWNED COSMETICS', 'OWNED MOD RANKS'
  ]);
  assert.ok(snapshot.finiteProgression.every((entry) => entry.value >= 0));
  assert.deepEqual(save, before, 'analytics must remain read-only');
});

test('Economy Console exposes real tabs, matrix, analytics, and no decorative fake traces', () => {
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  const analytics = readFileSync(new URL('../src/game/economy/EconomyAnalytics.ts', import.meta.url), 'utf8');
  assert.match(garage, /ECONOMY CONSOLE \/\/ MARKET NODE/);
  assert.match(garage, /MARKET.*PROGRESSION.*COMMERCE.*MOD ECONOMY/s);
  assert.match(garage, /FULL EXCHANGE RATE MATRIX/);
  assert.match(garage, /SaveSystem\.getEconomyAnalytics/);
  assert.match(garage, /onTabLeft/);
  assert.match(garage, /onTabRight/);
  assert.doesNotMatch(garage, /FIXED RATE TRACE/);
  assert.doesNotMatch(garage, /Math\.sin\(pointIndex/);
  assert.match(analytics, /COSMETICS/);
  assert.match(analytics, /UPGRADE_DEFINITIONS/);
  assert.match(analytics, /MOD_INFUSIONS/);
});
