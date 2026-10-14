import { COLLECTION_DISPLAY_SLOTS, RELICS, TROPHIES, fragmentRelic, type CollectionMetric, type InfusionCategory } from './CollectionCatalog.ts';

export interface CollectionCelebration { id: string; kind: 'fragment' | 'trophy'; itemId: string; acquiredAt: number; }
export interface CollectionState {
  version: 1;
  fragments: string[];
  completedRelics: string[];
  unlockedCategories: InfusionCategory[];
  progress: Record<CollectionMetric, number>;
  unlockedTrophies: string[];
  pending: CollectionCelebration[];
  displayedTrophies: string[];
  displayedRelics: string[];
}
const integer = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(v))) : 0;
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const strings = (v: unknown, valid: readonly string[]): string[] => Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string' && valid.includes(id)))] : [];
export const createCollectionState = (): CollectionState => ({ version: 1, fragments: [], completedRelics: [], unlockedCategories: [],
  progress: { bombsites: 0, enemies: 0, portals: 0, bosses: 0, turrets: 0, flawless: 0, dashes: 0, mods: 0, round: 0, credits: 0 },
  unlockedTrophies: [], pending: [], displayedTrophies: [], displayedRelics: [] });

/** Unlock projections are always derived from owned pieces, never trusted from a save flag. */
const reconstruct = (state: CollectionState): void => {
  state.completedRelics = RELICS.filter(r => r.fragments.every(f => state.fragments.includes(f.id))).map(r => r.id);
  state.unlockedCategories = RELICS.filter(r => state.completedRelics.includes(r.id)).map(r => r.category);
};
export const normalizeCollection = (value: unknown): CollectionState => {
  const raw = object(value), state = createCollectionState(), progress = object(raw.progress);
  state.fragments = strings(raw.fragments, RELICS.flatMap(r => r.fragments.map(f => f.id)));
  reconstruct(state);
  for (const metric of Object.keys(state.progress) as CollectionMetric[]) state.progress[metric] = integer(progress[metric]);
  state.unlockedTrophies = strings(raw.unlockedTrophies, TROPHIES.map(t => t.id));
  for (const trophy of TROPHIES) if (state.unlockedTrophies.includes(trophy.id)) state.progress[trophy.metric] = Math.max(state.progress[trophy.metric], trophy.target);
  const seen = new Set<string>();
  if (Array.isArray(raw.pending)) for (const entry of raw.pending) {
    const item = object(entry), kind = item.kind, itemId = String(item.itemId);
    const valid = kind === 'fragment' ? state.fragments.includes(itemId) : kind === 'trophy' && state.unlockedTrophies.includes(itemId);
    const id = `${kind}:${itemId}`;
    if (valid && !seen.has(id)) { seen.add(id); state.pending.push({ id, kind: kind as CollectionCelebration['kind'], itemId, acquiredAt: integer(item.acquiredAt) }); }
  }
  state.displayedTrophies = strings(raw.displayedTrophies, state.unlockedTrophies).slice(0, COLLECTION_DISPLAY_SLOTS.trophies);
  state.displayedRelics = strings(raw.displayedRelics, state.completedRelics).slice(0, COLLECTION_DISPLAY_SLOTS.relics);
  return state;
};
const queue = (state: CollectionState, kind: CollectionCelebration['kind'], itemId: string, now: number): void => {
  const id = `${kind}:${itemId}`;
  if (!state.pending.some(p => p.id === id)) state.pending.push({ id, kind, itemId, acquiredAt: now });
};
export const acquireFragment = (state: CollectionState, id: string, now = Date.now()): boolean => {
  if (!fragmentRelic(id) || state.fragments.includes(id)) return false;
  state.fragments.push(id); reconstruct(state); queue(state, 'fragment', id, now);
  return true;
};
export const advanceCollection = (state: CollectionState, metrics: Partial<Record<CollectionMetric, number>>, absolute = false, now = Date.now()): boolean => {
  let unlocked = false;
  for (const [key, value] of Object.entries(metrics)) {
    const metric = key as CollectionMetric;
    if (!(metric in state.progress)) continue;
    state.progress[metric] = absolute ? Math.max(state.progress[metric], integer(value)) : integer(state.progress[metric] + integer(value));
  }
  for (const trophy of TROPHIES) if (state.progress[trophy.metric] >= trophy.target && !state.unlockedTrophies.includes(trophy.id)) {
    state.unlockedTrophies.push(trophy.id); queue(state, 'trophy', trophy.id, now); unlocked = true;
  }
  return unlocked;
};
export const syncCollectionEvidence = (state: CollectionState, progress: { bombSitesDestroyed: number; enemiesDestroyed: number; bossesDefeated: number; highestRound: number; totalCreditsEarned: number }, inventory: Record<string, { discovered: boolean }>): boolean =>
  advanceCollection(state, { bombsites: progress.bombSitesDestroyed, enemies: progress.enemiesDestroyed, bosses: progress.bossesDefeated,
    round: progress.highestRound, credits: progress.totalCreditsEarned, mods: Object.values(inventory).filter(m => m.discovered).length }, true);

export const toggleCollectionDisplay = (state: CollectionState, kind: 'trophies' | 'relics', id: string): boolean => {
  const owned = kind === 'trophies' ? state.unlockedTrophies : state.completedRelics;
  const selection = kind === 'trophies' ? state.displayedTrophies : state.displayedRelics;
  if (!owned.includes(id)) return false;
  const index = selection.indexOf(id);
  if (index >= 0) selection.splice(index, 1);
  else { if (selection.length >= COLLECTION_DISPLAY_SLOTS[kind]) selection.shift(); selection.push(id); }
  return true;
};
