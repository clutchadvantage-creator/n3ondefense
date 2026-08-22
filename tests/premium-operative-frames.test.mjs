import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COSMETICS,
  getCosmeticPurchaseCosts,
  getCosmeticTextureKey,
  isPremiumCosmetic
} from '../src/data/cosmetics.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const boot = readFileSync(new URL('../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
const textures = readFileSync(new URL('../src/game/cosmetics/PremiumOperativeFrameTextures.ts', import.meta.url), 'utf8');
const player = readFileSync(new URL('../src/game/entities/Player.ts', import.meta.url), 'utf8');
const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../src/game/cosmetics/CosmeticPreview.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');
const storeCss = readFileSync(new URL('../src/ui/stores/storefront.css', import.meta.url), 'utf8');
const storeSvg = readFileSync(new URL('../src/ui/stores/PremiumOperativeFrameSvg.ts', import.meta.url), 'utf8');

const EXPECTED = [
  ['player-critical-crunch', 'CRITICAL CRUNCH', 'cerealBox', 'player-premium-critical-crunch', 10_000, 220, 0],
  ['player-probe-ably-fine', 'PROBE-ABLY FINE', 'alienHead', 'player-premium-probe-fine', 12_000, 250, 0],
  ['player-midlife-crisis-mk4', 'MIDLIFE CRISIS Mk. IV', 'hypercar', 'player-premium-midlife-crisis', 20_000, 400, 90],
  ['player-highly-tactical', 'HIGHLY TACTICAL', 'cyberLeaf', 'player-premium-highly-tactical', 13_000, 270, 25],
  ['player-tug-life', 'TUG LIFE', 'tugboat', 'player-premium-tug-life', 10_500, 220, 0],
  ['player-air-superiority-complex', 'AIR SUPERIORITY COMPLEX', 'stealthWing', 'player-premium-air-superiority', 18_000, 350, 65],
  ['player-eye-dont-like-that', "EYE DON'T LIKE THAT", 'eyeball', 'player-premium-eye-dont-like-that', 20_000, 400, 90],
  ['player-roll-model', 'ROLL MODEL', 'wheelchair', 'player-premium-roll-model', 15_000, 300, 45],
  ['player-ribbit-exe', 'RIBBIT.EXE', 'frog', 'player-premium-ribbit-exe', 11_000, 230, 20]
];

test('all nine detailed operative frames are premium multi-currency cosmetics', () => {
  for (const [id, label, shape, texture, credits, coreTokens, plasmaChips] of EXPECTED) {
    const item = COSMETICS.find((candidate) => candidate.id === id);
    assert.ok(item, id);
    assert.equal(item.category, 'playerShape');
    assert.equal(item.label, label);
    assert.equal(item.visualShape, shape);
    assert.equal(getCosmeticTextureKey(id, ''), texture);
    assert.equal(isPremiumCosmetic(item), true);
    assert.deepEqual(getCosmeticPurchaseCosts(item), { credits, coreTokens, plasmaChips });
    assert.ok(item.description?.length > 70, `${id} should have a collector-grade description`);
    assert.ok(item.previewScale && item.previewScale >= 0.9 && item.previewScale <= 1);
  }
});

test('regular cosmetics are inexpensive Credit-only unlocks while premium remains data-driven', () => {
  const regular = COSMETICS.filter((item) => !isPremiumCosmetic(item));
  assert.ok(regular.length > 20);
  for (const item of regular) {
    assert.equal(item.currency, 'credits', `${item.id} should use Credits`);
    assert.deepEqual(item.additionalCosts ?? {}, {}, `${item.id} should not have secondary currency costs`);
    assert.ok(item.cost <= 1_250, `${item.id} should remain an inexpensive regular unlock`);
  }
  assert.match(store, /isPremiumCosmetic\(item\)/);
  assert.doesNotMatch(store, /const premiumCosmeticIds|PREMIUM_COSMETIC_IDS/);
});

test('store cards expose premium framing, exact currency chips, and detailed vector previews', () => {
  assert.match(store, /renderCosmeticCostBreakdown/);
  assert.match(store, /cosmetic-currency-cost/);
  assert.match(store, /createPremiumOperativeFrameSvg/);
  assert.match(storeCss, /\.store-card\.premium/);
  assert.match(storeCss, /\.cosmetic-tier-marker\.premium/);
  assert.match(storeCss, /\.premium-frame-svg/);
  for (const [, , shape] of EXPECTED) assert.match(storeSvg, new RegExp(`${shape}:`));
});

test('premium operative art is available in Boot, Garage previews, and arena player rendering', () => {
  assert.match(boot, /createPremiumOperativeFrameTextures/);
  assert.match(boot, /createPremiumOperativeFrameTextures\(g\)/);
  for (const [, , , texture] of EXPECTED) assert.match(textures, new RegExp(`'${texture}'`));
  assert.match(preview, /item\.previewScale/);
  assert.match(preview, /addImage\(item\.previewIcon \?\? item\.textureKey \?\? item\.id\)/);
  assert.match(arena, /const playerTextureKey = getCosmeticTextureKey\(playerShapeId, 'player-circle'\)/);
  assert.match(arena, /new Player\([^;]+playerTextureKey/s);
  assert.doesNotMatch(arena, /new Player\([^;]+playerShapeId/s);
  assert.match(garage, /const resolvedTexture = getCosmeticTextureKey\(shapeId, 'player-circle'\)/);
  assert.match(garage, /this\.textures\.exists\(resolvedTexture\) \? resolvedTexture : 'player-circle'/);
  assert.match(player, /texture\.startsWith\('player-premium-'\)/);
  assert.match(player, /this\.setCircle\(12/);
});

test('premium frame ownership and equipped choice survive existing save normalization', () => {
  const save = createDefaultLocalSave('premium-frame-save', 'Premium Frame Save');
  save.cosmetics.owned.push('player-eye-dont-like-that', 'player-ribbit-exe');
  save.cosmetics.equipped.playerShape = 'player-eye-dont-like-that';
  const normalized = normalizeLocalSave(save);
  assert.ok(normalized);
  assert.ok(normalized.cosmetics.owned.includes('player-eye-dont-like-that'));
  assert.ok(normalized.cosmetics.owned.includes('player-ribbit-exe'));
  assert.equal(normalized.cosmetics.equipped.playerShape, 'player-eye-dont-like-that');
});

test('AIR SUPERIORITY COMPLEX is distinct from both existing aircraft silhouettes', () => {
  const existing = ['player-spaceship', 'player-airplane'].map((id) => COSMETICS.find((item) => item.id === id));
  const premiumWing = COSMETICS.find((item) => item.id === 'player-air-superiority-complex');
  assert.ok(existing.every(Boolean));
  assert.ok(premiumWing);
  assert.equal(premiumWing.visualShape, 'stealthWing');
  assert.ok(existing.every((item) => item.visualShape !== premiumWing.visualShape));
  assert.ok(existing.every((item) => item.textureKey !== premiumWing.textureKey));
});
