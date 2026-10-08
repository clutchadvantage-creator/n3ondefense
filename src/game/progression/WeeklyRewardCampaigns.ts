import type { WeeklyOperationDeck, WeeklyOperationsState } from './WeeklyOperations.ts';

export type FeaturedRewardType = 'cosmetic' | 'mod' | 'entitlement' | 'credits' | 'coreTokens' | 'plasmaChips' | 'fluxCores';
export interface WeeklyFeaturedReward {
  rewardId: string;
  type: FeaturedRewardType;
  /** Existing cosmetic/Mod ID, or a durable future entitlement ID. */
  inventoryRef: string;
  displayName: string;
  /** Existing Phaser texture key, or pickup:credits/coreToken/plasmaChip/fluxCore. */
  iconRef: string;
  amount: number;
  enabled: boolean;
  eligibleDecks?: readonly WeeklyOperationDeck[];
  rarity?: string;
  tooltip?: string;
}
export interface WeeklyRewardCampaign {
  campaignId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
  eligibleDecks?: readonly WeeklyOperationDeck[];
  sharedReward?: WeeklyFeaturedReward;
  overdriveBonus?: WeeklyFeaturedReward;
}

/** Production intentionally has no featured rewards. See docs/weekly-operations.md. */
export const WEEKLY_REWARD_CAMPAIGNS: readonly WeeklyRewardCampaign[] = [];

export interface WeeklyRewardReceipt {
  campaignId: string;
  campaignTitle: string;
  endsAt: number;
  reward: WeeklyFeaturedReward;
  exclusive: boolean;
  earnedDeck: WeeklyOperationDeck;
  earnedAt: number;
  claimedAt?: number;
}
export interface WeeklyRewardCampaignState {
  /** Profile-local ledger; identity is (campaignId, reward.rewardId). */
  receipts: WeeklyRewardReceipt[];
  /** Future rewards without a current inventory adapter have real saved ownership. */
  entitlements: { campaignId: string; rewardId: string; inventoryRef: string; amount: number }[];
}
export interface WeeklyFeaturedRewardView {
  campaignId: string;
  campaignTitle: string;
  endsAt: number;
  reward: WeeklyFeaturedReward;
  exclusive: boolean;
  status: 'AVAILABLE' | 'EARNED' | 'CLAIMED' | 'EXPIRED';
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const TYPES: readonly string[] = ['cosmetic', 'mod', 'entitlement', 'credits', 'coreTokens', 'plasmaChips', 'fluxCores'];
const validDecks = (value: unknown): boolean => value === undefined || (Array.isArray(value) && value.every(deck => deck === 'regular' || deck === 'overdrive'));
const validReward = (value: unknown): value is WeeklyFeaturedReward => {
  const reward = object(value);
  return identifier(reward.rewardId) && identifier(reward.inventoryRef) && identifier(reward.displayName)
    && identifier(reward.iconRef) && TYPES.includes(String(reward.type)) && positive(reward.amount) && Number.isInteger(reward.amount)
    && validDecks(reward.eligibleDecks);
};
export const createDefaultWeeklyRewardCampaignState = (): WeeklyRewardCampaignState => ({ receipts: [], entitlements: [] });
export const normalizeWeeklyRewardCampaignState = (value: unknown): WeeklyRewardCampaignState => {
  const candidate = object(value);
  const state = createDefaultWeeklyRewardCampaignState();
  for (const raw of Array.isArray(candidate.receipts) ? candidate.receipts : []) {
    const item = object(raw);
    if (!identifier(item.campaignId) || !identifier(item.campaignTitle) || !positive(item.endsAt)
      || !positive(item.earnedAt) || !validReward(item.reward) || !['regular', 'overdrive'].includes(String(item.earnedDeck))) continue;
    if (state.receipts.some(entry => entry.campaignId === item.campaignId && entry.reward.rewardId === (item.reward as WeeklyFeaturedReward).rewardId)) continue;
    state.receipts.push({ campaignId: item.campaignId, campaignTitle: item.campaignTitle, endsAt: item.endsAt,
      reward: structuredClone(item.reward), exclusive: item.exclusive === true, earnedDeck: item.earnedDeck as WeeklyOperationDeck,
      earnedAt: item.earnedAt, ...(positive(item.claimedAt) ? { claimedAt: item.claimedAt } : {}) });
  }
  for (const raw of Array.isArray(candidate.entitlements) ? candidate.entitlements : []) {
    const item = object(raw);
    if (!identifier(item.campaignId) || !identifier(item.rewardId) || !identifier(item.inventoryRef) || !positive(item.amount)) continue;
    if (!state.entitlements.some(entry => entry.campaignId === item.campaignId && entry.rewardId === item.rewardId))
      state.entitlements.push({ campaignId: item.campaignId, rewardId: item.rewardId, inventoryRef: item.inventoryRef, amount: Math.floor(item.amount) });
  }
  return state;
};

export const validateWeeklyRewardCampaigns = (campaigns: readonly WeeklyRewardCampaign[]): string[] => {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of campaigns) {
    if (!identifier(item.campaignId) || ids.has(item.campaignId)) errors.push('Campaign IDs must be unique and nonempty.');
    ids.add(item.campaignId);
    if (typeof item.startsAt !== 'string' || typeof item.endsAt !== 'string' || !item.startsAt.endsWith('Z') || !item.endsAt.endsWith('Z') || !(Date.parse(item.endsAt) > Date.parse(item.startsAt))) errors.push(`${item.campaignId}: use ordered UTC timestamps.`);
    if (!validDecks(item.eligibleDecks)) errors.push(`${item.campaignId}: unsupported deck eligibility.`);
    const rewards = [item.sharedReward, item.overdriveBonus].filter((reward): reward is WeeklyFeaturedReward => Boolean(reward));
    if (rewards.some(reward => !validReward(reward))) errors.push(`${item.campaignId}: invalid reward metadata.`);
    if (rewards.length === 2 && rewards[0].rewardId === rewards[1].rewardId) errors.push(`${item.campaignId}: shared and bonus IDs must differ.`);
  }
  const enabled = campaigns.filter(item => item.enabled).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (let index = 1; index < enabled.length; index++) {
    if (Date.parse(enabled[index].startsAt) < Date.parse(enabled[index - 1].endsAt)) errors.push('Enabled campaigns must not overlap.');
  }
  return errors;
};

const allowed = (decks: readonly WeeklyOperationDeck[] | undefined, deck: WeeklyOperationDeck): boolean => !decks || decks.includes(deck);
const activeAt = (campaign: WeeklyRewardCampaign, at: number): boolean => campaign.enabled
  && validateWeeklyRewardCampaigns([campaign]).length === 0 && at >= Date.parse(campaign.startsAt) && at < Date.parse(campaign.endsAt);
const eligibleRewards = (campaign: WeeklyRewardCampaign, deck: WeeklyOperationDeck) => {
  if (!allowed(campaign.eligibleDecks, deck)) return [];
  return [{ reward: campaign.sharedReward, exclusive: false }, { reward: deck === 'overdrive' ? campaign.overdriveBonus : undefined, exclusive: true }]
    .filter((item): item is { reward: WeeklyFeaturedReward; exclusive: boolean } => Boolean(item.reward?.enabled && validReward(item.reward) && allowed(item.reward.eligibleDecks, deck)));
};

/** Reserve at authoritative completion, not when the reward screen happens to open.
 * Earned definitions survive expiration, disabled/removed configuration and reload. */
export const earnWeeklyCampaignRewards = (
  state: WeeklyRewardCampaignState, tracks: WeeklyOperationsState,
  campaigns: readonly WeeklyRewardCampaign[] = WEEKLY_REWARD_CAMPAIGNS
): boolean => {
  let changed = false;
  for (const deck of ['regular', 'overdrive'] as const) {
    const completedAt = (deck === 'regular' ? tracks : tracks.overdrive).completedAt;
    if (!completedAt) continue;
    for (const campaign of campaigns) {
      if (!activeAt(campaign, completedAt)) continue;
      for (const item of eligibleRewards(campaign, deck)) {
        if (state.receipts.some(entry => entry.campaignId === campaign.campaignId && entry.reward.rewardId === item.reward.rewardId)) continue;
        state.receipts.push({ campaignId: campaign.campaignId, campaignTitle: campaign.title, endsAt: Date.parse(campaign.endsAt),
          reward: { ...structuredClone(item.reward), eligibleDecks: (['regular', 'overdrive'] as const)
            .filter(candidate => (!item.exclusive || candidate === 'overdrive') && allowed(campaign.eligibleDecks, candidate) && allowed(item.reward.eligibleDecks, candidate)) },
          exclusive: item.exclusive, earnedDeck: deck, earnedAt: completedAt });
        changed = true;
      }
    }
  }
  return changed;
};

export const getWeeklyFeaturedRewards = (state: WeeklyRewardCampaignState, deck: WeeklyOperationDeck, nowMs = Date.now(),
  campaigns: readonly WeeklyRewardCampaign[] = WEEKLY_REWARD_CAMPAIGNS): WeeklyFeaturedRewardView[] => {
  const result: WeeklyFeaturedRewardView[] = [];
  for (const campaign of campaigns) {
    if (!activeAt(campaign, nowMs)) continue;
    for (const item of eligibleRewards(campaign, deck)) {
      const receipt = state.receipts.find(entry => entry.campaignId === campaign.campaignId && entry.reward.rewardId === item.reward.rewardId);
      result.push({ campaignId: campaign.campaignId, campaignTitle: campaign.title, endsAt: Date.parse(campaign.endsAt), ...item, reward: receipt?.reward ?? item.reward,
        status: receipt?.claimedAt ? 'CLAIMED' : receipt ? 'EARNED' : 'AVAILABLE' });
    }
  }
  // Keep undelivered rewards visible until successfully persisted, even after expiration.
  for (const receipt of state.receipts) {
    if (receipt.claimedAt || (receipt.exclusive && deck !== 'overdrive')
      || !allowed(receipt.reward.eligibleDecks, deck)
      || result.some(item => item.campaignId === receipt.campaignId && item.reward.rewardId === receipt.reward.rewardId)) continue;
    result.push({ ...receipt, status: 'EARNED' });
  }
  return result;
};

/** Historical details retain ownership; expiration only closes earning. */
export const getWeeklyRewardHistory = (state: WeeklyRewardCampaignState, nowMs = Date.now(),
  campaigns: readonly WeeklyRewardCampaign[] = WEEKLY_REWARD_CAMPAIGNS): WeeklyFeaturedRewardView[] => {
  const history: WeeklyFeaturedRewardView[] = state.receipts.map(receipt => ({ ...receipt, status: receipt.claimedAt ? 'CLAIMED' : 'EARNED' }));
  for (const campaign of campaigns) {
    if (!campaign.enabled || nowMs < Date.parse(campaign.endsAt)) continue;
    for (const deck of ['regular', 'overdrive'] as const) for (const item of eligibleRewards(campaign, deck)) {
      if (history.some(entry => entry.campaignId === campaign.campaignId && entry.reward.rewardId === item.reward.rewardId)) continue;
      history.push({ campaignId: campaign.campaignId, campaignTitle: campaign.title, endsAt: Date.parse(campaign.endsAt), ...item, status: 'EXPIRED' });
    }
  }
  return history;
};
