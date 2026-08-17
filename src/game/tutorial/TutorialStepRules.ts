import type { TutorialStepDefinition } from './TutorialTypes.ts';

export type TutorialAdvancePolicy =
  | { type: 'manual'; label: 'GOT IT' | 'CONTINUE'; reason: 'acknowledgement' | 'action-unavailable' }
  | { type: 'event'; event: string }
  | { type: 'auto'; delayMs: number };

/**
 * Resolves progression once when a step is shown. This keeps informational,
 * action-gated, and intentionally timed steps from accidentally sharing timer
 * behavior while the player is reading.
 */
export function resolveTutorialAdvancePolicy(
  completion: TutorialStepDefinition['completion'],
  eventActionAvailable = true
): TutorialAdvancePolicy {
  if (completion.type === 'manual') {
    return { type: 'manual', label: 'GOT IT', reason: 'acknowledgement' };
  }
  if (completion.type === 'event') {
    return eventActionAvailable
      ? { type: 'event', event: completion.event }
      : { type: 'manual', label: 'CONTINUE', reason: 'action-unavailable' };
  }
  return { type: 'auto', delayMs: Math.max(250, completion.delayMs ?? 2500) };
}
