import { SaveSystem } from '../game/systems/SaveSystem';
import { LeaderboardClient, OnlineApiError } from './LeaderboardClient';
import { OnlineCredentialStore } from './OnlineCredentialStore';
import { PendingSubmissionQueue } from './PendingSubmissionQueue';
import type { OnlineProgressSnapshot, OnlineRunContext, OnlineRunStartResult, OnlineRunStatus } from './onlineTypes';
import type { EquippedModSnapshot, RunProtocolId } from '../game/mods/types.ts';

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
  private static initializedProfiles = new Set<string>();

  static {
    window.addEventListener('online', () => { void OnlineRunManager.flushQueue(); });
  }

  static async initializeIdentity(profileId: string): Promise<'connected' | 'none' | 'expired' | 'unavailable'> {
    const stored = OnlineCredentialStore.load(profileId);
    if (!stored) return 'none';
    if (this.initializedProfiles.has(profileId)) return 'connected';
    try {
      await LeaderboardClient.restoreIdentity(profileId);
      this.initializedProfiles.add(profileId);
      return 'connected';
    } catch (error) {
      return error instanceof OnlineApiError && error.invalidCredential ? 'expired' : 'unavailable';
    }
  }

  static async beginRun(profileId: string, displayName: string, protocol: RunProtocolId = 'normal', equippedMods: EquippedModSnapshot[] = []): Promise<OnlineRunStartResult> {
    this.clearActive();
    this.profileId = profileId;
    if (!LeaderboardClient.configured()) return { ok: false, state: 'unavailable', message: 'Online service is not configured.' };
    try {
      const credentials = await LeaderboardClient.ensureIdentity(profileId, displayName);
      const issued = await LeaderboardClient.startRun(credentials);
      this.active = {
        runId: issued.run_id,
        runToken: issued.run_token,
        runTokenExpiresAt: Date.now() + issued.run_token_expires_in_seconds * 1000,
        status: issued.status,
        seed: issued.seed,
        startedAt: Date.now(),
        milestoneSequence: 0,
        highestRound: 0,
        baseline: SaveSystem.getOnlineProgressSnapshot(),
        protocol,
        equippedMods
      };
      this.persistActive();
      void this.flushQueue();
      this.setStatus('pending');
      return { ok: true, seed: issued.seed, state: 'started', message: 'Server-authorized online run created.' };
    } catch (error) {
      this.clearActive();
      const invalid = error instanceof OnlineApiError && error.invalidCredential;
      return {
        ok: false,
        state: invalid ? 'identity_required' : error instanceof OnlineApiError && error.retryable ? 'unavailable' : 'failed',
        message: invalid ? 'Online identity expired. Reconnect and try again.' : 'Online run creation failed. No online run was started.'
      };
    }
  }

  static recordMilestone(highestRound: number): void {
    if (!this.active) return;
    this.active.highestRound = Math.max(this.active.highestRound, highestRound);
    this.active.milestoneSequence += 1;
    const progress = delta(SaveSystem.getOnlineProgressSnapshot(), this.active.baseline);
    this.enqueue('milestone', `/v1/runs/${this.active.runId}/milestones`, {
      sequence: this.active.milestoneSequence,
      highest_round: this.active.highestRound,
      ...progress,
      elapsed_ms: Date.now() - this.active.startedAt,
      protocol: this.active.protocol,
      equipped_mods: this.active.equippedMods
    });
    this.persistActive();
    void this.flushQueue();
  }

  static complete(outcome: 'victory' | 'player_dead' | 'bomb_defused' | 'quit', highestRound?: number): void {
    if (!this.active) return;
    this.active.highestRound = Math.max(this.active.highestRound, highestRound ?? 0);
    const progress = delta(SaveSystem.getOnlineProgressSnapshot(), this.active.baseline);
    this.enqueue('completion', `/v1/runs/${this.active.runId}/complete`, {
      idempotency_key: `${this.active.runId}-complete`,
      outcome,
      highest_round: this.active.highestRound,
      ...progress,
      elapsed_ms: Date.now() - this.active.startedAt,
      protocol: this.active.protocol,
      equipped_mods: this.active.equippedMods
    });
    this.setStatus(navigator.onLine ? 'submitted' : 'queued_offline');
    this.clearActive();
    void this.flushQueue();
  }

  static pendingCount(): number { return PendingSubmissionQueue.count(); }
  static isOnlineRunActive(): boolean { return Boolean(this.active); }
  static beginLocalRun(): void { this.clearActive(); this.setStatus('local'); }
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
          this.setStatus('failed');
          PendingSubmissionQueue.remove(item.id);
          continue;
        }
        try {
          const result = await LeaderboardClient.submit(item.path, credentials, item.runToken, item.body);
          this.setStatus(result.status as OnlineRunStatus);
          PendingSubmissionQueue.remove(item.id);
        } catch (error) {
          if (error instanceof OnlineApiError && !error.retryable) {
            this.setStatus('failed');
            PendingSubmissionQueue.remove(item.id);
          } else {
            this.setStatus('queued_offline');
            PendingSubmissionQueue.retry(item.id);
          }
        }
      }
    } finally {
      this.flushing = false;
      if (PendingSubmissionQueue.due().length > 0) void this.flushQueue();
    }
  }

  private static enqueue(kind: 'milestone' | 'completion', path: string, body: Record<string, unknown>): void {
    if (!this.active || !this.profileId) return;
    PendingSubmissionQueue.add({
      profileId: this.profileId,
      runId: this.active.runId,
      runToken: this.active.runToken,
      path,
      body,
      kind
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
      return {
        ...parsed,
        protocol: parsed.protocol === 'overdrive' ? 'overdrive' : 'normal',
        equippedMods: Array.isArray(parsed.equippedMods) ? parsed.equippedMods : []
      };
    } catch { return null; }
  }

  private static clearActive(): void {
    this.active = null;
    try { sessionStorage.removeItem(ACTIVE_RUN_KEY); } catch { /* no-op */ }
  }

  private static setStatus(status: string): void {
    try { localStorage.setItem(LAST_STATUS_KEY, status); } catch { /* no-op */ }
  }
}
