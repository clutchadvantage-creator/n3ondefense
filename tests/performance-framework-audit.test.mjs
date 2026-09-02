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
  createArenaFireTrapPlacements,
  resolveArenaFloorFirePlacement
} from '../src/game/arena/ArenaFireTrapPlacement.ts';
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

test('every smashable yields one restrained bonus and progression currencies remain rare', () => {
  const allowed = new Set(['credits', 'health', 'energy', 'coreToken', 'damageBoost', 'speedBoost',
    'rapidFire', 'ricochet', 'grenadeRounds', 'scattershot', 'plasmaChip', 'fluxCore']);
  assert.ok(ARENA_SMASHABLE_LOOT_TABLE.every((entry) => allowed.has(entry.type)));
  assert.ok(HEIST_SMASHABLE_LOOT_TABLE.every((entry) => allowed.has(entry.type)));
  assert.equal(ARENA_SMASHABLE_LOOT_TABLE.some((entry) => entry.type === 'mod'), false);
  assert.equal(HEIST_SMASHABLE_LOOT_TABLE.some((entry) => entry.type === 'mod'), false);
  const arenaCreditWeight = ARENA_SMASHABLE_LOOT_TABLE.find((entry) => entry.type === 'credits').weight;
  const arenaPremiumWeight = ARENA_SMASHABLE_LOOT_TABLE
    .filter((entry) => ['plasmaChip', 'fluxCore'].includes(entry.type))
    .reduce((sum, entry) => sum + entry.weight, 0);
  assert.ok(arenaCreditWeight > arenaPremiumWeight * 30);
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
  const system = source('../src/game/arena/ArenaSmashableSystem.ts');
  assert.doesNotMatch(system, /smashableLootChance/);
  assert.match(system, /this\.onDestroyed\?\.\(prop\.placement\.x, prop\.placement\.y\)/);
  assert.match(system, /BURST_LIFETIME_MS = 690/);
});

test('Arena fire placement is deterministic, bombsite-safe, and shares one bounded runtime with HEIST', () => {
  const layout = {
    seed: 99017,
    template: 'chambers',
    theme: { id: 'test', primary: 0x43edfa, secondary: 0xff4dcb, accent: 0xffffff },
    walls: [
      { x: 400, y: 340, w: 520, h: 50 },
      { x: 1220, y: 460, w: 50, h: 480 },
      { x: 520, y: 1080, w: 600, h: 50 }
    ],
    obstacles: [], smashables: [],
    playerSpawn: { x: 300, y: 760 },
    enemySpawns: [{ x: 2050, y: 260 }],
    bombSites: [{ x: 1840, y: 1180 }], decorativeNeon: [],
    generation: { bounds: { x: 80, y: 80, w: 2240, h: 1440 } }
  };
  assert.deepEqual(createArenaFireTrapPlacements(layout, 30), createArenaFireTrapPlacements(layout, 30));
  const floor = resolveArenaFloorFirePlacement(layout, 1040, 780, 3);
  assert.ok(floor);
  assert.ok((floor.x - layout.bombSites[0].x) ** 2 + (floor.y - layout.bombSites[0].y) ** 2 >= 150 ** 2);
  const shared = source('../src/game/hazards/SharedFireTrapSystem.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const heist = source('../src/game/anomalies/heist/HeistTrapSystem.ts');
  assert.match(shared, /dynamicGraphicsBatches: 2/);
  assert.match(shared, /physicsBodies: 0/);
  assert.match(shared, /independentTimers: 0/);
  assert.match(shared, /this\.audio\.playSfx\('fireTrap'\)/);
  assert.match(arena, /new SharedFireTrapSystem/);
  assert.match(heist, /new SharedFireTrapSystem/);
  assert.doesNotMatch(heist, /createFireNozzle/);
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
  assert.match(facility, /setAlertLighting\(active: boolean\)/);
  assert.match(facility, /alertLightingActive \? 0 : zoneVisibility\.targetAlpha/);
  assert.match(facility, /brownoutCycle/);
  assert.match(traps, /this\.nextUpdateAt = now \+ 50/);
  assert.match(traps, /physicsBodies: 0/);
});
