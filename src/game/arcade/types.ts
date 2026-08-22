import type Phaser from 'phaser';
import type { Boss } from '../bosses/Boss.ts';
import type { BossAttackKind, BossProjectileSpec } from '../bosses/BossEncounter.ts';
import type { BossArchetype } from '../config/bossBalance.ts';
import type { RunModeFamily } from '../config/modeBalance.ts';
import type { Enemy } from '../enemies/Enemy.ts';
import type { Player } from '../entities/Player.ts';
import type { RunProtocolId } from '../mods/types.ts';
import type { EnemyType, RectSpec } from '../types.ts';

export type ArcadeEventId = 'golden-hunt' | 'mini-boss' | 'neon-circuit';
export type ArcadeStopReason = 'success' | 'failed' | 'timeout' | 'round-ended' | 'player-dead' | 'scene-shutdown' | 'replaced';

export type ArcadeMetricName =
  | 'arcade_event_started'
  | 'arcade_event_completed'
  | 'arcade_event_failed'
  | 'golden_enemy_killed'
  | 'golden_hunt_completed'
  | 'arcade_miniboss_spawned'
  | 'arcade_miniboss_killed'
  | 'arcade_miniboss_completed'
  | 'neon_checkpoint_reached'
  | 'neon_circuit_completed';

export interface ArcadeMetricEvent {
  name: ArcadeMetricName;
  eventId: ArcadeEventId;
  round: number;
  protocol: RunProtocolId;
  elapsedMs: number;
  progress?: number;
  target?: number;
  bossType?: BossArchetype;
  success?: boolean;
  reason?: ArcadeStopReason;
  rewardKind?: ArcadeRewardKind;
  rewardAmount?: number;
}

export type ArcadeGameplayEvent =
  | { type: 'enemy-killed'; enemy: Enemy }
  | { type: 'round-ending'; reason: ArcadeStopReason };

export interface ArcadeEventOutcome {
  success: boolean;
  reason: ArcadeStopReason;
}

export interface ArcadeEventDefinition {
  id: ArcadeEventId;
  displayName: string;
  description: string;
  weight: number;
  minimumRound: number;
  durationMs: number;
  reward: ArcadeRewardProfile;
}

export type ArcadeRewardKind = 'credits' | 'core-tokens' | 'flux-cores' | 'plasma-chips' | 'mod';

export interface ArcadeRewardOption {
  kind: ArcadeRewardKind;
  weight: number;
  baseAmount?: number;
  amountPerRound?: number;
}

export interface ArcadeRewardProfile {
  kind: 'random-pool';
  options: readonly ArcadeRewardOption[];
}

export interface ArcadeGrantedReward {
  kind: ArcadeRewardKind;
  amount: number;
  label: string;
}

export interface ArcadeEnemySpawnRequest {
  type: EnemyType;
  x: number;
  y: number;
}

export interface ArcadeRuntimeContext {
  scene: Phaser.Scene;
  player: Player;
  round: number;
  seed: number;
  protocol: RunProtocolId;
  modeFamily: RunModeFamily;
  bounds: RectSpec;
  walls: Phaser.Physics.Arcade.StaticGroup;
  particlesEnabled: boolean;
  isBlocked(x: number, y: number): boolean;
  findSpawnPoints(count: number, minimumPlayerDistance: number): Array<{ x: number; y: number }>;
  findCheckpointPoints(count: number): Array<{ x: number; y: number }>;
  spawnEnemy(request: ArcadeEnemySpawnRequest): Enemy | null;
  removeEnemy(enemy: Enemy): void;
  fireBossProjectile(spec: BossProjectileSpec): void;
  applyBossAreaDamage(x: number, y: number, radius: number, damage: number, attack: BossAttackKind): void;
  retireBossProjectiles(): void;
  presentMiniBossSpawn(x: number, y: number, color: number): void;
  playBossAttackCue(attack: BossAttackKind): void;
  playArcadeCue(cue: 'circuit-gate'): void;
  grantCredits(amount: number): void;
  grantCoreTokens(amount: number): void;
  grantFluxCores(amount: number): void;
  grantPlasmaChips(amount: number): void;
  grantGuaranteedMod(x: number, y: number): void;
  emitMetric(event: ArcadeMetricEvent): void;
}

export interface ArcadeEvent {
  readonly id: ArcadeEventId;
  start(activeElapsedMs: number): boolean;
  update(activeElapsedMs: number, deltaMs: number): ArcadeEventOutcome | null;
  handleGameplayEvent(event: ArcadeGameplayEvent, activeElapsedMs: number): ArcadeEventOutcome | null;
  objectiveText(activeElapsedMs: number): string;
  cleanup(reason: ArcadeStopReason): void;
  getBossTarget?(): Boss | null;
}

export interface ArcadeEventFactory {
  create(context: ArcadeRuntimeContext, definition: ArcadeEventDefinition): ArcadeEvent;
}
