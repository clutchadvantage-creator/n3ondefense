import type { ModCategory } from '../mods/types.ts';

export type ModFocusSignalId = ModCategory;
export type RunContractId = 'elite-hunt' | 'fortified-enemy' | 'bomb-rush';
export type CosmeticPriceTier = 'standard' | 'rare' | 'prestige';
export type AccountProgressionTier = 'new' | 'midgame' | 'advanced' | 'endgame' | 'maxed';
export type CreditSpendCategory = 'upgrade' | 'cosmetic' | 'modRank' | 'modFocus' | 'contract' | 'loadout' | 'other';

export interface RunSetupSelection {
  modFocus: ModFocusSignalId | null;
  contract: RunContractId | null;
}

export interface RunEconomySnapshot extends RunSetupSelection {
  creditsSpentBeforeRun: number;
  upgradeCompletionPercentage: number;
  accountProgressionTier: AccountProgressionTier;
}

export type CreditSpendBreakdown = Record<CreditSpendCategory, number>;

