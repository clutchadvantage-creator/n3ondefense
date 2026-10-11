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
    if (now - this.lastDropAt < 8_000 || !this.available(kind, state)) return false;
    this.schedule(now, state);
    return true;
  }
  next(now: number, state: FlightSupplyState, recovery = false): FlightResource | null {
    // Recovery sectors can offer a supply when the screen is empty, never a refill.
    const recoveryDue = recovery && state.health + state.energy === 0 && now - this.lastDropAt >= 10_000;
    if (now < this.nextAt && !recoveryDue) return null;
    const health = this.available('health', state), energy = this.available('energy', state);
    if (!health && !energy) {
      this.nextAt = now + 2_000;
      return null;
    }
    const healthWeight = .4 + Math.max(0, Math.min(1, state.missingHealth)) * 1.6;
    const energyWeight = .4 + Math.max(0, Math.min(1, state.missingEnergy)) * 1.6;
    const kind = !health ? 'energy' : !energy ? 'health'
      : this.random.next() < healthWeight / (healthWeight + energyWeight) ? 'health' : 'energy';
    this.schedule(now, state);
    return kind;
  }
}
