import { SeededRandom } from '../../systems/SeededRandom.ts';

/** Supplies arrive ahead of the operative and within one short lateral move.
 * Offscreen kills cannot reserve a scarce slot at an unreachable location. */
export function flightSupplyPosition(x: number, y: number, playerX: number, playerY: number,
  speed: number, width: number, height: number): { x: number; y: number } {
  const reach = Math.max(140, Math.min(240, speed * .65));
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi,v));
  return { x:clamp(x,Math.max(80,playerX-reach),Math.min(width-80,playerX+reach)),
    y:clamp(y,Math.max(150,playerY-240),Math.max(150,Math.min(height-100,playerY-100))) };
}

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
  private lastEnergyAt = -10_000;
  private energyCriticalSince = -1;
  private energyCriticalDelay = 0;
  readonly tempo: number;
  private criticalSince = -1;
  private criticalDelay = 0;
  constructor(seed: number, spawnCadence = 1) {
    this.random = new SeededRandom(seed ^ 0x5a991e);
    // Follow the encounter's actual spawn cadence, bounded to a 40% supply bump.
    this.tempo = Math.max(1, Math.min(1.4, 1 / Math.max(.01, spawnCadence)));
    this.nextAt = 8_000 + this.random.next() * 5_000;
  }
  private available(kind: FlightResource, state: FlightSupplyState): boolean {
    return state[kind] < 1 && state.health + state.energy < 2;
  }
  private schedule(now: number, state: FlightSupplyState): void {
    const need = Math.max(state.missingHealth, state.missingEnergy);
    this.lastDropAt = now;
    // 12–20 seconds normally, 9–17 when a resource is critically low.
    this.nextAt = now + (12_000 + this.random.next() * 8_000 - Math.min(1, Math.max(0, need)) * 3_000) / this.tempo;
  }
  acceptEnemyDrop(kind: FlightResource, now: number, state: FlightSupplyState): boolean {
    const critical = kind === 'health' && state.missingHealth >= .65;
    const lastKindAt = kind === 'health' ? this.lastHealthAt : this.lastEnergyAt;
    if (!this.available(kind, state) || now - this.lastDropAt < 1_800
      || now - lastKindAt < (critical ? 4_500 : 8_000) / this.tempo) return false;
    // Preserve the original moderate Normal cadence; split the shared clock
    // only for higher encounter pressure or genuine critical resource need.
    if (!critical && state.missingEnergy < .7 && this.tempo === 1 && now - this.lastDropAt < 8_000) return false;
    if (kind === 'health') this.lastHealthAt = now;
    else this.lastEnergyAt = now;
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
  energyFromEnemy(now: number, state: FlightSupplyState, pickupMultiplier = 1): boolean {
    if (state.missingEnergy < .5 || !this.available('energy', state)) return false;
    const need = Math.min(1, (state.missingEnergy - .5) / .4);
    return this.random.next() < Math.min(.4, (.05 + need * .25) * Math.max(1, pickupMultiplier))
      && this.acceptEnemyDrop('energy', now, state);
  }
  next(now: number, state: FlightSupplyState, recovery = false): FlightResource | null {
    // A short critical-health drought gets a reachable supply even during a boss
    // phase with no kills. Energy drops cannot postpone this health clock.
    if (state.missingHealth >= .65 && state.health === 0) {
      if (this.criticalSince < 0) {
        this.criticalSince = now;
        this.criticalDelay = (4_000 + this.random.next() * 2_000) / this.tempo;
      }
      if (now - this.criticalSince >= this.criticalDelay && now - this.lastHealthAt >= 6_500 / this.tempo
        && now - this.lastDropAt >= 1_800 && this.available('health', state)) {
        this.lastHealthAt = now; this.criticalSince = -1;
        const ambientAt = this.nextAt;
        this.schedule(now, state);
        this.nextAt = Math.min(ambientAt, this.nextAt);
        return 'health';
      }
    } else this.criticalSince = -1;
    // Independent low-energy clock: health kills must not starve ability fuel.
    if (state.missingEnergy >= .7 && state.energy === 0) {
      if (this.energyCriticalSince < 0) {
        this.energyCriticalSince = now;
        this.energyCriticalDelay = (7_000 + this.random.next() * 2_000) / this.tempo;
      }
      if (now - this.energyCriticalSince >= this.energyCriticalDelay
        && now - this.lastEnergyAt >= 8_000 / this.tempo && now - this.lastDropAt >= 1_800
        && this.available('energy', state)) {
        this.lastEnergyAt = now; this.energyCriticalSince = -1;
        this.lastDropAt = now;
        return 'energy';
      }
    } else this.energyCriticalSince = -1;
    // Recovery sectors can offer a supply when the screen is empty, never a refill.
    const recoveryDue = recovery && state.health + state.energy === 0 && now - this.lastDropAt >= 10_000;
    if ((now < this.nextAt && !recoveryDue) || now - this.lastDropAt < 1_800) return null;
    const health = this.available('health', state) && now - this.lastHealthAt >= 4_500 / this.tempo;
    const energy = this.available('energy', state) && now - this.lastEnergyAt >= 8_000 / this.tempo;
    if (!health && !energy) {
      this.nextAt = now + 2_000;
      return null;
    }
    const healthWeight = .4 + Math.max(0, Math.min(1, state.missingHealth)) * 1.6;
    const energyWeight = .4 + Math.max(0, Math.min(1, state.missingEnergy)) * 1.6;
    const kind = !health ? 'energy' : !energy ? 'health'
      : this.random.next() < healthWeight / (healthWeight + energyWeight) ? 'health' : 'energy';
    if (kind === 'health') this.lastHealthAt = now;
    else this.lastEnergyAt = now;
    this.schedule(now, state);
    return kind;
  }
}
