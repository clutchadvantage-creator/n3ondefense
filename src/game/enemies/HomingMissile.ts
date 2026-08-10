import { TANK_HOMING_MISSILE_BALANCE } from '../config/balance/index.ts';

export const getTankHomingMissileSpeed = (currentPlayerSpeed: number): number =>
  Math.max(0, currentPlayerSpeed) * TANK_HOMING_MISSILE_BALANCE.speedMultiplier;

export const steerTankHomingMissile = (currentAngle: number, targetAngle: number, deltaMs: number): number => {
  const shortestTurn = Math.atan2(Math.sin(targetAngle - currentAngle), Math.cos(targetAngle - currentAngle));
  const maximumTurn = TANK_HOMING_MISSILE_BALANCE.turnRateRadiansPerSecond * Math.max(0, deltaMs) / 1000;
  return currentAngle + Math.max(-maximumTurn, Math.min(maximumTurn, shortestTurn));
};
