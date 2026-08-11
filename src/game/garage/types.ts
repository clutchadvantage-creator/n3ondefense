import type { ModFocusSignalId, RunContractId, RunSetupSelection } from '../economy/types.ts';
import type { ModLoadoutSlots, RunProtocolId } from '../mods/types.ts';

export type GaragePresetId = 'config-a' | 'config-b' | 'config-c';

export interface GaragePreset {
  id: GaragePresetId;
  name: string;
  saved: boolean;
  savedAt?: string;
  cardSlots: ModLoadoutSlots;
  protocol: RunProtocolId | null;
  contract: RunContractId | null;
  modFocus: ModFocusSignalId | null;
}

export interface PlayerGarageState {
  nextRun: RunSetupSelection;
  presets: GaragePreset[];
}

