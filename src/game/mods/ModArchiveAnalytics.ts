import { MOD_BY_ID, MOD_DEFINITIONS } from './definitions.ts';
import { MOD_BALANCE } from './modBalance.ts';
import type {
  LocalModCollection,
  ModCardInstance,
  ModCategory,
  ModRarity
} from './types.ts';

export const ARCHIVE_RARITIES: readonly ModRarity[] = [
  'common', 'uncommon', 'rare', 'epic', 'legendary', 'supreme'
];

export const ARCHIVE_CATEGORIES: readonly ModCategory[] = [
  'weapon', 'player', 'defense', 'bombSite', 'utility'
];

export interface ModArchiveAnalytics {
  totalCards: number;
  matchingCards: number;
  discoveredDefinitions: number;
  totalDefinitions: number;
  equippedCards: number;
  infusedCards: number;
  recyclableCards: number;
  salvagePlasma: number;
  page: number;
  pageCount: number;
  rarityCounts: Record<ModRarity, number>;
  categoryCounts: Record<ModCategory, number>;
  rankCounts: [number, number, number, number];
  signalTrace: readonly number[];
}

export interface ModArchiveAnalyticsRequest {
  collection: LocalModCollection;
  matchingCards: readonly ModCardInstance[];
  equippedCardIds: ReadonlySet<string>;
  recyclableCards: readonly ModCardInstance[];
  selectedCardId?: string;
  page: number;
  pageCount: number;
}

const createCountRecord = <T extends string>(keys: readonly T[]): Record<T, number> =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;

/** Deterministic presentation trace: stable per selection without owning state. */
export const createArchiveSignalTrace = (seed: string, size = 14): readonly number[] => {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }
  const trace: number[] = [];
  for (let index = 0; index < Math.max(4, size); index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    trace.push(0.16 + ((state >>> 0) % 700) / 1000);
  }
  return trace;
};

export const buildModArchiveAnalytics = (request: ModArchiveAnalyticsRequest): ModArchiveAnalytics => {
  const rarityCounts = createCountRecord(ARCHIVE_RARITIES);
  const categoryCounts = createCountRecord(ARCHIVE_CATEGORIES);
  const rankCounts: [number, number, number, number] = [0, 0, 0, 0];
  let infusedCards = 0;

  for (const card of request.collection.cards) {
    const definition = MOD_BY_ID.get(card.modId);
    if (!definition) continue;
    rarityCounts[definition.rarity] += 1;
    categoryCounts[definition.category] += 1;
    rankCounts[card.upgradeLevel] += 1;
    if (card.infusionId) infusedCards += 1;
  }

  let salvagePlasma = 0;
  for (const card of request.recyclableCards) {
    const definition = MOD_BY_ID.get(card.modId);
    if (definition) salvagePlasma += MOD_BALANCE.duplicatePlasmaValueByRarity[definition.rarity];
  }

  const discoveredDefinitions = MOD_DEFINITIONS.reduce(
    (count, definition) => count + (request.collection.inventory[definition.id]?.discovered ? 1 : 0),
    0
  );
  const traceSeed = request.selectedCardId
    ?? `${request.page}:${request.matchingCards.length}:${discoveredDefinitions}`;

  return {
    totalCards: request.collection.cards.length,
    matchingCards: request.matchingCards.length,
    discoveredDefinitions,
    totalDefinitions: MOD_DEFINITIONS.length,
    equippedCards: request.equippedCardIds.size,
    infusedCards,
    recyclableCards: request.recyclableCards.length,
    salvagePlasma,
    page: request.page,
    pageCount: request.pageCount,
    rarityCounts,
    categoryCounts,
    rankCounts,
    signalTrace: createArchiveSignalTrace(traceSeed)
  };
};

