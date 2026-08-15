import { performance } from 'node:perf_hooks';
import { GridPathfinder } from '../src/game/systems/GridPathfinder.ts';
import { ReusableObjectPool } from '../src/game/performance/ReusableObjectPool.ts';

const SIMULATED_DURATION_MS = 5 * 60 * 1000;
const ACTIVE_ENEMIES = 24;
const REPATH_INTERVAL_MS = 700;
const PATH_QUERY_COUNT = Math.ceil(SIMULATED_DURATION_MS / REPATH_INTERVAL_MS) * ACTIVE_ENEMIES;

let randomState = 0x7f4a7c15;
const random = (): number => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x1_0000_0000;
};

const walls = [
  { x: 340, y: 120, w: 64, h: 520 },
  { x: 760, y: 0, w: 64, h: 430 },
  { x: 1120, y: 340, w: 64, h: 600 },
  { x: 1450, y: 90, w: 64, h: 500 }
];
const pathfinder = new GridPathfinder(1920, 1080, 32, walls, 22);
const pathBuffers = Array.from({ length: ACTIVE_ENEMIES }, () => [] as Array<{ x: number; y: number }>);
const heapBefore = process.memoryUsage().heapUsed;
let completedPaths = 0;
let waypoints = 0;
const startedAt = performance.now();
for (let query = 0; query < PATH_QUERY_COUNT; query += 1) {
  const path = pathfinder.findPath(
    40 + random() * 1840,
    40 + random() * 1000,
    40 + random() * 1840,
    40 + random() * 1000,
    { smooth: true, maxIterations: 2200, output: pathBuffers[query % ACTIVE_ENEMIES] }
  );
  if (path.length > 0) completedPaths += 1;
  waypoints += path.length;
}
const elapsedMs = performance.now() - startedAt;
const heapAfter = process.memoryUsage().heapUsed;

const pool = new ReusableObjectPool(
  (state: { id: number }) => ({ id: state.id, active: true }),
  (item, state) => { item.id = state.id; item.active = true; },
  (item) => { item.active = false; }
);
const burst = Array.from({ length: 4466 }, (_, id) => pool.obtain({ id }));
for (const item of burst) pool.release(item);
let trimmed = 0;
while (pool.stats().available > 1024) {
  trimmed += pool.trimAvailable(1024, () => {}, 128);
}

console.log('N3ONDefense five-minute-equivalent soak benchmark');
console.log(`Path queries: ${PATH_QUERY_COUNT.toLocaleString()} (${ACTIVE_ENEMIES} enemies @ ${REPATH_INTERVAL_MS}ms)`);
console.log(`Completed paths: ${completedPaths.toLocaleString()}, smoothed waypoints: ${waypoints.toLocaleString()}`);
console.log(`Navigation time: ${elapsedMs.toFixed(2)}ms (${(PATH_QUERY_COUNT / elapsedMs * 1000).toFixed(0)} queries/sec)`);
console.log(`Observed heap delta: ${((heapAfter - heapBefore) / 1024 / 1024).toFixed(2)} MiB`);
console.log(`Burst pool retained: ${pool.stats().available.toLocaleString()}, gradually trimmed: ${trimmed.toLocaleString()}`);
