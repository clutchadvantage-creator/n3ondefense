export type RedlineRank = 'D' | 'C' | 'B' | 'A' | 'S';
export const REDLINE_STATES = ['BUILDING', 'BOOST', 'REDLINE', 'CRITICAL REDLINE'] as const;
export interface RedlineResult {
  score: number; rank: RedlineRank; peakRpm: number; redlineMs: number; criticalMs: number;
  longestChain: number; targetKills: number; kills: number;
}

/** Active gameplay time only. Movement alone builds the first zone; combat sustains the limiter. */
export class RedlineMomentum {
  rpm = 0;
  score = 0;
  peakRpm = 0;
  redlineMs = 0;
  criticalMs = 0;
  chain = 0;
  longestChain = 0;
  targetKills = 0;
  kills = 0;
  private elapsedMs = 0;
  private chainUntil = 0;
  get stage(): number { return this.rpm >= 90 ? 3 : this.rpm >= 70 ? 2 : this.rpm >= 40 ? 1 : 0; }
  get multiplier(): number { return [1, 1.5, 2, 3][this.stage]; }

  update(deltaMs: number, movementRatio: number, dashed: boolean, damaged: boolean): void {
    const ms = Math.max(0, Math.min(250, deltaMs)), seconds = ms / 1000;
    this.elapsedMs += ms;
    if (this.elapsedMs > this.chainUntil) this.chain = 0;
    const moving = Math.max(0, Math.min(1, movementRatio));
    const aggression = this.chain > 0;
    const gain = moving > .2 ? (aggression ? 4.5 * moving : this.rpm < 39 ? 1.5 * moving : -2) : -8;
    this.rpm = Math.max(0, Math.min(100, this.rpm + gain * seconds + (dashed ? 6 : 0) - (damaged ? 8 : 0)));
    this.peakRpm = Math.max(this.peakRpm, this.rpm);
    if (this.rpm >= 70) this.redlineMs += ms;
    if (this.rpm >= 90) this.criticalMs += ms;
    this.score = Math.max(0, this.score + (moving * 10 + (this.rpm >= 90 ? 100 : this.rpm >= 70 ? 60 : 0)) * seconds - (damaged ? 100 : 0));
  }

  kill(priority = false): void {
    this.chain = this.elapsedMs <= this.chainUntil ? this.chain + 1 : 1;
    this.chainUntil = this.elapsedMs + (priority ? 4800 : 3200);
    this.longestChain = Math.max(this.longestChain, this.chain);
    this.kills++;
    if (priority) this.targetKills++;
    this.rpm = Math.min(100, this.rpm + (priority ? 20 : 8 + Math.min(4, this.chain * .5)));
    this.peakRpm = Math.max(this.peakRpm, this.rpm);
    this.score += (100 + Math.min(150, (this.chain - 1) * 10) + (priority ? 500 : 0)) * this.multiplier;
  }

  result(): RedlineResult {
    const score = Math.floor(this.score);
    const rank: RedlineRank = score >= 12000 && this.criticalMs >= 4000 ? 'S'
      : score >= 7500 ? 'A' : score >= 3500 ? 'B' : score >= 1200 ? 'C' : 'D';
    return { score, rank, peakRpm: Math.round(this.peakRpm), redlineMs: this.redlineMs,
      criticalMs: this.criticalMs, longestChain: this.longestChain, targetKills: this.targetKills, kills: this.kills };
  }
}

export const REDLINE_REWARD_TIERS = {
  D: { rolls: 1, amountMultiplier: .65 }, C: { rolls: 2, amountMultiplier: 1 },
  B: { rolls: 2, amountMultiplier: 1.15 }, A: { rolls: 3, amountMultiplier: 1.3 },
  S: { rolls: 4, amountMultiplier: 1.5 }
} as const;
