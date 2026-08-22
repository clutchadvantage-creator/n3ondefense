import type Phaser from 'phaser';
import type { Boss } from '../bosses/Boss.ts';
import type { BossAttackKind, BossProjectileSpec } from '../bosses/BossEncounter.ts';
import type { BossArchetype } from '../config/bossBalance.ts';
import type { RunModeFamily } from '../config/modeBalance.ts';
import type { Enemy } from '../enemies/Enemy.ts';
import type { Player } from '../entities/Player.ts';
import type { RunProtocolId } from '../mods/types.ts';
import type { EnemyType, RectSpec } from '../types.ts';

export type ArcadeEventId =
  | 'golden-hunt'
  | 'mini-boss'
  | 'neon-circuit'
  | 'hot-package'
  | 'packet-snatcher'
  | 'redline';
export type ArcadeStopReason = 'success' | 'failed' | 'timeout' | 'round-ended' | 'player-dead' | 'scene-shutdown' | 'replaced';
export type ArcadePresentationCue =
  | 'circuit-gate'
  | 'hot-package-inbound'
  | 'hot-package-impact'
  | 'hot-package-open'
  | 'hot-package-failed'
  | 'packet-snatcher-alert'
  | 'packet-snatcher-intercepted'
  | 'packet-snatcher-escaped'
  | 'redline-boot'
  | 'redline-stage'
  | 'redline-rupture'
  | 'redline-failed';

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
  | 'neon_circuit_completed'
  | 'hot_package_secured'
  | 'packet_snatcher_destroyed'
  | 'packet_snatcher_escaped'
  | 'redline_stage_reached'
  | 'redline_completed'
  | 'arcade_reward_rolled'
  | 'arcade_pickup_spawned'
  | 'arcade_pickup_collected'
  | 'arcade_pickup_expired';

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

export interface ArcadeRewardPlan {
  origin: { x: number; y: number };
  /** Random rolls against profile. Defaults to one for legacy events. */
  rolls?: number;
  /** Fixed physical rewards, useful for guaranteed Mod drops. */
  guaranteed?: ReadonlyArray<{ kind: ArcadeRewardKind; amount?: number }>;
  /** Event/quality-specific pool override. */
  profile?: ArcadeRewardProfile;
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

export type ArcadeRewardKind =
  | 'credits'
  | 'core-tokens'
  | 'flux-cores'
  | 'plasma-chips'
  | 'mod'
  | 'grenade-rounds'
  | 'scattershot-rounds';

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
  playArcadeCue(cue: ArcadePresentationCue): void;
  navigateEventEnemy(enemy: Enemy, targetX: number, targetY: number, speed: number): void;
  findExtractionPoint(fromX: number, fromY: number): { x: number; y: number } | null;
  spawnPhysicalRewards(
    eventId: ArcadeEventId,
    origin: { x: number; y: number },
    rewards: readonly ArcadeGrantedReward[]
  ): void;
  emitMetric(event: ArcadeMetricEvent): void;
}

export interface ArcadeEvent {
  readonly id: ArcadeEventId;
  start(activeElapsedMs: number): boolean;
  update(activeElapsedMs: number, deltaMs: number): ArcadeEventOutcome | null;
  handleGameplayEvent(event: ArcadeGameplayEvent, activeElapsedMs: number): ArcadeEventOutcome | null;
  objectiveText(activeElapsedMs: number): string;
  rewardPlan?(): ArcadeRewardPlan;
  cleanup(reason: ArcadeStopReason): void;
  getBossTarget?(): Boss | null;
}

export interface ArcadeEventFactory {
  create(context: ArcadeRuntimeContext, definition: ArcadeEventDefinition): ArcadeEvent;
}
