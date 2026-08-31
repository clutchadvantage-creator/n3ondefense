import type { ModCardInstance, ModRarity } from './types.ts';

export const NORMAL_MOD_REVEAL_HOLD_MS = 2_000;
export const LEGENDARY_MOD_REVEAL_HOLD_MS = 2_100;
export const SUPREME_MOD_REVEAL_HOLD_MS = 2_650;
export const LEGENDARY_MOD_REVEAL_COMPLETE_EVENT = 'mod-reveal:legendary-complete';
export const PREMIUM_MOD_REVEAL_ACKNOWLEDGE_EVENT = 'mod-reveal:premium-acknowledge';
export const MOD_PICKUP_REVEAL_LEAD_IN_MS = 180;

export interface ModAcquisitionPresentation {
  card: ModCardInstance;
  rarity: ModRarity;
  duplicate: boolean;
  sourceScreenX: number;
  sourceScreenY: number;
  leadInMs?: number;
  contextLine?: string;
}

/** Premium reveals are prioritized Supreme -> Legendary -> standard while
 * retaining FIFO order inside each rarity band. Awards have already occurred. */
export const enqueueModAcquisition = (
  queue: ModAcquisitionPresentation[],
  request: ModAcquisitionPresentation
): void => {
  if (request.rarity === 'supreme') {
    const firstNonSupreme = queue.findIndex((queued) => queued.rarity !== 'supreme');
    if (firstNonSupreme < 0) queue.push(request);
    else queue.splice(firstNonSupreme, 0, request);
    return;
  }
  if (request.rarity !== 'legendary') {
    queue.push(request);
    return;
  }
  const firstStandard = queue.findIndex((queued) => queued.rarity !== 'supreme' && queued.rarity !== 'legendary');
  if (firstStandard < 0) queue.push(request);
  else queue.splice(firstStandard, 0, request);
};

export const calculateModRevealCardWidth = (
  viewportWidth: number,
  viewportHeight: number,
  legendary: boolean
): number => {
  const horizontalMargin = 40;
  const verticalReservation = legendary ? 150 : 130;
  const preferred = Math.max(96, Math.min(
    legendary ? 280 : 220,
    viewportWidth * (legendary ? 0.32 : 0.28)
  ));
  const maximumByWidth = Math.max(96, viewportWidth - horizontalMargin);
  const maximumByHeight = Math.max(96, (viewportHeight - verticalReservation) / 1.4);
  return Math.min(preferred, maximumByWidth, maximumByHeight);
};
