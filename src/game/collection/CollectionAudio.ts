import { AudioManager } from '../systems/AudioManager.ts';

/** Register supplied recordings in the existing audio catalog/options before assigning these hooks. */
export const COLLECTION_AUDIO: Record<'pickup' | 'snap' | 'reconstructed' | 'trophy', Parameters<AudioManager['playSfx']>[0] | null> = {
  pickup: null, snap: null, reconstructed: null, trophy: null
};
export const playCollectionAudio = (hook: keyof typeof COLLECTION_AUDIO): void => {
  const name = COLLECTION_AUDIO[hook];
  if (name) AudioManager.get().playSfx(name);
};
