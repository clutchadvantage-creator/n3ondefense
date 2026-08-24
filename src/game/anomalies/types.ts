import type Phaser from 'phaser';
import type { Player } from '../entities/Player.ts';
import type { EquippedModSnapshot, RunProtocolId } from '../mods/types.ts';
import type { PlayerStats, WeaponStats, EnergyStats, RectSpec } from '../types.ts';
import type { InputDevice } from '../input/ActionInput.ts';

export interface AnomalyInputBridge {
  readonly locked: boolean;
  readonly supported: boolean;
  worldPoint(camera: Phaser.Cameras.Scene2D.Camera, output?: Phaser.Math.Vector2): Phaser.Math.Vector2;
  requestLock(): void;
  showResume(message?: string): void;
  hidePrompt(): void;
}

export type AnomalyId = 'heist';
export type AnomalyState = 'waiting' | 'charging' | 'portal-ready' | 'transitioning' | 'suspended' | 'resolved';
export type AnomalyOutcome = 'completed' | 'failed' | 'declined' | 'round-ended' | 'scene-shutdown';

export type AnomalyMetricName =
  | 'anomaly_spawned'
  | 'anomaly_charge_progress'
  | 'anomaly_portal_opened'
  | 'anomaly_entry_confirmed'
  | 'anomaly_entry_denied'
  | 'anomaly_vault_opened'
  | 'anomaly_container_opened'
  | 'anomaly_ambush_started'
  | 'anomaly_extraction_started'
  | 'anomaly_completed'
  | 'anomaly_failed'
  | 'anomaly_reward_committed';

export interface AnomalyMetricEvent {
  name: AnomalyMetricName;
  anomalyId: AnomalyId;
  round: number;
  protocol: RunProtocolId;
  elapsedMs: number;
  cost?: number;
  progress?: number;
  target?: number;
  reason?: string;
  rewardKind?: keyof PendingAnomalyLoot | 'mod';
  rewardAmount?: number;
  damageDealt?: number;
  damageTaken?: number;
  containersOpened?: number;
  miniBossEncountered?: boolean;
  miniBossKilled?: boolean;
}

export interface AnomalyDefinition {
  id: AnomalyId;
  displayName: string;
  description: string;
  minimumRound: number;
  weight: number;
  chargeBase: number;
  chargePerRound: number;
  chargeMaximum: number;
  rarity?: 'rare' | 'very-rare' | 'endgame';
  requiredProtocols?: RunProtocolId[];
  supremeOnly?: boolean;
  minimumPlayerLevel?: number;
  layoutId?: string;
  encounterTableId?: string;
  rewardTableId?: string;
  environmentTheme?: string;
  portalVariant?: string;
  extractionRule?: 'interact' | 'survive' | 'objective';
}

export interface AnomalyRuntimeContext {
  scene: Phaser.Scene;
  player: Player;
  round: number;
  seed: number;
  protocol: RunProtocolId;
  bounds: RectSpec;
  isGameplayEligible(): boolean;
  isLocationValid(x: number, y: number, clearance: number): boolean;
  isInteractPressed(): boolean;
  interactionPrompt(): string;
  availableFluxCores(): number;
  spendFluxCores(amount: number): boolean;
  beginTransition(request: AnomalyEntryRequest): void;
  emitMetric(event: AnomalyMetricEvent): void;
}

export interface AnomalyEntryRequest {
  anomalyId: AnomalyId;
  definition: AnomalyDefinition;
  sessionId: string;
  cost: number;
  portal: { x: number; y: number };
}

export interface PendingAnomalyLoot {
  credits: number;
  coreTokens: number;
  plasmaChips: number;
  fluxCores: number;
  modIds: string[];
}

export interface HeistAbilityConfig {
  energyCost: number;
  cooldownMs: number;
  maxActive: number;
  damage: number;
  hp: number;
  durationMs: number;
  range: number;
  fireRate: number;
  armMs: number;
  radius: number;
}

export interface HeistSessionData {
  sessionId: string;
  anomalyId: 'heist';
  cost: number;
  round: number;
  seed: number;
  protocol: RunProtocolId;
  sourcePortal: { x: number; y: number };
  player: {
    textureKey: string;
    tint: number | null;
    stats: PlayerStats;
    energyStats: EnergyStats;
    weapon: WeaponStats;
    hp: number;
    energy: number;
    permanentSpeedMultiplier: number;
    equippedMods: EquippedModSnapshot[];
  };
  abilities: {
    fence: HeistAbilityConfig;
    turret: HeistAbilityConfig;
    mine: HeistAbilityConfig;
    shieldDurationMs: number;
    shieldCooldownMs: number;
    shieldEnergyCost: number;
  };
  inputBridge?: AnomalyInputBridge;
  initialInputDevice?: InputDevice;
  dev?: { forceMiniBoss?: boolean | null };
}

export interface AnomalyReturnResult {
  sessionId: string;
  anomalyId: AnomalyId;
  success: boolean;
  sourcePortal: { x: number; y: number };
  loot: PendingAnomalyLoot;
  reason: 'extracted' | 'player-dead' | 'scene-shutdown';
}
