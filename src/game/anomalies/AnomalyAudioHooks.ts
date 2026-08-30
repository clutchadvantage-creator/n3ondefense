import { AudioManager } from '../systems/AudioManager.ts';

/** Dedicated Anomaly audio boundary. Gameplay reports semantic lifecycle cues;
 * this adapter owns mixer routing, loop idempotency, and teardown. */
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

export const createAnomalyAudioHooks = (audio = AudioManager.get()): AnomalyAudioHooks => ({
  play: (cue) => {
    switch (cue) {
      case 'essence-absorption':
        audio.restartAnomalyPortalPower();
        break;
      case 'portal-rupture':
        audio.stopAnomalyPortalPower();
        break;
      case 'portal-idle':
        audio.stopAnomalyPortalPower();
        audio.startAnomalyPortalIdle();
        break;
      case 'portal-entry':
      case 'portal-return':
        audio.stopAnomalyPortalPower();
        audio.stopAnomalyPortalIdle();
        audio.stopHeistAlarm();
        audio.playSfx('anomalyPortalTransit');
        break;
      case 'door-open':
      case 'door-close':
        audio.playSfx('heistDoor');
        break;
      case 'warning-state':
        audio.startHeistAlarm();
        break;
      case 'heist-failed':
        audio.stopAnomalyPortalPower();
        audio.stopHeistAlarm();
        audio.stopAnomalyPortalIdle();
        break;
      default:
        break;
    }
  },
  stopAll: () => audio.stopAnomalySfx()
});
