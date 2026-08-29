import { buildRunEconomySnapshot, getRunSetupCost, purchaseRunSetup } from '../economy/EconomyService.ts';
import type { RunEconomySnapshot, RunSetupSelection } from '../economy/types.ts';
import type { LocalPlayerSave } from '../save/LocalSaveTypes.ts';
import type { PlayerGarageState } from './types.ts';

export const SAVED_DEPLOYMENT_REMINDER_INTERVAL_DAYS = 3;
export const SAVED_DEPLOYMENT_REMINDER_INTERVAL_MS = SAVED_DEPLOYMENT_REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

export const hasDeploymentSelection = (selection: RunSetupSelection): boolean => Boolean(selection.contract || selection.modFocus);

export const isSavedDeploymentActive = (garage: PlayerGarageState): boolean =>
  garage.savedDeploymentEnabled && hasDeploymentSelection(garage.nextRun);

export const isSavedDeploymentReminderDue = (garage: PlayerGarageState, nowMs = Date.now()): boolean => {
  if (!isSavedDeploymentActive(garage)) return false;
  const acknowledgedAt = garage.lastDeploymentReminderAt ? Date.parse(garage.lastDeploymentReminderAt) : Number.NaN;
  return !Number.isFinite(acknowledgedAt) || nowMs - acknowledgedAt >= SAVED_DEPLOYMENT_REMINDER_INTERVAL_MS;
};

export const setSavedDeploymentEnabled = (garage: PlayerGarageState, enabled: boolean, nowMs = Date.now()): void => {
  garage.savedDeploymentEnabled = enabled;
  // Enabling is an explicit acknowledgement. This avoids immediately asking
  // the same question again when the player leaves the configuration console.
  if (enabled) garage.lastDeploymentReminderAt = new Date(nowMs).toISOString();
};

export const acknowledgeSavedDeploymentReminder = (garage: PlayerGarageState, nowMs = Date.now()): void => {
  garage.lastDeploymentReminderAt = new Date(nowMs).toISOString();
};

export interface DeploymentLaunchCommitResult {
  ok: boolean;
  message: string;
  cost: number;
  selection: RunSetupSelection;
  economySnapshot?: RunEconomySnapshot;
}

/**
 * The sole profile transaction for a new run attempt. Prices are resolved from
 * authoritative balance data at commit time. A failed preflight leaves both
 * wallet and configuration untouched; a success deducts once and then either
 * retains or consumes the selected IDs according to the persistence toggle.
 */
export const commitDeploymentLaunch = (
  save: LocalPlayerSave,
  options: { acknowledgeReminder?: boolean; nowMs?: number } = {}
): DeploymentLaunchCommitResult => {
  const selection = { ...save.garage.nextRun };
  const currentCost = getRunSetupCost(selection);
  const purchase = purchaseRunSetup(save.wallet, save.progress, selection);
  if (!purchase.ok) return { ...purchase, selection };

  if (options.acknowledgeReminder) acknowledgeSavedDeploymentReminder(save.garage, options.nowMs);
  if (!save.garage.savedDeploymentEnabled) save.garage.nextRun = { contract: null, modFocus: null };

  return {
    ...purchase,
    cost: currentCost,
    selection,
    economySnapshot: buildRunEconomySnapshot(save.upgrades, selection, currentCost)
  };
};

/** Small reusable in-memory gate for rapid mouse/controller duplicate starts. */
export class DeploymentLaunchGate {
  private state: 'idle' | 'pending' | 'committed' = 'idle';

  begin(): boolean {
    if (this.state !== 'idle') return false;
    this.state = 'pending';
    return true;
  }

  release(): void {
    if (this.state === 'pending') this.state = 'idle';
  }

  commit(): void {
    if (this.state === 'pending') this.state = 'committed';
  }

  reset(): void { this.state = 'idle'; }
  get busy(): boolean { return this.state !== 'idle'; }
}
