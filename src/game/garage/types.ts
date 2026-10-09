import type { ModFocusSignalId, RunContractId, RunSetupSelection } from '../economy/types.ts';
import type { ModLoadoutSlots, RunProtocolId } from '../mods/types.ts';
import type { LocalPlayerCosmetics } from '../save/LocalSaveTypes.ts';

export type GaragePresetId = 'config-a' | 'config-b' | 'config-c';

export interface GaragePreset {
  /** Version 1 presets did not record cosmetics or the retain-deployment toggle. */
  version?: number;
  id: GaragePresetId;
  name: string;
  saved: boolean;
  savedAt?: string;
  cardSlots: ModLoadoutSlots;
  /** Definition IDs are preview metadata; only cardSlots authorize owned instances. */
  cardModIds?: ModLoadoutSlots;
  protocol: RunProtocolId | null;
  normalStartRound: number | null;
  campaignStartRound?: number | null;
  contract: RunContractId | null;
  modFocus: ModFocusSignalId | null;
  cosmetics?: LocalPlayerCosmetics['equipped'];
  infusionIds?: Partial<Record<keyof ModLoadoutSlots, string | null>>;
  savedDeploymentEnabled?: boolean;
  /** Preserve invalid imported references as a visible failure, never a substitution. */
  validationIssues?: string[];
}

export interface PlayerGarageState {
  nextRun: RunSetupSelection;
  /** Retains nextRun after a committed attempt; it never represents prepayment. */
  savedDeploymentEnabled: boolean;
  /** ISO timestamp of the last explicit saved-configuration acknowledgement. */
  lastDeploymentReminderAt: string | null;
  presets: GaragePreset[];
  activePresetId: GaragePresetId | null;
}

export interface SaveGaragePresetOptions { name?: string; overwriteConfirmed?: boolean }
