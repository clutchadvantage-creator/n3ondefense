export const HAZARD_DAMAGE_SCALING = {
  increasePerRound: 0.01,
  maximumMultiplier: 1.6
} as const;

export interface HazardDamageTarget {
  active: boolean;
  x: number;
  y: number;
  hazardRadius: number;
  takeDamage(amount: number, source?: 'hazard'): void;
}

export const getHazardDamageMultiplier = (round: number): number =>
  Math.min(
    HAZARD_DAMAGE_SCALING.maximumMultiplier,
    1 + Math.max(0, Math.floor(round) - 1) * HAZARD_DAMAGE_SCALING.increasePerRound
  );

export const getScaledHazardDamage = (baseDamage: number, round: number, maximumDamage: number): number =>
  Math.min(maximumDamage, Math.max(0, baseDamage) * getHazardDamageMultiplier(round));
