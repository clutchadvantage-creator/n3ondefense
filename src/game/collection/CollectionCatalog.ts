export type InfusionCategory = 'cosmetic' | 'blacksite';
export type CollectionMetric = 'bombsites' | 'enemies' | 'portals' | 'bosses' | 'turrets' | 'flawless' | 'dashes' | 'mods' | 'round' | 'credits';
export interface RelicDefinition {
  id: string; name: string; description: string; category: InfusionCategory; color: number;
  fragments: readonly { id: string; name: string }[];
}
export const RELICS: readonly RelicDefinition[] = [
  { id: 'identity-cipher', name: 'Identity Cipher', description: 'A holographic identity seal. Reconstruct its three interlocking plates to authorize Cosmetic Infusions.', category: 'cosmetic', color: 0x9b8aff,
    fragments: [{ id: 'cipher-crown', name: 'Prismatic Crown' }, { id: 'cipher-sigil', name: 'Identity Sigil' }, { id: 'cipher-seal', name: 'Chrome Seal' }] },
  { id: 'blacksite-core', name: 'Blacksite Core', description: 'An unregistered containment device. Assemble all three components to authorize Banned Technology Infusions.', category: 'blacksite', color: 0xff4565,
    fragments: [{ id: 'core-housing', name: 'Titanium Housing' }, { id: 'core-reactor', name: 'Restricted Reactor' }, { id: 'core-coupler', name: 'Neural Coupler' }] }
];
export interface TrophyDefinition { id: string; name: string; requirement: string; metric: CollectionMetric; target: number; color: number }
export const TROPHIES: readonly TrophyDefinition[] = [
  { id: 'demolition-expert', name: 'Demolition Expert', requirement: 'Detonate 1,000 bombsites', metric: 'bombsites', target: 1000, color: 0xffa45f },
  { id: 'exterminator', name: 'Exterminator', requirement: 'Destroy 5,000 enemies', metric: 'enemies', target: 5000, color: 0xff526b },
  { id: 'anomaly-explorer', name: 'Anomaly Explorer', requirement: 'Enter 100 anomaly portals', metric: 'portals', target: 100, color: 0xb086ff },
  { id: 'boss-breaker', name: 'Boss Breaker', requirement: 'Defeat 100 Arena bosses', metric: 'bosses', target: 100, color: 0xff677d },
  { id: 'automated-warfare', name: 'Automated Warfare', requirement: 'Deploy 1,000 turrets', metric: 'turrets', target: 1000, color: 0x73e0ff },
  { id: 'untouchable', name: 'Untouchable', requirement: 'Complete 25 cumulative flawless rounds', metric: 'flawless', target: 25, color: 0x83ffda },
  { id: 'speed-demon', name: 'Speed Demon', requirement: 'Perform 1,000 dashes', metric: 'dashes', target: 1000, color: 0xffed78 },
  { id: 'mod-collector', name: 'Mod Collector', requirement: 'Discover 50 unique Mods', metric: 'mods', target: 50, color: 0xdb96ff },
  { id: 'veteran-operative', name: 'Veteran Operative', requirement: 'Reach Round 30 in any mode', metric: 'round', target: 30, color: 0xffd68c },
  { id: 'credit-tycoon', name: 'Credit Tycoon', requirement: 'Earn 1,000,000 lifetime Credits', metric: 'credits', target: 1000000, color: 0x95ffad }
];
export const INFUSION_CATEGORIES = [
  { id: 'cosmetic' as const, name: 'COSMETIC INFUSIONS', relicId: 'identity-cipher', lock: 'REQUIRES IDENTITY CIPHER RECONSTRUCTION' },
  { id: 'blacksite' as const, name: 'BANNED TECHNOLOGY', relicId: 'blacksite-core', lock: 'REQUIRES BLACKSITE CORE RECONSTRUCTION' }
];
export const COLLECTION_DISPLAY_SLOTS = { trophies: 4, relics: 2 } as const;
export const fragmentRelic = (id: string): RelicDefinition | undefined => RELICS.find(r => r.fragments.some(f => f.id === id));
