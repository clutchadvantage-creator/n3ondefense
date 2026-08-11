import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ReusableObjectPool } from '../src/game/performance/ReusableObjectPool.ts';
import { UniformSpatialGrid } from '../src/game/performance/UniformSpatialGrid.ts';
import { FramePerformanceMonitor } from '../src/game/performance/FramePerformanceMonitor.ts';
import { shouldReplaceTurretTarget } from '../src/game/performance/Targeting.ts';

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
  assert.match(source, /body\.enable = false/);
  assert.match(source, /projectile\.crossedFences\?\.clear\(\)/);
  assert.match(source, /projectile\.telemetryOwner = undefined/);
  assert.match(source, /this\.projectilePool\?\.destroy/);
  assert.match(source, /this\.fxCirclePool\?\.destroy/);
  assert.match(source, /this\.scale\.off\('resize'/);
  assert.match(source, /window\.removeEventListener\('keydown'/);
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
  assert.match(source, /\}, 8000\);/);
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
});
