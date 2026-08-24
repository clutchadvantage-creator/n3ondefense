/**
 * Dedicated Anomaly audio boundary. The first implementation deliberately
 * remains silent until purpose-built assets are supplied; no unrelated combat
 * sounds are substituted. Adding assets later only requires replacing this
 * adapter, not touching scheduling or HEIST gameplay.
 */
export type AnomalyAudioCue =
  | 'anomaly-spawn'
  | 'anomaly-charging'
  | 'essence-release'
  | 'essence-absorption'
  | 'portal-rupture'
  | 'portal-idle'
  | 'portal-entry'
  | 'facility-arrival'
  | 'corridor-ambience'
  | 'door-activation'
  | 'door-open'
  | 'door-close'
  | 'loot-container-impact'
  | 'loot-container-break'
  | 'loot-spawn'
  | 'ambush-trigger'
  | 'warning-state'
  | 'extraction-activation'
  | 'portal-return'
  | 'arena-reentry'
  | 'heist-failed';

export interface AnomalyAudioHooks {
  play(cue: AnomalyAudioCue): void;
  stopAll(): void;
}

export const createSilentAnomalyAudioHooks = (): AnomalyAudioHooks => ({
  play: () => undefined,
  stopAll: () => undefined
});
