import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COSMETICS } from '../src/data/cosmetics.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { BOMB_EXPLOSION_COSMETIC_DEFINITIONS } from '../src/game/cosmetics/BombExplosionCosmeticDefinitions.ts';

const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/game/cosmetics/BombExplosionCosmeticVfx.ts', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../src/game/cosmetics/CosmeticPreview.ts', import.meta.url), 'utf8');
const storefront = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');
const storefrontCss = readFileSync(new URL('../src/ui/stores/storefront.css', import.meta.url), 'utf8');
const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');

test('premium bomb signatures are paid, exclusive bomb-category cosmetics', () => {
  const deathSignal = COSMETICS.find((item) => item.id === 'bomb-death-signal');
  const neonBloom = COSMETICS.find((item) => item.id === 'bomb-neon-bloom');
  const neonBats = COSMETICS.find((item) => item.id === 'bomb-neon-bats');
  const witchSignal = COSMETICS.find((item) => item.id === 'bomb-witch-signal');
  assert.ok(deathSignal);
  assert.ok(neonBloom);
  assert.deepEqual(
    [deathSignal.category, deathSignal.currency, deathSignal.cost, deathSignal.bombExplosionEffect],
    ['bombColor', 'credits', 12_000, 'death-signal']
  );
  assert.deepEqual(
    [neonBloom.category, neonBloom.currency, neonBloom.cost, neonBloom.bombExplosionEffect],
    ['bombColor', 'credits', 10_000, 'neon-bloom']
  );
  assert.deepEqual([neonBats?.category, neonBats?.currency, neonBats?.cost, neonBats?.bombExplosionEffect], ['bombColor', 'credits', 18_000, 'neon-bats']);
  assert.deepEqual([witchSignal?.category, witchSignal?.currency, witchSignal?.cost, witchSignal?.bombExplosionEffect], ['bombColor', 'plasmaChips', 90, 'witch-signal']);
  assert.ok(deathSignal.description?.includes('cyber-skull'));
  assert.ok(neonBloom.description?.includes('flower'));
  assert.ok(deathSignal.cost > 0 && neonBloom.cost > 0);
});

test('bomb cosmetic ownership and the single equipped slot survive save normalization', () => {
  const save = createDefaultLocalSave('bomb-cosmetic-test', 'Bomb Cosmetic Test');
  save.cosmetics.owned.push('bomb-death-signal', 'bomb-neon-bloom');
  save.cosmetics.equipped.bombColor = 'bomb-neon-bloom';
  const restored = normalizeLocalSave(save);
  assert.ok(restored);
  assert.ok(restored.cosmetics.owned.includes('bomb-death-signal'));
  assert.ok(restored.cosmetics.owned.includes('bomb-neon-bloom'));
  assert.equal(restored.cosmetics.equipped.bombColor, 'bomb-neon-bloom');
  assert.equal(typeof restored.cosmetics.equipped.bombColor, 'string');
});

test('arena leaves the authoritative bomb explosion intact and invokes one generic cosmetic hook after it', () => {
  const detonationStart = arena.indexOf('private detonateSite');
  const detonationEnd = arena.indexOf('private recoveryAfterSiteDestroy', detonationStart);
  const detonation = arena.slice(detonationStart, detonationEnd);
  assert.match(detonation, /this\.mineExplosionVfx\.emitColors\([\s\S]*?BOMBSITE_EXPLOSION_VISUAL_RADIUS/);
  assert.match(detonation, /this\.bombExplosionCosmeticVfx\.emitEquipped\([\s\S]*?getEquippedCosmeticId\('bombColor'\)/);
  assert.ok(detonation.indexOf('mineExplosionVfx.emitColors') < detonation.indexOf('bombExplosionCosmeticVfx.emitEquipped'));
  assert.match(detonation, /this\.audio\.playSfx\('bomb'\)/);
  assert.match(detonation, /this\.fluxCores\?\.damageArea/);
  assert.doesNotMatch(detonation, /death-signal|neon-bloom/);
});

test('signature renderer is bounded, batched, data-driven, and has complete lifecycle cleanup', () => {
  assert.equal(BOMB_EXPLOSION_COSMETIC_DEFINITIONS['death-signal'].lifetimeMs, 2_700);
  assert.equal(BOMB_EXPLOSION_COSMETIC_DEFINITIONS['neon-bloom'].lifetimeMs, 2_750);
  assert.equal(BOMB_EXPLOSION_COSMETIC_DEFINITIONS['neon-bats'].lifetimeMs, 2_850);
  assert.equal(BOMB_EXPLOSION_COSMETIC_DEFINITIONS['witch-signal'].lifetimeMs, 2_900);
  assert.match(runtime, /const MAX_ACTIVE_EFFECTS = 6/);
  assert.match(runtime, /this\.renderers = \{[\s\S]*?'death-signal'[\s\S]*?'neon-bloom'[\s\S]*?'neon-bats'[\s\S]*?'witch-signal'/);
  assert.match(runtime, /crowded \|\| !this\.particlesEnabled/);
  assert.match(runtime, /recommendedSceneHoldMs/);
  assert.doesNotMatch(runtime, /physics\.add|add\.sprite|tweens\.add|delayedCall|setInteractive/);
  assert.match(arena, /this\.bombExplosionCosmeticVfx\.reset\(\)/);
  assert.match(arena, /private triggerDefeat[\s\S]*?this\.bombExplosionCosmeticVfx\.reset\(\)/);
  assert.match(arena, /this\.bombExplosionCosmeticVfx\?\.destroy\(\)/);
});

test('store and redesigned Gear Locker expose distinct procedural previews for both signatures', () => {
  assert.match(storefront, /item\.description \?\? this\.cosmeticDescription/);
  assert.match(storefront, /visual\.dataset\.effect = item\.bombExplosionEffect/);
  assert.match(storefrontCss, /data-effect=death-signal/);
  assert.match(storefrontCss, /data-effect=neon-bloom/);
  assert.match(storefrontCss, /data-effect=neon-bats/);
  assert.match(storefrontCss, /data-effect=witch-signal/);
  assert.match(preview, /item\.bombExplosionEffect === 'death-signal'/);
  assert.match(preview, /drawFlower/);
  assert.match(preview, /skull\.strokeEllipse/);
  assert.match(preview, /container\.once\('destroy'/);
  assert.match(garage, /COSMETICS\.filter\(\(item\) => item\.category === category && save\.unlockedCosmetics\.includes\(item\.id\)\)/);
  assert.match(garage, /createCosmeticPreview\(this, item/);
});
