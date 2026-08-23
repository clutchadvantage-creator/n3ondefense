export type ModCategory = 'weapon' | 'player' | 'defense' | 'bombSite' | 'utility';
export type ModRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'supreme';
export type ModRank = 0 | 1 | 2 | 3;
export type ModSlot = 'weapon' | 'player' | 'defense' | 'bombSite' | 'wildcard';
export type RunProtocolId =
  | 'normal'
  | 'overdrive'
  | 'overdrive-orion'
  | 'overdrive-ares'
  | 'overdrive-lyra'
  | 'overdrive-draco'
  | 'overdrive-phoenix'
  | 'overdrive-hydra'
  | 'overdrive-andromeda'
  | 'overdrive-perseus'
  | 'overdrive-pegasus'
  | 'supreme-leo'
  | 'supreme-gemini'
  | 'supreme-cassiopeia'
  | 'supreme-aquila'
  | 'supreme-ursa-major'
  | 'supreme-scorpius'
  | 'supreme-taurus'
  | 'supreme-virgo'
  | 'supreme-capricornus'
  | 'supreme-delphinus'
  | 'supreme-centaurus';
export type ModDropSource = 'normalEnemy' | 'eliteEnemy' | 'milestone' | 'boss' | 'arcade';
export type ModVariant = 'standard' | 'corrupted';
export type ModInfusionId =
  | 'enemy-growth'
  | 'detonation-fireworks'
  | 'prismatic-rounds'
  | 'holo-afterimage'
  | 'pickup-orbit'
  | 'ghost-echoes'
  | 'arcade-pop';

export type ModStat =
  | 'weaponDamage'
  | 'weaponFireRate'
  | 'weaponProjectileSpeed'
  | 'weaponCritChance'
  | 'weaponCritDamage'
  | 'weaponHeatPerShot'
  | 'weaponMaxHeat'
  | 'weaponCooling'
  | 'weaponEnergyCost'
  | 'playerMaxHealth'
  | 'playerEnergyMax'
  | 'playerEnergyRegen'
  | 'playerMoveSpeed'
  | 'playerDashCooldown'
  | 'playerDashDistance'
  | 'playerPickupRadius'
  | 'playerInvulnerability'
  | 'gasDamageTaken'
  | 'fenceDamage'
  | 'fenceHealth'
  | 'fenceDuration'
  | 'fenceMaxActive'
  | 'fenceCooldown'
  | 'fenceEnergyCost'
  | 'turretDamage'
  | 'turretHealth'
  | 'turretFireRate'
  | 'turretRange'
  | 'turretMaxActive'
  | 'turretCooldown'
  | 'turretEnergyCost'
  | 'mineDamage'
  | 'mineRadius'
  | 'mineArmTime'
  | 'mineMaxActive'
  | 'mineCooldown'
  | 'mineEnergyCost'
  | 'shieldDuration'
  | 'shieldCooldown'
  | 'shieldEnergyCost'
  | 'healthPickupValue'
  | 'energyPickupValue'
  | 'buffDuration'
  | 'creditValue'
  | 'enemyPickupChance'
  | 'bombDuration';

export interface ModStatModifier {
  stat: ModStat;
  mode: 'multiply' | 'add';
  values: Record<ModRank, number>;
}

export interface ModDefinition {
  id: string;
  name: string;
  icon: string;
  iconColor: number;
  description: string;
  category: ModCategory;
  rarity: ModRarity;
  maxRank: 3;
  rankDescriptions: Record<ModRank, string>;
  tags: string[];
  dropWeight: number;
  variant?: ModVariant;
  positiveEffect?: string;
  negativeEffect?: string;
  modifiers?: readonly ModStatModifier[];
}

export interface ModCardInstance {
  instanceId: string;
  modId: string;
  acquiredAt: string;
  infusionId?: ModInfusionId;
  upgradeLevel: ModRank;
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
  cardSlots: ModLoadoutSlots;
}

export interface LocalModCollection {
  inventory: ModInventory;
  cards: ModCardInstance[];
  plasmaChips: number;
  /** Purchased saved configurations, never additional equipped Mod slots. */
  purchasedLoadoutSlots: number;
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
  /** Cosmetic-only state needed to preserve the exact equipped card across rounds. */
  infusionId?: ModInfusionId;
}
