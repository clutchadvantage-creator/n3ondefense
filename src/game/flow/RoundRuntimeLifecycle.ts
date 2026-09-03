export type RoundRuntimePhase = 'ready' | 'starting' | 'active' | 'end-requested' | 'rewarding' | 'cleaning';
export type RoundRuntimeKind = 'round' | 'boss';

export interface RoundRuntimeToken {
  generation: number;
  kind: RoundRuntimeKind;
  label: string;
}

export interface RoundRuntimeLifecycleSnapshot extends RoundRuntimeToken {
  phase: RoundRuntimePhase;
  endReason: string | null;
}

export interface RoundRuntimeLifecycleDiagnostics {
  starts: number;
  activations: number;
  endRequests: number;
  rewardFlows: number;
  cleanups: number;
  rejectedGameplayCallbacks: number;
  rejectedHandoffCallbacks: number;
}

/**
 * Framework-independent ownership gate for Arena round runtime.
 *
 * One generation represents exactly one ordinary or boss encounter. Deferred
 * work captures that generation and is rejected as soon as its encounter
 * begins ending. HEIST does not advance this state because it sleeps and later
 * restores the same live Arena generation.
 */
export class RoundRuntimeLifecycle {
  private phaseValue: RoundRuntimePhase = 'ready';
  private generationValue = 0;
  private kindValue: RoundRuntimeKind = 'round';
  private labelValue = 'none';
  private endReasonValue: string | null = null;
  private starts = 0;
  private activations = 0;
  private endRequests = 0;
  private rewardFlows = 0;
  private cleanups = 0;
  private rejectedGameplayCallbacks = 0;
  private rejectedHandoffCallbacks = 0;

  get phase(): RoundRuntimePhase { return this.phaseValue; }
  get generation(): number { return this.generationValue; }
  get hasRuntime(): boolean { return this.phaseValue !== 'ready'; }

  beginStart(kind: RoundRuntimeKind, label: string): RoundRuntimeToken {
    if (this.phaseValue !== 'ready') {
      throw new Error(`Cannot start ${kind} ${label}; generation ${this.generationValue} is ${this.phaseValue}.`);
    }
    this.generationValue += 1;
    this.kindValue = kind;
    this.labelValue = label;
    this.endReasonValue = null;
    this.phaseValue = 'starting';
    this.starts += 1;
    return this.token();
  }

  markActive(token: RoundRuntimeToken): boolean {
    if (!this.matches(token) || this.phaseValue !== 'starting') return false;
    this.phaseValue = 'active';
    this.activations += 1;
    return true;
  }

  /**
   * Locks gameplay work as soon as an encounter outcome is known while still
   * allowing the owned reward/presentation handoff to finish. This closes the
   * old window where combat timers and deferred spawns remained valid during
   * boss loot and premium Mod reveals.
   */
  requestEnd(reason: string): RoundRuntimeToken | null {
    if (this.phaseValue !== 'active' && this.phaseValue !== 'starting') return null;
    this.phaseValue = 'end-requested';
    this.endReasonValue = reason;
    this.endRequests += 1;
    return this.token();
  }

  /** Backward-compatible name for callers/tests that end without rewards. */
  beginEnd(reason: string): RoundRuntimeToken | null { return this.requestEnd(reason); }

  beginRewardFlow(token: RoundRuntimeToken): boolean {
    if (!this.matches(token) || this.phaseValue !== 'end-requested') return false;
    this.phaseValue = 'rewarding';
    this.rewardFlows += 1;
    return true;
  }

  /**
   * The sole teardown claim. It accepts a live encounter (quit/replacement)
   * or one already locked by completion/reward handling, and is idempotent.
   */
  claimCleanup(reason: string): RoundRuntimeToken | null {
    if (this.phaseValue === 'ready' || this.phaseValue === 'cleaning') return null;
    if (this.phaseValue === 'active' || this.phaseValue === 'starting') {
      this.phaseValue = 'end-requested';
      this.endReasonValue = reason;
      this.endRequests += 1;
    }
    const token = this.token();
    this.phaseValue = 'cleaning';
    this.cleanups += 1;
    return token;
  }

  beginCleanup(token: RoundRuntimeToken): boolean {
    if (!this.matches(token) || (this.phaseValue !== 'end-requested' && this.phaseValue !== 'rewarding')) return false;
    this.phaseValue = 'cleaning';
    this.cleanups += 1;
    return true;
  }

  finishCleanup(token: RoundRuntimeToken): boolean {
    if (!this.matches(token) || this.phaseValue !== 'cleaning') return false;
    this.phaseValue = 'ready';
    return true;
  }

  /** True only while the captured generation still owns active gameplay. */
  isCurrent(generation: number): boolean {
    return this.phaseValue === 'active' && generation === this.generationValue;
  }

  /** Reward/UI handoff work may continue after gameplay has been locked. */
  isCurrentHandoff(generation: number): boolean {
    return generation === this.generationValue
      && (this.phaseValue === 'active' || this.phaseValue === 'end-requested' || this.phaseValue === 'rewarding');
  }

  guard<T extends unknown[]>(generation: number, callback: (...args: T) => void): (...args: T) => void {
    return (...args: T): void => {
      if (!this.isCurrent(generation)) {
        this.rejectedGameplayCallbacks += 1;
        return;
      }
      callback(...args);
    };
  }

  guardHandoff<T extends unknown[]>(generation: number, callback: (...args: T) => void): (...args: T) => void {
    return (...args: T): void => {
      if (!this.isCurrentHandoff(generation)) {
        this.rejectedHandoffCallbacks += 1;
        return;
      }
      callback(...args);
    };
  }

  /** Emergency reference reset for framework shutdown after its plugins died. */
  abandon(): void {
    this.phaseValue = 'ready';
    this.endReasonValue = 'framework-shutdown';
  }

  snapshot(): RoundRuntimeLifecycleSnapshot {
    return {
      phase: this.phaseValue,
      generation: this.generationValue,
      kind: this.kindValue,
      label: this.labelValue,
      endReason: this.endReasonValue
    };
  }

  diagnostics(): RoundRuntimeLifecycleDiagnostics {
    return {
      starts: this.starts,
      activations: this.activations,
      endRequests: this.endRequests,
      rewardFlows: this.rewardFlows,
      cleanups: this.cleanups,
      rejectedGameplayCallbacks: this.rejectedGameplayCallbacks,
      rejectedHandoffCallbacks: this.rejectedHandoffCallbacks
    };
  }

  private token(): RoundRuntimeToken {
    return { generation: this.generationValue, kind: this.kindValue, label: this.labelValue };
  }

  private matches(token: RoundRuntimeToken): boolean {
    return token.generation === this.generationValue
      && token.kind === this.kindValue
      && token.label === this.labelValue;
  }
}
