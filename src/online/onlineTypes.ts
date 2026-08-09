import type { RunProtocolId } from '../game/mods/types.ts';

export type OnlineRunStatus = 'pending' | 'verified' | 'flagged' | 'rejected';
export type OnlineSubmissionState = OnlineRunStatus | 'submitted' | 'queued_offline' | 'failed';
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
  runTokenExpiresAt: number;
  status: OnlineRunStatus;
  seed: number;
  startedAt: number;
  milestoneSequence: number;
  highestRound: number;
  baseline: OnlineProgressSnapshot;
  protocol: RunProtocolId;
  equippedMods: Array<{ id: string; rank: number }>;
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
  kind: 'milestone' | 'completion';
}

export interface OnlineRunStartResult {
  ok: boolean;
  seed?: number;
  state: 'started' | 'identity_required' | 'unavailable' | 'failed';
  message: string;
}
