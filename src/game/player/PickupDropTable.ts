import { PICKUP_BALANCE } from '../config/balance/index.ts';
import type { PickupType } from '../types.ts';

export interface WeightedPickupEntry {
  type: PickupType;
  weight: number;
}

/** Enemy-only reward table. Arena support and scripted rewards stay separate. */
export const ENEMY_PICKUP_WEIGHTS: readonly WeightedPickupEntry[] = Object.freeze([
  { type: 'health', weight: PICKUP_BALANCE.healthShare },
  { type: 'energy', weight: PICKUP_BALANCE.energyShare },
  { type: 'damageBoost', weight: PICKUP_BALANCE.damageBoostShare },
  { type: 'speedBoost', weight: PICKUP_BALANCE.speedBoostShare },
  { type: 'rapidFire', weight: PICKUP_BALANCE.rapidFireShare },
  { type: 'ricochet', weight: PICKUP_BALANCE.ricochetShare },
  { type: 'grenadeRounds', weight: PICKUP_BALANCE.grenadeRoundsShare },
  { type: 'scattershot', weight: PICKUP_BALANCE.scattershotShare },
  { type: 'credits', weight: PICKUP_BALANCE.creditsShare },
  { type: 'coreToken', weight: PICKUP_BALANCE.coreTokenShare }
]);

export const ENEMY_PICKUP_TOTAL_WEIGHT = ENEMY_PICKUP_WEIGHTS.reduce(
  (total, entry) => total + Math.max(0, entry.weight),
  0
);

export const selectEnemyPickup = (unitRoll: number): PickupType => {
  const safeRoll = Math.max(0, Math.min(0.999999999999, Number.isFinite(unitRoll) ? unitRoll : 0));
  let remaining = safeRoll * ENEMY_PICKUP_TOTAL_WEIGHT;
  for (const entry of ENEMY_PICKUP_WEIGHTS) {
    remaining -= Math.max(0, entry.weight);
    if (remaining < 0) return entry.type;
  }
  return ENEMY_PICKUP_WEIGHTS[ENEMY_PICKUP_WEIGHTS.length - 1]?.type ?? 'credits';
};
