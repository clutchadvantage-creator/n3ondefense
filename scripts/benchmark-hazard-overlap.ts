import { performance } from 'node:perf_hooks';
import { BOMBLET_HAZARD_BALANCE } from '../src/game/config/bombletHazards.ts';
import { GAS_HAZARD_BALANCE } from '../src/game/config/gasHazards.ts';

const FIVE_MINUTE_FRAMES = 5 * 60 * 60;
const BOMBLET_COUNT = BOMBLET_HAZARD_BALANCE.maximumBomblets;
const GAS_COUNT = GAS_HAZARD_BALANCE.maximumCanisters;
const SIMULATED_OVERLAPS = 100_000;

let checksum = 0;
let legacyTransientRecords = 0;
const legacyStartedAt = performance.now();
for (let cycle = 0; cycle < SIMULATED_OVERLAPS; cycle += 1) {
  const bomblets = [] as Array<{ x: number; y: number; delay: number; exploded: boolean; palette: number[] }>;
  const gas = [] as Array<{ x: number; y: number; delay: number; released: boolean; phase: number }>;
  for (let index = 0; index < BOMBLET_COUNT; index += 1) {
    bomblets.push({ x: cycle + index, y: index * 3, delay: index * 70, exploded: false, palette: [0xffffff, index, index + 1, index + 2] });
    legacyTransientRecords += 2;
  }
  for (let index = 0; index < GAS_COUNT; index += 1) {
    gas.push({ x: cycle - index, y: index * 5, delay: index * 110, released: false, phase: index * 0.17 });
    legacyTransientRecords += 1;
  }
  checksum += bomblets[BOMBLET_COUNT - 1].x + gas[GAS_COUNT - 1].x;
}
const legacyMs = performance.now() - legacyStartedAt;

const bombletPool = Array.from({ length: BOMBLET_COUNT }, () => ({
  x: 0, y: 0, delay: 0, exploded: false, palette: new Uint32Array(4)
}));
const gasPool = Array.from({ length: GAS_COUNT }, () => ({ x: 0, y: 0, delay: 0, released: false, phase: 0 }));
const pooledStartedAt = performance.now();
for (let cycle = 0; cycle < SIMULATED_OVERLAPS; cycle += 1) {
  for (let index = 0; index < BOMBLET_COUNT; index += 1) {
    const target = bombletPool[index];
    target.x = cycle + index;
    target.y = index * 3;
    target.delay = index * 70;
    target.exploded = false;
    target.palette[0] = 0xffffff;
    target.palette[1] = index;
    target.palette[2] = index + 1;
    target.palette[3] = index + 2;
  }
  for (let index = 0; index < GAS_COUNT; index += 1) {
    const target = gasPool[index];
    target.x = cycle - index;
    target.y = index * 5;
    target.delay = index * 110;
    target.released = false;
    target.phase = index * 0.17;
  }
  checksum += bombletPool[BOMBLET_COUNT - 1].x + gasPool[GAS_COUNT - 1].x;
}
const pooledMs = performance.now() - pooledStartedAt;

// Conservative five-minute command-buffer estimate for the paths changed in
// this pass. It deliberately excludes ordinary mine explosions and other FX.
const estimatedBombletCycles = 20;
const estimatedGasCycles = 4;
const bombletActiveFrames = estimatedBombletCycles * Math.ceil(
  (BOMBLET_HAZARD_BALANCE.staggerMs * (BOMBLET_COUNT - 1) + 680) / (1000 / 60)
);
const gasImpactActiveFrames = estimatedGasCycles * Math.ceil(
  (GAS_HAZARD_BALANCE.staggerMs * (GAS_COUNT - 1) + 700) / (1000 / 60)
);
const gasIgnitionActiveFrames = estimatedGasCycles * Math.ceil(GAS_HAZARD_BALANCE.mineIgnitionVisualMs / (1000 / 60));
const legacyIdleClears = FIVE_MINUTE_FRAMES * 4;
const gatedClears = bombletActiveFrames * 2 + gasImpactActiveFrames + gasIgnitionActiveFrames;

if (!Number.isFinite(checksum) || checksum === 0) throw new Error('Hazard benchmark produced an invalid result.');

console.log('N3ONDefense gas + bomblet overlap benchmark');
console.log(`Synthetic overlap resets: ${SIMULATED_OVERLAPS.toLocaleString()}`);
console.log(`Legacy transient records: ${legacyTransientRecords.toLocaleString()} in ${legacyMs.toFixed(2)}ms`);
console.log(`Fixed pooled records: ${(BOMBLET_COUNT + GAS_COUNT).toLocaleString()} in ${pooledMs.toFixed(2)}ms`);
console.log(`Modeled bookkeeping speedup: ${(legacyMs / pooledMs).toFixed(2)}x`);
console.log(`Five-minute idle/active Graphics clears: ${legacyIdleClears.toLocaleString()} legacy vs ~${gatedClears.toLocaleString()} gated`);
console.log(`Modeled clear-call reduction: ${((1 - gatedClears / legacyIdleClears) * 100).toFixed(1)}%`);
console.log(`Runtime display pools: ${BOMBLET_COUNT} bomblets + ${GAS_COUNT} gas canisters (prewarmed once)`);
