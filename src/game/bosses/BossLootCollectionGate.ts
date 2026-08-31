export interface BossLootCollectionGateState {
  phase: string;
  pendingLaunches: number;
  resourcePickupsRemaining: number;
  modPickupsRemaining: number;
  revealQueueBusy: boolean;
  premiumRevealActive: boolean;
}

/**
 * Boss rewards remain physical until collected. The encounter may advance only
 * after every reward is recovered and its card presentation has fully settled.
 */
export function canAdvanceFromBossLootCollection(state: BossLootCollectionGateState): boolean {
  return state.phase === 'loot-collection'
    && state.pendingLaunches === 0
    && state.resourcePickupsRemaining === 0
    && state.modPickupsRemaining === 0
    && !state.revealQueueBusy
    && !state.premiumRevealActive;
}
