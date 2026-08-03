import { SaveSystem } from '../game/systems/SaveSystem';
import { LeaderboardClient } from './LeaderboardClient';
import { OnlineCredentialStore } from './OnlineCredentialStore';
import { PendingSubmissionQueue } from './PendingSubmissionQueue';
import type { OnlineProgressSnapshot, OnlineRunContext } from './onlineTypes';

const ACTIVE_RUN_KEY = 'n3on-defense.online.active-run';
const LAST_STATUS_KEY = 'n3on-defense.online.last-submission-status';

const delta = (current: OnlineProgressSnapshot, baseline: OnlineProgressSnapshot) => ({
  rounds_completed: Math.max(0, current.roundsCompleted - baseline.roundsCompleted),
  enemies_destroyed: Math.max(0, current.enemiesDestroyed - baseline.enemiesDestroyed),
  bomb_sites_destroyed: Math.max(0, current.bombSitesDestroyed - baseline.bombSitesDestroyed),
  credits_earned: Math.max(0, current.totalCreditsEarned - baseline.totalCreditsEarned)
});

export class OnlineRunManager {
  private static profileId: string | null = null;
  private static active: OnlineRunContext | null = OnlineRunManager.loadActive();
  private static flushing = false;

  static {
    window.addEventListener('online', () => { void OnlineRunManager.flushQueue(); });
  }

  static async beginRun(profileId: string, displayName: string): Promise<number | null> {
    this.clearActive();
    this.profileId = profileId;
    if (!LeaderboardClient.configured()) return null;
    try {
      const credentials = await LeaderboardClient.ensureIdentity(profileId, displayName);
      const issued = await LeaderboardClient.startRun(credentials);
      this.active = {
        runId: issued.run_id,
        runToken: issued.run_token,
        seed: issued.seed,
        startedAt: Date.now(),
        milestoneSequence: 0,
        highestRound: 0,
        baseline: SaveSystem.getOnlineProgressSnapshot()
      };
      this.persistActive();
      void this.flushQueue();
      return issued.seed;
    } catch {
      this.clearActive();
      return null;
    }
  }

  static recordMilestone(highestRound: number): void {
    if (!this.active) return;
    this.active.highestRound = Math.max(this.active.highestRound, highestRound);
    this.active.milestoneSequence += 1;
    const progress = delta(SaveSystem.getOnlineProgressSnapshot(), this.active.baseline);
    this.enqueue(`/v1/runs/${this.active.runId}/milestones`, {
      sequence: this.active.milestoneSequence,
      highest_round: this.active.highestRound,
      ...progress,
      elapsed_ms: Date.now() - this.active.startedAt
    });
    this.persistActive();
    void this.flushQueue();
  }

  static complete(outcome: 'victory' | 'player_dead' | 'bomb_defused' | 'quit', highestRound?: number): void {
    if (!this.active) return;
    this.active.highestRound = Math.max(this.active.highestRound, highestRound ?? 0);
    const progress = delta(SaveSystem.getOnlineProgressSnapshot(), this.active.baseline);
    this.enqueue(`/v1/runs/${this.active.runId}/complete`, {
      idempotency_key: `${this.active.runId}-complete`,
      outcome,
      highest_round: this.active.highestRound,
      ...progress,
      elapsed_ms: Date.now() - this.active.startedAt
    });
    this.clearActive();
    void this.flushQueue();
  }

  static pendingCount(): number { return PendingSubmissionQueue.count(); }
  static isOnlineRunActive(): boolean { return Boolean(this.active); }
  static lastSubmissionStatus(): string | null {
    try { return localStorage.getItem(LAST_STATUS_KEY); } catch { return null; }
  }

  static async flushQueue(): Promise<void> {
    if (this.flushing || !navigator.onLine || !LeaderboardClient.configured()) return;
    this.flushing = true;
    try {
      for (const item of PendingSubmissionQueue.due()) {
        const credentials = OnlineCredentialStore.load(item.profileId);
        if (!credentials) {
          PendingSubmissionQueue.retry(item.id);
          continue;
        }
        try {
          const result = await LeaderboardClient.submit(item.path, credentials, item.runToken, item.body);
          try { localStorage.setItem(LAST_STATUS_KEY, result.status); } catch { /* no-op */ }
          PendingSubmissionQueue.remove(item.id);
        } catch {
          PendingSubmissionQueue.retry(item.id);
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private static enqueue(path: string, body: Record<string, unknown>): void {
    if (!this.active || !this.profileId) return;
    PendingSubmissionQueue.add({
      profileId: this.profileId,
      runId: this.active.runId,
      runToken: this.active.runToken,
      path,
      body
    });
  }

  private static persistActive(): void {
    try {
      if (this.active) sessionStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify({ ...this.active, profileId: this.profileId }));
    } catch { /* no-op */ }
  }

  private static loadActive(): OnlineRunContext | null {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(ACTIVE_RUN_KEY) ?? 'null') as (OnlineRunContext & { profileId?: string }) | null;
      if (!parsed || typeof parsed.runId !== 'string' || typeof parsed.runToken !== 'string') return null;
      this.profileId = parsed.profileId ?? null;
      return parsed;
    } catch { return null; }
  }

  private static clearActive(): void {
    this.active = null;
    try { sessionStorage.removeItem(ACTIVE_RUN_KEY); } catch { /* no-op */ }
  }
}
