import { TUTORIAL_SEQUENCES } from '../tutorial/TutorialRegistry.ts';
import type { LyraMessage } from './LyraTypes.ts';
import { LYRA_PRIORITY as P } from './LyraTypes.ts';

const context = (id: string, text: string, scenes: string[] = ['arena']): LyraMessage =>
  ({ id, text, scenes, mode: 'GUIDANCE', priority: P.context, once: 'profile', expiryMs: 12000 });
export const LYRA_MESSAGES: readonly LyraMessage[] = [
  { id: 'warning.health', text: 'Integrity critical. Move clear and recover health.', mode: 'WARNING', priority: P.critical, cooldownMs: 45000, expiryMs: 2000, condition: 'low-health' },
  { id: 'warning.defuse', text: 'Charge under disarm. Interrupt the defusers now.', mode: 'WARNING', priority: P.critical, cooldownMs: 20000, expiryMs: 2000, condition: 'defusing' },
  { id: 'tactical.planted', text: 'Charge armed. Hold this site and keep the defusers off it.', mode: 'TACTICAL', priority: P.gameplay, cooldownMs: 90000, expiryMs: 3000 },
  { id: 'event.arcade.complete', text: 'Arcade objective complete. Rewards secured.', mode: 'EVENT', priority: P.event, cooldownMs: 45000, expiryMs: 4000, scenes: ['arena'] },
  { id: 'event.arcade.failed', text: 'Arcade window closed. Return to the primary objective.', mode: 'EVENT', priority: P.event, cooldownMs: 45000, expiryMs: 4000, scenes: ['arena'] },
  context('context.pickup', 'Recovered supplies restore combat resources. Collect them when the approach is clear.'),
  context('context.anomaly', 'Anomaly access detected. Check the entry fee and extraction objective before committing.'),
  context('context.arcade', 'Arcade objective online. The notification console tracks your target and remaining time.'),
  context('context.hazard', 'Security hazards are active. Watch their warning zones and move before they fire.'),
  context('context.recalibration', 'Recalibration rolls a replacement stat. Review the cost, then compare the candidate before applying it.', ['garage']),
  context('context.infusion', 'Infusion changes this card’s visual finish. Review the appearance and resource cost before committing.', ['mods']),
  context('context.supreme', 'Supreme protocols are available. Inspect the requirements in Operations before deploying.', ['garage']),
  { id: 'system.ready', text: 'Systems linked. I am LYRA. Let’s keep your next deployment productive.', mode: 'SYSTEM', priority: P.system, once: 'profile', scenes: ['garage'] },
  { id: 'ambient.garage.1', text: 'A balanced loadout. A reassuring amount of engineering has gone into your survival.', mode: 'AMBIENT', priority: P.ambient, scenes: ['garage'], weight: 2, cooldownMs: 900000 },
  { id: 'ambient.garage.2', text: 'Take your time. The arena has never complained about receiving a prepared operative.', mode: 'AMBIENT', priority: P.ambient, scenes: ['garage'], weight: 1, cooldownMs: 900000 },
  { id: 'ambient.store.1', text: 'Permanent upgrades. My preferred form of optimism.', mode: 'AMBIENT', priority: P.ambient, scenes: ['upgrades'], weight: 1, cooldownMs: 900000 },
  ...TUTORIAL_SEQUENCES.flatMap(sequence => sequence.steps.map(step => ({
    id: `tutorial.${sequence.id}.${step.id}`, text: step.body, mode: 'GUIDANCE' as const,
    priority: P.training, tutorial: true, cooldownMs: 0, expiryMs: 1000
  })))
];
export const LYRA_MESSAGE_BY_ID = new Map(LYRA_MESSAGES.map(message => [message.id, message]));

/** Local recordings only. Paths relative to public/assets/audio/lyra/. Missing entries use the provider chain. */
export const LYRA_RECORDINGS: Record<string, Partial<Record<string, string>>> = {
  'en-US': {}
};
/** Set to an authored public-relative video path when footage is supplied. */
export const LYRA_ADVANCED_PREVIEW: string | null = null;
