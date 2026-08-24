/**
 * Dedicated Anomaly audio boundary. The first implementation deliberately
 * remains silent until purpose-built assets are supplied; no unrelated combat
 * sounds are substituted. Adding assets later only requires replacing this
 * adapter, not touching scheduling or HEIST gameplay.
 */
export type AnomalyAudioCue =
  | 'sphere-spawn'
  | 'charge-feed'
  | 'portal-open'
  | 'portal-enter'
  | 'heist-arrival'
  | 'vault-open'
  | 'vault-close'
  | 'container-break'
  | 'alarm'
  | 'extraction-open'
  | 'extraction-complete'
  | 'heist-failed';

export interface AnomalyAudioHooks {
  play(cue: AnomalyAudioCue): void;
  stopAll(): void;
}

export const createSilentAnomalyAudioHooks = (): AnomalyAudioHooks => ({
  play: () => undefined,
  stopAll: () => undefined
});

