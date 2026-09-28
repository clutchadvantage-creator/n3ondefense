import { SeededRandom } from '../systems/SeededRandom.ts';
import type { ArcadeEventId } from './types.ts';
import type { AnomalyId } from '../anomalies/types.ts';

export type WorldEventChoice = { kind: 'arcade'; id: ArcadeEventId } | { kind: 'anomaly'; id: AnomalyId };
export interface WorldEventRotationState {
  remainingMs: number;
  drawIndex: number;
  pending?: string;
}

// Common pacing for every entry. No mode/round odds and no extra portal roll.
export const WORLD_EVENT_TIMING = { initialMinimumMs: 28_000, initialMaximumMs: 52_000,
  cooldownMs: 105_000, placementRetryMs: 1_000 } as const;

export const normalizeWorldEventRotation = (value: unknown): WorldEventRotationState | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const state = value as Partial<WorldEventRotationState>;
  if (!Number.isFinite(state.remainingMs) || state.remainingMs! < 0
    || !Number.isSafeInteger(state.drawIndex) || state.drawIndex! < 0) return undefined;
  return { remainingMs: Math.min(state.remainingMs!, WORLD_EVENT_TIMING.cooldownMs),
    drawIndex: state.drawIndex! >>> 0,
    pending: typeof state.pending === 'string' ? state.pending : undefined };
};

export const chooseWorldEvent = (pool: readonly WorldEventChoice[], roll: number): WorldEventChoice | undefined =>
  pool[Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(1, roll)) * pool.length))];

const key = (choice: WorldEventChoice): string => `${choice.kind}:${choice.id}`;

/** One deployment-owned scheduler; controllers own only their live event. */
export class WorldEventRotation {
  private state: WorldEventRotationState;
  private readonly seed: number;
  private readonly pool: readonly WorldEventChoice[];

  constructor(seed: number, pool: readonly WorldEventChoice[], carried?: WorldEventRotationState) {
    this.seed = seed;
    this.pool = pool;
    this.state = normalizeWorldEventRotation(carried) ?? { remainingMs: 0, drawIndex: 0 };
    if (!normalizeWorldEventRotation(carried)) this.state.remainingMs = WORLD_EVENT_TIMING.initialMinimumMs
      + this.roll() * (WORLD_EVENT_TIMING.initialMaximumMs - WORLD_EVENT_TIMING.initialMinimumMs);
    if (!pool.some(choice => key(choice) === this.state.pending)) this.state.pending = undefined;
  }

  update(deltaMs: number, eligible: boolean, active: boolean, start: (choice: WorldEventChoice) => boolean): void {
    if (!eligible || active || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.state.remainingMs = Math.max(0, this.state.remainingMs - Math.min(deltaMs, 250));
    if (this.state.remainingMs > 0) return;
    const choice = this.pool.find(candidate => key(candidate) === this.state.pending) ?? chooseWorldEvent(this.pool, this.roll());
    if (!choice) return;
    // Keep a selected event when its safe placement is temporarily blocked.
    // Rerolling here would bias the pool against events with larger footprints.
    this.state.pending = key(choice);
    if (start(choice)) {
      this.state.pending = undefined;
      this.state.remainingMs = WORLD_EVENT_TIMING.cooldownMs;
    } else this.state.remainingMs = WORLD_EVENT_TIMING.placementRetryMs;
  }

  get snapshot(): WorldEventRotationState { return { ...this.state }; }

  private roll(): number {
    const random = new SeededRandom((this.seed ^ Math.imul(++this.state.drawIndex, 0x9e3779b1) ^ 0x7a11cade) >>> 0);
    random.next(); random.next();
    return random.next();
  }
}
