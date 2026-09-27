import { MOD_DEFINITIONS } from '../mods/definitions.ts';
import { addModDrop } from '../mods/ModInventoryService.ts';
import type { LocalModCollection, ModRarity } from '../mods/types.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';
import { getPendingCampaignPackages, isCampaignModeUnlocked, type CampaignPackageId, type CampaignProgress } from './CampaignProgression.ts';

const PACKAGE_RARITIES: Record<CampaignPackageId, readonly ModRarity[]> = {
  training: ['common', 'common', 'common'],
  normal: ['epic', 'epic', 'legendary'],
  overdrive: ['supreme', 'supreme', 'legendary']
};

export interface PreparedCampaignPackages {
  progress: CampaignProgress;
  mods: LocalModCollection;
  grants: { packageId: CampaignPackageId; modIds: string[]; cardIds: string[] }[];
}

/** Prepares one save transaction: both inventory and claim flags are returned
 * together. The caller must persist the pair before presenting the existing
 * Mod reveals. Exceptions leave the input save untouched. No wallet changes. */
export const prepareCampaignRewardPackages = (
  progress: CampaignProgress, mods: LocalModCollection, seed: number, acquiredAt: string
): PreparedCampaignPackages => {
  const result: PreparedCampaignPackages = {
    progress: structuredClone(progress), mods: structuredClone(mods), grants: []
  };
  const random = new SeededRandom(seed);
  for (const packageId of getPendingCampaignPackages(result.progress)) {
    if (packageId === 'overdrive' && !isCampaignModeUnlocked(result.progress, 'supreme')) {
      throw new Error('Supreme must be unlocked before granting its completion package');
    }
    const modIds: string[] = [];
    const cardIds: string[] = [];
    for (const rarity of PACKAGE_RARITIES[packageId]) {
      const pool = MOD_DEFINITIONS.filter((definition) => definition.rarity === rarity);
      if (!pool.length) throw new Error(`No eligible ${rarity} Mods for campaign package`);
      const unused = pool.filter((definition) => !modIds.includes(definition.id));
      const unowned = unused.filter((definition) => !result.mods.inventory[definition.id]);
      const selected = random.pick(unowned.length ? unowned : unused.length ? unused : pool);
      const grant = addModDrop(result.mods, selected.id, acquiredAt);
      if (!grant.ok) throw new Error(grant.message);
      modIds.push(selected.id);
      cardIds.push(result.mods.cards.at(-1)!.instanceId);
    }
    result.progress.packages[packageId].claimed = true;
    result.grants.push({ packageId, modIds, cardIds });
  }
  return result;
};
