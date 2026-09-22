import test from 'node:test';
import assert from 'node:assert/strict';
import { clearOfBombsites, selectSafeEnemySpawn, separateEnemyEntrances, ENEMY_SPAWN_SAFETY } from '../src/game/arena/EnemySpawnSafety.ts';
import { createSafeArenaFallbacks } from '../src/game/systems/ArenaFallbacks.ts';
import { ArenaValidator } from '../src/game/systems/ArenaValidator.ts';

test('spawn exclusion covers every site state and accepts the exact safety boundary', () => {
  for (const state of ['Available', 'Armed', 'Defusing', 'Destroyed']) {
    const sites = [{ x: 400, y: 400, state }];
    for (const distance of [0, 80, 105, 200, 319.99]) assert.equal(clearOfBombsites({ x: 400 + distance, y: 400 }, sites), false);
    assert.equal(clearOfBombsites({ x: 720, y: 400 }, sites), true);
  }
  assert.equal(clearOfBombsites({ x: NaN, y: 0 }, []), false);
  assert.equal(ENEMY_SPAWN_SAFETY.minimumSiteDistance, ENEMY_SPAWN_SAFETY.siteRadius + ENEMY_SPAWN_SAFETY.approachGap + ENEMY_SPAWN_SAFETY.enemyRadius);
});

test('unsafe explicit, random, drone and fallback requests cannot bypass exclusion', () => {
  const sites = [{ x: 500, y: 500 }, { x: 1100, y: 500 }];
  const entrances = [{ x: 501, y: 500 }, { x: 800, y: 500 }, { x: 1600, y: 500 }];
  for (let i = 0; i < 100; i++) {
    assert.deepEqual(selectSafeEnemySpawn(sites[0], entrances, sites, () => true, i), entrances[2]);
    assert.equal(selectSafeEnemySpawn(null, entrances, sites, () => false, i), null);
  }
  assert.equal(selectSafeEnemySpawn(sites[0], entrances.slice(0, 2), sites, () => true), null);
  assert.equal(selectSafeEnemySpawn(undefined, [], sites, () => true), null);
});

test('repair preserves safe entrances and count without moving objectives or walls', () => {
  const entrances = [{ x: 72, y: 72 }, { x: 1928, y: 72 }], sites = [{ x: 100, y: 100 }];
  const before = JSON.stringify({ entrances, sites });
  const result = separateEnemyEntrances(entrances, sites, { x: 0, y: 0, w: 2000, h: 1200 }, []);
  assert.equal(result.length, 2);
  assert.deepEqual(result[1], entrances[1]);
  assert.ok(result.every(p => clearOfBombsites(p, sites)));
  assert.equal(JSON.stringify({ entrances, sites }), before);
  assert.equal(separateEnemyEntrances([sites[0]], sites, { x: 0, y: 0, w: 200, h: 200 }, []), null);
});

test('100 fallback seeds preserve four safe entrances and full traversal validation', () => {
  for (let seed = 1; seed <= 100; seed++) for (const draft of createSafeArenaFallbacks(seed, 68, 5)) {
    assert.equal(draft.enemySpawns.length, 4, `${seed}/${draft.id}`);
    assert.ok(draft.enemySpawns.every(p => clearOfBombsites(p, draft.bombSites)));
    // Full path/group-clearance checks on representative seeds; safety on all 500 layouts.
    if (seed <= 10) {
      const result = ArenaValidator.validateDetailed({ ...draft, obstacles: [], generation: {} }, 2400, 1600);
      assert.equal(result.valid, true, `${seed}/${draft.id}: ${result.failures}`);
    }
  }
});

test('both validator entry points reject an otherwise reachable spawn beside a site', () => {
  const layout = { walls: [], obstacles: [], playerSpawn: { x: 100, y: 500 }, enemySpawns: [{ x: 505, y: 500 }], bombSites: [{ x: 500, y: 500 }] };
  assert.equal(ArenaValidator.validate(layout, 1200, 1000), false);
  assert.ok(ArenaValidator.validateDetailed({ ...layout, generation: {} }, 1200, 1000).failures.includes('enemy-spawn-too-close-to-site'));
});

test('seed 71271 repairs using the same rounded positions published by generation', () => {
  for (const draft of createSafeArenaFallbacks(71271, 30, 5)) {
    const round = p => ({ x: Math.round(p.x), y: Math.round(p.y) });
    assert.equal(draft.enemySpawns.length, 4);
    const layout = { ...draft, bombSites: draft.bombSites.map(round), enemySpawns: draft.enemySpawns.map(round), playerSpawn: round(draft.playerSpawn), obstacles: [], generation: {} };
    assert.equal(ArenaValidator.validateDetailed(layout, 2400, 1600).valid, true);
  }
});
