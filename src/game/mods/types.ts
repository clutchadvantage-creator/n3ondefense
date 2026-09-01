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
export type ModDropSource = 'normalEnemy' | 'eliteEnemy' | 'milestone' | 'boss' | 'arcade' | 'anomaly';
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

/** Multiplier stats whose smaller value is the beneficial direction. Keeping
 * this semantic beside ModStat prevents future card/dossier formatting from
 * assuming that a larger multiplier is always a buff. Values above 1 remain
 * valid when explicitly used as a corrupted penalty. */
export const LOWER_IS_BETTER_MOD_STATS: ReadonlySet<ModStat> = new Set<ModStat>([
  'weaponHeatPerShot',
  'weaponEnergyCost',
  'playerDashCooldown',
  'gasDamageTaken',
  'fenceCooldown',
  'fenceEnergyCost',
  'turretCooldown',
  'turretEnergyCost',
  'mineArmTime',
  'mineCooldown',
  'mineEnergyCost',
  'shieldCooldown',
  'shieldEnergyCost',
  'bombDuration'
]);

export type SupremeEffectFamily =
  | 'weapon'
  | 'survivability'
  | 'shield'
  | 'energy'
  | 'pickup'
  | 'bombsite'
  | 'mine'
  | 'turret'
  | 'enemy-control'
  | 'explosion'
  | 'mobility'
  | 'defense';

export interface SupremeEffectDescriptor {
  family: SupremeEffectFamily;
  label: string;
}

export interface ModStatModifier {
  stat: ModStat;
  mode: 'multiply' | 'add';
  values: Record<ModRank, number>;
}

export type PlasmaRecalibrationQuality = 'optimal' | 'enhanced' | 'stable' | 'degraded' | 'misaligned';

/** One permanent replacement of an existing, ordinary stat slot. The saved
 * normalized power is rank-independent; runtime resolves the four rank values
 * from the central calibration ranges so later card upgrades remain correct. */
export interface ModStatCalibration {
  slotIndex: number;
  stat: ModStat;
  mode: 'multiply' | 'add';
  quality: PlasmaRecalibrationQuality;
  normalizedPower: number;
  calibratedAt: string;
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
  /** Supreme-only dossier/card metadata. Runtime authority still comes from
   * rarity + the central protocol/loadout validators. */
  supremeEffects?: readonly [SupremeEffectDescriptor, SupremeEffectDescriptor, SupremeEffectDescriptor];
}

export interface ModCardInstance {
  instanceId: string;
  modId: string;
  acquiredAt: string;
  infusionId?: ModInfusionId;
  upgradeLevel: ModRank;
  calibrations?: ModStatCalibration[];
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
  /** Normal progression unlocks checkpoints; this independent preference
   * chooses which unlocked checkpoint the next Normal deployment will use. */
  selectedNormalStartRound: number;
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
  /** Exact per-card calibration state frozen with the encounter loadout. */
  calibrations?: ModStatCalibration[];
}
