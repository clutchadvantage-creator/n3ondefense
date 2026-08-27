import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('game-world cached art generators share boot-time dimensional primitives', () => {
  const helpers = source('../src/game/rendering/LayeredArtPrimitives.ts');
  const enemies = source('../src/game/enemies/EnemyArtTextures.ts');
  const bosses = source('../src/game/bosses/BossArtTextures.ts');
  const gas = source('../src/game/systems/GasHazardSystem.ts');
  assert.match(helpers, /drawLayeredPanel/);
  assert.match(helpers, /drawBakedShadow/);
  assert.match(helpers, /drawMechanicalRivets/);
  for (const consumer of [enemies, bosses, gas]) {
    assert.match(consumer, /LayeredArtPrimitives/);
    assert.match(consumer, /drawLayeredPanel/);
    assert.match(consumer, /drawBakedShadow/);
  }
  assert.doesNotMatch(helpers, /scene\.add|tweens|physics/);
});

test('enemy scale is presentation-only and authored colors can survive damage feedback', () => {
  const enemy = source('../src/game/enemies/Enemy.ts');
  const constructor = enemy.slice(enemy.indexOf('constructor('), enemy.indexOf('takeDamage('));
  assert.match(constructor, /this\.body\?\.setSize\(stats\.size \* bodyScale/);
  assert.match(constructor, /stats\.size \* ENEMY_VISUAL_SCALE \+ ENEMY_VISUAL_SIZE_BONUS/);
  assert.match(enemy, /if \(this\.visualTintOverride === null\) this\.clearTint\(\)/);
  assert.doesNotMatch(enemy, /hazardRadius.*ENEMY_VISUAL_SCALE/);
});

test('common and heavy projectile textures bake casing, body, core, and highlights once in Boot', () => {
  const boot = source('../src/game/scenes/BootScene.ts');
  const projectileBlock = boot.slice(boot.indexOf("createProjectileTexture('projectile-pulse'"), boot.indexOf("createProjectileTexture('projectile-sword'"));
  for (const key of ['projectile-pulse', 'projectile-missile', 'projectile-lightning', 'projectile-orb',
    'projectile-boss-cannon', 'projectile-boss-arcane', 'ammo-grenade-round', 'ammo-scatter-pellet']) {
    assert.match(projectileBlock, new RegExp(`createProjectileTexture\\('${key}'`));
  }
  assert.match(projectileBlock, /0x202a36/);
  assert.match(projectileBlock, /0xa9bac8/);
  assert.match(projectileBlock, /0xffffff/);
});

test('gas and lasers preserve authoritative simulation while bounding presentation work', () => {
  const gas = source('../src/game/systems/GasHazardSystem.ts');
  const lasers = source('../src/game/systems/LaserSecuritySystem.ts');
  assert.match(gas, /impactStates: GasImpactBurstState\[\]/);
  assert.match(gas, /Array\.from\(\{ length: GAS_HAZARD_BALANCE\.maximumCanisters \}/);
  assert.doesNotMatch(gas, /private readonly effects = new Set/);
  assert.match(lasers, /const segmentCount = this\.buildSegments/);
  assert.match(lasers, /touchesAnySegment\(player\.x, player\.y/);
  assert.match(lasers, /now - this\.lastVisualDrawAt >= LASER_VISUAL_FRAME_INTERVAL_MS/);
  assert.match(lasers, /if \(!this\.presentationVisible\) return/);
});

test('high-density deployables, pickups, and explosions retain bounded existing render paths', () => {
  const mineVfx = source('../src/game/vfx/MineExplosionVfx.ts');
  const pickups = source('../src/game/loot/GameplayPickupPresentation.ts');
  const fence = source('../src/game/abilities/Fence.ts');
  assert.match(mineVfx, /this\.states = Array\.from/);
  assert.match(mineVfx, /drawSmokeNebula/);
  assert.match(pickups, /createShell/);
  assert.match(pickups, /iconRig/);
  assert.match(fence, /FENCE_WIRE_LEVELS/);
  assert.match(fence, /poleSegments/);
  assert.match(fence, /currentPips/);
});
