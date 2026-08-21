import type Phaser from 'phaser';
import type { AudioSfxName } from './config/audio';
import type { AbilityBindings } from './config/controls';
import type { EquippedModSnapshot, ModRewardRecord, RunProtocolId } from './mods/types.ts';
import type { AccountProgressionTier, CosmeticPriceTier, ModFocusSignalId, RunContractId } from './economy/types.ts';
import type { AimSettings, HudSettings } from './config/interfaceSettings.ts';

export type SceneKey = 'boot' | 'splash' | 'local-profiles' | 'menu' | 'arena' | 'legendary-mod-reveal' | 'upgrades' | 'cosmetics' | 'mods' | 'garage' | 'results' | 'options' | 'round-finished' | 'loading';

export enum RoundState {
  PrePlant = 'PrePlant',
  Planting = 'Planting',
  Defense = 'Defense',
  Defusing = 'Defusing',
  Victory = 'Victory',
  Defeat = 'Defeat',
  Paused = 'Paused'
}

export type EnemyType = 'grunt' | 'shooter' | 'defuser' | 'tank' | 'disruptor' | 'star';
export type PickupType = 'health' | 'energy' | 'damageBoost' | 'speedBoost' | 'rapidFire' | 'ricochet' | 'grenadeRounds' | 'scattershot' | 'credits' | 'coreToken' | 'plasmaChip' | 'fluxCore';
export type AbilityType = 'fence' | 'turret' | 'mine';

export enum BombSiteState {
  Locked = 'Locked',
  Available = 'Available',
  Planting = 'Planting',
  Armed = 'Armed',
  BeingDefused = 'BeingDefused',
  Detonated = 'Detonated',
  Destroyed = 'Destroyed'
}

export type ObjectiveMode = 'open' | 'sequential';
export type ArenaTemplate =
  | 'open-field'
  | 'islands'
  | 'fortress'
  | 'ring'
  | 'split'
  | 'hub-spoke'
  | 'canyon'
  | 'maze'
  | 'chambers'
  | 'asymmetric-clusters'
  | 'crossroads'
  | 'perimeter';

export interface ArenaTheme {
  id: string;
  primary: number;
  secondary: number;
  accent: number;
}

export interface RectSpec {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ObstacleKind =
  | 'circle'
  | 'square'
  | 'rectangle'
  | 'triangle'
  | 'hexagon'
  | 'octagon'
  | 'crate'
  | 'energy-column'
  | 'machinery'
  | 'broken-wall'
  | 'small-barricade'
  | 'central-structure';

export interface GeneratedObstacle {
  id: string;
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
}

export interface ArenaLayout {
  seed: number;
  template: ArenaTemplate;
  theme: ArenaTheme;
  walls: RectSpec[];
  obstacles: GeneratedObstacle[];
  playerSpawn: Phaser.Math.Vector2;
  enemySpawns: Phaser.Math.Vector2[];
  bombSites: Phaser.Math.Vector2[];
  decorativeNeon: RectSpec[];
  generation: ArenaGenerationMetadata;
}

export interface ArenaGenerationMetadata {
  attempt: number;
  bounds: RectSpec;
  openSpacePercentage: number;
  majorStructureCount: number;
  chokePointCount: number;
  connectedRegionCount: number;
  symmetryScore: number;
  orientationBias: { horizontal: number; vertical: number; diagonal: number };
  occupancy: number[];
  similarityScore: number;
  fingerprintHash?: string;
  closestHistoryAge?: number;
  similarityRejected?: number;
  validationRejected?: number;
  fallbackUsed?: boolean;
  validation: string[];
}

export interface RoundDefinition {
  round: number;
  seed: number;
  template: ArenaTemplate;
  siteCount: number;
  objectiveMode: ObjectiveMode;
}

export interface BombSiteRuntime {
  id: string;
  letter: string;
  x: number;
  y: number;
  state: BombSiteState;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  timerMs: number;
  defuseMs: number;
  plantedAt: number;
  activeBomb: boolean;
  scorch: Phaser.GameObjects.Arc | null;
}

export interface WeaponStats {
  name: string;
  damage: number;
  fireRate: number;
  projectileSpeed: number;
  critChance: number;
  heatPerShot: number;
  maxHeat: number;
  cooldownRate: number;
}

export interface PlayerStats {
  maxHealth: number;
  moveSpeed: number;
  dashCooldownMs: number;
  dashDistanceMultiplier: number;
  pickupRadius: number;
  invulnMs: number;
}

export interface EnergyStats {
  max: number;
  regenPerSecond: number;
}

export interface AbilityStats {
  energyCost: number;
  cooldownMs: number;
  maxActive: number;
}

export interface UpgradeDefinition {
  id: string;
  category: 'player' | 'weapon' | 'fence' | 'turret' | 'mine';
  label: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  growth: number;
  effectPerLevel: number;
}

export type CosmeticVisualShape =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'star'
  | 'hexagon'
  | 'diamond'
  | 'cross'
  | 'spaceship'
  | 'clover'
  | 'iceCream'
  | 'airplane'
  | 'ufo'
  | 'pulse'
  | 'missile'
  | 'lightning'
  | 'orb'
  | 'sword'
  | 'bubbles'
  | 'balloons'
  | 'carrot';

export interface CosmeticOption {
  id: string;
  category: 'playerColor' | 'playerShape' | 'projectileColor' | 'projectileShape' | 'trailColor' | 'bombColor' | 'turretSkin' | 'fenceStyle' | 'dashTrail';
  label: string;
  currency: 'credits' | 'coreTokens';
  cost: number;
  color: number;
  colorMode?: 'prism';
  priceTier?: CosmeticPriceTier;
  visualShape?: CosmeticVisualShape;
  textureKey?: string;
}

export interface GameSaveData {
  credits: number;
  coreTokens: number;
  fluxCores: number;
  upgrades: Record<string, number>;
  unlockedCosmetics: string[];
  equippedCosmetics: Partial<Record<CosmeticOption['category'], string>>;
  settings: {
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
    soundVolumes: Record<AudioSfxName, number>;
    screenShake: boolean;
    particles: boolean;
    abilityBindings: AbilityBindings;
    hud: HudSettings;
    aim: AimSettings;
    contextualTutorials: boolean;
    buttonJiggle: number;
  };
}

export interface ArenaReward {
  credits: number;
  runCreditsEarned: number;
  coreTokens: number;
  fluxCores: number;
  reason: 'victory' | 'playerDead' | 'bombDefused';
  round?: number;
  seed?: number;
  protocol: RunProtocolId;
  equippedMods: EquippedModSnapshot[];
  modsEarned: ModRewardRecord[];
  runDurationMs: number;
  highestRound: number;
  modFocus: ModFocusSignalId | null;
  contract: RunContractId | null;
  creditsSpentBeforeRun: number;
  upgradeCompletionPercentage: number;
  accountProgressionTier: AccountProgressionTier;
}

export interface ArenaSessionState {
  baseSeed: number;
  round: number;
  objectiveMode: ObjectiveMode;
  protocol: RunProtocolId;
  runStartedAt?: number;
  equippedMods?: EquippedModSnapshot[];
  modsEarned?: ModRewardRecord[];
  modFocus?: ModFocusSignalId | null;
  contract?: RunContractId | null;
  creditsSpentBeforeRun?: number;
  upgradeCompletionPercentage?: number;
  accountProgressionTier?: AccountProgressionTier;
  runCreditsEarned?: number;
}

export interface RoundFinishedPayload {
  baseSeed: number;
  completedRound: number;
  completedSeed: number;
  completedTemplate: ArenaTemplate;
  nextRound: number;
  nextSeed: number;
  nextTemplate: ArenaTemplate;
  objectiveMode: ObjectiveMode;
  creditsGained: number;
  coreTokensGained: number;
  plasmaChipsGained: number;
  fluxCoresGained: number;
  bossDefeated: string | null;
  protocol: RunProtocolId;
  equippedMods: EquippedModSnapshot[];
  modsEarned: ModRewardRecord[];
  runStartedAt: number;
  modFocus: ModFocusSignalId | null;
  contract: RunContractId | null;
  creditsSpentBeforeRun: number;
  upgradeCompletionPercentage: number;
  accountProgressionTier: AccountProgressionTier;
  runCreditsEarned: number;
}
