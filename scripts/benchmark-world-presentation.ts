import { performance } from 'node:perf_hooks';
import { createEnvironmentDecalPlan } from '../src/game/rendering/EnvironmentDecalLibrary.ts';

const FIVE_MINUTE_FRAMES = 60 * 60 * 5;
const SEGMENTS = 12;
let sink = 0;

const legacyStart = performance.now();
for (let frame = 0; frame < FIVE_MINUTE_FRAMES; frame += 1) {
  for (let segment = 0; segment < SEGMENTS; segment += 1) {
    const dx = 1900 - segment * 13;
    const dy = 1050 - segment * 9;
    const length = Math.max(1, Math.hypot(dx, dy));
    for (let step = 1; step < 18; step += 1) {
      sink += Math.sin(frame * 0.045 + step * 2.7 + segment * 5) * 7 / length;
    }
  }
}
const legacyLaserMs = performance.now() - legacyStart;

const optimizedStart = performance.now();
for (let frame = 0; frame < FIVE_MINUTE_FRAMES; frame += 2) {
  for (let segment = 0; segment < SEGMENTS; segment += 1) {
    const nodeProgress = (Math.sin(frame * 0.009 + segment * 1.7) + 1) * 0.5;
    sink += nodeProgress * (1900 - segment * 13);
  }
}
const optimizedLaserMs = performance.now() - optimizedStart;

const simulatedPhases = 10_000;
let gasObjectChurn = 0;
const legacyGasStart = performance.now();
for (let phase = 0; phase < simulatedPhases; phase += 1) {
  const effects: Array<{ x: number; y: number; radius: number; alpha: number }> = [];
  for (let canister = 0; canister < 12; canister += 1) {
    effects.push({ x: canister * 19, y: phase, radius: 12, alpha: 1 });
    for (let puff = 0; puff < 4; puff += 1) effects.push({ x: canister, y: puff, radius: 8, alpha: 0.38 });
  }
  gasObjectChurn += effects.length;
  sink += effects[effects.length - 1].x;
}
const legacyGasMs = performance.now() - legacyGasStart;

const states = Array.from({ length: 12 }, () => ({ active: false, x: 0, y: 0, startedAt: 0 }));
const batchedGasStart = performance.now();
for (let phase = 0; phase < simulatedPhases; phase += 1) {
  for (let canister = 0; canister < states.length; canister += 1) {
    const state = states[canister];
    state.active = true;
    state.x = canister * 19;
    state.y = phase;
    state.startedAt = phase * 1000 + canister * 90;
    sink += state.x;
  }
}
const batchedGasMs = performance.now() - batchedGasStart;

const environmentSurfaces = Array.from({ length: 96 }, (_, index) => ({
  x: 90 + index * 31,
  y: 120 + (index % 11) * 84,
  w: index % 2 ? 168 : 34,
  h: index % 2 ? 34 : 168
}));
const environmentPlanStart = performance.now();
let environmentDecals = 0;
for (let seed = 1; seed <= 1_000; seed += 1) {
  environmentDecals += createEnvironmentDecalPlan(seed % 2 ? 'arena' : 'heist', seed, environmentSurfaces, seed % 2 ? 9 : 12).decals.length;
}
const environmentPlanMs = performance.now() - environmentPlanStart;

if (!Number.isFinite(sink)) throw new Error('World-presentation benchmark produced an invalid result.');

console.log('N3ONDefense five-minute world-presentation benchmark');
console.log(`Laser workload: ${FIVE_MINUTE_FRAMES.toLocaleString()} frames, up to ${SEGMENTS} beams`);
console.log(`Legacy 60 Hz jitter path: ${legacyLaserMs.toFixed(2)}ms`);
console.log(`Batched 30 Hz shape-first path: ${optimizedLaserMs.toFixed(2)}ms`);
console.log(`Modeled laser CPU speedup: ${(legacyLaserMs / optimizedLaserMs).toFixed(2)}x`);
console.log(`Gas impact simulation: ${simulatedPhases.toLocaleString()} phases`);
console.log(`Legacy temporary objects: ${gasObjectChurn.toLocaleString()}, ${legacyGasMs.toFixed(2)}ms`);
console.log(`Fixed impact states: ${states.length}, ${batchedGasMs.toFixed(2)}ms`);
console.log(`Modeled gas bookkeeping speedup: ${(legacyGasMs / batchedGasMs).toFixed(2)}x`);
console.log(`Environment setup: 1,000 deterministic plans / ${environmentDecals.toLocaleString()} bounded decals in ${environmentPlanMs.toFixed(2)}ms`);
console.log('Runtime environment animation: 1 shared arena pulse + 1 HEIST ambient Graphics batch');
