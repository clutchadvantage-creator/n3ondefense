export type AnomalyReturnPhase = 'idle' | 'arena-sleeping' | 'return-staged' | 'restoring';

export interface AnomalyReturnLifecycleSnapshot {
  phase: AnomalyReturnPhase;
  sessionId: string | null;
}

/**
 * Small, framework-independent guard for the Arena <-> Anomaly handoff.
 *
 * Phaser scene operations are deferred, so a boolean is not enough to tell the
 * difference between "a return was requested" and "the Arena RESUME lifecycle
 * has actually fired". This state machine keeps the transition locked until
 * restoration has finished and makes duplicate exit/shutdown callbacks no-op.
 */
export class AnomalyReturnLifecycle {
  private phaseValue: AnomalyReturnPhase = 'idle';
  private sessionIdValue: string | null = null;

  get phase(): AnomalyReturnPhase { return this.phaseValue; }
  get sessionId(): string | null { return this.sessionIdValue; }
  get blocksExternalPause(): boolean { return this.phaseValue !== 'idle'; }

  begin(sessionId: string): boolean {
    if (!sessionId || this.phaseValue !== 'idle') return false;
    this.sessionIdValue = sessionId;
    this.phaseValue = 'arena-sleeping';
    return true;
  }

  stageReturn(sessionId: string): boolean {
    if (!this.matches(sessionId, 'arena-sleeping')) return false;
    this.phaseValue = 'return-staged';
    return true;
  }

  beginRestore(sessionId: string): boolean {
    if (!this.matches(sessionId, 'return-staged')) return false;
    this.phaseValue = 'restoring';
    return true;
  }

  complete(sessionId: string): boolean {
    if (!this.matches(sessionId, 'restoring')) return false;
    this.reset();
    return true;
  }

  reset(): void {
    this.phaseValue = 'idle';
    this.sessionIdValue = null;
  }

  snapshot(): AnomalyReturnLifecycleSnapshot {
    return { phase: this.phaseValue, sessionId: this.sessionIdValue };
  }

  private matches(sessionId: string, phase: AnomalyReturnPhase): boolean {
    return Boolean(sessionId) && this.phaseValue === phase && this.sessionIdValue === sessionId;
  }
}
