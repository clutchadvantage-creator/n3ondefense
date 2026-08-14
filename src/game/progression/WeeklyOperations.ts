export type WeeklyOperationStat =
  | 'enemiesDestroyed'
  | 'roundsCompleted'
  | 'bombSitesDestroyed'
  | 'highestRound'
  | 'totalCreditsEarned';

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

export interface WeeklyOperationsState {
  rotationId: string;
  startedAt: string;
  baselines: Record<WeeklyOperationStat, number>;
  rewardClaimed: boolean;
}

export interface WeeklyOperationObjectiveView extends WeeklyOperationDefinition {
  current: number;
  complete: boolean;
}

export interface WeeklyOperationsSnapshot {
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

const finiteCounter = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export const createWeeklyBaselines = (progress?: Partial<WeeklyOperationProgressSource>): Record<WeeklyOperationStat, number> => ({
  enemiesDestroyed: finiteCounter(progress?.enemiesDestroyed),
  roundsCompleted: finiteCounter(progress?.roundsCompleted),
  bombSitesDestroyed: finiteCounter(progress?.bombSitesDestroyed),
  highestRound: finiteCounter(progress?.highestRound),
  totalCreditsEarned: finiteCounter(progress?.totalCreditsEarned)
});

export const createDefaultWeeklyOperationsState = (): WeeklyOperationsState => ({
  rotationId: '',
  startedAt: '',
  baselines: createWeeklyBaselines(),
  rewardClaimed: false
});

export const normalizeWeeklyOperationsState = (value: unknown): WeeklyOperationsState => {
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

export const getWeeklyRotationSlot = (nowMs = Date.now()): { index: number; startsAt: number; endsAt: number } => {
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const index = Math.floor((safeNow - WEEKLY_EPOCH_MS) / WEEK_MS);
  const startsAt = WEEKLY_EPOCH_MS + index * WEEK_MS;
  return { index, startsAt, endsAt: startsAt + WEEK_MS };
};

export const resolveWeeklyOperations = (
  progress: WeeklyOperationProgressSource,
  storedState: WeeklyOperationsState,
  nowMs = Date.now()
): WeeklyOperationsResolution => {
  const slot = getWeeklyRotationSlot(nowMs);
  const rotation = WEEKLY_OPERATION_ROTATIONS[((slot.index % WEEKLY_OPERATION_ROTATIONS.length) + WEEKLY_OPERATION_ROTATIONS.length) % WEEKLY_OPERATION_ROTATIONS.length];
  const rotationId = `${slot.index}:${rotation.id}`;
  const normalized = normalizeWeeklyOperationsState(storedState);
  const rotated = normalized.rotationId !== rotationId;
  const state: WeeklyOperationsState = rotated
    ? {
      rotationId,
      startedAt: new Date(slot.startsAt).toISOString(),
      baselines: createWeeklyBaselines(progress),
      rewardClaimed: false
    }
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
    snapshot: {
      rotationId,
      endsAt: slot.endsAt,
      objectives,
      reward: { ...rotation.reward },
      complete,
      rewardClaimed: state.rewardClaimed
    },
    rewardToGrant: shouldGrant ? { ...rotation.reward } : null,
    stateChanged: rotated || shouldGrant
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
