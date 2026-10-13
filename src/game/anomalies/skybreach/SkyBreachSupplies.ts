import { SeededRandom } from '../../systems/SeededRandom.ts';

export type FlightResource = 'health' | 'energy';
export interface FlightSupplyState {
  health: number; energy: number;
  missingHealth: number; missingEnergy: number;
}

/** Active mission time, independent of frame rate and unrelated combat RNG. */
export class SkyBreachSupplies {
  private readonly random: SeededRandom;
  private nextAt: number;
  private lastDropAt = -10_000;
  private lastHealthAt = -10_000;
  private criticalSince = -1;
  private criticalDelay = 0;
  constructor(seed: number) {
    this.random = new SeededRandom(seed ^ 0x5a991e);
    this.nextAt = 8_000 + this.random.next() * 5_000;
  }
  private available(kind: FlightResource, state: FlightSupplyState): boolean {
    return state[kind] < 1 && state.health + state.energy < 2;
  }
  private schedule(now: number, state: FlightSupplyState): void {
    const need = Math.max(state.missingHealth, state.missingEnergy);
    this.lastDropAt = now;
    // 12–20 seconds normally, 9–17 when a resource is critically low.
    this.nextAt = now + 12_000 + this.random.next() * 8_000 - Math.min(1, Math.max(0, need)) * 3_000;
  }
  acceptEnemyDrop(kind: FlightResource, now: number, state: FlightSupplyState): boolean {
    const critical = kind === 'health' && state.missingHealth >= .65;
    if (!this.available(kind, state) || (critical
      ? now - this.lastHealthAt < 4_500 || now - this.lastDropAt < 1_800
      : now - this.lastDropAt < 8_000)) return false;
    if (kind === 'health') this.lastHealthAt = now;
    const ambientAt = this.nextAt;
    this.schedule(now, state);
    if (critical) this.nextAt = Math.min(ambientAt, this.nextAt);
    return true;
  }
  /** Additional kill roll: rises from 8% at 75% HP to 50% at 25% HP.
   * Uses the same on-screen cap and cooldown as ordinary resource drops. */
  healthFromEnemy(now: number, state: FlightSupplyState, pickupMultiplier = 1): boolean {
    if (state.missingHealth < .25 || !this.available('health', state)) return false;
    const need = Math.min(1, (state.missingHealth - .25) / .5);
    const chance = Math.min(.65, (.08 + need * .42) * Math.max(1, pickupMultiplier));
    return this.random.next() < chance && this.acceptEnemyDrop('health', now, state);
  }
  next(now: number, state: FlightSupplyState, recovery = false): FlightResource | null {
    // A short critical-health drought gets a reachable supply even during a boss
    // phase with no kills. Energy drops cannot postpone this health clock.
    if (state.missingHealth >= .65 && state.health === 0) {
      if (this.criticalSince < 0) {
        this.criticalSince = now;
        this.criticalDelay = 4_000 + this.random.next() * 2_000;
      }
      if (now - this.criticalSince >= this.criticalDelay && now - this.lastHealthAt >= 6_500
        && now - this.lastDropAt >= 1_800 && this.available('health', state)) {
        this.lastHealthAt = now; this.criticalSince = -1;
        const ambientAt = this.nextAt;
        this.schedule(now, state);
        this.nextAt = Math.min(ambientAt, this.nextAt);
        return 'health';
      }
    } else this.criticalSince = -1;
    // Recovery sectors can offer a supply when the screen is empty, never a refill.
    const recoveryDue = recovery && state.health + state.energy === 0 && now - this.lastDropAt >= 10_000;
    if ((now < this.nextAt && !recoveryDue) || now - this.lastDropAt < 1_800) return null;
    const health = this.available('health', state), energy = this.available('energy', state);
    if (!health && !energy) {
      this.nextAt = now + 2_000;
      return null;
    }
    const healthWeight = .4 + Math.max(0, Math.min(1, state.missingHealth)) * 1.6;
    const energyWeight = .4 + Math.max(0, Math.min(1, state.missingEnergy)) * 1.6;
    const kind = !health ? 'energy' : !energy ? 'health'
      : this.random.next() < healthWeight / (healthWeight + energyWeight) ? 'health' : 'energy';
    if (kind === 'health') this.lastHealthAt = now;
    this.schedule(now, state);
    return kind;
  }
}
