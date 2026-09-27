import { RUN_PROTOCOLS } from '../../mods/modBalance.ts';
import type { RunProtocolId } from '../../mods/types.ts';
import { getCampaignRewardPosition } from '../../progression/CampaignProgression.ts';

/** Local presentation, payout progression and compressed combat progression
 * deliberately have different meanings. Existing HEIST caps remain downstream. */
export const getHeistCampaignPositions = (protocol: RunProtocolId, localRound: number) => {
  const mode = RUN_PROTOCOLS[protocol].family;
  const rewardPosition = getCampaignRewardPosition(mode, localRound);
  return {
    localRound,
    rewardPosition,
    difficultyPosition: mode === 'supreme' ? 61 + (localRound - 1) * 3 : rewardPosition
  };
};
