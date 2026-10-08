import { COSMETICS } from '../../data/cosmetics.ts';
import { MOD_DEFINITIONS } from '../mods/definitions.ts';
import { addModDrop } from '../mods/ModInventoryService.ts';
import type { LocalPlayerSave } from '../save/LocalSaveTypes.ts';

/** Operates only on a transaction candidate. The caller persists the inventory
 * and receipt together before exposing either to gameplay or UI. */
export const deliverWeeklyFeaturedRewards = (save: LocalPlayerSave, nowMs: number): boolean => {
  let changed = false;
  const ledger = save.progress.weeklyRewardCampaigns;
  for (const receipt of ledger.receipts) {
    if (receipt.claimedAt) continue;
    const reward = receipt.reward;
    switch (reward.type) {
      case 'cosmetic':
        if (!COSMETICS.some(item => item.id === reward.inventoryRef)) continue;
        if (!save.cosmetics.owned.includes(reward.inventoryRef)) save.cosmetics.owned.push(reward.inventoryRef);
        break;
      case 'mod':
        if (!MOD_DEFINITIONS.some(item => item.id === reward.inventoryRef)) continue;
        for (let index = 0; index < reward.amount; index++) addModDrop(save.mods, reward.inventoryRef, new Date(nowMs).toISOString());
        break;
      case 'entitlement':
        if (!ledger.entitlements.some(item => item.campaignId === receipt.campaignId && item.rewardId === reward.rewardId))
          ledger.entitlements.push({ campaignId: receipt.campaignId, rewardId: reward.rewardId, inventoryRef: reward.inventoryRef, amount: reward.amount });
        break;
      case 'credits': save.wallet.credits += reward.amount; save.progress.totalCreditsEarned += reward.amount; break;
      case 'coreTokens': save.wallet.coreTokens += reward.amount; save.progress.totalCoreTokensEarned += reward.amount; break;
      case 'fluxCores': save.wallet.fluxCores += reward.amount; save.progress.totalFluxCoresEarned += reward.amount; break;
      case 'plasmaChips': save.mods.plasmaChips += reward.amount; break;
      default: continue;
    }
    receipt.claimedAt = nowMs;
    changed = true;
  }
  return changed;
};
