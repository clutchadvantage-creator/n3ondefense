import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_ARCHETYPES, ARENA_GENERATION_CONFIG } from '../src/game/config/arenaGeneration.ts';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../src/game/config/constants.ts';
import { ArenaHistory, compareArenaFingerprints, createArenaFingerprint } from '../src/game/systems/ArenaFingerprint.ts';
import { createSafeArenaFallbacks } from '../src/game/systems/ArenaFallbacks.ts';
import { generateArenaTopology } from '../src/game/systems/ArenaTopology.ts';
import { validateTopologyDraft } from '../src/game/systems/ArenaTopologyValidator.ts';
import { getConcurrentSpawnPressure, getSpawnProfile } from '../src/game/config/balance/index.ts';
import { repairNarrowPassages, createsNarrowPassage } from '../src/game/systems/ArenaTraversal.ts';
import { ArenaValidator } from '../src/game/systems/ArenaValidator.ts';

const makeFingerprint = (archetype, seed, wallOffset = 0) => {
  const draft = generateArenaTopology(archetype, seed);
  const blockers = draft.walls.map((wall, index) => index < 4 || wallOffset === 0
    ? wall
    : { ...wall, x: wall.x + wallOffset });
  return createArenaFingerprint({
    archetype,
    bounds: draft.bounds,
    blockers,
    bombSites: draft.objectiveCandidates.slice(0, 5),
    enemySpawns: draft.enemySpawns,
    attempt: 1,
    majorStructureCount: draft.majorStructureCount,
    chokePointCount: draft.chokePointCount,
    connectedRegionCount: draft.connectedRegionCount,
    orientationBias: draft.orientationBias,
    validation: []
  });
};

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

test('generated interior walls provide a wider readable face without changing boundary walls', () => {
  for (const archetype of ARENA_ARCHETYPES) {
    const draft = generateArenaTopology(archetype, 811_337);
    const interiorWalls = draft.walls.slice(4);
    assert.ok(interiorWalls.length > 0);
    assert.ok(interiorWalls.every((wall) => Math.min(wall.w, wall.h) >= ARENA_GENERATION_CONFIG.minimumInteriorWallThickness - 0.001), archetype);
  }
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
  const maze = makeFingerprint('maze', 1234);
  const sameMaze = makeFingerprint('maze', 1234);
  const open = makeFingerprint('open-field', 1234);
  assert.ok(compareArenaFingerprints(maze, sameMaze) > 0.999999);
  assert.ok(compareArenaFingerprints(maze, open) < ARENA_GENERATION_CONFIG.similarityThreshold);
});

test('recent arena history rejects exact and near-identical layouts', () => {
  const history = new ArenaHistory();
  const original = makeFingerprint('maze', 1234);
  history.add(original);

  const exact = history.assess(makeFingerprint('maze', 1234));
  assert.equal(exact.reject, true);
  assert.equal(exact.exactPrevious, true);

  const shifted = makeFingerprint('maze', 1234, 40);
  assert.notEqual(shifted.hash, original.hash);
  assert.ok(compareArenaFingerprints(original, shifted) > 0.9);
  assert.equal(history.assess(shifted).reject, true);
});

test('same archetype candidates remain eligible when their structures are genuinely different', () => {
  const history = new ArenaHistory();
  const first = makeFingerprint('split', 1);
  const different = makeFingerprint('split', 261);
  history.add(first);
  assert.ok(compareArenaFingerprints(first, different) < 0.75);
  assert.equal(history.assess(different).reject, false);
});

test('an extreme-open arena forces the next choice toward a structured archetype', () => {
  const history = new ArenaHistory();
  history.add(makeFingerprint('open-field', 1));
  const repeat = history.assess(makeFingerprint('open-field', 2));
  assert.equal(repeat.reject, true);
  assert.equal(repeat.openRepeat, true);

  const ordered = history.orderArchetypes('open-field', ['open-field', 'maze', 'chambers'], 9876);
  assert.notEqual(ordered[0], 'open-field');
});

test('older layouts remain protected and history stays strictly bounded', () => {
  const history = new ArenaHistory();
  const original = makeFingerprint('maze', 1234);
  history.add(original);
  const fillers = ['open-field', 'ring', 'chambers', 'canyon', 'islands', 'crossroads'];
  fillers.forEach((archetype, index) => history.add(makeFingerprint(archetype, 5000 + index * 97)));
  assert.equal(history.recent().length, ARENA_GENERATION_CONFIG.recentFingerprintCount);

  const recurrence = history.assess(makeFingerprint('maze', 1234));
  assert.equal(recurrence.reject, true);
  assert.equal(recurrence.exact, true);
  assert.equal(recurrence.closestHistoryAge, ARENA_GENERATION_CONFIG.recentFingerprintCount - 1);

  const evolvedRecurrence = history.assess(makeFingerprint('maze', 1234, 140));
  assert.ok(evolvedRecurrence.score > 0.9);
  assert.equal(evolvedRecurrence.closestHistoryAge, ARENA_GENERATION_CONFIG.recentFingerprintCount - 1);
  assert.equal(evolvedRecurrence.reject, false);

  history.add(makeFingerprint('perimeter', 9001));
  assert.equal(history.recent().length, ARENA_GENERATION_CONFIG.recentFingerprintCount);
  assert.equal(history.recent().includes(original), false);
});

test('emergency fallbacks are diverse, fully traversable, and preserve requested site count', () => {
  const fallbacks = createSafeArenaFallbacks(4444, 30, 5);
  const hashes = new Set();
  const archetypes = new Set();
  for (const fallback of fallbacks) {
    const draft = {
      archetype: fallback.archetype,
      bounds: fallback.bounds,
      walls: fallback.walls,
      objectiveCandidates: fallback.bombSites,
      playerCandidates: [fallback.playerSpawn],
      enemySpawns: fallback.enemySpawns,
      majorStructureCount: fallback.majorStructureCount,
      chokePointCount: fallback.chokePointCount,
      connectedRegionCount: fallback.connectedRegionCount,
      orientationBias: fallback.orientationBias
    };
    assert.equal(validateTopologyDraft(draft, fallback.bombSites).valid, true, fallback.id);
    assert.equal(fallback.bombSites.length, 5);
    assert.equal(ArenaValidator.validateDetailed({
      seed: 4444,
      template: fallback.archetype,
      theme: {},
      walls: fallback.walls,
      obstacles: [],
      playerSpawn: fallback.playerSpawn,
      enemySpawns: fallback.enemySpawns,
      bombSites: fallback.bombSites,
      decorativeNeon: [],
      generation: {}
    }, WORLD_WIDTH, WORLD_HEIGHT).valid, true, `${fallback.id} failed full traversal validation`);
    const fingerprint = createArenaFingerprint({
      archetype: fallback.archetype,
      bounds: fallback.bounds,
      blockers: fallback.walls,
      bombSites: fallback.bombSites,
      enemySpawns: fallback.enemySpawns,
      attempt: 1,
      majorStructureCount: fallback.majorStructureCount,
      chokePointCount: fallback.chokePointCount,
      connectedRegionCount: fallback.connectedRegionCount,
      orientationBias: fallback.orientationBias,
      validation: []
    });
    hashes.add(fingerprint.hash);
    archetypes.add(fallback.archetype);
  }
  assert.equal(fallbacks.length, ARENA_GENERATION_CONFIG.fallbackVariantCount);
  assert.ok(hashes.size >= 4);
  assert.ok(archetypes.size >= 4);
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

test('important passage width derives from crowd collision requirements', () => {
  const expectedFloor = ARENA_GENERATION_CONFIG.largestEnemyBodyDiameter
    * ARENA_GENERATION_CONFIG.groupMovementLanes
    + ARENA_GENERATION_CONFIG.enemyNavigationPadding * 2;
  assert.ok(ARENA_GENERATION_CONFIG.minimumCorridorWidth > expectedFloor);
  assert.ok(ARENA_GENERATION_CONFIG.minimumCorridorWidth >= 136);
});

test('narrow segmented doorways are widened without removing their structure', () => {
  const walls = [
    { x: 100, y: 200, w: 180, h: 30 },
    { x: 350, y: 200, w: 180, h: 30 }
  ];
  const result = repairNarrowPassages(walls, 140, 30);
  const gap = result.walls[1].x - (result.walls[0].x + result.walls[0].w);
  assert.equal(result.widenedPassages, 1);
  assert.ok(gap >= 140);
  assert.equal(result.walls.length, walls.length);
});

test('secondary obstacles cannot create accidental single-file lanes', () => {
  const candidate = { x: 250, y: 100, w: 40, h: 90 };
  const blocker = { x: 100, y: 100, w: 40, h: 90 };
  assert.equal(createsNarrowPassage(candidate, [blocker], 140), true);
  assert.equal(createsNarrowPassage({ ...candidate, x: 300 }, [blocker], 140), false);
});

test('binary reachability no longer certifies a narrow critical route', () => {
  const walls = [
    { x: 380, y: 0, w: 30, h: 240 },
    { x: 380, y: 360, w: 30, h: 240 }
  ];
  const layout = {
    seed: 1,
    template: 'split',
    theme: {},
    walls,
    obstacles: [],
    playerSpawn: { x: 180, y: 300 },
    enemySpawns: [{ x: 140, y: 300 }],
    bombSites: [{ x: 620, y: 300 }],
    decorativeNeon: [],
    generation: {}
  };
  const validation = ArenaValidator.validateDetailed(layout, 800, 600);
  assert.ok(validation.checks.includes('player-reaches-all-objectives'));
  assert.ok(validation.failures.includes('important-player-route-too-narrow'));
  assert.ok(validation.failures.includes('important-enemy-route-too-narrow'));
});
