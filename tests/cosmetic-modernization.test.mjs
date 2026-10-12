import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETICS, getCosmeticById } from '../src/data/cosmetics.ts';
import { PROJECTILE_BEHAVIOR_PROFILES as behaviors } from '../src/game/player/ProjectileBehaviorProfile.ts';
import { resolveProjectileCosmeticPresentation } from '../src/game/cosmetics/ProjectileCosmeticPresentation.ts';
import { createFencePreviewSvg, resolveFenceAppearance } from '../src/game/cosmetics/FenceCosmetics.ts';
import { LEGACY_BOMB_THEMES, createLegacyBombSvg } from '../src/game/cosmetics/LegacyBombArt.ts';
import { BOMB_EXPLOSION_COSMETIC_DEFINITIONS as explosions } from '../src/game/cosmetics/BombExplosionCosmeticDefinitions.ts';
import { TemporaryAmmoModeController, SCATTERSHOT_ANGLE_OFFSETS, grenadeArcHeight } from '../src/game/player/TemporaryAmmoMode.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

test('every equipped projectile shape remains independent of ammo activation, replacement and expiration',()=>{
  for(const item of COSMETICS.filter(i=>i.category==='projectileShape')){
    const original=resolveProjectileCosmeticPresentation(item),controller=new TemporaryAmmoModeController();
    controller.activate('grenade',0);assert.deepEqual(resolveProjectileCosmeticPresentation(item),original);
    controller.activate('scattershot',100);assert.deepEqual(resolveProjectileCosmeticPresentation(item),original);
    controller.reset();assert.deepEqual(resolveProjectileCosmeticPresentation(item),original);
    for(const mode of ['grenade','scattershot'])assert.ok(behaviors[mode].bodyWidth>0&&original.displayWidth>0);
  }
  assert.equal(behaviors.grenade.surfaceContact,'bouncing');assert.equal(behaviors.scattershot.surfaceContact,'airborne');
  assert.equal(SCATTERSHOT_ANGLE_OFFSETS.length,7);assert.equal(behaviors.scattershot.damageMultiplier,.3);
  assert.ok(grenadeArcHeight(235,0,470,38)>30);
});
test('all eight legacy signatures have authored layers while completed premium effects retain their identity',()=>{
  const effects=COSMETICS.filter(i=>i.category==='bombColor');
  assert.ok(effects.every(i=>i.bombExplosionEffect&&explosions[i.bombExplosionEffect]));
  for(const theme of LEGACY_BOMB_THEMES){
    assert.ok(effects.some(i=>i.bombExplosionEffect===theme));
    const svg=createLegacyBombSvg(theme,'hero');assert.match(svg,/viewBox="0 0 256 256"/);assert.ok(svg.length>600);
  }
  for(const id of ['neon-bats','witch-signal','pumpkin-reactor'])assert.equal(explosions[id].lifetimeMs,4200);
  assert.equal(getCosmeticById('bomb-death-signal').bombExplosionEffect,'death-signal');
  assert.equal(getCosmeticById('bomb-neon-bloom').bombExplosionEffect,'neon-bloom');
  assert.equal(explosions['death-signal'].sound,'bombsiteSkull');
  for(const theme of LEGACY_BOMB_THEMES.slice(0,6))assert.equal(explosions[theme].sound,undefined,'base blast sound is not doubled');
});
test('themed fences occupy the existing save slot and share their real equipment-family identity',()=>{
  for(const [id,motif] of [['critical-crunch','breakfast'],['tug-life','marine'],['medical','medical'],['ribbit-exe','organic'],['watcher','eye'],['halloween-witch','witch'],['halloween-bats','bats'],['halloween-pumpkin','pumpkin']]){
    const item=getCosmeticById('fence-'+id);assert.equal(item.category,'fenceStyle');assert.equal(resolveFenceAppearance(item).motif,motif);
    const save=createDefaultLocalSave('fence-save','Fence');save.cosmetics.owned.push(item.id);save.cosmetics.equipped.fenceStyle=item.id;
    const restored=normalizeLocalSave(save);assert.equal(restored.cosmetics.equipped.fenceStyle,item.id);
  }
  assert.equal(getCosmeticById('fence-default').cost,0);
  assert.equal(new Set(COSMETICS.map(i=>i.id)).size,COSMETICS.length);
});
test('several visible fence cards have unique gradient IDs without cross-card artwork collisions',()=>{
  const ids=new Set();for(const item of COSMETICS.filter(i=>i.category==='fenceStyle')){
    const svg=createFencePreviewSvg(item),matches=[...svg.matchAll(/\bid="([^"]+)"/g)];assert.equal(matches.length,2);
    for(const [,id] of matches){assert.ok(!ids.has(id));ids.add(id);assert.ok(svg.includes('url(#'+id+')'));}
  }
});
