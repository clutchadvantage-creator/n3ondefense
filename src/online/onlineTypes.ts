export type OnlineRunStatus = 'pending' | 'verified' | 'flagged' | 'rejected';
export type OnlineLeaderboardCategory = 'highest_round' | 'enemies_destroyed' | 'bomb_sites_destroyed';

export interface OnlineCredentials {
  profileId: string;
  publicId: string;
  displayName: string;
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
}

export interface OnlineRunContext {
  runId: string;
  runToken: string;
  seed: number;
  startedAt: number;
  milestoneSequence: number;
  highestRound: number;
  baseline: OnlineProgressSnapshot;
}

export interface OnlineProgressSnapshot {
  roundsCompleted: number;
  enemiesDestroyed: number;
  bombSitesDestroyed: number;
  totalCreditsEarned: number;
}

export interface OnlineLeaderboardEntry {
  rank: number;
  public_player_id: string;
  display_name: string;
  value: number;
  run_id: string;
}

export interface QueuedSubmission {
  id: string;
  profileId: string;
  runId: string;
  runToken: string;
  path: string;
  body: Record<string, unknown>;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
}
