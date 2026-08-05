import type Phaser from 'phaser';
import type { AudioSfxName } from './config/audio';
import type { AbilityBindings } from './config/controls';

export type SceneKey = 'boot' | 'splash' | 'local-profiles' | 'menu' | 'arena' | 'upgrades' | 'cosmetics' | 'results' | 'options' | 'round-finished' | 'loading';

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
export type PickupType = 'health' | 'energy' | 'damageBoost' | 'speedBoost' | 'rapidFire' | 'credits' | 'coreToken';
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
export type ArenaTemplate = 'open-grid' | 'corridor-network' | 'central-fortress' | 'split-arena' | 'hazard-maze';

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

export interface CosmeticOption {
  id: string;
  category: 'playerColor' | 'playerShape' | 'projectileColor' | 'trailColor' | 'bombColor' | 'turretSkin' | 'fenceStyle' | 'dashTrail';
  label: string;
  currency: 'credits' | 'coreTokens';
  cost: number;
  color: number;
}

export interface GameSaveData {
  credits: number;
  coreTokens: number;
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
  };
}

export interface ArenaReward {
  credits: number;
  coreTokens: number;
  reason: 'victory' | 'playerDead' | 'bombDefused';
  round?: number;
  seed?: number;
}

export interface ArenaSessionState {
  baseSeed: number;
  round: number;
  objectiveMode: ObjectiveMode;
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
}
