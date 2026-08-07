export type ModCategory = 'weapon' | 'player' | 'defense' | 'bombSite' | 'utility';
export type ModRarity = 'common' | 'uncommon' | 'rare' | 'prototype' | 'legendary';
export type ModRank = 1 | 2 | 3;
export type ModSlot = 'weapon' | 'player' | 'defense' | 'bombSite' | 'wildcard';
export type RunProtocolId = 'normal' | 'overdrive';
export type ModDropSource = 'normalEnemy' | 'eliteEnemy' | 'milestone';

export interface ModDefinition {
  id: string;
  name: string;
  description: string;
  category: ModCategory;
  rarity: ModRarity;
  maxRank: 3;
  rankDescriptions: Record<ModRank, string>;
  tags: string[];
  dropWeight: number;
}

export interface OwnedModState {
  rank: ModRank;
  duplicates: number;
  discovered: boolean;
  acquiredCount: number;
  firstAcquiredAt?: string;
}

export type ModInventory = Record<string, OwnedModState>;
export type ModLoadoutSlots = Record<ModSlot, string | null>;

export interface SavedModLoadout {
  id: string;
  name: string;
  slots: ModLoadoutSlots;
}

export interface LocalModCollection {
  inventory: ModInventory;
  loadouts: SavedModLoadout[];
  activeLoadoutId: string;
}

export interface ProtocolPreference {
  preferred: RunProtocolId;
}

export interface ModRewardRecord {
  modId: string;
  duplicate: boolean;
  source: ModDropSource;
}

export interface EquippedModSnapshot {
  id: string;
  rank: ModRank;
}
