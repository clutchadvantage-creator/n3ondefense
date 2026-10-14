import { RELICS } from './CollectionCatalog.ts';
import type { CollectionState } from './CollectionProgress.ts';
import { getEffectiveModRarityDropChance, type ModDropRequest } from '../mods/ModDropService.ts';

export const relicDropChance = (request: ModDropRequest): number => Math.min(0.35,
  getEffectiveModRarityDropChance({ ...request, guaranteed: false }, 'epic') * (request.source === 'boss' || request.source === 'anomaly' ? 2 : 1));
export const rollRelicFragment = (state: CollectionState, reserved: ReadonlySet<string>, chance: number, random = Math.random): string | null => {
  if (random() >= chance) return null;
  const pool = RELICS.filter(r => !state.completedRelics.includes(r.id)).flatMap(r => r.fragments)
    .filter(f => !state.fragments.includes(f.id) && !reserved.has(f.id));
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].id : null;
};
