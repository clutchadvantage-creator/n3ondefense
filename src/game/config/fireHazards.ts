import type { RunProtocolId } from '../mods/types.ts';
import { getScaledHazardDamage } from './hazardScaling.ts';
import { applyHazardDamageMode, type RunModeFamily } from './modeBalance.ts';

/**
 * Fire is a sustained contact hazard, so this is a pulse rather than a
 * one-frame or per-second value. The interval sits just beyond the operative's
 * baseline 500ms invulnerability window: uninterrupted exposure produces a
 * readable hit cadence without wasting alternate pulses or spamming feedback.
 */
export const FIRE_HAZARD_BALANCE = Object.freeze({
  playerDamagePerPulse: 8,
  maximumPlayerDamagePerPulse: 12.8,
  damagePulseIntervalMs: 520
});

export interface FireHazardDamageProfile {
  damagePerPulse: number;
  pulseIntervalMs: number;
  damagePerSecond: number;
}

/** Uses the same authoritative round curve and exact protocol multiplier as
 * lasers and bomblets. Shared fire renderers consume only this resolved
 * profile and never own a difficulty formula. */
export const getFireHazardDamageProfile = (
  round: number,
  protocolOrFamily: RunModeFamily | RunProtocolId
): FireHazardDamageProfile => {
  const roundScaledPulse = getScaledHazardDamage(
    FIRE_HAZARD_BALANCE.playerDamagePerPulse,
    round,
    FIRE_HAZARD_BALANCE.maximumPlayerDamagePerPulse
  );
  const damagePerPulse = applyHazardDamageMode(roundScaledPulse, protocolOrFamily);
  return {
    damagePerPulse,
    pulseIntervalMs: FIRE_HAZARD_BALANCE.damagePulseIntervalMs,
    damagePerSecond: damagePerPulse * 1_000 / FIRE_HAZARD_BALANCE.damagePulseIntervalMs
  };
};

/** Inclusive first contact: entering fire is one pulse, then sustained
 * exposure advances on the fixed interval. Used by balance diagnostics/tests. */
export const getFireExposurePulseCount = (exposureMs: number): number =>
  Number.isFinite(exposureMs) && exposureMs >= 0
    ? 1 + Math.floor(exposureMs / FIRE_HAZARD_BALANCE.damagePulseIntervalMs)
    : 0;

export const getFireExposureDamage = (
  exposureMs: number,
  round: number,
  protocolOrFamily: RunModeFamily | RunProtocolId
): number => getFireExposurePulseCount(exposureMs)
  * getFireHazardDamageProfile(round, protocolOrFamily).damagePerPulse;
