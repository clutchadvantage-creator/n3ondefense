import { UPGRADE_DEFINITIONS } from '../../data/upgrades.ts';
import type { LocalPlayerProgress, LocalPlayerWallet } from '../save/LocalSaveTypes.ts';
import { ECONOMY_BALANCE, MOD_FOCUS_LABELS, RUN_CONTRACTS } from './economyBalance.ts';
import type { AccountProgressionTier, CreditSpendCategory, RunEconomySnapshot, RunSetupSelection } from './types.ts';

export interface EconomyPurchaseResult {
  ok: boolean;
  message: string;
  cost: number;
}

export const createEmptyCreditSpendBreakdown = (): Record<CreditSpendCategory, number> => ({
  upgrade: 0,
  cosmetic: 0,
  modRank: 0,
  modFocus: 0,
  contract: 0,
  loadout: 0,
  other: 0
});

export const getRunSetupCost = (selection: RunSetupSelection): number => {
  const focusCost = selection.modFocus ? ECONOMY_BALANCE.modFocus.cost : 0;
  const contractCost = selection.contract ? RUN_CONTRACTS[selection.contract]?.cost ?? 0 : 0;
  return focusCost + contractCost;
};

export const isValidRunSetupSelection = (selection: RunSetupSelection): boolean => {
  const focusValid = selection.modFocus === null || Object.hasOwn(MOD_FOCUS_LABELS, selection.modFocus);
  const contractValid = selection.contract === null || Object.hasOwn(RUN_CONTRACTS, selection.contract);
  return focusValid && contractValid;
};

export const spendCreditsAtomic = (
  wallet: LocalPlayerWallet,
  progress: LocalPlayerProgress,
  amount: number,
  category: CreditSpendCategory
): boolean => {
  if (!Number.isFinite(amount) || amount < 0) return false;
  const safeAmount = Math.floor(amount);
  if (wallet.credits < safeAmount) return false;
  wallet.credits -= safeAmount;
  progress.totalCreditsSpent += safeAmount;
  progress.creditSpendByCategory[category] += safeAmount;
  return true;
};

export const purchaseRunSetup = (
  wallet: LocalPlayerWallet,
  progress: LocalPlayerProgress,
  selection: RunSetupSelection
): EconomyPurchaseResult => {
  if (!isValidRunSetupSelection(selection)) return { ok: false, message: 'Invalid run setup selection.', cost: 0 };
  const cost = getRunSetupCost(selection);
  if (wallet.credits < cost) return { ok: false, message: `Requires ${(cost - wallet.credits).toLocaleString()} more Credits.`, cost };
  if (selection.modFocus && !spendCreditsAtomic(wallet, progress, ECONOMY_BALANCE.modFocus.cost, 'modFocus')) {
    return { ok: false, message: 'Unable to purchase Mod signal.', cost };
  }
  if (selection.contract && !spendCreditsAtomic(wallet, progress, RUN_CONTRACTS[selection.contract].cost, 'contract')) {
    // Preflight guarantees this cannot normally happen. Restore the focus charge
    // so a run setup purchase remains all-or-nothing if state is ever corrupted.
    if (selection.modFocus) {
      wallet.credits += ECONOMY_BALANCE.modFocus.cost;
      progress.totalCreditsSpent -= ECONOMY_BALANCE.modFocus.cost;
      progress.creditSpendByCategory.modFocus -= ECONOMY_BALANCE.modFocus.cost;
    }
    return { ok: false, message: 'Unable to purchase Contract.', cost };
  }
  return { ok: true, message: cost > 0 ? `Run setup purchased for ${cost.toLocaleString()} Credits.` : 'Standard run setup selected.', cost };
};

export const getUpgradeCompletionPercentage = (upgrades: Record<string, number>): number => {
  const maximum = UPGRADE_DEFINITIONS.reduce((sum, definition) => sum + definition.maxLevel, 0);
  if (maximum <= 0) return 0;
  const owned = UPGRADE_DEFINITIONS.reduce((sum, definition) => {
    const level = Math.max(0, Math.min(definition.maxLevel, Math.floor(upgrades[definition.id] ?? 0)));
    return sum + level;
  }, 0);
  return Math.round(owned / maximum * 1000) / 10;
};

export const getAccountProgressionTier = (completionPercentage: number): AccountProgressionTier => {
  if (completionPercentage >= 99.95) return 'maxed';
  if (completionPercentage >= 85) return 'endgame';
  if (completionPercentage >= 55) return 'advanced';
  if (completionPercentage >= 20) return 'midgame';
  return 'new';
};

export const buildRunEconomySnapshot = (
  upgrades: Record<string, number>,
  selection: RunSetupSelection,
  creditsSpentBeforeRun: number
): RunEconomySnapshot => {
  const upgradeCompletionPercentage = getUpgradeCompletionPercentage(upgrades);
  return {
    ...selection,
    creditsSpentBeforeRun: Math.max(0, Math.floor(creditsSpentBeforeRun)),
    upgradeCompletionPercentage,
    accountProgressionTier: getAccountProgressionTier(upgradeCompletionPercentage)
  };
};

export const getNextLoadoutSlotCost = (purchasedSlots: number): number | null => {
  const normalized = Math.max(1, Math.floor(purchasedSlots));
  return ECONOMY_BALANCE.modLoadoutSlots.purchaseCosts[normalized] ?? null;
};
