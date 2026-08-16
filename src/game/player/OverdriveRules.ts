import { MODE_BALANCE } from '../config/modeBalance.ts';

export const OVERDRIVE_MAX_PICKUP_BUFF_STACKS = MODE_BALANCE.overdrive.pickupStackLimit;
export const OVERDRIVE_MAX_RESOURCE_MULTIPLIER = MODE_BALANCE.overdrive.resourcePickupCapMultiplier;

export const resourcePickupCap = (normalMaximum: number, overdrive: boolean): number =>
  Math.max(0, normalMaximum) * (overdrive
    ? MODE_BALANCE.overdrive.resourcePickupCapMultiplier
    : MODE_BALANCE.normal.resourcePickupCapMultiplier);

export const nextPickupBuffStack = (current: number, active: boolean, overdrive: boolean): number => {
  const limit = overdrive ? MODE_BALANCE.overdrive.pickupStackLimit : MODE_BALANCE.normal.pickupStackLimit;
  if (!active) return 1;
  return Math.min(limit, Math.max(1, Math.floor(current)) + 1);
};

export const stackedPickupMultiplier = (singleStackMultiplier: number, stacks: number): number =>
  1 + Math.max(0, singleStackMultiplier - 1) * Math.max(0, Math.floor(stacks));
