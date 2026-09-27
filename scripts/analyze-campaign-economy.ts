/** Read-only planning model. Neither mapping below is installed in gameplay. */
import { writeFileSync } from 'node:fs';
import { UPGRADE_DEFINITIONS, getUpgradeCost } from '../src/data/upgrades.ts';
import { ENEMY_BALANCE, PICKUP_BALANCE, REWARD_BALANCE, getSpawnProfile, getRoundSiteCountBalanced } from '../src/game/config/balance/index.ts';
import { getBossRewards } from '../src/game/config/bossBalance.ts';
import { FLUX_CORE_BALANCE } from '../src/game/config/fluxCores.ts';
import { ECONOMY_BALANCE, RUN_CONTRACTS, getRoundCompletionCredits } from '../src/game/economy/economyBalance.ts';
import { CURRENCY_EXCHANGE_RATES } from '../src/game/economy/CurrencyExchange.ts';
import { ENEMY_PICKUP_TOTAL_WEIGHT } from '../src/game/player/PickupDropTable.ts';
import { MOD_BALANCE } from '../src/game/mods/modBalance.ts';
import { getModDropChance, getModRarityProbability } from '../src/game/mods/ModDropService.ts';
import { REDLINE_REWARD_TIERS } from '../src/game/arcade/events/RedlineMomentum.ts';
import { PLASMA_RECALIBRATION_BALANCE } from '../src/game/mods/PlasmaRecalibration.ts';
import { getSupremeStage } from '../src/game/progression/SupremeProgression.ts';
import { CAMPAIGN_MODES, getCampaignProtocol, getCampaignRewardPosition, isCampaignBossRound } from '../src/game/progression/CampaignProgression.ts';
import { HEIST_REWARD_TABLE as H } from '../src/game/anomalies/heist/HeistConfig.ts';
import { HeistRewardService } from '../src/game/anomalies/heist/HeistRewardService.ts';
import { WEEKLY_OPERATION_ROTATIONS, OVERDRIVE_WEEKLY_OPERATION_ROTATIONS } from '../src/game/progression/WeeklyOperations.ts';
import type { RunModeFamily } from '../src/game/config/modeBalance.ts';

type Resources = { credits: number; coreTokens: number; plasmaChips: number; fluxCores: number };
const empty = (): Resources => ({ credits: 0, coreTokens: 0, plasmaChips: 0, fluxCores: 0 });
const add = (a: Resources, b: Partial<Resources>, multiplier = 1): void => {
  for (const key of Object.keys(a) as (keyof Resources)[]) a[key] += Math.round((b[key] ?? 0) * multiplier);
};
const rounded = (a: Resources): Resources => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Math.round(v * 100) / 100])) as Resources;
const mappings = {
  contiguous: getCampaignRewardPosition,
  preserve148: (mode: RunModeFamily, round: number) => mode === 'supreme'
    ? 61 + Math.round((round - 1) * 87 / 29) : round + CAMPAIGN_MODES.indexOf(mode) * 30
};

const report = {
  assumptions: [
    'General reward positions contiguous 1–90 are approved; 148 retained only as a rejected comparison. HEIST numerical balance is NOT approved. No save is read or written.',
    'Each mode: 24 ordinary rounds + 6 bosses. Completion bonuses apply to all 30 victories. Full physical boss loot collection.',
    'Current Supreme stage multipliers advance by the requested local-round stage map; no currency Mods or contracts in baseline.',
    'Supreme baseline includes its Round-30 boss PLUS existing triple-boss finale rewards; other boss support loot excluded.',
    'Kill sensitivity assumes 100/250/500 kills per ordinary round and 80% collection of random pickups; composition weights are proxies, not realized kill distributions.',
    'Kill sensitivity uses current composition, including the approved low-frequency Normal drones introduced at round 11.',
    'Site count uses current Normal progression; later modes use the mature 5-site count. Actual generated site count is not simulated.',
    'Optional HEIST: per successful extraction, all 5–8 containers opened equally often, fee 60. No entry frequency or success rate assumed.',
    'HEIST currency formulas do not apply the Arena Supreme reward multiplier. HEIST enemy drops and miniboss are separate from container averages.',
    'Currency exchange outputs are alternative uses of the same resource, never additive income.'
  ],
  scenarios: [] as unknown[],
  heist: [] as unknown[],
  arcade: [] as unknown[],
  modOdds: [] as unknown[],
  fluxNodeSensitivity: [] as unknown[],
  heistCollectionScenarios: [] as unknown[],
  sinks: {} as Record<string, unknown>,
  exchange: CURRENCY_EXCHANGE_RATES,
  weeklies: {
    regular: WEEKLY_OPERATION_ROTATIONS.map(({ id, reward }) => ({ id, reward })),
    overdrive: OVERDRIVE_WEEKLY_OPERATION_ROTATIONS.map(({ id, reward }) => ({ id, reward }))
  }
};

// Read-only worksheet inputs transcribed from the six event owners. These do
// not replace their runtime profiles. Include override profiles, not just the
// registry's defaults (Hot Package, Redline, Packet Snatcher override them).
type PoolRow = [keyof Resources | 'mods' | 'ammo', number, number, number];
const registryPool = (c: number, cs: number, t: number, ts: number, f: number, fs: number, p: number, ps: number): PoolRow[] => [
  ['credits', 28, c, cs], ['coreTokens', 18, t, ts], ['fluxCores', 16, f, fs], ['plasmaChips', 20, p, ps], ['mods', 18, 1, 0]
];
const poolMean = (rows: PoolRow[], round: number, rolls = 1, amountMultiplier = 1) => {
  const mean = { ...empty(), mods: 0, ammo: 0 };
  const weight = rows.reduce((sum, row) => sum + row[1], 0);
  for (const [kind, chance, base, slope] of rows) mean[kind] += rolls * chance / weight
    * (kind === 'mods' || kind === 'ammo' ? 1 : Math.max(1, Math.floor(base * amountMultiplier + round * (slope * amountMultiplier))));
  return mean;
};
for (const round of [1, 30, 60, 90, 148]) {
  const hotPackage = { ...empty(), mods: 0, ammo: 0 };
  for (const [quality, chance, rolls] of [['standard', .68, 2], ['enhanced', .25, 3], ['jackpot', .07, 5]] as const) {
    const jackpot = quality === 'jackpot', improved = quality === 'enhanced';
    const mean = poolMean([
      ['credits', jackpot ? 25 : 34, jackpot ? 420 : improved ? 300 : 220, jackpot ? 16 : 10],
      ['coreTokens', jackpot ? 18 : 12, jackpot ? 3 : 1, .04], ['fluxCores', jackpot ? 15 : 9, jackpot ? 2 : 1, .015],
      ['plasmaChips', jackpot ? 16 : 13, jackpot ? 5 : 3, .1], ['mods', jackpot ? 16 : improved ? 12 : 6, 1, 0], ['ammo', 12, 1, 0]
    ], round, rolls);
    for (const key of Object.keys(hotPackage) as (keyof typeof hotPackage)[]) hotPackage[key] += chance * mean[key];
  }
  const packet = poolMean([['credits', 34, 420, 17], ['plasmaChips', 28, 4, .14], ['coreTokens', 10, 1, .035],
    ['fluxCores', 8, 1, .012], ['mods', 20, 1, 0]], round);
  packet.mods += 1.22;
  report.arcade.push({ position: round,
    note: 'Per successful event before pickup collection and Arena banking; no assumed appearance/success count. Packet bonus uses uniform seed residues.',
    goldenHunt: poolMean(registryPool(800, 30, 2, .08, 1, .025, 5, .18), round),
    miniBoss: poolMean(registryPool(1100, 45, 3, .1, 2, .035, 8, .25), round),
    neonCircuit: poolMean(registryPool(650, 25, 2, .07, 1, .02, 5, .16), round), hotPackage, packetSnatcher: packet,
    redline: Object.fromEntries(Object.entries(REDLINE_REWARD_TIERS).map(([rank, tier]) => [rank, poolMean([
      ['credits', 32, 330, 14], ['coreTokens', 14, 2, .04], ['fluxCores', 13, 1, .018],
      ['plasmaChips', 16, 4, .12], ['mods', 13, 1, 0], ['ammo', 12, 1, 0]
    ], round, tier.rolls, tier.amountMultiplier)]))
  });
}

for (const [mapping, position] of Object.entries(mappings)) {
  for (const mode of CAMPAIGN_MODES) {
    const completion = empty(), bosses = empty(), finale = empty(), sites = empty();
    for (let round = 1; round <= 30; round++) {
      const r = position(mode, round);
      const multiplier = getSupremeStage(getCampaignProtocol(mode, round))?.rewardMultiplier ?? 1;
      add(completion, { credits: getRoundCompletionCredits(r), coreTokens: Math.max(1, Math.floor(r / 3)) }, multiplier);
      if (isCampaignBossRound(round)) add(bosses, getBossRewards(r), multiplier);
      else add(sites, { credits: REWARD_BALANCE.siteRecoveryCredits * getRoundSiteCountBalanced(mode === 'normal' ? round : r) }, multiplier);
    }
    if (mode === 'supreme') {
      const multiplier = getSupremeStage(getCampaignProtocol(mode, 30))!.rewardMultiplier;
      add(finale, getBossRewards(position(mode, 30)), 3 * multiplier);
      finale.fluxCores = Math.max(3, Math.round(2 * multiplier));
    }
    const fixedTotal = empty();
    for (const component of [completion, bosses, finale, sites]) add(fixedTotal, component);
    const killSensitivity = [100, 250, 500].map((killsPerOrdinaryRound) => {
      const income = empty();
      for (let round = 1; round <= 30; round++) {
        if (isCampaignBossRound(round)) continue;
        const r = position(mode, round);
        const multiplier = getSupremeStage(getCampaignProtocol(mode, round))?.rewardMultiplier ?? 1;
        const composition = getSpawnProfile(r, 0, mode).composition;
        const killCredits = Object.entries(composition).reduce((sum, [type, weight]) => sum + weight * ENEMY_BALANCE[type as keyof typeof ENEMY_BALANCE].credits, 0);
        const pickupCredits = PICKUP_BALANCE.enemyDropChance * PICKUP_BALANCE.creditsShare / ENEMY_PICKUP_TOTAL_WEIGHT * PICKUP_BALANCE.credits * .8;
        const tokenPickups = PICKUP_BALANCE.enemyDropChance * PICKUP_BALANCE.coreTokenShare / ENEMY_PICKUP_TOTAL_WEIGHT * .8;
        // Star kills grant their direct Token independently of the pickup roll.
        income.credits += killsPerOrdinaryRound * (killCredits + pickupCredits) * multiplier;
        income.coreTokens += killsPerOrdinaryRound * (composition.star + tokenPickups) * multiplier;
      }
      const total = empty(); add(total, fixedTotal); add(total, income);
      return { killsPerOrdinaryRound, extraIncome: rounded(income), totalWithFixed: total };
    });
    report.scenarios.push({ mapping, mode, positions: [position(mode, 1), position(mode, 30)], completion, bosses, finale, sites, fixedTotal, killSensitivity });
    for (const localRound of [1, 30]) {
      for (const source of ['milestone', 'boss', 'arcade', 'anomaly'] as const) {
        const request = { source, round: position(mode, localRound), seed: 0, sequence: 0, protocol: getCampaignProtocol(mode, localRound) };
        report.modOdds.push({ mapping, mode, localRound, rewardPosition: request.round, source,
          chanceOfCard: source === 'boss' ? getModDropChance(request) : 1,
          conditionalRarityProbabilities: Object.fromEntries((['common', 'uncommon', 'rare', 'epic', 'legendary', 'supreme'] as const)
            .map((rarity) => [rarity, getModRarityProbability(request, rarity)])) });
      }
    }
  }
}

for (const round of [1, 10, 20, 30, 31, 60, 61, 90, 148]) {
  const entryCost = 60;
  // Exact expectation before integer rounding: 4 guaranteed + mean 2.5 random containers.
  const expectedContainers = {
    credits: H.guaranteedCreditsBase + entryCost * H.guaranteedCreditsPerFlux + round * H.guaranteedCreditsPerRound + H.creditsVariance / 2
      + 2.5 * H.creditsWeight * (H.creditsBase + entryCost * H.creditsPerFlux + round * H.creditsPerRound + H.creditsVariance / 2),
    coreTokens: H.guaranteedCoreBase + entryCost * H.guaranteedCorePerFlux + round * H.guaranteedCorePerRound + 1.5
      + 2.5 * H.coreTokensWeight * (H.coreBase + entryCost * H.corePerFlux + round * H.corePerRound + 1.5),
    plasmaChips: H.guaranteedPlasmaBase + entryCost * H.guaranteedPlasmaPerFlux + round * H.guaranteedPlasmaPerRound + 2.5
      + 2.5 * H.plasmaChipsWeight * (H.plasmaBase + entryCost * H.plasmaPerFlux + round * H.plasmaPerRound + 3),
    fluxCores: 2.5 * H.fluxCoresWeight * (H.fluxBase + entryCost * H.fluxPerEntryFlux + round * H.fluxPerRound + 1.5)
  };
  // Brief deterministic source check. This is a currency sample, not a browser soak.
  const sample = empty(); const samples = 512;
  for (let seed = 0; seed < samples; seed++) {
    const service = new HeistRewardService(550055 + seed * 97, round, 'overdrive', entryCost);
    for (let index = 0; index < 5 + seed % 4; index++) {
      const reward = service.rollContainer();
      if (reward.kind !== 'mod') sample[reward.kind] += reward.amount / samples;
    }
  }
  report.heist.push({ position: round, entryCost, expectedContainers: rounded(expectedContainers), expectedMods: 1 + 2.5 * H.modWeight,
    sampledContainers: rounded(sample), samples,
    miniBossPlasmaIfPresent: H.miniBossPlasmaBase + round * H.miniBossPlasmaPerRound + 3,
    initialEnemies: Math.min(16, 7 + Math.floor(round / 10)), escapeTargetBeforeExistingEnemies: 11 + Math.floor(round / 8),
    containerHealth: 54 + 2.2 * round });
  // All containers must be opened before egress. Real variation is collection
  // and extraction success, not an unsupported 1–4-container exit route.
  for (const collectionFraction of [.5, .8, 1]) {
    const collected = Object.fromEntries(Object.entries(expectedContainers).map(([kind, amount]) => [kind, amount * collectionFraction])) as Resources;
    report.heistCollectionScenarios.push({ position: round, collectionFraction, expectedCurrencies: rounded(collected),
      expectedMods: (1 + 2.5 * H.modWeight) * collectionFraction,
      note: 'Uniform per-currency and per-card collection assumption, not measured behavior. Conditioned on successful extraction.' });
  }
}

for (const nodesPerOrdinaryRound of [2, 6, 12]) {
  for (const mode of CAMPAIGN_MODES) {
    let expectedBankedFlux = 0;
    for (let round = 1; round <= 30; round++) {
      if (isCampaignBossRound(round)) continue;
      const multiplier = getSupremeStage(getCampaignProtocol(mode, round))?.rewardMultiplier ?? 1;
      // E[round(Binomial(nodes, drop*collection) * multiplier)] rather than
      // rounding an expected fraction of a pickup. Independent collection is
      // an explicit assumption; other Flux sources can alter banking rounding.
      const p = FLUX_CORE_BALANCE.collectibleDropChance * .8;
      for (let collected = 0; collected <= nodesPerOrdinaryRound; collected++) {
        let combinations = 1;
        for (let j = 1; j <= collected; j++) combinations *= (nodesPerOrdinaryRound - j + 1) / j;
        expectedBankedFlux += combinations * p ** collected * (1 - p) ** (nodesPerOrdinaryRound - collected)
          * Math.round(collected * multiplier);
      }
    }
    report.fluxNodeSensitivity.push({ mode, nodesPerOrdinaryRound,
      expectedRawFluxPerMode: 24 * nodesPerOrdinaryRound * FLUX_CORE_BALANCE.collectibleDropChance * .8,
      expectedBankedFlux: Math.round(expectedBankedFlux * 100) / 100,
      ordinaryRoundsToAfford35AtModeAverageRate: Math.ceil(35 * 24 / expectedBankedFlux),
      ordinaryRoundsToAffordAverageFeeAtModeAverageRate: Math.ceil(62.5 * 24 / expectedBankedFlux),
      ordinaryRoundsToAfford90AtModeAverageRate: Math.ceil(90 * 24 / expectedBankedFlux),
      note: '80% collection, independent nodes; excludes events, HEIST, weeklies, finale and wallet carried in. Not observed player behavior.' });
  }
}
report.sinks = {
  totalPermanentUpgradeCredits: UPGRADE_DEFINITIONS.reduce((sum, upgrade) => sum + Array.from({ length: upgrade.maxLevel }, (_, level) => getUpgradeCost(upgrade.baseCost, upgrade.growth, level)).reduce((a, b) => a + b, 0), 0),
  rankCreditsPerCard: Object.values(MOD_BALANCE.rankCreditCosts).reduce((a, b) => a + b, 0),
  rankTokensPerCard: Object.fromEntries(Object.entries(MOD_BALANCE.rankCoreTokenCostsByRarity).map(([rarity, costs]) => [rarity, Object.values(costs).reduce((a, b) => a + b, 0)])),
  recalibration: { roll: PLASMA_RECALIBRATION_BALANCE.rollCost, reset: PLASMA_RECALIBRATION_BALANCE.resetCost },
  infusions: MOD_BALANCE.infusionPlasmaCost,
  infusionReconfiguration: MOD_BALANCE.infusionReconfigurationPlasmaCost,
  infusionRemoval: MOD_BALANCE.infusionRemovalPlasmaCost,
  signalCredits: ECONOMY_BALANCE.modFocus.cost,
  savedLoadoutCredits: ECONOMY_BALANCE.modLoadoutSlots.purchaseCosts,
  contracts: Object.values(RUN_CONTRACTS).map(({ id, cost, creditRewardMultiplier }) => ({ id, cost, creditRewardMultiplier,
    completionEligibleCreditIncomeToRecoverCost: cost / (creditRewardMultiplier - 1) }))
};
const json = JSON.stringify(report, null, 2) + '\n';
const output = process.argv[2];
if (output) writeFileSync(output, json, 'utf8');
else console.log(json);
