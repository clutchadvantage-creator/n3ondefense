import { createCampaignProgress, type CampaignProgress } from './CampaignProgression.ts';

/** Frozen v18 inputs. Do not derive legacy access from the evolving live tables. */
export interface LegacyCampaignRecord {
  sourceSaveVersion: number;
  highestRound: number;
  normalHighestRound: number;
  supremeHighestRound: number;
  regularOverdriveCompleted: boolean;
  supremeOverdriveCompleted: boolean;
  preferredProtocol: string;
  selectedNormalStartRound: number;
  trainingRoundsCompleted: number;
  completedTutorialSequences: string[];
}

export interface CampaignMigrationResult {
  progress: CampaignProgress;
  legacy: LegacyCampaignRecord;
}

const integer = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** Migration preparation only. The versioned save owner installs the result once;
 * normal reloads must deserialize the installed campaign and its claim flags.
 * Inventory, currencies, tutorial history and old statistics are not rewritten. */
export const migrateLegacyCampaignProgress = (record: LegacyCampaignRecord): CampaignMigrationResult => {
  if (!Number.isInteger(record.sourceSaveVersion) || record.sourceSaveVersion < 1 || record.sourceSaveVersion > 18) {
    throw new Error('Campaign migration requires a pre-campaign save version (1–18)');
  }
  const progress = createCampaignProgress();
  const normal = integer(record.normalHighestRound);
  const global = integer(record.highestRound);
  const supreme = integer(record.supremeHighestRound);
  const overdriveCompleted = record.regularOverdriveCompleted || record.supremeOverdriveCompleted;
  progress.legacyModeAccess.overdrive = global >= 8 || overdriveCompleted || supreme >= 51;
  progress.legacyModeAccess.supreme = overdriveCompleted || supreme >= 51;

  // Normal used five-round access milestones; high records stay intact in the
  // archive. The new campaign has no positions above 30.
  progress.modes.normal.legacyStartRound = Math.max(1, Math.min(30, Math.floor(normal / 5) * 5));
  progress.modes.normal.highestCompletedRound = Math.min(30, normal);
  progress.modes.normal.completed = normal >= 30;
  progress.packages.normal.eligible = progress.modes.normal.completed;

  // Regular Overdrive had ten starts (5..50), unlocked by global 8,13,..53.
  // Preserve each previously available in-range start. Later starts map to the
  // terminal position, without inventing proof that an old boss was defeated.
  const lastOverdriveStart = global < 8 ? 1 : Math.min(50, 5 * (1 + Math.floor((global - 8) / 5)));
  progress.modes.overdrive.legacyStartRound = overdriveCompleted ? 30 : Math.min(30, lastOverdriveStart);
  progress.modes.overdrive.completed = overdriveCompleted;
  progress.modes.overdrive.highestCompletedRound = overdriveCompleted ? 30 : 0;
  progress.packages.overdrive.eligible = overdriveCompleted;

  // Preserve access by constellation identity, rather than mistaking an old
  // starting level (51..100) for its different unlock threshold (50..148).
  const supremeAccess = [[58, 4], [68, 7], [78, 10], [88, 13], [98, 16],
    [108, 19], [118, 22], [128, 25], [138, 28], [148, 30]] as const;
  progress.modes.supreme.legacyStartRound = record.supremeOverdriveCompleted
    ? 30 : supremeAccess.findLast(([threshold]) => supreme >= threshold)?.[1] ?? 1;
  progress.modes.supreme.completed = record.supremeOverdriveCompleted;
  progress.modes.supreme.highestCompletedRound = record.supremeOverdriveCompleted ? 30 : 0;
  progress.packages.training.eligible = record.trainingRoundsCompleted >= 3
    || record.completedTutorialSequences.includes('onboarding.certification');
  // All claims deliberately remain false. Ownership of any rarity proves
  // neither delivery of a package nor completion of a campaign.
  return { progress, legacy: structuredClone(record) };
};
