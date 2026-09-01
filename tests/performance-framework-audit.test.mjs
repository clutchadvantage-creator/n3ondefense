import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ReusableObjectPool } from '../src/game/performance/ReusableObjectPool.ts';
import { arenaCombatWarmupPlan } from '../src/game/performance/ArenaRuntimePreparation.ts';
import { explosionCameraImpulse } from '../src/game/vfx/ExplosionCameraImpulse.ts';
import {
  ARENA_SMASHABLE_LOOT_TABLE,
  resolveArenaSmashableLoot
} from '../src/game/arena/ArenaSmashableDefinitions.ts';
import { createArenaSmashablePlacements } from '../src/game/arena/ArenaSmashablePlacement.ts';

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
  assert.equal(ARENA_SMASHABLE_LOOT_TABLE.some((entry) => ['plasmaChip', 'fluxCore', 'mod'].includes(entry.type)), false);
  for (let index = 0; index < 100; index += 1) assert.ok(allowed.has(resolveArenaSmashableLoot(index / 100)));
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
  assert.ok(first.every((prop) => prop.x > 80 && prop.x < 1740 && prop.y > 80 && prop.y < 1180));
  const system = source('../src/game/arena/ArenaSmashableSystem.ts');
  assert.match(system, /physicsBodies: 0/);
  assert.doesNotMatch(system, /physics\.add|add\.collider|add\.overlap/);
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
