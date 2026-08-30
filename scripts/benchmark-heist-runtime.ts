import { performance } from 'node:perf_hooks';
import { generateHeistFacilityLayout } from '../src/game/anomalies/heist/HeistFacilityLayout.ts';
import { HeistWallPointIndex, mergeAxisAlignedHeistWalls } from '../src/game/anomalies/heist/HeistWallRuntime.ts';
import { HeistZoneVisibility } from '../src/game/anomalies/heist/HeistZoneVisibility.ts';

const seeds = [17, 9_973, 81_337, 194_911, 712_009];
const layouts = seeds.map(generateHeistFacilityLayout);
const runtimes = layouts.map((layout) => {
  const walls = mergeAxisAlignedHeistWalls(layout.wallRects);
  return { walls, index: new HeistWallPointIndex(walls) };
});

const queryCount = 180_000;
const queryX = new Float64Array(queryCount);
const queryY = new Float64Array(queryCount);
let state = 0x51f15e;
for (let index = 0; index < queryCount; index += 1) {
  state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
  queryX[index] = state % 5201;
  state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
  queryY[index] = state % 3321;
}

let rawHits = 0;
const rawStart = performance.now();
for (let index = 0; index < queryCount; index += 1) {
  const walls = layouts[index % layouts.length].wallRects;
  const x = queryX[index];
  const y = queryY[index];
  for (let wallIndex = 0; wallIndex < walls.length; wallIndex += 1) {
    const wall = walls[wallIndex];
    if (x >= wall.x && x <= wall.x + wall.w && y >= wall.y && y <= wall.y + wall.h) {
      rawHits += 1;
      break;
    }
  }
}
const rawMs = performance.now() - rawStart;

let indexedHits = 0;
const indexedStart = performance.now();
for (let index = 0; index < queryCount; index += 1) {
  if (runtimes[index % runtimes.length].index.contains(queryX[index], queryY[index])) indexedHits += 1;
}
const indexedMs = performance.now() - indexedStart;
if (rawHits !== indexedHits) throw new Error(`HEIST wall benchmark changed collision results (${rawHits} vs ${indexedHits}).`);

const sourceWalls = layouts.reduce((total, layout) => total + layout.wallRects.length, 0);
const runtimeWalls = runtimes.reduce((total, runtime) => total + runtime.walls.length, 0);
const averageSourceWalls = sourceWalls / layouts.length;
const averageRuntimeWalls = runtimeWalls / layouts.length;
const averageMaximumBucket = runtimes.reduce(
  (total, runtime) => total + runtime.index.diagnostics.maximumCandidatesPerBucket,
  0
) / runtimes.length;
const modeledEnemies = 24;
const averageNodes = layouts.reduce((total, layout) => total + layout.nodes.length, 0) / layouts.length;
const legacyNearestNodeComparisons = modeledEnemies * averageNodes * 2;
const cachedTargetNearestNodeComparisons = (modeledEnemies + 1) * averageNodes;

const visibilityRuntimes = layouts.map((layout) => new HeistZoneVisibility(layout));
let visibilityTransitions = 0;
let visibilityChecksum = 0;
const visibilityStart = performance.now();
for (let index = 0; index < queryCount; index += 1) {
  const runtime = visibilityRuntimes[index % visibilityRuntimes.length];
  if (runtime.revealAt(queryX[index], queryY[index], index % 17 > 3)) visibilityTransitions += 1;
  visibilityChecksum += runtime.targetAlpha[index % runtime.targetAlpha.length];
}
const visibilityMs = performance.now() - visibilityStart;

console.log('N3ONDefense HEIST runtime benchmark');
console.log(`Layouts: ${layouts.length}; collision queries: ${queryCount.toLocaleString()}`);
console.log(`Static wall bodies: ${averageSourceWalls.toFixed(1)} -> ${averageRuntimeWalls.toFixed(1)} average`);
console.log(`Body reduction: ${((1 - averageRuntimeWalls / averageSourceWalls) * 100).toFixed(1)}% (exact occupied union)`);
console.log(`Maximum indexed candidates per cell: ${averageMaximumBucket.toFixed(1)} average`);
console.log(`Linear wall queries: ${rawMs.toFixed(2)}ms`);
console.log(`Spatially indexed queries: ${indexedMs.toFixed(2)}ms`);
console.log(`Modeled point-collision speedup: ${(rawMs / indexedMs).toFixed(2)}x`);
console.log(`Collision result parity: ${rawHits.toLocaleString()} hits`);
console.log(`24-enemy nearest-node comparisons/frame: ${legacyNearestNodeComparisons.toFixed(0)} -> ${cachedTargetNearestNodeComparisons.toFixed(0)}`);
console.log(`Navigation comparison reduction: ${((1 - cachedTargetNearestNodeComparisons / legacyNearestNodeComparisons) * 100).toFixed(1)}%`);
console.log('Facility rendering: world-sized retained Graphics replaced by 1 cached floor tile + cached wall sprites.');
console.log(`Graph-zone visibility: ${visibilityTransitions.toLocaleString()} transitions in ${visibilityMs.toFixed(2)}ms`);
console.log(`Visibility throughput: ${(queryCount / Math.max(0.001, visibilityMs) * 1000).toFixed(0)} updates/sec; checksum ${visibilityChecksum.toFixed(1)}`);
