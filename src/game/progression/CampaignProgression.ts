import type { RunModeFamily } from '../config/modeBalance.ts';
import type { RunProtocolId } from '../mods/types.ts';

/** Local campaign positions. Economy and combat curves have separate owners. */
export const CAMPAIGN_ROUNDS = 30;
export const CAMPAIGN_BOSS_ROUNDS = [5, 10, 15, 20, 25, 30] as const;
export const CAMPAIGN_MODES = ['normal', 'overdrive', 'supreme'] as const;
export const CAMPAIGN_PACKAGE_IDS = ['training', 'normal', 'overdrive'] as const;
export type CampaignPackageId = typeof CAMPAIGN_PACKAGE_IDS[number];
export type CampaignEncounterKind = 'arena' | 'boss' | 'trinity';

export interface CampaignModeProgress {
  highestCompletedRound: number;
  highestBossDefeated: number;
  completed: boolean;
  /** Access preserved by migration; never updated by new gameplay. */
  legacyStartRound: number;
}

export interface CampaignProgress {
  version: 1;
  modes: Record<RunModeFamily, CampaignModeProgress>;
  legacyModeAccess: { overdrive: boolean; supreme: boolean };
  packages: Record<CampaignPackageId, { eligible: boolean; claimed: boolean }>;
}

export const createCampaignProgress = (): CampaignProgress => ({
  version: 1,
  modes: Object.fromEntries(CAMPAIGN_MODES.map((mode) => [mode, {
    highestCompletedRound: 0, highestBossDefeated: 0, completed: false, legacyStartRound: 1
  }])) as CampaignProgress['modes'],
  legacyModeAccess: { overdrive: false, supreme: false },
  packages: {
    training: { eligible: false, claimed: false },
    normal: { eligible: false, claimed: false },
    overdrive: { eligible: false, claimed: false }
  }
});

export const isCampaignRound = (round: number): boolean =>
  Number.isInteger(round) && round >= 1 && round <= CAMPAIGN_ROUNDS;

const requireCampaignRound = (round: number): void => {
  if (!isCampaignRound(round)) throw new RangeError(`Invalid campaign round: ${round}`);
};

export const isCampaignBossRound = (round: number): boolean => isCampaignRound(round) && round % 5 === 0;

/** Approved currency/rarity axis only. Do not feed this into every combat curve. */
export const getCampaignRewardPosition = (mode: RunModeFamily, round: number): number => {
  requireCampaignRound(round);
  return round + CAMPAIGN_MODES.indexOf(mode) * CAMPAIGN_ROUNDS;
};

export const getCampaignEncounterKind = (round: number): 'arena' | 'boss' => {
  requireCampaignRound(round);
  return isCampaignBossRound(round) ? 'boss' : 'arena';
};

export const isCampaignModeUnlocked = (progress: CampaignProgress, mode: RunModeFamily): boolean =>
  mode === 'normal' || (mode === 'overdrive'
    ? progress.modes.normal.completed || progress.legacyModeAccess.overdrive
    : progress.modes.overdrive.completed || progress.legacyModeAccess.supreme);

export const getCampaignStartRounds = (progress: CampaignProgress, mode: RunModeFamily): number[] => {
  if (!isCampaignModeUnlocked(progress, mode)) return [];
  const state = progress.modes[mode];
  const highest = Math.min(CAMPAIGN_ROUNDS, Math.max(1, state.highestBossDefeated, state.legacyStartRound));
  return Array.from({ length: highest }, (_, index) => index + 1);
};

export const isCampaignStartUnlocked = (progress: CampaignProgress, mode: RunModeFamily, round: number): boolean =>
  isCampaignRound(round) && getCampaignStartRounds(progress, mode).includes(round);

const SUPREME_CAMPAIGN_STAGES = [
  [1, 'supreme-leo'], [4, 'supreme-gemini'], [7, 'supreme-cassiopeia'],
  [10, 'supreme-aquila'], [13, 'supreme-ursa-major'], [16, 'supreme-scorpius'],
  [19, 'supreme-taurus'], [22, 'supreme-virgo'], [25, 'supreme-capricornus'],
  [28, 'supreme-delphinus'], [30, 'supreme-centaurus']
] as const satisfies readonly (readonly [number, RunProtocolId])[];

/** Keeps the existing protocol identities and their authored stage characteristics. */
export const getCampaignProtocol = (mode: RunModeFamily, round: number): RunProtocolId => {
  requireCampaignRound(round);
  if (mode !== 'supreme') return mode;
  return SUPREME_CAMPAIGN_STAGES.findLast(([first]) => round >= first)![1];
};

export const getSupremeCampaignStart = (protocol: RunProtocolId): number | undefined =>
  SUPREME_CAMPAIGN_STAGES.find(([, id]) => id === protocol)?.[0];

export type CampaignVictoryDestination =
  | { kind: 'next-round'; round: number }
  | { kind: 'mode-complete' }
  | { kind: 'trinity'; round: 30 }
  | { kind: 'campaign-complete' };

/** A routing decision only: Arena retains ownership of loot, teardown and scenes. */
export const getCampaignVictoryDestination = (
  mode: RunModeFamily, round: number, encounter: CampaignEncounterKind
): CampaignVictoryDestination => {
  requireCampaignRound(round);
  if (encounter === 'trinity') {
    if (mode !== 'supreme' || round !== 30) throw new Error('Trinity belongs to Supreme 30');
    return { kind: 'campaign-complete' };
  }
  if (encounter !== getCampaignEncounterKind(round)) throw new Error('Encounter does not match campaign round');
  if (round < 30) return { kind: 'next-round', round: round + 1 };
  return mode === 'supreme' ? { kind: 'trinity', round: 30 } : { kind: 'mode-complete' };
};

/** Call only from successful encounter completion, never entry, death or cleanup.
 * The save owner commits this state together with rewards. This does not grant loot. */
export const recordCampaignVictory = (
  progress: CampaignProgress, mode: RunModeFamily, round: number, encounter: CampaignEncounterKind
): CampaignVictoryDestination => {
  const destination = getCampaignVictoryDestination(mode, round, encounter);
  if (!isCampaignModeUnlocked(progress, mode)) throw new Error('Campaign mode is locked');
  const state = progress.modes[mode];
  if (encounter === 'trinity' && state.highestBossDefeated !== 30) {
    throw new Error('Supreme 30 boss must be defeated before Trinity completion');
  }
  state.highestCompletedRound = Math.max(state.highestCompletedRound, round);
  if (encounter === 'boss') state.highestBossDefeated = Math.max(state.highestBossDefeated, round);
  if (destination.kind === 'mode-complete' || destination.kind === 'campaign-complete') {
    state.completed = true;
    if (mode !== 'supreme') progress.packages[mode].eligible = true;
  }
  return destination;
};

export const recordCampaignTrainingCompletion = (progress: CampaignProgress): void => {
  progress.packages.training.eligible = true;
};

export const getPendingCampaignPackages = (progress: CampaignProgress): CampaignPackageId[] =>
  CAMPAIGN_PACKAGE_IDS.filter((id) => progress.packages[id].eligible && !progress.packages[id].claimed);
