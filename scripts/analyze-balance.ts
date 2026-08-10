import { UPGRADE_DEFINITIONS, getUpgradeCost, getUpgradeEffect } from '../src/data/upgrades.ts';
import {
  ABILITY_BALANCE,
  ENEMY_BALANCE,
  OBJECTIVE_BALANCE,
  PICKUP_BALANCE,
  PLAYER_BALANCE,
  REWARD_BALANCE,
  WEAPON_BALANCE,
  getDefuseAssigneeCount,
  getDifficultyCurve,
  getRoundSiteCountBalanced,
  getSpawnProfile,
  sustainedWeaponDps,
  type BalanceEnemyType
} from '../src/game/config/balance/index.ts';
import { MOD_BALANCE, RUN_PROTOCOLS } from '../src/game/mods/modBalance.ts';
import { MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { getRoundCompletionCredits } from '../src/game/economy/economyBalance.ts';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`BALANCE ASSERTION FAILED: ${message}`);
};
const fixed = (value: number, digits = 1): string => value.toFixed(digits);

const weaponAtLevel = (level: number) => {
  const damage = WEAPON_BALANCE.damage + level * 2;
  const fireRate = Math.min(WEAPON_BALANCE.maximumFireRate, WEAPON_BALANCE.fireRate + level * 0.4);
  const critChance = Math.min(WEAPON_BALANCE.maximumCritChance, WEAPON_BALANCE.critChance + level * 0.02);
  const heatPerShot = Math.max(WEAPON_BALANCE.minimumHeatPerShot, WEAPON_BALANCE.heatPerShot - level * 0.4);
  const critDamage = damage * (1 + critChance * (WEAPON_BALANCE.critMultiplier - 1));
  const burstDps = critDamage * fireRate;
  const netHeat = fireRate * heatPerShot - WEAPON_BALANCE.cooldownRate;
  return {
    level,
    damage,
    fireRate: fixed(fireRate),
    critChance: `${fixed(critChance * 100, 0)}%`,
    heatPerShot: fixed(heatPerShot),
    burstSeconds: netHeat > 0 ? fixed(WEAPON_BALANCE.maxHeat / netHeat) : 'unlimited',
    burstDps: fixed(burstDps),
    sustainedDps: fixed(sustainedWeaponDps(damage, fireRate, critChance, heatPerShot))
  };
};

const weaponRows = [0, 1, 3, 5, 10].map(weaponAtLevel);
console.log('\nPLAYER BASE');
console.table([PLAYER_BALANCE]);
const maximumUpgradeLevels = Object.fromEntries(UPGRADE_DEFINITIONS.map((upgrade) => [upgrade.id, upgrade.maxLevel]));
const maximumEnergy = PLAYER_BALANCE.energyMax + getUpgradeEffect(maximumUpgradeLevels, 'player.energyMax');
const maximumEnergyRegen = PLAYER_BALANCE.energyRegenPerSecond + getUpgradeEffect(maximumUpgradeLevels, 'player.energyRegen');
const maximumShieldDuration = Math.min(
  ABILITY_BALANCE.shield.maximumDurationMs,
  ABILITY_BALANCE.shield.durationMs + getUpgradeEffect(maximumUpgradeLevels, 'player.shieldDuration')
);
const maximumHeatPerShot = Math.max(
  WEAPON_BALANCE.minimumHeatPerShot,
  WEAPON_BALANCE.heatPerShot + getUpgradeEffect(maximumUpgradeLevels, 'weapon.heatEfficiency')
);
const maximumFireRate = Math.min(
  WEAPON_BALANCE.maximumFireRate,
  WEAPON_BALANCE.fireRate + getUpgradeEffect(maximumUpgradeLevels, 'weapon.fireRate')
);
const maximumSustainedShotsPerSecond = Math.min(maximumFireRate, WEAPON_BALANCE.cooldownRate / maximumHeatPerShot);
const maximumSustainedFireEnergyPerSecond = maximumSustainedShotsPerSecond * WEAPON_BALANCE.energyCostPerShot;
console.log('\nENERGY ECONOMY (base vs fully upgraded)');
console.table([
  { state: 'base', capacity: PLAYER_BALANCE.energyMax, regenPerSecond: PLAYER_BALANCE.energyRegenPerSecond, sustainedFireCostPerSecond: fixed(Math.min(WEAPON_BALANCE.fireRate, WEAPON_BALANCE.cooldownRate / WEAPON_BALANCE.heatPerShot) * WEAPON_BALANCE.energyCostPerShot, 2), shieldDurationSeconds: fixed(ABILITY_BALANCE.shield.durationMs / 1000, 2), energyPickup: PLAYER_BALANCE.energyMax * PICKUP_BALANCE.energyRestoreFraction },
  { state: 'maximum upgrades', capacity: maximumEnergy, regenPerSecond: maximumEnergyRegen, sustainedFireCostPerSecond: fixed(maximumSustainedFireEnergyPerSecond, 2), shieldDurationSeconds: fixed(maximumShieldDuration / 1000, 2), energyPickup: maximumEnergy * PICKUP_BALANCE.energyRestoreFraction }
]);
console.log(`Energy pickup chance per enemy defeated: ${(PICKUP_BALANCE.enemyDropChance * PICKUP_BALANCE.energyShare * 100).toFixed(1)}%`);
console.log('\nWEAPON DPS (all weapon-output upgrades at listed level)');
console.table(weaponRows);

console.log('\nENEMY BASE INVENTORY');
console.table((Object.keys(ENEMY_BALANCE) as BalanceEnemyType[]).map((type) => {
  const enemy = ENEMY_BALANCE[type];
  return {
    type,
    hp: enemy.hp,
    speed: enemy.speed,
    damage: enemy.damage,
    attackRate: fixed(1000 / enemy.attackCooldownMs, 2),
    effectiveDps: fixed(enemy.damage * 1000 / enemy.attackCooldownMs),
    range: enemy.attackRange,
    weight: enemy.weight,
    unlock: enemy.unlockRound,
    credits: enemy.credits,
    tokens: enemy.tokens
  };
}));

const starterDps = sustainedWeaponDps(WEAPON_BALANCE.damage, WEAPON_BALANCE.fireRate, WEAPON_BALANCE.critChance, WEAPON_BALANCE.heatPerShot);
console.log('\nENEMY TTK BY ROUND (starter sustained DPS, seconds)');
console.table([1, 3, 5, 8, 12, 20].flatMap((round) => {
  const curve = getDifficultyCurve(round);
  return (Object.keys(ENEMY_BALANCE) as BalanceEnemyType[])
    .filter((type) => ENEMY_BALANCE[type].unlockRound <= round)
    .map((type) => ({ round, type, hp: Math.round(ENEMY_BALANCE[type].hp * curve.healthMultiplier), ttk: fixed(ENEMY_BALANCE[type].hp * curve.healthMultiplier / starterDps, 2) }));
}));

console.log('\nABILITY OUTPUT / EFFICIENCY (base)');
console.table([
  { ability: 'fence', output: `${ABILITY_BALANCE.fence.damage} DPS`, energy: ABILITY_BALANCE.fence.energyCost, cooldownMs: ABILITY_BALANCE.fence.cooldownMs, outputPerEnergy: fixed(ABILITY_BALANCE.fence.damage * ABILITY_BALANCE.fence.durationMs / 1000 / ABILITY_BALANCE.fence.energyCost), outputPerCycle: ABILITY_BALANCE.fence.damage * ABILITY_BALANCE.fence.durationMs / 1000 },
  { ability: 'turret', output: `${fixed(ABILITY_BALANCE.turret.damage * ABILITY_BALANCE.turret.fireRate)} DPS`, energy: ABILITY_BALANCE.turret.energyCost, cooldownMs: ABILITY_BALANCE.turret.cooldownMs, outputPerEnergy: fixed(ABILITY_BALANCE.turret.damage * ABILITY_BALANCE.turret.fireRate * 10 / ABILITY_BALANCE.turret.energyCost), outputPerCycle: 'persistent' },
  { ability: 'mine', output: `${ABILITY_BALANCE.mine.damage} burst`, energy: ABILITY_BALANCE.mine.energyCost, cooldownMs: ABILITY_BALANCE.mine.cooldownMs, outputPerEnergy: fixed(ABILITY_BALANCE.mine.damage / ABILITY_BALANCE.mine.energyCost), outputPerCycle: ABILITY_BALANCE.mine.damage },
  { ability: 'shield', output: `${ABILITY_BALANCE.shield.durationMs}ms immunity`, energy: ABILITY_BALANCE.shield.energyCost, cooldownMs: ABILITY_BALANCE.shield.cooldownMs, outputPerEnergy: fixed(ABILITY_BALANCE.shield.durationMs / ABILITY_BALANCE.shield.energyCost), outputPerCycle: `${fixed(ABILITY_BALANCE.shield.durationMs / ABILITY_BALANCE.shield.cooldownMs * 100)}% max uptime` }
]);

console.log('\nSPAWN / DIFFICULTY / REWARD CURVE');
console.table([1, 2, 3, 5, 6, 8, 10, 15, 20].map((round) => {
  const spawn = getSpawnProfile(round);
  const difficulty = getDifficultyCurve(round);
  const sites = getRoundSiteCountBalanced(round);
  const completionCredits = getRoundCompletionCredits(round) + sites * REWARD_BALANCE.siteRecoveryCredits;
  return { round, sites, graceMs: spawn.initialGraceMs, cadenceMs: spawn.defenseCadenceMs, countCap: spawn.activeCountCap, weightCap: spawn.activeWeightCap, defuseAssignees: getDefuseAssigneeCount(round), hpMult: fixed(difficulty.healthMultiplier, 2), damageMult: fixed(difficulty.damageMultiplier, 2), speedMult: fixed(difficulty.speedMultiplier, 2), minimumCredits: completionCredits, minimumTokens: Math.max(REWARD_BALANCE.completionBaseTokens, Math.floor(round / REWARD_BALANCE.tokenRoundDivisor)) };
}));

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

console.log('\nREPRESENTATIVE RUN PROJECTIONS (formula simulation; not human input telemetry)');
console.table([
  { test: 'A New player', round: 1, upgradeLevel: 0 },
  { test: 'B Learning', round: 3, upgradeLevel: 2 },
  { test: 'B Learning', round: 4, upgradeLevel: 3 },
  { test: 'C Experienced', round: 6, upgradeLevel: 5 },
  { test: 'C Experienced', round: 8, upgradeLevel: 6 },
  { test: 'D High progression', round: 12, upgradeLevel: 8 }
].map(({ test, round, upgradeLevel }) => {
  const spawn = getSpawnProfile(round);
  const sites = getRoundSiteCountBalanced(round);
  const spawns = projectedSpawnsPerSite(round) * sites;
  const averageWeight = (Object.keys(spawn.composition) as BalanceEnemyType[]).reduce((sum, type) => sum + spawn.composition[type] * ENEMY_BALANCE[type].weight, 0);
  const averageCredits = (Object.keys(spawn.composition) as BalanceEnemyType[]).reduce((sum, type) => sum + spawn.composition[type] * ENEMY_BALANCE[type].credits, 0);
  const minimumRewards = getRoundCompletionCredits(round) + sites * REWARD_BALANCE.siteRecoveryCredits;
  return {
    test,
    round,
    sites,
    missionMinutes: fixed((sites * OBJECTIVE_BALANCE.bombDefenseMs + sites * OBJECTIVE_BALANCE.plantHoldMs + (sites - 1) * OBJECTIVE_BALANCE.recoveryMs) / 60_000, 1),
    projectedSpawns: Math.round(spawns),
    weightedSpawnPressurePerSec: fixed(averageWeight * 1000 / spawn.defenseCadenceMs, 2),
    activeCap: spawn.activeCountCap,
    projectedCredits: Math.round(minimumRewards + spawns * averageCredits),
    projectedTokens: Math.max(REWARD_BALANCE.completionBaseTokens, Math.floor(round / REWARD_BALANCE.tokenRoundDivisor)),
    playerDps: weaponAtLevel(upgradeLevel).sustainedDps
  };
}));

console.log('\nUPGRADE COSTS');
console.table(UPGRADE_DEFINITIONS.map((upgrade) => {
  const costs = Array.from({ length: upgrade.maxLevel }, (_, level) => getUpgradeCost(upgrade.baseCost, upgrade.growth, level));
  return { id: upgrade.id, maxLevel: upgrade.maxLevel, firstCost: costs[0], finalCost: costs.at(-1), cumulativeCost: costs.reduce((sum, cost) => sum + cost, 0), effectPerLevel: upgrade.effectPerLevel, stacking: 'additive' };
}));

console.log('\nMOD RANK AND DROP CONFIGURATION');
console.table(MOD_DEFINITIONS.map((mod) => ({
  id: mod.id,
  category: mod.category,
  rarity: mod.rarity,
  variant: mod.variant ?? 'standard',
  maxRank: mod.maxRank,
  dropWeight: mod.dropWeight,
  upgrade1Duplicates: MOD_BALANCE.duplicateRequirements[1],
  upgrade1Credits: MOD_BALANCE.rankCreditCosts[1],
  upgrade1CoreTokens: MOD_BALANCE.rankCoreTokenCostsByRarity[mod.rarity][1],
  rank2Duplicates: MOD_BALANCE.duplicateRequirements[2],
  rank2Credits: MOD_BALANCE.rankCreditCosts[2],
  rank2CoreTokens: MOD_BALANCE.rankCoreTokenCostsByRarity[mod.rarity][2],
  rank3Duplicates: MOD_BALANCE.duplicateRequirements[3],
  rank3Credits: MOD_BALANCE.rankCreditCosts[3],
  rank3CoreTokens: MOD_BALANCE.rankCoreTokenCostsByRarity[mod.rarity][3],
  duplicateSale: MOD_BALANCE.duplicateCreditValueByRarity[mod.rarity],
  duplicatePlasma: MOD_BALANCE.duplicatePlasmaValueByRarity[mod.rarity]
})));
console.log('\nTHREAT PROTOCOLS');
console.table(Object.values(RUN_PROTOCOLS));

for (const enemy of Object.values(ENEMY_BALANCE)) {
  for (const value of [enemy.hp, enemy.speed, enemy.damage, enemy.attackCooldownMs, enemy.weight, enemy.credits]) assert(Number.isFinite(value) && value >= 0, 'enemy values must be finite and non-negative');
}
for (let round = 1; round <= 50; round += 1) {
  const curve = getDifficultyCurve(round);
  const spawn = getSpawnProfile(round);
  assert(Object.values(curve).every(Number.isFinite), `difficulty finite at round ${round}`);
  assert(spawn.activeCountCap <= 26 && spawn.activeWeightCap <= 39, `active pressure caps at round ${round}`);
  assert(spawn.defenseCadenceMs >= 580, `spawn cadence floor at round ${round}`);
  assert(getDefuseAssigneeCount(round) >= 1 && getDefuseAssigneeCount(round) <= 4, `defuse assignment cap at round ${round}`);
  if (round > 1) assert(getDefuseAssigneeCount(round) >= getDefuseAssigneeCount(round - 1), `defuse assignments monotonic at round ${round}`);
  if (round === 1) {
    assert(spawn.composition.tank === 0 && spawn.composition.disruptor === 0 && spawn.composition.star === 0, 'Level 1 excludes advanced specials');
    assert(spawn.activeCountCap <= 7 && spawn.initialGraceMs >= 5000, 'Level 1 onboarding pressure');
  }
}
for (const upgrade of UPGRADE_DEFINITIONS) {
  let previous = 0;
  for (let level = 0; level < upgrade.maxLevel; level += 1) {
    const cost = getUpgradeCost(upgrade.baseCost, upgrade.growth, level);
    assert(cost >= previous && cost >= 0 && Number.isFinite(cost), `${upgrade.id} costs monotonic`);
    previous = cost;
  }
}
assert(weaponAtLevel(10).fireRate <= WEAPON_BALANCE.maximumFireRate, 'maximum fire rate cap');
assert(maximumEnergyRegen < maximumSustainedFireEnergyPerSecond, 'fully upgraded sustained fire must consume energy faster than regeneration restores it');
assert(maximumEnergy <= 160, 'fully upgraded energy capacity remains within pickup-useful target');
assert(maximumShieldDuration === ABILITY_BALANCE.shield.maximumDurationMs, 'shield duration upgrade reaches its configured cap');
assert(Math.abs(PICKUP_BALANCE.healthShare + PICKUP_BALANCE.energyShare + PICKUP_BALANCE.damageBoostShare + PICKUP_BALANCE.speedBoostShare + PICKUP_BALANCE.rapidFireShare + PICKUP_BALANCE.creditsShare + PICKUP_BALANCE.coreTokenShare - 1) < 0.0001, 'pickup weights sum to one');
assert(OBJECTIVE_BALANCE.defuseRequiredMs >= 9000, 'defuser reaction time');
assert(Math.abs(Object.values(getSpawnProfile(10).composition).reduce((sum, value) => sum + value, 0) - 1) < 0.0001, 'composition normalized');
assert(MOD_BALANCE.conditionalDirectDamageBonusCap > 0 && MOD_BALANCE.conditionalDirectDamageBonusCap <= 0.3, 'conditional mod damage cap');
assert(Object.values(MOD_BALANCE.dropChance).every((chance) => chance >= 0 && chance <= 1), 'mod drop chances are probabilities');
assert(Object.values(MOD_BALANCE.raritySourceMultipliers).every((table) => Object.values(table).some((weight) => weight > 0)), 'each mod source has a usable drop table');
assert(MOD_BALANCE.rankCreditCosts[3] >= MOD_BALANCE.rankCreditCosts[2], 'mod rank costs monotonic');
assert(MOD_BALANCE.rankCreditCosts[2] >= MOD_BALANCE.rankCreditCosts[1], 'mod first-to-second upgrade costs monotonic');
assert(Object.values(MOD_BALANCE.rankCoreTokenCostsByRarity.common).every((cost) => cost === 0), 'common Mods remain credit-only');
assert(Object.values(MOD_BALANCE.rankCoreTokenCostsByRarity.uncommon).every((cost) => cost === 0), 'uncommon Mods remain credit-only');
assert(MOD_BALANCE.rankCoreTokenCostsByRarity.rare[3] <= 10, 'rare Mod Core Token costs stay modest');
for (const rarity of ['rare', 'epic', 'legendary'] as const) {
  const costs = MOD_BALANCE.rankCoreTokenCostsByRarity[rarity];
  assert(costs[1] > 0 && costs[2] >= costs[1] && costs[3] >= costs[2], `${rarity} Core Token costs are positive and monotonic`);
}
assert(MOD_BALANCE.rankCoreTokenCostsByRarity.legendary[3] >= 500, 'final legendary rank costs several hundred Core Tokens');
assert(MOD_BALANCE.duplicateRequirements[3] >= MOD_BALANCE.duplicateRequirements[2], 'mod duplicate costs monotonic');
assert(MOD_BALANCE.duplicateRequirements[2] >= MOD_BALANCE.duplicateRequirements[1], 'mod first-to-second duplicate costs monotonic');
assert(Object.values(MOD_BALANCE.duplicateCreditValueByRarity).every((value) => value > 0), 'duplicate sale values positive');
assert(Object.values(MOD_BALANCE.duplicatePlasmaValueByRarity).every((value) => value > 0), 'duplicate plasma yields positive');
assert(MOD_BALANCE.detonationFireworks.minDurationMs >= 20_000, 'fireworks minimum duration');
assert(MOD_BALANCE.detonationFireworks.maxDurationMs <= 30_000 && MOD_BALANCE.detonationFireworks.maxDurationMs >= MOD_BALANCE.detonationFireworks.minDurationMs, 'fireworks duration range');
const overdriveProtocols = Object.values(RUN_PROTOCOLS).filter((protocol) => protocol.family === 'overdrive');
assert(overdriveProtocols.length === 10, 'ten named Overdrive tiers are configured');
assert(overdriveProtocols.every((protocol, index) => protocol.startingRound === (index + 1) * 5), 'Overdrive starts advance in five-round steps');
assert(overdriveProtocols.every((protocol, index) => protocol.tier === index + 1), 'Overdrive tiers are sequential');
assert(overdriveProtocols.every((protocol) => protocol.unlockHighestRound > protocol.startingRound), 'Overdrive tiers require prior progression');
console.log('\nAll mathematical safety and relationship checks passed.');
