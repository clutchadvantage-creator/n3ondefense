import { CAMPAIGN_MODES, CAMPAIGN_PACKAGE_IDS, createCampaignProgress, type CampaignProgress } from './CampaignProgression.ts';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const round = (value: unknown): number => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.min(30, Math.floor(value))) : 0;

/** Never use legacy/global highestRound to repair a new-campaign save. */
export const normalizeCampaignProgress = (value: unknown): CampaignProgress => {
  const result = createCampaignProgress();
  const source = object(value);
  if (source.version !== 1) return result;
  const modes = object(source.modes);
  for (const mode of CAMPAIGN_MODES) {
    const state = object(modes[mode]);
    const boss = Math.floor(round(state.highestBossDefeated) / 5) * 5;
    const legacyStartRound = Math.max(1, round(state.legacyStartRound));
    result.modes[mode] = {
      highestCompletedRound: Math.max(round(state.highestCompletedRound), boss),
      highestBossDefeated: boss,
      legacyStartRound,
      completed: state.completed === true && (boss === 30 || legacyStartRound === 30)
    };
  }
  const access = object(source.legacyModeAccess);
  result.legacyModeAccess = { overdrive: access.overdrive === true, supreme: access.supreme === true };
  const packages = object(source.packages);
  for (const id of CAMPAIGN_PACKAGE_IDS) {
    const state = object(packages[id]);
    result.packages[id] = {
      eligible: state.eligible === true || (id !== 'training' && result.modes[id].completed),
      // An existing claim is never cleared because eligibility was absent or
      // its presentation was interrupted. Inventory is deliberately not read.
      claimed: state.claimed === true
    };
  }
  return result;
};
