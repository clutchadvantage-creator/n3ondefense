import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COSMETICS, getCosmeticPurchaseCosts } from '../src/data/cosmetics.ts';

const boost = readFileSync(new URL('../src/game/systems/BoostVisualSystem.ts', import.meta.url), 'utf8');
const profileStore = readFileSync(new URL('../src/game/state/PlayerProfileStore.ts', import.meta.url), 'utf8');
const storefront = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');

test('every premium cosmetic charges thousands of credits and hundreds of Core Tokens without Flux Cores', () => {
  const premium = COSMETICS.filter((item) => item.priceTier === 'prestige');
  assert.ok(premium.length >= 10);
  for (const item of premium) {
    const costs = getCosmeticPurchaseCosts(item);
    assert.ok(costs.credits >= 5_000, `${item.id} should cost several thousand Credits`);
    assert.ok(costs.coreTokens >= 100, `${item.id} should cost hundreds of Core Tokens`);
    assert.ok(costs.plasmaChips <= 100, `${item.id} must never exceed 100 Plasma Chips`);
    assert.equal('fluxCores' in costs, false);
  }
  assert.ok(premium.some((item) => getCosmeticPurchaseCosts(item).plasmaChips > 0));
});

test('six premium dash effects are registered and resolved by the authoritative arena presentation', () => {
  const expected = new Map([
    ['dash-firestorm', 'fire-smoke'],
    ['dash-grass', 'grass-clippings'],
    ['dash-bubbles', 'bubbles'],
    ['dash-plasma', 'plasma'],
    ['dash-jet-plume', 'jet-plume'],
    ['dash-stars', 'stars']
  ]);
  for (const [id, effect] of expected) {
    const item = COSMETICS.find((candidate) => candidate.id === id);
    assert.equal(item?.category, 'dashTrail');
    assert.equal(item?.dashTrailEffect, effect);
    assert.equal(item?.priceTier, 'prestige');
    assert.match(boost, new RegExp(`'${effect}'`));
  }
});

test('premium multi-currency purchases validate before mutating and the storefront exposes all balances', () => {
  assert.match(profileStore, /static purchaseAndEquipCosmetic/);
  assert.match(profileStore, /if \(missing\.length > 0\) return/);
  assert.ok(profileStore.indexOf('if (missing.length > 0) return') < profileStore.indexOf("spendCreditsAtomic(save.wallet, save.progress, costs.credits, 'cosmetic')"));
  assert.match(profileStore, /save\.wallet\.coreTokens -= costs\.coreTokens/);
  assert.match(profileStore, /save\.mods\.plasmaChips -= costs\.plasmaChips/);
  assert.match(storefront, /plasmaChips: number/);
  assert.match(storefront, /formatCosmeticCost/);
  assert.match(storefront, /formatCosmeticShortfall/);
});
