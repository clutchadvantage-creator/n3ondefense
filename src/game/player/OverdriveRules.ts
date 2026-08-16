export const OVERDRIVE_MAX_PICKUP_BUFF_STACKS = 2;
export const OVERDRIVE_MAX_RESOURCE_MULTIPLIER = 2;

export const resourcePickupCap = (normalMaximum: number, overdrive: boolean): number =>
  Math.max(0, normalMaximum) * (overdrive ? OVERDRIVE_MAX_RESOURCE_MULTIPLIER : 1);

export const nextPickupBuffStack = (current: number, active: boolean, overdrive: boolean): number => {
  if (!overdrive || !active) return 1;
  return Math.min(OVERDRIVE_MAX_PICKUP_BUFF_STACKS, Math.max(1, Math.floor(current)) + 1);
};

export const stackedPickupMultiplier = (singleStackMultiplier: number, stacks: number): number =>
  1 + Math.max(0, singleStackMultiplier - 1) * Math.max(0, Math.floor(stacks));
