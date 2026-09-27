import type { RunModeFamily } from '../config/modeBalance.ts';
import { getCampaignRewardPosition } from './CampaignProgression.ts';

/** Input to existing capped combat curves, never a displayed round or payout.
 * Mode/constellation multipliers still apply at their existing effect boundary. */
export const getCampaignCombatPosition = (mode: RunModeFamily, localRound: number): number => {
  const position = getCampaignRewardPosition(mode, localRound);
  return mode === 'supreme' ? 61 + (localRound - 1) * 3 : position;
};

export const getCampaignHazardAvailability = (mode: RunModeFamily, localRound: number) => {
  getCampaignRewardPosition(mode, localRound); // Validate the local position.
  return {
    lasers: true,
    bomblets: mode !== 'normal' || localRound >= 6,
    gas: mode !== 'normal' || localRound >= 11,
    fire: mode !== 'normal' || localRound >= 16
  };
};
