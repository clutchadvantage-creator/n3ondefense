export type WeeklyOperationStat =
  | 'enemiesDestroyed'
  | 'roundsCompleted'
  | 'bombSitesDestroyed'
  | 'highestRound'
  | 'totalCreditsEarned';

export type WeeklyOperationDeck = 'regular' | 'overdrive';

export interface WeeklyOperationDefinition {
  id: string;
  title: string;
  description: string;
  statKey: WeeklyOperationStat;
  target: number;
  progressMode: 'rotation' | 'absolute';
}

export interface WeeklyOperationReward {
  credits: number;
  coreTokens: number;
  plasmaChips?: number;
  fluxCores?: number;
  randomMod?: boolean;
  /** Future rewards stay undisclosed in the operation UI and enter the Gear Locker when claimed. */
  cosmeticIds?: readonly string[];
}

export interface WeeklyOperationRotationDefinition {
  id: string;
  objectives: readonly WeeklyOperationDefinition[];
  reward: WeeklyOperationReward;
}

export interface WeeklyOperationProgressSource {
  enemiesDestroyed: number;
  roundsCompleted: number;
  bombSitesDestroyed: number;
  highestRound: number;
  totalCreditsEarned: number;
}

export interface WeeklyOperationTrackState {
  rotationId: string;
  startedAt: string;
  baselines: Record<WeeklyOperationStat, number>;
  rewardClaimed: boolean;
}

/**
 * The original regular-deck fields remain at the root for exported-save
 * compatibility. Overdrive is an additive, independently rotating track.
 */
export interface WeeklyOperationsState extends WeeklyOperationTrackState {
  overdrive: WeeklyOperationTrackState;
}

export interface WeeklyOperationObjectiveView extends WeeklyOperationDefinition {
  current: number;
  complete: boolean;
}

export interface WeeklyOperationsSnapshot {
  deck: WeeklyOperationDeck;
  rotationId: string;
  endsAt: number;
  objectives: WeeklyOperationObjectiveView[];
  reward: WeeklyOperationReward;
  complete: boolean;
  rewardClaimed: boolean;
}

export interface WeeklyOperationsResolution {
  state: WeeklyOperationsState;
  snapshot: WeeklyOperationsSnapshot;
  rewardToGrant: WeeklyOperationReward | null;
  stateChanged: boolean;
}

export interface WeeklyOperationDecksSnapshot {
  regular: WeeklyOperationsSnapshot;
  overdrive: WeeklyOperationsSnapshot;
}

export interface WeeklyOperationRewardGrant {
  deck: WeeklyOperationDeck;
  rotationId: string;
  reward: WeeklyOperationReward;
}

export interface WeeklyOperationDecksResolution {
  state: WeeklyOperationsState;
  snapshot: WeeklyOperationDecksSnapshot;
  rewardsToGrant: WeeklyOperationRewardGrant[];
  stateChanged: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// 1970-01-05 was a Monday. Keeping the boundary in UTC makes every client
// resolve the same weekly slot and leaves room for a server clock later.
const WEEKLY_EPOCH_MS = Date.UTC(1970, 0, 5);

const STAT_KEYS: readonly WeeklyOperationStat[] = [
  'enemiesDestroyed',
  'roundsCompleted',
  'bombSitesDestroyed',
  'highestRound',
  'totalCreditsEarned'
] as const;

export const WEEKLY_OPERATION_ROTATIONS: readonly WeeklyOperationRotationDefinition[] = [
  {
    id: 'frontline-pressure',
    objectives: [
      { id: 'eliminate-500', title: 'Eliminate 500 enemies', description: 'Destroy hostile units during any deployment.', statKey: 'enemiesDestroyed', target: 500, progressMode: 'rotation' },
      { id: 'complete-12-rounds', title: 'Complete 12 rounds', description: 'Finish rounds in Local or Online deployments.', statKey: 'roundsCompleted', target: 12, progressMode: 'rotation' },
      { id: 'destroy-20-sites', title: 'Detonate 20 bomb sites', description: 'Successfully defend planted charges through detonation.', statKey: 'bombSitesDestroyed', target: 20, progressMode: 'rotation' }
    ],
    reward: { credits: 750, coreTokens: 1 }
  },
  {
    id: 'deep-deployment',
    objectives: [
      { id: 'eliminate-650', title: 'Eliminate 650 enemies', description: 'Destroy hostile units during any deployment.', statKey: 'enemiesDestroyed', target: 650, progressMode: 'rotation' },
      { id: 'reach-round-15', title: 'Reach Round 15', description: 'Push any deployment to Round 15 or farther.', statKey: 'highestRound', target: 15, progressMode: 'absolute' },
      { id: 'earn-25000', title: 'Earn 25,000 Credits', description: 'Accumulate deployment and pickup Credits.', statKey: 'totalCreditsEarned', target: 25_000, progressMode: 'rotation' }
    ],
    reward: { credits: 1_000, coreTokens: 1 }
  },
  {
    id: 'site-control',
    objectives: [
      { id: 'destroy-30-sites', title: 'Detonate 30 bomb sites', description: 'Successfully defend planted charges through detonation.', statKey: 'bombSitesDestroyed', target: 30, progressMode: 'rotation' },
      { id: 'complete-18-rounds', title: 'Complete 18 rounds', description: 'Finish rounds in Local or Online deployments.', statKey: 'roundsCompleted', target: 18, progressMode: 'rotation' },
      { id: 'eliminate-800', title: 'Eliminate 800 enemies', description: 'Destroy hostile units during any deployment.', statKey: 'enemiesDestroyed', target: 800, progressMode: 'rotation' }
    ],
    reward: { credits: 1_250, coreTokens: 2 }
  }
] as const;

export const OVERDRIVE_WEEKLY_OPERATION_ROTATIONS: readonly WeeklyOperationRotationDefinition[] = [
  {
    id: 'overdrive-siege-line',
    objectives: [
      { id: 'overdrive-eliminate-3000', title: 'Eliminate 3,000 enemies', description: 'Destroy hostiles during Overdrive deployments.', statKey: 'enemiesDestroyed', target: 3_000, progressMode: 'rotation' },
      { id: 'overdrive-complete-40', title: 'Complete 40 rounds', description: 'Complete rounds in any Overdrive tier.', statKey: 'roundsCompleted', target: 40, progressMode: 'rotation' },
      { id: 'overdrive-sites-70', title: 'Detonate 70 bomb sites', description: 'Defend charges to detonation in Overdrive.', statKey: 'bombSitesDestroyed', target: 70, progressMode: 'rotation' }
    ],
    reward: { credits: 35_000, coreTokens: 8, plasmaChips: 12, fluxCores: 2 }
  },
  {
    id: 'overdrive-deep-burn',
    objectives: [
      { id: 'overdrive-eliminate-4000', title: 'Eliminate 4,000 enemies', description: 'Destroy hostiles during Overdrive deployments.', statKey: 'enemiesDestroyed', target: 4_000, progressMode: 'rotation' },
      { id: 'overdrive-complete-55', title: 'Complete 55 rounds', description: 'Complete rounds in any Overdrive tier.', statKey: 'roundsCompleted', target: 55, progressMode: 'rotation' },
      { id: 'overdrive-reach-40', title: 'Reach Overdrive Round 40', description: 'Push an Overdrive deployment to Round 40.', statKey: 'highestRound', target: 40, progressMode: 'absolute' }
    ],
    reward: { credits: 45_000, coreTokens: 10, plasmaChips: 16, fluxCores: 2, randomMod: true }
  },
  {
    id: 'overdrive-system-breaker',
    objectives: [
      { id: 'overdrive-sites-85', title: 'Detonate 85 bomb sites', description: 'Defend charges to detonation in Overdrive.', statKey: 'bombSitesDestroyed', target: 85, progressMode: 'rotation' },
      { id: 'overdrive-complete-75', title: 'Complete 75 rounds', description: 'Complete rounds in any Overdrive tier.', statKey: 'roundsCompleted', target: 75, progressMode: 'rotation' },
      { id: 'overdrive-eliminate-5000', title: 'Eliminate 5,000 enemies', description: 'Destroy hostiles during Overdrive deployments.', statKey: 'enemiesDestroyed', target: 5_000, progressMode: 'rotation' }
    ],
    reward: { credits: 60_000, coreTokens: 12, plasmaChips: 20, fluxCores: 2, randomMod: true }
  }
] as const;

const finiteCounter = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export const createWeeklyBaselines = (progress?: Partial<WeeklyOperationProgressSource>): Record<WeeklyOperationStat, number> => ({
  enemiesDestroyed: finiteCounter(progress?.enemiesDestroyed),
  roundsCompleted: finiteCounter(progress?.roundsCompleted),
  bombSitesDestroyed: finiteCounter(progress?.bombSitesDestroyed),
  highestRound: finiteCounter(progress?.highestRound),
  totalCreditsEarned: finiteCounter(progress?.totalCreditsEarned)
});

export const createDefaultWeeklyOperationTrackState = (): WeeklyOperationTrackState => ({
  rotationId: '',
  startedAt: '',
  baselines: createWeeklyBaselines(),
  rewardClaimed: false
});

export const createDefaultWeeklyOperationsState = (): WeeklyOperationsState => ({
  ...createDefaultWeeklyOperationTrackState(),
  overdrive: createDefaultWeeklyOperationTrackState()
});

const normalizeTrackState = (value: unknown): WeeklyOperationTrackState => {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawBaselines = candidate.baselines && typeof candidate.baselines === 'object'
    ? candidate.baselines as Record<string, unknown>
    : {};
  const baselines = createWeeklyBaselines();
  for (const key of STAT_KEYS) baselines[key] = finiteCounter(rawBaselines[key]);
  return {
    rotationId: typeof candidate.rotationId === 'string' ? candidate.rotationId : '',
    startedAt: typeof candidate.startedAt === 'string' && !Number.isNaN(Date.parse(candidate.startedAt)) ? candidate.startedAt : '',
    baselines,
    rewardClaimed: candidate.rewardClaimed === true
  };
};

export const normalizeWeeklyOperationsState = (value: unknown): WeeklyOperationsState => {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { ...normalizeTrackState(candidate), overdrive: normalizeTrackState(candidate.overdrive) };
};

export const getWeeklyRotationSlot = (nowMs = Date.now()): { index: number; startsAt: number; endsAt: number } => {
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const index = Math.floor((safeNow - WEEKLY_EPOCH_MS) / WEEK_MS);
  const startsAt = WEEKLY_EPOCH_MS + index * WEEK_MS;
  return { index, startsAt, endsAt: startsAt + WEEK_MS };
};

interface TrackResolution {
  state: WeeklyOperationTrackState;
  snapshot: WeeklyOperationsSnapshot;
  rewardToGrant: WeeklyOperationReward | null;
  stateChanged: boolean;
}

const resolveTrack = (
  deck: WeeklyOperationDeck,
  rotations: readonly WeeklyOperationRotationDefinition[],
  progress: WeeklyOperationProgressSource,
  storedState: WeeklyOperationTrackState,
  nowMs: number
): TrackResolution => {
  const slot = getWeeklyRotationSlot(nowMs);
  const rotation = rotations[((slot.index % rotations.length) + rotations.length) % rotations.length];
  const rotationId = `${slot.index}:${rotation.id}`;
  const normalized = normalizeTrackState(storedState);
  const rotated = normalized.rotationId !== rotationId;
  const state: WeeklyOperationTrackState = rotated
    ? { rotationId, startedAt: new Date(slot.startsAt).toISOString(), baselines: createWeeklyBaselines(progress), rewardClaimed: false }
    : normalized;
  const objectives = rotation.objectives.map((definition): WeeklyOperationObjectiveView => {
    const rawCurrent = finiteCounter(progress[definition.statKey]);
    const baseline = finiteCounter(state.baselines[definition.statKey]);
    const current = definition.progressMode === 'absolute' ? rawCurrent : Math.max(0, rawCurrent - baseline);
    return { ...definition, current: Math.min(current, definition.target), complete: current >= definition.target };
  });
  const complete = objectives.every((objective) => objective.complete);
  const shouldGrant = complete && !state.rewardClaimed;
  if (shouldGrant) state.rewardClaimed = true;
  return {
    state,
    snapshot: { deck, rotationId, endsAt: slot.endsAt, objectives, reward: { ...rotation.reward }, complete, rewardClaimed: state.rewardClaimed },
    rewardToGrant: shouldGrant ? { ...rotation.reward } : null,
    stateChanged: rotated || shouldGrant
  };
};

/** Retains the original single-deck resolver for callers and save tests. */
export const resolveWeeklyOperations = (
  progress: WeeklyOperationProgressSource,
  storedState: WeeklyOperationsState,
  nowMs = Date.now()
): WeeklyOperationsResolution => {
  const normalized = normalizeWeeklyOperationsState(storedState);
  const regular = resolveTrack('regular', WEEKLY_OPERATION_ROTATIONS, progress, normalized, nowMs);
  return {
    state: { ...regular.state, overdrive: normalized.overdrive },
    snapshot: regular.snapshot,
    rewardToGrant: regular.rewardToGrant,
    stateChanged: regular.stateChanged
  };
};

export const resolveWeeklyOperationDecks = (
  progress: WeeklyOperationProgressSource,
  overdriveProgress: WeeklyOperationProgressSource,
  storedState: WeeklyOperationsState,
  nowMs = Date.now()
): WeeklyOperationDecksResolution => {
  const normalized = normalizeWeeklyOperationsState(storedState);
  const regular = resolveTrack('regular', WEEKLY_OPERATION_ROTATIONS, progress, normalized, nowMs);
  const overdrive = resolveTrack('overdrive', OVERDRIVE_WEEKLY_OPERATION_ROTATIONS, overdriveProgress, normalized.overdrive, nowMs);
  const rewardsToGrant: WeeklyOperationRewardGrant[] = [];
  if (regular.rewardToGrant) rewardsToGrant.push({ deck: 'regular', rotationId: regular.snapshot.rotationId, reward: regular.rewardToGrant });
  if (overdrive.rewardToGrant) rewardsToGrant.push({ deck: 'overdrive', rotationId: overdrive.snapshot.rotationId, reward: overdrive.rewardToGrant });
  return {
    state: { ...regular.state, overdrive: overdrive.state },
    snapshot: { regular: regular.snapshot, overdrive: overdrive.snapshot },
    rewardsToGrant,
    stateChanged: regular.stateChanged || overdrive.stateChanged
  };
};

export const formatWeeklyCountdown = (endsAt: number, nowMs = Date.now()): string => {
  const remaining = Math.max(0, endsAt - nowMs);
  if (remaining === 0) return 'NEW OPERATIONS AVAILABLE';
  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  return `NEW OPERATIONS IN ${days}D ${hours}H ${mins}M`;
};
