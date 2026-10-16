import { SeededRandom } from '../../systems/SeededRandom.ts';
import { TEMPORARY_AMMO_BALANCE } from '../../player/TemporaryAmmoMode.ts';

export type FlightAmmo = 'grenadeRounds' | 'scattershot';
export interface FlightAmmoState { onScreen: number; activeRemainingMs: number; activeKind?: FlightAmmo | null }

/** One offered ammo pickup, paced against the existing 45-second ammo lifetime.
 * Repeats wait for the closing quarter; a different type may be offered sooner.
 * Long-duration Mods must not lock the other ammunition out of a whole fight. */
export class SkyBreachAmmoSupplies {
  private readonly random: SeededRandom;
  private lastAt = -Infinity;
  private nextAt: number;
  private nextKind: FlightAmmo;
  private readonly tempo: number;
  constructor(seed: number, tempo = 1) {
    this.tempo = tempo;
    this.random = new SeededRandom(seed ^ 0x414d4d4f);
    this.nextKind = this.random.bool() ? 'grenadeRounds' : 'scattershot';
    this.nextAt = TEMPORARY_AMMO_BALANCE.durationMs * (.6 + this.random.next() * .2) / tempo;
  }
  private available(kind: FlightAmmo, now: number, state: FlightAmmoState): boolean {
    return state.onScreen === 0 && (state.activeRemainingMs <= TEMPORARY_AMMO_BALANCE.durationMs * .25
      || !!state.activeKind && state.activeKind !== kind)
      && now - this.lastAt >= TEMPORARY_AMMO_BALANCE.durationMs * .5 / this.tempo;
  }
  accept(kind: FlightAmmo, now: number, state: FlightAmmoState): boolean {
    if (!this.available(kind,now,state)) return false;
    this.lastAt = now;
    this.nextKind = kind === 'grenadeRounds' ? 'scattershot' : 'grenadeRounds';
    this.nextAt = now + TEMPORARY_AMMO_BALANCE.durationMs * (1.25 + this.random.next() * .25) / this.tempo;
    return true;
  }
  next(now: number, state: FlightAmmoState, enemyKill = false, pickupMultiplier = 1): FlightAmmo | null {
    const kind = state.activeKind ? state.activeKind === 'grenadeRounds' ? 'scattershot' : 'grenadeRounds' : this.nextKind;
    if (!this.available(kind,now,state)) return null;
    if (enemyKill ? this.random.next() >= Math.min(.2,.1*Math.max(1,pickupMultiplier)) : now < this.nextAt) return null;
    return this.accept(kind,now,state) ? kind : null;
  }
}
