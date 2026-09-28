import { ANOMALY_SCHEDULING } from './AnomalyRegistry.ts';

/** Remaining eligible gameplay time, carried by the current deployment only. */
export const normalizeAnomalyOpportunityMs = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, ANOMALY_SCHEDULING.cooldownMs) : undefined;

export class AnomalyOpportunityClock {
  private remainingMs: number;

  constructor(initialDelayMs: number, carriedDelayMs?: number) {
    this.remainingMs = normalizeAnomalyOpportunityMs(carriedDelayMs) ?? initialDelayMs;
  }

  advance(deltaMs: number, eligible: boolean): void {
    if (eligible && Number.isFinite(deltaMs) && deltaMs > 0)
      this.remainingMs = Math.max(0, this.remainingMs - Math.min(deltaMs, 250));
  }

  defer(delayMs: number): void { this.remainingMs = delayMs; }
  get ready(): boolean { return this.remainingMs === 0; }
  get snapshot(): number { return this.remainingMs; }
}
