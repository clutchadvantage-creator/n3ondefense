import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COSMETICS, getCosmeticPurchaseCosts } from '../src/data/cosmetics.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const turretRuntime = readFileSync(new URL('../src/game/abilities/Turret.ts', import.meta.url), 'utf8');
const turretVisual = readFileSync(new URL('../src/game/cosmetics/PremiumTurretVisual.ts', import.meta.url), 'utf8');
const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../src/game/cosmetics/CosmeticPreview.ts', import.meta.url), 'utf8');
const storefront = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');
const storeSvg = readFileSync(new URL('../src/ui/stores/PremiumTurretSkinSvg.ts', import.meta.url), 'utf8');
const storeCss = readFileSync(new URL('../src/ui/stores/storefront.css', import.meta.url), 'utf8');
const collection = readFileSync(new URL('../src/game/scenes/ModCollectionScene.ts', import.meta.url), 'utf8');

const EXPECTED = new Map([
  ['turret-void-reactor', 'void-reactor'],
  ['turret-arc-tesla', 'arc-tesla'],
  ['turret-cyber-shark', 'cyber-shark'],
  ['turret-glitch-phantom', 'glitch-phantom'],
  ['turret-hellfire-core', 'hellfire-core'],
  ['turret-arctic-zero', 'arctic-zero'],
  ['turret-mini-orbital', 'mini-orbital'],
  ['turret-bomb-buddy', 'bomb-buddy']
]);

test('all eight premium turret chassis are distinct multi-currency cosmetics', () => {
  for (const [id, effect] of EXPECTED) {
    const item = COSMETICS.find((candidate) => candidate.id === id);
    assert.ok(item, id);
    assert.equal(item.category, 'turretSkin');
    assert.equal(item.turretSkinEffect, effect);
    assert.equal(item.priceTier, 'prestige');
    assert.ok(item.description?.length > 80);
    const costs = getCosmeticPurchaseCosts(item);
    assert.ok(costs.credits >= 10_000);
    assert.ok(costs.coreTokens >= 200);
    assert.ok(costs.plasmaChips <= 100);
    assert.match(turretVisual, new RegExp(`case '${effect}'`));
    assert.match(storeSvg, new RegExp(`'${effect}'`));
  }
});

test('premium turret ownership and equipped choice remain normal profile state', () => {
  const save = createDefaultLocalSave('premium-turret-test', 'Premium Turret Test');
  save.cosmetics.owned.push('turret-void-reactor', 'turret-mini-orbital');
  save.cosmetics.equipped.turretSkin = 'turret-mini-orbital';
  const restored = normalizeLocalSave(save);
  assert.ok(restored);
  assert.ok(restored.cosmetics.owned.includes('turret-void-reactor'));
  assert.equal(restored.cosmetics.equipped.turretSkin, 'turret-mini-orbital');
});

test('store, Gear Locker, and arena resolve the same data-driven turret art', () => {
  assert.match(storefront, /createPremiumTurretSkinSvg\(item\.turretSkinEffect\)/);
  assert.match(storeCss, /\.premium-turret-svg/);
  assert.match(preview, /createPremiumTurretVisual/);
  assert.match(arena, /equippedTurretSkin\?\.turretSkinEffect/);
  assert.match(turretRuntime, /createPremiumTurretVisual/);
  assert.match(turretRuntime, /this\.sprite\.setSize\(30, 46\)/, 'premium art must not change the turret body');
  assert.match(turretRuntime, /markFired/);
});

test('Mod inspector action stack uses lower space while preserving a status strip', () => {
  assert.match(collection, /buttonStackBottomInset/);
  assert.match(collection, /\+ \(this\.status \? 12 : 0\)/);
  assert.match(collection, /buttonY = y \+ height - buttonGap \* 4 - buttonStackBottomInset/);
});
