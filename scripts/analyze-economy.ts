import { COSMETICS } from '../src/data/cosmetics.ts';
import { UPGRADE_DEFINITIONS, getUpgradeCost } from '../src/data/upgrades.ts';
import {
  ENEMY_BALANCE,
  OBJECTIVE_BALANCE,
  PICKUP_BALANCE,
  REWARD_BALANCE,
  getRoundSiteCountBalanced,
  getSpawnProfile,
  type BalanceEnemyType
} from '../src/game/config/balance/index.ts';
import {
  ECONOMY_BALANCE,
  MOD_FOCUS_LABELS,
  RUN_CONTRACTS,
  getLegacyRoundCompletionCredits,
  getRoundCompletionCredits
} from '../src/game/economy/economyBalance.ts';
import { MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { MOD_BALANCE, RUN_PROTOCOLS } from '../src/game/mods/modBalance.ts';

const rounds = [5, 10, 15, 20, 30, 40, 50];
const fmt = (value: number): string => Math.round(value).toLocaleString('en-US');
const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`ECONOMY ASSERTION FAILED: ${message}`);
};

const totalUpgradeCost = UPGRADE_DEFINITIONS.reduce((total, definition) => total
  + Array.from({ length: definition.maxLevel }, (_, level) => getUpgradeCost(definition.baseCost, definition.growth, level))
    .reduce((sum, cost) => sum + cost, 0), 0);
const creditCosmetics = COSMETICS.filter((item) => item.currency === 'credits');
const totalCreditCosmeticCost = creditCosmetics.reduce((sum, item) => sum + item.cost, 0);
const paidCreditCosmeticPrices = creditCosmetics.filter((item) => item.cost > 0).map((item) => item.cost);
const finiteAccountCost = totalUpgradeCost + totalCreditCosmeticCost;
const oneCardMaxRankCost = Object.values(MOD_BALANCE.rankCreditCosts).reduce((sum, cost) => sum + cost, 0);
const starterCollectionRankCost = oneCardMaxRankCost * MOD_DEFINITIONS.length;

const projectedSpawnsPerSite = (round: number): number => {
  const spawn = getSpawnProfile(round);
  const windows = [
    { duration: Math.max(0, 14_000 - spawn.initialGraceMs), multiplier: 1.3 },
    { duration: 17_000, multiplier: 1 },
    { duration: 15_000, multiplier: 1 },
    { duration: Math.max(0, OBJECTIVE_BALANCE.bombDefenseMs - 52_000), multiplier: 0.82 }
  ];
  return windows.reduce((count, window) => count + window.duration / (spawn.defenseCadenceMs * window.multiplier), 0);
};

interface IncomeEstimate { current: number; proposed: number; killCredits: number; pickupCredits: number; sites: number; spawns: number; }
const estimateRoundIncome = (round: number): IncomeEstimate => {
  const profile = getSpawnProfile(round);
  const sites = getRoundSiteCountBalanced(round);
  const spawns = projectedSpawnsPerSite(round) * sites;
  const averageKillCredits = (Object.keys(profile.composition) as BalanceEnemyType[])
    .reduce((sum, type) => sum + profile.composition[type] * ENEMY_BALANCE[type].credits, 0);
  // Successful-run planning model: 90% of scheduled enemies are killed and
  // 80% of spawned Credit pickups are collected. Real telemetry will replace
  // these explicit assumptions once enough production runs exist.
  const realizedKills = spawns * 0.9;
  const killCredits = realizedKills * averageKillCredits;
  const pickupCredits = realizedKills * PICKUP_BALANCE.enemyDropChance * PICKUP_BALANCE.creditsShare * PICKUP_BALANCE.credits * 0.8;
  const siteCredits = sites * REWARD_BALANCE.siteRecoveryCredits;
  return {
    current: Math.round(killCredits + pickupCredits + siteCredits + getLegacyRoundCompletionCredits(round)),
    proposed: Math.round(killCredits + pickupCredits + siteCredits + getRoundCompletionCredits(round)),
    killCredits,
    pickupCredits,
    sites,
    spawns
  };
};

const cumulativeIncome = (targetRound: number, startRound: number, key: 'current' | 'proposed'): number => {
  let total = 0;
  for (let round = startRound; round <= targetRound; round += 1) total += estimateRoundIncome(round)[key];
  return total;
};

console.log('\nN3ONDefense ECONOMY AUDIT — formula model, not production telemetry');
console.log('Assumptions: successful rounds, 90% scheduled enemies killed, 80% of Credit pickups collected, sequential bomb defense.');

console.log('\nFINITE ACCOUNT SINKS');
console.table([
  { sink: 'All permanent upgrades', credits: fmt(totalUpgradeCost), repeatable: 'No' },
  { sink: 'All current Credit cosmetics', credits: fmt(totalCreditCosmeticCost), repeatable: 'No' },
  { sink: 'Finite upgrades + Credit cosmetics', credits: fmt(finiteAccountCost), repeatable: 'No' },
  { sink: `Rank one copy of all ${MOD_DEFINITIONS.length} Mods to 3`, credits: fmt(starterCollectionRankCost), repeatable: 'Per collected card' }
]);

console.log('\nECONOMY MULTIPLIERS');
console.table([
  ...Object.values(RUN_PROTOCOLS).map((protocol) => ({ system: protocol.label, credits: '1.00x', score: `${protocol.scoreMultiplier.toFixed(2)}x`, modDrops: `${protocol.modDropMultiplier.toFixed(2)}x`, note: protocol.id === 'overdrive' ? 'Skipped rounds grant zero rewards' : 'Starts at Round 1' })),
  { system: 'Focused Mod signal', credits: '1.00x', score: '1.00x', modDrops: 'Quantity unchanged', note: `${ECONOMY_BALANCE.modFocus.categoryWeightMultiplier.toFixed(2)}x selected-category weight` },
  ...Object.values(RUN_CONTRACTS).map((contract) => ({ system: contract.label, credits: `${contract.creditRewardMultiplier.toFixed(2)}x`, score: '1.00x', modDrops: `${contract.modDropChanceMultiplier.toFixed(2)}x`, note: `HP ${contract.enemyHealthMultiplier.toFixed(2)}x / cadence ${contract.spawnCadenceMultiplier.toFixed(2)}x / elite weight ${contract.eliteCompositionWeightMultiplier.toFixed(2)}x` }))
]);
console.log(`Current paid Credit cosmetic range: ${fmt(Math.min(...paidCreditCosmeticPrices))}–${fmt(Math.max(...paidCreditCosmeticPrices))}.`);
console.log(`Prestige architecture band: ${fmt(ECONOMY_BALANCE.cosmeticPriceBands.prestige.min)}–${fmt(ECONOMY_BALANCE.cosmeticPriceBands.prestige.max)} Credits (no existing prices changed).`);

console.log('\nCURRENT VS PROPOSED ROUND INCOME');
console.table(rounds.map((round) => {
  const estimate = estimateRoundIncome(round);
  return {
    round,
    sites: estimate.sites,
    projectedSpawns: Math.round(estimate.spawns),
    killAndPickupCredits: fmt(estimate.killCredits + estimate.pickupCredits),
    currentCompletion: fmt(getLegacyRoundCompletionCredits(round)),
    proposedCompletion: fmt(getRoundCompletionCredits(round)),
    currentRoundTotal: fmt(estimate.current),
    proposedRoundTotal: fmt(estimate.proposed),
    change: `${((estimate.proposed / estimate.current - 1) * 100).toFixed(1)}%`
  };
}));

console.log('\nCREDIT SOURCE / SINK INVENTORY');
console.table([
  { direction: 'Source', system: 'Enemy kill', formula: 'Enemy type value: 3 / 4 / 6 / 8 / 10 / 15 Credits' },
  { direction: 'Source', system: 'Credit pickup', formula: `${PICKUP_BALANCE.credits} Credits; ${(PICKUP_BALANCE.enemyDropChance * PICKUP_BALANCE.creditsShare * 100).toFixed(1)}% raw per-kill expectation before collection` },
  { direction: 'Source', system: 'Bomb-site recovery', formula: `${REWARD_BALANCE.siteRecoveryCredits} Credits per destroyed site` },
  { direction: 'Source', system: 'Round completion', formula: 'Segmented: +42/round through 15, +24 through 30, +12 thereafter' },
  { direction: 'Source', system: 'Mod-card sale', formula: '100 / 180 / 320 / 550 / 900 by rarity' },
  { direction: 'Sink', system: 'Permanent upgrades', formula: 'Unchanged geometric per-upgrade curves; 96,177 Credits total' },
  { direction: 'Sink', system: 'Current cosmetics', formula: 'Unchanged item prices; 5,420 Credits total' },
  { direction: 'Sink', system: 'Mod-card rank', formula: '600 + 1,200 + 2,000 Credits per card' },
  { direction: 'Sink', system: 'Focused Mod signal', formula: `${fmt(ECONOMY_BALANCE.modFocus.cost)} Credits per run` },
  { direction: 'Sink', system: 'Optional Contract', formula: '20,000–30,000 Credits per run' },
  { direction: 'Future sink', system: 'Saved Mod loadouts', formula: '25,000 / 75,000 / 200,000 / 500,000; configuration count only' },
  { direction: 'Future sink', system: 'Prestige cosmetics', formula: 'Supported band 250,000–5,000,000; purely cosmetic' }
]);

console.log('\nFULL-RUN CUMULATIVE INCOME');
console.table(rounds.map((round) => ({
  endingRound: round,
  normalCurrent: fmt(cumulativeIncome(round, RUN_PROTOCOLS.normal.startingRound, 'current')),
  normalProposed: fmt(cumulativeIncome(round, RUN_PROTOCOLS.normal.startingRound, 'proposed')),
  overdriveCurrent: fmt(cumulativeIncome(round, RUN_PROTOCOLS.overdrive.startingRound, 'current')),
  overdriveProposed: fmt(cumulativeIncome(round, RUN_PROTOCOLS.overdrive.startingRound, 'proposed')),
  skippedRoundRewards: 0
}))); 

const accountStates = [
  { account: 'New player', completion: 0 },
  { account: 'Midgame player', completion: 0.5 },
  { account: 'Advanced player', completion: 0.8 },
  { account: 'Endgame player', completion: 0.95 },
  { account: 'Maxed player', completion: 1 }
];
const run10 = cumulativeIncome(10, 1, 'proposed');
console.log('\nACCOUNT-STATE SINK COVERAGE (using a successful Normal run through Round 10)');
console.table(accountStates.map(({ account, completion }) => {
  const remainingFinite = Math.round(finiteAccountCost * (1 - completion));
  return {
    account,
    finiteCompletion: `${Math.round(completion * 100)}%`,
    remainingFiniteSinks: fmt(remainingFinite),
    round10RunsToClear: remainingFinite === 0 ? 0 : Math.ceil(remainingFinite / run10),
    incomeToRemainingSinkRatio: remainingFinite === 0 ? 'unbounded' : (run10 / remainingFinite).toFixed(2)
  };
}));

const upgradeTierCost = (levels: number): number => UPGRADE_DEFINITIONS.reduce((total, definition) => {
  const levelCount = Math.min(levels, definition.maxLevel);
  return total + Array.from({ length: levelCount }, (_, level) => getUpgradeCost(definition.baseCost, definition.growth, level))
    .reduce((sum, cost) => sum + cost, 0);
}, 0);
const missionMinutesThrough = (targetRound: number, startRound: number): number => {
  let totalMs = 0;
  for (let round = startRound; round <= targetRound; round += 1) {
    const sites = getRoundSiteCountBalanced(round);
    totalMs += sites * (OBJECTIVE_BALANCE.bombDefenseMs + OBJECTIVE_BALANCE.plantHoldMs)
      + Math.max(0, sites - 1) * OBJECTIVE_BALANCE.recoveryMs;
  }
  return totalMs / 60_000;
};
const progressionMilestones = [
  { tier: 'First level across all systems', cost: upgradeTierCost(1) },
  { tier: 'First 3 levels across all systems', cost: upgradeTierCost(3) },
  { tier: 'First 5 levels across all systems', cost: upgradeTierCost(5) },
  { tier: 'All permanent upgrade levels', cost: totalUpgradeCost }
];
console.log('\nPERMANENT-UPGRADE PURCHASE PACE');
console.table(progressionMilestones.map((milestone) => {
  const runs = Math.ceil(milestone.cost / run10);
  return {
    tier: milestone.tier,
    credits: fmt(milestone.cost),
    successfulRound10Runs: runs,
    modeledMissionHours: (runs * missionMinutesThrough(10, 1) / 60).toFixed(1)
  };
}));

console.log('\nREPEATABLE ONE-RUN CREDIT SINKS');
console.table([
  ...Object.entries(MOD_FOCUS_LABELS).map(([id, label]) => ({ id, label, cost: fmt(ECONOMY_BALANCE.modFocus.cost), effect: `${ECONOMY_BALANCE.modFocus.categoryWeightMultiplier}x category selection weight; no extra drop quantity` })),
  ...Object.values(RUN_CONTRACTS).map((contract) => ({ id: contract.id, label: contract.label, cost: fmt(contract.cost), effect: `${contract.creditRewardMultiplier.toFixed(2)}x completed-round Credits / ${contract.modDropChanceMultiplier.toFixed(2)}x Mod chance` }))
]);

console.log('\nPOST-MAX ACCUMULATION EXAMPLE');
console.table(rounds.map((round) => {
  const income = cumulativeIncome(round, 1, 'proposed');
  return {
    endingRound: round,
    oneRun: fmt(income),
    twentyRunsNoSink: fmt(income * 20),
    twentyRunsWithEliteHunt: fmt(income * 20 - RUN_CONTRACTS['elite-hunt'].cost * 20)
  };
}));

console.log('\nWARNINGS');
const modeledFiniteSinksExhaustedRound = Array.from({ length: 100 }, (_, index) => index + 1)
  .find((round) => cumulativeIncome(round, 1, 'proposed') >= finiteAccountCost) ?? null;
console.log(`• In this successful-run model, one uninterrupted Normal run overtakes all ${fmt(finiteAccountCost)} finite upgrade/cosmetic sinks by Round ${modeledFiniteSinksExhaustedRound ?? '100+'}.`);
if (run10 >= finiteAccountCost * 0.35) console.log('• A strong run through Round 10 purchases a large share of finite progression; production telemetry should validate the kill/pickup assumptions.');
console.log('• Inflation begins structurally once finite upgrades and desired cosmetics are complete; Mod signals and Contracts are the first repeatable sinks.');
console.log('• Contract multipliers can offset part of their entry fee on exceptional runs, but they require added difficulty and never grant permanent raw power.');
console.log('• Prestige price bands and saved-loadout costs are architecture only; no current cosmetic price was increased.');

assert(totalUpgradeCost === 96_177, 'audited permanent upgrade total changed; review the economy intentionally');
assert(totalCreditCosmeticCost === 5_420, 'audited Credit cosmetic total changed; review the economy intentionally');
for (let round = 1; round <= 100; round += 1) {
  const reward = getRoundCompletionCredits(round);
  assert(Number.isFinite(reward) && reward >= 0, `completion reward finite at Round ${round}`);
  if (round > 1) assert(reward >= getRoundCompletionCredits(round - 1), `completion rewards monotonic at Round ${round}`);
}
assert(getRoundCompletionCredits(50) < getLegacyRoundCompletionCredits(50), 'late reward slope is restrained');
assert(getRoundCompletionCredits(10) >= getLegacyRoundCompletionCredits(10), 'early/mid progression is not made grindier');
for (const contract of Object.values(RUN_CONTRACTS)) {
  assert(contract.cost > 0 && Number.isFinite(contract.cost), `${contract.id} cost positive`);
  assert(contract.creditRewardMultiplier >= 1, `${contract.id} reward is not punitive`);
  assert(contract.enemyHealthMultiplier > 1 || contract.spawnCadenceMultiplier < 1 || contract.eliteCompositionWeightMultiplier > 1, `${contract.id} adds challenge`);
}
console.log('\nAll economy safety and relationship checks passed.');
