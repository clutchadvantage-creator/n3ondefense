export interface PremiumModRevealReturnContext {
  requiresAcknowledgement: boolean;
  pointerWasLocked: boolean;
  pointerIsLocked: boolean;
  mouseInput: boolean;
  roundMustRemainPaused: boolean;
  bossCollection: boolean;
}

export type PremiumModRevealReturnMode =
  | 'remain-paused'
  | 'boss-collection'
  | 'await-pointer-lock'
  | 'resume-gameplay';

/**
 * Pointer lock can only be requested from the trusted Continue activation.
 * Completed/failed rounds and boss-loot collection deliberately retain a
 * visible menu cursor instead.
 */
export const shouldRequestPremiumRevealPointerLock = (
  context: PremiumModRevealReturnContext
): boolean => context.requiresAcknowledgement
  && context.pointerWasLocked
  && context.mouseInput
  && !context.roundMustRemainPaused
  && !context.bossCollection;

/** Resolves the post-reveal owner state without depending on Phaser runtime. */
export const resolvePremiumModRevealReturn = (
  context: PremiumModRevealReturnContext
): PremiumModRevealReturnMode => {
  if (context.roundMustRemainPaused) return 'remain-paused';
  if (context.bossCollection) return 'boss-collection';
  if (context.requiresAcknowledgement
    && context.pointerWasLocked
    && context.mouseInput
    && !context.pointerIsLocked) return 'await-pointer-lock';
  return 'resume-gameplay';
};
