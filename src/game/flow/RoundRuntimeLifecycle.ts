export type RoundRuntimePhase = 'ready' | 'starting' | 'active' | 'ending' | 'cleaning';
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
    return this.token();
  }

  markActive(token: RoundRuntimeToken): boolean {
    if (!this.matches(token) || this.phaseValue !== 'starting') return false;
    this.phaseValue = 'active';
    return true;
  }

  beginEnd(reason: string): RoundRuntimeToken | null {
    if (this.phaseValue === 'ready' || this.phaseValue === 'ending' || this.phaseValue === 'cleaning') return null;
    this.phaseValue = 'ending';
    this.endReasonValue = reason;
    return this.token();
  }

  beginCleanup(token: RoundRuntimeToken): boolean {
    if (!this.matches(token) || this.phaseValue !== 'ending') return false;
    this.phaseValue = 'cleaning';
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

  guard<T extends unknown[]>(generation: number, callback: (...args: T) => void): (...args: T) => void {
    return (...args: T): void => {
      if (!this.isCurrent(generation)) return;
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

  private token(): RoundRuntimeToken {
    return { generation: this.generationValue, kind: this.kindValue, label: this.labelValue };
  }

  private matches(token: RoundRuntimeToken): boolean {
    return token.generation === this.generationValue
      && token.kind === this.kindValue
      && token.label === this.labelValue;
  }
}
