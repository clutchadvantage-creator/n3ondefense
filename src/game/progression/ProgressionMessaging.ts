import type { ArenaReward } from '../types.ts';

export const INITIAL_DEPLOYMENT_MAX_ROUND = 5;

export interface InitialDeploymentProfileState {
  seen: boolean;
  highestRound: number;
}

export const shouldShowInitialDeploymentBriefing = (
  result: Pick<ArenaReward, 'reason' | 'round' | 'highestRound' | 'runDurationMs' | 'runCreditsEarned'> | undefined,
  profile: InitialDeploymentProfileState
): boolean => {
  if (!result || profile.seen || result.reason === 'victory') return false;

  const reachedRound = Math.max(0, Math.floor(result.round ?? result.highestRound));
  const meaningfulDeployment = reachedRound >= 2 || result.runDurationMs >= 45_000 || result.runCreditsEarned > 0;
  return meaningfulDeployment
    && reachedRound >= 1
    && reachedRound <= INITIAL_DEPLOYMENT_MAX_ROUND
    && profile.highestRound <= INITIAL_DEPLOYMENT_MAX_ROUND;
};
