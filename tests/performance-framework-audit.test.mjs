import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ReusableObjectPool } from '../src/game/performance/ReusableObjectPool.ts';
import { arenaCombatWarmupPlan } from '../src/game/performance/ArenaRuntimePreparation.ts';
import { explosionCameraImpulse } from '../src/game/vfx/ExplosionCameraImpulse.ts';
import {
  ARENA_SMASHABLE_LOOT_TABLE,
  HEIST_SMASHABLE_LOOT_TABLE,
  resolveArenaSmashableLoot,
  resolveSmashableLootDrops
} from '../src/game/arena/ArenaSmashableDefinitions.ts';
import {
  ARENA_SMASHABLE_MAXIMUM,
  createArenaSmashablePlacements,
  isArenaSmashablePlacementSafe
} from '../src/game/arena/ArenaSmashablePlacement.ts';
import { smashableWorldFootprint, rectanglesOverlap } from '../src/game/arena/SmashablePlacementGeometry.ts';
import { generateHeistFacilityLayout } from '../src/game/anomalies/heist/HeistFacilityLayout.ts';
import {
  createHeistSmashablePlacements,
  HEIST_SMASHABLE_MAXIMUM,
  HEIST_SMASHABLE_MINIMUM,
  isHeistSmashablePlacementSafe
} from '../src/game/anomalies/heist/HeistSmashablePlacement.ts';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('combat pool prewarm is inactive, idempotent, and removes cold burst allocation churn', () => {
  let retired = 0;
  const pool = new ReusableObjectPool(
    (state) => ({ value: state.value, active: true }),
    (item, state) => { item.value = state.value; item.active = true; },
    (item) => { item.active = false; retired += 1; }
  );
  assert.equal(pool.prewarm(24, (index) => ({ value: index })), 24);
  assert.deepEqual(pool.stats(), { created: 24, reused: 0, active: 0, available: 24 });
  assert.equal(pool.prewarm(24, { value: 0 }), 0);
  const burst = Array.from({ length: 24 }, (_, value) => pool.obtain({ value }));
  assert.equal(pool.createdCount, 24);
  assert.equal(pool.activeCount, 24);
  for (const item of burst) pool.release(item);
  assert.equal(retired, 48);
});

test('late Overdrive and Supreme warmup plans reserve more without imposing gameplay caps', () => {
  const normal = arenaCombatWarmupPlan('normal', 1, true);
  const overdrive = arenaCombatWarmupPlan('overdrive-draco', 30, true);
  const supreme = arenaCombatWarmupPlan('supreme-leo', 51, true);
  assert.ok(overdrive.projectiles > normal.projectiles);
  assert.ok(supreme.projectiles > overdrive.projectiles);
  assert.ok(supreme.fxCircles > normal.fxCircles);
  const implementation = source('../src/game/performance/ArenaRuntimePreparation.ts');
  assert.doesNotMatch(implementation, /maximumProjectiles|projectileCap|splitCap/);
});

test('grenade rounds never request camera shake while dramatic explosives retain shared impulses', () => {
  assert.equal(explosionCameraImpulse('grenade-round'), null);
  assert.equal(explosionCameraImpulse('none'), null);
  assert.ok(explosionCameraImpulse('mine').intensity > 0);
  assert.ok(explosionCameraImpulse('bombsite').intensity > explosionCameraImpulse('mine').intensity);
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  assert.match(heist, /this\.mineExplosionVfx\.emit\([\s\S]*?'grenade-round'\)/);
});

test('Arena smashable loot is restrained and excludes premium/progression rewards', () => {
  const allowed = new Set(['credits', 'health', 'energy', 'coreToken', 'damageBoost', 'speedBoost',
    'rapidFire', 'ricochet', 'grenadeRounds', 'scattershot']);
  assert.ok(ARENA_SMASHABLE_LOOT_TABLE.every((entry) => allowed.has(entry.type)));
  assert.ok(HEIST_SMASHABLE_LOOT_TABLE.every((entry) => allowed.has(entry.type)));
  assert.equal(ARENA_SMASHABLE_LOOT_TABLE.some((entry) => ['plasmaChip', 'fluxCore', 'mod'].includes(entry.type)), false);
  assert.equal(HEIST_SMASHABLE_LOOT_TABLE.some((entry) => ['plasmaChip', 'fluxCore', 'mod'].includes(entry.type)), false);
  for (let index = 0; index < 100; index += 1) assert.ok(allowed.has(resolveArenaSmashableLoot(index / 100)));
  const arenaResults = new Set();
  const heistResults = new Set();
  let combinations = 0;
  for (let index = 0; index < 1000; index += 1) {
    const arena = resolveSmashableLootDrops('arena', index / 1000);
    const heist = resolveSmashableLootDrops('heist', index / 1000);
    arena.forEach((type) => arenaResults.add(type));
    heist.forEach((type) => heistResults.add(type));
    if (heist.length > 1) combinations += 1;
  }
  assert.ok(arenaResults.size >= 8);
  assert.ok(heistResults.size >= 8);
  assert.ok(combinations > 0);
});

test('Arena smashable placement is deterministic, bounded, and does not join navigation blockers', () => {
  const layout = {
    seed: 7319,
    template: 'fortress',
    theme: { id: 'test', primary: 0x43edfa, secondary: 0xff4dcb, accent: 0xffffff },
    walls: [
      { x: 180, y: 160, w: 720, h: 48 },
      { x: 930, y: 260, w: 48, h: 620 },
      { x: 280, y: 920, w: 760, h: 48 }
    ],
    obstacles: [],
    smashables: [],
    playerSpawn: { x: 1250, y: 700 },
    enemySpawns: [{ x: 1450, y: 260 }],
    bombSites: [{ x: 1400, y: 1040 }],
    decorativeNeon: [],
    generation: { bounds: { x: 80, y: 80, w: 1660, h: 1100 } }
  };
  const first = createArenaSmashablePlacements(layout, 24);
  const second = createArenaSmashablePlacements(layout, 24);
  assert.deepEqual(first, second);
  assert.ok(first.length > 0);
  assert.ok(first.length <= ARENA_SMASHABLE_MAXIMUM);
  assert.ok(first.every((prop) => prop.x > 80 && prop.x < 1740 && prop.y > 80 && prop.y < 1180));
  assert.ok(first.every((prop, index) => isArenaSmashablePlacementSafe(layout, prop, first.slice(0, index))));
  assert.ok(first.every((prop) => layout.walls.every((wall) => !rectanglesOverlap(smashableWorldFootprint(prop), wall, 10))));
  const bombsiteOverlap = { ...first[0], x: layout.bombSites[0].x, y: layout.bombSites[0].y };
  assert.equal(isArenaSmashablePlacementSafe(layout, bombsiteOverlap), false);
  const system = source('../src/game/arena/ArenaSmashableSystem.ts');
  assert.match(system, /physicsBodies: 0/);
  assert.doesNotMatch(system, /physics\.add|add\.collider|add\.overlap/);
  assert.match(system, /damageStage = 3/);
  assert.match(system, /drawDestroyedRemnant/);
  assert.match(system, /destructionFamily === 'cabinet'/);
  assert.match(system, /destructionFamily === 'electronics'/);
  assert.match(system, /destructionFamily === 'power'/);
  assert.match(system, /MAX_BURSTS = 8/);
  assert.doesNotMatch(system, /new Phaser\.Geom\.Point/);
  assert.doesNotMatch(system, /time\.delayedCall|physics\.add/);
});

test('HEIST uses shared bounded smashables with full-footprint facility placement', () => {
  for (const seed of [7, 83_117, 194_911, 918_273]) {
    const layout = generateHeistFacilityLayout(seed);
    const first = createHeistSmashablePlacements(layout, 30);
    const second = createHeistSmashablePlacements(layout, 30);
    assert.deepEqual(first, second);
    assert.ok(first.length >= HEIST_SMASHABLE_MINIMUM);
    assert.ok(first.length <= HEIST_SMASHABLE_MAXIMUM);
    assert.ok(first.every((prop, index) => isHeistSmashablePlacementSafe(layout, prop, first.slice(0, index))));
    assert.ok(first.every((prop) => layout.wallRects.every((wall) =>
      !rectanglesOverlap(smashableWorldFootprint(prop), wall, 10))));
  }
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  assert.match(heist, /new ArenaSmashableSystem\([\s\S]*?'heist'/);
  assert.match(heist, /environmentSmashables\?\.damagePoint/);
  assert.match(heist, /environmentSmashables\?\.damageArea/);
  assert.match(heist, /environmentSmashables\?\.discardReferences/);
});

test('HEIST presentation remains bounded while guidance is sparse and utility lighting is distributed', () => {
  const facility = source('../src/game/anomalies/heist/HeistFacility.ts');
  const traps = source('../src/game/anomalies/heist/HeistTrapSystem.ts');
  assert.match(facility, /markers\.slice\(0, 28\)/);
  assert.match(facility, /utilityLights\.length/);
  assert.match(facility, /lastAmbientDraw < 90/);
  assert.match(traps, /this\.nextUpdateAt = now \+ 50/);
  assert.match(traps, /physicsBodies: 0/);
});
