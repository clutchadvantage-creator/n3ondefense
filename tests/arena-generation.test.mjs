import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_ARCHETYPES, ARENA_GENERATION_CONFIG } from '../src/game/config/arenaGeneration.ts';
import { compareArenaFingerprints, createArenaFingerprint } from '../src/game/systems/ArenaFingerprint.ts';
import { generateArenaTopology } from '../src/game/systems/ArenaTopology.ts';
import { validateTopologyDraft } from '../src/game/systems/ArenaTopologyValidator.ts';
import { getConcurrentSpawnPressure, getSpawnProfile } from '../src/game/config/balance/index.ts';

test('every arena archetype is deterministic and exposes a distinct macro topology', () => {
  const silhouettes = new Set();
  for (const archetype of ARENA_ARCHETYPES) {
    const first = generateArenaTopology(archetype, 918273);
    const second = generateArenaTopology(archetype, 918273);
    assert.deepEqual(first, second);
    assert.equal(first.archetype, archetype);
    assert.ok(first.walls.length >= 4);
    assert.ok(first.objectiveCandidates.length >= 5);
    silhouettes.add(`${first.walls.length}:${first.majorStructureCount}:${first.chokePointCount}:${first.connectedRegionCount}`);
  }
  assert.ok(silhouettes.size >= 8);
});

test('representative topology objectives and enemy entrances remain connected', () => {
  for (const archetype of ARENA_ARCHETYPES) {
    let valid = false;
    for (let attempt = 1; attempt <= ARENA_GENERATION_CONFIG.maximumAttemptsPerArchetype; attempt += 1) {
      const draft = generateArenaTopology(archetype, 44000 + attempt * 7919);
      if (validateTopologyDraft(draft, draft.objectiveCandidates.slice(0, 5)).valid) { valid = true; break; }
    }
    assert.equal(valid, true, `${archetype} did not produce a valid topology`);
  }
});

test('fingerprints compare resulting occupancy rather than seeds', () => {
  const make = (archetype, seed) => {
    const draft = generateArenaTopology(archetype, seed);
    return createArenaFingerprint({ archetype, bounds: draft.bounds, blockers: draft.walls, bombSites: draft.objectiveCandidates.slice(0, 4), enemySpawns: draft.enemySpawns, attempt: 1, majorStructureCount: draft.majorStructureCount, chokePointCount: draft.chokePointCount, connectedRegionCount: draft.connectedRegionCount, orientationBias: draft.orientationBias, validation: [] });
  };
  const maze = make('maze', 1234);
  const sameMaze = make('maze', 1234);
  const open = make('open-field', 1234);
  assert.ok(compareArenaFingerprints(maze, sameMaze) > 0.999999);
  assert.ok(compareArenaFingerprints(maze, open) < ARENA_GENERATION_CONFIG.similarityThreshold);
});

test('concurrent bomb pressure scales modestly and monotonically', () => {
  const profile = getSpawnProfile(4, 0);
  const one = getConcurrentSpawnPressure(profile, 1);
  const two = getConcurrentSpawnPressure(profile, 2);
  const four = getConcurrentSpawnPressure(profile, 4);
  assert.equal(one.cadenceMultiplier, 1);
  assert.ok(two.cadenceMultiplier < one.cadenceMultiplier);
  assert.ok(four.cadenceMultiplier < two.cadenceMultiplier);
  assert.ok(four.cadenceMultiplier >= 0.7);
  assert.ok(two.activeCountCap > one.activeCountCap);
  assert.ok(two.activeWeightCap > one.activeWeightCap);
});
