import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COSMETICS, getCosmeticPurchaseCosts } from '../src/data/cosmetics.ts';
import {
  createPremiumProjectileShapeSvgDataUri,
  createPremiumProjectileShapeSvgMarkup,
  isPremiumProjectileShape
} from '../src/game/cosmetics/PremiumProjectileShapeArt.ts';
import { resolveProjectileCosmeticPresentation } from '../src/game/cosmetics/ProjectileCosmeticPresentation.ts';
import { buildEconomyAnalytics } from '../src/game/economy/EconomyAnalytics.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const boot = readFileSync(new URL('../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const heist = readFileSync(new URL('../src/game/anomalies/heist/HeistScene.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');
const storeCss = readFileSync(new URL('../src/ui/stores/storefront.css', import.meta.url), 'utf8');
const turretRuntime = readFileSync(new URL('../src/game/cosmetics/PremiumTurretVisual.ts', import.meta.url), 'utf8');
const turretStoreArt = readFileSync(new URL('../src/ui/stores/PremiumTurretSkinSvg.ts', import.meta.url), 'utf8');
const turret = readFileSync(new URL('../src/game/abilities/Turret.ts', import.meta.url), 'utf8');

const EXPECTED_PROJECTILES = new Map([
  ['projectile-shape-neon-injection', ['medicalNeedle', 'NEON INJECTION', 11_000, 230, 20]],
  ['projectile-shape-torque', ['hardwareBolt', 'TORQUE', 12_500, 250, 25]],
  ['projectile-shape-xeno-slime', ['alienGoo', 'XENO SLIME', 16_000, 320, 55]],
  ['projectile-shape-crunch-loop', ['cerealLoop', 'CRUNCH LOOP', 13_000, 270, 30]],
  ['projectile-shape-swamp-snack', ['fly', 'SWAMP SNACK', 11_500, 240, 20]],
  ['projectile-shape-rolled-up', ['joint', 'ROLLED UP', 15_000, 300, 45]],
  ['projectile-shape-fox-two', ['tacticalMissile', 'FOX TWO', 18_000, 350, 65]],
  ['projectile-shape-cry-about-it', ['teardrop', 'CRY ABOUT IT', 20_000, 400, 90]]
]);

test('eight premium projectile shapes have authored art, native palettes, and exact multi-currency prices', () => {
  const authoredSvg = new Set();
  for (const [id, [shape, label, credits, coreTokens, plasmaChips]] of EXPECTED_PROJECTILES) {
    const item = COSMETICS.find((candidate) => candidate.id === id);
    assert.ok(item, id);
    assert.equal(item.category, 'projectileShape');
    assert.equal(item.label, label);
    assert.equal(item.visualShape, shape);
    assert.equal(item.priceTier, 'prestige');
    assert.equal(item.preserveNativePalette, true);
    assert.ok(item.description?.length > 80);
    assert.equal(isPremiumProjectileShape(item.visualShape), true);
    assert.deepEqual(getCosmeticPurchaseCosts(item), { credits, coreTokens, plasmaChips });

    const svg = createPremiumProjectileShapeSvgMarkup(shape, item.color, item.accentColor ?? item.color);
    assert.match(svg, new RegExp(`data-projectile-shape="${shape}"`));
    assert.match(svg, /viewBox="0 0 120 64"/);
    authoredSvg.add(svg);

    const presentation = resolveProjectileCosmeticPresentation(item);
    assert.equal(presentation.textureKey, item.textureKey);
    assert.equal(presentation.preserveNativePalette, true);
    assert.ok(presentation.displayWidth > 8);
    assert.ok(presentation.displayHeight >= 12);
  }
  assert.equal(authoredSvg.size, EXPECTED_PROJECTILES.size);
});

test('premium projectile SVGs are boot-cached and shared by Store, Locker preview, Arena, and HEIST', () => {
  const sample = COSMETICS.find((item) => item.id === 'projectile-shape-fox-two');
  assert.ok(sample && isPremiumProjectileShape(sample.visualShape));
  const uri = createPremiumProjectileShapeSvgDataUri(sample.visualShape, sample.color, sample.accentColor ?? sample.color);
  assert.match(uri, /^data:image\/svg\+xml;base64,/);
  assert.match(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64').toString('utf8'), /data-projectile-shape="tacticalMissile"/);

  assert.match(boot, /createPremiumProjectileShapeSvgDataUri/);
  assert.match(boot, /this\.load\.svg\(/);
  assert.match(store, /createPremiumProjectileShapeSvg/);
  assert.match(storeCss, /premium-projectile-shape-svg/);
  assert.match(arena, /resolveProjectileCosmeticPresentation/);
  assert.match(heist, /resolveProjectileCosmeticPresentation/);
  assert.doesNotMatch(arena, /createPremiumProjectileShapeSvgDataUri/);
  assert.doesNotMatch(heist, /createPremiumProjectileShapeSvgDataUri/);
});

test('native projectile art keeps standard combat bodies, travel alignment, and dedicated temporary-ammo identities', () => {
  assert.match(arena, /setRotation\(state\.rotation\)/);
  assert.match(heist, /setRotation\(state\.rotation\)/);
  assert.match(arena, /8 \/ Math\.max\(0\.001, Math\.abs\(sprite\.scaleX\)\)/);
  assert.match(heist, /8 \/ Math\.max\(0\.001, Math\.abs\(projectile\.sprite\.scaleX\)\)/);
  assert.match(arena, /if \(!nativePalette\) sprite\.setTint\(state\.tint\)/);
  assert.match(heist, /if \(!nativePalette\) projectile\.sprite\.setTint\(state\.tint\)/);
  assert.match(arena, /emitAccent/);
  assert.match(heist, /emitAccent/);
  assert.match(arena, /'ammo-grenade-round'/);
  assert.match(arena, /'ammo-scatter-pellet'/);
  assert.match(heist, /'ammo-grenade-round'/);
  assert.match(heist, /'ammo-scatter-pellet'/);
});

test('premium projectile ownership/equip state persists and Economy Console derives the expanded catalog', () => {
  const save = createDefaultLocalSave('premium-projectile-save', 'Premium Projectile Save');
  save.cosmetics.owned.push('projectile-shape-xeno-slime', 'projectile-shape-fox-two');
  save.cosmetics.equipped.projectileShape = 'projectile-shape-fox-two';
  const restored = normalizeLocalSave(save);
  assert.ok(restored);
  assert.ok(restored.cosmetics.owned.includes('projectile-shape-xeno-slime'));
  assert.equal(restored.cosmetics.equipped.projectileShape, 'projectile-shape-fox-two');
  assert.equal(buildEconomyAnalytics(restored).store.total, COSMETICS.length);
});

test('Harbor Beacon is a premium Tug Life turret frame with shared 2.5D store and runtime art', () => {
  const item = COSMETICS.find((candidate) => candidate.id === 'turret-harbor-beacon');
  assert.ok(item);
  assert.equal(item.category, 'turretSkin');
  assert.equal(item.label, 'HARBOR BEACON');
  assert.equal(item.turretSkinEffect, 'harbor-beacon');
  assert.equal(item.priceTier, 'prestige');
  assert.deepEqual(getCosmeticPurchaseCosts(item), { credits: 15_000, coreTokens: 300, plasmaChips: 45 });
  assert.match(item.description ?? '', /dock bollard/i);
  assert.match(turretRuntime, /case 'harbor-beacon'/);
  assert.match(turretRuntime, /Mooring collar, safety band, and rope wrap/);
  assert.match(turretStoreArt, /'harbor-beacon'/);
  assert.match(turretStoreArt, /pt-beacon-glass/);
  assert.match(turretStoreArt, /pt-rope/);
  assert.match(turret, /this\.sprite\.setSize\(30, 46\)/, 'cosmetic chassis must keep authoritative turret body');
  assert.match(turretRuntime, /markFired/);
});

