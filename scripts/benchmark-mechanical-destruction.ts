import { performance } from 'node:perf_hooks';
import { arenaCombatWarmupPlan } from '../src/game/performance/ArenaRuntimePreparation.ts';
import { resolveMechanicalFragmentBudget } from '../src/game/vfx/MechanicalDestructionBudget.ts';

const CAPACITY = 168;
interface Fragment { expiresAt: number; }
interface Scenario { name: string; deaths: number; deathsPerFrame: number; framesAfter: number; protocol: 'normal' | 'overdrive-draco' | 'supreme-leo'; round: number; }

const scenarios: Scenario[] = [
  { name: 'one-enemy', deaths: 1, deathsPerFrame: 1, framesAfter: 70, protocol: 'normal', round: 1 },
  { name: 'ten-rapid', deaths: 10, deathsPerFrame: 10, framesAfter: 70, protocol: 'normal', round: 30 },
  { name: 'twenty-five-aoe', deaths: 25, deathsPerFrame: 25, framesAfter: 70, protocol: 'normal', round: 30 },
  { name: 'supreme-chain-kill', deaths: 120, deathsPerFrame: 30, framesAfter: 90, protocol: 'supreme-leo', round: 70 },
  { name: 'five-minute-sustained-model', deaths: 3_000, deathsPerFrame: 4, framesAfter: 90, protocol: 'supreme-leo', round: 90 }
];

const results = scenarios.map((scenario) => {
  const reserve = arenaCombatWarmupPlan(scenario.protocol, scenario.round, true).destructionFragments;
  const active: Fragment[] = [];
  let remaining = scenario.deaths;
  let peak = 0;
  let created = reserve;
  let degradedDeaths = 0;
  let dropped = 0;
  let frame = 0;
  const startedAt = performance.now();
  while (remaining > 0 || active.length > 0) {
    const now = frame * 16.667;
    let write = 0;
    for (const fragment of active) if (fragment.expiresAt > now) active[write++] = fragment;
    active.length = write;
    const deaths = Math.min(remaining, scenario.deathsPerFrame);
    remaining -= deaths;
    for (let death = 0; death < deaths; death += 1) {
      const budget = resolveMechanicalFragmentBudget(7, active.length, CAPACITY);
      if (budget.degraded) degradedDeaths += 1;
      const available = Math.max(0, CAPACITY - active.length);
      const accepted = Math.min(available, budget.count);
      dropped += budget.count - accepted;
      created = Math.max(created, active.length + accepted);
      for (let index = 0; index < accepted; index += 1) active.push({ expiresAt: now + 640 + ((frame + index) * 53) % 420 });
    }
    peak = Math.max(peak, active.length);
    frame += 1;
    if (remaining <= 0 && frame > Math.ceil(scenario.deaths / scenario.deathsPerFrame) + scenario.framesAfter && active.length === 0) break;
    if (frame > 20_000) throw new Error(`${scenario.name} failed to quiesce`);
  }
  return {
    scenario: scenario.name,
    deaths: scenario.deaths,
    reserve,
    peak,
    coldFirstDeathAllocations: scenario.deaths === 1 ? Math.max(0, created - reserve) : '-',
    retainedAfter: active.length,
    degradedDeaths,
    dropped,
    cpuMs: Number((performance.now() - startedAt).toFixed(3))
  };
});

console.log('N3ONDefense modeled mechanical-destruction pressure benchmark');
console.table(results);
if (results.some((result) => result.peak > CAPACITY || result.retainedAfter !== 0)) process.exitCode = 1;
if (results[0].coldFirstDeathAllocations !== 0) process.exitCode = 1;
