import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ReusableObjectPool } from '../src/game/performance/ReusableObjectPool.ts';
import { UniformSpatialGrid } from '../src/game/performance/UniformSpatialGrid.ts';
import { FramePerformanceMonitor } from '../src/game/performance/FramePerformanceMonitor.ts';
import { shouldReplaceTurretTarget } from '../src/game/performance/Targeting.ts';
import { GridPathfinder } from '../src/game/systems/GridPathfinder.ts';

test('reusable pool resets stale combat state and rejects duplicate release', () => {
  const retired = [];
  const pool = new ReusableObjectPool(
    (state) => ({ ...state, listeners: ['old'] }),
    (item, state) => Object.assign(item, state, { listeners: [] }),
    (item) => { item.owner = null; item.listeners.length = 0; retired.push(item); }
  );

  const first = pool.obtain({ damage: 10, owner: 'player' });
  first.damage = 999;
  first.listeners.push('hit');
  assert.equal(pool.release(first), true);
  assert.equal(pool.release(first), false);

  const reused = pool.obtain({ damage: 22, owner: 'turret' });
  assert.equal(reused, first);
  assert.equal(reused.damage, 22);
  assert.equal(reused.owner, 'turret');
  assert.deepEqual(reused.listeners, []);
  assert.deepEqual(pool.stats(), { created: 1, reused: 1, active: 1, available: 0 });
  assert.equal(retired.length, 1);
});

test('reusable pool trims only inactive high-water capacity with a bounded budget', () => {
  const destroyed = [];
  const pool = new ReusableObjectPool(
    (state) => ({ value: state.value }),
    (item, state) => { item.value = state.value; },
    () => {}
  );
  const items = Array.from({ length: 10 }, (_, value) => pool.obtain({ value }));
  const stillActive = items[0];
  for (let index = 1; index < items.length; index += 1) pool.release(items[index]);

  assert.equal(pool.trimAvailable(3, (item) => destroyed.push(item), 2), 2);
  assert.equal(pool.stats().active, 1);
  assert.equal(pool.stats().available, 7);
  assert.equal(pool.owns(stillActive), true);
  assert.equal(destroyed.length, 2);
});

test('reusable pool can release references after its external Scene lifecycle destroys objects', () => {
  const pool = new ReusableObjectPool((state) => ({ ...state }), Object.assign, () => {});
  const first = pool.obtain({ value: 1 });
  const second = pool.obtain({ value: 2 });
  pool.release(first);
  assert.equal(pool.owns(second), true);
  pool.discardReferences();
  assert.deepEqual(pool.stats(), { created: 2, reused: 0, active: 0, available: 0 });
  assert.equal(pool.owns(second), false);
});

test('grid pathfinding reuses typed search storage and routes around padded walls', () => {
  const pathfinder = new GridPathfinder(640, 480, 32, [{ x: 256, y: 0, w: 32, h: 320 }], 8);
  const path = pathfinder.findPath(64, 64, 560, 64, { smooth: true, maxIterations: 5000 });
  assert.ok(path.length > 0);
  assert.equal(path.some((point) => point.x >= 248 && point.x <= 296 && point.y < 328), false);

  const source = fs.readFileSync(new URL('../src/game/systems/GridPathfinder.ts', import.meta.url), 'utf8');
  assert.match(source, /new Float64Array/);
  assert.match(source, /private popMinimum/);
  assert.doesNotMatch(source, /new Map|new Set|\.sort\(|\.shift\(/);
});

test('spatial grid removes stale contacts when rebuilt and bounds nearby work', () => {
  const grid = new UniformSpatialGrid(100);
  const near = { id: 'near', x: 25, y: 30 };
  const adjacent = { id: 'adjacent', x: 115, y: 30 };
  const far = { id: 'far', x: 700, y: 700 };
  grid.rebuild([near, adjacent, far]);
  const contacts = [];
  grid.forEachNearby(50, 50, 90, (item) => contacts.push(item.id));
  assert.deepEqual(new Set(contacts), new Set(['near', 'adjacent']));

  grid.rebuild([far]);
  const afterRebuild = [];
  grid.forEachNearby(50, 50, 90, (item) => afterRebuild.push(item.id));
  assert.deepEqual(afterRebuild, []);
});

test('single-pass turret selection preserves priority, distance, and stable tie order', () => {
  assert.equal(shouldReplaceTurretTarget(false, 100, 1, false, false, Infinity, Infinity), true);
  assert.equal(shouldReplaceTurretTarget(true, 10_000, 2, true, false, 100, 1), true);
  assert.equal(shouldReplaceTurretTarget(false, 10, 2, true, true, 10_000, 1), false);
  assert.equal(shouldReplaceTurretTarget(true, 99, 2, true, true, 100, 1), true);
  assert.equal(shouldReplaceTurretTarget(true, 100, 0, true, true, 100, 1), true);
});

test('frame monitor reports hitch thresholds without per-frame arrays', () => {
  const monitor = new FramePerformanceMonitor(5);
  for (const delta of [16, 17, 34, 51, 20]) monitor.record(delta);
  const snapshot = monitor.snapshot();
  assert.equal(snapshot.samples, 5);
  assert.equal(snapshot.framesOver33Ms, 2);
  assert.equal(snapshot.framesOver50Ms, 1);
  assert.equal(snapshot.maximumMs, 51);
  assert.equal(snapshot.averageMs, 27.6);
});

test('Arena routes all standard projectiles through the reusable pool', () => {
  const source = fs.readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const directPhysicsImages = source.match(/this\.physics\.add\.image\(/g) ?? [];
  assert.equal(directPhysicsImages.length, 2, 'only the projectile-pool factory and destructible homing missile should construct physics images');
  assert.match(source, /this\.projectilePool\.releaseAll\(\)/);
  assert.match(source, /dx \* dx \+ dy \* dy < radius \* radius/);
  assert.doesNotMatch(source, /this\.enemies\.find\(\(e\) => Phaser\.Math\.Distance\.Between/);
});

test('pooled combat objects and Arena listeners are fully retired on restart and shutdown', () => {
  const source = fs.readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const input = fs.readFileSync(new URL('../src/game/input/PlayerInput.ts', import.meta.url), 'utf8');
  assert.match(source, /body\.enable = false/);
  assert.match(source, /projectile\.crossedFences\?\.clear\(\)/);
  assert.match(source, /projectile\.telemetryOwner = undefined/);
  assert.match(source, /this\.projectilePool\?\.destroy/);
  assert.match(source, /this\.fxCirclePool\?\.destroy/);
  assert.match(source, /this\.projectileTrails\?\.destroy/);
  assert.match(source, /this\.destroyEnemyColliders\(enemy\)/);
  assert.match(source, /for \(const collider of colliders\) collider\.destroy\(\)/);
  assert.match(source, /this\.scale\.off\('resize'/);
  assert.match(source, /this\.playerInput\?\.destroy\(\)/);
  assert.match(input, /window\.removeEventListener\('keydown'/);
  assert.match(input, /this\.scene\.input\.off\('pointerdown'/);
});

test('projectile trails are batched without per-projectile display objects or tweens', () => {
  const arena = fs.readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const batch = fs.readFileSync(new URL('../src/game/performance/ProjectileTrailBatch.ts', import.meta.url), 'utf8');
  assert.match(arena, /this\.projectileTrails\?\.beginFrame\(now\)/);
  assert.match(arena, /this\.projectileTrails\?\.render\(now\)/);
  assert.match(arena, /p\.nextTrailAt = now \+ 30/);
  assert.match(batch, /scene\.add\.graphics\(\)/);
  assert.match(batch, /this\.available\.pop\(\)/);
  assert.doesNotMatch(batch, /tweens|add\.circle/);
});

test('player muzzle flashes use a bounded directional graphics renderer instead of expanding circles', () => {
  const arena = fs.readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const heist = fs.readFileSync(new URL('../src/game/anomalies/heist/HeistScene.ts', import.meta.url), 'utf8');
  const muzzle = fs.readFileSync(new URL('../src/game/vfx/PlayerMuzzleFlashVfx.ts', import.meta.url), 'utf8');
  assert.match(arena, /this\.muzzleFlashVfx\.emit\(\s*spawnX,\s*spawnY,\s*angle,\s*projectileColor,/);
  assert.match(heist, /this\.muzzleFlashVfx\.emit\(\s*x,\s*y,\s*angle,\s*projectileColor,/);
  assert.doesNotMatch(arena, /radius: ammoMode === 'scattershot' \? 16/);
  assert.match(muzzle, /FULL_QUALITY_SLOTS = 12/);
  assert.match(muzzle, /fillTriangle\(/);
  assert.match(muzzle, /smokeGraphics/);
  assert.match(muzzle, /mixColor\(color, 0x83949d, 0\.7\)/);
  assert.doesNotMatch(muzzle, /scene\.add\.circle|this\.tweens|scene\.tweens|delayedCall\(|setTimeout\(/);
});

test('persistent combat progression is batched at safe transitions instead of every kill', () => {
  const arena = fs.readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /this\.pendingProgressEnemyKills \+= 1/);
  assert.match(arena, /private flushPendingCombatProgress/);
  assert.match(arena, /SaveSystem\.recordCombatProgress\(enemiesDestroyed, bombSitesDestroyed, this\.protocol\)/);
  assert.doesNotMatch(arena, /SaveSystem\.recordEnemyDestroyed\(\)/);
  assert.doesNotMatch(arena, /SaveSystem\.recordBombSiteDestroyed\(\)/);
});

test('security laser geometry reuses fixed storage and collision checks avoid square roots', () => {
  const source = fs.readFileSync(new URL('../src/game/systems/LaserSecuritySystem.ts', import.meta.url), 'utf8');
  assert.match(source, /private readonly segments: LaserSegment\[\] = Array\.from/);
  assert.match(source, /private buildSegments/);
  assert.match(source, /distanceSquaredToSegment/);
  assert.doesNotMatch(source, /segments\.some/);
  assert.doesNotMatch(source, /Phaser\.Math\.Distance\.Between/);
});

test('combat telemetry batches persistence but encounter and run boundaries flush immediately', () => {
  const source = fs.readFileSync(new URL('../src/game/telemetry/GameplayTelemetryRecorder.ts', import.meta.url), 'utf8');
  assert.match(source, /requestIdleCallback/);
  assert.match(source, /\}, 30_000\);/);
  assert.match(source, /static endEncounter[\s\S]*?deriveEncounter\(encounter\);\s*this\.persistNow\(\);/);
  assert.match(source, /static finishRun[\s\S]*?this\.archiveActiveRun\(outcome\);\s*this\.persistNow\(\);/);
});

test('fence endpoints are precomputed once for split and collision hot paths', () => {
  const source = fs.readFileSync(new URL('../src/game/abilities/Fence.ts', import.meta.url), 'utf8');
  assert.match(source, /readonly x1: number/);
  assert.match(source, /const offsetX = Math\.cos\(angle\) \* halfWidth/);
  const arena = fs.readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /fence\.x1, fence\.y1, fence\.x2, fence\.y2/);
  assert.doesNotMatch(arena, /Math\.cos\(fence\.sprite\.rotation\)/);
});

test('the integrated Round 30 stress scenario is guarded behind DEV-only F5 input', () => {
  const source = fs.readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(source, /import\.meta\.env\.DEV && Phaser\.Input\.Keyboard\.JustDown\(this\.keys\.f5\)/);
  assert.match(source, /private activateDevPerformanceStressScenario/);
  assert.match(source, /new RoundManager\(this\.roundManager\.seedBase, this\.roundManager\.mode, 30\)/);
  assert.match(source, /for \(const xOffset of \[55, 110\]\)/);
  assert.match(source, /for \(let index = 0; index < 240; index \+= 1\)/);
  assert.match(source, /this\.gasHazard\?\.forcePhaseForDevelopment\(now\)/);
  assert.match(source, /this\.bombletHazard\?\.forceStrikeForDevelopment\(now\)/);
  assert.match(source, /this\.gasHazard\?\.igniteFirstCloudForDevelopment/);
});

test('hazard presentation pools are prewarmed and idle graphics redraws are gated', () => {
  const bomblets = fs.readFileSync(new URL('../src/game/systems/BombletHazardSystem.ts', import.meta.url), 'utf8');
  const gas = fs.readFileSync(new URL('../src/game/systems/GasHazardSystem.ts', import.meta.url), 'utf8');
  const explosions = fs.readFileSync(new URL('../src/game/vfx/MineExplosionVfx.ts', import.meta.url), 'utf8');
  assert.match(bomblets, /targetPool = Array\.from/);
  assert.match(bomblets, /target\.marker\.setVisible\(false\)\.setActive\(false\)/);
  assert.doesNotMatch(bomblets, /this\.targets = points\.map/);
  assert.match(gas, /canisterPool = Array\.from/);
  assert.match(gas, /if \(!hasActiveState\) \{[\s\S]*?impactPresentationVisible/);
  assert.match(gas, /if \(!hasActiveState\) \{[\s\S]*?ignitionPresentationVisible/);
  assert.match(explosions, /if \(this\.activeStateCount === 0\)/);
  assert.match(explosions, /return this\.activeStateCount/);
});
