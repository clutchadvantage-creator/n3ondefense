import { RoundRuntimeLifecycle, type RoundRuntimeKind } from '../src/game/flow/RoundRuntimeLifecycle.ts';
import { arenaCombatWarmupPlan } from '../src/game/performance/ArenaRuntimePreparation.ts';
import { ReusableObjectPool } from '../src/game/performance/ReusableObjectPool.ts';
import type { RunProtocolId } from '../src/game/mods/types.ts';

const MODES = ['normal', 'overdrive-draco', 'supreme-leo'] as const;
const CYCLES = 20;

interface SimulatedRoundResources {
  enemies: number;
  projectiles: number;
  hazards: number;
  eventObjectives: number;
  supportEnemies: number;
  pickups: number;
  deployables: number;
  timers: number;
  tweens: number;
  colliders: number;
  poolActive: number;
  listeners: number;
  audioVoices: number;
  audioToneNodes: number;
}

const createWorkload = (kind: RoundRuntimeKind, cycle: number): SimulatedRoundResources => ({
  enemies: kind === 'boss' ? 28 : 463,
  projectiles: kind === 'boss' ? 6200 : 4466,
  hazards: 4,
  eventObjectives: kind === 'round' && cycle % 3 === 0 ? 1 : 0,
  supportEnemies: kind === 'boss' ? 12 : 0,
  pickups: 24,
  deployables: 14,
  timers: 48,
  tweens: 96,
  colliders: kind === 'boss' ? 44 : 490,
  poolActive: kind === 'boss' ? 6200 : 4466,
  listeners: kind === 'boss' ? 8 : 14,
  audioVoices: kind === 'boss' ? 18 : 32,
  audioToneNodes: 4
});

const zeroResources = (resources: SimulatedRoundResources): void => {
  for (const key of Object.keys(resources) as (keyof SimulatedRoundResources)[]) resources[key] = 0;
};

const results: Record<string, unknown>[] = [];
for (const mode of MODES) {
  const lifecycle = new RoundRuntimeLifecycle();
  let staleCallbacks = 0;
  let maximumResidue = 0;
  let firstFiveMs = 0;
  let lastFiveMs = 0;

  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    const kind: RoundRuntimeKind = cycle % 5 === 0 ? 'boss' : 'round';
    const startedAt = performance.now();
    const token = lifecycle.beginStart(kind, `${mode}-${kind}-${cycle}`);
    lifecycle.markActive(token);
    const resources = createWorkload(kind, cycle);
    const stale = lifecycle.guard(token.generation, () => { staleCallbacks += 1; });
    const ending = lifecycle.beginEnd('soak-transition');
    if (!ending || !lifecycle.beginCleanup(ending)) throw new Error(`${mode} cycle ${cycle} failed to enter cleanup`);
    zeroResources(resources);
    lifecycle.finishCleanup(ending);
    stale();
    const residue = Object.values(resources).reduce((sum, count) => sum + count, 0);
    maximumResidue = Math.max(maximumResidue, residue);
    const duration = performance.now() - startedAt;
    if (cycle <= 5) firstFiveMs += duration;
    if (cycle > CYCLES - 5) lastFiveMs += duration;
  }

  results.push({
    mode,
    transitions: CYCLES,
    finalGeneration: lifecycle.generation,
    finalPhase: lifecycle.phase,
    maximumResidue,
    staleCallbacks,
    firstFiveControlMs: Number(firstFiveMs.toFixed(4)),
    lastFiveControlMs: Number(lastFiveMs.toFixed(4))
  });
}

console.log('N3ONDefense deterministic round-lifecycle soak');
console.table(results);
if (results.some((result) => result.finalPhase !== 'ready'
  || result.maximumResidue !== 0 || result.staleCallbacks !== 0)) process.exitCode = 1;

const burstScenarios: readonly { protocol: RunProtocolId; round: number; concurrentProjectiles: number }[] = [
  { protocol: 'normal', round: 1, concurrentProjectiles: 150 },
  { protocol: 'overdrive-draco', round: 30, concurrentProjectiles: 360 },
  { protocol: 'supreme-leo', round: 51, concurrentProjectiles: 620 }
];
const coldStartResults = burstScenarios.map((scenario) => {
  const plan = arenaCombatWarmupPlan(scenario.protocol, scenario.round, true);
  const pool = new ReusableObjectPool(
    (state: { sequence: number }) => ({ sequence: state.sequence, active: true }),
    (item, state) => { item.sequence = state.sequence; item.active = true; },
    (item) => { item.active = false; }
  );
  const prewarmed = pool.prewarm(plan.projectiles, (sequence) => ({ sequence }));
  const createdBeforeCombat = pool.createdCount;
  const active = Array.from({ length: scenario.concurrentProjectiles }, (_, sequence) => pool.obtain({ sequence }));
  const combatAllocations = pool.createdCount - createdBeforeCombat;
  for (const item of active) pool.release(item);
  // Simulate a fence-split burst well above the ordinary warm reserve, then
  // prove the encounter boundary drops dormant high-water capacity without
  // imposing a live gameplay cap.
  const spike = Array.from(
    { length: scenario.concurrentProjectiles * 5 },
    (_, sequence) => pool.obtain({ sequence: scenario.concurrentProjectiles + sequence })
  );
  for (const item of spike) pool.release(item);
  const trimmedAtBoundary = pool.trimAvailable(plan.projectiles, () => undefined);
  const retainedAfterBoundary = pool.availableCount;
  const createdBeforeSecondBurst = pool.createdCount;
  const second = Array.from({ length: scenario.concurrentProjectiles }, (_, sequence) => pool.obtain({ sequence }));
  const nextRoundAllocations = pool.createdCount - createdBeforeSecondBurst;
  for (const item of second) pool.release(item);
  return {
    ...scenario,
    reserve: plan.projectiles,
    prewarmed,
    combatAllocations,
    trimmedAtBoundary,
    retainedAfterBoundary,
    nextRoundAllocations
  };
});

console.log('Cold-first-round combat allocation model (capacity, never a gameplay cap)');
console.table(coldStartResults);
if (coldStartResults.some((result) => result.nextRoundAllocations !== 0
  || result.retainedAfterBoundary !== result.reserve
  || result.trimmedAtBoundary <= 0)) process.exitCode = 1;
