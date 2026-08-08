import type { ModCategory } from '../mods/types.ts';
import type { CosmeticPriceTier, ModFocusSignalId, RunContractId } from './types.ts';

export interface RunContractDefinition {
  id: RunContractId;
  label: string;
  description: string;
  cost: number;
  creditRewardMultiplier: number;
  modDropChanceMultiplier: number;
  enemyHealthMultiplier: number;
  spawnCadenceMultiplier: number;
  eliteCompositionWeightMultiplier: number;
}

export const ECONOMY_BALANCE = {
  /** Kept for audit comparison only. Gameplay uses the segmented curve below. */
  legacyCompletionReward: { baseCredits: 150, creditsPerRound: 35 },
  completionReward: {
    baseCredits: 150,
    earlyRoundLimit: 15,
    earlyCreditsPerRound: 42,
    middleRoundLimit: 30,
    middleCreditsPerRound: 24,
    lateCreditsPerRound: 12
  },
  modFocus: {
    cost: 12_500,
    categoryWeightMultiplier: 3
  },
  cosmeticPriceBands: {
    standard: { min: 0, max: 5_000 },
    rare: { min: 5_001, max: 100_000 },
    prestige: { min: 250_000, max: 5_000_000 }
  } satisfies Record<CosmeticPriceTier, { min: number; max: number }>,
  modLoadoutSlots: {
    maximumSavedLoadouts: 5,
    purchaseCosts: [0, 25_000, 75_000, 200_000, 500_000] as const
  },
  futurePrestigeThresholds: [250_000, 500_000, 1_000_000, 5_000_000] as const
} as const;

export const MOD_FOCUS_LABELS: Record<ModFocusSignalId, string> = {
  weapon: 'Weapon Signal',
  player: 'Player Signal',
  defense: 'Defense Signal',
  bombSite: 'Bomb Site Signal',
  utility: 'Utility Signal'
};

export const MOD_FOCUS_CATEGORIES = Object.keys(MOD_FOCUS_LABELS) as ModCategory[];

export const RUN_CONTRACTS: Record<RunContractId, RunContractDefinition> = {
  'elite-hunt': {
    id: 'elite-hunt',
    label: 'Elite Hunt',
    description: 'Elite enemy weighting rises. Mod opportunities and Credit rewards improve.',
    cost: 20_000,
    creditRewardMultiplier: 1.05,
    modDropChanceMultiplier: 1.25,
    enemyHealthMultiplier: 1,
    spawnCadenceMultiplier: 1,
    eliteCompositionWeightMultiplier: 1.65
  },
  'fortified-enemy': {
    id: 'fortified-enemy',
    label: 'Fortified Enemy',
    description: 'Enemies gain 20% durability. Completed-round Credit rewards rise 20%.',
    cost: 30_000,
    creditRewardMultiplier: 1.1,
    modDropChanceMultiplier: 1,
    enemyHealthMultiplier: 1.2,
    spawnCadenceMultiplier: 1,
    eliteCompositionWeightMultiplier: 1
  },
  'bomb-rush': {
    id: 'bomb-rush',
    label: 'Bomb Rush',
    description: 'Defense waves arrive 18% faster. Completed-round Credits rise 18%.',
    cost: 25_000,
    creditRewardMultiplier: 1.08,
    modDropChanceMultiplier: 1.08,
    enemyHealthMultiplier: 1,
    spawnCadenceMultiplier: 0.82,
    eliteCompositionWeightMultiplier: 1
  }
};

export const RUN_CONTRACT_IDS = Object.keys(RUN_CONTRACTS) as RunContractId[];

export const getLegacyRoundCompletionCredits = (round: number): number => {
  const r = Math.max(1, Math.floor(round));
  return ECONOMY_BALANCE.legacyCompletionReward.baseCredits + r * ECONOMY_BALANCE.legacyCompletionReward.creditsPerRound;
};

export const getRoundCompletionCredits = (round: number): number => {
  const r = Math.max(1, Math.floor(round));
  const curve = ECONOMY_BALANCE.completionReward;
  const earlyRounds = Math.min(r, curve.earlyRoundLimit);
  const middleRounds = Math.min(Math.max(0, r - curve.earlyRoundLimit), curve.middleRoundLimit - curve.earlyRoundLimit);
  const lateRounds = Math.max(0, r - curve.middleRoundLimit);
  return Math.round(curve.baseCredits
    + earlyRounds * curve.earlyCreditsPerRound
    + middleRounds * curve.middleCreditsPerRound
    + lateRounds * curve.lateCreditsPerRound);
};

export const getContract = (id: RunContractId | null | undefined): RunContractDefinition | null => id ? RUN_CONTRACTS[id] ?? null : null;
