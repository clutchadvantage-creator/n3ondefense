import type { PickupType } from '../types.ts';

export type PhysicalLootKind =
  | 'credits'
  | 'core-tokens'
  | 'flux-cores'
  | 'plasma-chips'
  | 'mod'
  | 'grenade-rounds'
  | 'scattershot-rounds';

export interface PhysicalLootReward {
  kind: PhysicalLootKind;
  amount: number;
}

export interface PhysicalLootPlanEntry {
  kind: PhysicalLootKind;
  pickupType: PickupType | null;
  amount: number;
  index: number;
  total: number;
  angle: number;
  distance: number;
}

export interface PhysicalLootPlanOptions {
  /** Keeps large Credit awards readable without creating hundreds of objects. */
  maximumCreditBundles?: number;
  minimumCreditBundles?: number;
  seed?: number;
}

const pickupTypeFor = (kind: PhysicalLootKind): PickupType | null => {
  if (kind === 'credits') return 'credits';
  if (kind === 'core-tokens') return 'coreToken';
  if (kind === 'flux-cores') return 'fluxCore';
  if (kind === 'plasma-chips') return 'plasmaChip';
  if (kind === 'grenade-rounds') return 'grenadeRounds';
  if (kind === 'scattershot-rounds') return 'scattershot';
  return null;
};

/**
 * Converts an abstract reward roll into a bounded set of arena pickup entries.
 * No wallet or inventory mutation occurs here: collection remains authoritative.
 */
export const createPhysicalLootPlan = (
  rewards: readonly PhysicalLootReward[],
  options: PhysicalLootPlanOptions = {}
): PhysicalLootPlanEntry[] => {
  const flattened: Array<{ kind: PhysicalLootKind; pickupType: PickupType | null; amount: number }> = [];
  const maximumCreditBundles = Math.max(1, Math.floor(options.maximumCreditBundles ?? 8));
  const minimumCreditBundles = Math.max(1, Math.min(maximumCreditBundles, Math.floor(options.minimumCreditBundles ?? 1)));

  for (const reward of rewards) {
    const amount = Math.max(0, Math.floor(reward.amount));
    if (amount <= 0) continue;
    if (reward.kind === 'credits') {
      const desired = Math.ceil(amount / 250);
      const bundleCount = Math.min(amount, maximumCreditBundles, Math.max(minimumCreditBundles, desired));
      let remaining = amount;
      for (let index = 0; index < bundleCount; index += 1) {
        const bundleAmount = Math.ceil(remaining / (bundleCount - index));
        remaining -= bundleAmount;
        flattened.push({ kind: reward.kind, pickupType: 'credits', amount: bundleAmount });
      }
      continue;
    }
    if (reward.kind === 'mod') {
      for (let index = 0; index < amount; index += 1) {
        flattened.push({ kind: reward.kind, pickupType: null, amount: 1 });
      }
      continue;
    }

    const pickupType = pickupTypeFor(reward.kind);
    for (let index = 0; index < amount; index += 1) {
      flattened.push({ kind: reward.kind, pickupType, amount: 1 });
    }
  }

  const total = flattened.length;
  const phase = ((options.seed ?? 0) >>> 0) / 0x100000000 * Math.PI * 2;
  return flattened.map((entry, index) => ({
    ...entry,
    index,
    total,
    angle: phase + index / Math.max(1, total) * Math.PI * 2 + ((index * 17) % 7 - 3) * 0.035,
    distance: 74 + index % 4 * 24 + Math.floor(index / 4) * 9
  }));
};

