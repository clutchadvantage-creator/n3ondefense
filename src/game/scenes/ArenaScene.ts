import Phaser from 'phaser';
import { starterWeapon } from '../../data/weapons';
import { getUpgradeEffect, getUpgradeLevel } from '../../data/upgrades';
import { getCosmeticById, getCosmeticTextureKey } from '../../data/cosmetics';
import { COLORS, WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';
import { OBJECTIVE_CONFIG } from '../config/gameplay';
import { ABILITY_BALANCE, ENEMY_BALANCE, OBJECTIVE_BALANCE, PICKUP_BALANCE, PLAYER_BALANCE, REWARD_BALANCE, TANK_HOMING_MISSILE_BALANCE, WEAPON_BALANCE, getConcurrentSpawnPressure, getDefuseAssigneeCount, getDifficultyCurve, getSpawnCadenceMultiplier, getSpawnProfile } from '../config/balance';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import { Mine, STAR_DEATH_MINE_VISUAL_THEME } from '../abilities/Mine';
import { MineChargeRack } from '../abilities/MineChargeRack.ts';
import { getMineRackEnergyCost, getMineRackPatternOffsets } from '../abilities/MineRackSalvo';
import { resolveAbilityRuntimeConfig, resolveShieldRuntime, type AbilityRuntimeConfig } from '../gameplay/AbilityRuntimeRules.ts';
import { Turret } from '../abilities/Turret';
import { Fence } from '../abilities/Fence';
import { MAX_DISTINCT_FENCE_SPLITS, resolveFenceSplitStage } from '../abilities/FenceSplitRules.ts';
import { Player } from '../entities/Player';
import { baseEnemyStats, Enemy } from '../enemies/Enemy';
import { getTankHomingMissileSpeed, steerTankHomingMissile } from '../enemies/HomingMissile.ts';
import { ENEMY_ROBOT_FRAMES } from '../enemies/EnemyRobotFrames.ts';
import { BombSiteState, RoundState, type AbilityType, type ArenaLayout, type ArenaReward, type ArenaSessionState, type ArenaTemplate, type BombSiteRuntime, type EnemyType, type PickupType, type RectSpec, type RoundFinishedPayload } from '../types';
import { AudioManager } from '../systems/AudioManager';
import { BombSiteManager } from '../systems/BombSiteManager';
import { GameStateMachine } from '../systems/GameStateMachine';
import { GridPathfinder, type PathPoint } from '../systems/GridPathfinder';
import { Hud } from '../systems/Hud';
import type { HudAbilitySlot, HudPayload, HudRadarContact } from '../systems/Hud';
import { RoundManager } from '../systems/RoundManager';
import { SaveSystem } from '../systems/SaveSystem';
import { ArenaGenerator } from '../systems/ArenaGenerator';
import { LaserSecuritySystem } from '../systems/LaserSecuritySystem';
import { BombletHazardSystem } from '../systems/BombletHazardSystem';
import { GasHazardSystem } from '../systems/GasHazardSystem';
import { FluxCoreSystem } from '../systems/FluxCoreSystem';
import { FLUX_CORE_BALANCE } from '../config/fluxCores';
import { GAS_HAZARD_BALANCE } from '../config/gasHazards';
import type { HazardDamageTarget } from '../config/hazardScaling';
import { BOSS_ARCHETYPES, BOSS_BALANCE, getBossRewards, getBossTier, isBossRound, selectBossArchetype, type BossArchetype } from '../config/bossBalance';
import { BossEncounter, type BossAttackKind, type BossProjectileSpec } from '../bosses/BossEncounter';
import { BossIntroOverlay } from '../bosses/BossIntroOverlay.ts';
import { SeededRandom } from '../systems/SeededRandom';
import { startArenaLoad } from '../utils/runFlow';
import { createButton } from '../utils/ui';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { GameplayPointerLock } from '../input/GameplayPointerLock';
import { PlayerInput } from '../input/PlayerInput.ts';
import type { InputDevice } from '../input/ActionInput.ts';
import { MineSalvoInput, type MineSalvoInputResolution } from '../input/MineSalvoInput.ts';
import { DEFAULT_AIM_SETTINGS, normalizeAimSettings, type AimSettings } from '../config/interfaceSettings';
import { normalizeControllerSettings } from '../config/controllerSettings.ts';
import { applyEnemyDamageMode, applyEnemyHealthMode, getEnemyDefuseDuration, getModeSpawnCadence, getProtocolModeBalance, type RunModeFamily } from '../config/modeBalance.ts';
import { ARENA_GENERATION_CONFIG } from '../config/arenaGeneration.ts';
import { drawReticle } from '../ui/ReticleRenderer';
import { createPauseMenuView, type PauseMenuView } from '../ui/PauseMenuUi.ts';
import { ArenaCommandButton } from '../ui/ArenaCommandButton.ts';
import { compactBindingLabel } from '../config/controls';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { MOD_BALANCE, RUN_PROTOCOLS, normalizeRunProtocolId } from '../mods/modBalance.ts';
import { isGuaranteedMilestone, rollModDrop } from '../mods/ModDropService.ts';
import type { ModDefinition, ModDropSource, ModRewardRecord, ModSlot, RunProtocolId } from '../mods/types.ts';
import { magneticResistanceForEnemy, splitCurrentSecondaryDamage } from '../mods/ModRules.ts';
import { createModCardView } from '../mods/ModCardView.ts';
import { MOD_BY_ID } from '../mods/definitions.ts';
import { ModAcquisitionPresenter } from '../mods/ModAcquisitionPresenter.ts';
import { MOD_PICKUP_REVEAL_LEAD_IN_MS } from '../mods/ModAcquisition.ts';
import { BombsiteModSystem } from '../mods/BombsiteModSystem.ts';
import { SupremeModEffectSystem } from '../mods/SupremeModEffectSystem.ts';
import { MOD_FOCUS_CATEGORIES, RUN_CONTRACT_IDS, getContract, getRoundCompletionCredits } from '../economy/economyBalance.ts';
import type { AccountProgressionTier, ModFocusSignalId, RunContractId } from '../economy/types.ts';
import { GameplayTelemetryRecorder, type PickupDropSource } from '../telemetry/GameplayTelemetryRecorder.ts';
import { ReusableObjectPool } from '../performance/ReusableObjectPool.ts';
import { FramePerformanceMonitor } from '../performance/FramePerformanceMonitor.ts';
import { shouldReplaceTurretTarget } from '../performance/Targeting.ts';
import { ProjectileTrailBatch } from '../performance/ProjectileTrailBatch.ts';
import { UniformSpatialGrid } from '../performance/UniformSpatialGrid.ts';
import { BoostVisualSystem } from '../systems/BoostVisualSystem.ts';
import { MineExplosionVfx } from '../vfx/MineExplosionVfx.ts';
import { BombExplosionCosmeticVfx } from '../cosmetics/BombExplosionCosmeticVfx.ts';
import { OperativeShieldEffect } from '../vfx/OperativeShieldEffect.ts';
import { BOMB_EXPLOSION_COSMETIC_DEFINITIONS } from '../cosmetics/BombExplosionCosmeticDefinitions.ts';
import { ArenaVisualRenderer } from '../arena/ArenaVisualRenderer.ts';
import { TutorialDirector } from '../tutorial/TutorialDirector.ts';
import { TutorialEventBus } from '../tutorial/TutorialEventBus.ts';
import { completeFirstRunTeachingRound } from '../tutorial/TutorialProgress.ts';
import type { TutorialMode, TutorialTargetBounds } from '../tutorial/TutorialTypes.ts';
import { projectTutorialBoundsToViewport } from '../tutorial/TutorialTargeting.ts';
import { nextPickupBuffStack, resourcePickupCap } from '../player/OverdriveRules.ts';
import { RICOCHET_MAX_WALL_BOUNCES, reflectRicochetVelocity } from '../player/RicochetRules.ts';
import { selectEnemyPickup } from '../player/PickupDropTable.ts';
import {
  SCATTERSHOT_ANGLE_OFFSETS,
  TEMPORARY_AMMO_BALANCE,
  TemporaryAmmoModeController,
  grenadeArcHeight,
  grenadeBounceCountForSequence,
  grenadeFireIntervalMs,
  grenadeProximityCheckDue,
  grenadeProximityFuseContains,
  initialGrenadeProximityCheckAt,
  nextGrenadeProximityCheckAt,
  type TemporaryAmmoMode
} from '../player/TemporaryAmmoMode.ts';
import { TurretWeaponSyncController } from '../player/TemporaryOffensiveEffects.ts';
import { N3ONArcadeController } from '../arcade/N3ONArcadeController.ts';
import type { ArcadeEventId, ArcadeGrantedReward, ArcadeMetricEvent } from '../arcade/types.ts';
import type { Boss } from '../bosses/Boss.ts';
import { createPhysicalLootPlan, type PhysicalLootReward } from '../loot/PhysicalLootService.ts';
import {
  GAMEPLAY_PICKUP_COLOR_BY_TYPE,
  GAMEPLAY_PICKUP_SFX_BY_TYPE,
  GameplayPickupPresentation,
  createGameplayModPickupVisual,
  updateGameplayModPickupVisual
} from '../loot/GameplayPickupPresentation.ts';
import { getSupremeStage, isSupremeProtocol, isSupremeTerminalRound } from '../progression/SupremeProgression.ts';
import { resolveSupremeBridgeReward } from '../progression/SupremeBridgeReward.ts';
import {
  isRegularOverdriveTerminalCompletion,
  resolveSupremePostRoundPlan
} from '../progression/SupremeRoundTransition.ts';
import { SupremeConstellationFloor } from '../vfx/SupremeConstellationFloor.ts';
import { SupremeFinaleController } from '../bosses/SupremeFinaleController.ts';
import { SupremeFinaleOverlay } from '../bosses/SupremeFinaleOverlay.ts';
import { SupremeVictorySequence } from '../bosses/SupremeVictorySequence.ts';
import { AnomalyController } from '../anomalies/AnomalyController.ts';
import { ANOMALY_BY_ID } from '../anomalies/AnomalyRegistry.ts';
import { AnomalyReturnLifecycle } from '../anomalies/AnomalyReturnLifecycle.ts';
import { recordAnomalyMetric } from '../anomalies/AnomalyTelemetry.ts';
import { HEIST_BALANCE } from '../anomalies/heist/HeistConfig.ts';
import type { AnomalyEntryRequest, AnomalyId, AnomalyReturnResult, HeistSessionData } from '../anomalies/types.ts';

interface Projectile {
  sprite: Phaser.Physics.Arcade.Image;
  damage: number;
  from: 'player' | 'enemy' | 'turret';
  lifeMs: number;
  trailColor: number;
  splitCurrentEligible?: boolean;
  crossedFences?: Set<Fence>;
  previousX?: number;
  previousY?: number;
  telemetryOwner?: 'weapon' | 'turret' | 'enemy' | 'boss';
  critical?: boolean;
  turretId?: string;
  bossAttack?: BossAttackKind;
  ricochetsRemaining?: number;
  ammoMode?: TemporaryAmmoMode;
  nextTrailAt: number;
  grenadeShadow?: Phaser.GameObjects.Arc;
  grenadeBouncesRemaining?: number;
  grenadeTotalBounces?: number;
  grenadeBounceStartedAt?: number;
  grenadeNextBounceAt?: number;
  grenadeArcHeightMax?: number;
  grenadeFuseAt?: number;
  grenadeArmedAt?: number;
  grenadeNextProximityCheckAt?: number;
}

interface SupremeBridgeAwardOutcome {
  firstSupremeAwarded: boolean;
  modId: string | null;
}

interface ProjectileSpawn extends Omit<Projectile, 'sprite' | 'crossedFences' | 'nextTrailAt'> {
  x: number;
  y: number;
  texture: string;
  width: number;
  height: number;
  tint: number;
  rotation: number;
  velocityX: number;
  velocityY: number;
  depth: number;
  crossedFences?: ReadonlySet<Fence>;
}

interface FxCircleSpawn {
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
  depth: number;
  strokeWidth?: number;
  strokeColor?: number;
  strokeAlpha?: number;
}

interface HomingMissile {
  sprite: Phaser.Physics.Arcade.Image;
  owner: Enemy;
  hp: number;
  lifeMs: number;
  damage: number;
  detonated: boolean;
  nextTrailAt: number;
}

interface Pickup {
  type: PickupType;
  sprite: Phaser.GameObjects.Container;
  expiresAt: number;
  source: PickupDropSource;
  amount?: number;
  collectibleAt?: number;
  arcadeEventId?: ArcadeEventId;
}

interface PickupMotion {
  velocityX: number;
  velocityY: number;
  phase: number;
}

interface ModPickup {
  definition: ModDefinition;
  source: ModDropSource;
  sprite: Phaser.GameObjects.Container;
  visual: import('../loot/GameplayPickupPresentation.ts').GameplayModPickupVisual;
  expiresAt: number;
  collectibleAt: number;
  collected: boolean;
  arcadeEventId?: ArcadeEventId;
}

interface DeathMine {
  mine: Mine;
}

interface NavState {
  path: PathPoint[];
  waypointIndex: number;
  nextRepathAt: number;
  targetKey: string;
  lastSampleX: number;
  lastSampleY: number;
  lastSampleAt: number;
  stuckTicks: number;
  preferObjective: boolean;
  nextFocusDecisionAt: number;
  approachAngle: number;
  approachRadius: number;
  recoveryUntil: number;
  recoverySign: -1 | 1;
}

interface PatrolPoint {
  x: number;
  y: number;
}

interface TurretTargetDecision {
  turret: Turret | null;
  reconsiderAt: number;
}

type BossFlowPhase = 'none' | 'intro' | 'combat' | 'destruction' | 'loot-collection' | 'transitioning';

interface BossDeathSnapshot {
  encounter: BossEncounter;
  x: number;
  y: number;
  color: number;
}

interface AnomalySuspensionState {
  roundState: RoundState;
  physicsWasPaused: boolean;
  physicsTimeScale: number;
  clockWasPaused: boolean;
  clockTimeScale: number;
  playerBodyEnabled: boolean;
  camera: {
    count: number;
    x: number;
    y: number;
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
    zoom: number;
    rotation: number;
    alpha: number;
    visible: boolean;
  };
}

const ROUND_PHASE_LABELS: Record<RoundState, string> = {
  [RoundState.PrePlant]: 'PRE-PLANT',
  [RoundState.Planting]: 'PLANTING',
  [RoundState.Defense]: 'DEFEND',
  [RoundState.Defusing]: 'DEFUSE ALERT',
  [RoundState.Victory]: 'ROUND COMPLETE',
  [RoundState.Defeat]: 'MISSION FAILURE',
  [RoundState.Paused]: 'PAUSED'
};

const ENEMY_NAVIGATION_PADDING = ARENA_GENERATION_CONFIG.enemyNavigationPadding;
const ENEMY_SEPARATION_RADIUS = 31;
const SPECIAL_AMMO_HIT_QUERY_RADIUS = 32;
const PICKUP_FLOAT_DRIFT_MIN = 12.5;
const PICKUP_FLOAT_DRIFT_RANGE = 4.5;
const PICKUP_FLOAT_MAX_SPEED = 20;
const PICKUP_SEPARATION_PUSH = 0.2;
const PICKUP_BOUNCE_TRANSFER = 0.5;
const PICKUP_BOUNCE_KICK = 2;
const BOMBSITE_EXPLOSION_VISUAL_RADIUS = 520;
export class ArenaScene extends Phaser.Scene {
  private readonly state = new GameStateMachine(RoundState.PrePlant);
  private readonly audio = AudioManager.get();

  private player!: Player;
  private hud!: Hud;
  private bannerText!: Phaser.GameObjects.Text;

  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private wallRects: RectSpec[] = [];
  /**
   * Phaser reuses the ArenaScene instance after it has been stopped. Scene
   * shutdown has already disposed its physics groups, so a subsequent create
   * must not run the between-round teardown against those stale objects.
   */
  private hasLiveRoundObjects = false;

  private enemies: Enemy[] = [];
  private readonly enemyColliders = new Map<Enemy, Phaser.Physics.Arcade.Collider[]>();
  private playerWallCollider: Phaser.Physics.Arcade.Collider | null = null;
  private bossWallCollider: Phaser.Physics.Arcade.Collider | null = null;
  private supremeBossWallColliders: Phaser.Physics.Arcade.Collider[] = [];
  private projectiles: Projectile[] = [];
  private readonly pendingSplitProjectiles: Projectile[] = [];
  private projectilePool!: ReusableObjectPool<Projectile, ProjectileSpawn>;
  private fxCirclePool!: ReusableObjectPool<Phaser.GameObjects.Arc, FxCircleSpawn>;
  private projectileTrails: ProjectileTrailBatch | null = null;
  private boostVisual!: BoostVisualSystem;
  private mineExplosionVfx!: MineExplosionVfx;
  private bombExplosionCosmeticVfx!: BombExplosionCosmeticVfx;
  private readonly temporaryAmmo = new TemporaryAmmoModeController();
  private readonly turretWeaponSync = new TurretWeaponSyncController();
  private grenadeProjectileSequence = 0;
  private readonly hazardDamageTargets: HazardDamageTarget[] = [];
  private homingMissiles: HomingMissile[] = [];
  private pickups: Pickup[] = [];
  private modPickups: ModPickup[] = [];
  private pickupPresentation!: GameplayPickupPresentation;
  private readonly pickupMotion = new WeakMap<Phaser.GameObjects.Container, PickupMotion>();
  private fences: Fence[] = [];
  private turrets: Turret[] = [];
  private mines: Mine[] = [];
  private deathMines: DeathMine[] = [];
  private readonly defuseAssignees = new Set<Enemy>();
  private readonly activeDefusersBySite = new Map<string, number>();
  private readonly activeDefuserEnemiesBySite = new Map<string, Enemy[]>();
  private readonly defuseCandidateBuffer: Enemy[] = [];
  private defuseCandidateDistanceSquared = new WeakMap<Enemy, number>();
  private readonly assignedDefusersPerSite = new Map<string, number>();
  private activeDefuserCountForTelemetry = 0;
  private readonly defuseTargetByEnemy = new Map<Enemy, BombSiteRuntime>();
  private defuserMarkedUntil = new WeakMap<Enemy, number>();
  private modRuntime!: ModRuntime;
  private protocol: RunProtocolId = 'normal';
  private modFocus: ModFocusSignalId | null = null;
  private contract: RunContractId | null = null;
  private creditsSpentBeforeRun = 0;
  private upgradeCompletionPercentage = 0;
  private accountProgressionTier: AccountProgressionTier = 'new';
  private runCreditsEarned = 0;
  private runUpgrades: Record<string, number> = {};
  private particlesEnabled = true;
  private prismPlayerColor = false;
  private prismProjectileColor = false;
  private prismTrailColor = false;
  private prismFenceStyle = false;
  private prismTurretSkin = false;
  private prismBombColor = false;
  private projectileTextureKey = 'projectile-pulse';
  private projectileWidth = 8;
  private projectileHeight = 8;
  private modsEarned: ModRewardRecord[] = [];
  private modDropSequence = 0;
  private physicalLootSequence = 0;
  private runStartedAt = Date.now();
  private readonly detonatingSiteIds = new Set<string>();
  private readonly enemyTurretTargets = new WeakMap<Enemy, TurretTargetDecision>();
  private nextHoloAfterimageAt = 0;
  private arcadePopSequence = 0;

  private roundManager!: RoundManager;
  private layout!: ArenaLayout;
  private arenaVisuals: ArenaVisualRenderer | null = null;
  private supremeConstellation: SupremeConstellationFloor | null = null;
  private pathfinder!: GridPathfinder;
  private bombSites!: BombSiteManager;
  private bombsiteMods!: BombsiteModSystem;
  private supremeModEffects: SupremeModEffectSystem | null = null;
  private laserSecurity: LaserSecuritySystem | null = null;
  private bombletHazard: BombletHazardSystem | null = null;
  private gasHazard: GasHazardSystem | null = null;
  private fluxCores: FluxCoreSystem | null = null;
  private arcadeController: N3ONArcadeController | null = null;
  private anomalyController: AnomalyController | null = null;
  private readonly anomalyReturnLifecycle = new AnomalyReturnLifecycle();
  private pendingAnomalyReturn: AnomalyReturnResult | null = null;
  private anomalyReturnAwaitingFirstUpdate = false;
  private anomalyReturnAwaitingFirstPhysicsStep = false;
  private anomalyReturnAwaitingFirstRender = false;
  private devAnomalyReturnSoak: {
    requested: number;
    remaining: number;
    completed: number;
    initialInputDevice: InputDevice;
  } | null = null;
  private devAnomalyReturnSoakResult: {
    requested: number;
    completed: number;
    passed: boolean;
    failure?: string;
  } | null = null;
  /** Exact live-simulation state held while a side anomaly owns the screen. */
  private anomalySuspensionState: AnomalySuspensionState | null = null;
  private bossEncounter: BossEncounter | null = null;
  private supremeFinale: SupremeFinaleController | null = null;
  private supremeFinaleOverlay: SupremeFinaleOverlay | null = null;
  private supremeVictorySequence: SupremeVictorySequence | null = null;
  private bossRound = 0;
  private pendingRoundPayload: RoundFinishedPayload | null = null;
  private bossPickupRandom: SeededRandom | null = null;
  private nextBossSupportPickupAt = 0;
  private readonly bossSupportEnemies = new Set<Enemy>();
  private nextBossSupportEnemyWaveAt = 0;
  private bossVictoryHandled = false;
  private bossFlowPhase: BossFlowPhase = 'none';
  private bossIntroOverlay: BossIntroOverlay | null = null;
  private bossNextFightButton: ArenaCommandButton | null = null;
  private readonly bossSequenceTimers: Phaser.Time.TimerEvent[] = [];
  private readonly roundInfusionTimers = new Set<Phaser.Time.TimerEvent>();
  private readonly roundInfusionEffects = new Set<Phaser.GameObjects.GameObject>();
  private bossLootLaunchesPending = 0;

  private roundCredits = 0;
  private roundCoreTokens = 0;
  private roundPlasmaChips = 0;
  private roundFluxCores = 0;
  private pendingProgressEnemyKills = 0;
  private pendingProgressBombSites = 0;
  private totalCreditsCollected = 0;
  private hudWalletCredits = 0;
  private hudWalletCoreTokens = 0;
  private hudWalletPlasmaChips = 0;
  private hudWalletFluxCores = 0;

  private activePlantingSite: BombSiteRuntime | null = null;
  private plantingProgressMs = 0;
  private lastPlayerShotMs = 0;
  private lastShotEnergyDeniedAt = -99_999;
  private pointerLock: GameplayPointerLock | null = null;
  private playerInput!: PlayerInput;
  private pointerLockInitialGate = false;
  private readonly aimWorldPoint = new Phaser.Math.Vector2();
  private controllerAimDistance = 280;
  private aimSettings: AimSettings = { ...DEFAULT_AIM_SETTINGS, reticle: { ...DEFAULT_AIM_SETTINGS.reticle } };
  private readonly mineSalvoInput = new MineSalvoInput();
  private pendingMineSalvo = false;

  private nextSpawnAt = 0;
  private nextArenaSupportPickupAt = 0;
  private lastSpecialSpawnAt = -99_999;
  private lastDefuserSpawnAt = -99_999;
  private turretTelemetrySequence = 0;
  private enemyNavigationSequence = 0;

  private pauseMenu: PauseMenuView | null = null;
  private pauseMenuOpenedAt = Number.NEGATIVE_INFINITY;
  private equippedModsViewer: Phaser.GameObjects.Container | null = null;
  private modAcquisitionPresenter: ModAcquisitionPresenter | null = null;
  private legendaryRevealPhysicsWasPaused = false;
  private legendaryRevealInProgress = false;
  private siteActionText!: Phaser.GameObjects.Text;
  private crosshair!: Phaser.GameObjects.Graphics;
  private crosshairValid: boolean | null = null;
  private balanceTelemetry: Phaser.GameObjects.Text | null = null;
  private performanceTelemetry: Phaser.GameObjects.Text | null = null;
  private traversalDebug: Phaser.GameObjects.Graphics | null = null;
  private traversalDebugVisible = false;
  private tutorialDirector: TutorialDirector | null = null;
  private tutorialHardPaused = false;
  private tutorialClockWasPaused = false;
  private tutorialAimAngle: number | null = null;
  private readonly performanceMonitor = new FramePerformanceMonitor(600);
  private nextPerformanceTelemetryAt = 0;
  private nextPoolMaintenanceAt = 0;
  private readonly telemetryFrameBuffs = {
    damageBoost: false,
    speedBoost: false,
    rapidFire: false,
    grenadeRounds: false,
    scattershot: false
  };
  private readonly telemetryFrameInput: {
    activeWeight: number;
    activeCountCap: number | undefined;
    activeWeightCap: number | undefined;
    activeBombs: number;
    activeDefusers: number;
    buffs: { damageBoost: boolean; speedBoost: boolean; rapidFire: boolean; grenadeRounds: boolean; scattershot: boolean };
  } = {
    activeWeight: 0,
    activeCountCap: undefined,
    activeWeightCap: undefined,
    activeBombs: 0,
    activeDefusers: 0,
    buffs: this.telemetryFrameBuffs
  };

  private keys!: {
    f8: Phaser.Input.Keyboard.Key;
    f7: Phaser.Input.Keyboard.Key;
    f6: Phaser.Input.Keyboard.Key;
    f5: Phaser.Input.Keyboard.Key;
  };

  private selectedAbility: AbilityType = 'fence';
  private abilityCooldownUntil: Record<'fence' | 'turret', number> = { fence: 0, turret: 0 };
  private readonly mineChargeRack = new MineChargeRack();
  private shieldCooldownUntil = 0;
  private shieldActiveUntil = 0;
  private shieldVisual: OperativeShieldEffect | null = null;
  private readonly hudBuffs: string[] = [];
  private readonly hudRadarContacts: HudRadarContact[] = [];
  private readonly hudRadarContactPool: HudRadarContact[] = [];
  private hudRadarContactCount = 0;
  private readonly hudPayload: HudPayload = {
    hp: 0,
    maxHp: 1,
    energy: 0,
    maxEnergy: 1,
    level: 1,
    enemies: 0,
    credits: 0,
    coreTokens: 0,
    plasmaChips: 0,
    fluxCores: 0,
    phase: 'PRE-PLANT',
    objective: 'SITE A AVAILABLE',
    objectiveTimerMs: null,
    defuseAlert: false,
    bombUrgent: false,
    bombActive: false,
    bombProgress: 0,
    buffs: this.hudBuffs,
    abilities: [
      { id: 'fence', keybind: 'Q', icon: '⛔', label: 'FENCE', cooldownMs: 0, cooldownDurationMs: ABILITY_BALANCE.fence.cooldownMs, selected: false, hasEnergy: true, underLimit: true, count: 0, capacity: ABILITY_BALANCE.fence.maxActive },
      { id: 'turret', keybind: 'F', icon: '⌖', label: 'TURRET', cooldownMs: 0, cooldownDurationMs: ABILITY_BALANCE.turret.cooldownMs, selected: false, hasEnergy: true, underLimit: true, count: 0, capacity: ABILITY_BALANCE.turret.maxActive },
      { id: 'mine', keybind: 'R', icon: '✹', label: 'MINE', cooldownMs: 0, cooldownDurationMs: ABILITY_BALANCE.mine.cooldownMs, selected: false, hasEnergy: true, underLimit: true, count: 0, capacity: ABILITY_BALANCE.mine.maxActive },
      { id: 'shield', keybind: 'MMB', icon: '◉', label: 'SHIELD', cooldownMs: 0, cooldownDurationMs: ABILITY_BALANCE.shield.cooldownMs, active: false, selected: false, hasEnergy: true, underLimit: true, count: 0, capacity: null }
    ],
    radarRange: 900,
    radarContacts: this.hudRadarContacts
  };

  private navState = new WeakMap<Enemy, NavState>();
  private patrolTargets = new WeakMap<Enemy, PatrolPoint>();
  private readonly enemySeparationGrid = new UniformSpatialGrid<Enemy>(48);
  private grenadeSplashX = 0;
  private grenadeSplashY = 0;
  private grenadeSplashRadiusSquared = 0;
  private grenadeSplashDamage = 0;
  private grenadeSplashCritical = false;
  private grenadeSplashExcludedEnemy: Enemy | null = null;
  private grenadeSplashOwner: 'weapon' | 'turret' = 'weapon';
  private grenadeSplashTurretId = '';
  private specialAmmoHitX = 0;
  private specialAmmoHitY = 0;
  private specialAmmoHitDistanceSquared = Number.POSITIVE_INFINITY;
  private specialAmmoHitCandidate: Enemy | null = null;
  private grenadeFuseQueryX = 0;
  private grenadeFuseQueryY = 0;
  private grenadeFuseQueryCandidate: Enemy | null = null;
  private grenadeFuseQueryCandidateDistanceSquared = Number.POSITIVE_INFINITY;
  private readonly applyGrenadeSplashNeighbor = (enemy: Enemy): void => {
    if (enemy === this.grenadeSplashExcludedEnemy || !enemy.active || enemy.isDead()) return;
    const dx = enemy.x - this.grenadeSplashX;
    const dy = enemy.y - this.grenadeSplashY;
    if (dx * dx + dy * dy > this.grenadeSplashRadiusSquared) return;
    const wasAlive = !enemy.isDead();
    const applied = enemy.takeDamage(this.grenadeSplashDamage, this.grenadeSplashOwner);
    const overkill = Math.max(0, this.grenadeSplashDamage - applied);
    if (this.grenadeSplashOwner === 'turret') {
      GameplayTelemetryRecorder.recordTurretHit(this.grenadeSplashTurretId, applied, overkill);
    } else {
      GameplayTelemetryRecorder.recordProjectileHit('weapon', applied, overkill, this.grenadeSplashCritical);
    }
    enemy.defuseProgressMs = 0;
    enemy.defuseInterruptedUntil = this.time.now + 800;
    if (wasAlive && enemy.isDead() && this.grenadeSplashOwner === 'weapon') {
      this.triggerSplitCurrent(enemy, this.grenadeSplashDamage);
    }
  };
  private readonly findSpecialAmmoHitNeighbor = (enemy: Enemy): void => {
    if (!enemy.active || enemy.isDead()) return;
    const dx = enemy.x - this.specialAmmoHitX;
    const dy = enemy.y - this.specialAmmoHitY;
    const distanceSquared = dx * dx + dy * dy;
    const radius = enemy.stats.size * 0.5 + 5;
    if (distanceSquared >= radius * radius || distanceSquared >= this.specialAmmoHitDistanceSquared) return;
    this.specialAmmoHitDistanceSquared = distanceSquared;
    this.specialAmmoHitCandidate = enemy;
  };
  private readonly findGrenadeFuseNeighbor = (enemy: Enemy): void => {
    if (!enemy.active || enemy.isDead()) return;
    const dx = enemy.x - this.grenadeFuseQueryX;
    const dy = enemy.y - this.grenadeFuseQueryY;
    const distanceSquared = dx * dx + dy * dy;
    if (!grenadeProximityFuseContains(dx, dy)
      || distanceSquared >= this.grenadeFuseQueryCandidateDistanceSquared) return;
    this.grenadeFuseQueryCandidateDistanceSquared = distanceSquared;
    this.grenadeFuseQueryCandidate = enemy;
  };
  private separationSubject: Enemy | null = null;
  private readonly applySeparationNeighbor = (neighbor: Enemy): void => {
    const enemy = this.separationSubject;
    if (!enemy || neighbor === enemy || !neighbor.active || neighbor.isDead()) return;
    const dx = enemy.x - neighbor.x;
    const dy = enemy.y - neighbor.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared <= 0.01 || distanceSquared > ENEMY_SEPARATION_RADIUS * ENEMY_SEPARATION_RADIUS) return;
    const distance = Math.sqrt(distanceSquared);
    const push = (ENEMY_SEPARATION_RADIUS - distance) * 1.8;
    const body = enemy.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    body.velocity.x += dx / distance * push;
    body.velocity.y += dy / distance * push;
  };
  private readonly navigationCellPenalty = (cellX: number, cellY: number): number => {
    const worldX = this.pathfinder.cellCenterX(cellX);
    const worldY = this.pathfinder.cellCenterY(cellY);
    let penalty = 0;
    for (const mine of this.mines) {
      if (!mine.armed) continue;
      const dx = worldX - mine.sprite.x;
      const dy = worldY - mine.sprite.y;
      const range = mine.radius + 60;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < range * range) penalty += ((range - Math.sqrt(distanceSquared)) / range) * 9;
    }
    for (const fence of this.fences) {
      const distance = this.distancePointToSegment(worldX, worldY, fence.x1, fence.y1, fence.x2, fence.y2);
      if (distance < 68) penalty += ((68 - distance) / 68) * 6;
    }
    return penalty;
  };
  private readonly onResumeFromOptions = (): void => {
    this.refreshAbilityBindings();
    const settings = SaveSystem.get().settings;
    this.particlesEnabled = settings.particles;
    this.aimSettings = normalizeAimSettings(settings.aim);
    this.crosshairValid = null;
    this.pointerLock?.setSensitivity(this.aimSettings.mouseSensitivity);
    this.hud?.applySettings(settings.hud);
    this.resumeGameplay();
  };
  private readonly onReturnFromModCollection = (): void => {
    this.refreshHudWallet();
    if (this.state.state === RoundState.Paused) this.showPauseMenu();
  };
  private readonly onReturnFromStore = (): void => {
    this.refreshHudWallet();
    if (this.state.state === RoundState.Paused) this.showPauseMenu();
  };
  private readonly onQuitFromStore = (): void => this.quitToMenu();
  private readonly onAnomalyReturn = (result: AnomalyReturnResult): void => {
    if (!this.anomalyReturnLifecycle.stageReturn(result.sessionId)) {
      this.traceAnomalyReturn('duplicate-or-stale-result-ignored', { resultSessionId: result.sessionId });
      return;
    }
    this.pendingAnomalyReturn = result;
    this.traceAnomalyReturn('return-staged');
    // One owner and one deferred queue: retire the anomaly first, then wake
    // this same preserved Arena instance. Restoration runs from WAKE below.
    this.scene.stop(SceneKeys.Heist);
    this.scene.wake(SceneKeys.Arena);
  };
  private readonly onArenaWoken = (): void => {
    const result = this.pendingAnomalyReturn;
    if (!result || !this.anomalyReturnLifecycle.beginRestore(result.sessionId)) return;
    this.pendingAnomalyReturn = null;
    this.traceAnomalyReturn('arena-wake-fired');
    const suspension = this.anomalySuspensionState;
    this.restoreArenaCamera(suspension);
    // Stop removes HEIST from rendering, while this explicit ordering prevents
    // any unrelated surviving overlay scene from remaining above the world.
    this.scene.bringToTop(SceneKeys.Arena);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    if (result.success) this.commitAnomalyLoot(result);
    this.anomalyController?.resolveReturn();
    if (result.playerState) {
      const state = result.playerState;
      // A failed excursion ejects the operative at critical health instead of
      // converting an anomaly failure into a delayed Arena death frame.
      this.player.hp = result.success
        ? Math.max(0, state.hp)
        : Math.max(1, state.hp);
      this.player.energy = Phaser.Math.Clamp(state.energy, 0, Math.max(this.player.energyStats.max, state.energy));
      this.player.heat = Phaser.Math.Clamp(state.heat, 0, this.player.weapon.maxHeat);
      this.player.lastDashMs = state.lastDashMs;
      this.player.dashUntil = state.dashUntil;
      this.player.modSpeedBoostUntil = state.modSpeedBoostUntil;
      this.player.modSpeedMultiplier = state.modSpeedMultiplier;
      this.player.buffs = state.buffs;
    }
    if (result.abilityState) {
      this.abilityCooldownUntil = { ...result.abilityState.cooldownUntil };
      this.shieldActiveUntil = result.abilityState.shieldActiveUntil;
      this.shieldCooldownUntil = result.abilityState.shieldCooldownUntil;
      this.selectedAbility = result.abilityState.selectedAbility;
      if (this.time.now < this.shieldActiveUntil) {
        if (!this.shieldVisual) this.createShieldVisual();
      } else {
        this.destroyShieldOrb();
      }
    }
    const safe = this.pathfinder.findNearestWalkableWorld(result.sourcePortal.x + 118, result.sourcePortal.y, 0, 6)
      ?? { x: result.sourcePortal.x, y: result.sourcePortal.y };
    this.player.setActive(true).setVisible(true).setAlpha(1).setScale(1).setPosition(safe.x, safe.y).setVelocity(0, 0);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (playerBody) playerBody.enable = suspension?.playerBodyEnabled ?? true;
    this.player.invulnUntil = Math.max(
      result.playerState?.invulnUntil ?? 0,
      this.time.now + HEIST_BALANCE.safeReturnInvulnerabilityMs
    );
    if (result.inputDevice) this.playerInput.adoptDevice(result.inputDevice);
    this.refreshHudWallet();
    this.showBanner(result.success
      ? 'HEIST COMPLETE // HAUL COMMITTED'
      : 'HEIST FAILED // ARENA STATE RESTORED');
    this.clearGameplayInput();
    const pointerRequired = this.playerInput.activeDevice !== 'gamepad' && Boolean(this.pointerLock?.supported);
    if (pointerRequired && !this.pointerLock?.locked) {
      // Browser pointer capture can only be restored by a trusted click. Keep
      // the exact Arena state until that click instead of deriving a new phase.
      if (!suspension) this.anomalySuspensionState = this.captureAnomalySuspensionState();
      else this.restoreAnomalyClock(suspension);
      this.pointerLockInitialGate = true;
      this.pauseForPointerLock('initial');
      this.pointerLock?.showResume('CLICK TO RESUME OPERATION');
    } else {
      this.pointerLockInitialGate = false;
      this.pointerLock?.hidePrompt();
      this.setGameplayCursorMode();
      if (suspension) this.restoreAnomalySimulation(suspension);
      else this.physics.resume();
      this.anomalySuspensionState = null;
    }
    this.anomalyReturnLifecycle.complete(result.sessionId);
    this.anomalyReturnAwaitingFirstUpdate = true;
    this.anomalyReturnAwaitingFirstPhysicsStep = true;
    this.anomalyReturnAwaitingFirstRender = true;
    this.events.once(Phaser.Scenes.Events.RENDER, this.onFirstArenaRenderAfterAnomaly, this);
    this.validateAnomalyReturnInvariants(pointerRequired && !this.pointerLock?.locked, suspension);
    this.traceAnomalyReturn(pointerRequired && !this.pointerLock?.locked
      ? 'restored-awaiting-pointer-capture'
      : 'restored-live');
  };
  private readonly onFirstArenaRenderAfterAnomaly = (): void => {
    if (!this.anomalyReturnAwaitingFirstRender) return;
    this.anomalyReturnAwaitingFirstRender = false;
    this.traceAnomalyReturn('first-arena-render-after-return');
    this.continueDevAnomalyReturnSoak();
  };
  constructor() {
    super(SceneKeys.Arena);
  }

  create(data?: ArenaSessionState | { session?: ArenaSessionState }): void {
    RunTransitionManager.markStep(this, 'arena-create-enter');
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const sessionFromData = this.parseSessionData(this.extractSessionData(data));
    const sessionFromRegistry = this.registry.get('arena-session') as ArenaSessionState | undefined;
    const session = sessionFromData ?? sessionFromRegistry;
    this.protocol = session?.protocol ?? 'normal';
    this.modFocus = session?.modFocus ?? null;
    this.contract = session?.contract ?? null;
    this.creditsSpentBeforeRun = session?.creditsSpentBeforeRun ?? 0;
    this.upgradeCompletionPercentage = session?.upgradeCompletionPercentage ?? 0;
    this.accountProgressionTier = session?.accountProgressionTier ?? 'new';
    this.runCreditsEarned = session?.runCreditsEarned ?? 0;
    this.totalCreditsCollected = this.runCreditsEarned;
    this.modsEarned = [...(session?.modsEarned ?? [])];
    this.runStartedAt = session?.runStartedAt ?? Date.now();
    const initialSave = SaveSystem.get();
    this.refreshHudWallet(initialSave);
    this.runUpgrades = { ...initialSave.upgrades };
    this.particlesEnabled = initialSave.settings.particles;
    this.prismPlayerColor = SaveSystem.isPrismCosmetic('playerColor');
    this.prismProjectileColor = SaveSystem.isPrismCosmetic('projectileColor');
    this.prismTrailColor = SaveSystem.isPrismCosmetic('trailColor');
    this.prismFenceStyle = SaveSystem.isPrismCosmetic('fenceStyle');
    this.prismTurretSkin = SaveSystem.isPrismCosmetic('turretSkin');
    this.prismBombColor = SaveSystem.isPrismCosmetic('bombColor');
    this.projectileTextureKey = getCosmeticTextureKey(SaveSystem.getEquippedCosmeticId('projectileShape'), 'projectile-pulse');
    if (this.projectileTextureKey === 'projectile-missile' || this.projectileTextureKey === 'projectile-sword') {
      this.projectileWidth = 17;
      this.projectileHeight = 8;
    } else if (this.projectileTextureKey === 'projectile-lightning') {
      this.projectileWidth = 15;
      this.projectileHeight = 10;
    } else if (this.projectileTextureKey === 'projectile-carrot') {
      this.projectileWidth = 16;
      this.projectileHeight = 9;
    } else if (this.projectileTextureKey === 'projectile-bubbles') {
      this.projectileWidth = 13;
      this.projectileHeight = 11;
    } else if (this.projectileTextureKey === 'projectile-balloons') {
      this.projectileWidth = 14;
      this.projectileHeight = 13;
    } else {
      this.projectileWidth = 8;
      this.projectileHeight = 8;
    }
    this.modRuntime = new ModRuntime(SaveSystem.getModCollection(), session?.equippedMods, this.protocol);
    this.pickupPresentation = new GameplayPickupPresentation(
      this,
      () => this.modRuntime.hasInfusion('pickup-orbit')
    );
    this.createCombatPools();
    this.boostVisual = new BoostVisualSystem(
      this,
      this.particlesEnabled,
      {
        obtain: (state) => this.obtainFxCircle(state),
        release: (circle) => { this.retireFxCircle(circle); }
      },
      (sampleTime) => SaveSystem.getCosmeticColor('dashTrail', sampleTime),
      () => getCosmeticById(SaveSystem.getEquippedCosmeticId('dashTrail'))?.dashTrailEffect ?? 'ion'
    );
    this.mineExplosionVfx = new MineExplosionVfx(this, this.particlesEnabled);
    this.bombExplosionCosmeticVfx = new BombExplosionCosmeticVfx(this, this.particlesEnabled);
    if (session) {
      this.roundManager = new RoundManager(session.baseSeed, session.objectiveMode, session.round);
      this.registry.set('arena-session', session);
    } else {
      this.roundManager = new RoundManager(Phaser.Math.Between(1, 999_999_999), OBJECTIVE_CONFIG.defaultMode, 1);
      this.registry.remove('arena-session');
    }

    GameplayTelemetryRecorder.beginRun({
      runId: `${this.runStartedAt}-${this.roundManager.seedBase}`,
      startedAt: this.runStartedAt,
      baseSeed: this.roundManager.seedBase,
      protocol: this.protocol,
      contract: this.contract,
      modFocus: this.modFocus,
      upgrades: { ...this.runUpgrades },
      equippedMods: this.modRuntime.snapshot()
    });

    this.createInput();
    this.createCrosshair();
    try {
      this.createRoundFromDefinition(this.roundManager.currentDefinition());
      RunTransitionManager.markArenaStarted(this);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('ArenaScene create failed', error);
      RunTransitionManager.fail(this, error);
      this.scene.start(SceneKeys.MainMenu);
      return;
    }

    this.modAcquisitionPresenter = new ModAcquisitionPresenter(this, {
      onLegendaryStart: () => this.pauseForLegendaryModReveal(),
      onLegendaryComplete: () => this.resumeAfterLegendaryModReveal()
    });
    this.tutorialDirector = new TutorialDirector({
      scene: 'arena',
      resolveTarget: (target) => this.resolveTutorialTarget(target),
      setMode: (mode) => this.setTutorialMode(mode)
    });

    this.scale.on('resize', this.handleResize, this);
    this.events.on('resume-from-options', this.onResumeFromOptions);
    this.events.on('return-from-mod-collection', this.onReturnFromModCollection);
    this.events.on('return-from-store', this.onReturnFromStore);
    this.events.on('quit-from-store', this.onQuitFromStore);
    this.events.on('anomaly-return', this.onAnomalyReturn);
    this.events.on(Phaser.Scenes.Events.WAKE, this.onArenaWoken);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.pointerLock = new GameplayPointerLock(this.game, {
      onLocked: () => { if (!this.anomalyReturnLifecycle.blocksExternalPause) this.resumeFromPointerLock(); },
      onLost: (reason) => { if (!this.anomalyReturnLifecycle.blocksExternalPause) this.pauseForPointerLock(reason); }
    });
    this.aimSettings = normalizeAimSettings(SaveSystem.get().settings.aim);
    this.pointerLock.setSensitivity(this.aimSettings.mouseSensitivity);
    this.pointerLockInitialGate = true;
    this.pauseForPointerLock('initial');
    this.pointerLock.showInitial();
    if(import.meta.env.DEV){
      const debugGlobal=globalThis as typeof globalThis&{
        forceArenaType?:(type:ArenaTemplate|null)=>void;
        regenerateArena?:()=>void;
        toggleTraversalDebug?:()=>void;
        forceArcadeEvent?:(eventId:ArcadeEventId)=>boolean;
        forceAnomaly?:(eventId?:AnomalyId)=>boolean;
        forceAnomalyCharge?:()=>boolean;
        setAnomalyCost?:(cost:number|null)=>void;
        setHeistMiniBoss?:(enabled:boolean|null)=>void;
        forceSupremeStage?:(protocol:RunProtocolId)=>boolean;
        previewSupremeMod?:(modId?:string)=>boolean;
        forceSupremeFinale?:()=>void;
        previewSupremeVictory?:()=>void;
        n3onInputDebug?:()=>Record<string, unknown>;
        n3onAnomalyDebug?:()=>Record<string, unknown>;
        n3onAnomalyReturnSoak?:(cycles?:number)=>boolean;
      };
      debugGlobal.forceArenaType=(type)=>{ArenaGenerator.forceArenaType(type);this.createRoundFromDefinition(this.roundManager.currentDefinition());};
      debugGlobal.regenerateArena=()=>this.createRoundFromDefinition(this.roundManager.currentDefinition());
      debugGlobal.toggleTraversalDebug=()=>{
        this.traversalDebugVisible=!this.traversalDebugVisible;
        this.drawTraversalDebug();
      };
      debugGlobal.forceArcadeEvent=(eventId)=>this.arcadeController?.force(eventId) ?? false;
      debugGlobal.forceAnomaly=(eventId='heist')=>this.anomalyController?.force(eventId) ?? false;
      debugGlobal.forceAnomalyCharge=()=>this.anomalyController?.forceCharge() ?? false;
      debugGlobal.setAnomalyCost=(cost)=>this.anomalyController?.setForcedCost(cost);
      debugGlobal.setHeistMiniBoss=(enabled)=>this.registry.set('heist-dev-force-miniboss',enabled);
      debugGlobal.n3onAnomalyDebug=()=>this.anomalyReturnDebugSnapshot();
      debugGlobal.n3onAnomalyReturnSoak=(cycles=10)=>this.startDevAnomalyReturnSoak(cycles);
      debugGlobal.forceSupremeStage=(protocol)=>{
        const stage=getSupremeStage(protocol);
        if(!stage)return false;
        this.protocol=protocol;
        this.roundManager=new RoundManager(this.roundManager.seedBase,this.roundManager.mode,stage.level);
        this.createRoundFromDefinition(this.roundManager.currentDefinition());
        return true;
      };
      debugGlobal.previewSupremeMod=(modId='supreme-eventide-arsenal')=>{
        const definition=MOD_BY_ID.get(modId);
        if(!definition||definition.rarity!=='supreme')return false;
        this.modAcquisitionPresenter?.enqueue({
          card:{instanceId:`dev-${definition.id}`,modId:definition.id,acquiredAt:new Date().toISOString(),upgradeLevel:3},
          rarity:'supreme',duplicate:false,sourceScreenX:this.scale.width*.5,sourceScreenY:this.scale.height*.76
        });
        return true;
      };
      debugGlobal.forceSupremeFinale=()=>{
        const protocol:RunProtocolId='supreme-centaurus';
        const stage=getSupremeStage(protocol)!;
        this.protocol=protocol;
        this.roundManager=new RoundManager(this.roundManager.seedBase,this.roundManager.mode,stage.level);
        const completed=this.roundManager.currentDefinition();
        const nextManager=new RoundManager(this.roundManager.seedBase,this.roundManager.mode,stage.level+1);
        const next=nextManager.currentDefinition();
        this.beginBossFight({
          baseSeed:this.roundManager.seedBase,completedRound:stage.level,completedSeed:completed.seed,completedTemplate:completed.template,
          nextRound:next.round,nextSeed:next.seed,nextTemplate:next.template,objectiveMode:this.roundManager.mode,
          creditsGained:0,coreTokensGained:0,plasmaChipsGained:0,fluxCoresGained:0,bossDefeated:null,
          protocol,equippedMods:this.modRuntime.snapshot(),modsEarned:[...this.modsEarned],runStartedAt:this.runStartedAt,
          modFocus:this.modFocus,contract:this.contract,creditsSpentBeforeRun:this.creditsSpentBeforeRun,
          upgradeCompletionPercentage:this.upgradeCompletionPercentage,accountProgressionTier:this.accountProgressionTier,
          runCreditsEarned:this.runCreditsEarned
        },true);
      };
      debugGlobal.previewSupremeVictory=()=>{
        this.physics.pause();
        this.supremeConstellation?.setFinaleIntensity(true);
        this.supremeVictorySequence?.destroy();
        this.supremeVictorySequence=new SupremeVictorySequence(this,()=>{
          this.supremeVictorySequence?.destroy();
          this.supremeVictorySequence=null;
          this.physics.resume();
        });
      };
      debugGlobal.n3onInputDebug=()=>this.playerInput.debugSnapshot();
    }
  }

  private parseSessionData(data: unknown): ArenaSessionState | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const candidate = data as Partial<ArenaSessionState>;
    if (typeof candidate.baseSeed !== 'number' || !Number.isFinite(candidate.baseSeed)) return undefined;
    if (typeof candidate.round !== 'number' || !Number.isFinite(candidate.round)) return undefined;
    if (candidate.objectiveMode !== 'open' && candidate.objectiveMode !== 'sequential') return undefined;
    return {
      baseSeed: Math.floor(candidate.baseSeed),
      round: Math.max(1, Math.floor(candidate.round)),
      objectiveMode: candidate.objectiveMode,
      protocol: normalizeRunProtocolId(candidate.protocol),
      runStartedAt: typeof candidate.runStartedAt === 'number' ? candidate.runStartedAt : Date.now(),
      equippedMods: Array.isArray(candidate.equippedMods) ? candidate.equippedMods : undefined,
      modsEarned: Array.isArray(candidate.modsEarned) ? candidate.modsEarned : [],
      modFocus: MOD_FOCUS_CATEGORIES.includes(candidate.modFocus as ModFocusSignalId) ? candidate.modFocus as ModFocusSignalId : null,
      contract: RUN_CONTRACT_IDS.includes(candidate.contract as RunContractId) ? candidate.contract as RunContractId : null,
      creditsSpentBeforeRun: Math.max(0, Math.floor(candidate.creditsSpentBeforeRun ?? 0)),
      upgradeCompletionPercentage: Math.max(0, Math.min(100, candidate.upgradeCompletionPercentage ?? 0)),
      accountProgressionTier: ['new', 'midgame', 'advanced', 'endgame', 'maxed'].includes(candidate.accountProgressionTier ?? '')
        ? candidate.accountProgressionTier
        : 'new',
      runCreditsEarned: Math.max(0, Math.floor(candidate.runCreditsEarned ?? 0))
    };
  }

  private extractSessionData(data: ArenaSessionState | { session?: ArenaSessionState } | undefined): ArenaSessionState | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const wrapper = data as { session?: ArenaSessionState };
    if (wrapper.session) return wrapper.session;
    return data as ArenaSessionState;
  }

  private createRoundFromDefinition(def: ReturnType<RoundManager['currentDefinition']>): void {
    this.prepareForRoundCreation();
    this.temporaryAmmo.reset();
    this.turretWeaponSync.reset();
    this.grenadeProjectileSequence = 0;
    this.pendingRoundPayload = null;
    this.bossRound = 0;
    this.bossPickupRandom = null;
    this.bossVictoryHandled = false;
    this.bossFlowPhase = 'none';
    this.detonatingSiteIds.clear();
    this.hidePauseMenu();
    this.physics.resume();

    this.layout = ArenaGenerator.generate(def.seed, def.template, def.round, def.siteCount);
    this.drawProceduralArena(this.layout);
    this.pathfinder = new GridPathfinder(WORLD_WIDTH, WORLD_HEIGHT, 32, this.getBlockers(), ENEMY_NAVIGATION_PADDING);
    this.drawTraversalDebug();

    this.createOrMovePlayer();
    this.modRuntime.beginRound(1);
    this.mineChargeRack.reset(this.getAbilityConfig('mine').maxActive);
    this.defuserMarkedUntil = new WeakMap<Enemy, number>();
    this.defuseTargetByEnemy.clear();
    this.createHudLayer();

    GameplayTelemetryRecorder.beginEncounter({
      kind: 'round',
      round: def.round,
      seed: def.seed,
      layout: this.layout.template,
      maximumPlayerHealth: this.player.stats.maxHealth,
      maximumPlayerEnergy: this.player.energyStats.max,
      weaponDamage: this.player.weapon.damage,
      weaponFireRate: this.player.fireRate,
      weaponCritChance: this.player.weapon.critChance,
      weaponHeatPerShot: this.player.weapon.heatPerShot,
      energyRegenPerSecond: this.player.energyStats.regenPerSecond
    });

    this.bombSites = new BombSiteManager(def.objectiveMode, OBJECTIVE_CONFIG.maxActiveBombs);
    this.bombSites.initialize(this, this.layout.bombSites, this.layout.theme);
    this.bombsiteMods = new BombsiteModSystem(this, this.modRuntime, {
      reduceCountdown: (site, amountMs) => this.bombSites.reduceCountdown(site, amountMs),
      interruptDefuse: (site) => this.bombSites.interruptDefuse(site, true),
      damagePlayer: (amount) => {
        const hit = this.player.takeDamage(amount);
        if (hit) GameplayTelemetryRecorder.recordPlayerDamage('bombsite-reactor', amount);
        return hit;
      },
      announce: (message) => this.showBanner(message),
      playCue: (cue) => {
        if (cue === 'heavy') this.audio.playSfx('bomblet');
        else if (cue === 'warning') this.audio.playSfx('defuseAlarm');
        else if (cue === 'gravity') this.audio.playSfx('shieldOn');
        else this.audio.playSfx('beep');
      },
      playTotemCue: (cue) => this.audio.playSfx(cue === 'entrance' ? 'totemEntrance' : 'totemPulse')
    });
    this.supremeModEffects = new SupremeModEffectSystem(this, this.modRuntime, {
      playPulseCue: () => this.audio.playSfx('totemPulse')
    });
    this.laserSecurity = new LaserSecuritySystem(
      this,
      def.round,
      this.layout.theme,
      (damage) => {
        GameplayTelemetryRecorder.recordPlayerDamage('laser', damage);
      },
      (active) => active ? this.audio.startSecurityLaserLoop() : this.audio.stopSecurityLaserLoop(),
      this.currentModeBalance().hazardDamageMultiplier
    );
    this.bombletHazard = new BombletHazardSystem(
      this,
      def.round,
      def.seed,
      this.layout.theme,
      this.layout.generation.bounds,
      (x, y) => this.hitWall(x, y),
      this.particlesEnabled,
      (damage) => {
        GameplayTelemetryRecorder.recordPlayerDamage('bomblet', damage);
      },
      (x, y, blastRadius, shouldPlaySound, explosionPalette) => {
        if (shouldPlaySound) this.audio.playSfx('bomblet');
        this.mineExplosionVfx.emit(x, y, blastRadius, explosionPalette, this.time.now, false);
        this.fluxCores?.damageArea(x, y, blastRadius, 9999, 'bomblet');
        this.gasHazard?.carveVisualBlast(
          x,
          y,
          blastRadius * GAS_HAZARD_BALANCE.bombletTunnelRadiusMultiplier
        );
      },
      this.currentModeBalance().hazardDamageMultiplier
    );
    if (def.round >= GAS_HAZARD_BALANCE.unlockRound) {
      this.gasHazard = new GasHazardSystem(
        this,
        def.round,
        def.seed,
        this.layout.generation.bounds,
        (x, y) => this.hitWall(x, y),
        this.particlesEnabled,
        (damage) => {
          GameplayTelemetryRecorder.recordPlayerDamage('gas', damage);
        },
        () => this.audio.playSfx('gasFizz'),
        () => this.audio.playSfx('gasCanImpact')
      );
    }
    this.fluxCores = new FluxCoreSystem(
      this,
      def.round,
      def.seed,
      this.layout.theme,
      this.layout.generation.bounds,
      (x, y, halfWidth, halfHeight) => this.intersectsWallGeometry(x, y, halfWidth, halfHeight),
      (x, y, halfWidth, halfHeight) => this.intersectsBombSiteGeometry(x, y, halfWidth, halfHeight),
      this.particlesEnabled,
      (event) => {
        this.audio.playSfx('bomblet');
        if (event.droppedCore) this.dropFluxCorePickup(event.x, event.y, event.color);
      },
      (strength) => this.audio.setFluxCoreProximity(strength),
      () => this.audio.playSfx('defuseAlarm'),
      () => {
        if (!(this.gasHazard?.isLaserSuppressed(this.time.now) ?? false)) this.audio.playSfx('lasersOff');
      }
    );

    this.registerBombSiteEvents();

    this.nextSpawnAt = this.time.now + 2500;
    this.nextArenaSupportPickupAt = this.time.now + 600;
    this.lastSpecialSpawnAt = -99_999;
    this.lastDefuserSpawnAt = -99_999;
    this.activeDefuserCountForTelemetry = 0;
    this.turretTelemetrySequence = 0;
    this.lastShotEnergyDeniedAt = -99_999;
    this.shieldActiveUntil = 0;
    this.shieldCooldownUntil = 0;
    this.destroyShieldOrb();
    this.activePlantingSite = null;
    this.plantingProgressMs = 0;
    this.roundCredits = 0;
    this.roundCoreTokens = 0;
    this.roundPlasmaChips = 0;
    this.roundFluxCores = 0;

    this.state.set(RoundState.PrePlant);
    this.hasLiveRoundObjects = true;
    this.createArcadeController(def.round, def.seed);
    this.createAnomalyController(def.round, def.seed);

    this.showBanner(`ROUND ${def.round} - ${this.layout.template.toUpperCase()}\nSeed ${def.seed}`);
  }

  private drawProceduralArena(layout: ArenaLayout): void {
    this.arenaVisuals?.destroy();
    this.arenaVisuals = new ArenaVisualRenderer(this, layout);
    this.supremeConstellation?.destroy();
    this.supremeConstellation = isSupremeProtocol(this.protocol)
      ? new SupremeConstellationFloor(this, this.protocol, layout.generation.bounds)
      : null;

    this.walls = this.physics.add.staticGroup();
    this.wallRects = [];

    for (const wall of layout.walls) {
      const body = this.walls.create(wall.x + wall.w * 0.5, wall.y + wall.h * 0.5, 'pixel');
      body.setDisplaySize(wall.w, wall.h);
      body.setVisible(false);
      body.refreshBody();
      this.wallRects.push({ ...wall });
    }

    for (const obstacle of layout.obstacles) {
      const rect = {
        x: obstacle.x - obstacle.w * 0.5,
        y: obstacle.y - obstacle.h * 0.5,
        w: obstacle.w,
        h: obstacle.h
      };
      const body = this.walls.create(obstacle.x, obstacle.y, 'pixel');
      body.setDisplaySize(rect.w, rect.h);
      body.setVisible(false);
      body.refreshBody();
      this.wallRects.push(rect);
    }
  }

  private createOrMovePlayer(): void {
    const up = this.runUpgrades;
    const hasValidBody = !!this.player && !!this.player.active && !!this.player.body;

    if (!hasValidBody) {
      const baseMaxHealth = PLAYER_BALANCE.maxHealth + getUpgradeLevel(up, 'player.maxHealth') * 10;
      const baseDashCooldownMs = Math.max(1500, PLAYER_BALANCE.dashCooldownMs - getUpgradeLevel(up, 'player.dashCooldown') * 120);
      const baseDashDistance = PLAYER_BALANCE.dashDistanceMultiplier + getUpgradeEffect(up, 'player.dashDistance');
      const basePickupRadius = PLAYER_BALANCE.pickupRadius + getUpgradeLevel(up, 'player.pickupRadius') * 7;
      const stats = {
        maxHealth: Math.max(1, Math.round(baseMaxHealth * this.modRuntime.multiplier('playerMaxHealth'))),
        moveSpeed: PLAYER_BALANCE.moveSpeed + getUpgradeEffect(up, 'player.moveSpeed'),
        dashCooldownMs: Math.max(500, baseDashCooldownMs * this.modRuntime.multiplier('playerDashCooldown')),
        dashDistanceMultiplier: baseDashDistance * this.modRuntime.multiplier('playerDashDistance'),
        pickupRadius: basePickupRadius * this.modRuntime.multiplier('playerPickupRadius'),
        invulnMs: PLAYER_BALANCE.invulnerabilityMs * this.modRuntime.multiplier('playerInvulnerability')
      };
      const baseEnergyMax = PLAYER_BALANCE.energyMax + getUpgradeEffect(up, 'player.energyMax');
      const baseEnergyRegen = PLAYER_BALANCE.energyRegenPerSecond + getUpgradeEffect(up, 'player.energyRegen');
      const energy = {
        max: Math.max(1, Math.round(baseEnergyMax * this.modRuntime.multiplier('playerEnergyMax'))),
        regenPerSecond: baseEnergyRegen * this.modRuntime.multiplier('playerEnergyRegen')
      };
      const baseDamage = starterWeapon.damage + getUpgradeLevel(up, 'weapon.damage') * 2;
      const baseFireRate = Math.min(WEAPON_BALANCE.maximumFireRate, starterWeapon.fireRate + getUpgradeLevel(up, 'weapon.fireRate') * 0.4);
      const baseProjectileSpeed = starterWeapon.projectileSpeed + getUpgradeLevel(up, 'weapon.projectileSpeed') * 30;
      const baseCritChance = Math.min(WEAPON_BALANCE.maximumCritChance, starterWeapon.critChance + getUpgradeLevel(up, 'weapon.critChance') * 0.02);
      const baseHeatPerShot = Math.max(WEAPON_BALANCE.minimumHeatPerShot, starterWeapon.heatPerShot - getUpgradeLevel(up, 'weapon.heatEfficiency') * 0.4);
      const weapon = {
        ...starterWeapon,
        damage: baseDamage * this.modRuntime.multiplier('weaponDamage'),
        fireRate: baseFireRate * this.modRuntime.multiplier('weaponFireRate'),
        projectileSpeed: baseProjectileSpeed * this.modRuntime.multiplier('weaponProjectileSpeed'),
        critChance: Phaser.Math.Clamp(baseCritChance + this.modRuntime.addition('weaponCritChance'), 0, 0.9),
        heatPerShot: Math.max(0.5, baseHeatPerShot * this.modRuntime.multiplier('weaponHeatPerShot')),
        maxHeat: starterWeapon.maxHeat * this.modRuntime.multiplier('weaponMaxHeat'),
        cooldownRate: starterWeapon.cooldownRate * this.modRuntime.multiplier('weaponCooling')
      };

      const operativeAppearance = SaveSystem.getOperativeFrameAppearance(this.time.now);
      this.player = new Player(this, this.layout.playerSpawn.x, this.layout.playerSpawn.y, operativeAppearance.textureKey, stats, energy, weapon);
      this.player.permanentModSpeedMultiplier = this.modRuntime.permanentMoveSpeedMultiplier();
      this.player.setAppearanceResolver((timeMs) => SaveSystem.getOperativeFrameAppearance(timeMs));
      this.player.restoreOperativeAppearance(this.time.now, true);
      this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
      this.cameras.main.setZoom(0.9);
    } else {
      this.player.setPosition(this.layout.playerSpawn.x, this.layout.playerSpawn.y);
      this.player.setVelocity(0, 0);
      this.player.hp = this.player.stats.maxHealth;
      this.player.energy = this.player.energyStats.max;
      this.player.heat = 0;
      this.player.invulnUntil = 0;
      this.player.lastDashMs = -9_999;
      this.player.dashUntil = 0;
      this.player.permanentModSpeedMultiplier = this.modRuntime.permanentMoveSpeedMultiplier();
      this.player.modSpeedBoostUntil = 0;
      this.player.modSpeedMultiplier = 1;
      this.player.buffs.damageBoostUntil = 0;
      this.player.buffs.speedBoostUntil = 0;
      this.player.buffs.rapidFireUntil = 0;
      this.player.buffs.ricochetUntil = 0;
      this.player.buffs.speedBoostStacks = 0;
      this.player.buffs.rapidFireStacks = 0;
      this.player.setAppearanceResolver((timeMs) => SaveSystem.getOperativeFrameAppearance(timeMs));
      this.player.restoreOperativeAppearance(this.time.now, true);
    }

    this.playerWallCollider?.destroy();
    this.playerWallCollider = this.physics.add.collider(this.player, this.walls);
  }

  private createHudLayer(): void {
    if (this.hud) this.hud.destroy();
    if (this.bannerText) this.bannerText.destroy();
    if (this.siteActionText) this.siteActionText.destroy();

    this.hud = new Hud(this, SaveSystem.get().settings.hud);

    this.bannerText = this.add.text(this.scale.width * 0.5, 148, '', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '36px',
      color: '#74f5ff',
      align: 'center',
      stroke: '#091321',
      strokeThickness: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1100).setAlpha(0);

    this.siteActionText = this.add.text(this.scale.width * 0.5, this.scale.height - 46, '', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '26px',
      color: '#b8f3ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1005);

    if (import.meta.env.DEV) {
      this.balanceTelemetry?.destroy();
      this.balanceTelemetry = this.add.text(12, this.scale.height - 12, '', {
        fontFamily: 'monospace', fontSize: '13px', color: '#bffcff', backgroundColor: '#06101ccc'
      }).setOrigin(0, 1).setScrollFactor(0).setDepth(2200).setVisible(false);
    }
  }

  private registerBombSiteEvents(): void {
    this.bombSites.on('bomb-site-armed', (site: BombSiteRuntime) => {
      if (this.tutorialDirector?.awaits('objective.bombArmed')) TutorialEventBus.emit('objective.bombArmed', { siteId: site.id });
      GameplayTelemetryRecorder.recordBombArmed(site.id);
      this.bombsiteMods.onBombArmed(site, this.getBombDefenseDurationMs(), this.time.now);
      this.state.set(RoundState.Defense);
      this.bombSites.refreshVisuals(this.layout.theme);
      const graceMs = getSpawnProfile(this.roundManager.round, this.bombSites.destroyedCount()).initialGraceMs;
      if (this.bombSites.activeBombCount() === 1) this.nextSpawnAt = this.time.now + graceMs;
      this.showBanner(`SITE ${site.letter} ARMED\n${this.bombSites.activeBombCount()} ACTIVE CHARGE${this.bombSites.activeBombCount() === 1 ? '' : 'S'}`);
      this.audio.playSfx('beep');
    });

    this.bombSites.on('bomb-site-defuse-started', (site: BombSiteRuntime) => {
      GameplayTelemetryRecorder.recordDefuseStarted(site.id);
      TutorialEventBus.emit('objective.defuseStarted', { siteId: site.id });
      this.state.set(RoundState.Defusing);
      this.bombSites.refreshVisuals(this.layout.theme);
      this.audio.playSfx('defuseAlarm');
      this.audio.startDisarmLoop();
    });

    this.bombSites.on('bomb-site-defuse-stopped', (site: BombSiteRuntime) => {
      GameplayTelemetryRecorder.recordDefuseStopped(site.id);
      const anyDefusing = this.bombSites.getActiveBombSites().some((site) => site.state === BombSiteState.BeingDefused);
      this.state.set(anyDefusing ? RoundState.Defusing : RoundState.Defense);
      this.bombSites.refreshVisuals(this.layout.theme);
      if (!anyDefusing) {
        this.audio.stopDisarmLoop();
      }
    });

    this.bombSites.on('bomb-site-destroyed', (site: BombSiteRuntime) => {
      GameplayTelemetryRecorder.recordBombDestroyed(site.id);
      this.bombsiteMods.onBombDestroyed(site);
      const anotherSiteIsBeingDefused = this.bombSites.getActiveBombSites()
        .some((activeSite) => activeSite.state === BombSiteState.BeingDefused);
      if (anotherSiteIsBeingDefused) this.audio.startDisarmLoop();
      else this.audio.stopDisarmLoop();
      this.pendingProgressBombSites += 1;
      this.recoveryAfterSiteDestroy();
    });

    this.bombSites.on('all-bomb-sites-destroyed', () => {
      this.completeRound();
    });
  }

  update(_time: number, delta: number): void {
    const now = this.time.now;
    // Presentation cleanup must run before any pause/victory early return so a
    // damage flash can never strand the Operative in TintFill white.
    this.player.updatePresentation(now);
    if (this.anomalyReturnAwaitingFirstUpdate) {
      this.anomalyReturnAwaitingFirstUpdate = false;
      this.traceAnomalyReturn('first-arena-update-after-return');
    }
    if (this.anomalyReturnAwaitingFirstPhysicsStep && !this.physics.world.isPaused) {
      // Arcade Physics receives the Scene UPDATE event before Scene.update(),
      // so a running world here has completed its first post-return step.
      this.anomalyReturnAwaitingFirstPhysicsStep = false;
      this.traceAnomalyReturn('first-physics-step-after-return');
    }
    const dt = delta / 1000;
    const inputContext = this.tutorialHardPaused
      ? 'tutorial'
      : this.legendaryRevealInProgress
        ? 'modal'
        : this.state.state === RoundState.Paused
          ? 'paused'
          : this.state.state === RoundState.Victory || this.state.state === RoundState.Defeat
            ? 'modal'
            : 'gameplay';
    if (this.playerInput.update(inputContext)) {
      this.refreshAbilityBindings();
      if (this.playerInput.activeDevice === 'gamepad') this.pointerLock?.release();
    }
    this.handleSystemInput();
    this.supremeConstellation?.update(now);

    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.keys.f8)) {
      this.balanceTelemetry?.setVisible(!this.balanceTelemetry.visible);
    }
    if(import.meta.env.DEV&&Phaser.Input.Keyboard.JustDown(this.keys.f7)){
      this.createRoundFromDefinition(this.roundManager.currentDefinition());
      return;
    }
    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.keys.f6)) {
      const overlay = this.ensurePerformanceTelemetry();
      overlay.setVisible(!overlay.visible);
    }
    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.keys.f5)) {
      this.activateDevPerformanceStressScenario();
      return;
    }

    const gameplayCanSoundLowHealth = !this.tutorialHardPaused
      && !this.legendaryRevealInProgress
      && this.state.state !== RoundState.Paused
      && this.state.state !== RoundState.Victory
      && this.state.state !== RoundState.Defeat;
    this.audio.setLowHealthWarning(gameplayCanSoundLowHealth
      && this.player.hp > 0
      && this.player.hp <= this.player.stats.maxHealth * 0.25);

    const cosmeticEffectsCanAdvance = !this.tutorialHardPaused
      && this.state.state !== RoundState.Paused
      && !this.legendaryRevealInProgress;
    if (cosmeticEffectsCanAdvance) {
      // Bomb signatures deliberately outlive the authoritative blast and must
      // continue rendering during the short non-interactive Victory hold.
      this.mineExplosionVfx.update(now);
      this.bombExplosionCosmeticVfx.update(now);
    }

    if (this.tutorialHardPaused || this.state.state === RoundState.Paused || this.legendaryRevealInProgress || this.state.state === RoundState.Victory || this.state.state === RoundState.Defeat) {
      return;
    }

    if (!this.tutorialDirector?.isActive()) this.anomalyController?.update(delta);
    if (this.anomalyController?.blocksArenaGameplay) {
      this.player.setVelocity(0, 0);
      this.updateHud(now);
      return;
    }

    this.performanceMonitor.record(delta);
    this.updatePerformanceTelemetry(now);
    this.maintainCombatPools(now);
    this.recordTelemetryFrame(delta, now);
    const energyBeforeRegeneration = this.player.energy;
    const requestedRegeneration = this.player.energyStats.regenPerSecond * dt;
    this.player.updateEnergy(dt);
    GameplayTelemetryRecorder.recordEnergyRegeneration(requestedRegeneration, this.player.energy - energyBeforeRegeneration);
    this.refreshAimWorldPoint();
    this.updatePrismCosmetics(now);
    this.updatePlayerMovement(now);
    this.updatePlayerShooting(now);

    if (this.bossEncounter || this.supremeFinale) {
      const bossCombatAtFrameStart = this.bossFlowPhase === 'combat';
      if (this.bossFlowPhase === 'combat') this.bossEncounter?.update(delta, this.player);
      if (this.bossFlowPhase === 'combat') this.supremeFinale?.update(delta, this.player);
      if (this.gasHazard?.visualGasActive) {
        for (const boss of this.activeMajorBosses()) {
          this.gasHazard.carveVisualTunnel(
            boss.x,
            boss.y,
            Math.max(GAS_HAZARD_BALANCE.enemyTunnelRadius, boss.hazardRadius + 10)
          );
        }
      }
      if (this.bossFlowPhase === 'combat') {
        const bossHazardTargets = this.getHazardDamageTargets();
        const playerLaserImmune = now < this.player.dashUntil || now < this.shieldActiveUntil;
        this.gasHazard?.update(
          now,
          this.player,
          this.modRuntime.multiplier('gasDamageTaken') * this.currentModeBalance().hazardDamageMultiplier
        );
        if (bossCombatAtFrameStart && this.bossFlowPhase !== 'combat') return;
        const gasSuppressesLasers = this.gasHazard?.isLaserSuppressed(now) ?? false;
        this.fluxCores?.update(now, this.player, gasSuppressesLasers);
        const fluxSuppressesLasers = this.fluxCores?.isLaserSuppressed(now) ?? false;
        const securityLasersSuppressed = gasSuppressesLasers || fluxSuppressesLasers;
        const laserDangerWindow = this.laserSecurity?.isDangerWindow(now, securityLasersSuppressed) ?? false;
        this.laserSecurity?.update(now, dt, this.player, bossHazardTargets, playerLaserImmune, securityLasersSuppressed);
        if (bossCombatAtFrameStart && this.bossFlowPhase !== 'combat') return;
        this.bombletHazard?.update(now, this.player, bossHazardTargets, laserDangerWindow);
        if (bossCombatAtFrameStart && this.bossFlowPhase !== 'combat') return;
        if (!this.supremeFinale) this.updateBossSupportWave(now);
        this.updateBossSupportEnemies(now);
      }
      this.updateProjectiles(delta);
      if (bossCombatAtFrameStart && this.bossFlowPhase !== 'combat') return;
      this.updateAbilities(now, dt);
      if (bossCombatAtFrameStart && this.bossFlowPhase !== 'combat') return;
      this.updateDeathMines(now);
      this.updateShieldState(now);
      if (this.bossFlowPhase === 'combat') this.updateBossSupportPickups(now);
      this.updatePickups(now, dt);
      this.updateModPickups(now, dt);
      this.updateEmergencyCapacitor(now);
      this.updateCrosshair();
      this.updateHud(now);
      this.updateBalanceTelemetry();
      if (this.bossFlowPhase === 'combat' && this.player.isDead()) this.triggerDefeat('playerDead');
      return;
    }

    this.updatePlanting(delta);
    this.bombSites.updateAmbient(this.player.x, this.player.y, now, this.particlesEnabled);

    const activeSites = this.bombSites.getActiveBombSites();
    if (activeSites.length > 0) {
      const detonated = this.bombSites.tickActive(delta);
      for (const site of detonated) this.detonateSite(site);
      this.applyBombsiteCooldownAcceleration(delta);
    }

    this.updateRelentlessSpawns(now, activeSites.length > 0);

    const playerLaserImmune = now < this.player.dashUntil || now < this.shieldActiveUntil;
    const arcadeBoss = this.arcadeController?.getBossTarget();
    if (this.gasHazard?.visualGasActive && arcadeBoss) {
      this.gasHazard.carveVisualTunnel(
        arcadeBoss.x,
        arcadeBoss.y,
        Math.max(GAS_HAZARD_BALANCE.enemyTunnelRadius, arcadeBoss.hazardRadius + 10)
      );
    }
    const hazardTargets = this.getHazardDamageTargets();
    this.gasHazard?.update(
      now,
      this.player,
      this.modRuntime.multiplier('gasDamageTaken') * this.currentModeBalance().hazardDamageMultiplier
    );
    const gasSuppressesLasers = this.gasHazard?.isLaserSuppressed(now) ?? false;
    this.fluxCores?.update(now, this.player, gasSuppressesLasers);
    const fluxSuppressesLasers = this.fluxCores?.isLaserSuppressed(now) ?? false;
    const securityLasersSuppressed = gasSuppressesLasers || fluxSuppressesLasers;
    const laserDangerWindow = this.laserSecurity?.isDangerWindow(now, securityLasersSuppressed) ?? false;
    this.laserSecurity?.update(now, dt, this.player, hazardTargets, playerLaserImmune, securityLasersSuppressed);
    this.bombletHazard?.update(now, this.player, hazardTargets, laserDangerWindow);
    this.updateEnemies(now, dt);
    if (!this.anomalyController || this.anomalyController.state === 'waiting' || this.anomalyController.state === 'resolved') {
      if (!this.tutorialDirector?.isActive()) this.arcadeController?.update(delta);
    }
    this.bombsiteMods.update(now, delta, this.bombSites.getActiveBombSites(), this.enemies, this.player);
    this.supremeModEffects?.update(now, this.enemies, this.bombSites.getActiveBombSites(), this.player);
    this.updateHomingMissiles(delta);
    this.updateProjectiles(delta);
    this.updateAbilities(now, dt);
    this.updateDeathMines(now);
    this.updateShieldState(now);
    this.updateArenaSupportPickups(now);
    this.updatePickups(now, dt);
    this.updateModPickups(now, dt);
    this.updateEmergencyCapacitor(now);
    this.updateCrosshair();
    this.updateHud(now);
    this.updateBalanceTelemetry();

    if (this.player.isDead()) {
      this.triggerDefeat('playerDead');
    }
  }

  private createInput(): void {
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input unavailable.');

    this.keys = {
      f8: kb.addKey('F8')
      ,f7: kb.addKey('F7')
      ,f6: kb.addKey('F6')
      ,f5: kb.addKey('F5')
    };

    const settings = SaveSystem.get().settings;
    this.playerInput = new PlayerInput(this, settings.abilityBindings, normalizeControllerSettings(settings.controller));
    this.refreshAbilityBindings();
    this.setGameplayCursorMode();
  }

  private recordTelemetryFrame(delta: number, now: number): void {
    let activeWeight = 0;
    for (const enemy of this.enemies) activeWeight += ENEMY_BALANCE[enemy.stats.type].weight;
    let activeCountCap: number | undefined;
    let activeWeightCap: number | undefined;
    let activeBombs = 0;
    if (!this.bossEncounter && !this.supremeFinale) {
      const profile = getSpawnProfile(this.roundManager.round, this.bombSites.destroyedCount());
      activeBombs = this.bombSites.activeBombCount();
      const pressure = getConcurrentSpawnPressure(profile, activeBombs);
      const modePressure = this.currentModeBalance().activePressureMultiplier;
      activeCountCap = Math.max(1, Math.round(pressure.activeCountCap * modePressure));
      activeWeightCap = Math.max(1, pressure.activeWeightCap * modePressure);
    }
    this.telemetryFrameBuffs.damageBoost = now < this.player.buffs.damageBoostUntil;
    this.telemetryFrameBuffs.speedBoost = now < this.player.buffs.speedBoostUntil;
    this.telemetryFrameBuffs.rapidFire = now < this.player.buffs.rapidFireUntil;
    const ammoMode = this.temporaryAmmo.activeMode(now);
    this.telemetryFrameBuffs.grenadeRounds = ammoMode === 'grenade';
    this.telemetryFrameBuffs.scattershot = ammoMode === 'scattershot';
    this.telemetryFrameInput.activeWeight = activeWeight;
    this.telemetryFrameInput.activeCountCap = activeCountCap;
    this.telemetryFrameInput.activeWeightCap = activeWeightCap;
    this.telemetryFrameInput.activeBombs = activeBombs;
    this.telemetryFrameInput.activeDefusers = this.activeDefuserCountForTelemetry;
    GameplayTelemetryRecorder.recordActiveFrame(
      delta, this.enemies.length, this.player.hp, this.player.energy, this.telemetryFrameInput
    );
  }

  private refreshAbilityBindings(): void {
    const settings = SaveSystem.get().settings;
    const abilityBindings = settings.abilityBindings;
    this.playerInput?.refresh(abilityBindings, normalizeControllerSettings(settings.controller));
    const slots = this.hudPayload.abilities;
    slots[0].keybind = this.playerInput?.prompt('fence', compactBindingLabel(abilityBindings.fence)) ?? compactBindingLabel(abilityBindings.fence);
    slots[1].keybind = this.playerInput?.prompt('turret', compactBindingLabel(abilityBindings.turret)) ?? compactBindingLabel(abilityBindings.turret);
    slots[2].keybind = this.playerInput?.prompt('mine', compactBindingLabel(abilityBindings.mine)) ?? compactBindingLabel(abilityBindings.mine);
    slots[3].keybind = this.playerInput?.prompt('shield', compactBindingLabel(abilityBindings.shield)) ?? compactBindingLabel(abilityBindings.shield);
  }

  private queueMineInputResolution(resolution: MineSalvoInputResolution | null): void {
    if (resolution === 'tap') this.placeAbility('mine', this.time.now);
    if (resolution === 'salvo') this.pendingMineSalvo = true;
  }

  private updateMineSalvoInput(now: number): void {
    if (!this.modRuntime.has('full-rack-salvo')) {
      this.mineSalvoInput.cancel();
      this.pendingMineSalvo = false;
      return;
    }
    if (this.playerInput.pressed('mine')) this.mineSalvoInput.press('action:mine', now);
    if (this.playerInput.released('mine')) {
      this.queueMineInputResolution(this.mineSalvoInput.release('action:mine', now));
    }
    this.queueMineInputResolution(this.mineSalvoInput.update(now));
  }

  private createCrosshair(): void {
    this.crosshair = this.add.graphics().setDepth(2100);
    this.crosshairValid = null;
  }

  private setGameplayCursorMode(): void {
    this.input.setDefaultCursor('none');
    if (this.crosshair) this.crosshair.setVisible(true);
  }

  private setMenuCursorMode(): void {
    this.input.setDefaultCursor('default');
    if (this.crosshair) this.crosshair.setVisible(false);
  }

  private updatePrismCosmetics(now: number): void {
    if (this.prismPlayerColor) {
      this.player.restoreOperativeAppearance(now);
    }
    if (this.prismFenceStyle) {
      const color = SaveSystem.getCosmeticColor('fenceStyle', now);
      for (const fence of this.fences) fence.setColor(color);
    }
    if (this.prismTurretSkin) {
      const color = SaveSystem.getCosmeticColor('turretSkin', now);
      for (const turret of this.turrets) turret.setColor(color);
    }
  }

  private createCombatPools(): void {
    const configureProjectile = (projectile: Projectile, state: ProjectileSpawn): void => {
      const sprite = projectile.sprite;
      const body = sprite.body as Phaser.Physics.Arcade.Body | null;
      if (body) {
        body.enable = true;
        body.reset(state.x, state.y);
        body.setVelocity(state.velocityX, state.velocityY);
      }
      sprite.setActive(true).setVisible(true).setPosition(state.x, state.y);
      sprite.setTexture(state.texture).setOrigin(0.5).setScale(1).setDisplaySize(state.width, state.height);
      sprite.clearTint().setTint(state.tint).setAlpha(1).setRotation(state.rotation).setDepth(state.depth);

      projectile.damage = state.damage;
      projectile.from = state.from;
      projectile.lifeMs = state.lifeMs;
      projectile.trailColor = state.trailColor;
      projectile.splitCurrentEligible = state.splitCurrentEligible;
      const crossedFences = projectile.crossedFences ?? (projectile.crossedFences = new Set<Fence>());
      crossedFences.clear();
      if (state.crossedFences) for (const fence of state.crossedFences) crossedFences.add(fence);
      projectile.previousX = state.previousX;
      projectile.previousY = state.previousY;
      projectile.telemetryOwner = state.telemetryOwner;
      projectile.critical = state.critical;
      projectile.turretId = state.turretId;
      projectile.bossAttack = state.bossAttack;
      projectile.ricochetsRemaining = state.ricochetsRemaining ?? 0;
      projectile.ammoMode = state.ammoMode ?? 'normal';
      projectile.nextTrailAt = this.time.now + Math.abs(Math.floor(state.x + state.y)) % 30;
      projectile.grenadeBouncesRemaining = state.grenadeBouncesRemaining ?? 0;
      projectile.grenadeTotalBounces = state.grenadeTotalBounces ?? 0;
      projectile.grenadeBounceStartedAt = state.grenadeBounceStartedAt ?? 0;
      projectile.grenadeNextBounceAt = state.grenadeNextBounceAt ?? 0;
      projectile.grenadeArcHeightMax = state.grenadeArcHeightMax ?? 0;
      projectile.grenadeFuseAt = state.grenadeFuseAt ?? 0;
      projectile.grenadeArmedAt = state.grenadeArmedAt ?? 0;
      projectile.grenadeNextProximityCheckAt = state.grenadeNextProximityCheckAt ?? 0;
      if (projectile.ammoMode === 'grenade') {
        projectile.grenadeShadow ??= this.add.circle(state.x, state.y + 3, 7, 0x02050a, 0.42)
          .setStrokeStyle(1, state.tint, 0.28).setDepth(state.depth - 1);
        projectile.grenadeShadow.setActive(true).setVisible(true).setPosition(state.x, state.y + 3)
          .setScale(1).setAlpha(0.42).setDepth(state.depth - 1).setStrokeStyle(1, state.tint, 0.28);
      } else {
        projectile.grenadeShadow?.setActive(false).setVisible(false).setPosition(-10_000, -10_000);
      }
    };

    this.projectilePool = new ReusableObjectPool<Projectile, ProjectileSpawn>(
      (state) => {
        const sprite = this.physics.add.image(state.x, state.y, state.texture);
        const projectile: Projectile = {
          sprite,
          damage: state.damage,
          from: state.from,
          lifeMs: state.lifeMs,
          trailColor: state.trailColor,
          nextTrailAt: 0,
          crossedFences: new Set<Fence>()
        };
        configureProjectile(projectile, state);
        return projectile;
      },
      configureProjectile,
      (projectile) => {
        const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
        if (body) {
          body.stop();
          body.enable = false;
        }
        projectile.sprite.setActive(false).setVisible(false).setPosition(-10_000, -10_000).setDepth(10_000);
        projectile.crossedFences?.clear();
        projectile.splitCurrentEligible = undefined;
        projectile.telemetryOwner = undefined;
        projectile.critical = undefined;
        projectile.turretId = undefined;
        projectile.bossAttack = undefined;
        projectile.ricochetsRemaining = 0;
        projectile.ammoMode = 'normal';
        projectile.grenadeBouncesRemaining = 0;
        projectile.grenadeTotalBounces = 0;
        projectile.grenadeBounceStartedAt = 0;
        projectile.grenadeNextBounceAt = 0;
        projectile.grenadeArcHeightMax = 0;
        projectile.grenadeFuseAt = 0;
        projectile.grenadeArmedAt = 0;
        projectile.grenadeNextProximityCheckAt = 0;
        projectile.sprite.setOrigin(0.5);
        projectile.grenadeShadow?.setActive(false).setVisible(false).setPosition(-10_000, -10_000);
      }
    );

    const configureFxCircle = (circle: Phaser.GameObjects.Arc, state: FxCircleSpawn): void => {
      circle.setActive(true).setVisible(true).setPosition(state.x, state.y).setRadius(state.radius);
      circle.setScale(1).setAlpha(1).setFillStyle(state.color, state.alpha).setDepth(state.depth);
      circle.setBlendMode(Phaser.BlendModes.NORMAL);
      circle.setStrokeStyle(state.strokeWidth ?? 0, state.strokeColor ?? state.color, state.strokeAlpha ?? 0);
    };
    this.fxCirclePool = new ReusableObjectPool<Phaser.GameObjects.Arc, FxCircleSpawn>(
      (state) => {
        const circle = this.add.circle(state.x, state.y, state.radius, state.color, state.alpha);
        configureFxCircle(circle, state);
        return circle;
      },
      configureFxCircle,
      (circle) => {
        this.tweens.killTweensOf(circle);
        circle.setActive(false).setVisible(false).setPosition(-10_000, -10_000).setDepth(10_000);
      }
    );
    this.projectileTrails?.destroy();
    this.projectileTrails = new ProjectileTrailBatch(this);
  }

  private obtainProjectile(state: ProjectileSpawn): Projectile {
    return this.projectilePool.obtain(state);
  }

  private retireProjectile(projectile: Projectile): void {
    this.projectilePool.release(projectile);
  }

  private destroyPooledProjectile(projectile: Projectile): void {
    projectile.grenadeShadow?.destroy();
    projectile.grenadeShadow = undefined;
    projectile.sprite.destroy();
  }

  private obtainFxCircle(state: FxCircleSpawn): Phaser.GameObjects.Arc {
    return this.fxCirclePool.obtain(state);
  }

  private retireFxCircle(circle: Phaser.GameObjects.Arc): void {
    this.fxCirclePool.release(circle);
  }

  private updatePlayerMovement(now: number): void {
    const aim = this.getAimWorldPoint();
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    if (this.tutorialDirector?.awaits('combat.aimChanged')) {
      if (this.tutorialAimAngle === null) this.tutorialAimAngle = angle;
      else if (Math.abs(Phaser.Math.Angle.Wrap(angle - this.tutorialAimAngle)) > 0.08) {
        this.tutorialAimAngle = angle;
        TutorialEventBus.emit('combat.aimChanged');
      }
    } else {
      this.tutorialAimAngle = null;
    }
    const forwardFacingFrame = this.player.texture.key === 'player-spaceship' || this.player.texture.key === 'player-airplane';
    this.player.setRotation(angle + (forwardFacingFrame ? 0 : Math.PI / 2));

    const movementX = this.playerInput.move.x;
    const movementY = this.playerInput.move.y;

    if (now >= this.player.dashUntil) {
      const movementLengthSquared = movementX * movementX + movementY * movementY;
      if (movementLengthSquared > 0) {
        if (this.tutorialDirector?.awaits('combat.playerMoved')) TutorialEventBus.emit('combat.playerMoved');
        const fieldSpeed = this.bombsiteMods?.playerMoveSpeedMultiplier(this.player.x, this.player.y) ?? 1;
        const speedScale = this.playerInput.activeDevice === 'gamepad'
          ? this.player.speed * fieldSpeed
          : this.player.speed * fieldSpeed / Math.sqrt(movementLengthSquared);
        this.player.setVelocity(movementX * speedScale, movementY * speedScale);
      } else {
        this.player.setVelocity(0, 0);
      }
    }

    if (this.playerInput.pressed('dash')) {
      if (!this.player.canDash(now)) {
        GameplayTelemetryRecorder.recordAbilityDenied('dash', 'cooldown');
        this.audio.playSfx('unavailable');
      } else if (!this.player.canSpendEnergy(PLAYER_BALANCE.dashEnergyCost)) {
        GameplayTelemetryRecorder.recordEnergyDenied('dash', PLAYER_BALANCE.dashEnergyCost, this.player.energy);
        this.audio.playSfx('unavailable');
      } else {
        this.player.spendEnergy(PLAYER_BALANCE.dashEnergyCost);
        GameplayTelemetryRecorder.recordAbilityUse('dash', PLAYER_BALANCE.dashEnergyCost);
        this.player.dashTowardPoint(aim.x, aim.y, now);
        if (this.tutorialDirector?.awaits('combat.ability.dash')) TutorialEventBus.emit('combat.ability.dash');
        if (this.sound.get('sfx-boost')) {
          this.sound.play('sfx-boost', { volume: this.audio.getSfxVolume() });
        } else {
          this.audio.playSfx('boost');
        }
        this.boostVisual.start(this.player, angle, now, this.player.dashUntil);
      }
    }

    this.boostVisual.update(this.player, now);

    if (this.playerInput.pressed('selectFence')) this.selectedAbility = 'fence';
    if (this.playerInput.pressed('selectTurret')) this.selectedAbility = 'turret';
    if (this.playerInput.pressed('selectMine')) this.selectedAbility = 'mine';

    this.updateMineSalvoInput(now);
    if (this.playerInput.pressed('fence')) this.placeAbility('fence', now);
    if (this.playerInput.pressed('turret')) this.placeAbility('turret', now);
    if (!this.modRuntime.has('full-rack-salvo') && this.playerInput.pressed('mine')) this.placeAbility('mine', now);
    if (this.pendingMineSalvo) {
      this.pendingMineSalvo = false;
      const { x, y } = this.getAimWorldPoint();
      this.placeFullRackSalvo(now, this.getAbilityConfig('mine'), x, y);
    }
    if (this.playerInput.pressed('shield')) this.activateShield(now);
    this.updateHoloAfterimage(now);
  }

  private updateHoloAfterimage(now: number): void {
    if (!this.modRuntime.hasInfusion('holo-afterimage') || now < this.nextHoloAfterimageAt) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (!body || body.velocity.lengthSq() < 36) return;
    this.nextHoloAfterimageAt = now + (this.particlesEnabled ? 90 : 180);
    const echo = this.trackRoundInfusionEffect(this.add.image(this.player.x, this.player.y, this.player.texture.key, this.player.frame.name)
      .setDisplaySize(this.player.displayWidth, this.player.displayHeight)
      .setRotation(this.player.rotation)
      .setTint(this.infusionSpectrumColor(0.12))
      .setAlpha(0.32)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7));
    this.tweens.add({
      targets: echo,
      alpha: 0,
      scaleX: 1.16,
      scaleY: 1.16,
      duration: 360,
      ease: 'Quad.Out',
      onComplete: () => this.releaseRoundInfusionEffect(echo)
    });
  }

  private updatePlayerShooting(now: number): void {
    if (!this.playerInput.held('fire')) return;
    if (this.player.heat >= this.player.weapon.maxHeat) return;

    const ammoMode = this.temporaryAmmo.activeMode(now);
    const fieldFireRate = this.bombsiteMods?.playerFireRateMultiplier(this.player.x, this.player.y) ?? 1;
    // Grenades use permanent weapon progression only. Rapid Fire and temporary
    // field cadence multipliers intentionally do not enter this calculation.
    const cadence = ammoMode === 'grenade'
      ? grenadeFireIntervalMs(this.player.weapon.fireRate)
      : 1000 / (this.player.fireRate * fieldFireRate);
    if (now - this.lastPlayerShotMs < cadence) return;
    const corruptedShotCost = this.modRuntime.has('fractured-current') ? MOD_BALANCE.fracturedCurrent.extraShotEnergyCost : 0;
    const shotEnergyCost = (WEAPON_BALANCE.energyCostPerShot + corruptedShotCost) * this.modRuntime.multiplier('weaponEnergyCost');
    if (!this.player.canSpendEnergy(shotEnergyCost)) {
      if (now - this.lastShotEnergyDeniedAt >= cadence) {
        this.lastShotEnergyDeniedAt = now;
        GameplayTelemetryRecorder.recordEnergyDenied('shot', shotEnergyCost, this.player.energy);
      }
      return;
    }
    this.player.spendEnergy(shotEnergyCost);
    this.lastPlayerShotMs = now;

    const aim = this.getAimWorldPoint();
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    const speed = this.player.weapon.projectileSpeed;

    const crit = Math.random() < this.player.weapon.critChance;
    const criticalMultiplier = WEAPON_BALANCE.critMultiplier * this.modRuntime.multiplier('weaponCritDamage');
    const damage = this.player.weapon.damage * this.player.damageMultiplier
      * this.modRuntime.supremePickupSurgeDamageMultiplier(now)
      * (crit ? criticalMultiplier : 1);
    const potentialDamage = ammoMode === 'scattershot'
      ? damage * TEMPORARY_AMMO_BALANCE.scattershot.pelletDamageMultiplier * TEMPORARY_AMMO_BALANCE.scattershot.pelletCount
      : damage;
    GameplayTelemetryRecorder.recordShot(potentialDamage, shotEnergyCost, crit);
    if (this.tutorialDirector?.awaits('combat.weaponFired')) TutorialEventBus.emit('combat.weaponFired');

    const spawnX = this.player.x + Math.cos(angle) * 14;
    const spawnY = this.player.y + Math.sin(angle) * 14;
    const projectileColor = SaveSystem.getCosmeticColor('projectileColor', now);
    const trailColor = SaveSystem.getCosmeticColor('trailColor', now);
    const ricochetsRemaining = now < this.player.buffs.ricochetUntil ? RICOCHET_MAX_WALL_BOUNCES : 0;
    if (ammoMode === 'scattershot') {
      for (let index = 0; index < SCATTERSHOT_ANGLE_OFFSETS.length; index += 1) {
        const pelletAngle = angle + SCATTERSHOT_ANGLE_OFFSETS[index];
        this.spawnPlayerAmmoProjectile(
          ammoMode, spawnX, spawnY, pelletAngle, speed, damage, projectileColor, trailColor, crit, ricochetsRemaining
        );
        if (index > 0) GameplayTelemetryRecorder.recordProjectileFired('weapon', crit);
      }
    } else {
      this.spawnPlayerAmmoProjectile(
        ammoMode, spawnX, spawnY, angle, speed, damage, projectileColor, trailColor, crit, ricochetsRemaining
      );
    }

    this.player.heat += this.player.weapon.heatPerShot;

    const flash = this.obtainFxCircle({
      x: this.player.x + Math.cos(angle) * 18, y: this.player.y + Math.sin(angle) * 18,
      radius: ammoMode === 'scattershot' ? 16 : ammoMode === 'grenade' ? 14 : 11,
      color: ammoMode === 'normal' ? 0xffffff : projectileColor,
      alpha: 0.8,
      depth: 9
    });
    this.tweens.add({ targets: flash, alpha: 0, scale: 2.2, duration: 110, onComplete: () => this.retireFxCircle(flash) });
    this.audio.playSfx('shot');
  }

  private spawnPlayerAmmoProjectile(
    mode: TemporaryAmmoMode,
    x: number,
    y: number,
    angle: number,
    baseSpeed: number,
    baseDamage: number,
    tint: number,
    trailColor: number,
    critical: boolean,
    ricochetsRemaining: number
  ): void {
    const grenade = mode === 'grenade';
    const scattershot = mode === 'scattershot';
    const speedMultiplier = grenade
      ? TEMPORARY_AMMO_BALANCE.grenade.projectileSpeedMultiplier
      : scattershot ? TEMPORARY_AMMO_BALANCE.scattershot.projectileSpeedMultiplier : 1;
    const damageMultiplier = scattershot ? TEMPORARY_AMMO_BALANCE.scattershot.pelletDamageMultiplier : 1;
    const width = grenade
      ? TEMPORARY_AMMO_BALANCE.grenade.width
      : scattershot ? TEMPORARY_AMMO_BALANCE.scattershot.width : this.projectileWidth;
    const height = grenade
      ? TEMPORARY_AMMO_BALANCE.grenade.height
      : scattershot ? TEMPORARY_AMMO_BALANCE.scattershot.height : this.projectileHeight;
    const lifeMs = grenade
      ? TEMPORARY_AMMO_BALANCE.grenade.projectileLifetimeMs
      : scattershot ? TEMPORARY_AMMO_BALANCE.scattershot.projectileLifetimeMs : 950;
    const speed = baseSpeed * speedMultiplier;
    const grenadeSequence = grenade ? this.grenadeProjectileSequence++ : 0;
    const bounceCount = grenade ? grenadeBounceCountForSequence(grenadeSequence) : 0;
    const now = this.time.now;
    this.projectiles.push(this.obtainProjectile({
      x,
      y,
      texture: grenade ? 'ammo-grenade-round' : scattershot ? 'ammo-scatter-pellet' : this.projectileTextureKey,
      width,
      height,
      tint,
      rotation: angle,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      depth: 8,
      damage: baseDamage * damageMultiplier,
      from: 'player',
      lifeMs,
      trailColor,
      splitCurrentEligible: true,
      previousX: x,
      previousY: y,
      telemetryOwner: 'weapon',
      critical,
      ricochetsRemaining,
      ammoMode: mode,
      grenadeBouncesRemaining: bounceCount,
      grenadeTotalBounces: bounceCount,
      grenadeBounceStartedAt: grenade ? now : 0,
      grenadeNextBounceAt: grenade ? now + TEMPORARY_AMMO_BALANCE.grenade.firstBounceDelayMs : 0,
      grenadeArcHeightMax: grenade ? TEMPORARY_AMMO_BALANCE.grenade.initialArcHeight : 0,
      grenadeFuseAt: grenade ? now + TEMPORARY_AMMO_BALANCE.grenade.fuseMs : 0,
      grenadeArmedAt: grenade ? now + TEMPORARY_AMMO_BALANCE.grenade.proximityArmingDelayMs : 0,
      grenadeNextProximityCheckAt: grenade ? initialGrenadeProximityCheckAt(now, grenadeSequence) : 0
    }));
  }

  private updatePlanting(delta: number): void {
    const interactPrompt = this.playerInput.prompt('interact', 'E');
    const activeBombCount = this.bombSites.activeBombCount();

    const near = this.bombSites.getNearestAvailable(this.player.x, this.player.y, 90);
    if (!near) {
      this.audio.stopPlantingLoop();
      this.activePlantingSite = null;
      this.plantingProgressMs = 0;
      this.siteActionText.setText(activeBombCount > 0
        ? `${activeBombCount} charge${activeBombCount === 1 ? '' : 's'} active. Defend them or move to another available site to plant.`
        : `Move to an available site and hold ${interactPrompt} to plant.`);
      return;
    }

    if (!this.bombSites.canPlant(near)) {
      this.audio.stopPlantingLoop();
      this.siteActionText.setText('Maximum active charges reached.');
      return;
    }

    if (this.playerInput.held('interact')) {
      this.audio.startPlantingLoop();
      if (this.activePlantingSite?.id !== near.id) {
        this.activePlantingSite = near;
        this.plantingProgressMs = 0;
      }
      this.state.set(RoundState.Planting);
      this.bombSites.setPlanting(near);
      this.plantingProgressMs += delta;
      const pct = Phaser.Math.Clamp(this.plantingProgressMs / OBJECTIVE_CONFIG.plantHoldMs, 0, 1);
      this.siteActionText.setText(`Planting Site ${near.letter}: ${Math.round(pct * 100)}%`);

      if (pct >= 1) {
        this.audio.stopPlantingLoop();
        this.bombSites.armSite(near, this.getBombDefenseDurationMs(), this.time.now);
        this.bombSites.refreshVisuals(this.layout.theme);
        this.activePlantingSite = null;
        this.plantingProgressMs = 0;
      }
    } else {
      this.audio.stopPlantingLoop();
      if (this.activePlantingSite && this.activePlantingSite.id === near.id) {
        this.bombSites.cancelPlanting(near);
      }
      this.activePlantingSite = null;
      this.plantingProgressMs = 0;
      this.state.set(activeBombCount > 0 ? RoundState.Defense : RoundState.PrePlant);
      this.siteActionText.setText(`Site ${near.letter} ready. Hold ${interactPrompt} to plant${activeBombCount > 0 ? ' while defending active charges' : ''}.`);
    }
  }

  private updateRelentlessSpawns(now: number, defensePhase: boolean): void {
    const level = this.roundManager.round;
    const destroyed = this.bombSites.destroyedCount();

    const profile = getSpawnProfile(level, destroyed);
    const activeSites = this.bombSites.getActiveBombSites();
    const oldestPlantTime = activeSites.reduce((oldest, site) => Math.min(oldest, site.plantedAt), Number.POSITIVE_INFINITY);
    const elapsedMs = Number.isFinite(oldestPlantTime) ? now - oldestPlantTime : 0;
    if (defensePhase && elapsedMs < profile.initialGraceMs) return;
    const phaseMultiplier = defensePhase ? getSpawnCadenceMultiplier(elapsedMs) : 1;
    if (phaseMultiplier === null) return;
    const concurrentPressure = getConcurrentSpawnPressure(profile, activeSites.length);
    const contractCadence = defensePhase ? getContract(this.contract)?.spawnCadenceMultiplier ?? 1 : 1;
    const bombsiteCadence = defensePhase ? this.bombsiteMods.spawnCadenceMultiplier() : 1;
    const cadenceMs = Math.round(getModeSpawnCadence(
      (defensePhase ? profile.defenseCadenceMs : profile.prePlantCadenceMs)
        * phaseMultiplier
        * concurrentPressure.cadenceMultiplier
        * contractCadence
        * bombsiteCadence,
      this.protocol
    ));
    const pressureMultiplier = this.currentModeBalance().activePressureMultiplier;
    const activeCountCap = Math.max(1, Math.round(concurrentPressure.activeCountCap * pressureMultiplier));
    const activeWeightCap = Math.max(1, concurrentPressure.activeWeightCap * pressureMultiplier);

    if (now < this.nextSpawnAt) return;
    this.nextSpawnAt = now + cadenceMs;
    const standardEnemyCount = this.enemies.reduce(
      (count, enemy) => count + (enemy.getData('n3onArcadeEvent') ? 0 : 1),
      0
    );
    if (standardEnemyCount >= activeCountCap) {
      GameplayTelemetryRecorder.recordSpawnAttempt('count-cap', cadenceMs);
      return;
    }

    const type = this.pickEnemyType(profile, now, defensePhase);
    if (!type) {
      GameplayTelemetryRecorder.recordSpawnAttempt('composition', cadenceMs);
      return;
    }
    const activeWeight = this.enemies.reduce(
      (sum, enemy) => sum + (enemy.getData('n3onArcadeEvent') ? 0 : ENEMY_BALANCE[enemy.stats.type].weight),
      0
    );
    if (activeWeight + ENEMY_BALANCE[type].weight > activeWeightCap) {
      GameplayTelemetryRecorder.recordSpawnAttempt('weight-cap', cadenceMs);
      return;
    }

    GameplayTelemetryRecorder.recordSpawnAttempt('spawned', 0);
    this.spawnEnemy(type, defensePhase);
    if (type === 'defuser') this.lastDefuserSpawnAt = now;
    if (type === 'tank' || type === 'disruptor' || type === 'star') this.lastSpecialSpawnAt = now;
  }

  private getAimWorldPoint(): Phaser.Math.Vector2 {
    return this.aimWorldPoint;
  }

  private refreshAimWorldPoint(): void {
    if (this.playerInput.activeDevice === 'gamepad') {
      const aim = this.playerInput.controllerAim;
      if (aim.magnitude > 0) this.controllerAimDistance = 150 + aim.magnitude * 260;
      this.aimWorldPoint.set(
        this.player.x + aim.x * this.controllerAimDistance,
        this.player.y + aim.y * this.controllerAimDistance
      );
    } else if (this.pointerLock?.locked) {
      this.pointerLock.worldPoint(this.cameras.main, this.aimWorldPoint);
    } else {
      this.aimWorldPoint.set(this.input.activePointer.worldX, this.input.activePointer.worldY);
    }
  }

  private pickEnemyType(profile: ReturnType<typeof getSpawnProfile>, now: number, defensePhase: boolean): EnemyType | null {
    const activeCount = (type: EnemyType): number => this.enemies.filter(
      (enemy) => !enemy.getData('n3onArcadeEvent') && enemy.stats.type === type
    ).length;
    const candidates = (Object.keys(profile.composition) as EnemyType[]).filter((type) => {
      if (profile.composition[type] <= 0 || this.roundManager.round < ENEMY_BALANCE[type].unlockRound) return false;
      if (!defensePhase && type === 'defuser') return false;
      if (type === 'defuser') {
        return activeCount(type) < OBJECTIVE_BALANCE.maxActiveDefusers
          && now - this.lastDefuserSpawnAt >= OBJECTIVE_BALANCE.defuserSpawnSpacingMs;
      }
      if (type === 'disruptor' && activeCount(type) >= (this.roundManager.round < 10 ? 1 : 2)) return false;
      if (type === 'star' && activeCount(type) >= 1) return false;
      if ((type === 'tank' || type === 'disruptor' || type === 'star') && now - this.lastSpecialSpawnAt < profile.specialSpacingMs) return false;
      return true;
    });
    if (candidates.length === 0) return 'grunt';

    const eliteWeightMultiplier = (getContract(this.contract)?.eliteCompositionWeightMultiplier ?? 1)
      * this.currentModeBalance().elitePressureMultiplier;
    const spawnWeight = (type: EnemyType): number => profile.composition[type]
      * (type === 'tank' || type === 'disruptor' || type === 'star' ? eliteWeightMultiplier : 1);
    const total = candidates.reduce((sum, type) => sum + spawnWeight(type), 0);
    let roll = Math.random() * total;
    for (const type of candidates) {
      roll -= spawnWeight(type);
      if (roll <= 0) return type;
    }
    return candidates[candidates.length - 1];
  }

  private spawnEnemy(type: EnemyType, defensePhase: boolean, explicitSpawn?: { x: number; y: number }): Enemy {
    const base = baseEnemyStats[type];
    const spawn = explicitSpawn ?? Phaser.Utils.Array.GetRandom(this.layout.enemySpawns);
    const curve = getDifficultyCurve(this.roundManager.round, this.bombSites.destroyedCount());
    const phaseScale = defensePhase ? 1 : 0.9;

    const stats = {
      ...base,
      hp: Math.round(applyEnemyHealthMode(
        base.hp * (1 + (curve.healthMultiplier - 1) * phaseScale) * (getContract(this.contract)?.enemyHealthMultiplier ?? 1),
        this.protocol
      )),
      speed: Math.round(base.speed * curve.speedMultiplier * this.currentModeBalance().enemySpeedMultiplier),
      damage: Math.round(applyEnemyDamageMode(
        base.damage * (1 + (curve.damageMultiplier - 1) * phaseScale),
        this.protocol
      ))
    };

    const enemyTexture = ENEMY_ROBOT_FRAMES[type].textureKey;
    const enemy = new Enemy(this, spawn.x, spawn.y, enemyTexture, stats);
    enemy.telemetrySpawnedAtActiveMs = GameplayTelemetryRecorder.recordEnemySpawn(type, stats.hp);
    if (type === 'tank') {
      enemy.lastShotMs = this.time.now - TANK_HOMING_MISSILE_BALANCE.cooldownMs * 0.35;
    }
    if (this.modRuntime.hasInfusion('enemy-growth')) enemy.setScale(1.12);
    if (type === 'star') {
      enemy.setTexture('enemy-star');
      enemy.setBlendMode(Phaser.BlendModes.ADD);
      enemy.setAngularVelocity(52);
    }
    const wallCollider = this.physics.add.collider(enemy, this.walls);
    const playerCollider = this.physics.add.collider(enemy, this.player, () => {
      const hit = this.player.takeDamage(enemy.stats.damage);
      if (hit) {
        GameplayTelemetryRecorder.recordPlayerDamage('enemy-contact', enemy.stats.damage);
      }
    });
    this.enemyColliders.set(enemy, [wallCollider, playerCollider]);

    this.enemies.push(enemy);
    const navigationSequence = this.enemyNavigationSequence++;
    this.navState.set(enemy, {
      path: [],
      waypointIndex: 0,
      nextRepathAt: 0,
      targetKey: '',
      lastSampleX: enemy.x,
      lastSampleY: enemy.y,
      lastSampleAt: this.time.now,
      stuckTicks: 0,
      preferObjective: false,
      nextFocusDecisionAt: 0,
      approachAngle: (navigationSequence * 2.399963229728653) % (Math.PI * 2),
      approachRadius: 34 + (navigationSequence % 4) * 8,
      recoveryUntil: 0,
      recoverySign: navigationSequence % 2 === 0 ? 1 : -1
    });
    this.patrolTargets.set(enemy, { x: spawn.x, y: spawn.y });
    return enemy;
  }

  private updateEnemies(now: number, dt: number): void {
    const activeSites = this.bombSites.getActiveBombSites();
    const gasHazard = this.gasHazard?.visualGasActive ? this.gasHazard : null;
    const activeDefusersBySite = this.activeDefusersBySite;
    activeDefusersBySite.clear();
    for (const defusers of this.activeDefuserEnemiesBySite.values()) defusers.length = 0;
    this.refreshDefuseAssignments(activeSites, now);

    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.isDead()) continue;
      enemy.updateDamageFlash(now);

      if (enemy.getData('arcadeMovementControlled')) {
        gasHazard?.carveVisualTunnel(
          enemy.x,
          enemy.y,
          Math.max(GAS_HAZARD_BALANCE.enemyTunnelRadius, enemy.hazardRadius + 6)
        );
        continue;
      }

      const assignedSite = this.defuseTargetByEnemy.get(enemy);
      const targetSite = assignedSite ?? this.selectEnemyObjective(enemy, activeSites);
      if (enemy.stats.type === 'tank' && !assignedSite) this.updateTankHomingMissile(enemy, now);
      if (!targetSite) {
        this.updateEnemyPatrol(enemy, now);
      } else if (assignedSite && this.defuseAssignees.has(enemy)) {
        if (this.updateDefuser(enemy, assignedSite, now, dt)) {
          activeDefusersBySite.set(assignedSite.id, (activeDefusersBySite.get(assignedSite.id) ?? 0) + 1);
          const defusers = this.activeDefuserEnemiesBySite.get(assignedSite.id) ?? [];
          defusers.push(enemy);
          this.activeDefuserEnemiesBySite.set(assignedSite.id, defusers);
        }
      } else if (enemy.stats.type === 'shooter') {
        this.updateShooter(enemy, now, targetSite);
      } else if (enemy.stats.type === 'disruptor') {
        this.updateDisruptor(enemy, now);
      } else {
        this.updateMelee(enemy, targetSite, now);
      }
      gasHazard?.carveVisualTunnel(
        enemy.x,
        enemy.y,
        Math.max(GAS_HAZARD_BALANCE.enemyTunnelRadius, enemy.hazardRadius + 6)
      );
    }

    let anyDefusing = false;
    const requiredDefuseMs = getEnemyDefuseDuration(
      OBJECTIVE_CONFIG.defuseRequiredMs,
      this.protocol
    );
    for (const site of activeSites) {
      const activeDefusers = activeDefusersBySite.get(site.id) ?? 0;
      if (activeDefusers > 0) {
        if (site.state === BombSiteState.Armed) this.activateEmergencyBombShield(site, now);
        this.bombSites.startDefuse(site);
        const shieldBlocked = this.modRuntime.bombShieldBlocks(site.id, now);
        const resolution = this.bombsiteMods.processDefuse(
          site,
          this.activeDefuserEnemiesBySite.get(site.id) ?? [],
          dt * 1000,
          requiredDefuseMs,
          now,
          this.player.weapon.damage * this.player.damageMultiplier,
          this.enemies,
          shieldBlocked
        );
        const requestedProgressMs = resolution.requestedProgressMs;
        activeDefusersBySite.set(site.id, resolution.activeDefusers);
        if (resolution.interrupted || resolution.activeDefusers <= 0) {
          GameplayTelemetryRecorder.recordDefuseProgress(site.id, 0, requestedProgressMs, activeDefusers);
          if (!resolution.interrupted) this.bombSites.stopDefuse(site);
          continue;
        }
        anyDefusing = true;
        GameplayTelemetryRecorder.recordDefuseProgress(
          site.id,
          shieldBlocked ? 0 : requestedProgressMs,
          shieldBlocked ? requestedProgressMs : 0,
          resolution.activeDefusers
        );
        if (!shieldBlocked
          && this.bombSites.applyDefuse(site, requestedProgressMs, requiredDefuseMs)) {
          GameplayTelemetryRecorder.recordDefuseCompleted(site.id);
          this.bombsiteMods.onBombDestroyed(site);
          this.triggerDefeat('bombDefused');
          return;
        }
      } else {
        this.bombSites.stopDefuse(site);
      }
    }
    this.activeDefuserCountForTelemetry = 0;
    for (const count of activeDefusersBySite.values()) this.activeDefuserCountForTelemetry += count;
    if (anyDefusing) {
      this.state.set(RoundState.Defusing);
      this.audio.startDisarmLoop();
    } else if (activeSites.length > 0) {
      this.state.set(RoundState.Defense);
      this.audio.stopDisarmLoop();
    }

    this.applyEnemySeparation();

    let enemyWriteIndex = 0;
    for (const enemy of this.enemies) {
      if (enemy.isDead()) {
        this.killEnemy(enemy);
      } else {
        this.enemies[enemyWriteIndex] = enemy;
        enemyWriteIndex += 1;
      }
    }
    this.enemies.length = enemyWriteIndex;
  }

  private refreshDefuseAssignments(activeSites: BombSiteRuntime[], now: number): void {
    this.defuseAssignees.clear();
    this.defuseTargetByEnemy.clear();
    if (activeSites.length === 0) return;

    const desired = getDefuseAssigneeCount(this.roundManager.round)
      + Math.max(0, activeSites.length - 1)
      + this.bombsiteMods.objectiveAssigneeBonus();
    const candidates = this.defuseCandidateBuffer;
    candidates.length = 0;
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.isDead() || enemy.getData('arcadeMovementControlled') || now < enemy.defuseInterruptedUntil) continue;
      let nearestDistanceSquared = Number.POSITIVE_INFINITY;
      for (const site of activeSites) {
        const dx = enemy.x - site.x;
        const dy = enemy.y - site.y;
        nearestDistanceSquared = Math.min(nearestDistanceSquared, dx * dx + dy * dy);
      }
      this.defuseCandidateDistanceSquared.set(enemy, nearestDistanceSquared);
      candidates.push(enemy);
    }
    candidates.sort((a, b) => {
        const specialistDifference = Number(b.stats.type === 'defuser') - Number(a.stats.type === 'defuser');
        if (specialistDifference !== 0) return specialistDifference;
        return (this.defuseCandidateDistanceSquared.get(a) ?? Number.POSITIVE_INFINITY)
          - (this.defuseCandidateDistanceSquared.get(b) ?? Number.POSITIVE_INFINITY);
      });
    const assignedPerSite = this.assignedDefusersPerSite;
    assignedPerSite.clear();
    const assignmentCount = Math.min(desired, candidates.length);
    for (let index = 0; index < assignmentCount; index += 1) {
      const enemy = candidates[index];
      let site: BombSiteRuntime | undefined;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const candidateSite of activeSites) {
        const dx = enemy.x - candidateSite.x;
        const dy = enemy.y - candidateSite.y;
        const score = Math.sqrt(dx * dx + dy * dy)
          + (assignedPerSite.get(candidateSite.id) ?? 0) * 480;
        if (score < bestScore) {
          bestScore = score;
          site = candidateSite;
        }
      }
      if (!site) continue;
      this.defuseAssignees.add(enemy);
      this.defuseTargetByEnemy.set(enemy, site);
      assignedPerSite.set(site.id, (assignedPerSite.get(site.id) ?? 0) + 1);
      if (this.modRuntime.rank('priority-targeting') >= 2) {
        this.defuserMarkedUntil.set(enemy, now + MOD_BALANCE.priorityTargeting.markedDurationMs);
      }
    }
  }

  private selectEnemyObjective(enemy: Enemy, activeSites: BombSiteRuntime[]): BombSiteRuntime | null {
    if (activeSites.length === 0) return null;
    const bombDurationMs = this.getBombDefenseDurationMs();
    let selected = activeSites[0];
    let dx = enemy.x - selected.x;
    let dy = enemy.y - selected.y;
    let bestScore = Math.sqrt(dx * dx + dy * dy)
      - Math.max(0, 1 - selected.timerMs / bombDurationMs) * 180;
    for (let index = 1; index < activeSites.length; index += 1) {
      const site = activeSites[index];
      dx = enemy.x - site.x;
      dy = enemy.y - site.y;
      const score = Math.sqrt(dx * dx + dy * dy)
        - Math.max(0, 1 - site.timerMs / bombDurationMs) * 180;
      if (score < bestScore) {
        selected = site;
        bestScore = score;
      }
    }
    return selected;
  }

  private activateEmergencyBombShield(site: BombSiteRuntime, now: number): void {
    const activation = this.modRuntime.activateBombShield(site.id, now);
    if (!activation) return;
    const color = SaveSystem.getCosmeticColor('bombColor', now);
    const shield = this.add.circle(site.x, site.y, 72, color, 0.12).setStrokeStyle(4, 0xffffff, 0.9).setDepth(12);
    this.tweens.add({ targets: shield, radius: 92, alpha: 0, duration: Math.max(350, activation.activeUntil - now), onComplete: () => shield.destroy() });
    if (!activation.knockback) return;
    for (const enemy of this.enemies) {
      if (enemy.stats.type === 'tank' || enemy.stats.type === 'star') continue;
      const dx = enemy.x - site.x;
      const dy = enemy.y - site.y;
      const distanceSquared = dx * dx + dy * dy;
      const radius = MOD_BALANCE.emergencyShield.knockbackRadius;
      if (distanceSquared > radius * radius || distanceSquared < 1) continue;
      const inverseDistance = 1 / Math.sqrt(distanceSquared);
      const resistance = enemy.stats.type === 'disruptor' ? 0.5 : 1;
      const speed = MOD_BALANCE.emergencyShield.knockbackSpeed * resistance;
      enemy.setVelocity(dx * inverseDistance * speed, dy * inverseDistance * speed);
      enemy.defuseInterruptedUntil = now + 600;
    }
  }

  private updateEnemyPatrol(enemy: Enemy, now: number): void {
    const target = this.patrolTargets.get(enemy) ?? { x: enemy.x, y: enemy.y };
    const targetDx = enemy.x - target.x;
    const targetDy = enemy.y - target.y;
    if (targetDx * targetDx + targetDy * targetDy < 42 * 42 || Math.random() < 0.002) {
      const bounds=this.layout.generation.bounds;
      target.x = Phaser.Math.Clamp(enemy.x + Phaser.Math.Between(-260, 260), bounds.x+60, bounds.x+bounds.w-60);
      target.y = Phaser.Math.Clamp(enemy.y + Phaser.Math.Between(-220, 220), bounds.y+60, bounds.y+bounds.h-60);
      this.patrolTargets.set(enemy, target);
    }

    const playerDx = enemy.x - this.player.x;
    const playerDy = enemy.y - this.player.y;
    if (playerDx * playerDx + playerDy * playerDy < 260 * 260) {
      this.navigateEnemy(enemy, this.player.x, this.player.y, now, enemy.stats.speed * 0.95);
      return;
    }

    this.navigateEnemy(enemy, target.x, target.y, now, enemy.stats.speed * 0.82);
  }

  private enemyPrefersObjective(enemy: Enemy, now: number, chance: number): boolean {
    const nav = this.navState.get(enemy);
    if (!nav) return Math.random() < chance;
    if (now >= nav.nextFocusDecisionAt) {
      nav.preferObjective = Math.random() < chance;
      nav.nextFocusDecisionAt = now + Phaser.Math.Between(900, 1400);
    }
    return nav.preferObjective;
  }

  private updateMelee(enemy: Enemy, site: BombSiteRuntime, now: number): void {
    const turretTarget = this.getSecondaryTurretTarget(enemy, now);
    if (turretTarget) {
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, turretTarget.sprite.x, turretTarget.sprite.y);
      this.navigateEnemy(enemy, turretTarget.sprite.x, turretTarget.sprite.y, now, enemy.stats.speed);
      if (distance <= ENEMY_BALANCE[enemy.stats.type].attackRange + 12
        && now - enemy.lastAttackMs >= ENEMY_BALANCE[enemy.stats.type].attackCooldownMs) {
        enemy.lastAttackMs = now;
        const roleScale = enemy.stats.type === 'star' ? 1.05 : enemy.stats.type === 'tank' ? 0.85 : 0.62;
        const applied = turretTarget.takeDamage(enemy.stats.damage * roleScale);
        GameplayTelemetryRecorder.recordTurretDamaged(turretTarget.telemetryId, applied);
        this.spawnImpact(turretTarget.sprite.x, turretTarget.sprite.y, enemy.stats.color);
      }
      return;
    }

    const toBomb = Phaser.Math.Distance.Between(enemy.x, enemy.y, site.x, site.y);
    const focusBombSite = toBomb < 260 || this.enemyPrefersObjective(enemy, now, 0.42);
    const tx = focusBombSite ? site.x : this.player.x;
    const ty = focusBombSite ? site.y : this.player.y;

    this.navigateEnemy(enemy, tx, ty, now, enemy.stats.speed, focusBombSite);

    if (enemy.stats.type === 'tank' || enemy.stats.type === 'star') {
      const isStar = enemy.stats.type === 'star';
      const fenceDamage = isStar ? 1.35 : 0.95;
      for (const f of this.fences) {
        if (Phaser.Math.Distance.Between(enemy.x, enemy.y, f.sprite.x, f.sprite.y) < 56) f.hp -= fenceDamage;
      }
    }
  }

  private activateShield(now: number): void {
    const durationMs = this.getShieldDurationMs();
    const cooldownMs = this.getShieldCooldownMs();
    const energyCost = this.getShieldEnergyCost();
    if (now < this.shieldActiveUntil) {
      GameplayTelemetryRecorder.recordAbilityDenied('shield', 'already-active');
      this.audio.playSfx('unavailable');
      return;
    }
    if (now < this.shieldCooldownUntil) {
      GameplayTelemetryRecorder.recordAbilityDenied('shield', 'cooldown');
      this.audio.playSfx('unavailable');
      return;
    }
    if (!this.player.canSpendEnergy(energyCost)) {
      GameplayTelemetryRecorder.recordEnergyDenied('shield', energyCost, this.player.energy);
      this.audio.playSfx('unavailable');
      return;
    }

    this.player.spendEnergy(energyCost);
    GameplayTelemetryRecorder.recordAbilityUse('shield', energyCost);
    if (this.tutorialDirector?.awaits('combat.ability.shield')) TutorialEventBus.emit('combat.ability.shield');

    this.shieldActiveUntil = now + durationMs;
    this.shieldCooldownUntil = now + cooldownMs;
    this.player.invulnUntil = Math.max(this.player.invulnUntil, this.shieldActiveUntil);

    if (!this.shieldVisual) this.createShieldVisual();
    this.audio.playSfx('shieldOn');
  }

  private updateShieldState(now: number): void {
    const shield = this.shieldVisual;
    if (!shield) return;
    if (now >= this.shieldActiveUntil) {
      this.audio.playSfx('shieldOff');
      this.destroyShieldOrb();
      return;
    }

    shield.update(this.player, now);
    this.player.invulnUntil = Math.max(this.player.invulnUntil, this.shieldActiveUntil);
  }

  private createShieldVisual(): void {
    this.shieldVisual = new OperativeShieldEffect(this, this.player);
  }

  private destroyShieldOrb(): void {
    this.shieldVisual?.destroy();
    this.shieldVisual = null;
  }

  private updateTankHomingMissile(enemy: Enemy, now: number): void {
    if (now - enemy.lastShotMs < TANK_HOMING_MISSILE_BALANCE.cooldownMs) return;
    if (this.homingMissiles.some((missile) => missile.owner === enemy && missile.sprite.active)) return;

    const distanceToPlayer = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    if (distanceToPlayer > TANK_HOMING_MISSILE_BALANCE.launchRange) return;

    enemy.lastShotMs = now;
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    const launchOffset = enemy.stats.size * 0.65;
    const x = enemy.x + Math.cos(angle) * launchOffset;
    const y = enemy.y + Math.sin(angle) * launchOffset;
    const speed = getTankHomingMissileSpeed(this.player.speed);
    const sprite = this.physics.add.image(x, y, 'projectile-missile');
    sprite.setDisplaySize(30, 14).setTint(COLORS.pink).setRotation(angle).setDepth(9);
    sprite.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(24, 10, true);

    this.homingMissiles.push({
      sprite,
      owner: enemy,
      hp: TANK_HOMING_MISSILE_BALANCE.health,
      lifeMs: TANK_HOMING_MISSILE_BALANCE.lifetimeMs,
      damage: applyEnemyDamageMode(TANK_HOMING_MISSILE_BALANCE.damage, this.protocol),
      detonated: false,
      nextTrailAt: now
    });
    GameplayTelemetryRecorder.recordProjectileFired('enemy');

    const launchFlash = this.obtainFxCircle({
      x, y, radius: 8, color: COLORS.pink, alpha: 0.28, depth: 8,
      strokeWidth: 2, strokeColor: COLORS.purple, strokeAlpha: 0.95
    });
    this.tweens.add({ targets: launchFlash, radius: 28, alpha: 0, duration: 260, onComplete: () => this.retireFxCircle(launchFlash) });
    this.audio.playSfx('beep');
  }

  private updateHomingMissiles(delta: number): void {
    const gasHazard = this.gasHazard?.visualGasActive ? this.gasHazard : null;
    let writeIndex = 0;
    for (const missile of this.homingMissiles) {
      if (missile.detonated || !missile.sprite.active || !missile.sprite.body) continue;

      missile.lifeMs -= delta;
      if (missile.lifeMs <= 0) {
        this.detonateHomingMissile(missile, 'expired');
        continue;
      }
      if (this.hitWall(missile.sprite.x, missile.sprite.y)) {
        this.detonateHomingMissile(missile, 'wall');
        continue;
      }

      const body = missile.sprite.body as Phaser.Physics.Arcade.Body;
      const currentAngle = body.velocity.lengthSq() > 0
        ? Math.atan2(body.velocity.y, body.velocity.x)
        : missile.sprite.rotation;
      const targetAngle = Phaser.Math.Angle.Between(missile.sprite.x, missile.sprite.y, this.player.x, this.player.y);
      const angle = steerTankHomingMissile(currentAngle, targetAngle, delta);
      const speed = getTankHomingMissileSpeed(this.player.speed);
      missile.sprite.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      missile.sprite.setRotation(angle);
      missile.sprite.setAlpha(missile.lifeMs < 1500 ? 0.7 + Math.sin(this.time.now * 0.035) * 0.3 : 1);
      if (this.time.now >= missile.nextTrailAt) {
        this.spawnProjectileTrail(missile.sprite.x, missile.sprite.y, COLORS.pink, this.time.now);
        missile.nextTrailAt = this.time.now + 30;
      }
      gasHazard?.carveVisualTunnel(
        missile.sprite.x,
        missile.sprite.y,
        GAS_HAZARD_BALANCE.projectileTunnelRadius
      );

      const playerDx = this.player.x - missile.sprite.x;
      const playerDy = this.player.y - missile.sprite.y;
      if (playerDx * playerDx + playerDy * playerDy <= 19 * 19) {
        this.detonateHomingMissile(missile, 'impact');
        continue;
      }
      this.homingMissiles[writeIndex] = missile;
      writeIndex += 1;
    }
    this.homingMissiles.length = writeIndex;
  }

  private detonateHomingMissile(missile: HomingMissile, cause: 'impact' | 'expired' | 'wall' | 'intercepted'): void {
    if (missile.detonated) return;
    missile.detonated = true;
    const { x, y } = missile.sprite;
    missile.sprite.destroy();

    const intercepted = cause === 'intercepted';
    const color = intercepted ? COLORS.cyan : COLORS.pink;
    const blast = this.obtainFxCircle({
      x, y, radius: 8, color, alpha: 0.3, depth: 12,
      strokeWidth: 3, strokeColor: intercepted ? COLORS.cyan : COLORS.purple, strokeAlpha: 0.95
    });
    this.tweens.add({
      targets: blast,
      radius: TANK_HOMING_MISSILE_BALANCE.blastRadius,
      alpha: 0,
      duration: intercepted ? 180 : 260,
      onComplete: () => this.retireFxCircle(blast)
    });
    this.spawnImpact(x, y, color);
    this.audio.playSfx('bomblet');
    this.fluxCores?.damageArea(
      x,
      y,
      TANK_HOMING_MISSILE_BALANCE.blastRadius,
      missile.damage,
      'enemy-projectile'
    );

    if (intercepted) {
      GameplayTelemetryRecorder.recordProjectileHit('enemy', 0, 0, false, true);
      return;
    }

    const playerDx = this.player.x - x;
    const playerDy = this.player.y - y;
    const playerInBlast = playerDx * playerDx + playerDy * playerDy
      <= TANK_HOMING_MISSILE_BALANCE.blastRadius * TANK_HOMING_MISSILE_BALANCE.blastRadius;
    if (playerInBlast) {
      const hit = this.player.takeDamage(missile.damage);
      GameplayTelemetryRecorder.recordProjectileHit('enemy', hit ? missile.damage : 0, 0, false, !hit);
      if (hit) {
        GameplayTelemetryRecorder.recordPlayerDamage('enemy-missile', missile.damage);
      }
      return;
    }

    GameplayTelemetryRecorder.recordProjectileMiss('enemy', cause === 'wall' ? 'wall' : 'expired');
  }

  private updateShooter(enemy: Enemy, now: number, site: BombSiteRuntime): void {
    const turretTarget = this.getSecondaryTurretTarget(enemy, now);
    const focusBombSite = this.enemyPrefersObjective(enemy, now, 0.25);
    const focusX = turretTarget?.sprite.x ?? (focusBombSite ? site.x : this.player.x);
    const focusY = turretTarget?.sprite.y ?? (focusBombSite ? site.y : this.player.y);

    const focusDeltaX = focusX - enemy.x;
    const focusDeltaY = focusY - enemy.y;
    const distanceSquared = focusDeltaX * focusDeltaX + focusDeltaY * focusDeltaY;
    const ideal = 230;
    const movementSpeed = enemy.effectiveSpeed(enemy.stats.speed, now);
    if (distanceSquared > (ideal + 24) * (ideal + 24)) {
      this.navigateEnemy(enemy, focusX, focusY, now, movementSpeed, focusBombSite && !turretTarget);
    } else if (distanceSquared < (ideal - 22) * (ideal - 22)) {
      const inverseDistance = distanceSquared > 0 ? 1 / Math.sqrt(distanceSquared) : 0;
      const bounds = this.layout.generation.bounds;
      const retreatX = Phaser.Math.Clamp(enemy.x - focusDeltaX * inverseDistance * 150, bounds.x + 55, bounds.x + bounds.w - 55);
      const retreatY = Phaser.Math.Clamp(enemy.y - focusDeltaY * inverseDistance * 150, bounds.y + 55, bounds.y + bounds.h - 55);
      this.navigateEnemy(enemy, retreatX, retreatY, now, movementSpeed * 0.85);
    } else {
      enemy.setVelocity(0, 0);
    }

    if (now - enemy.lastShotMs > ENEMY_BALANCE.shooter.attackCooldownMs) {
      enemy.lastShotMs = now;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, turretTarget?.sprite.x ?? this.player.x, turretTarget?.sprite.y ?? this.player.y);
      GameplayTelemetryRecorder.recordProjectileFired('enemy');
      this.projectiles.push(this.obtainProjectile({
        x: enemy.x, y: enemy.y, texture: 'circle', width: 7, height: 7, tint: COLORS.orange,
        rotation: angle, velocityX: Math.cos(angle) * 420, velocityY: Math.sin(angle) * 420, depth: 7,
        damage: enemy.stats.damage, from: 'enemy', lifeMs: 1400, trailColor: COLORS.orange, telemetryOwner: 'enemy'
      }));
    }
  }

  private updateDefuser(enemy: Enemy, site: BombSiteRuntime, now: number, dt: number): boolean {
    const toSite = Phaser.Math.Distance.Between(enemy.x, enemy.y, site.x, site.y);
    if (toSite > 46) {
      this.navigateEnemy(enemy, site.x, site.y, now, enemy.stats.speed, toSite > 104);
      enemy.defuseProgressMs = Math.max(0, enemy.defuseProgressMs - dt * 160);
      return false;
    }

    enemy.setVelocity(0, 0);
    return true;
  }

  private updateDisruptor(enemy: Enemy, now: number): void {
    let tx = this.player.x;
    let ty = this.player.y;
    const turret = this.turrets[0];
    const fence = this.fences[0];
    if (turret) {
      tx = turret.sprite.x;
      ty = turret.sprite.y;
    } else if (fence) {
      tx = fence.sprite.x;
      ty = fence.sprite.y;
    }

    this.navigateEnemy(enemy, tx, ty, now, enemy.stats.speed);

    if (now - enemy.lastAttackMs > ENEMY_BALANCE.disruptor.specialCooldownMs) {
      enemy.lastAttackMs = now;
      const pulse = this.add.circle(enemy.x, enemy.y, 16, COLORS.green, 0.2).setDepth(6);
      this.tweens.add({ targets: pulse, radius: 170, alpha: 0, duration: 500, onComplete: () => pulse.destroy() });
      for (const t of this.turrets) {
        if (Phaser.Math.Distance.Between(t.sprite.x, t.sprite.y, enemy.x, enemy.y) < 170) t.disabledUntil = now + ENEMY_BALANCE.disruptor.disableMs;
      }
      for (const f of this.fences) {
        if (Phaser.Math.Distance.Between(f.sprite.x, f.sprite.y, enemy.x, enemy.y) < 170) f.expiresAt = Math.min(f.expiresAt, now + 600);
      }
    }
  }

  private navigateEnemy(enemy: Enemy, targetX: number, targetY: number, now: number, speed: number, spreadApproach = false): void {
    speed = enemy.effectiveSpeed(speed, now);
    const nav = this.navState.get(enemy);
    if (!nav) return;

    if (spreadApproach) {
      const targetDeltaX = enemy.x - targetX;
      const targetDeltaY = enemy.y - targetY;
      if (targetDeltaX * targetDeltaX + targetDeltaY * targetDeltaY > 96 * 96) {
        targetX += Math.cos(nav.approachAngle) * nav.approachRadius;
        targetY += Math.sin(nav.approachAngle) * nav.approachRadius;
      }
    }

    const body = enemy.body as Phaser.Physics.Arcade.Body | null;
    if (body && (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down)) {
      nav.path.length = 0;
      nav.waypointIndex = 0;
      nav.nextRepathAt = 0;
      nav.stuckTicks = Math.max(1, nav.stuckTicks);
    }

    if (now - nav.lastSampleAt >= 240) {
      const movedX = enemy.x - nav.lastSampleX;
      const movedY = enemy.y - nav.lastSampleY;
      const targetDx = enemy.x - targetX;
      const targetDy = enemy.y - targetY;
      if (targetDx * targetDx + targetDy * targetDy > 46 * 46 && movedX * movedX + movedY * movedY < 5 * 5) {
        nav.stuckTicks += 1;
      } else {
        nav.stuckTicks = Math.max(0, nav.stuckTicks - 1);
      }

      nav.lastSampleX = enemy.x;
      nav.lastSampleY = enemy.y;
      nav.lastSampleAt = now;

      if (nav.stuckTicks >= 2) {
        nav.path.length = 0;
        nav.waypointIndex = 0;
        nav.nextRepathAt = 0;
        nav.recoveryUntil = now + 520;
        nav.recoverySign = nav.recoverySign === 1 ? -1 : 1;
        if (nav.stuckTicks >= 14) {
          const recovery = this.pathfinder.findNearestWalkableWorld(enemy.x, enemy.y, 0, 4);
          if (recovery) {
            const recoveryDx = recovery.x - enemy.x;
            const recoveryDy = recovery.y - enemy.y;
            if (recoveryDx * recoveryDx + recoveryDy * recoveryDy > 24 * 24) {
              enemy.setPosition(recovery.x, recovery.y);
              body?.reset(recovery.x, recovery.y);
              nav.lastSampleX = recovery.x;
              nav.lastSampleY = recovery.y;
            }
          }
          nav.stuckTicks = 4;
        }
      }
    }

    const key = `${Math.floor(targetX / 40)},${Math.floor(targetY / 40)}:${this.fences.length}-${this.mines.length}`;

    if (nav.path.length === 0 || nav.targetKey !== key || now >= nav.nextRepathAt) {
      nav.path = this.pathfinder.findPath(enemy.x, enemy.y, targetX, targetY, {
        cellPenalty: this.navigationCellPenalty,
        smooth: nav.stuckTicks === 0,
        maxIterations: 4800,
        output: nav.path
      });
      nav.waypointIndex = 0;
      nav.nextRepathAt = now + Phaser.Math.Between(360, 650);
      nav.targetKey = key;
    }

    let waypoint: PathPoint | undefined = nav.path[nav.waypointIndex];
    while (waypoint) {
      const dx = enemy.x - waypoint.x;
      const dy = enemy.y - waypoint.y;
      if (dx * dx + dy * dy >= 18 * 18) break;
      if (nav.waypointIndex < nav.path.length - 1) {
        nav.waypointIndex += 1;
        waypoint = nav.path[nav.waypointIndex];
      } else {
        waypoint = undefined;
      }
    }

    if (waypoint) {
      const dx = waypoint.x - enemy.x;
      const dy = waypoint.y - enemy.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > 0.2) {
        const inverseDistance = 1 / Math.sqrt(distanceSquared);
        this.setEnemyNavigationVelocity(enemy, dx * inverseDistance, dy * inverseDistance, speed, nav, now);
        return;
      }
    }

    const directX = targetX - enemy.x;
    const directY = targetY - enemy.y;
    const directDistanceSquared = directX * directX + directY * directY;
    if (directDistanceSquared <= 1) {
      enemy.setVelocity(0, 0);
    } else if (this.pathfinder.hasLineOfSightWorld(enemy.x, enemy.y, targetX, targetY)) {
      const inverseDistance = 1 / Math.sqrt(directDistanceSquared);
      this.setEnemyNavigationVelocity(enemy, directX * inverseDistance, directY * inverseDistance, speed, nav, now);
    } else {
      // Never fall back to driving directly into geometry when a path query
      // temporarily fails. The next staggered repath will try again.
      enemy.setVelocity(0, 0);
      nav.nextRepathAt = Math.min(nav.nextRepathAt, now + 90);
    }
  }

  private setEnemyNavigationVelocity(
    enemy: Enemy,
    directionX: number,
    directionY: number,
    speed: number,
    nav: NavState,
    now: number
  ): void {
    if (now >= nav.recoveryUntil) {
      enemy.setVelocity(directionX * speed, directionY * speed);
      return;
    }
    const lateralStrength = nav.stuckTicks >= 4 ? 0.52 : 0.34;
    const forwardStrength = Math.sqrt(1 - lateralStrength * lateralStrength);
    enemy.setVelocity(
      (directionX * forwardStrength - directionY * lateralStrength * nav.recoverySign) * speed,
      (directionY * forwardStrength + directionX * lateralStrength * nav.recoverySign) * speed
    );
  }

  private applyEnemySeparation(): void {
    this.enemySeparationGrid.rebuild(this.enemies);
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.isDead()) continue;
      this.separationSubject = enemy;
      this.enemySeparationGrid.forEachNearby(
        enemy.x,
        enemy.y,
        ENEMY_SEPARATION_RADIUS,
        this.applySeparationNeighbor
      );
    }
    this.separationSubject = null;
  }

  private drawTraversalDebug(): void {
    if (!import.meta.env.DEV) return;
    if (!this.traversalDebugVisible || !this.layout || !this.pathfinder) {
      this.traversalDebug?.setVisible(false);
      return;
    }
    const graphics = this.traversalDebug ?? this.add.graphics().setDepth(999);
    this.traversalDebug = graphics;
    graphics.clear().setVisible(true);
    graphics.fillStyle(0xff315f, 0.12);
    for (const blocker of this.getBlockers()) {
      graphics.fillRect(
        blocker.x - ENEMY_NAVIGATION_PADDING,
        blocker.y - ENEMY_NAVIGATION_PADDING,
        blocker.w + ENEMY_NAVIGATION_PADDING * 2,
        blocker.h + ENEMY_NAVIGATION_PADDING * 2
      );
    }
    graphics.lineStyle(2, 0x54ffb0, 0.72);
    for (const spawn of this.layout.enemySpawns) {
      for (const site of this.layout.bombSites) {
        const path = this.pathfinder.findPath(spawn.x, spawn.y, site.x, site.y, {
          smooth: true,
          maxIterations: 4800
        });
        if (path.length === 0) continue;
        graphics.beginPath();
        graphics.moveTo(spawn.x, spawn.y);
        for (const waypoint of path) graphics.lineTo(waypoint.x, waypoint.y);
        graphics.strokePath();
      }
    }
  }

  private spawnGrenadeBounceImpact(projectile: Projectile): void {
    const pulse = this.obtainFxCircle({
      x: projectile.sprite.x,
      y: projectile.sprite.y,
      radius: 4,
      color: projectile.sprite.tintTopLeft,
      alpha: 0.55,
      depth: 8,
      strokeWidth: 1,
      strokeColor: 0xffffff,
      strokeAlpha: 0.65
    });
    this.tweens.add({
      targets: pulse,
      radius: 13,
      alpha: 0,
      duration: 120,
      onComplete: () => this.retireFxCircle(pulse)
    });
  }

  /** Consumes one of the fixed 2-3 grenade bounces. Returns true when the
   * final bounce should detonate. No timers or per-bounce objects are kept. */
  private consumeGrenadeBounce(projectile: Projectile, now: number): boolean {
    this.spawnGrenadeBounceImpact(projectile);
    projectile.grenadeBouncesRemaining = Math.max(0, (projectile.grenadeBouncesRemaining ?? 0) - 1);
    if ((projectile.grenadeBouncesRemaining ?? 0) <= 0) return true;
    const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.setVelocity(
      body.velocity.x * TEMPORARY_AMMO_BALANCE.grenade.velocityRetentionPerBounce,
      body.velocity.y * TEMPORARY_AMMO_BALANCE.grenade.velocityRetentionPerBounce
    );
    const bounceIndex = Math.max(1, (projectile.grenadeTotalBounces ?? 1) - (projectile.grenadeBouncesRemaining ?? 0));
    projectile.grenadeBounceStartedAt = now;
    projectile.grenadeNextBounceAt = now + TEMPORARY_AMMO_BALANCE.grenade.firstBounceDelayMs
      * TEMPORARY_AMMO_BALANCE.grenade.bounceDelayScale ** bounceIndex;
    projectile.grenadeArcHeightMax = TEMPORARY_AMMO_BALANCE.grenade.initialArcHeight
      * TEMPORARY_AMMO_BALANCE.grenade.arcHeightScalePerBounce ** bounceIndex;
    return false;
  }

  private updateGrenadeFlight(projectile: Projectile, now: number, delta: number): boolean {
    if (now >= (projectile.grenadeFuseAt ?? 0)) return true;
    if (now >= (projectile.grenadeNextBounceAt ?? Number.POSITIVE_INFINITY)
      && this.consumeGrenadeBounce(projectile, now)) return true;
    const height = grenadeArcHeight(
      now,
      projectile.grenadeBounceStartedAt ?? now,
      projectile.grenadeNextBounceAt ?? now + 1,
      projectile.grenadeArcHeightMax ?? 0
    );
    projectile.sprite.setOrigin(0.5, 0.5 + height / Math.max(1, projectile.sprite.displayHeight));
    projectile.sprite.rotation += TEMPORARY_AMMO_BALANCE.grenade.spinRadiansPerSecond * delta / 1000;
    projectile.grenadeShadow?.setPosition(projectile.sprite.x, projectile.sprite.y + 3)
      .setScale(Math.max(0.38, 1 - height / 75))
      .setAlpha(Math.max(0.16, 0.42 - height / 145));
    return false;
  }

  /** Direct body contact is checked every frame. The larger forgiving fuse is
   * armed after muzzle clearance and sampled at a fixed rate against the
   * arena's existing enemy spatial grid. */
  private detonateGrenadeForNearbyTarget(projectile: Projectile, now: number): boolean {
    const x = projectile.sprite.x;
    const y = projectile.sprite.y;
    const directEnemy = this.findSpecialAmmoHitEnemy(x, y);
    if (directEnemy) {
      this.detonateGrenadeRound(projectile, x, y, directEnemy);
      return true;
    }
    const directBoss = this.findGrenadeBossContact(x, y, 5);
    if (directBoss) {
      this.detonateGrenadeRound(projectile, x, y, null, directBoss);
      return true;
    }
    if (!grenadeProximityCheckDue(
      now,
      projectile.grenadeArmedAt ?? Number.POSITIVE_INFINITY,
      projectile.grenadeNextProximityCheckAt ?? Number.POSITIVE_INFINITY
    )) return false;

    projectile.grenadeNextProximityCheckAt = nextGrenadeProximityCheckAt(now);
    const nearbyEnemy = this.findGrenadeProximityEnemy(x, y);
    if (nearbyEnemy) {
      this.detonateGrenadeRound(projectile, x, y, nearbyEnemy);
      return true;
    }
    const nearbyBoss = this.findGrenadeBossContact(
      x,
      y,
      TEMPORARY_AMMO_BALANCE.grenade.proximityFuseRadius
    );
    if (!nearbyBoss) return false;
    this.detonateGrenadeRound(projectile, x, y, null, nearbyBoss);
    return true;
  }

  private findGrenadeBossContact(x: number, y: number, clearance: number): Boss | null {
    const boss = this.nearestActiveBossTarget(x, y);
    if (!boss?.active || boss.isDefeated) return null;
    const dx = boss.x - x;
    const dy = boss.y - y;
    const triggerRadius = boss.hazardRadius + clearance;
    return dx * dx + dy * dy <= triggerRadius * triggerRadius ? boss : null;
  }

  /** 0 = blocked/no reflection, 1 = continue, 2 = final bounce/detonate. */
  private bounceGrenadeFromWall(projectile: Projectile, now: number): 0 | 1 | 2 {
    const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return 0;
    const previousX = projectile.previousX ?? projectile.sprite.x;
    const previousY = projectile.previousY ?? projectile.sprite.y;
    const reflected = reflectRicochetVelocity(
      body.velocity.x,
      body.velocity.y,
      this.hitWall(projectile.sprite.x, previousY),
      this.hitWall(previousX, projectile.sprite.y)
    );
    const speed = Math.hypot(reflected.x, reflected.y);
    if (speed <= 0.01) return 0;
    const safeX = previousX + reflected.x / speed * 5;
    const safeY = previousY + reflected.y / speed * 5;
    body.reset(safeX, safeY);
    body.setVelocity(reflected.x, reflected.y);
    projectile.previousX = safeX;
    projectile.previousY = safeY;
    projectile.sprite.setRotation(Math.atan2(reflected.y, reflected.x));
    return this.consumeGrenadeBounce(projectile, now) ? 2 : 1;
  }

  private updateProjectiles(delta: number): void {
    this.pendingSplitProjectiles.length = 0;
    const prismaticRounds = this.modRuntime.hasInfusion('prismatic-rounds');
    const jailbrokeTurrets = this.modRuntime.has('jailbroke-turrets');
    const now = this.time.now;
    this.projectileTrails?.beginFrame(now);
    const gasHazard = this.gasHazard?.visualGasActive ? this.gasHazard : null;
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.projectiles.length; readIndex += 1) {
      const p = this.projectiles[readIndex];
      p.lifeMs -= delta;
      if (p.lifeMs <= 0 || !p.sprite.body) {
        if (p.lifeMs <= 0 && p.ammoMode === 'grenade' && (p.from === 'player' || p.from === 'turret')) {
          this.detonateGrenadeRound(p, p.sprite.x, p.sprite.y, null);
        } else if (p.lifeMs <= 0 && p.telemetryOwner) {
          GameplayTelemetryRecorder.recordProjectileMiss(p.telemetryOwner, 'expired');
        }
        this.retireProjectile(p);
        continue;
      }

      if (p.ammoMode === 'grenade' && (p.from === 'player' || p.from === 'turret')) {
        if (this.detonateGrenadeForNearbyTarget(p, now)) {
          this.retireProjectile(p);
          continue;
        }
        if (this.updateGrenadeFlight(p, now, delta)) {
          this.detonateGrenadeRound(p, p.sprite.x, p.sprite.y, null);
          this.retireProjectile(p);
          continue;
        }
      }

      if (this.hitWall(p.sprite.x, p.sprite.y)) {
        if (p.ammoMode === 'grenade' && (p.from === 'player' || p.from === 'turret')) {
          const bounce = this.bounceGrenadeFromWall(p, now);
          if (bounce === 1) {
            this.projectiles[writeIndex++] = p;
            continue;
          }
          this.detonateGrenadeRound(p, p.sprite.x, p.sprite.y, null);
          this.retireProjectile(p);
          continue;
        }
        if (p.bossAttack === 'artillery-rocket') {
          this.explodeBossRocket(p);
          continue;
        }
        if (p.from === 'player' && (p.ricochetsRemaining ?? 0) > 0 && this.ricochetProjectileFromWall(p)) {
          this.projectiles[writeIndex++] = p;
          continue;
        }
        if (p.telemetryOwner) GameplayTelemetryRecorder.recordProjectileMiss(p.telemetryOwner, 'wall');
        if (p.bossAttack) this.spawnBossProjectileImpact(p, p.sprite.x, p.sprite.y);
        else this.spawnAmmoAwareImpact(p, p.sprite.x, p.sprite.y, p.trailColor);
        this.retireProjectile(p);
        continue;
      }

      gasHazard?.carveVisualTunnel(
        p.sprite.x,
        p.sprite.y,
        GAS_HAZARD_BALANCE.projectileTunnelRadius
      );

      let visualTrailColor = p.trailColor;
      const friendlyProjectile = p.from === 'player' || p.from === 'turret';
      const colorTime = now + (p.sprite.x + p.sprite.y) * 1.5;
      if (friendlyProjectile && this.prismProjectileColor) {
        p.sprite.setTint(SaveSystem.getCosmeticColor('projectileColor', colorTime));
      }
      if (friendlyProjectile && this.prismTrailColor) {
        visualTrailColor = SaveSystem.getCosmeticColor('trailColor', colorTime);
      }
      if (friendlyProjectile && prismaticRounds) {
        visualTrailColor = this.infusionSpectrumColor((p.sprite.x + p.sprite.y) * 0.0007);
        p.sprite.setTint(visualTrailColor);
      }
      if (now >= p.nextTrailAt) {
        this.spawnProjectileTrail(p.sprite.x, p.sprite.y, visualTrailColor, now);
        if (p.bossAttack) {
          const directionX = Math.cos(p.sprite.rotation);
          const directionY = Math.sin(p.sprite.rotation);
          const trailingDistance = p.bossAttack === 'artillery-rocket' ? 18 : 10;
          this.spawnProjectileTrail(
            p.sprite.x - directionX * trailingDistance,
            p.sprite.y - directionY * trailingDistance,
            p.bossAttack === 'artillery-rocket' ? 0xff6a35 : 0xffffff,
            now
          );
          if (p.bossAttack === 'artillery-rocket') {
            this.spawnProjectileTrail(
              p.sprite.x - directionX * 29,
              p.sprite.y - directionY * 29,
              0xffc05a,
              now
            );
          }
        }
        p.nextTrailAt = now + 30;
      }

      const canSplitAtFence = (p.crossedFences?.size ?? 0) < MAX_DISTINCT_FENCE_SPLITS && (p.from === 'player'
        || (p.from === 'turret' && jailbrokeTurrets));
      if (canSplitAtFence) {
        const splitCount = this.splitProjectileAtFence(p, this.pendingSplitProjectiles);
        if (splitCount > 0) {
          GameplayTelemetryRecorder.recordProjectileMiss(p.from === 'turret' ? 'turret' : 'weapon', 'fence-split', splitCount);
          this.retireProjectile(p);
          continue;
        }
      }

      const fluxSource = p.from === 'player'
        ? 'weapon'
        : p.from === 'turret' ? 'turret' : 'enemy-projectile';
      if (p.ammoMode !== 'grenade' && this.fluxCores?.damagePoint(p.sprite.x, p.sprite.y, 7, p.damage, fluxSource)) {
        this.spawnAmmoAwareImpact(p, p.sprite.x, p.sprite.y, p.sprite.tintTopLeft);
        this.retireProjectile(p);
        continue;
      }

      if (p.from === 'player' || p.from === 'turret') {
        if (p.from === 'player' && p.ammoMode !== 'grenade') {
          let hitMissile: HomingMissile | null = null;
          for (const missile of this.homingMissiles) {
            if (missile.detonated || !missile.sprite.active) continue;
            const dx = missile.sprite.x - p.sprite.x;
            const dy = missile.sprite.y - p.sprite.y;
            if (dx * dx + dy * dy <= 16 * 16) {
              hitMissile = missile;
              break;
            }
          }
          if (hitMissile) {
            const applied = Math.min(hitMissile.hp, p.damage);
            const overkill = Math.max(0, p.damage - applied);
            hitMissile.hp = Math.max(0, hitMissile.hp - applied);
            GameplayTelemetryRecorder.recordProjectileHit('weapon', applied, overkill, p.critical);
            this.spawnAmmoAwareImpact(p, p.sprite.x, p.sprite.y, COLORS.cyan);
            this.retireProjectile(p);
            if (hitMissile.hp <= 0) {
              this.detonateHomingMissile(hitMissile, 'intercepted');
            } else {
              hitMissile.sprite.setTintFill(0xffffff);
              this.time.delayedCall(55, () => {
                if (hitMissile.sprite.active) hitMissile.sprite.setTint(COLORS.pink);
              });
            }
            continue;
          }
        }

        const boss = p.ammoMode === 'grenade' ? null : this.nearestActiveBossTarget(p.sprite.x, p.sprite.y);
        if (boss?.active && !boss.isDefeated
          && (boss.x - p.sprite.x) ** 2 + (boss.y - p.sprite.y) ** 2 < (boss.hazardRadius + 8) ** 2) {
          const applied = boss.takeDamage(p.damage, p.from === 'player' ? 'weapon' : 'turret');
          const overkill = Math.max(0, p.damage - applied);
          if (p.from === 'turret') GameplayTelemetryRecorder.recordTurretHit(p.turretId ?? '', applied, overkill);
          else GameplayTelemetryRecorder.recordProjectileHit('weapon', applied, overkill, p.critical);
          this.spawnAmmoAwareImpact(p, p.sprite.x, p.sprite.y, p.sprite.tintTopLeft);
          this.retireProjectile(p);
          if (boss.isDefeated && (boss === this.bossEncounter?.boss || this.supremeFinale?.allDefeated)) {
            // Preserve all unprocessed pooled projectiles for the deferred boss
            // teardown. Nothing else should advance on the fatal-hit frame.
            for (let remaining = readIndex + 1; remaining < this.projectiles.length; remaining += 1) {
              this.projectiles[writeIndex++] = this.projectiles[remaining];
            }
            break;
          }
          continue;
        }
        const hitEnemy = p.ammoMode === 'grenade' ? null
          : p.ammoMode === 'scattershot'
          ? this.findSpecialAmmoHitEnemy(p.sprite.x, p.sprite.y)
          : this.findProjectileHitEnemy(p.sprite.x, p.sprite.y);
        if (hitEnemy) {
          const markedForTurret = this.defuseAssignees.has(hitEnemy) || now < (this.defuserMarkedUntil.get(hitEnemy) ?? 0);
          const conditionalBonus = p.from === 'turret' && this.modRuntime.rank('priority-targeting') === 3 && markedForTurret
            ? this.modRuntime.conditionalDamageBonus([MOD_BALANCE.priorityTargeting.rank3TurretDamageBonus])
            : 0;
          const finalDamage = p.damage * (1 + conditionalBonus);
          const wasAlive = !hitEnemy.isDead();
          const applied = hitEnemy.takeDamage(finalDamage, p.from === 'player' ? 'weapon' : 'turret');
          if (p.from === 'player' && applied > 0 && this.tutorialDirector?.awaits('combat.enemyDamaged')) TutorialEventBus.emit('combat.enemyDamaged', { type: hitEnemy.stats.type, damage: applied });
          const overkill = Math.max(0, finalDamage - applied);
          if (p.from === 'turret') GameplayTelemetryRecorder.recordTurretHit(p.turretId ?? '', applied, overkill);
          else GameplayTelemetryRecorder.recordProjectileHit('weapon', applied, overkill, p.critical);
          hitEnemy.defuseProgressMs = 0;
          hitEnemy.defuseInterruptedUntil = now + 800;
          if (wasAlive && hitEnemy.isDead() && p.from === 'player' && p.splitCurrentEligible) {
            this.triggerSplitCurrent(hitEnemy, finalDamage);
          }
          this.spawnAmmoAwareImpact(p, p.sprite.x, p.sprite.y, p.sprite.tintTopLeft, hitEnemy);
          this.retireProjectile(p);
          continue;
        }
      }

      if (p.from === 'enemy') {
        if (p.bossAttack === 'artillery-rocket') {
          const playerDx = this.player.x - p.sprite.x;
          const playerDy = this.player.y - p.sprite.y;
          let detonate = playerDx * playerDx + playerDy * playerDy <= 68 * 68;
          if (!detonate) {
            for (const turret of this.turrets) {
              const dx = turret.sprite.x - p.sprite.x;
              const dy = turret.sprite.y - p.sprite.y;
              if (dx * dx + dy * dy <= 54 * 54) { detonate = true; break; }
            }
          }
          if (detonate) {
            this.explodeBossRocket(p);
            continue;
          }
        }
        if ((this.player.x - p.sprite.x) ** 2 + (this.player.y - p.sprite.y) ** 2 < 16 * 16) {
          const hit = this.player.takeDamage(p.damage);
          if (p.telemetryOwner) GameplayTelemetryRecorder.recordProjectileHit(p.telemetryOwner, hit ? p.damage : 0, 0, false, !hit);
          if (p.bossAttack) GameplayTelemetryRecorder.recordBossAttackIntersection(p.bossAttack, hit ? p.damage : 0, !hit);
          if (hit) {
            GameplayTelemetryRecorder.recordPlayerDamage(p.bossAttack ? 'boss' : 'enemy-projectile', p.damage);
          }
          if (p.bossAttack) this.spawnBossProjectileImpact(p, p.sprite.x, p.sprite.y);
          this.retireProjectile(p);
          continue;
        }

        let hitTurret = false;
        for (const t of this.turrets) {
          if ((t.sprite.x - p.sprite.x) ** 2 + (t.sprite.y - p.sprite.y) ** 2 < 18 * 18) {
            const applied = t.takeDamage(p.damage);
            GameplayTelemetryRecorder.recordTurretDamaged(t.telemetryId, applied);
            if (p.telemetryOwner) GameplayTelemetryRecorder.recordProjectileHit(p.telemetryOwner, applied);
            if (p.bossAttack) this.spawnBossProjectileImpact(p, p.sprite.x, p.sprite.y);
            this.retireProjectile(p);
            hitTurret = true;
            break;
          }
        }
        if (hitTurret) continue;
      }

      p.previousX = p.sprite.x;
      p.previousY = p.sprite.y;
      this.projectiles[writeIndex] = p;
      writeIndex += 1;
    }
    this.projectiles.length = writeIndex;
    for (const split of this.pendingSplitProjectiles) this.projectiles.push(split);
    this.projectileTrails?.render(now);
  }

  private explodeBossRocket(projectile: Projectile): void {
    const x = projectile.sprite.x;
    const y = projectile.sprite.y;
    this.audio.playSfx('bomblet');
    this.applyBossAreaDamage(x, y, 68, projectile.damage, 'artillery-rocket');
    this.retireProjectile(projectile);
  }

  private spawnBossProjectileImpact(projectile: Projectile, x: number, y: number): void {
    const attack = projectile.bossAttack;
    if (!attack || attack === 'artillery-rocket') return;
    if (attack === 'storm-basic' || attack === 'storm-super') {
      this.mineExplosionVfx.emitColors(
        x, y, attack === 'storm-super' ? 38 : 30,
        0xffffff, 0xb980ff, 0x5deaff, 0x442080, this.time.now, false
      );
      return;
    }
    this.mineExplosionVfx.emitColors(x, y, 24, 0xffffff, 0xffb14f, 0xff6548, 0x57dfff, this.time.now, false);
  }

  private ricochetProjectileFromWall(projectile: Projectile): boolean {
    const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return false;
    const previousX = projectile.previousX ?? projectile.sprite.x;
    const previousY = projectile.previousY ?? projectile.sprite.y;
    const struckVerticalSurface = this.hitWall(projectile.sprite.x, previousY);
    const struckHorizontalSurface = this.hitWall(previousX, projectile.sprite.y);
    const reflected = reflectRicochetVelocity(
      body.velocity.x,
      body.velocity.y,
      struckVerticalSurface,
      struckHorizontalSurface
    );
    const velocityX = reflected.x;
    const velocityY = reflected.y;
    const speed = Math.hypot(velocityX, velocityY);
    if (speed <= 0.01) return false;
    const directionX = velocityX / speed;
    const directionY = velocityY / speed;
    const safeX = previousX + directionX * 4;
    const safeY = previousY + directionY * 4;
    body.reset(safeX, safeY);
    body.setVelocity(velocityX, velocityY);
    projectile.sprite.setRotation(Math.atan2(velocityY, velocityX));
    projectile.previousX = safeX;
    projectile.previousY = safeY;
    projectile.ricochetsRemaining = Math.max(0, (projectile.ricochetsRemaining ?? 0) - 1);
    this.spawnImpact(projectile.sprite.x, projectile.sprite.y, 0x6fffd2);
    return true;
  }

  private splitProjectileAtFence(projectile: Projectile, spawned: Projectile[]): number {
    const previousX = projectile.previousX ?? projectile.sprite.x;
    const previousY = projectile.previousY ?? projectile.sprite.y;
    let crossedFence: Fence | null = null;
    for (const fence of this.fences) {
      if (projectile.crossedFences?.has(fence)) continue;
      if (this.segmentsIntersect(
        previousX, previousY, projectile.sprite.x, projectile.sprite.y,
        fence.x1, fence.y1, fence.x2, fence.y2
      ) || this.distancePointToSegment(
        projectile.sprite.x, projectile.sprite.y,
        fence.x1, fence.y1, fence.x2, fence.y2
      ) <= 8) {
        crossedFence = fence;
        break;
      }
    }
    if (!crossedFence) return 0;

    const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return 0;
    const baseAngle = Math.atan2(body.velocity.y, body.velocity.x);
    const speed = Math.max(1, body.velocity.length());
    const turretFan = projectile.from === 'turret' ? this.modRuntime.jailbrokeTurretFan() : null;
    if (projectile.from === 'turret' && !turretFan) return 0;
    const splitStage = resolveFenceSplitStage(
      turretFan?.streamCount ?? ABILITY_BALANCE.fence.projectileFanCount,
      turretFan?.damageShare ?? ABILITY_BALANCE.fence.projectileFanDamageShare,
      projectile.crossedFences?.size ?? 0
    );
    if (!splitStage) return 0;
    const { streamCount: count, damageShare } = splitStage;
    const spacing = ABILITY_BALANCE.fence.projectileFanSpacingRadians;
    const texture = projectile.sprite.texture.key;
    const tint = projectile.sprite.tintTopLeft;
    const width = projectile.sprite.displayWidth;
    const height = projectile.sprite.displayHeight;
    const crossedFences = projectile.crossedFences ?? new Set<Fence>();
    crossedFences.add(crossedFence);
    for (let index = 0; index < count; index += 1) {
      const angle = baseAngle + (index - (count - 1) * 0.5) * spacing;
      const x = projectile.sprite.x + Math.cos(angle) * 11;
      const y = projectile.sprite.y + Math.sin(angle) * 11;
      spawned.push(this.obtainProjectile({
        x, y, texture, width, height, tint, rotation: angle,
        velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed, depth: 8,
        damage: projectile.damage * damageShare,
        from: projectile.from,
        lifeMs: projectile.lifeMs,
        trailColor: projectile.trailColor,
        splitCurrentEligible: projectile.splitCurrentEligible,
        crossedFences,
        previousX: x,
        previousY: y,
        telemetryOwner: projectile.telemetryOwner,
        critical: projectile.critical,
        turretId: projectile.turretId,
        ricochetsRemaining: projectile.ricochetsRemaining,
        ammoMode: projectile.ammoMode,
        grenadeBouncesRemaining: projectile.grenadeBouncesRemaining,
        grenadeTotalBounces: projectile.grenadeTotalBounces,
        grenadeBounceStartedAt: projectile.grenadeBounceStartedAt,
        grenadeNextBounceAt: projectile.grenadeNextBounceAt,
        grenadeArcHeightMax: projectile.grenadeArcHeightMax,
        grenadeFuseAt: projectile.grenadeFuseAt,
        grenadeArmedAt: projectile.grenadeArmedAt,
        grenadeNextProximityCheckAt: projectile.grenadeNextProximityCheckAt
      }));
    }
    const pulse = this.obtainFxCircle({
      x: projectile.sprite.x, y: projectile.sprite.y, radius: 8,
      color: SaveSystem.getCosmeticColor('fenceStyle', this.time.now), alpha: 0.25, depth: 9,
      strokeWidth: 2, strokeColor: 0xffffff, strokeAlpha: 0.8
    });
    this.tweens.add({ targets: pulse, radius: 28, alpha: 0, duration: 220, onComplete: () => this.retireFxCircle(pulse) });
    crossedFences.delete(crossedFence);
    return count;
  }

  private segmentsIntersect(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number
  ): boolean {
    const cross = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number =>
      (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const abC = cross(ax, ay, bx, by, cx, cy);
    const abD = cross(ax, ay, bx, by, dx, dy);
    const cdA = cross(cx, cy, dx, dy, ax, ay);
    const cdB = cross(cx, cy, dx, dy, bx, by);
    const orientationCrosses = ((abC <= 0 && abD >= 0) || (abC >= 0 && abD <= 0))
      && ((cdA <= 0 && cdB >= 0) || (cdA >= 0 && cdB <= 0));
    const boundsOverlap = Math.max(Math.min(ax, bx), Math.min(cx, dx)) <= Math.min(Math.max(ax, bx), Math.max(cx, dx)) + 0.01
      && Math.max(Math.min(ay, by), Math.min(cy, dy)) <= Math.min(Math.max(ay, by), Math.max(cy, dy)) + 0.01;
    return orientationCrosses && boundsOverlap;
  }

  private spawnProjectileTrail(x: number, y: number, color: number, now: number): void {
    this.projectileTrails?.emit(x, y, color, now);
  }

  private spawnImpact(x: number, y: number, color: number): void {
    const ring = this.obtainFxCircle({ x, y, radius: 6, color, alpha: 0.4, depth: 8 });
    this.tweens.add({ targets: ring, radius: 22, alpha: 0, duration: 190, onComplete: () => this.retireFxCircle(ring) });

    for (let i = 0; i < 6; i += 1) {
      const d = this.obtainFxCircle({ x, y, radius: Phaser.Math.Between(2, 4), color, alpha: 0.9, depth: 8 });
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const sp = Phaser.Math.Between(40, 160);
      this.tweens.add({
        targets: d,
        x: x + Math.cos(a) * sp * 0.2,
        y: y + Math.sin(a) * sp * 0.2,
        alpha: 0,
        duration: 210,
        onComplete: () => this.retireFxCircle(d)
      });
    }
  }

  private spawnAmmoAwareImpact(
    projectile: Projectile,
    x: number,
    y: number,
    color: number,
    directlyHitEnemy: Enemy | null = null
  ): void {
    if ((projectile.from === 'player' || projectile.from === 'turret') && projectile.ammoMode === 'grenade') {
      this.detonateGrenadeRound(projectile, x, y, directlyHitEnemy);
      return;
    }
    if ((projectile.from === 'player' || projectile.from === 'turret') && projectile.ammoMode === 'scattershot') {
      const pulse = this.obtainFxCircle({
        x,
        y,
        radius: 3,
        color,
        alpha: 0.72,
        depth: 8,
        strokeWidth: 1,
        strokeColor: 0xffffff,
        strokeAlpha: 0.5
      });
      this.tweens.add({
        targets: pulse,
        radius: 11,
        alpha: 0,
        duration: 125,
        onComplete: () => this.retireFxCircle(pulse)
      });
      return;
    }
    this.spawnImpact(x, y, color);
  }

  private detonateGrenadeRound(
    projectile: Projectile,
    x: number,
    y: number,
    directlyHitEnemy: Enemy | null,
    directlyHitBoss: Boss | null = null
  ): void {
    const radius = TEMPORARY_AMMO_BALANCE.grenade.splashRadius;
    this.audio.playSfx('grenadeShotExplosion');
    const primaryColor = projectile.sprite.tintTopLeft;
    const secondaryColor = projectile.trailColor;
    this.mineExplosionVfx.emitColors(
      x,
      y,
      radius,
      0xffffff,
      primaryColor,
      secondaryColor,
      primaryColor,
      this.time.now,
      false
    );

    // The old direct-plus-splash balance is preserved at the grenade's final
    // landing point: one primary target receives the round damage and nearby
    // targets receive the restrained splash fraction.
    const source = projectile.from === 'turret' ? 'turret' : 'weapon';
    const primaryEnemy = directlyHitEnemy ?? this.findSpecialAmmoHitEnemy(x, y);
    if (primaryEnemy && !primaryEnemy.isDead()) {
      const markedForTurret = this.defuseAssignees.has(primaryEnemy)
        || this.time.now < (this.defuserMarkedUntil.get(primaryEnemy) ?? 0);
      const conditionalBonus = source === 'turret'
        && this.modRuntime.rank('priority-targeting') === 3
        && markedForTurret
        ? this.modRuntime.conditionalDamageBonus([MOD_BALANCE.priorityTargeting.rank3TurretDamageBonus])
        : 0;
      const finalDamage = projectile.damage * (1 + conditionalBonus);
      const wasAlive = !primaryEnemy.isDead();
      const applied = primaryEnemy.takeDamage(finalDamage, source);
      if (source === 'weapon' && applied > 0 && this.tutorialDirector?.awaits('combat.enemyDamaged')) {
        TutorialEventBus.emit('combat.enemyDamaged', { type: primaryEnemy.stats.type, damage: applied });
      }
      const overkill = Math.max(0, finalDamage - applied);
      if (source === 'turret') GameplayTelemetryRecorder.recordTurretHit(projectile.turretId ?? '', applied, overkill);
      else GameplayTelemetryRecorder.recordProjectileHit('weapon', applied, overkill, projectile.critical);
      primaryEnemy.defuseProgressMs = 0;
      primaryEnemy.defuseInterruptedUntil = this.time.now + 800;
      if (wasAlive && primaryEnemy.isDead() && projectile.from === 'player' && projectile.splitCurrentEligible) {
        this.triggerSplitCurrent(primaryEnemy, finalDamage);
      }
    }

    const boss = directlyHitBoss ?? this.nearestActiveBossTarget(x, y);
    if (boss?.active && !boss.isDefeated
      && (directlyHitBoss === boss
        || (boss.x - x) ** 2 + (boss.y - y) ** 2 <= (radius + boss.hazardRadius) ** 2)) {
      const applied = boss.takeDamage(projectile.damage, source);
      const overkill = Math.max(0, projectile.damage - applied);
      if (source === 'turret') GameplayTelemetryRecorder.recordTurretHit(projectile.turretId ?? '', applied, overkill);
      else GameplayTelemetryRecorder.recordProjectileHit('weapon', applied, overkill, projectile.critical);
    }
    this.fluxCores?.damagePoint(x, y, radius, projectile.damage, source);

    this.grenadeSplashX = x;
    this.grenadeSplashY = y;
    this.grenadeSplashRadiusSquared = radius * radius;
    this.grenadeSplashDamage = projectile.damage * TEMPORARY_AMMO_BALANCE.grenade.splashDamageMultiplier;
    this.grenadeSplashCritical = projectile.critical ?? false;
    this.grenadeSplashExcludedEnemy = primaryEnemy;
    this.grenadeSplashOwner = source;
    this.grenadeSplashTurretId = projectile.turretId ?? '';
    this.enemySeparationGrid.forEachNearby(x, y, radius, this.applyGrenadeSplashNeighbor);
    this.grenadeSplashExcludedEnemy = null;
    this.grenadeSplashOwner = 'weapon';
    this.grenadeSplashTurretId = '';
  }

  private playMineExplosion(x: number, y: number, radius: number, mine: Mine): void {
    this.mineExplosionVfx.emit(x, y, radius, mine.explosionPalette, this.time.now);
  }

  private placeAbility(type: AbilityType, now: number): void {
    const cfg = this.getAbilityConfig(type);
    if (type !== 'mine' && now < this.abilityCooldownUntil[type]) {
      GameplayTelemetryRecorder.recordAbilityDenied(type, 'cooldown');
      this.audio.playSfx('unavailable');
      return;
    }
    if (type === 'mine' && this.mineChargeRack.availability(now, cfg.cooldownMs) !== 'ready') {
      GameplayTelemetryRecorder.recordAbilityDenied('mine', 'cooldown');
      this.audio.playSfx('unavailable');
      return;
    }

    const { x, y } = this.getAimWorldPoint();

    if (!this.player.canSpendEnergy(cfg.energyCost)) {
      GameplayTelemetryRecorder.recordEnergyDenied(type, cfg.energyCost, this.player.energy);
      this.audio.playSfx('unavailable');
      return;
    }

    if (!this.isValidPlacement(x, y)) {
      GameplayTelemetryRecorder.recordAbilityDenied(type, 'invalid-placement');
      this.audio.playSfx('unavailable');
      return;
    }

    if (type === 'fence') {
      if (this.fences.length >= cfg.maxActive) {
        GameplayTelemetryRecorder.recordAbilityDenied('fence', 'active-limit');
        this.audio.playSfx('unavailable');
        return;
      }
      const fence = new Fence(this, x, y, this.player.rotation, SaveSystem.getCosmeticColor('fenceStyle', now), ABILITY_BALANCE.fence.width, cfg.durationMs, cfg.hp, cfg.damage, ABILITY_BALANCE.fence.slowFactor);
      this.fences.push(fence);
    }

    if (type === 'turret') {
      if (this.turrets.length >= cfg.maxActive) {
        GameplayTelemetryRecorder.recordAbilityDenied('turret', 'active-limit');
        this.audio.playSfx('unavailable');
        return;
      }
      const equippedTurretSkin = getCosmeticById(SaveSystem.getEquippedCosmeticId('turretSkin'));
      const turret = new Turret(this, x, y, SaveSystem.getCosmeticColor('turretSkin', now), cfg.hp, cfg.damage, cfg.fireRate, cfg.range, equippedTurretSkin?.turretSkinEffect, equippedTurretSkin?.accentColor);
      turret.telemetryId = `turret-${++this.turretTelemetrySequence}`;
      this.turrets.push(turret);
      GameplayTelemetryRecorder.recordTurretPlaced(turret.telemetryId, { maximumHealth: cfg.hp, damage: cfg.damage, fireRate: cfg.fireRate, range: cfg.range });
    }

    if (type === 'mine') {
      // Energy and placement are validated before the authoritative rack is
      // consumed, so a failed placement never loses a charge.
      if (!this.mineChargeRack.spend(now, cfg.cooldownMs)) {
        GameplayTelemetryRecorder.recordAbilityDenied('mine', 'cooldown');
        this.audio.playSfx('unavailable');
        return;
      }
      const mine = new Mine(this, x, y, COLORS.orange, cfg.armMs, cfg.damage, cfg.radius);
      this.mines.push(mine);
    }

    this.player.spendEnergy(cfg.energyCost);
    GameplayTelemetryRecorder.recordAbilityUse(type, cfg.energyCost);
    if (type !== 'mine') this.abilityCooldownUntil[type] = now + cfg.cooldownMs;
    this.audio.playSfx(type === 'turret' ? 'placeTurret' : type === 'fence' ? 'electricFence' : 'placeMine');
    if (this.tutorialDirector?.awaits(`combat.ability.${type}`)) TutorialEventBus.emit(`combat.ability.${type}`, { type });
  }

  private placeFullRackSalvo(now: number, cfg: AbilityRuntimeConfig, aimX: number, aimY: number): void {
    const salvo = this.modRuntime.fullRackSalvo();
    if (!salvo) return;
    const rack = this.mineChargeRack.snapshot(now, cfg.cooldownMs);
    const availableMines = rack.currentCharges;
    if (availableMines === 0) {
      GameplayTelemetryRecorder.recordAbilityDenied('mine', 'cooldown');
      this.audio.playSfx('unavailable');
      return;
    }

    const totalEnergyCost = getMineRackEnergyCost(cfg.energyCost, availableMines, salvo.energyCostMultiplier);
    if (!this.player.canSpendEnergy(totalEnergyCost)) {
      GameplayTelemetryRecorder.recordEnergyDenied('mine', totalEnergyCost, this.player.energy);
      this.audio.playSfx('unavailable');
      return;
    }

    const points = this.resolveMineRackPattern(aimX, aimY, availableMines, salvo.spacing);
    if (!points) {
      GameplayTelemetryRecorder.recordAbilityDenied('mine', 'invalid-placement');
      this.audio.playSfx('unavailable');
      return;
    }
    if (!this.mineChargeRack.spendMany(now, cfg.cooldownMs, availableMines)) {
      GameplayTelemetryRecorder.recordAbilityDenied('mine', 'cooldown');
      this.audio.playSfx('unavailable');
      return;
    }

    points.forEach((point, index) => {
      this.mines.push(new Mine(
        this,
        point.x,
        point.y,
        COLORS.orange,
        cfg.armMs,
        cfg.damage,
        cfg.radius,
        {
          fromX: this.player.x,
          fromY: this.player.y,
          durationMs: salvo.flightMs,
          delayMs: index * salvo.staggerMs
        }
      ));
    });
    this.player.spendEnergy(totalEnergyCost);
    GameplayTelemetryRecorder.recordAbilityUse('mine', totalEnergyCost);
    // A rack salvo is one placement action. Use one cue when the first mine
    // lands instead of stacking a sound for every mine in the pattern.
    this.time.delayedCall(salvo.flightMs, () => this.audio.playSfx('placeMine'));
    if (this.tutorialDirector?.awaits('combat.ability.mine')) TutorialEventBus.emit('combat.ability.mine', { type: 'mine', count: points.length, salvo: true });
  }

  private resolveMineRackPattern(
    aimX: number,
    aimY: number,
    count: number,
    spacing: number
  ): Array<{ x: number; y: number }> | null {
    const rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, aimX, aimY) + Math.PI / 4;
    const centerCandidates: Array<{ x: number; y: number }> = [{ x: aimX, y: aimY }];
    for (const distance of [30, 60, 90]) {
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI / 4;
        centerCandidates.push({ x: aimX + Math.cos(angle) * distance, y: aimY + Math.sin(angle) * distance });
      }
    }

    for (const center of centerCandidates) {
      for (const scale of [1, 0.84, 0.68, 0.52]) {
        const offsets = getMineRackPatternOffsets(count, spacing * scale, rotation);
        const points = offsets.map((offset) => ({ x: center.x + offset.x, y: center.y + offset.y }));
        if (points.every((point, index) => this.isValidMineRackPoint(point.x, point.y, points, index))) return points;
      }
    }
    return null;
  }

  private isValidMineRackPoint(
    x: number,
    y: number,
    points: Array<{ x: number; y: number }>,
    pointIndex: number
  ): boolean {
    if (!this.isValidPlacement(x, y) || this.intersectsWallGeometry(x, y, 18, 18)) return false;
    const minimumSpacingSquared = 30 * 30;
    for (const mine of this.mines) {
      const dx = mine.sprite.x - x;
      const dy = mine.sprite.y - y;
      if (dx * dx + dy * dy < minimumSpacingSquared) return false;
    }
    for (let index = 0; index < pointIndex; index += 1) {
      const dx = points[index].x - x;
      const dy = points[index].y - y;
      if (dx * dx + dy * dy < minimumSpacingSquared) return false;
    }
    return true;
  }

  private spawnTurretAmmoVolley(
    turret: Turret,
    mode: TemporaryAmmoMode,
    angle: number,
    damage: number,
    now: number
  ): void {
    const scattershot = mode === 'scattershot';
    const grenade = mode === 'grenade';
    const count = scattershot ? SCATTERSHOT_ANGLE_OFFSETS.length : 1;
    const projectileColor = SaveSystem.getCosmeticColor('projectileColor', now);
    const trailColor = SaveSystem.getCosmeticColor('trailColor', now);
    for (let index = 0; index < count; index += 1) {
      const projectileAngle = angle + (scattershot ? SCATTERSHOT_ANGLE_OFFSETS[index] : 0);
      const speed = 560 * (grenade
        ? TEMPORARY_AMMO_BALANCE.grenade.projectileSpeedMultiplier
        : scattershot ? TEMPORARY_AMMO_BALANCE.scattershot.projectileSpeedMultiplier : 1);
      const grenadeSequence = grenade ? this.grenadeProjectileSequence++ : 0;
      const bounceCount = grenade ? grenadeBounceCountForSequence(grenadeSequence) : 0;
      this.projectiles.push(this.obtainProjectile({
        x: turret.sprite.x,
        y: turret.sprite.y,
        texture: grenade ? 'ammo-grenade-round' : scattershot ? 'ammo-scatter-pellet' : 'circle',
        width: grenade ? TEMPORARY_AMMO_BALANCE.grenade.width : scattershot ? TEMPORARY_AMMO_BALANCE.scattershot.width : 6,
        height: grenade ? TEMPORARY_AMMO_BALANCE.grenade.height : scattershot ? TEMPORARY_AMMO_BALANCE.scattershot.height : 6,
        tint: projectileColor,
        rotation: projectileAngle,
        velocityX: Math.cos(projectileAngle) * speed,
        velocityY: Math.sin(projectileAngle) * speed,
        depth: grenade || scattershot ? 8 : 0,
        damage: damage * (scattershot ? TEMPORARY_AMMO_BALANCE.scattershot.pelletDamageMultiplier : 1),
        from: 'turret',
        lifeMs: grenade ? TEMPORARY_AMMO_BALANCE.grenade.projectileLifetimeMs
          : scattershot ? TEMPORARY_AMMO_BALANCE.scattershot.projectileLifetimeMs : 1150,
        trailColor,
        telemetryOwner: 'turret',
        turretId: turret.telemetryId,
        ammoMode: mode,
        previousX: turret.sprite.x,
        previousY: turret.sprite.y,
        grenadeBouncesRemaining: bounceCount,
        grenadeTotalBounces: bounceCount,
        grenadeBounceStartedAt: grenade ? now : 0,
        grenadeNextBounceAt: grenade ? now + TEMPORARY_AMMO_BALANCE.grenade.firstBounceDelayMs : 0,
        grenadeArcHeightMax: grenade ? TEMPORARY_AMMO_BALANCE.grenade.initialArcHeight : 0,
        grenadeFuseAt: grenade ? now + TEMPORARY_AMMO_BALANCE.grenade.fuseMs : 0,
        grenadeArmedAt: grenade ? now + TEMPORARY_AMMO_BALANCE.grenade.proximityArmingDelayMs : 0,
        grenadeNextProximityCheckAt: grenade ? initialGrenadeProximityCheckAt(now, grenadeSequence) : 0
      }));
      GameplayTelemetryRecorder.recordTurretShot(turret.telemetryId);
    }
  }

  private updateAbilities(now: number, dt: number): void {
    for (const turret of this.turrets) {
      turret.updateCosmetic(now);
      const playerAmmoMode = this.temporaryAmmo.activeSpecialMode(now);
      const turretAmmoMode = this.turretWeaponSync.activeAmmoMode(
        now, playerAmmoMode, this.modRuntime.turretWeaponSyncEnabled()
      );
      const turretDamageBoosted = this.turretWeaponSync.damageBoostActive(
        now, this.player.buffs.damageBoostUntil, this.modRuntime.turretWeaponSyncEnabled()
      );
      turret.setWeaponSyncActive(Boolean(turretAmmoMode || turretDamageBoosted));
      const enemyTarget = this.getNearestEnemy(turret.sprite.x, turret.sprite.y, turret.range);
      const bossTarget = this.nearestActiveBossTarget(turret.sprite.x, turret.sprite.y);
      const bossInRange = Boolean(bossTarget?.active && !bossTarget.isDefeated
        && (bossTarget.x - turret.sprite.x) ** 2 + (bossTarget.y - turret.sprite.y) ** 2 <= turret.range * turret.range);
      const fluxTarget = this.fluxCores?.getNearestCore(turret.sprite.x, turret.sprite.y, turret.range) ?? null;
      const target: { x: number; y: number } | null = bossInRange ? bossTarget! : enemyTarget ?? fluxTarget;
      if (!target) continue;
      const angle = Phaser.Math.Angle.Between(turret.sprite.x, turret.sprite.y, target.x, target.y);
      turret.aimAt(angle);
      const fieldFireRate = this.bombsiteMods.turretFireRateMultiplier(turret.sprite.x, turret.sprite.y);
      const canFire = turretAmmoMode === 'grenade'
        ? turret.canFireAtInterval(now, TEMPORARY_AMMO_BALANCE.grenade.turretFireIntervalMs)
        : turret.canFire(now, fieldFireRate);
      if (!canFire) continue;

      turret.lastShotMs = now;
      turret.markFired(now);
      this.spawnTurretAmmoVolley(
        turret,
        turretAmmoMode ?? 'normal',
        angle,
        turret.damage * (turretDamageBoosted ? WEAPON_BALANCE.damageBoostMultiplier : 1),
        now
      );
    }

    for (const mine of this.mines) {
      mine.update(now);
      if (!mine.armed) continue;
      const bossTarget = this.nearestActiveBossTarget(mine.sprite.x, mine.sprite.y);
      const radiusSquared = mine.radius * mine.radius;
      const bossDx = (bossTarget?.x ?? 0) - mine.sprite.x;
      const bossDy = (bossTarget?.y ?? 0) - mine.sprite.y;
      const bossInRange = Boolean(bossTarget?.active && !bossTarget.isDefeated
        && bossDx * bossDx + bossDy * bossDy <= radiusSquared);
      let trigger = bossInRange || Boolean(this.fluxCores?.hasCoreWithin(mine.sprite.x, mine.sprite.y, mine.radius));
      if (!trigger) {
        for (const enemy of this.enemies) {
          const dx = enemy.x - mine.sprite.x;
          const dy = enemy.y - mine.sprite.y;
          if (dx * dx + dy * dy <= radiusSquared) {
            trigger = true;
            break;
          }
        }
      }
      if (trigger && mine.detonateAt === 0) {
        mine.beginDetonation(now, this.modRuntime.has('magnetic-payload') ? MOD_BALANCE.magneticPayload.preDetonationMs : 0);
      }
      if (mine.detonateAt === 0) continue;
      this.applyMagneticPayload(mine, now);
      if (!mine.readyToDetonate(now)) continue;

      this.gasHazard?.igniteFromMine(
        mine.sprite.x,
        mine.sprite.y,
        mine.radius,
        mine.explosionPalette[1],
        mine.explosionPalette[2]
      );
      this.audio.playSfx('mine');
      this.fluxCores?.damageArea(mine.sprite.x, mine.sprite.y, mine.radius, mine.damage, 'mine');
      this.playMineExplosion(mine.sprite.x, mine.sprite.y, mine.radius, mine);
      for (const e of this.enemies) {
        const dx = e.x - mine.sprite.x;
        const dy = e.y - mine.sprite.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared <= radiusSquared) {
          const d = Math.sqrt(distanceSquared);
          e.takeDamage(mine.damage * (1 - d / (mine.radius + 1)), 'mine');
          if (!e.isDead() && this.modRuntime.rank('magnetic-payload') === 3) {
            e.slowFactor = MOD_BALANCE.magneticPayload.rank3SlowFactor;
            e.slowedUntil = now + MOD_BALANCE.magneticPayload.rank3SlowDurationMs;
          }
        }
      }
      for (const affectedBoss of this.activeMajorBosses()) {
        const dx = affectedBoss.x - mine.sprite.x;
        const dy = affectedBoss.y - mine.sprite.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared <= radiusSquared) {
          const d = Math.sqrt(distanceSquared);
          affectedBoss.takeDamage(mine.damage * (1 - d / (mine.radius + 1)), 'mine');
        }
      }

      mine.destroy();
      mine.armed = false;
    }

    for (const fence of this.fences) {
      const fieldDamage = this.bombsiteMods.fenceDamageMultiplier(fence.x1, fence.y1, fence.x2, fence.y2);
      const effectiveDps = fence.dps * fieldDamage;
      this.fluxCores?.damageAlongSegment(fence.x1, fence.y1, fence.x2, fence.y2, 11, effectiveDps * dt);
      for (const enemy of this.enemies) {
        const d = this.distancePointToSegment(
          enemy.x,
          enemy.y,
          fence.x1,
          fence.y1,
          fence.x2,
          fence.y2
        );
        if (d < 11) {
          enemy.takeDamage(effectiveDps * dt, 'fence');
          const body = enemy.body as Phaser.Physics.Arcade.Body | null;
          if (body) enemy.setVelocity(body.velocity.x * fence.slowFactor, body.velocity.y * fence.slowFactor);
          if (enemy.stats.type === 'tank') fence.hp -= 16 * dt;
        }
      }
      for (const bossTarget of this.activeMajorBosses()) {
        const distance = this.distancePointToSegment(
          bossTarget.x,
          bossTarget.y,
          fence.x1,
          fence.y1,
          fence.x2,
          fence.y2
        );
        if (distance < bossTarget.hazardRadius + 8) {
          bossTarget.takeDamage(effectiveDps * dt, 'fence');
          fence.hp -= 10 * dt;
        }
      }
    }

    let fenceWriteIndex = 0;
    for (const fence of this.fences) {
      if (fence.isExpired(now)) {
        fence.destroy();
      } else {
        this.fences[fenceWriteIndex] = fence;
        fenceWriteIndex += 1;
      }
    }
    this.fences.length = fenceWriteIndex;

    let turretWriteIndex = 0;
    for (const turret of this.turrets) {
      if (turret.hp > 0) {
        this.turrets[turretWriteIndex] = turret;
        turretWriteIndex += 1;
        continue;
      }
      GameplayTelemetryRecorder.recordTurretDestroyed(turret.telemetryId);
      this.spawnImpact(turret.sprite.x, turret.sprite.y, SaveSystem.getCosmeticColor('turretSkin', now));
      const collapse = this.obtainFxCircle({ x: turret.sprite.x, y: turret.sprite.y, radius: 8, color: COLORS.orange, alpha: 0.35, depth: 8 });
      this.tweens.add({ targets: collapse, radius: 32, alpha: 0, duration: 260, onComplete: () => this.retireFxCircle(collapse) });
      turret.destroy();
    }
    this.turrets.length = turretWriteIndex;

    let mineWriteIndex = 0;
    for (const mine of this.mines) {
      if (!mine.armed && now >= mine.armAt && !mine.sprite.active) continue;
      this.mines[mineWriteIndex] = mine;
      mineWriteIndex += 1;
    }
    this.mines.length = mineWriteIndex;
  }

  private updateDeathMines(now: number): void {
    let writeIndex = 0;
    for (const deathMine of this.deathMines) {
      const mine = deathMine.mine;
      mine.update(now);
      if (!mine.readyToDetonate(now)) {
        this.deathMines[writeIndex] = deathMine;
        writeIndex += 1;
        continue;
      }

      this.gasHazard?.igniteFromMine(
        mine.sprite.x,
        mine.sprite.y,
        mine.radius,
        mine.explosionPalette[1],
        mine.explosionPalette[2]
      );
      this.audio.playSfx('mine');
      this.fluxCores?.damageArea(mine.sprite.x, mine.sprite.y, mine.radius, mine.damage, 'mine');
      this.playMineExplosion(mine.sprite.x, mine.sprite.y, mine.radius, mine);

      const playerDx = this.player.x - mine.sprite.x;
      const playerDy = this.player.y - mine.sprite.y;
      const playerDistanceSquared = playerDx * playerDx + playerDy * playerDy;
      if (playerDistanceSquared <= mine.radius * mine.radius) {
        const playerDist = Math.sqrt(playerDistanceSquared);
        const falloff = 1 - playerDist / (mine.radius + 1);
        const damage = mine.damage * falloff;
        if (this.player.takeDamage(damage)) GameplayTelemetryRecorder.recordPlayerDamage('enemy-death-mine', damage);
      }

      for (const turret of this.turrets) {
        const dx = turret.sprite.x - mine.sprite.x;
        const dy = turret.sprite.y - mine.sprite.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared <= mine.radius * mine.radius) {
          const d = Math.sqrt(distanceSquared);
          const applied = turret.takeDamage(mine.damage * 0.5 * (1 - d / (mine.radius + 1)));
          GameplayTelemetryRecorder.recordTurretDamaged(turret.telemetryId, applied);
        }
      }

      for (const fence of this.fences) {
        const dx = fence.sprite.x - mine.sprite.x;
        const dy = fence.sprite.y - mine.sprite.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared <= mine.radius * mine.radius) {
          const d = Math.sqrt(distanceSquared);
          fence.hp -= mine.damage * 0.38 * (1 - d / (mine.radius + 1));
        }
      }

      mine.destroy();
    }
    this.deathMines.length = writeIndex;
  }

  private updatePickups(now: number, dt: number): void {
    const collectionRadius = this.player.stats.pickupRadius;
    const collectionRadiusSquared = collectionRadius * collectionRadius;
    const magneticField = this.modRuntime.magneticServiceField(collectionRadius);
    const attractionRadiusSquared = magneticField.attractionRadius * magneticField.attractionRadius;
    this.updateFloatingPickupMotion(now, dt);
    this.separateFloatingPickups();
    let writeIndex = 0;
    for (const p of this.pickups) {
      this.pickupPresentation.update(p.sprite, now);
      if (now > p.expiresAt) {
        GameplayTelemetryRecorder.recordPickupExpired(p.type);
        if (p.arcadeEventId) this.recordArcadeLootMetric('arcade_pickup_expired', p.arcadeEventId, p.type, p.amount ?? 1);
        p.sprite.destroy();
        continue;
      }
      const dx = this.player.x - p.sprite.x;
      const dy = this.player.y - p.sprite.y;
      const distanceSquared = dx * dx + dy * dy;
      const energyCollectionBlocked = p.type === 'energy'
        && (this.isOverdriveProtocol()
          ? this.player.energy >= this.player.energyStats.max * 2
          : this.player.energy > this.player.energyStats.max * (1 - PICKUP_BALANCE.energyAutoCollectMissingFraction));
      if (now >= (p.collectibleAt ?? 0) && distanceSquared < collectionRadiusSquared) {
        if (energyCollectionBlocked) {
          this.pickups[writeIndex] = p;
          writeIndex += 1;
          continue;
        }
        this.collectPickup(p.type, p.source, p.amount);
        if (p.arcadeEventId) this.recordArcadeLootMetric('arcade_pickup_collected', p.arcadeEventId, p.type, p.amount ?? 1);
        p.sprite.destroy();
        continue;
      }
      if (now >= (p.collectibleAt ?? 0) && !energyCollectionBlocked && magneticField.pullSpeed > 0 && distanceSquared < attractionRadiusSquared) {
        const d = Math.sqrt(distanceSquared);
        const step = Math.min(Math.max(0, d - collectionRadius * 0.7), magneticField.pullSpeed * dt);
        if (step > 0 && d > 0) {
          p.sprite.x += (dx / d) * step;
          p.sprite.y += (dy / d) * step;
        }
      }
      this.pickups[writeIndex] = p;
      writeIndex += 1;
    }
    this.pickups.length = writeIndex;
  }

  private updateFloatingPickupMotion(now: number, dt: number): void {
    const bounds = this.layout.generation.bounds;
    const padding = 24;
    const minimumX = bounds.x + padding;
    const maximumX = bounds.x + bounds.w - padding;
    const minimumY = bounds.y + padding;
    const maximumY = bounds.y + bounds.h - padding;

    for (const pickup of this.pickups) {
      const motion = this.pickupMotion.get(pickup.sprite);
      if (!motion) continue;

      const breezeX = Math.sin(now * 0.00072 + motion.phase) * 2.8;
      const breezeY = Math.cos(now * 0.00061 + motion.phase * 1.37) * 2.5;
      motion.velocityX = Phaser.Math.Clamp((motion.velocityX + breezeX * dt) * Math.pow(0.994, dt * 60), -PICKUP_FLOAT_MAX_SPEED, PICKUP_FLOAT_MAX_SPEED);
      motion.velocityY = Phaser.Math.Clamp((motion.velocityY + breezeY * dt) * Math.pow(0.994, dt * 60), -PICKUP_FLOAT_MAX_SPEED, PICKUP_FLOAT_MAX_SPEED);

      const previousX = pickup.sprite.x;
      const previousY = pickup.sprite.y;
      pickup.sprite.x += motion.velocityX * dt;
      pickup.sprite.y += motion.velocityY * dt;

      if (pickup.sprite.x <= minimumX || pickup.sprite.x >= maximumX) {
        pickup.sprite.x = Phaser.Math.Clamp(pickup.sprite.x, minimumX, maximumX);
        motion.velocityX *= -0.82;
      }
      if (pickup.sprite.y <= minimumY || pickup.sprite.y >= maximumY) {
        pickup.sprite.y = Phaser.Math.Clamp(pickup.sprite.y, minimumY, maximumY);
        motion.velocityY *= -0.82;
      }

      for (const wall of this.wallRects) {
        const left = wall.x - padding;
        const right = wall.x + wall.w + padding;
        const top = wall.y - padding;
        const bottom = wall.y + wall.h + padding;
        if (pickup.sprite.x <= left || pickup.sprite.x >= right || pickup.sprite.y <= top || pickup.sprite.y >= bottom) continue;
        pickup.sprite.setPosition(previousX, previousY);
        motion.velocityX *= -0.72;
        motion.velocityY *= -0.72;
        break;
      }
    }
  }

  private separateFloatingPickups(): void {
    const separationDistance = 35;
    const separationDistanceSquared = separationDistance * separationDistance;
    for (let firstIndex = 0; firstIndex < this.pickups.length; firstIndex += 1) {
      const first = this.pickups[firstIndex];
      const firstMotion = this.pickupMotion.get(first.sprite);
      if (!firstMotion) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < this.pickups.length; secondIndex += 1) {
        const second = this.pickups[secondIndex];
        const secondMotion = this.pickupMotion.get(second.sprite);
        if (!secondMotion) continue;
        let dx = second.sprite.x - first.sprite.x;
        let dy = second.sprite.y - first.sprite.y;
        let distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= separationDistanceSquared) continue;
        if (distanceSquared < 0.0001) {
          const fallbackAngle = (firstIndex * 2.399 + secondIndex * 1.713) % (Math.PI * 2);
          dx = Math.cos(fallbackAngle);
          dy = Math.sin(fallbackAngle);
          distanceSquared = 1;
        }
        const distance = Math.sqrt(distanceSquared);
        const normalX = dx / distance;
        const normalY = dy / distance;
        const push = (separationDistance - distance) * PICKUP_SEPARATION_PUSH;
        first.sprite.x -= normalX * push;
        first.sprite.y -= normalY * push;
        second.sprite.x += normalX * push;
        second.sprite.y += normalY * push;

        const firstNormalSpeed = firstMotion.velocityX * normalX + firstMotion.velocityY * normalY;
        const secondNormalSpeed = secondMotion.velocityX * normalX + secondMotion.velocityY * normalY;
        const impulse = (secondNormalSpeed - firstNormalSpeed) * PICKUP_BOUNCE_TRANSFER;
        firstMotion.velocityX += normalX * impulse - normalX * PICKUP_BOUNCE_KICK;
        firstMotion.velocityY += normalY * impulse - normalY * PICKUP_BOUNCE_KICK;
        secondMotion.velocityX -= normalX * impulse - normalX * PICKUP_BOUNCE_KICK;
        secondMotion.velocityY -= normalY * impulse - normalY * PICKUP_BOUNCE_KICK;
      }
    }

    // Separation can nudge a crowded pickup toward geometry, so finish by projecting it
    // back to the nearest safe edge instead of letting a floating cluster enter a wall.
    const bounds = this.layout.generation.bounds;
    const padding = 24;
    for (const pickup of this.pickups) {
      const motion = this.pickupMotion.get(pickup.sprite);
      if (!motion) continue;
      pickup.sprite.x = Phaser.Math.Clamp(pickup.sprite.x, bounds.x + padding, bounds.x + bounds.w - padding);
      pickup.sprite.y = Phaser.Math.Clamp(pickup.sprite.y, bounds.y + padding, bounds.y + bounds.h - padding);
      for (const wall of this.wallRects) {
        const left = wall.x - padding;
        const right = wall.x + wall.w + padding;
        const top = wall.y - padding;
        const bottom = wall.y + wall.h + padding;
        if (pickup.sprite.x <= left || pickup.sprite.x >= right || pickup.sprite.y <= top || pickup.sprite.y >= bottom) continue;
        const distanceLeft = pickup.sprite.x - left;
        const distanceRight = right - pickup.sprite.x;
        const distanceTop = pickup.sprite.y - top;
        const distanceBottom = bottom - pickup.sprite.y;
        const nearestEdge = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);
        if (nearestEdge === distanceLeft) {
          pickup.sprite.x = left;
          motion.velocityX = -Math.abs(motion.velocityX);
        } else if (nearestEdge === distanceRight) {
          pickup.sprite.x = right;
          motion.velocityX = Math.abs(motion.velocityX);
        } else if (nearestEdge === distanceTop) {
          pickup.sprite.y = top;
          motion.velocityY = -Math.abs(motion.velocityY);
        } else {
          pickup.sprite.y = bottom;
          motion.velocityY = Math.abs(motion.velocityY);
        }
        break;
      }
    }
  }

  private infusionSpectrumColor(offset = 0): number {
    const hue = ((this.time.now * 0.00022 + offset) % 1 + 1) % 1;
    const rgb = Phaser.Display.Color.HSVToRGB(hue, 0.82, 1) as Phaser.Types.Display.ColorObject;
    return Phaser.Display.Color.GetColor(rgb.r, rgb.g, rgb.b);
  }

  private applyMagneticPayload(mine: Mine, now: number): void {
    const rank = this.modRuntime.rank('magnetic-payload');
    if (!this.modRuntime.has('magnetic-payload') || mine.readyToDetonate(now)) return;
    const pullRadius = MOD_BALANCE.magneticPayload.pullRadius[rank];
    const pullStrength = MOD_BALANCE.magneticPayload.pullStrength[rank];
    for (const enemy of this.enemies) {
      const dx = mine.sprite.x - enemy.x;
      const dy = mine.sprite.y - enemy.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > pullRadius * pullRadius || distanceSquared < 16) continue;
      const inverseDistance = 1 / Math.sqrt(distanceSquared);
      const resistance = magneticResistanceForEnemy(enemy.stats.type);
      const speed = pullStrength * resistance;
      enemy.setVelocity(dx * inverseDistance * speed, dy * inverseDistance * speed);
    }
    if (now - mine.lastMagneticPulseAt >= 80) {
      mine.lastMagneticPulseAt = now;
      const ring = this.obtainFxCircle({
        x: mine.sprite.x,
        y: mine.sprite.y,
        radius: pullRadius,
        color: COLORS.cyan,
        alpha: 0.015,
        depth: 5,
        strokeWidth: 1,
        strokeColor: COLORS.cyan,
        strokeAlpha: 0.28
      });
      this.tweens.add({ targets: ring, radius: 12, alpha: 0, duration: 180, onComplete: () => this.retireFxCircle(ring) });
    }
  }

  private updateEmergencyCapacitor(now: number): void {
    if (this.player.hp <= 0) return;
    const activation = this.modRuntime.checkEmergencyCapacitor(this.player.hp / this.player.stats.maxHealth);
    if (!activation) return;
    const energyBefore = this.player.energy;
    const requestedEnergy = this.player.energyStats.max * activation.energyShare;
    this.player.energy = Math.min(this.player.energyStats.max, this.player.energy + requestedEnergy);
    GameplayTelemetryRecorder.recordResourceGain('energy', 'emergency-capacitor', requestedEnergy, this.player.energy - energyBefore);
    if (activation.speedDurationMs > 0) {
      this.player.modSpeedMultiplier = activation.speedMultiplier;
      this.player.modSpeedBoostUntil = now + activation.speedDurationMs;
    }
    const pulse = this.add.circle(this.player.x, this.player.y, 18, COLORS.cyan, 0.25).setStrokeStyle(3, 0xffffff, 0.9).setDepth(12);
    this.tweens.add({ targets: pulse, radius: 54, alpha: 0, duration: 340, onComplete: () => pulse.destroy() });
  }

  private triggerSplitCurrent(killedEnemy: Enemy, finalKillingDamage: number): void {
    const standardRank = this.modRuntime.rank('split-current');
    const corruptedRank = this.modRuntime.rank('fractured-current');
    const hasStandard = this.modRuntime.has('split-current');
    const hasCorrupted = this.modRuntime.has('fractured-current');
    if (!hasStandard && !hasCorrupted) return;
    const standardShare = hasStandard ? MOD_BALANCE.splitCurrent.damageShare[standardRank] : 0;
    const corruptedShare = hasCorrupted ? MOD_BALANCE.fracturedCurrent.damageShare[corruptedRank] : 0;
    const radius = corruptedShare > standardShare
      ? MOD_BALANCE.fracturedCurrent.radius[corruptedRank]
      : MOD_BALANCE.splitCurrent.radius[standardRank];
    let target: Enemy | null = null;
    let targetDistanceSquared = radius * radius;
    for (const enemy of this.enemies) {
      if (enemy === killedEnemy || enemy.isDead()) continue;
      const dx = enemy.x - killedEnemy.x;
      const dy = enemy.y - killedEnemy.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= targetDistanceSquared) {
        if (distanceSquared === targetDistanceSquared && target) continue;
        target = enemy;
        targetDistanceSquared = distanceSquared;
      }
    }
    if (!target) return;
    const damage = corruptedShare > standardShare
      ? finalKillingDamage * corruptedShare
      : splitCurrentSecondaryDamage(finalKillingDamage, standardRank, false);
    target.takeDamage(damage, 'splitCurrent');
    const arc = this.add.graphics().setDepth(11);
    arc.lineStyle(3, COLORS.cyan, 0.95);
    arc.beginPath();
    arc.moveTo(killedEnemy.x, killedEnemy.y);
    const midX = (killedEnemy.x + target.x) * 0.5 + Phaser.Math.Between(-12, 12);
    const midY = (killedEnemy.y + target.y) * 0.5 + Phaser.Math.Between(-12, 12);
    arc.lineTo(midX, midY);
    arc.lineTo(target.x, target.y);
    arc.strokePath();
    this.tweens.add({ targets: arc, alpha: 0, duration: 150, onComplete: () => arc.destroy() });
  }

  private playDetonationFireworks(x: number, y: number): void {
    const colors = [0xff55dd, 0x55eeff, 0xffd35a, 0x7cff8b];
    const config = MOD_BALANCE.detonationFireworks;
    const duration = Phaser.Math.Between(config.minDurationMs, config.maxDurationMs);
    const startsAt = this.time.now;
    let burst = 0;
    const emitBurst = (): void => {
      const bx = x + Phaser.Math.Between(-155, 155);
      const by = y + Phaser.Math.Between(-145, 35);
      const rays = this.particlesEnabled ? config.sparksPerBurst : Math.ceil(config.sparksPerBurst / 2);
      for (let ray = 0; ray < rays; ray += 1) {
        const angle = ray / rays * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
        const distance = Phaser.Math.Between(52, 88);
        const spark = this.trackRoundInfusionEffect(
          this.add.circle(bx, by, Phaser.Math.Between(2, 4), colors[(burst + ray) % colors.length], 1).setDepth(42)
        );
        this.tweens.add({
          targets: spark,
          x: bx + Math.cos(angle) * distance,
          y: by + Math.sin(angle) * distance,
          alpha: 0,
          duration: Phaser.Math.Between(480, 760),
          ease: 'Cubic.Out',
          onComplete: () => this.releaseRoundInfusionEffect(spark)
        });
      }
      burst += 1;
    };

    // Make the infusion immediately visible even when the final site advances
    // to the non-blocking round-finished screen shortly after detonation.
    emitBurst();
    const totalBursts = Math.max(1, Math.ceil(duration / config.burstIntervalMs));
    if (totalBursts === 1) return;
    let timer: Phaser.Time.TimerEvent | null = null;
    timer = this.time.addEvent({
      delay: config.burstIntervalMs,
      repeat: totalBursts - 2,
      callback: () => {
        if (!this.sys.isActive() || this.time.now - startsAt > duration) {
          timer?.remove();
          if (timer) this.roundInfusionTimers.delete(timer);
          timer = null;
          return;
        }
        emitBurst();
      }
    });
    this.roundInfusionTimers.add(timer);
  }

  private trackRoundInfusionEffect<T extends Phaser.GameObjects.GameObject>(effect: T): T {
    this.roundInfusionEffects.add(effect);
    return effect;
  }

  private releaseRoundInfusionEffect(effect: Phaser.GameObjects.GameObject): void {
    this.roundInfusionEffects.delete(effect);
    if (!effect.scene) return;
    effect.destroy();
  }

  private clearRoundInfusionEffects(): void {
    for (const timer of this.roundInfusionTimers) timer.remove(false);
    this.roundInfusionTimers.clear();
    for (const effect of this.roundInfusionEffects) {
      this.tweens.killTweensOf(effect);
      if (effect.scene) effect.destroy();
    }
    this.roundInfusionEffects.clear();
  }

  private updateArenaSupportPickups(now: number): void {
    if (now < this.nextArenaSupportPickupAt) return;

    this.nextArenaSupportPickupAt = now + Phaser.Math.Between(
      PICKUP_BALANCE.arenaSupportRestockMinMs,
      PICKUP_BALANCE.arenaSupportRestockMaxMs
    );

    let healthCount = 0;
    let energyCount = 0;
    for (const pickup of this.pickups) {
      if (pickup.source !== 'arena-support') continue;
      if (pickup.type === 'health') healthCount += 1;
      if (pickup.type === 'energy') energyCount += 1;
    }
    for (const type of ['health', 'energy'] as const) {
      const active = type === 'health' ? healthCount : energyCount;
      const missing = Math.max(0, PICKUP_BALANCE.arenaSupportTargetPerType - active);
      for (let index = 0; index < missing; index += 1) {
        const point = this.findArenaSupportPickupPoint();
        if (!point) break;
        const sprite = this.createPickupSprite(type, point.x, point.y, type === 'health' ? COLORS.green : COLORS.cyan);
        this.pickups.push({
          type,
          sprite,
          expiresAt: now + PICKUP_BALANCE.arenaSupportLifetimeMs,
          source: 'arena-support'
        });
        GameplayTelemetryRecorder.recordPickupDropped(type, 'arena-support');
      }
    }
  }

  private findArenaSupportPickupPoint(): { x: number; y: number } | null {
    const bounds = this.layout.generation.bounds;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const x = Phaser.Math.Between(bounds.x + 100, bounds.x + bounds.w - 100);
      const y = Phaser.Math.Between(bounds.y + 100, bounds.y + bounds.h - 100);
      if (this.isClearForArenaPickup(x, y)) return { x, y };
    }
    return null;
  }

  private getSecondaryTurretTarget(enemy: Enemy, now: number): Turret | null {
    if (!['grunt', 'shooter', 'tank', 'star'].includes(enemy.stats.type) || this.turrets.length === 0) return null;

    const previous = this.enemyTurretTargets.get(enemy);
    if (previous && now < previous.reconsiderAt && previous.turret && previous.turret.hp > 0) return previous.turret;
    if (previous && now < previous.reconsiderAt) return null;

    const chance = enemy.stats.type === 'star' ? 0.34
      : enemy.stats.type === 'tank' ? 0.28
        : enemy.stats.type === 'shooter' ? 0.18
          : 0.14;
    let nearestTurret: Turret | null = null;
    let nearestDistanceSquared = 380 * 380;
    for (const turret of this.turrets) {
      if (turret.hp <= 0) continue;
      const dx = turret.sprite.x - enemy.x;
      const dy = turret.sprite.y - enemy.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= nearestDistanceSquared) {
        if (distanceSquared === nearestDistanceSquared && nearestTurret) continue;
        nearestTurret = turret;
        nearestDistanceSquared = distanceSquared;
      }
    }
    const turret = nearestTurret && Math.random() < chance ? nearestTurret : null;
    this.enemyTurretTargets.set(enemy, {
      turret,
      reconsiderAt: now + (turret ? Phaser.Math.Between(2200, 4200) : Phaser.Math.Between(1800, 3200))
    });
    return turret;
  }

  private isClearForArenaPickup(x: number, y: number): boolean {
    const clearance = 30;
    if (this.wallRects.some((wall) =>
      x >= wall.x - clearance && x <= wall.x + wall.w + clearance
      && y >= wall.y - clearance && y <= wall.y + wall.h + clearance
    )) return false;

    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 160) return false;
    if (this.bombSites.sites.some((site) => Phaser.Math.Distance.Between(x, y, site.x, site.y) < 110)) return false;
    if (this.pickups.some((pickup) => Phaser.Math.Distance.Between(x, y, pickup.sprite.x, pickup.sprite.y) < 90)) return false;
    return true;
  }

  private collectPickup(type: PickupType, source: Pickup['source'], explicitAmount?: number): void {
    this.audio.playSfx(GAMEPLAY_PICKUP_SFX_BY_TYPE[type]);
    if (this.modRuntime.triggerSupremePickupSurge(this.time.now, type)) {
      this.supremeModEffects?.showPickupSurge(this.time.now, this.player.x, this.player.y);
    }
    let requestedRestoration = 0;
    let appliedRestoration = 0;
    if (type === 'health') {
      const before = this.player.hp;
      requestedRestoration = PICKUP_BALANCE.healthRestore * this.modRuntime.multiplier('healthPickupValue');
      const healthCap = resourcePickupCap(this.player.stats.maxHealth, this.isOverdriveProtocol());
      this.player.hp = Math.min(healthCap, this.player.hp + requestedRestoration);
      appliedRestoration = this.player.hp - before;
    }
    if (type === 'energy') {
      const before = this.player.energy;
      const restored = this.player.energyStats.max * PICKUP_BALANCE.energyRestoreFraction * this.modRuntime.multiplier('energyPickupValue');
      requestedRestoration = restored;
      const energyCap = resourcePickupCap(this.player.energyStats.max, this.isOverdriveProtocol());
      this.player.energy = Math.min(energyCap, this.player.energy + restored);
      appliedRestoration = this.player.energy - before;
    }
    const buffDurationMs = WEAPON_BALANCE.buffDurationMs * this.modRuntime.multiplier('buffDuration');
    if (type === 'damageBoost') {
      this.player.buffs.damageBoostUntil = this.time.now + buffDurationMs;
      this.turretWeaponSync.inherit(
        'damageBoost', this.time.now, this.player.buffs.damageBoostUntil, this.modRuntime.turretWeaponSyncEnabled()
      );
    }
    if (type === 'speedBoost') {
      const wasActive = this.time.now < this.player.buffs.speedBoostUntil;
      this.player.buffs.speedBoostStacks = nextPickupBuffStack(
        this.player.buffs.speedBoostStacks, wasActive, this.isOverdriveProtocol()
      );
      this.player.buffs.speedBoostUntil = this.time.now + buffDurationMs;
    }
    if (type === 'rapidFire') {
      const wasActive = this.time.now < this.player.buffs.rapidFireUntil;
      this.player.buffs.rapidFireStacks = nextPickupBuffStack(
        this.player.buffs.rapidFireStacks, wasActive, this.isOverdriveProtocol()
      );
      this.player.buffs.rapidFireUntil = this.time.now + buffDurationMs;
    }
    if (type === 'ricochet') this.player.buffs.ricochetUntil = this.time.now + buffDurationMs;
    if (type === 'grenadeRounds') {
      const activation = this.temporaryAmmo.activate('grenade', this.time.now, this.isOverdriveProtocol(), this.modRuntime.multiplier('buffDuration'));
      this.turretWeaponSync.inherit(
        'grenadeRounds', this.time.now, activation.activeUntil, this.modRuntime.turretWeaponSyncEnabled()
      );
    }
    if (type === 'scattershot') {
      const activation = this.temporaryAmmo.activate('scattershot', this.time.now, this.isOverdriveProtocol(), this.modRuntime.multiplier('buffDuration'));
      this.turretWeaponSync.inherit(
        'scattershot', this.time.now, activation.activeUntil, this.modRuntime.turretWeaponSyncEnabled()
      );
    }
    if (type === 'credits') {
      const credits = explicitAmount ?? this.scaleModCredits(PICKUP_BALANCE.credits);
      this.roundCredits += credits;
      this.totalCreditsCollected += credits;
    }
    if (type === 'coreToken') this.roundCoreTokens += explicitAmount ?? 1;
    if (type === 'plasmaChip') this.roundPlasmaChips += explicitAmount ?? 1;
    if (type === 'fluxCore') this.roundFluxCores += explicitAmount ?? 1;
    GameplayTelemetryRecorder.recordPickupCollected(type, source, requestedRestoration, appliedRestoration);

    const pickupLabel = type === 'fluxCore' ? 'FLUX CORE'
      : type === 'ricochet' ? 'RICOCHET ROUNDS'
        : type === 'grenadeRounds' ? 'GRENADE ROUNDS'
          : type === 'scattershot' ? 'SCATTERSHOT ROUNDS'
            : type;
    const t = this.add.text(this.player.x, this.player.y - 24, `+${pickupLabel}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '18px',
      color: '#96ffe4'
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: t.y - 20, alpha: 0, duration: 620, onComplete: () => t.destroy() });
  }

  private killEnemy(enemy: Enemy): void {
    if (this.tutorialDirector?.awaits('combat.enemyKilled')) TutorialEventBus.emit('combat.enemyKilled', { type: enemy.stats.type });
    this.arcadeController?.handleGameplayEvent({ type: 'enemy-killed', enemy });
    this.anomalyController?.handleEnemyKilled(enemy.x, enemy.y);
    this.audio.playSfx('enemyDeath');
    const suppressBaseLoot = Boolean(enemy.getData('n3onArcadeSuppressBaseLoot'));
    const standardCredits = suppressBaseLoot ? 0 : this.scaleModCredits(enemy.stats.valueCredits);
    const bombsiteCreditMultiplier = suppressBaseLoot ? 1 : this.bombsiteMods.onEnemyKilled(enemy.x, enemy.y);
    const enemyCredits = suppressBaseLoot ? 0 : this.scaleModCredits(enemy.stats.valueCredits * bombsiteCreditMultiplier);
    const enemyCoreTokens = suppressBaseLoot ? 0 : enemy.stats.valueCoreTokens;
    this.bombsiteMods.recordBonusCredits(Math.max(0, enemyCredits - standardCredits));
    // Standard enemy value is the guaranteed kill reward, as it was before the
    // physical-loot service was introduced for Arcade rewards. Turning every
    // kill value into a world pickup made every enemy appear to drop loot and
    // bypassed the intentional enemyDropChance gate below.
    this.roundCredits += enemyCredits;
    this.roundCoreTokens += enemyCoreTokens;
    this.totalCreditsCollected += enemyCredits;
    this.pendingProgressEnemyKills += 1;

    GameplayTelemetryRecorder.recordEnemyKill({
      type: enemy.stats.type,
      maximumHealth: enemy.stats.hp,
      spawnedAtActiveMs: enemy.telemetrySpawnedAtActiveMs,
      firstDamagedAtActiveMs: enemy.telemetryFirstDamagedAtActiveMs,
      finalSource: enemy.lastDamageSource,
      damageBySource: enemy.damageTakenBySource,
      credits: enemyCredits,
      coreTokens: enemyCoreTokens
    });

    if (!suppressBaseLoot) {
      this.tryAwardMod(enemy.stats.type === 'star' ? 'eliteEnemy' : 'normalEnemy', false, enemy.x, enemy.y);
    }

    const pickupChance = Math.min(1, PICKUP_BALANCE.enemyDropChance * this.modRuntime.multiplier('enemyPickupChance'));
    if (!suppressBaseLoot && Math.random() < pickupChance) this.dropPickup(enemy.x, enemy.y);

    if (this.modRuntime.hasInfusion('ghost-echoes')) this.playEnemyGhostEcho(enemy);
    if (this.modRuntime.hasInfusion('arcade-pop')) this.playArcadePop(enemy.x, enemy.y);
    this.createDeathExplosion(enemy.x, enemy.y, enemy.stats.color);

    if (enemy.stats.type === 'star') {
      const hostileMine = new Mine(
        this,
        enemy.x,
        enemy.y,
        COLORS.pink,
        0,
        applyEnemyDamageMode(62, this.protocol),
        170,
        undefined,
        STAR_DEATH_MINE_VISUAL_THEME
      );
      hostileMine.sprite.setDepth(8);
      hostileMine.beginDetonation(this.time.now, 1000);
      this.deathMines.push({ mine: hostileMine });
    }

    this.destroyEnemyColliders(enemy);
    enemy.destroy();
  }

  private isOverdriveProtocol(): boolean {
    return this.currentModeFamily() !== 'normal';
  }

  private currentModeFamily(): RunModeFamily {
    return RUN_PROTOCOLS[this.protocol].family;
  }

  private currentModeBalance() {
    return getProtocolModeBalance(this.protocol);
  }

  private currentRewardMultiplier(): number {
    return getSupremeStage(this.protocol)?.rewardMultiplier ?? 1;
  }

  /**
   * The authoritative arena path for loot that is described as a physical drop.
   * It creates pickups only; wallet/inventory mutation still happens on collision.
   */
  private spawnPhysicalLootBurst(
    rewards: readonly PhysicalLootReward[],
    origin: { x: number; y: number },
    source: PickupDropSource,
    arcadeEventId?: ArcadeEventId,
    options: {
      maximumCreditBundles?: number;
      minimumCreditBundles?: number;
      compact?: boolean;
      expiresAt?: number;
    } = {}
  ): void {
    const plan = createPhysicalLootPlan(rewards, {
      maximumCreditBundles: options.maximumCreditBundles,
      minimumCreditBundles: options.minimumCreditBundles,
      seed: (this.layout.seed ^ Math.imul(++this.physicalLootSequence, 0x45d9f3b)) >>> 0
    });
    const now = this.time.now;
    const expiresAt = options.expiresAt ?? now + PICKUP_BALANCE.lifetimeMs;
    for (const entry of plan) {
      const distanceScale = options.compact ? 0.48 : 1;
      const landing = this.findPhysicalLootLanding(
        origin.x,
        origin.y,
        entry.angle,
        entry.distance * distanceScale
      );
      if (entry.kind === 'mod') {
        const pickup = this.tryAwardMod('arcade', true, origin.x, origin.y, true, arcadeEventId);
        if (!pickup) continue;
        pickup.collectibleAt = now + (options.compact ? 180 : 680);
        pickup.expiresAt = expiresAt;
        this.animatePhysicalLootLaunch(pickup.sprite, landing.x, landing.y, entry.index, options.compact);
        continue;
      }
      if (!entry.pickupType) continue;
      const sprite = this.createPickupSprite(entry.pickupType, origin.x, origin.y, GAMEPLAY_PICKUP_COLOR_BY_TYPE[entry.pickupType]).setDepth(14);
      this.pickupMotion.delete(sprite);
      const pickup: Pickup = {
        type: entry.pickupType,
        amount: entry.amount,
        sprite,
        expiresAt,
        collectibleAt: now + (options.compact ? 180 : 680),
        source,
        arcadeEventId
      };
      this.pickups.push(pickup);
      GameplayTelemetryRecorder.recordPickupDropped(entry.pickupType, source);
      if (arcadeEventId) this.recordArcadeLootMetric('arcade_pickup_spawned', arcadeEventId, entry.pickupType, entry.amount);
      this.animatePhysicalLootLaunch(sprite, landing.x, landing.y, entry.index, options.compact, () => {
        const phase = Math.abs(landing.x * 0.019 + landing.y * 0.027 + entry.index);
        this.pickupMotion.set(sprite, {
          velocityX: Math.cos(phase) * (options.compact ? 5 : 8),
          velocityY: Math.sin(phase) * (options.compact ? 5 : 8),
          phase
        });
      });
    }
  }

  private animatePhysicalLootLaunch(
    sprite: Phaser.GameObjects.Container,
    landingX: number,
    landingY: number,
    index: number,
    compact = false,
    onLanded?: () => void
  ): void {
    const startX = sprite.x;
    const startY = sprite.y;
    const duration = compact ? 170 : 290;
    this.tweens.add({
      targets: sprite,
      x: Phaser.Math.Linear(startX, landingX, 0.48),
      y: Math.min(startY, landingY) - (compact ? 30 : 74) - index % 3 * (compact ? 4 : 12),
      duration,
      delay: compact ? Math.min(75, index * 8) : Math.min(230, index * 24),
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (!sprite.active) return;
        this.tweens.add({
          targets: sprite,
          x: landingX,
          y: landingY,
          duration: compact ? 190 : 330,
          ease: 'Bounce.easeOut',
          onComplete: () => { if (sprite.active) onLanded?.(); }
        });
      }
    });
  }

  private findPhysicalLootLanding(originX: number, originY: number, angle: number, distance: number): { x: number; y: number } {
    const bounds = this.layout.generation.bounds;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const candidateAngle = angle + attempt * 0.47;
      const candidateDistance = Math.max(24, distance - attempt * 3);
      const x = Phaser.Math.Clamp(originX + Math.cos(candidateAngle) * candidateDistance, bounds.x + 36, bounds.x + bounds.w - 36);
      const y = Phaser.Math.Clamp(originY + Math.sin(candidateAngle) * candidateDistance, bounds.y + 36, bounds.y + bounds.h - 36);
      if (!this.hitWall(x, y) && !this.isNearBombSite(x, y, 42)) return { x, y };
    }
    return { x: originX, y: originY };
  }

  private recordArcadeLootMetric(
    name: Extract<ArcadeMetricEvent['name'], 'arcade_pickup_spawned' | 'arcade_pickup_collected' | 'arcade_pickup_expired'>,
    eventId: ArcadeEventId,
    pickup: PickupType | 'mod',
    amount: number
  ): void {
    const rewardKind = pickup === 'credits' ? 'credits'
      : pickup === 'coreToken' ? 'core-tokens'
        : pickup === 'fluxCore' ? 'flux-cores'
          : pickup === 'plasmaChip' ? 'plasma-chips'
            : pickup === 'grenadeRounds' ? 'grenade-rounds'
              : pickup === 'scattershot' ? 'scattershot-rounds'
                : pickup === 'mod' ? 'mod' : undefined;
    if (!rewardKind) return;
    const event: ArcadeMetricEvent = {
      name,
      eventId,
      round: this.currentCombatRound(),
      protocol: this.protocol,
      elapsedMs: GameplayTelemetryRecorder.activeEncounterElapsedMs(),
      rewardKind,
      rewardAmount: amount
    };
    GameplayTelemetryRecorder.recordArcadeEvent(event);
    SaveSystem.recordArcadeMetric(event);
  }

  private createArcadeController(round: number, seed: number): void {
    this.arcadeController?.destroy('replaced');
    const tutorialProgress = SaveSystem.getTutorialProgress();
    const teachingComplete = tutorialProgress.firstRunStage === 'complete' && tutorialProgress.replaySequenceId === null;
    this.arcadeController = new N3ONArcadeController({
      scene: this,
      player: this.player,
      round,
      seed,
      protocol: this.protocol,
      modeFamily: this.currentModeFamily(),
      bounds: this.layout.generation.bounds,
      walls: this.walls,
      particlesEnabled: this.particlesEnabled,
      isBlocked: (x, y) => this.hitWall(x, y),
      findSpawnPoints: (count, minimumPlayerDistance) => this.findArcadeSpawnPoints(count, minimumPlayerDistance, seed),
      findCheckpointPoints: (count) => this.findArcadeCheckpointPoints(count, seed),
      spawnEnemy: ({ type, x, y }) => this.spawnEnemy(type, this.bombSites.activeBombCount() > 0, { x, y }),
      removeEnemy: (enemy) => this.removeArcadeEnemy(enemy),
      fireBossProjectile: (spec) => this.spawnBossProjectile(spec),
      applyBossAreaDamage: (x, y, radius, damage, attack) => this.applyBossAreaDamage(x, y, radius, damage, attack),
      retireBossProjectiles: () => this.retireActiveBossProjectiles(),
      presentMiniBossSpawn: (x, y, color) => {
        this.audio.playSfx('miniBossSpawn');
        this.mineExplosionVfx.emitColors(x, y, 72, 0xffffff, color, 0x8f6cff, 0x45eaff, this.time.now, false);
        this.cameras.main.flash(150, 86, 24, 128, false);
      },
      playBossAttackCue: (attack) => this.playBossAttackCue(attack),
      playArcadeCue: (cue) => {
        // Keep presentation audio behind the Arena audio boundary. The new
        // event-specific cue names are ready for dedicated assets without
        // coupling Arcade event logic to AudioManager or reusing misleading
        // combat sounds in the meantime.
        if (cue === 'circuit-gate') this.audio.playSfx('circuitGate');
      },
      navigateEventEnemy: (enemy, targetX, targetY, speed) => {
        this.navigateEnemy(enemy, targetX, targetY, this.time.now, speed);
      },
      findExtractionPoint: (fromX, fromY) => this.findArcadeExtractionPoint(fromX, fromY, seed),
      spawnPhysicalRewards: (eventId: ArcadeEventId, origin, rewards: readonly ArcadeGrantedReward[]) => {
        this.spawnPhysicalLootBurst(
          rewards.map((reward) => ({
            kind: reward.kind,
            amount: reward.kind === 'credits' ? this.scaleModCredits(reward.amount) : reward.amount
          })),
          origin,
          'arcade-loot',
          eventId,
          { maximumCreditBundles: 6, minimumCreditBundles: 2 }
        );
      },
      emitMetric: (event: ArcadeMetricEvent) => {
        GameplayTelemetryRecorder.recordArcadeEvent(event);
        SaveSystem.recordArcadeMetric(event);
      }
    }, { enabled: teachingComplete });
  }

  private createAnomalyController(round: number, seed: number): void {
    this.anomalyController?.destroy('round-ended');
    const tutorialProgress = SaveSystem.getTutorialProgress();
    const teachingComplete = tutorialProgress.firstRunStage === 'complete' && tutorialProgress.replaySequenceId === null;
    this.anomalyController = new AnomalyController({
      scene: this,
      player: this.player,
      round,
      seed,
      protocol: this.protocol,
      bounds: this.layout.generation.bounds,
      isGameplayEligible: () => !this.bossEncounter
        && !this.supremeFinale
        && !this.arcadeController?.activeEventId
        && !this.tutorialDirector?.isActive()
        && this.state.state !== RoundState.Paused
        && this.state.state !== RoundState.Victory
        && this.state.state !== RoundState.Defeat,
      isLocationValid: (x, y, clearance) => this.isAnomalyLocationValid(x, y, clearance),
      isInteractPressed: () => this.playerInput.pressed('interact'),
      interactionPrompt: () => this.playerInput.prompt('interact', 'E'),
      availableFluxCores: () => this.hudWalletFluxCores + this.roundFluxCores,
      spendFluxCores: (amount) => this.spendAnomalyEntryCost(amount),
      beginTransition: (request) => this.beginAnomalyTransition(request),
      emitMetric: (event) => recordAnomalyMetric(event)
    }, {
      enabled: teachingComplete,
      modeFamily: this.currentModeFamily(),
      particlesEnabled: this.particlesEnabled
    });
  }

  private isAnomalyLocationValid(x: number, y: number, clearance: number): boolean {
    const bounds = this.layout.generation.bounds;
    if (x < bounds.x + clearance || y < bounds.y + clearance
      || x > bounds.x + bounds.w - clearance || y > bounds.y + bounds.h - clearance) return false;
    if (this.intersectsWallGeometry(x, y, clearance, clearance)) return false;
    if (this.isNearBombSite(x, y, clearance + 72)) return false;
    const fluxCore = this.fluxCores?.getNearestCore(x, y, clearance + 70);
    if (fluxCore) return false;
    const blockedBy = (entityX: number, entityY: number, extra = 0): boolean => {
      const dx = x - entityX;
      const dy = y - entityY;
      const radius = clearance + extra;
      return dx * dx + dy * dy < radius * radius;
    };
    if (blockedBy(this.player.x, this.player.y, 150)) return false;
    if (this.enemies.some((enemy) => blockedBy(enemy.x, enemy.y, enemy.stats.size))) return false;
    if (this.turrets.some((turret) => blockedBy(turret.sprite.x, turret.sprite.y, 44))) return false;
    if (this.mines.some((mine) => blockedBy(mine.sprite.x, mine.sprite.y, mine.radius))) return false;
    if (this.fences.some((fence) => this.distancePointToSegment(x, y, fence.x1, fence.y1, fence.x2, fence.y2) < clearance)) return false;
    if (this.pickups.some((pickup) => blockedBy(pickup.sprite.x, pickup.sprite.y, 38))) return false;
    if (this.modPickups.some((pickup) => blockedBy(pickup.sprite.x, pickup.sprite.y, 44))) return false;
    return this.pathfinder.findPath(this.player.x, this.player.y, x, y, { maxIterations: 5_000 }).length > 0;
  }

  private spendAnomalyEntryCost(amount: number): boolean {
    const cost = Math.max(0, Math.floor(amount));
    const fromRound = Math.min(this.roundFluxCores, cost);
    const fromWallet = cost - fromRound;
    if (this.hudWalletFluxCores < fromWallet) return false;
    if (fromWallet > 0 && !SaveSystem.spendFluxCores(fromWallet)) return false;
    this.roundFluxCores -= fromRound;
    this.refreshHudWallet();
    return true;
  }

  private beginAnomalyTransition(request: AnomalyEntryRequest): void {
    if (request.anomalyId !== 'heist' || !this.anomalyReturnLifecycle.begin(request.sessionId)) return;
    this.anomalySuspensionState = this.captureAnomalySuspensionState();
    this.pendingAnomalyReturn = null;
    this.traceAnomalyReturn('arena-suspension-captured');
    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();
    this.audio.stopLowHealthWarning();
    this.laserSecurity?.silence();
    this.audio.stopFluxCoreLoop();
    this.clearGameplayInput();
    // Pointer lock is canvas-owned rather than scene-owned. Keep this exact
    // instance alive through the excursion so HEIST inherits normal aiming
    // and returning never races a destroy/recreate cycle.
    this.pointerLock?.hidePrompt();
    const appearance = SaveSystem.getOperativeFrameAppearance(this.time.now);
    const session: HeistSessionData = {
      sessionId: request.sessionId,
      anomalyId: 'heist',
      cost: request.cost,
      round: this.currentCombatRound(),
      seed: this.layout.seed ^ 0x4e1a57,
      protocol: this.protocol,
      sourcePortal: { ...request.portal },
      player: {
        textureKey: appearance.textureKey,
        tint: appearance.tint,
        stats: { ...this.player.stats },
        energyStats: { ...this.player.energyStats },
        weapon: { ...this.player.weapon },
        hp: this.player.hp,
        energy: this.player.energy,
        heat: this.player.heat,
        invulnUntil: this.player.invulnUntil,
        lastDashMs: this.player.lastDashMs,
        dashUntil: this.player.dashUntil,
        modSpeedBoostUntil: this.player.modSpeedBoostUntil,
        modSpeedMultiplier: this.player.modSpeedMultiplier,
        buffs: this.player.buffs,
        permanentSpeedMultiplier: this.player.permanentModSpeedMultiplier,
        equippedMods: this.modRuntime.snapshot()
      },
      abilities: {
        fence: { ...this.getAbilityConfig('fence') },
        turret: { ...this.getAbilityConfig('turret') },
        mine: { ...this.getAbilityConfig('mine') },
        shieldDurationMs: this.getShieldDurationMs(),
        shieldCooldownMs: this.getShieldCooldownMs(),
        shieldEnergyCost: this.getShieldEnergyCost()
      },
      sharedRuntime: {
        modRuntime: this.modRuntime,
        temporaryAmmo: this.temporaryAmmo,
        turretWeaponSync: this.turretWeaponSync,
        mineChargeRack: this.mineChargeRack
      },
      abilityState: {
        cooldownUntil: { ...this.abilityCooldownUntil },
        shieldActiveUntil: this.shieldActiveUntil,
        shieldCooldownUntil: this.shieldCooldownUntil,
        selectedAbility: this.selectedAbility
      },
      inputBridge: this.devAnomalyReturnSoak ? undefined : this.pointerLock ?? undefined,
      initialInputDevice: this.playerInput.activeDevice,
      dev: {
        forceMiniBoss: import.meta.env.DEV
          ? this.registry.get('heist-dev-force-miniboss') as boolean | null | undefined
          : undefined,
        instantReturn: import.meta.env.DEV && Boolean(this.devAnomalyReturnSoak)
      }
    };
    this.scene.launch(SceneKeys.Heist, session);
    // The portal begins a pale entry flash immediately before this handoff.
    // Clear it before sleeping so a failed handoff can never leave a paused,
    // still-visible Arena rendering the first white flash frame.
    this.cameras.main.resetFX();
    this.scene.sleep();
  }

  private captureAnomalySuspensionState(): AnomalySuspensionState {
    const camera = this.cameras.main;
    return {
      roundState: this.state.state,
      physicsWasPaused: this.physics.world.isPaused,
      physicsTimeScale: this.physics.world.timeScale,
      clockWasPaused: this.time.paused,
      clockTimeScale: this.time.timeScale,
      playerBodyEnabled: (this.player.body as Phaser.Physics.Arcade.Body | null)?.enable ?? false,
      camera: {
        count: this.cameras.cameras.length,
        x: camera.x,
        y: camera.y,
        width: camera.width,
        height: camera.height,
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
        zoom: camera.zoom,
        rotation: (camera as unknown as { rotation: number }).rotation,
        alpha: camera.alpha,
        visible: camera.visible
      }
    };
  }

  private restoreArenaCamera(suspension: AnomalySuspensionState | null): void {
    const camera = this.cameras.main;
    const saved = suspension?.camera;
    this.sys.setVisible(true);
    camera.resetFX();
    camera.setBackgroundColor(COLORS.bg);
    if (saved) {
      camera.setViewport(saved.x, saved.y, saved.width, saved.height);
      camera.setScroll(saved.scrollX, saved.scrollY);
      camera.setZoom(Number.isFinite(saved.zoom) && saved.zoom > 0 ? saved.zoom : 0.9);
      camera.setRotation(Number.isFinite(saved.rotation) ? saved.rotation : 0);
      camera.setAlpha(Number.isFinite(saved.alpha) && saved.alpha > 0 ? saved.alpha : 1);
      camera.setVisible(saved.visible);
    } else {
      camera.setViewport(0, 0, this.scale.width, this.scale.height);
      camera.setZoom(0.9).setRotation(0).setAlpha(1).setVisible(true);
    }
    // The Arena was visible at every valid entry. Never carry a malformed or
    // stale hidden flag into the restored world.
    camera.setVisible(true);
  }

  private restoreAnomalyClock(suspension: AnomalySuspensionState): void {
    this.time.paused = suspension.clockWasPaused;
    this.time.timeScale = suspension.clockTimeScale;
    this.physics.world.timeScale = suspension.physicsTimeScale;
  }

  private restoreAnomalySimulation(suspension: AnomalySuspensionState): void {
    this.restoreAnomalyClock(suspension);
    this.state.set(suspension.roundState);
    if (suspension.physicsWasPaused) this.physics.pause();
    else this.physics.resume();
    if (!suspension.physicsWasPaused) {
      if (suspension.roundState === RoundState.Planting) this.audio.startPlantingLoop();
      if (suspension.roundState === RoundState.Defusing) this.audio.startDisarmLoop();
    }
  }

  /**
   * DEV-only lifecycle soak. Each cycle creates a complete HEIST scene, exits
   * it on POST_UPDATE, and starts the next cycle only after Arena has updated,
   * stepped physics and rendered again. No wall-clock delay is involved.
   */
  private startDevAnomalyReturnSoak(cycles: number): boolean {
    if (!import.meta.env.DEV || this.devAnomalyReturnSoak
      || this.anomalyReturnLifecycle.blocksExternalPause
      || this.scene.isActive(SceneKeys.Heist)) return false;
    const requested = Phaser.Math.Clamp(Math.floor(cycles), 1, 50);
    this.devAnomalyReturnSoakResult = null;
    this.devAnomalyReturnSoak = {
      requested,
      remaining: requested,
      completed: 0,
      initialInputDevice: this.playerInput.activeDevice
    };
    return this.launchDevAnomalyReturnSoakCycle();
  }

  private launchDevAnomalyReturnSoakCycle(): boolean {
    const soak = this.devAnomalyReturnSoak;
    const definition = ANOMALY_BY_ID.get('heist');
    if (!soak || soak.remaining <= 0 || !definition) return false;
    const sequence = soak.requested - soak.remaining + 1;
    this.beginAnomalyTransition({
      anomalyId: 'heist',
      definition,
      sessionId: `dev-anomaly-return-${Date.now()}-${sequence}`,
      cost: 0,
      portal: { x: this.player.x, y: this.player.y }
    });
    return this.anomalyReturnLifecycle.blocksExternalPause;
  }

  private continueDevAnomalyReturnSoak(): void {
    const soak = this.devAnomalyReturnSoak;
    if (!import.meta.env.DEV || !soak) return;
    const camera = this.cameras.main;
    const live = this.scene.isActive(SceneKeys.Arena)
      && this.scene.isVisible(SceneKeys.Arena)
      && !this.scene.isPaused(SceneKeys.Arena)
      && !this.scene.isSleeping(SceneKeys.Arena)
      && !this.scene.isActive(SceneKeys.Heist)
      && camera.visible
      && camera.alpha > 0
      && !camera.fadeEffect.isRunning
      && !camera.flashEffect.isRunning
      && this.sys.displayList.list.length > 0
      && !this.anomalyReturnAwaitingFirstUpdate
      && !this.anomalyReturnAwaitingFirstPhysicsStep;
    if (!live) {
      // eslint-disable-next-line no-console
      console.error('[AnomalyReturnSoak] cycle failed', {
        cycle: soak.completed + 1,
        requested: soak.requested,
        snapshot: this.anomalyReturnDebugSnapshot()
      });
      this.playerInput.adoptDevice(soak.initialInputDevice);
      this.devAnomalyReturnSoakResult = {
        requested: soak.requested,
        completed: soak.completed,
        passed: false,
        failure: 'Arena did not update, step physics, and render in a live state'
      };
      this.devAnomalyReturnSoak = null;
      return;
    }
    soak.completed += 1;
    soak.remaining -= 1;
    if (soak.remaining > 0) {
      this.launchDevAnomalyReturnSoakCycle();
      return;
    }
    // eslint-disable-next-line no-console
    console.info(`[AnomalyReturnSoak] ${soak.completed}/${soak.requested} visible Arena returns passed`,
      this.anomalyReturnDebugSnapshot());
    this.playerInput.adoptDevice(soak.initialInputDevice);
    this.devAnomalyReturnSoakResult = {
      requested: soak.requested,
      completed: soak.completed,
      passed: true
    };
    this.devAnomalyReturnSoak = null;
  }

  private validateAnomalyReturnInvariants(
    awaitingPointerCapture: boolean,
    suspension: AnomalySuspensionState | null
  ): void {
    if (!import.meta.env.DEV) return;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body | null;
    const camera = this.cameras.main;
    const arenaInstances = this.scene.manager.scenes.filter((scene) => scene.sys.settings.key === SceneKeys.Arena);
    const expectedPhysicsPaused = awaitingPointerCapture || Boolean(suspension?.physicsWasPaused);
    const failures: string[] = [];
    if (arenaInstances.length !== 1) failures.push(`arena-instance-count-${arenaInstances.length}`);
    if (!this.scene.isActive(SceneKeys.Arena)) failures.push('arena-not-active');
    if (!this.scene.isVisible(SceneKeys.Arena)) failures.push('arena-not-visible');
    if (this.scene.isPaused(SceneKeys.Arena)) failures.push('arena-scene-paused');
    if (this.scene.isSleeping(SceneKeys.Arena)) failures.push('arena-scene-sleeping');
    if (this.scene.isActive(SceneKeys.Heist)) failures.push('heist-still-active');
    if (this.scene.isVisible(SceneKeys.Heist)) failures.push('heist-still-visible');
    if (!camera || !camera.visible || camera.alpha <= 0) failures.push('arena-camera-hidden');
    if (camera.width <= 0 || camera.height <= 0) failures.push('arena-camera-viewport-invalid');
    if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) failures.push('arena-camera-zoom-invalid');
    if (!Number.isFinite(camera.scrollX) || !Number.isFinite(camera.scrollY)) failures.push('arena-camera-scroll-invalid');
    if (camera.fadeEffect.isRunning) failures.push('arena-camera-fade-active');
    if (camera.flashEffect.isRunning) failures.push('arena-camera-flash-active');
    if (suspension && this.cameras.cameras.length !== suspension.camera.count) failures.push('arena-camera-count-changed');
    if (this.sys.displayList.list.length === 0) failures.push('arena-display-list-empty');
    if (this.physics.world.isPaused !== expectedPhysicsPaused) failures.push('physics-pause-mismatch');
    if (!Number.isFinite(this.physics.world.timeScale) || this.physics.world.timeScale <= 0) failures.push('physics-timescale-invalid');
    if (!Number.isFinite(this.time.timeScale) || this.time.timeScale <= 0) failures.push('clock-timescale-invalid');
    if (!this.player.active) failures.push('player-inactive');
    if (!this.player.visible) failures.push('player-hidden');
    if (this.player.scene !== this) failures.push('player-owned-by-wrong-scene');
    if (!playerBody?.enable) failures.push('player-body-disabled');
    if (!this.input.enabled || !this.sys.canInput()) failures.push('arena-gameplay-input-inactive');
    if (this.anomalyReturnLifecycle.blocksExternalPause) failures.push('transition-lock-not-cleared');
    if (awaitingPointerCapture) {
      if (this.state.state !== RoundState.Paused) failures.push('pointer-gate-state-not-paused');
      if (!this.pointerLockInitialGate) failures.push('pointer-gate-flag-missing');
    } else if (this.state.state === RoundState.Paused) failures.push('arena-round-state-paused');
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.error('[AnomalyReturn] live-state invariant failure', failures, this.anomalyReturnDebugSnapshot());
    }
  }

  private traceAnomalyReturn(stage: string, extra: Record<string, unknown> = {}): void {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.debug('[AnomalyReturn]', stage, { ...this.anomalyReturnDebugSnapshot(), ...extra });
  }

  private anomalyReturnDebugSnapshot(): Record<string, unknown> {
    const playerBody = this.player?.body as Phaser.Physics.Arcade.Body | null | undefined;
    const camera = this.cameras?.main;
    return {
      lifecycle: this.anomalyReturnLifecycle.snapshot(),
      devSoakResult: this.devAnomalyReturnSoakResult,
      pendingResult: this.pendingAnomalyReturn?.sessionId ?? null,
      scene: {
        active: this.scene.isActive(SceneKeys.Arena),
        visible: this.scene.isVisible(SceneKeys.Arena),
        paused: this.scene.isPaused(SceneKeys.Arena),
        sleeping: this.scene.isSleeping(SceneKeys.Arena)
      },
      sceneOrder: this.scene.manager.scenes.map((scene, index) => ({
        index,
        key: scene.sys.settings.key,
        active: scene.sys.isActive(),
        visible: scene.sys.isVisible(),
        sleeping: scene.sys.isSleeping(),
        paused: scene.sys.isPaused(),
        status: scene.sys.getStatus(),
        cameraCount: scene.cameras?.cameras.length ?? 0
      })),
      camera: camera ? {
        count: this.cameras.cameras.length,
        visible: camera.visible,
        alpha: camera.alpha,
        viewport: { x: camera.x, y: camera.y, width: camera.width, height: camera.height },
        zoom: camera.zoom,
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
        rotation: (camera as unknown as { rotation: number }).rotation,
        fadeRunning: camera.fadeEffect.isRunning,
        flashRunning: camera.flashEffect.isRunning,
        displayObjects: this.sys.displayList?.list.length ?? 0
      } : null,
      simulation: {
        roundState: this.state.state,
        clockPaused: this.time?.paused,
        clockTimeScale: this.time?.timeScale,
        physicsPaused: this.physics?.world?.isPaused,
        physicsTimeScale: this.physics?.world?.timeScale
      },
      player: {
        active: this.player?.active,
        visible: this.player?.visible,
        bodyEnabled: playerBody?.enable,
        x: this.player?.x,
        y: this.player?.y
      },
      input: {
        sceneInputEnabled: this.input?.enabled,
        sceneCanInput: this.sys?.canInput(),
        activeDevice: this.playerInput?.activeDevice,
        pointerLocked: this.pointerLock?.locked ?? false
      }
    };
  }

  private commitAnomalyLoot(result: AnomalyReturnResult): void {
    const loot = result.loot;
    SaveSystem.addCredits(loot.credits);
    SaveSystem.addCoreTokens(loot.coreTokens);
    SaveSystem.addPlasmaChips(loot.plasmaChips);
    SaveSystem.addFluxCores(loot.fluxCores);
    const entries: Array<{ kind: 'credits' | 'coreTokens' | 'plasmaChips' | 'fluxCores'; amount: number }> = [
      { kind: 'credits', amount: loot.credits }, { kind: 'coreTokens', amount: loot.coreTokens },
      { kind: 'plasmaChips', amount: loot.plasmaChips }, { kind: 'fluxCores', amount: loot.fluxCores }
    ];
    for (const entry of entries) {
      if (entry.amount <= 0) continue;
      recordAnomalyMetric({ name: 'anomaly_reward_committed', anomalyId: 'heist', round: this.currentCombatRound(),
        protocol: this.protocol, elapsedMs: 0, rewardKind: entry.kind, rewardAmount: entry.amount });
    }
    for (const modId of loot.modIds) {
      const definition = MOD_BY_ID.get(modId);
      if (!definition) continue;
      const awarded = this.awardResolvedMod(
        definition,
        'anomaly',
        result.sourcePortal.x,
        result.sourcePortal.y,
        MOD_PICKUP_REVEAL_LEAD_IN_MS
      );
      if (!awarded) continue;
      recordAnomalyMetric({ name: 'anomaly_reward_committed', anomalyId: 'heist', round: this.currentCombatRound(),
        protocol: this.protocol, elapsedMs: 0, rewardKind: 'mod', rewardAmount: 1 });
    }
  }

  private findArcadeSpawnPoints(count: number, minimumPlayerDistance: number, seed: number): Array<{ x: number; y: number }> {
    const random = new SeededRandom((seed ^ Math.imul(count, 0x45d9f3b) ^ 0x601da7e) >>> 0);
    const candidates = this.buildArcadePointCandidates(random);
    const accepted: Array<{ x: number; y: number }> = [];
    const minimumPlayerDistanceSquared = minimumPlayerDistance * minimumPlayerDistance;
    const minimumSpacingSquared = 150 * 150;
    for (const candidate of candidates) {
      if (accepted.length >= count) break;
      const point = this.pathfinder.findNearestWalkableWorld(candidate.x, candidate.y, 0, 7);
      if (!point || this.intersectsWallGeometry(point.x, point.y, 24, 24)) continue;
      if (this.isNearBombSite(point.x, point.y, 105)) continue;
      const playerDx = point.x - this.player.x;
      const playerDy = point.y - this.player.y;
      if (playerDx * playerDx + playerDy * playerDy < minimumPlayerDistanceSquared) continue;
      if (accepted.some((other) => (other.x - point.x) ** 2 + (other.y - point.y) ** 2 < minimumSpacingSquared)) continue;
      if (this.pathfinder.findPath(this.player.x, this.player.y, point.x, point.y, { maxIterations: 5_000 }).length === 0) continue;
      accepted.push(point);
    }
    return accepted;
  }

  private findArcadeCheckpointPoints(count: number, seed: number): Array<{ x: number; y: number }> {
    const random = new SeededRandom((seed ^ Math.imul(count, 0x27d4eb2d) ^ 0xc1ac017) >>> 0);
    const candidates = this.buildArcadePointCandidates(random);
    const accepted: Array<{ x: number; y: number }> = [];
    let previous = { x: this.player.x, y: this.player.y };
    const minimumSpacingSquared = 190 * 190;
    const preferredMaximumStepSquared = 540 * 540;
    while (accepted.length < count && candidates.length > 0) {
      let chosenIndex = -1;
      let fallbackIndex = -1;
      let fallbackDistanceSquared = Number.POSITIVE_INFINITY;
      for (let index = 0; index < candidates.length; index += 1) {
        const point = this.pathfinder.findNearestWalkableWorld(candidates[index].x, candidates[index].y, 0, 7);
        if (!point || this.intersectsWallGeometry(point.x, point.y, 30, 30)) continue;
        if (accepted.some((other) => (other.x - point.x) ** 2 + (other.y - point.y) ** 2 < minimumSpacingSquared)) continue;
        const stepDistanceSquared = (previous.x - point.x) ** 2 + (previous.y - point.y) ** 2;
        if (stepDistanceSquared < minimumSpacingSquared) continue;
        if (this.pathfinder.findPath(previous.x, previous.y, point.x, point.y, { maxIterations: 5_000 }).length === 0) continue;
        candidates[index] = point;
        if (stepDistanceSquared <= preferredMaximumStepSquared) {
          chosenIndex = index;
          break;
        }
        if (stepDistanceSquared < fallbackDistanceSquared) {
          fallbackIndex = index;
          fallbackDistanceSquared = stepDistanceSquared;
        }
      }
      if (chosenIndex < 0) chosenIndex = fallbackIndex;
      if (chosenIndex < 0) break;
      const [chosen] = candidates.splice(chosenIndex, 1);
      accepted.push(chosen);
      previous = chosen;
    }
    return accepted;
  }

  private findArcadeExtractionPoint(fromX: number, fromY: number, seed: number): { x: number; y: number } | null {
    const bounds = this.layout.generation.bounds;
    const random = new SeededRandom((seed ^ Math.floor(fromX * 31) ^ Math.floor(fromY * 17) ^ 0xe871ac7) >>> 0);
    const inset = 64;
    const candidates: Array<{ x: number; y: number }> = [];
    for (let index = 1; index <= 6; index += 1) {
      const horizontal = index / 7;
      candidates.push(
        { x: bounds.x + bounds.w * horizontal, y: bounds.y + inset },
        { x: bounds.x + bounds.w * horizontal, y: bounds.y + bounds.h - inset },
        { x: bounds.x + inset, y: bounds.y + bounds.h * horizontal },
        { x: bounds.x + bounds.w - inset, y: bounds.y + bounds.h * horizontal }
      );
    }
    let best: { x: number; y: number } | null = null;
    let bestDistanceSquared = 0;
    for (const candidate of random.shuffle(candidates)) {
      const point = this.pathfinder.findNearestWalkableWorld(candidate.x, candidate.y, 0, 7);
      if (!point || this.intersectsWallGeometry(point.x, point.y, 28, 28) || this.isNearBombSite(point.x, point.y, 105)) continue;
      const dx = point.x - fromX;
      const dy = point.y - fromY;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 360 * 360 || distanceSquared <= bestDistanceSquared) continue;
      if (this.pathfinder.findPath(fromX, fromY, point.x, point.y, { maxIterations: 5_500 }).length === 0) continue;
      best = point;
      bestDistanceSquared = distanceSquared;
    }
    return best;
  }

  private buildArcadePointCandidates(random: SeededRandom): Array<{ x: number; y: number }> {
    const bounds = this.layout.generation.bounds;
    const candidates = this.layout.enemySpawns.map((point) => ({ x: point.x, y: point.y }));
    const columns = 7;
    const rows = 5;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        candidates.push({
          x: bounds.x + bounds.w * ((column + 0.5) / columns),
          y: bounds.y + bounds.h * ((row + 0.5) / rows)
        });
      }
    }
    for (const site of this.bombSites.sites) {
      for (let index = 0; index < 4; index += 1) {
        const angle = index * Math.PI * 0.5 + random.float(-0.18, 0.18);
        candidates.push({ x: site.x + Math.cos(angle) * 155, y: site.y + Math.sin(angle) * 155 });
      }
    }
    return random.shuffle(candidates);
  }

  private isNearBombSite(x: number, y: number, radius: number): boolean {
    const radiusSquared = radius * radius;
    return this.bombSites.sites.some((site) => (site.x - x) ** 2 + (site.y - y) ** 2 < radiusSquared);
  }

  private removeArcadeEnemy(enemy: Enemy): void {
    const index = this.enemies.indexOf(enemy);
    if (index >= 0) this.enemies.splice(index, 1);
    this.destroyEnemyColliders(enemy);
    this.defuseAssignees.delete(enemy);
    this.defuseTargetByEnemy.delete(enemy);
    let missileWriteIndex = 0;
    for (const missile of this.homingMissiles) {
      if (missile.owner === enemy) missile.sprite.destroy();
      else this.homingMissiles[missileWriteIndex++] = missile;
    }
    this.homingMissiles.length = missileWriteIndex;
    enemy.destroy();
  }

  private activeMajorBosses(): Boss[] {
    if (this.supremeFinale) return this.supremeFinale.activeBosses();
    const boss = this.bossEncounter?.boss;
    return boss?.active && !boss.isDefeated ? [boss] : [];
  }

  private nearestActiveBossTarget(x: number, y: number): Boss | null {
    if (this.supremeFinale) return this.supremeFinale.nearestTarget(x, y);
    const boss = this.bossEncounter?.boss;
    if (boss?.active && !boss.isDefeated) return boss;
    return this.arcadeController?.getBossTarget() ?? null;
  }

  private destroyEnemyColliders(enemy: Enemy): void {
    const colliders = this.enemyColliders.get(enemy);
    if (!colliders) return;
    for (const collider of colliders) collider.destroy();
    this.enemyColliders.delete(enemy);
  }

  private playEnemyGhostEcho(enemy: Enemy): void {
    const ghost = this.trackRoundInfusionEffect(this.add.image(enemy.x, enemy.y, enemy.texture.key, enemy.frame.name)
      .setDisplaySize(enemy.displayWidth, enemy.displayHeight)
      .setRotation(enemy.rotation)
      .setTint(0x74f7ff)
      .setAlpha(0.42)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7));
    this.tweens.add({
      targets: ghost,
      y: ghost.y - 42,
      alpha: 0,
      scaleX: 1.22,
      scaleY: 1.22,
      duration: 720,
      ease: 'Cubic.Out',
      onComplete: () => this.releaseRoundInfusionEffect(ghost)
    });
  }

  private playArcadePop(x: number, y: number): void {
    const callouts = ['ZAP!', 'NICE!', 'RAD!', 'POP!', 'NEON!'];
    const index = this.arcadePopSequence++ % callouts.length;
    const label = this.trackRoundInfusionEffect(this.add.text(x, y - 18, callouts[index], {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(this.infusionSpectrumColor(index * 0.14)).rgba,
      stroke: '#020711',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(13).setRotation(Phaser.Math.FloatBetween(-0.1, 0.1)));
    this.tweens.add({
      targets: label,
      y: label.y - 34,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      delay: 180,
      duration: 760,
      ease: 'Back.easeOut',
      onComplete: () => this.releaseRoundInfusionEffect(label)
    });
  }

  private tryAwardMod(
    source: ModDropSource,
    guaranteed = false,
    x = this.player.x,
    y = this.player.y,
    forcePhysical = false,
    arcadeEventId?: ArcadeEventId
  ): ModPickup | null {
    const definition = rollModDrop({
      source,
      round: this.currentCombatRound(),
      seed: this.layout.seed,
      sequence: this.modDropSequence++,
      protocol: this.protocol,
      focus: this.modFocus,
      contract: this.contract,
      guaranteed
    });
    if (!definition) return null;
    if (source !== 'milestone' || forcePhysical) {
      return this.spawnModPickup(definition, source, x, y, arcadeEventId);
    }
    // Milestone rewards occur after the objective is already complete, so
    // retain their existing immediate grant. In-arena enemy/boss drops use
    // the physical collision path below.
    this.awardResolvedMod(definition, source, x, y);
    return null;
  }

  private spawnModPickup(
    definition: ModDefinition,
    source: ModDropSource,
    x: number,
    y: number,
    arcadeEventId?: ArcadeEventId
  ): ModPickup {
    const visual = createGameplayModPickupVisual(this, definition, x, y);
    const pickup: ModPickup = {
      definition,
      source,
      sprite: visual.root,
      visual,
      expiresAt: source === 'boss' ? Number.POSITIVE_INFINITY : this.time.now + 28_000,
      collectibleAt: this.time.now + 120,
      collected: false,
      arcadeEventId
    };
    this.modPickups.push(pickup);
    if (arcadeEventId) this.recordArcadeLootMetric('arcade_pickup_spawned', arcadeEventId, 'mod', 1);
    return pickup;
  }

  private updateModPickups(now: number, dt: number): void {
    if (this.modPickups.length === 0) return;
    const collectionRadius = this.player.stats.pickupRadius + 10;
    const collectionRadiusSquared = collectionRadius * collectionRadius;
    const magneticField = this.modRuntime.magneticServiceField(collectionRadius);
    const attractionRadiusSquared = magneticField.attractionRadius * magneticField.attractionRadius;
    let writeIndex = 0;
    for (const pickup of this.modPickups) {
      if (!pickup.sprite.active || pickup.collected) continue;
      if (now > pickup.expiresAt) {
        if (pickup.arcadeEventId) this.recordArcadeLootMetric('arcade_pickup_expired', pickup.arcadeEventId, 'mod', 1);
        pickup.sprite.destroy();
        continue;
      }
      updateGameplayModPickupVisual(pickup.visual, now, dt);
      const dx = this.player.x - pickup.sprite.x;
      const dy = this.player.y - pickup.sprite.y;
      const distanceSquared = dx * dx + dy * dy;
      if (now >= pickup.collectibleAt && distanceSquared <= collectionRadiusSquared) {
        pickup.collected = true;
        const x = pickup.sprite.x;
        const y = pickup.sprite.y;
        pickup.sprite.destroy();
        this.audio.playSfx('modPickup');
        this.awardResolvedMod(pickup.definition, pickup.source, x, y, MOD_PICKUP_REVEAL_LEAD_IN_MS);
        if (pickup.arcadeEventId) this.recordArcadeLootMetric('arcade_pickup_collected', pickup.arcadeEventId, 'mod', 1);
        continue;
      }
      if (now >= pickup.collectibleAt && magneticField.pullSpeed > 0 && distanceSquared < attractionRadiusSquared) {
        const distance = Math.sqrt(distanceSquared);
        if (distance > 0.001) {
          const step = Math.min(Math.max(0, distance - collectionRadius * 0.65), magneticField.pullSpeed * dt);
          pickup.sprite.x += dx / distance * step;
          pickup.sprite.y += dy / distance * step;
        }
      }
      this.modPickups[writeIndex++] = pickup;
    }
    this.modPickups.length = writeIndex;
  }

  private awardResolvedMod(definition: ModDefinition, source: ModDropSource, x: number, y: number, leadInMs = 0, contextLine?: string): boolean {
    const duplicate = Boolean(SaveSystem.getModCollection().inventory[definition.id]?.discovered);
    const result = SaveSystem.addMod(definition.id);
    if (!result.ok) return false;
    const card = SaveSystem.getModCollection().cards.at(-1);
    this.modsEarned.push({ modId: definition.id, duplicate, source });
    GameplayTelemetryRecorder.recordModDrop(definition.id, definition.rarity, source, duplicate);
    if (card) {
      const sourcePosition = this.modRevealScreenPosition(x, y);
      this.modAcquisitionPresenter?.enqueue({
        card: { ...card },
        rarity: definition.rarity,
        duplicate,
        sourceScreenX: sourcePosition.x,
        sourceScreenY: sourcePosition.y,
        leadInMs,
        contextLine
      });
      this.modAcquisitionPresenter?.whenIdle(() => {
        TutorialEventBus.emit('mod.revealed', { modId: definition.id, rarity: definition.rarity, duplicate });
        if (definition.rarity === 'legendary') TutorialEventBus.emit('mod.legendaryRevealed', { modId: definition.id });
        if (definition.variant === 'corrupted') TutorialEventBus.emit('mod.corruptedRevealed', { modId: definition.id });
      });
    }
    return true;
  }

  private tryAwardSupremeBridge(completedRound: number): SupremeBridgeAwardOutcome {
    const collection = SaveSystem.getModCollection();
    const resolution = resolveSupremeBridgeReward({
      protocol: this.protocol,
      completedRound,
      seed: this.layout.seed,
      alreadyAwarded: SaveSystem.hasRegularOverdriveSupremeBridgeAwarded(),
      ownedModIds: Object.keys(collection.inventory)
    });
    if (!resolution.markSatisfied) return { firstSupremeAwarded: false, modId: null };
    if (!resolution.modId) {
      SaveSystem.markRegularOverdriveSupremeBridgeAwarded();
      return { firstSupremeAwarded: false, modId: null };
    }
    const definition = MOD_BY_ID.get(resolution.modId);
    if (!definition || definition.rarity !== 'supreme') return { firstSupremeAwarded: false, modId: null };
    const awarded = this.awardResolvedMod(
      definition,
      'milestone',
      this.player.x,
      this.player.y,
      0,
      'UNLOCKED FOR SUPREME OVERDRIVE'
    );
    if (awarded) SaveSystem.markRegularOverdriveSupremeBridgeAwarded();
    return { firstSupremeAwarded: awarded, modId: awarded ? definition.id : null };
  }

  private modRevealScreenPosition(worldX: number, worldY: number): { x: number; y: number } {
    const camera = this.cameras.main;
    const x = camera.x + (worldX - camera.worldView.x) * camera.zoom;
    const y = camera.y + (worldY - camera.worldView.y) * camera.zoom;
    const visible = x >= -40 && x <= this.scale.width + 40 && y >= -40 && y <= this.scale.height + 40;
    if (!visible) return { x: this.scale.width * 0.5, y: this.scale.height * 0.78 };
    return {
      x: Phaser.Math.Clamp(x, 32, this.scale.width - 32),
      y: Phaser.Math.Clamp(y, 32, this.scale.height - 32)
    };
  }

  private createDeathExplosion(x: number, y: number, color: number, playerDeath = false): void {
    const scale = playerDeath ? 1.25 : 1;
    const flash = this.add.circle(x, y, 10 * scale, 0xffffff, 0.95).setDepth(10);
    const core = this.add.circle(x, y, 15 * scale, color, 0.78).setDepth(9);
    const ring = this.add.circle(x, y, 18 * scale, color, 0.16)
      .setStrokeStyle(3, color, 0.95)
      .setDepth(8);

    this.tweens.add({ targets: flash, radius: 25 * scale, alpha: 0, duration: 110, onComplete: () => flash.destroy() });
    this.tweens.add({ targets: core, radius: 40 * scale, alpha: 0, duration: 220, ease: 'Quad.easeOut', onComplete: () => core.destroy() });
    this.tweens.add({ targets: ring, radius: 55 * scale, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });

    if (!this.particlesEnabled) return;
    const shardCount = playerDeath ? 12 : 7;
    for (let i = 0; i < shardCount; i += 1) {
      const angle = (Math.PI * 2 * i) / shardCount + Phaser.Math.FloatBetween(-0.18, 0.18);
      const distance = Phaser.Math.Between(28, playerDeath ? 68 : 48);
      const shard = this.add.rectangle(x, y, playerDeath ? 8 : 6, 2, i % 3 === 0 ? 0xffffff : color, 0.95)
        .setRotation(angle)
        .setDepth(10);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scaleX: 0.35,
        duration: Phaser.Math.Between(220, 360),
        ease: 'Quad.easeOut',
        onComplete: () => shard.destroy()
      });
    }
  }

  private dropPickup(x: number, y: number): PickupType {
    const type = selectEnemyPickup(Math.random());

    const p = this.createPickupSprite(type, x, y, GAMEPLAY_PICKUP_COLOR_BY_TYPE[type]);
    this.pickups.push({ type, sprite: p, expiresAt: this.time.now + PICKUP_BALANCE.lifetimeMs, source: 'enemy' });
    GameplayTelemetryRecorder.recordPickupDropped(type, 'enemy');
    return type;
  }

  private createPickupSprite(type: PickupType, x: number, y: number, color: number): Phaser.GameObjects.Container {
    const container = this.pickupPresentation.create(type, x, y, color);
    const motionSeed = Math.abs(x * 0.037 + y * 0.053 + type.length * 1.731);
    const driftAngle = motionSeed % (Math.PI * 2);
    const driftSpeed = PICKUP_FLOAT_DRIFT_MIN + motionSeed % PICKUP_FLOAT_DRIFT_RANGE;
    this.pickupMotion.set(container, {
      velocityX: Math.cos(driftAngle) * driftSpeed,
      velocityY: Math.sin(driftAngle) * driftSpeed,
      phase: motionSeed % (Math.PI * 2)
    });
    return container;
  }

  private dropFluxCorePickup(x: number, y: number, color: number): void {
    const sprite = this.createPickupSprite('fluxCore', x, y, color);
    this.pickups.push({
      type: 'fluxCore',
      sprite,
      expiresAt: this.time.now + PICKUP_BALANCE.lifetimeMs,
      source: 'flux-core'
    });
    GameplayTelemetryRecorder.recordPickupDropped('fluxCore', 'flux-core');
  }


  private detonateSite(site: BombSiteRuntime): void {
    if (this.detonatingSiteIds.has(site.id)) return;
    this.detonatingSiteIds.add(site.id);
    this.state.set(this.bombSites.activeBombCount() > 1 ? RoundState.Defense : RoundState.Victory);
    this.bombsiteMods.onBombDetonationStarted(site, this.time.now);
    if (this.state.state === RoundState.Victory) {
      this.laserSecurity?.silence();
      this.audio.stopFluxCoreLoop();
    }

    const color = SaveSystem.getCosmeticColor('bombColor', this.time.now);
    const prismBomb = this.prismBombColor;
    // `bomb` is routed through AudioManager's same pooled bomblet recording
    // used by mines, while retaining the player's independent Explosion slider.
    this.audio.playSfx('bomb');
    this.cameras.main.shake(760, 0.02);
    this.physics.world.timeScale = 0.35;
    this.mineExplosionVfx.emitColors(
      site.x,
      site.y,
      BOMBSITE_EXPLOSION_VISUAL_RADIUS,
      0xffffff,
      color,
      prismBomb ? 0x63efff : this.layout.theme.secondary,
      prismBomb ? 0xff5bd6 : color,
      this.time.now,
      false
    );
    const bombExplosionCosmeticEffect = this.bombExplosionCosmeticVfx.emitEquipped(
      SaveSystem.getEquippedCosmeticId('bombColor'),
      site.x,
      site.y,
      BOMBSITE_EXPLOSION_VISUAL_RADIUS,
      this.time.now
    );
    if (bombExplosionCosmeticEffect) {
      this.audio.playSfx(BOMB_EXPLOSION_COSMETIC_DEFINITIONS[bombExplosionCosmeticEffect].sound);
    }

    if (this.modRuntime.hasInfusion('detonation-fireworks')) this.playDetonationFireworks(site.x, site.y);

    this.fluxCores?.damageArea(site.x, site.y, 360, 9999, 'bomb');

    for (const e of this.enemies) {
      const d = Phaser.Math.Distance.Between(e.x, e.y, site.x, site.y);
      if (d < 360) e.takeDamage(9999, 'bomb');
    }
    this.enemies = this.enemies.filter((enemy) => {
      if (!enemy.isDead()) return true;
      this.killEnemy(enemy);
      return false;
    });

    let projectileWriteIndex = 0;
    for (const projectile of this.projectiles) {
      const dx = projectile.sprite.x - site.x;
      const dy = projectile.sprite.y - site.y;
      if (dx * dx + dy * dy < 330 * 330) {
        this.retireProjectile(projectile);
      } else {
        this.projectiles[projectileWriteIndex] = projectile;
        projectileWriteIndex += 1;
      }
    }
    this.projectiles.length = projectileWriteIndex;
    this.homingMissiles = this.homingMissiles.filter((missile) => {
      if (Phaser.Math.Distance.Between(missile.sprite.x, missile.sprite.y, site.x, site.y) >= 330) return true;
      this.detonateHomingMissile(missile, 'intercepted');
      return false;
    });

    this.time.delayedCall(850, () => {
      this.physics.world.timeScale = 1;
      this.bombSites.onDetonated(site, this.layout.theme);
      this.detonatingSiteIds.delete(site.id);
      this.bombSites.refreshVisuals(this.layout.theme);
      if (this.bombSites.sites.every((candidate) => candidate.state === BombSiteState.Destroyed)) {
        this.boostVisual.reset();
        this.state.set(RoundState.Victory);
      } else {
        this.state.set(this.bombSites.activeBombCount() > 0 ? RoundState.Defense : RoundState.PrePlant);
      }
    });
  }

  private recoveryAfterSiteDestroy(): void {
    this.showBanner(this.bombSites.activeBombCount() > 0 ? 'SITE DESTROYED - KEEP DEFENDING' : 'SITE DESTROYED - CHOOSE NEXT TARGET');

    const healthBefore = this.player.hp;
    const energyBefore = this.player.energy;
    this.player.hp = Math.min(this.player.stats.maxHealth, this.player.hp + REWARD_BALANCE.siteRecoveryHealth);
    this.player.energy = Math.min(this.player.energyStats.max, this.player.energy + REWARD_BALANCE.siteRecoveryEnergy);
    GameplayTelemetryRecorder.recordResourceGain('health', 'site-recovery-direct', REWARD_BALANCE.siteRecoveryHealth, this.player.hp - healthBefore);
    GameplayTelemetryRecorder.recordResourceGain('energy', 'site-recovery-direct', REWARD_BALANCE.siteRecoveryEnergy, this.player.energy - energyBefore);
    this.abilityCooldownUntil.fence = Math.min(this.abilityCooldownUntil.fence, this.time.now + 900);
    this.abilityCooldownUntil.turret = Math.min(this.abilityCooldownUntil.turret, this.time.now + 900);
    this.mineChargeRack.accelerateRecharge(this.time.now, 900);

    const recoveryCredits = this.scaleModCredits(REWARD_BALANCE.siteRecoveryCredits);
    this.roundCredits += recoveryCredits;
    this.totalCreditsCollected += recoveryCredits;

    for (const s of this.bombSites.getRemainingSites()) {
      const pickupType: PickupType = Math.random() < 0.5 ? 'health' : 'energy';
      const px = s.x + Phaser.Math.Between(-20, 20);
      const py = s.y + Phaser.Math.Between(-20, 20);
      const p = this.createPickupSprite(pickupType, px, py, pickupType === 'health' ? COLORS.green : COLORS.cyan);
      this.pickups.push({ type: pickupType, sprite: p, expiresAt: this.time.now + 11_000, source: 'site-recovery' });
      GameplayTelemetryRecorder.recordPickupDropped(pickupType, 'site-recovery');
    }
  }

  private completeRound(): void {
    if (this.state.state === RoundState.Victory && this.pendingRoundPayload) return;
    this.arcadeController?.stop('round-ended');
    this.anomalyController?.stop('round-ended');
    this.clearRoundInfusionEffects();
    this.audio.stopLowHealthWarning();
    this.showBanner('ALL TARGETS DESTROYED');
    this.flushPendingCombatProgress();

    const completedRound = this.roundManager.round;
    const completedSeed = this.layout.seed;
    const completedTemplate = this.layout.template;
    this.tryAwardMod('milestone', isGuaranteedMilestone(completedRound));
    // Round 50 is also a boss round. Its bridge reward and campaign unlock
    // must wait for the boss victory endpoint; awarding here lets a reveal
    // compete with beginBossFight and can grant the bridge before a failed boss.
    const deferSupremeBridge = isBossRound(completedRound)
      && isRegularOverdriveTerminalCompletion(this.protocol, completedRound);
    const supremeBridge = deferSupremeBridge
      ? { firstSupremeAwarded: false, modId: null }
      : this.tryAwardSupremeBridge(completedRound);

    const rawRewardCredits = this.roundCredits + this.scaleModCredits(getRoundCompletionCredits(completedRound));
    const rewardMultiplier = this.currentRewardMultiplier();
    const rewardCredits = Math.round(rawRewardCredits * (getContract(this.contract)?.creditRewardMultiplier ?? 1) * rewardMultiplier);
    const baseCompletionTokens = Math.max(REWARD_BALANCE.completionBaseTokens, Math.floor(completedRound / REWARD_BALANCE.tokenRoundDivisor));
    const rewardTokens = Math.round((this.roundCoreTokens + baseCompletionTokens) * rewardMultiplier);
    const rewardPlasmaChips = Math.round(this.roundPlasmaChips * rewardMultiplier);
    const rewardFluxCores = Math.round(this.roundFluxCores * rewardMultiplier);
    SaveSystem.addCredits(rewardCredits);
    SaveSystem.addCoreTokens(rewardTokens);
    SaveSystem.addPlasmaChips(rewardPlasmaChips);
    SaveSystem.addFluxCores(rewardFluxCores);
    SaveSystem.recordRoundCompletion(completedRound, this.protocol);
    OnlineRunManager.recordMilestone(completedRound);
    this.captureTelemetryEndState();
    GameplayTelemetryRecorder.endEncounter('completed', {
      credits: rewardCredits,
      coreTokens: rewardTokens,
      plasmaChips: rewardPlasmaChips,
      fluxCores: rewardFluxCores
    });

    const resultTransitionDelay = this.bombExplosionCosmeticVfx.recommendedSceneHoldMs(1400, this.time.now);
    this.transitionAfterModReveals(resultTransitionDelay, () => {
      const completedTeachingRound = SaveSystem.getTutorialProgress().firstRunStage === 'arena-teaching';
      if (completedTeachingRound) {
        SaveSystem.updateTutorialProgress((progress) => { completeFirstRunTeachingRound(progress); });
        GameplayTelemetryRecorder.finishRun('quit');
        OnlineRunManager.complete('quit', completedRound);
        this.registry.remove('arena-session');
        this.registry.remove('round-finished');
        RunTransitionManager.clearForMenu(this);
        this.scene.start(SceneKeys.MainMenu);
        return;
      }
      const next = this.roundManager.nextRound();
      const payload: RoundFinishedPayload = {
        baseSeed: this.roundManager.seedBase,
        completedRound,
        completedSeed,
        completedTemplate,
        nextRound: next.round,
        nextSeed: next.seed,
        nextTemplate: next.template,
        objectiveMode: this.roundManager.mode,
        creditsGained: rewardCredits,
        coreTokensGained: rewardTokens,
        plasmaChipsGained: rewardPlasmaChips,
        fluxCoresGained: rewardFluxCores,
        bossDefeated: null,
        protocol: this.protocol,
        nextProtocol: this.protocol,
        equippedMods: this.modRuntime.snapshot(),
        modsEarned: [...this.modsEarned],
        runStartedAt: this.runStartedAt,
        modFocus: this.modFocus,
        contract: this.contract,
        creditsSpentBeforeRun: this.creditsSpentBeforeRun,
        upgradeCompletionPercentage: this.upgradeCompletionPercentage,
        accountProgressionTier: this.accountProgressionTier,
        runCreditsEarned: this.runCreditsEarned + rewardCredits
      };

      if (isSupremeTerminalRound(this.protocol, completedRound)) {
        this.beginBossFight(payload, true);
        return;
      }
      if (isBossRound(completedRound)) {
        this.beginBossFight(payload, false);
        return;
      }
      this.presentCompletedRound(payload, supremeBridge);
    });
  }

  /** Single authoritative post-round handoff. Reward ownership and the unlock
   * flag are already durable before either presentation scene is entered. */
  private presentCompletedRound(
    payload: RoundFinishedPayload,
    bridge: SupremeBridgeAwardOutcome
  ): void {
    const regularOverdriveCompleted = SaveSystem.hasCompletedRegularOverdrive();
    const plan = resolveSupremePostRoundPlan({
      protocol: payload.protocol,
      completedRound: payload.completedRound,
      firstSupremeAwarded: bridge.firstSupremeAwarded,
      firstSupremeTutorialSeen: SaveSystem.hasSeenFirstSupremeTutorial(),
      regularOverdriveCompleted
    });

    if (plan.newlyUnlocksSupremeOverdrive) {
      SaveSystem.recordRegularOverdriveCompletion();
    }
    if (plan.completesRegularOverdrive) {
      // The live run crosses the boundary now. Persisting the real Supreme
      // protocol also makes its universal slots available in the between-round
      // Mod Collection without force-equipping the newly awarded card.
      SaveSystem.setPreferredProtocol(plan.nextProtocol);
    }

    const finalizedPayload: RoundFinishedPayload = {
      ...payload,
      nextProtocol: plan.nextProtocol,
      supremeOverdriveUnlocked: plan.newlyUnlocksSupremeOverdrive
    };
    this.pendingRoundPayload = finalizedPayload;
    this.registry.set('round-finished', finalizedPayload);
    if (plan.milestone) {
      this.registry.set('supreme-milestone', { kind: plan.milestone });
      this.scene.start(SceneKeys.SupremeMilestone, { kind: plan.milestone });
      return;
    }
    this.scene.start(SceneKeys.RoundFinished);
  }

  private beginBossFight(payload: RoundFinishedPayload, terminalEncounter = false): void {
    this.prepareForRoundCreation();
    this.pendingRoundPayload = payload;
    this.bossRound = payload.completedRound;
    this.bossVictoryHandled = false;
    this.bossFlowPhase = 'intro';
    this.runCreditsEarned = payload.runCreditsEarned;
    this.roundCredits = 0;
    this.roundCoreTokens = 0;
    this.roundPlasmaChips = 0;
    this.roundFluxCores = 0;
    this.refreshHudWallet();
    this.detonatingSiteIds.clear();
    this.turretTelemetrySequence = 0;
    this.lastShotEnergyDeniedAt = -99_999;
    this.activeDefuserCountForTelemetry = 0;
    this.physics.resume();

    const archetype = selectBossArchetype(this.bossRound, payload.completedSeed);
    const arenaByBoss: Record<BossArchetype, ArenaTemplate> = {
      artillery: 'crossroads',
      'storm-mage': 'ring',
      'void-brawler': 'open-field'
    };
    const bossSeed = (payload.completedSeed ^ Math.imul(this.bossRound, 0x6c8e9cf5) ^ 0xb055a11e) >>> 0;
    this.layout = ArenaGenerator.generate(bossSeed, terminalEncounter ? 'open-field' : arenaByBoss[archetype], this.bossRound, 1);
    this.drawProceduralArena(this.layout);
    this.pathfinder = new GridPathfinder(WORLD_WIDTH, WORLD_HEIGHT, 32, this.getBlockers(), ENEMY_NAVIGATION_PADDING);
    this.createOrMovePlayer();
    this.modRuntime.beginRound(1);
    this.createHudLayer();

    this.bombSites = new BombSiteManager('open', 1);
    this.bombSites.initialize(this, [], this.layout.theme);
    this.laserSecurity = new LaserSecuritySystem(
      this,
      this.bossRound,
      this.layout.theme,
      (damage) => {
        GameplayTelemetryRecorder.recordPlayerDamage('laser', damage);
      },
      (active) => active ? this.audio.startSecurityLaserLoop() : this.audio.stopSecurityLaserLoop(),
      this.currentModeBalance().hazardDamageMultiplier
    );
    this.bombletHazard = new BombletHazardSystem(
      this,
      this.bossRound,
      bossSeed,
      this.layout.theme,
      this.layout.generation.bounds,
      (x, y) => this.hitWall(x, y),
      this.particlesEnabled,
      (damage) => {
        GameplayTelemetryRecorder.recordPlayerDamage('bomblet', damage);
      },
      (x, y, blastRadius, shouldPlaySound, explosionPalette) => {
        if (shouldPlaySound) this.audio.playSfx('bomblet');
        this.mineExplosionVfx.emit(x, y, blastRadius, explosionPalette, this.time.now, false);
        this.fluxCores?.damageArea(x, y, blastRadius, 9999, 'bomblet');
        this.gasHazard?.carveVisualBlast(
          x,
          y,
          blastRadius * GAS_HAZARD_BALANCE.bombletTunnelRadiusMultiplier
        );
      },
      this.currentModeBalance().hazardDamageMultiplier
    );
    if (this.bossRound >= GAS_HAZARD_BALANCE.unlockRound) {
      this.gasHazard = new GasHazardSystem(
        this,
        this.bossRound,
        bossSeed,
        this.layout.generation.bounds,
        (x, y) => this.hitWall(x, y),
        this.particlesEnabled,
        (damage) => {
          GameplayTelemetryRecorder.recordPlayerDamage('gas', damage);
        },
        () => this.audio.playSfx('gasFizz'),
        () => this.audio.playSfx('gasCanImpact')
      );
    }
    this.fluxCores = new FluxCoreSystem(
      this,
      this.bossRound,
      bossSeed,
      this.layout.theme,
      this.layout.generation.bounds,
      (x, y, halfWidth, halfHeight) => this.intersectsWallGeometry(x, y, halfWidth, halfHeight),
      (x, y, halfWidth, halfHeight) => this.intersectsBombSiteGeometry(x, y, halfWidth, halfHeight),
      this.particlesEnabled,
      (event) => {
        this.audio.playSfx('bomblet');
        if (event.droppedCore) this.dropFluxCorePickup(event.x, event.y, event.color);
      },
      (strength) => this.audio.setFluxCoreProximity(strength),
      () => this.audio.playSfx('defuseAlarm'),
      () => {
        if (!(this.gasHazard?.isLaserSuppressed(this.time.now) ?? false)) this.audio.playSfx('lasersOff');
      }
    );

    GameplayTelemetryRecorder.beginEncounter({
      kind: 'boss',
      round: this.bossRound,
      seed: bossSeed,
      layout: this.layout.template,
      maximumPlayerHealth: this.player.stats.maxHealth,
      maximumPlayerEnergy: this.player.energyStats.max,
      weaponDamage: this.player.weapon.damage,
      weaponFireRate: this.player.fireRate,
      weaponCritChance: this.player.weapon.critChance,
      weaponHeatPerShot: this.player.weapon.heatPerShot,
      energyRegenPerSecond: this.player.energyStats.regenPerSecond
    });

    const spawn = [...this.layout.bombSites]
      .sort((a, b) => Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y)
        - Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y))[0]
      ?? new Phaser.Math.Vector2(WORLD_WIDTH * 0.5, WORLD_HEIGHT * 0.5);
    const supremeDifficulty = getSupremeStage(this.protocol)?.difficulty;
    const bossHealthStageDelta = supremeDifficulty
      ? supremeDifficulty.bossHealthMultiplier / getProtocolModeBalance('supreme').bossHealthMultiplier
      : 1;
    const bossDamageStageDelta = supremeDifficulty
      ? supremeDifficulty.bossDamageMultiplier / getProtocolModeBalance('supreme').bossDamageMultiplier
      : 1;
    const callbacks = {
      fireProjectile: (spec: BossProjectileSpec) => this.spawnBossProjectile(spec),
      damageArea: (x: number, y: number, radius: number, damage: number, attack: BossAttackKind) => this.applyBossAreaDamage(x, y, radius, damage, attack),
      dropCredit: (x: number, y: number) => this.dropBossCredit(x, y),
      onDamaged: (damage: number, source: import('../bosses/Boss.ts').BossDamageSource) => GameplayTelemetryRecorder.recordBossDamage(source, damage),
      onAttackCast: (attack: BossAttackKind) => {
        GameplayTelemetryRecorder.recordBossAttackCast(attack);
        this.playBossAttackCue(attack);
      }
    };
    this.bossWallCollider?.destroy();
    this.bossWallCollider = null;
    this.supremeBossWallColliders.forEach((collider) => collider.destroy());
    this.supremeBossWallColliders.length = 0;
    if (terminalEncounter) {
      const bounds = this.layout.generation.bounds;
      const spawns = [
        { x: bounds.x + bounds.w * .24, y: bounds.y + bounds.h * .25 },
        { x: bounds.x + bounds.w * .76, y: bounds.y + bounds.h * .25 },
        { x: bounds.x + bounds.w * .5, y: bounds.y + bounds.h * .72 }
      ];
      this.supremeFinale = new SupremeFinaleController(
        this, this.bossRound, bossSeed, spawns, bounds, (x, y) => this.hitWall(x, y),
        {
          ...callbacks,
          onBossDefeated: (defeatedArchetype, remaining) => this.handleSupremeBossDefeated(defeatedArchetype, remaining),
          onComplete: () => this.completeSupremeTerminalEncounter()
        },
        this.currentModeFamily(),
        { particlesEnabled: this.particlesEnabled, healthMultiplier: bossHealthStageDelta, damageMultiplier: bossDamageStageDelta }
      );
      GameplayTelemetryRecorder.startBoss('artillery', this.supremeFinale.totalMaximumHealth);
      for (const boss of this.supremeFinale.bosses) this.supremeBossWallColliders.push(this.physics.add.collider(boss, this.walls));
    } else {
      this.bossEncounter = new BossEncounter(
        this, this.bossRound, bossSeed, archetype, spawn, this.layout.generation.bounds,
        (x, y) => this.hitWall(x, y),
        { ...callbacks, onDefeated: () => this.completeBossFight() },
        this.currentModeFamily(),
        { particlesEnabled: this.particlesEnabled, healthMultiplier: bossHealthStageDelta, damageMultiplier: bossDamageStageDelta }
      );
      GameplayTelemetryRecorder.startBoss(archetype, this.bossEncounter.boss.maxHp);
      this.bossWallCollider = this.physics.add.collider(this.bossEncounter.boss, this.walls);
    }

    this.bossPickupRandom = new SeededRandom((bossSeed ^ 0x51f15e11) >>> 0);
    this.nextBossSupportPickupAt = this.time.now + BOSS_BALANCE.supportPickupFirstDelayMs;
    this.shieldActiveUntil = 0;
    this.shieldCooldownUntil = 0;
    this.abilityCooldownUntil = { fence: 0, turret: 0 };
    this.mineChargeRack.reset(this.getAbilityConfig('mine').maxActive);
    this.destroyShieldOrb();
    this.activePlantingSite = null;
    this.plantingProgressMs = 0;
    this.bossEncounter?.setPresentationVisible(false);
    this.supremeFinale?.setPresentationVisible(false);
    this.state.set(RoundState.Paused);
    this.physics.pause();
    this.clearGameplayInput();
    this.setMenuCursorMode();
    this.pointerLock?.hidePrompt();
    this.pointerLock?.release();
    this.bossIntroOverlay?.destroy();
    this.bossIntroOverlay = terminalEncounter ? null : new BossIntroOverlay(this, archetype, () => this.startBossCombat());
    this.supremeFinaleOverlay?.destroy();
    this.supremeFinaleOverlay = terminalEncounter ? new SupremeFinaleOverlay(this, () => this.startBossCombat()) : null;
    if (terminalEncounter) this.supremeConstellation?.setFinaleIntensity(true);
    this.hasLiveRoundObjects = true;
    this.cameras.main.flash(450, 40, 10, 60);
  }

  private startBossCombat(): void {
    if ((!this.bossEncounter && !this.supremeFinale) || !this.transitionBossFlow('intro', 'combat')) return;
    this.bossIntroOverlay?.destroy();
    this.bossIntroOverlay = null;
    this.supremeFinaleOverlay?.destroy();
    this.supremeFinaleOverlay = null;
    this.bossEncounter?.setPresentationVisible(true);
    this.bossEncounter?.playEntrance();
    this.supremeFinale?.setPresentationVisible(true);
    this.supremeFinale?.playEntrance();
    this.nextBossSupportEnemyWaveAt = this.time.now + BOSS_BALANCE.supportEnemyFirstDelayMs;
    this.clearGameplayInput();
    if (this.bossEncounter) TutorialEventBus.emit('combat.bossStarted', { archetype: this.bossEncounter.archetype, round: this.bossRound });
    this.showBanner(this.supremeFinale
      ? 'SUPREME PROTOCOL // TERMINAL ENGAGEMENT\nALL COMMAND SIGNATURES ACTIVE'
      : `BOSS INTERCEPT\n${BOSS_ARCHETYPES[this.bossEncounter!.archetype].label}`);
    if (this.pointerLock?.supported && this.playerInput.activeDevice !== 'gamepad') {
      this.state.set(RoundState.Paused);
      this.pointerLock.requestLock();
    } else {
      this.setGameplayCursorMode();
      this.state.set(RoundState.Defense);
      this.physics.resume();
    }
  }

  private spawnBossProjectile(spec: BossProjectileSpec): void {
    GameplayTelemetryRecorder.recordBossProjectileFired(spec.attack);
    const texture = spec.attack === 'artillery-rocket'
      ? 'projectile-missile'
      : spec.attack === 'storm-basic' || spec.attack === 'storm-super'
        ? 'projectile-boss-arcane'
        : 'projectile-boss-cannon';
    const projectileWidth = spec.attack === 'artillery-rocket'
      ? 36
      : spec.attack === 'storm-basic' || spec.attack === 'storm-super'
        ? (spec.size ?? 10) * 2.15
        : 28;
    const projectileHeight = spec.attack === 'artillery-rocket'
      ? 17
      : spec.attack === 'storm-basic' || spec.attack === 'storm-super'
        ? (spec.size ?? 10) * 2.15
        : 9;
    this.projectiles.push(this.obtainProjectile({
      x: spec.x, y: spec.y, texture, width: projectileWidth, height: projectileHeight,
      tint: spec.color, rotation: spec.angle,
      velocityX: Math.cos(spec.angle) * spec.speed, velocityY: Math.sin(spec.angle) * spec.speed, depth: 8,
      damage: spec.damage,
      from: 'enemy',
      lifeMs: 2600,
      trailColor: spec.color,
      previousX: spec.x,
      previousY: spec.y,
      telemetryOwner: 'boss',
      bossAttack: spec.attack
    }));
  }

  private applyBossAreaDamage(x: number, y: number, radius: number, damage: number, attack: BossAttackKind): void {
    if (attack === 'artillery-strike' || attack === 'artillery-super') {
      this.audio.playSfx('bossArtilleryExplosion');
      this.mineExplosionVfx.emitColors(x, y, radius * 1.15, 0xffffff, 0xffc15f, 0xff744a, 0x55dfff, this.time.now, false);
    } else if (attack === 'artillery-rocket') {
      this.mineExplosionVfx.emitColors(x, y, radius, 0xffffff, 0xffb54f, 0xff5c4a, 0x7ce8ff, this.time.now, false);
    } else if (attack === 'brawler-pounce' || attack === 'brawler-super' || attack === 'brawler-contact') {
      this.mineExplosionVfx.emitColors(
        x, y, attack === 'brawler-contact' ? radius * 0.72 : radius,
        0xffffff, 0xff4e82, 0x9a72ff, 0x45dfff, this.time.now, false
      );
    }
    if (attack === 'brawler-pounce' || attack === 'brawler-super' || attack === 'artillery-strike') {
      this.cameras.main.shake(135, attack === 'brawler-super' ? 0.004 : 0.0025);
    }
    this.fluxCores?.damageArea(x, y, radius, damage, 'boss');
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= radius + 12) {
      const hit = this.player.takeDamage(damage);
      GameplayTelemetryRecorder.recordBossAttackIntersection(attack, hit ? damage : 0, !hit);
      if (hit) {
        GameplayTelemetryRecorder.recordPlayerDamage('boss', damage);
      }
    }
    for (const turret of this.turrets) {
      if (Phaser.Math.Distance.Between(turret.sprite.x, turret.sprite.y, x, y) <= radius + 12) {
        const applied = turret.takeDamage(damage * 0.7);
        GameplayTelemetryRecorder.recordTurretDamaged(turret.telemetryId, applied);
      }
    }
    for (const fence of this.fences) {
      if (Phaser.Math.Distance.Between(fence.sprite.x, fence.sprite.y, x, y) <= radius + 24) fence.hp -= damage * 0.55;
    }
  }

  private playBossAttackCue(attack: BossAttackKind): void {
    if (attack === 'artillery-basic') this.audio.playSfx('sentryBossAttack');
    else if (attack === 'storm-basic') this.audio.playSfx('mageBossMagicAttack');
    else if (attack === 'storm-super') this.audio.playSfx('mageBossLargeAttack');
    else if (attack === 'brawler-pounce') this.audio.playSfx('brawlerBossChargeAttack');
  }

  private dropBossCredit(x: number, y: number): void {
    const random = this.bossPickupRandom;
    const angle = random?.float(0, Math.PI * 2) ?? 0;
    const distance = random?.float(28, 72) ?? 42;
    const px = Phaser.Math.Clamp(x + Math.cos(angle) * distance, 50, WORLD_WIDTH - 50);
    const py = Phaser.Math.Clamp(y + Math.sin(angle) * distance, 50, WORLD_HEIGHT - 50);
    const sprite = this.createPickupSprite('credits', px, py, 0xffd65a);
    this.pickups.push({ type: 'credits', sprite, expiresAt: this.time.now + BOSS_BALANCE.supportPickupLifetimeMs, source: 'boss-damage' });
    GameplayTelemetryRecorder.recordPickupDropped('credits', 'boss-damage');
    GameplayTelemetryRecorder.recordBossCreditDrop();
  }

  private updateBossSupportPickups(now: number): void {
    if ((!this.bossEncounter && !this.supremeFinale) || now < this.nextBossSupportPickupAt || !this.bossPickupRandom) return;
    const interval = this.bossPickupRandom.int(BOSS_BALANCE.supportPickupMinimumIntervalMs, BOSS_BALANCE.supportPickupMaximumIntervalMs);
    this.nextBossSupportPickupAt = now + interval;

    let healthCount = 0;
    let energyCount = 0;
    for (const pickup of this.pickups) {
      if (pickup.source !== 'boss-support') continue;
      if (pickup.type === 'health') healthCount += 1;
      if (pickup.type === 'energy') energyCount += 1;
    }

    let spawned = 0;
    for (const type of ['health', 'energy'] as const) {
      const active = type === 'health' ? healthCount : energyCount;
      const missing = Math.max(0, BOSS_BALANCE.supportPickupTargetPerType - active);
      for (let index = 0; index < missing && healthCount + energyCount + spawned < BOSS_BALANCE.maximumSupportPickups; index += 1) {
        const point = this.findBossSupportPickupPoint();
        if (!point) break;
        const color = type === 'health' ? COLORS.green : COLORS.cyan;
        const sprite = this.createPickupSprite(type, point.x, point.y, color);
        this.pickups.push({ type, sprite, expiresAt: now + BOSS_BALANCE.supportPickupLifetimeMs, source: 'boss-support' });
        GameplayTelemetryRecorder.recordPickupDropped(type, 'boss-support');
        spawned += 1;
      }
    }
    if (spawned > 0) this.showBanner('HEALTH + ENERGY SUPPORT ONLINE');
  }

  private updateBossSupportWave(now: number): void {
    const encounter = this.bossEncounter;
    const random = this.bossPickupRandom;
    if (!encounter || !random || now < this.nextBossSupportEnemyWaveAt) return;
    this.nextBossSupportEnemyWaveAt = now + random.int(
      BOSS_BALANCE.supportEnemyMinimumIntervalMs,
      BOSS_BALANCE.supportEnemyMaximumIntervalMs
    );

    const archetype = encounter.archetype;
    const maximumActive = BOSS_BALANCE.supportEnemyMaximumActive[archetype];
    let activeCount = 0;
    for (const enemy of this.bossSupportEnemies) {
      if (enemy.active && !enemy.isDead()) activeCount += 1;
    }
    const available = Math.max(0, maximumActive - activeCount);
    if (available <= 0) return;

    const tierBonus = Math.min(2, Math.floor(Math.max(0, getBossTier(this.bossRound) - 1) / 3));
    // Supreme inherits every regular Overdrive encounter feature before its
    // stage-specific pressure multipliers are applied.
    const overdriveBonus = this.currentModeFamily() !== 'normal' && getBossTier(this.bossRound) >= 3 ? 1 : 0;
    const requested = Math.min(
      available,
      BOSS_BALANCE.supportEnemyBaseWaveSize[archetype] + tierBonus + overdriveBonus
    );
    let spawned = 0;
    for (let index = 0; index < requested; index += 1) {
      const point = this.findBossSupportPickupPoint();
      if (!point) break;
      const enemy = this.spawnEnemy('shooter', false, point);
      enemy.setData('bossSupport', true);
      enemy.lastShotMs = now + index * 180;
      this.bossSupportEnemies.add(enemy);
      encounter.playSupportEntrance(point.x, point.y);
      spawned += 1;
    }
    if (spawned > 0) {
      const label = archetype === 'storm-mage'
        ? 'CORRUPTED SENTINELS SUMMONED'
        : archetype === 'artillery'
          ? 'RANGED SUPPORT DEPLOYED'
          : 'INTERCEPTOR SUPPORT INBOUND';
      this.showBanner(label);
    }
  }

  private updateBossSupportEnemies(now: number): void {
    if (this.bossSupportEnemies.size === 0) return;
    const idealRange = 235;
    for (const enemy of this.bossSupportEnemies) {
      if (!enemy.active || enemy.isDead()) continue;
      enemy.updateDamageFlash(now);
      this.gasHazard?.carveVisualTunnel(enemy.x, enemy.y, GAS_HAZARD_BALANCE.enemyTunnelRadius);

      const target = this.getSecondaryTurretTarget(enemy, now);
      const targetX = target?.sprite.x ?? this.player.x;
      const targetY = target?.sprite.y ?? this.player.y;
      const dx = targetX - enemy.x;
      const dy = targetY - enemy.y;
      const distanceSquared = dx * dx + dy * dy;
      const movementSpeed = enemy.effectiveSpeed(enemy.stats.speed, now);
      if (distanceSquared > (idealRange + 30) ** 2) {
        this.navigateEnemy(enemy, targetX, targetY, now, movementSpeed);
      } else if (distanceSquared < (idealRange - 34) ** 2) {
        const inverseDistance = distanceSquared > 0 ? 1 / Math.sqrt(distanceSquared) : 0;
        const bounds = this.layout.generation.bounds;
        this.navigateEnemy(
          enemy,
          Phaser.Math.Clamp(enemy.x - dx * inverseDistance * 145, bounds.x + 55, bounds.x + bounds.w - 55),
          Phaser.Math.Clamp(enemy.y - dy * inverseDistance * 145, bounds.y + 55, bounds.y + bounds.h - 55),
          now,
          movementSpeed * 0.85
        );
      } else {
        enemy.setVelocity(0, 0);
      }

      if (now - enemy.lastShotMs >= ENEMY_BALANCE.shooter.attackCooldownMs) {
        enemy.lastShotMs = now;
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, targetX, targetY);
        GameplayTelemetryRecorder.recordProjectileFired('enemy');
        this.projectiles.push(this.obtainProjectile({
          x: enemy.x, y: enemy.y, texture: 'projectile-boss-cannon', width: 22, height: 7, tint: COLORS.orange,
          rotation: angle, velocityX: Math.cos(angle) * 420, velocityY: Math.sin(angle) * 420, depth: 7,
          damage: enemy.stats.damage, from: 'enemy', lifeMs: 1400, trailColor: COLORS.orange, telemetryOwner: 'enemy'
        }));
      }
    }
    this.applyEnemySeparation();

    let writeIndex = 0;
    for (const enemy of this.enemies) {
      if (this.bossSupportEnemies.has(enemy) && enemy.isDead()) {
        this.killBossSupportEnemy(enemy);
        this.bossSupportEnemies.delete(enemy);
        continue;
      }
      this.enemies[writeIndex++] = enemy;
    }
    this.enemies.length = writeIndex;
  }

  private killBossSupportEnemy(enemy: Enemy): void {
    this.audio.playSfx('enemyDeath');
    GameplayTelemetryRecorder.recordEnemyKill({
      type: enemy.stats.type,
      maximumHealth: enemy.stats.hp,
      spawnedAtActiveMs: enemy.telemetrySpawnedAtActiveMs,
      firstDamagedAtActiveMs: enemy.telemetryFirstDamagedAtActiveMs,
      finalSource: enemy.lastDamageSource,
      damageBySource: enemy.damageTakenBySource,
      credits: 0,
      coreTokens: 0
    });
    this.createDeathExplosion(enemy.x, enemy.y, enemy.stats.color);
    this.destroyEnemyColliders(enemy);
    enemy.destroy();
  }

  private clearBossSupportEnemies(): void {
    for (const enemy of [...this.bossSupportEnemies]) {
      if (enemy.active) this.removeArcadeEnemy(enemy);
    }
    this.bossSupportEnemies.clear();
    this.nextBossSupportEnemyWaveAt = 0;
  }

  private findBossSupportPickupPoint(): { x: number; y: number } | null {
    if ((!this.bossEncounter && !this.supremeFinale) || !this.bossPickupRandom) return null;
    const activeBosses = this.activeMajorBosses();
    const bounds = this.layout.generation.bounds;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = {
        x: this.bossPickupRandom.float(bounds.x + 80, bounds.x + bounds.w - 80),
        y: this.bossPickupRandom.float(bounds.y + 80, bounds.y + bounds.h - 80)
      };
      if (this.isClearForArenaPickup(candidate.x, candidate.y)
        && activeBosses.every((boss) => Phaser.Math.Distance.Between(candidate.x, candidate.y, boss.x, boss.y) > 150)) {
        return candidate;
      }
    }
    return null;
  }

  private completeBossFight(): void {
    if (this.bossVictoryHandled || !this.bossEncounter || !this.pendingRoundPayload
      || !this.transitionBossFlow('combat', 'destruction')) return;
    this.bossVictoryHandled = true;
    const encounter = this.bossEncounter;
    const snapshot: BossDeathSnapshot = {
      encounter,
      x: encounter.boss.x,
      y: encounter.boss.y,
      color: BOSS_ARCHETYPES[encounter.archetype].color
    };
    this.boostVisual.reset();
    this.state.set(RoundState.Paused);
    this.clearGameplayInput();
    encounter.cancelCombat();
    this.physics.pause();
    GameplayTelemetryRecorder.recordBossDefeated();

    // Fatal damage can arrive from inside projectile, laser, or bomblet update
    // callbacks. Destructively clearing those same systems in that call stack
    // invalidates their active iterators (and used to leave the scene frozen or
    // throw on already-destroyed Phaser objects). Move lifetime teardown to the
    // next Scene Clock turn, after the fatal-hit callback has fully unwound.
    this.bossSequenceTimers.push(this.time.delayedCall(0, () => this.beginBossDestruction(snapshot)));
  }

  private handleSupremeBossDefeated(archetype: BossArchetype, remaining: number): void {
    const encounter = this.supremeFinale?.encounters.find((candidate) => candidate.archetype === archetype);
    if (!encounter) return;
    GameplayTelemetryRecorder.recordBossDefeated();
    this.audio.playSfx('bomblet');
    this.createDeathExplosion(encounter.boss.x, encounter.boss.y, BOSS_ARCHETYPES[archetype].color, true);
    this.cameras.main.shake(360, 0.006);
    this.cameras.main.flash(180, 150, 240, 255);
    encounter.boss.setVisible(false).setActive(false);
    this.showBanner(remaining > 0
      ? `${BOSS_ARCHETYPES[archetype].label} DESTROYED // ${remaining} COMMAND SIGNATURE${remaining === 1 ? '' : 'S'} REMAIN`
      : 'ALL COMMAND SIGNATURES DESTROYED');
  }

  /** Completes the official terminal encounter only after all three real boss
   * instances report defeat. Deferred teardown avoids mutating projectile and
   * physics collections from inside the fatal-hit callback stack. */
  private completeSupremeTerminalEncounter(): void {
    if (this.bossVictoryHandled || !this.supremeFinale || !this.pendingRoundPayload
      || !this.transitionBossFlow('combat', 'destruction')) return;
    this.bossVictoryHandled = true;
    this.supremeFinale.cancelCombat();
    this.bossSequenceTimers.push(this.time.delayedCall(0, () => {
      if (!this.supremeFinale || !this.pendingRoundPayload || this.bossFlowPhase !== 'destruction') return;
      this.boostVisual.reset();
      this.state.set(RoundState.Victory);
      this.clearGameplayInput();
      this.physics.pause();
      this.clearBossSupportEnemies();
      this.laserSecurity?.silence();
      this.laserSecurity?.destroy();
      this.laserSecurity = null;
      this.bombletHazard?.destroy();
      this.bombletHazard = null;
      this.gasHazard?.destroy();
      this.gasHazard = null;
      this.fluxCores?.destroy();
      this.fluxCores = null;
      this.audio.stopFluxCoreLoop();
      this.retireActiveBossProjectiles();
      this.clearRoundInfusionEffects();
      this.supremeConstellation?.setFinaleIntensity(true);

      const baseRewards = getBossRewards(this.bossRound);
      const rewardMultiplier = this.currentRewardMultiplier();
      const terminalCredits = this.scaleModCredits(Math.round(baseRewards.credits * 3 * rewardMultiplier));
      const terminalTokens = Math.max(3, Math.round(baseRewards.coreTokens * 3 * rewardMultiplier));
      const terminalPlasma = Math.max(3, Math.round(baseRewards.plasmaChips * 3 * rewardMultiplier));
      const terminalFlux = Math.max(3, Math.round(rewardMultiplier * 2));
      SaveSystem.addCredits(terminalCredits);
      SaveSystem.addCoreTokens(terminalTokens);
      SaveSystem.addPlasmaChips(terminalPlasma);
      SaveSystem.addFluxCores(terminalFlux);
      SaveSystem.recordSupremeCompletion();
      this.runCreditsEarned += terminalCredits;
      this.pendingProgressEnemyKills += 3;
      this.flushPendingCombatProgress();
      this.captureTelemetryEndState();
      GameplayTelemetryRecorder.endEncounter('bossDefeated', {
        credits: terminalCredits,
        coreTokens: terminalTokens,
        plasmaChips: terminalPlasma,
        fluxCores: terminalFlux
      });
      GameplayTelemetryRecorder.finishRun('bossDefeated');
      OnlineRunManager.complete('victory', this.bossRound);
      this.registry.remove('arena-session');

      const payload: RoundFinishedPayload = {
        ...this.pendingRoundPayload,
        creditsGained: this.pendingRoundPayload.creditsGained + terminalCredits,
        coreTokensGained: this.pendingRoundPayload.coreTokensGained + terminalTokens,
        plasmaChipsGained: this.pendingRoundPayload.plasmaChipsGained + terminalPlasma,
        fluxCoresGained: this.pendingRoundPayload.fluxCoresGained + terminalFlux,
        bossDefeated: 'supreme-trinity',
        terminalBossesDefeated: 3,
        supremeCompletion: true,
        modsEarned: [...this.modsEarned],
        runCreditsEarned: this.runCreditsEarned
      };
      this.pendingRoundPayload = payload;
      this.bossFlowPhase = 'transitioning';
      this.setMenuCursorMode();
      this.pointerLock?.hidePrompt();
      this.pointerLock?.release();
      this.supremeVictorySequence?.destroy();
      this.supremeVictorySequence = new SupremeVictorySequence(this, () => {
        this.supremeVictorySequence?.destroy();
        this.supremeVictorySequence = null;
        this.registry.set('round-finished', payload);
        this.scene.start(SceneKeys.RoundFinished);
      });
    }));
  }

  private beginBossDestruction(snapshot: BossDeathSnapshot): void {
    if (this.bossFlowPhase !== 'destruction' || this.bossEncounter !== snapshot.encounter) return;
    this.clearBossSupportEnemies();
    this.laserSecurity?.silence();
    this.laserSecurity?.destroy();
    this.laserSecurity = null;
    this.bombletHazard?.destroy();
    this.bombletHazard = null;
    this.gasHazard?.destroy();
    this.gasHazard = null;
    this.fluxCores?.destroy();
    this.fluxCores = null;
    this.audio.stopFluxCoreLoop();
    this.retireActiveBossProjectiles();

    this.showBanner('BOSS CORE DESTABILIZING');
    for (let index = 0; index < 4; index += 1) {
      const timer = this.time.delayedCall(index * 260, () => {
        if (this.bossFlowPhase !== 'destruction' || this.bossEncounter !== snapshot.encounter) return;
        const angle = index * Math.PI * 0.62 + this.time.now * 0.001;
        const distance = 18 + index * 8;
        this.audio.playSfx('bomblet');
        this.createDeathExplosion(snapshot.x + Math.cos(angle) * distance, snapshot.y + Math.sin(angle) * distance, index % 2 === 0 ? snapshot.color : 0xffffff, index >= 2);
        this.cameras.main.shake(120 + index * 18, 0.0022 + index * 0.0006);
      });
      this.bossSequenceTimers.push(timer);
    }
    this.bossSequenceTimers.push(this.time.delayedCall(1120, () => {
      if (this.bossFlowPhase !== 'destruction' || this.bossEncounter !== snapshot.encounter) return;
      this.audio.playSfx('bomblet');
      this.createDeathExplosion(snapshot.x, snapshot.y, snapshot.color, true);
      this.cameras.main.flash(360, 255, 230, 190);
      this.cameras.main.shake(480, 0.008);
      snapshot.encounter.boss.setVisible(false).setActive(false);
      this.beginBossLootCollection(snapshot.x, snapshot.y);
    }));
  }

  private retireActiveBossProjectiles(): void {
    let writeIndex = 0;
    for (const projectile of this.projectiles) {
      if (projectile.telemetryOwner === 'boss') {
        this.retireProjectile(projectile);
        continue;
      }
      this.projectiles[writeIndex++] = projectile;
    }
    this.projectiles.length = writeIndex;
  }

  private beginBossLootCollection(originX: number, originY: number): void {
    if (!this.bossEncounter || !this.transitionBossFlow('destruction', 'loot-collection')) return;
    this.state.set(RoundState.Defense);
    this.physics.resume();
    this.player.setVisible(true).setActive(true);
    this.bossLootLaunchesPending = 0;
    this.showBanner('BOSS VAULT OPEN // COLLECT REWARDS');

    const rewards = getBossRewards(this.bossRound);
    const rewardMultiplier = this.currentRewardMultiplier();
    const bossCredits = this.scaleModCredits(Math.round(rewards.credits * rewardMultiplier));
    const bossCoreTokens = Math.max(1, Math.round(rewards.coreTokens * rewardMultiplier));
    const bossPlasmaChips = Math.max(1, Math.round(rewards.plasmaChips * rewardMultiplier));
    const creditBundles = Math.min(10, Math.max(5, Math.ceil(bossCredits / 300)));
    let remainingCredits = bossCredits;
    let lootIndex = 0;
    const lootCount = creditBundles + bossCoreTokens + bossPlasmaChips + 1;
    for (let index = 0; index < creditBundles; index += 1) {
      const remainingBundles = creditBundles - index;
      const amount = Math.ceil(remainingCredits / remainingBundles);
      remainingCredits -= amount;
      this.launchBossResourcePickup('credits', amount, originX, originY, lootIndex++, lootCount, 0xf5ff58);
    }
    for (let index = 0; index < bossCoreTokens; index += 1) {
      this.launchBossResourcePickup('coreToken', 1, originX, originY, lootIndex++, lootCount, COLORS.purple);
    }
    for (let index = 0; index < bossPlasmaChips; index += 1) {
      this.launchBossResourcePickup('plasmaChip', 1, originX, originY, lootIndex++, lootCount, 0xd06dff);
    }
    const modPickup = this.tryAwardMod('boss', false, originX, originY);
    if (modPickup) this.launchBossModPickup(modPickup, lootIndex++, lootCount);
    if (this.bossLootLaunchesPending === 0) this.showBossNextFightButton();
  }

  private launchBossResourcePickup(
    type: Extract<PickupType, 'credits' | 'coreToken' | 'plasmaChip'>,
    amount: number,
    originX: number,
    originY: number,
    index: number,
    total: number,
    color: number
  ): void {
    const landing = this.findBossLootLanding(originX, originY, index, total);
    const sprite = this.createPickupSprite(type, originX, originY, color).setDepth(15);
    this.pickupMotion.delete(sprite);
    this.pickups.push({
      type,
      amount,
      sprite,
      expiresAt: Number.POSITIVE_INFINITY,
      collectibleAt: this.time.now + 820,
      source: 'boss-loot'
    });
    GameplayTelemetryRecorder.recordPickupDropped(type, 'boss-loot');
    this.animateBossLootLaunch(sprite, landing.x, landing.y, index, () => {
      const phase = Math.abs(landing.x * 0.019 + landing.y * 0.027 + index);
      this.pickupMotion.set(sprite, { velocityX: Math.cos(phase) * 8, velocityY: Math.sin(phase) * 8, phase });
    });
  }

  private launchBossModPickup(pickup: ModPickup, index: number, total: number): void {
    const landing = this.findBossLootLanding(pickup.sprite.x, pickup.sprite.y, index, total);
    pickup.collectibleAt = this.time.now + 820;
    this.animateBossLootLaunch(pickup.sprite, landing.x, landing.y, index);
  }

  private animateBossLootLaunch(
    sprite: Phaser.GameObjects.Container,
    landingX: number,
    landingY: number,
    index: number,
    onLanded?: () => void
  ): void {
    this.bossLootLaunchesPending += 1;
    const delay = Math.min(360, index * 34);
    const startX = sprite.x;
    const startY = sprite.y;
    const midpointX = Phaser.Math.Linear(startX, landingX, 0.48);
    const midpointY = Math.min(startY, landingY) - 82 - (index % 3) * 16;
    this.tweens.add({
      targets: sprite,
      x: midpointX,
      y: midpointY,
      delay,
      duration: 310,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: sprite,
          x: landingX,
          y: landingY,
          duration: 390,
          ease: 'Bounce.easeOut',
          onComplete: () => {
            onLanded?.();
            this.bossLootLaunchesPending = Math.max(0, this.bossLootLaunchesPending - 1);
            if (this.bossLootLaunchesPending === 0) this.showBossNextFightButton();
          }
        });
      }
    });
  }

  private findBossLootLanding(originX: number, originY: number, index: number, total: number): { x: number; y: number } {
    const bounds = this.layout.generation.bounds;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const angle = (index / Math.max(1, total)) * Math.PI * 2 + attempt * 0.71;
      const distance = 135 + (index % 4) * 43 + attempt * 8;
      const x = Phaser.Math.Clamp(originX + Math.cos(angle) * distance, bounds.x + 54, bounds.x + bounds.w - 54);
      const y = Phaser.Math.Clamp(originY + Math.sin(angle) * distance, bounds.y + 54, bounds.y + bounds.h - 54);
      if (!this.hitWall(x, y)) return { x, y };
    }
    return { x: Phaser.Math.Clamp(originX, bounds.x + 70, bounds.x + bounds.w - 70), y: Phaser.Math.Clamp(originY + 150, bounds.y + 70, bounds.y + bounds.h - 70) };
  }

  private showBossNextFightButton(): void {
    if (this.bossFlowPhase !== 'loot-collection' || this.bossNextFightButton) return;
    this.setMenuCursorMode();
    this.pointerLock?.hidePrompt();
    this.pointerLock?.release();
    this.bossNextFightButton = new ArenaCommandButton(this, 'NEXT FIGHT', () => {
      this.finishBossCollection();
    });
    this.bossNextFightButton.setGamePosition(this.scale.width * 0.5, this.scale.height - 58, 270, 46);
  }

  private finishBossCollection(): void {
    if (!this.pendingRoundPayload || !this.bossEncounter
      || !this.transitionBossFlow('loot-collection', 'transitioning')) return;
    this.bossNextFightButton?.destroy();
    this.bossNextFightButton = null;
    this.state.set(RoundState.Victory);
    this.physics.pause();
    this.clearGameplayInput();
    this.pendingProgressEnemyKills += 1;
    this.flushPendingCombatProgress();

    const collectedCredits = this.roundCredits;
    const collectedTokens = this.roundCoreTokens;
    const collectedPlasma = this.roundPlasmaChips;
    const collectedFluxCores = this.roundFluxCores;
    SaveSystem.addCredits(collectedCredits);
    SaveSystem.addCoreTokens(collectedTokens);
    SaveSystem.addPlasmaChips(collectedPlasma);
    SaveSystem.addFluxCores(collectedFluxCores);
    this.runCreditsEarned += collectedCredits;
    this.captureTelemetryEndState();
    GameplayTelemetryRecorder.endEncounter('bossDefeated', {
      credits: collectedCredits,
      coreTokens: collectedTokens,
      plasmaChips: collectedPlasma,
      fluxCores: collectedFluxCores
    });

    const payload: RoundFinishedPayload = {
      ...this.pendingRoundPayload,
      creditsGained: this.pendingRoundPayload.creditsGained + collectedCredits,
      coreTokensGained: this.pendingRoundPayload.coreTokensGained + collectedTokens,
      plasmaChipsGained: this.pendingRoundPayload.plasmaChipsGained + collectedPlasma,
      fluxCoresGained: (this.pendingRoundPayload.fluxCoresGained ?? 0) + collectedFluxCores,
      bossDefeated: this.bossEncounter.archetype,
      modsEarned: [...this.modsEarned],
      runCreditsEarned: this.runCreditsEarned
    };
    this.pendingRoundPayload = payload;
    const supremeBridge = isRegularOverdriveTerminalCompletion(payload.protocol, payload.completedRound)
      ? this.tryAwardSupremeBridge(payload.completedRound)
      : { firstSupremeAwarded: false, modId: null };
    this.transitionAfterModReveals(350, () => {
      this.presentCompletedRound(payload, supremeBridge);
    });
  }

  private transitionBossFlow(expected: BossFlowPhase, next: BossFlowPhase): boolean {
    if (this.bossFlowPhase !== expected) return false;
    this.bossFlowPhase = next;
    return true;
  }

  private triggerDefeat(reason: 'playerDead' | 'bombDefused'): void {
    if (this.state.state === RoundState.Defeat) return;
    this.arcadeController?.stop(reason === 'playerDead' ? 'player-dead' : 'round-ended');
    this.anomalyController?.stop('round-ended');
    this.clearRoundInfusionEffects();
    this.bombExplosionCosmeticVfx.reset();
    if (reason === 'playerDead') {
      this.audio.playSfx('playerDeath');
      this.createDeathExplosion(this.player.x, this.player.y, SaveSystem.getOperativeFrameAppearance(this.time.now).primaryColor, true);
      this.player.setVisible(false);
    }
    this.boostVisual.reset();
    this.state.set(RoundState.Defeat);
    this.audio.stopLowHealthWarning();
    this.audio.stopDisarmLoop();
    this.laserSecurity?.silence();
    this.audio.stopFluxCoreLoop();
    this.bombsiteMods?.destroy();
    this.physics.pause();
    this.flushPendingCombatProgress();

    const currentCombatRound = this.currentCombatRound();
    const result: ArenaReward = {
      credits: this.roundCredits,
      runCreditsEarned: this.runCreditsEarned + this.roundCredits,
      coreTokens: this.roundCoreTokens,
      plasmaChips: this.roundPlasmaChips,
      fluxCores: this.roundFluxCores,
      reason,
      round: currentCombatRound,
      seed: this.layout.seed,
      protocol: this.protocol,
      equippedMods: this.modRuntime.snapshot(),
      modsEarned: [...this.modsEarned],
      runDurationMs: Date.now() - this.runStartedAt,
      highestRound: currentCombatRound,
      modFocus: this.modFocus,
      contract: this.contract,
      creditsSpentBeforeRun: this.creditsSpentBeforeRun,
      upgradeCompletionPercentage: this.upgradeCompletionPercentage,
      accountProgressionTier: this.accountProgressionTier
    };

    SaveSystem.addCredits(result.credits);
    SaveSystem.addCoreTokens(result.coreTokens);
    SaveSystem.addPlasmaChips(result.plasmaChips);
    SaveSystem.addFluxCores(result.fluxCores);
    this.captureTelemetryEndState();
    GameplayTelemetryRecorder.endEncounter(reason, {
      credits: result.credits,
      coreTokens: result.coreTokens,
      plasmaChips: result.plasmaChips,
      fluxCores: result.fluxCores
    });
    GameplayTelemetryRecorder.finishRun(reason);
    OnlineRunManager.complete(reason === 'playerDead' ? 'player_dead' : 'bomb_defused', currentCombatRound);
    this.registry.remove('arena-session');

    this.transitionAfterModReveals(700, () => {
      this.registry.set('result', result);
      this.scene.start(SceneKeys.Results);
    });
  }

  private transitionAfterModReveals(fallbackDelayMs: number, callback: () => void): void {
    if (!this.modAcquisitionPresenter?.isBusy()) {
      this.time.delayedCall(fallbackDelayMs, callback);
      return;
    }
    this.modAcquisitionPresenter.whenIdle(() => {
      if (!this.scene.isActive()) return;
      this.time.delayedCall(150, callback);
    });
  }

  private refreshHudWallet(wallet = SaveSystem.get()): void {
    this.hudWalletCredits = wallet.credits;
    this.hudWalletCoreTokens = wallet.coreTokens;
    this.hudWalletPlasmaChips = SaveSystem.getModCollection().plasmaChips;
    this.hudWalletFluxCores = wallet.fluxCores;
  }

  private refreshHudBuffs(now: number): void {
    this.hudBuffs.length = 0;
    this.appendHudBuff('DAMAGE+', this.player.buffs.damageBoostUntil, now);
    const speedStacks = now < this.player.buffs.speedBoostUntil ? Math.max(1, this.player.buffs.speedBoostStacks) : 0;
    const fireRateStacks = now < this.player.buffs.rapidFireUntil ? Math.max(1, this.player.buffs.rapidFireStacks) : 0;
    this.appendHudBuff(`SPEED x${speedStacks}`, this.player.buffs.speedBoostUntil, now);
    this.appendHudBuff(`RAPID FIRE x${fireRateStacks}`, this.player.buffs.rapidFireUntil, now);
    this.appendHudBuff('RICOCHET', this.player.buffs.ricochetUntil, now);
    const ammoMode = this.temporaryAmmo.activeSpecialMode(now);
    if (ammoMode) {
      this.appendHudBuff(
        ammoMode === 'grenade' ? 'GRENADE ROUNDS' : 'SCATTERSHOT',
        this.temporaryAmmo.activeUntil(now),
        now
      );
    }
  }

  private appendHudBuff(label: string, until: number, now: number): void {
    const seconds = Math.max(0, (until - now) / 1000);
    if (seconds <= 0) return;
    const shown = seconds < 1 ? seconds.toFixed(1) : `${Math.ceil(seconds)}`;
    this.hudBuffs.push(`${label} ${shown}s`);
  }

  private updateHud(now: number): void {
    if (this.bossEncounter || this.supremeFinale) {
      this.updateBossHud(now);
      return;
    }
    const activeSites = this.bombSites.getActiveBombSites();
    let defusingCount = 0;
    let defusingFocus: BombSiteRuntime | null = null;
    let activeFocus: BombSiteRuntime | null = null;
    for (const site of activeSites) {
      if (!activeFocus || site.timerMs < activeFocus.timerMs) activeFocus = site;
      if (site.state !== BombSiteState.BeingDefused) continue;
      defusingCount += 1;
      if (!defusingFocus || site.timerMs < defusingFocus.timerMs) defusingFocus = site;
    }
    const hudFocus = defusingFocus ?? activeFocus;
    let targetSite: BombSiteRuntime | null = null;
    let targetDistanceSquared = Number.POSITIVE_INFINITY;
    for (const site of this.bombSites.sites) {
      if (site.state !== BombSiteState.Available && site.state !== BombSiteState.Planting) continue;
      const dx = site.x - this.player.x;
      const dy = site.y - this.player.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < targetDistanceSquared) {
        targetSite = site;
        targetDistanceSquared = distanceSquared;
      }
    }
    const activeSummary = activeSites.length > 1 ? ` • ${activeSites.length} ACTIVE` : '';
    const objectiveBase = hudFocus
      ? defusingCount > 0
        ? `SITE ${hudFocus.letter} — DEFUSE${activeSummary}`
        : `SITE ${hudFocus.letter} — DEFEND${activeSummary}`
      : targetSite
        ? `SITE ${targetSite.letter} ${targetSite.state === BombSiteState.Planting ? '— PLANTING' : 'AVAILABLE'}`
        : this.state.state === RoundState.Victory ? 'ALL SITES SECURED' : 'OBJECTIVE COMPLETE';
    const countermeasures = this.bombsiteMods.countermeasureCharges(hudFocus);
    const objectiveText = countermeasures === null
      ? objectiveBase
      : `${objectiveBase} // COUNTERMEASURES ${countermeasures}`;

    this.refreshHudBuffs(now);

    const fenceCfg = this.getAbilityConfig('fence');
    const turretCfg = this.getAbilityConfig('turret');
    const mineCfg = this.getAbilityConfig('mine');

    const fenceCdMs = Math.max(0, this.abilityCooldownUntil.fence - now);
    const turretCdMs = Math.max(0, this.abilityCooldownUntil.turret - now);
    const shieldCdMs = Math.max(0, this.shieldCooldownUntil - now);

    this.hudPayload.hp = this.player.hp;
    this.hudPayload.maxHp = this.player.stats.maxHealth;
    this.hudPayload.energy = this.player.energy;
    this.hudPayload.maxEnergy = this.player.energyStats.max;
    this.hudPayload.level = this.roundManager.round;
    this.hudPayload.enemies = this.enemies.length + (this.arcadeController?.getBossTarget() ? 1 : 0);
    this.hudPayload.credits = this.hudWalletCredits + this.roundCredits;
    this.hudPayload.coreTokens = this.hudWalletCoreTokens + this.roundCoreTokens;
    this.hudPayload.plasmaChips = this.hudWalletPlasmaChips + this.roundPlasmaChips;
    this.hudPayload.fluxCores = this.hudWalletFluxCores + this.roundFluxCores;
    this.hudPayload.phase = ROUND_PHASE_LABELS[this.state.state];
    this.hudPayload.objective = objectiveText;
    this.hudPayload.objectiveTimerMs = hudFocus?.timerMs ?? null;
    this.hudPayload.defuseAlert = defusingCount > 0;
    this.hudPayload.bombUrgent = Boolean(hudFocus && hudFocus.timerMs <= 15_000);
    this.hudPayload.bombActive = Boolean(hudFocus);
    this.hudPayload.bombProgress = hudFocus
      ? Phaser.Math.Clamp(1 - hudFocus.timerMs / this.getBombDefenseDurationMs(), 0, 1)
      : 0;
    this.refreshHudRadarContacts();

    const [fenceSlot, turretSlot, mineSlot, shieldSlot] = this.hudPayload.abilities;
    fenceSlot.cooldownMs = fenceCdMs;
    fenceSlot.cooldownDurationMs = fenceCfg.cooldownMs;
    fenceSlot.selected = this.selectedAbility === 'fence';
    fenceSlot.hasEnergy = this.player.energy >= fenceCfg.energyCost;
    fenceSlot.underLimit = this.fences.length < fenceCfg.maxActive;
    fenceSlot.count = this.fences.length;
    fenceSlot.capacity = fenceCfg.maxActive;

    turretSlot.cooldownMs = turretCdMs;
    turretSlot.cooldownDurationMs = turretCfg.cooldownMs;
    turretSlot.selected = this.selectedAbility === 'turret';
    turretSlot.hasEnergy = this.player.energy >= turretCfg.energyCost;
    turretSlot.underLimit = this.turrets.length < turretCfg.maxActive;
    turretSlot.count = this.turrets.length;
    turretSlot.capacity = turretCfg.maxActive;

    this.updateMineHudSlot(mineSlot, now, mineCfg);

    shieldSlot.cooldownMs = now < this.shieldActiveUntil ? this.shieldActiveUntil - now : shieldCdMs;
    shieldSlot.cooldownDurationMs = now < this.shieldActiveUntil
      ? this.getShieldDurationMs()
      : this.getShieldCooldownMs();
    shieldSlot.active = now < this.shieldActiveUntil;
    shieldSlot.hasEnergy = this.player.energy >= this.getShieldEnergyCost();
    shieldSlot.count = shieldSlot.active ? 1 : 0;
    shieldSlot.capacity = null;

    this.hud.update(this.hudPayload);
  }

  private updateBossHud(now: number): void {
    const encounter = this.bossEncounter;
    const finale = this.supremeFinale;
    if (!encounter && !finale) return;
    this.refreshHudBuffs(now);

    const fenceCfg = this.getAbilityConfig('fence');
    const turretCfg = this.getAbilityConfig('turret');
    const mineCfg = this.getAbilityConfig('mine');
    this.hudPayload.hp = this.player.hp;
    this.hudPayload.maxHp = this.player.stats.maxHealth;
    this.hudPayload.energy = this.player.energy;
    this.hudPayload.maxEnergy = this.player.energyStats.max;
    this.hudPayload.level = this.bossRound;
    this.hudPayload.enemies = finale?.remaining ?? (encounter!.boss.isDefeated ? 0 : 1);
    this.hudPayload.credits = this.hudWalletCredits + this.roundCredits;
    this.hudPayload.coreTokens = this.hudWalletCoreTokens + this.roundCoreTokens;
    this.hudPayload.plasmaChips = this.hudWalletPlasmaChips + this.roundPlasmaChips;
    this.hudPayload.fluxCores = this.hudWalletFluxCores + this.roundFluxCores;
    this.hudPayload.phase = this.bossFlowPhase === 'loot-collection'
      ? 'COLLECTION'
      : this.state.state === RoundState.Paused ? 'PAUSED' : 'BOSS FIGHT';
    this.hudPayload.objective = finale
      ? `TERMINAL OVERRIDE // DESTROY ALL THREE // ${finale.remaining} REMAIN`
      : this.bossFlowPhase === 'loot-collection'
      ? 'COLLECT BOSS REWARDS // NEXT FIGHT WHEN READY'
      : `ELIMINATE ${BOSS_ARCHETYPES[encounter!.archetype].label}`;
    this.hudPayload.objectiveTimerMs = null;
    this.hudPayload.defuseAlert = false;
    this.hudPayload.bombUrgent = false;
    this.hudPayload.bombActive = false;
    this.hudPayload.bombProgress = 0;
    this.refreshHudRadarContacts();

    const [fenceSlot, turretSlot, mineSlot, shieldSlot] = this.hudPayload.abilities;
    fenceSlot.cooldownMs = Math.max(0, this.abilityCooldownUntil.fence - now);
    fenceSlot.cooldownDurationMs = fenceCfg.cooldownMs;
    fenceSlot.selected = this.selectedAbility === 'fence';
    fenceSlot.hasEnergy = this.player.energy >= fenceCfg.energyCost;
    fenceSlot.underLimit = this.fences.length < fenceCfg.maxActive;
    fenceSlot.count = this.fences.length;
    fenceSlot.capacity = fenceCfg.maxActive;
    turretSlot.cooldownMs = Math.max(0, this.abilityCooldownUntil.turret - now);
    turretSlot.cooldownDurationMs = turretCfg.cooldownMs;
    turretSlot.selected = this.selectedAbility === 'turret';
    turretSlot.hasEnergy = this.player.energy >= turretCfg.energyCost;
    turretSlot.underLimit = this.turrets.length < turretCfg.maxActive;
    turretSlot.count = this.turrets.length;
    turretSlot.capacity = turretCfg.maxActive;
    this.updateMineHudSlot(mineSlot, now, mineCfg);
    shieldSlot.cooldownMs = now < this.shieldActiveUntil
      ? this.shieldActiveUntil - now
      : Math.max(0, this.shieldCooldownUntil - now);
    shieldSlot.cooldownDurationMs = now < this.shieldActiveUntil
      ? this.getShieldDurationMs()
      : this.getShieldCooldownMs();
    shieldSlot.active = now < this.shieldActiveUntil;
    shieldSlot.hasEnergy = this.player.energy >= this.getShieldEnergyCost();
    shieldSlot.count = shieldSlot.active ? 1 : 0;
    shieldSlot.capacity = null;
    this.hud.update(this.hudPayload);
  }

  private updateMineHudSlot(slot: HudAbilitySlot, now: number, cfg: AbilityRuntimeConfig): void {
    slot.cooldownDurationMs = cfg.cooldownMs;
    slot.selected = this.selectedAbility === 'mine';
    slot.hasEnergy = this.player.energy >= cfg.energyCost;

    const rack = this.mineChargeRack.snapshot(now, cfg.cooldownMs);
    slot.cooldownMs = rack.nextChargeRemainingMs;
    slot.cooldownDurationMs = rack.rechargeDurationMs;
    slot.recharging = rack.currentCharges < rack.maxCharges;
    slot.underLimit = rack.currentCharges > 0;
    slot.count = rack.currentCharges;
    slot.capacity = rack.maxCharges;
  }

  private refreshHudRadarContacts(): void {
    this.hudRadarContactCount = 0;
    const playerX = this.player.x;
    const playerY = this.player.y;

    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.isDead()) continue;
      this.appendHudRadarContact('enemy', 'normal', enemy.x - playerX, enemy.y - playerY);
    }

    for (const bossTarget of this.activeMajorBosses()) {
      this.appendHudRadarContact('boss', 'normal', bossTarget.x - playerX, bossTarget.y - playerY);
    }
    if (!this.bossEncounter && !this.supremeFinale && this.bombSites) {
      for (const site of this.bombSites.sites) {
        if (site.state === BombSiteState.Destroyed || site.state === BombSiteState.Detonated) continue;
        const state = site.state === BombSiteState.BeingDefused ? 'defusing'
          : site.state === BombSiteState.Armed ? 'active'
            : site.state === BombSiteState.Available || site.state === BombSiteState.Planting ? 'available'
              : 'locked';
        this.appendHudRadarContact('objective', state, site.x - playerX, site.y - playerY);
      }
    }
    this.hudRadarContacts.length = this.hudRadarContactCount;

    const bounds = this.layout.generation.bounds;
    this.hudPayload.radarRange = Math.max(600, Math.min(bounds.w, bounds.h) * 0.42);
  }

  private appendHudRadarContact(
    kind: HudRadarContact['kind'],
    state: HudRadarContact['state'],
    dx: number,
    dy: number
  ): void {
    const index = this.hudRadarContactCount;
    const contact = this.hudRadarContactPool[index] ?? { kind, state, dx, dy };
    contact.kind = kind;
    contact.state = state;
    contact.dx = dx;
    contact.dy = dy;
    if (!this.hudRadarContactPool[index]) this.hudRadarContactPool[index] = contact;
    this.hudRadarContacts[index] = contact;
    this.hudRadarContactCount += 1;
  }

  private currentCombatRound(): number {
    return this.bossEncounter || this.supremeFinale ? this.bossRound : this.roundManager.round;
  }

  private captureTelemetryEndState(): void {
    const activePickups: Partial<Record<PickupType, number>> = {};
    for (const pickup of this.pickups) {
      activePickups[pickup.type] = (activePickups[pickup.type] ?? 0) + 1;
    }
    GameplayTelemetryRecorder.recordEncounterEndState({
      playerHealth: this.player.hp,
      playerEnergy: this.player.energy,
      activePickups
    });
  }

  private getHazardDamageTargets(): HazardDamageTarget[] {
    this.hazardDamageTargets.length = 0;
    for (const enemy of this.enemies) this.hazardDamageTargets.push(enemy);
    for (const bossTarget of this.activeMajorBosses()) this.hazardDamageTargets.push(bossTarget);
    return this.hazardDamageTargets;
  }

  private ensurePerformanceTelemetry(): Phaser.GameObjects.Text {
    if (!this.performanceTelemetry) {
      this.performanceTelemetry = this.add.text(12, 112, '', {
        fontFamily: 'monospace', fontSize: '13px', color: '#9ffcff',
        backgroundColor: '#020711dd', padding: { x: 8, y: 6 }
      }).setScrollFactor(0).setDepth(5000).setVisible(false);
    }
    return this.performanceTelemetry;
  }

  /** DEV-only Round 30 workload; never registered as a production menu path. */
  private activateDevPerformanceStressScenario(): void {
    if (!import.meta.env.DEV) return;

    this.roundManager = new RoundManager(this.roundManager.seedBase, this.roundManager.mode, 30);
    this.createRoundFromDefinition(this.roundManager.currentDefinition());
    const now = this.time.now;
    const site = this.bombSites.sites.find((candidate) => candidate.state === BombSiteState.Available);
    if (site) this.bombSites.armSite(site, this.getBombDefenseDurationMs(), now);

    const stressEnemyTypes: EnemyType[] = ['grunt', 'shooter', 'grunt', 'defuser', 'tank', 'disruptor', 'star'];
    const pressure = getConcurrentSpawnPressure(getSpawnProfile(30, 0), site ? 1 : 0);
    for (let index = 0; index < pressure.activeCountCap; index += 1) {
      this.spawnEnemy(stressEnemyTypes[index % stressEnemyTypes.length], Boolean(site));
    }

    const fenceCfg = this.getAbilityConfig('fence');
    const bounds = this.layout.generation.bounds;
    for (const xOffset of [55, 110]) {
      const x = Phaser.Math.Clamp(this.player.x + xOffset, bounds.x + 50, bounds.x + bounds.w - 50);
      this.fences.push(new Fence(
        this, x, this.player.y, Math.PI / 2,
        SaveSystem.getCosmeticColor('fenceStyle', now), ABILITY_BALANCE.fence.width,
        fenceCfg.durationMs, fenceCfg.hp, fenceCfg.damage, ABILITY_BALANCE.fence.slowFactor
      ));
    }

    const turretCfg = this.getAbilityConfig('turret');
    for (let index = 0; index < 3; index += 1) {
      const angle = index / 3 * Math.PI * 2;
      const equippedTurretSkin = getCosmeticById(SaveSystem.getEquippedCosmeticId('turretSkin'));
      const turret = new Turret(
        this,
        this.player.x + Math.cos(angle) * 72,
        this.player.y + Math.sin(angle) * 72,
        SaveSystem.getCosmeticColor('turretSkin', now),
        turretCfg.hp, turretCfg.damage, turretCfg.fireRate, turretCfg.range,
        equippedTurretSkin?.turretSkinEffect, equippedTurretSkin?.accentColor
      );
      turret.telemetryId = `turret-${++this.turretTelemetrySequence}`;
      this.turrets.push(turret);
      GameplayTelemetryRecorder.recordTurretPlaced(turret.telemetryId, {
        maximumHealth: turretCfg.hp,
        damage: turretCfg.damage,
        fireRate: turretCfg.fireRate,
        range: turretCfg.range
      });
    }

    const mineCfg = this.getAbilityConfig('mine');
    for (let index = 0; index < 4; index += 1) {
      const angle = index / 4 * Math.PI * 2 + Math.PI / 4;
      this.mines.push(new Mine(
        this,
        this.player.x + Math.cos(angle) * 115,
        this.player.y + Math.sin(angle) * 115,
        COLORS.orange,
        mineCfg.armMs,
        mineCfg.damage,
        mineCfg.radius
      ));
    }

    for (let index = 0; index < 18; index += 1) {
      const angle = index / 18 * Math.PI * 2;
      this.dropPickup(this.player.x + Math.cos(angle) * 165, this.player.y + Math.sin(angle) * 165);
    }

    const projectileColor = SaveSystem.getCosmeticColor('projectileColor', now);
    const trailColor = SaveSystem.getCosmeticColor('trailColor', now);
    for (let index = 0; index < 180; index += 1) {
      const y = this.player.y - 38 + index % 19 * 4;
      this.projectiles.push(this.obtainProjectile({
        x: this.player.x, y, texture: this.projectileTextureKey,
        width: this.projectileWidth, height: this.projectileHeight,
        tint: projectileColor, rotation: 0, velocityX: this.player.weapon.projectileSpeed, velocityY: 0, depth: 8,
        damage: this.player.weapon.damage, from: 'player', lifeMs: 950, trailColor,
        splitCurrentEligible: true, previousX: this.player.x, previousY: y,
        telemetryOwner: 'weapon', critical: false
      }));
      GameplayTelemetryRecorder.recordProjectileFired('weapon');
    }

    const enemyDamage = this.enemies.find((enemy) => enemy.stats.type === 'shooter')?.stats.damage
      ?? baseEnemyStats.shooter.damage;
    for (let index = 0; index < 240; index += 1) {
      const angle = index / 240 * Math.PI * 2;
      const x = this.player.x + Math.cos(angle) * 330;
      const y = this.player.y + Math.sin(angle) * 330;
      const inwardAngle = angle + Math.PI;
      this.projectiles.push(this.obtainProjectile({
        x, y, texture: 'circle', width: 7, height: 7, tint: COLORS.orange,
        rotation: inwardAngle, velocityX: Math.cos(inwardAngle) * 420, velocityY: Math.sin(inwardAngle) * 420, depth: 7,
        damage: enemyDamage, from: 'enemy', lifeMs: 1400, trailColor: COLORS.orange, telemetryOwner: 'enemy'
      }));
      GameplayTelemetryRecorder.recordProjectileFired('enemy');
    }

    this.player.buffs.damageBoostUntil = now + 120_000;
    this.player.buffs.speedBoostUntil = now + 120_000;
    this.player.buffs.rapidFireUntil = now + 120_000;
    this.player.buffs.speedBoostStacks = this.isOverdriveProtocol() ? 2 : 1;
    this.player.buffs.rapidFireStacks = this.isOverdriveProtocol() ? 2 : 1;
    this.player.invulnUntil = now + 120_000;
    this.ensurePerformanceTelemetry().setVisible(true);
    this.nextPerformanceTelemetryAt = 0;
    this.showBanner('DEV PERFORMANCE STRESS // ROUND 30\nF5 RESET  â€¢  F6 METRICS');
  }

  private updatePerformanceTelemetry(now: number): void {
    if (!import.meta.env.DEV || !this.performanceTelemetry?.visible || now < this.nextPerformanceTelemetryAt) return;
    this.nextPerformanceTelemetryAt = now + 500;
    const frames = this.performanceMonitor.snapshot();
    const projectiles = this.projectilePool.stats();
    const fx = this.fxCirclePool.stats();
    const trails = this.projectileTrails?.stats();
    this.performanceTelemetry.setText(
      `PERF DEV (F6)  avg ${frames.averageMs.toFixed(1)}ms  p95 ${frames.p95Ms.toFixed(1)}ms  max ${frames.maximumMs.toFixed(1)}ms\n`
      + `>33ms ${frames.framesOver33Ms}/${frames.samples}  >50ms ${frames.framesOver50Ms}/${frames.samples}\n`
      + `Enemies ${this.enemies.length}  Projectiles ${this.projectiles.length}  Missiles ${this.homingMissiles.length}\n`
      + `Projectile pool new ${projectiles.created} reuse ${projectiles.reused} free ${projectiles.available}\n`
      + `FX pool new ${fx.created} reuse ${fx.reused} active ${fx.active} free ${fx.available}\n`
      + `Trail samples ${trails?.active ?? 0}/${trails?.retained ?? 0} peak ${trails?.peak ?? 0}  Display ${this.children.list.length}\n`
      + `Physics colliders ${this.physics.world.colliders.getActive().length}  Tweens ${this.tweens.getTweens().length}`
    );
  }

  private maintainCombatPools(now: number): void {
    if (now < this.nextPoolMaintenanceAt || !this.projectilePool || !this.fxCirclePool) return;
    this.nextPoolMaintenanceAt = now + 2000;

    const projectiles = this.projectilePool.stats();
    if (projectiles.active < 512 && projectiles.available > 1536) {
      this.projectilePool.trimAvailable(1024, (projectile) => this.destroyPooledProjectile(projectile), 128);
    }

    const fx = this.fxCirclePool.stats();
    if (fx.active < 128 && fx.available > 1024) {
      this.fxCirclePool.trimAvailable(512, (circle) => circle.destroy(), 128);
    }
  }

  private updateBalanceTelemetry(): void {
    if (!this.balanceTelemetry?.visible) return;
    const round = this.roundManager.round;
    const destroyed = this.bombSites.destroyedCount();
    const spawn = getSpawnProfile(round, destroyed);
    const curve = getDifficultyCurve(round, destroyed);
    const activeWeight = this.enemies.reduce((sum, enemy) => sum + ENEMY_BALANCE[enemy.stats.type].weight, 0);
    const totalHp = this.enemies.reduce((sum, enemy) => sum + enemy.hp, 0);
    this.balanceTelemetry.setText(
      `BALANCE DEV (F8)  R${round}  Sites ${destroyed}/${this.bombSites.sites.length}\n`
      + `Enemies ${this.enemies.length}/${spawn.activeCountCap}  Weight ${activeWeight.toFixed(1)}/${spawn.activeWeightCap.toFixed(1)}  HP ${Math.round(totalHp)}\n`
      + `HPx ${curve.healthMultiplier.toFixed(2)}  DMGx ${curve.damageMultiplier.toFixed(2)}  Cadence ${spawn.defenseCadenceMs}ms\n`
      + `ARENA (F7 regenerate) ${this.layout.template} ${this.layout.generation.bounds.w}x${this.layout.generation.bounds.h} attempt ${this.layout.generation.attempt} similarity ${this.layout.generation.similarityScore.toFixed(3)} open ${this.layout.generation.openSpacePercentage}%`
    );
  }

  private updateCrosshair(): void {
    const { x, y } = this.getAimWorldPoint();
    const valid = this.isValidPlacement(x, y);
    this.crosshair.setPosition(x, y);
    if (this.crosshairValid === valid) return;
    this.crosshairValid = valid;
    drawReticle(this.crosshair, 0, 0, this.aimSettings.reticle, valid ? undefined : COLORS.red);
  }

  private applyBombsiteCooldownAcceleration(deltaMs: number): void {
    const x = this.player.x;
    const y = this.player.y;
    const defenseBonus = this.bombsiteMods.cooldownAccelerationBonus(x, y, 'defense');
    if (defenseBonus > 0) {
      this.abilityCooldownUntil.fence -= deltaMs * defenseBonus;
      this.abilityCooldownUntil.turret -= deltaMs * defenseBonus;
    }
    const mineBonus = this.bombsiteMods.cooldownAccelerationBonus(x, y, 'mine');
    if (mineBonus > 0) this.mineChargeRack.accelerateRechargeBy(deltaMs * mineBonus);
    const shieldBonus = this.bombsiteMods.cooldownAccelerationBonus(x, y, 'shield');
    if (shieldBonus > 0) this.shieldCooldownUntil -= deltaMs * shieldBonus;
  }

  private getAbilityConfig(type: AbilityType): AbilityRuntimeConfig {
    return resolveAbilityRuntimeConfig(type, this.runUpgrades, this.modRuntime);
  }

  private getShieldDurationMs(): number {
    return resolveShieldRuntime(this.runUpgrades, this.modRuntime).durationMs;
  }

  private getShieldCooldownMs(): number {
    return resolveShieldRuntime(this.runUpgrades, this.modRuntime).cooldownMs;
  }

  private getShieldEnergyCost(): number {
    return resolveShieldRuntime(this.runUpgrades, this.modRuntime).energyCost;
  }

  private getBombDefenseDurationMs(): number {
    return OBJECTIVE_CONFIG.bombDefenseMs * this.modRuntime.multiplier('bombDuration');
  }

  private scaleModCredits(baseCredits: number): number {
    return Math.max(0, Math.round(baseCredits * this.modRuntime.multiplier('creditValue')));
  }

  private hitWall(x: number, y: number): boolean {
    for (const wall of this.wallRects) {
      if (x >= wall.x && x <= wall.x + wall.w && y >= wall.y && y <= wall.y + wall.h) return true;
    }
    return false;
  }

  private intersectsWallGeometry(x: number, y: number, halfWidth: number, halfHeight: number): boolean {
    for (const wall of this.wallRects) {
      if (
        x + halfWidth >= wall.x
        && x - halfWidth <= wall.x + wall.w
        && y + halfHeight >= wall.y
        && y - halfHeight <= wall.y + wall.h
      ) return true;
    }
    return false;
  }

  private intersectsBombSiteGeometry(x: number, y: number, halfWidth: number, halfHeight: number): boolean {
    const exclusionRadiusSquared = FLUX_CORE_BALANCE.bombSiteExclusionRadius
      * FLUX_CORE_BALANCE.bombSiteExclusionRadius;
    for (const site of this.bombSites.sites) {
      // Test the site circle against the Flux Core's full rectangular footprint,
      // rather than only checking its center point near the objective ring.
      const closestX = Phaser.Math.Clamp(site.x, x - halfWidth, x + halfWidth);
      const closestY = Phaser.Math.Clamp(site.y, y - halfHeight, y + halfHeight);
      const dx = site.x - closestX;
      const dy = site.y - closestY;
      if (dx * dx + dy * dy <= exclusionRadiusSquared) return true;
    }
    return false;
  }

  private isValidPlacement(x: number, y: number): boolean {
    const bounds=this.layout.generation.bounds;
    if (x < bounds.x+40 || y < bounds.y+40 || x > bounds.x+bounds.w-40 || y > bounds.y+bounds.h-40) return false;
    if (this.hitWall(x, y)) return false;
    for (const s of this.bombSites.sites) {
      if (Phaser.Math.Distance.Between(x, y, s.x, s.y) < 86) return false;
    }
    return true;
  }

  private findProjectileHitEnemy(x: number, y: number): Enemy | null {
    for (const enemy of this.enemies) {
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const radius = enemy.stats.size * 0.5 + 5;
      if (dx * dx + dy * dy < radius * radius) return enemy;
    }
    return null;
  }

  private findSpecialAmmoHitEnemy(x: number, y: number): Enemy | null {
    this.specialAmmoHitX = x;
    this.specialAmmoHitY = y;
    this.specialAmmoHitDistanceSquared = Number.POSITIVE_INFINITY;
    this.specialAmmoHitCandidate = null;
    this.enemySeparationGrid.forEachNearby(x, y, SPECIAL_AMMO_HIT_QUERY_RADIUS, this.findSpecialAmmoHitNeighbor);
    return this.specialAmmoHitCandidate;
  }

  private findGrenadeProximityEnemy(x: number, y: number): Enemy | null {
    const radius = TEMPORARY_AMMO_BALANCE.grenade.proximityFuseRadius;
    this.grenadeFuseQueryX = x;
    this.grenadeFuseQueryY = y;
    this.grenadeFuseQueryCandidate = null;
    this.grenadeFuseQueryCandidateDistanceSquared = Number.POSITIVE_INFINITY;
    this.enemySeparationGrid.forEachNearby(x, y, radius, this.findGrenadeFuseNeighbor);
    return this.grenadeFuseQueryCandidate;
  }

  private getNearestEnemy(x: number, y: number, range: number): Enemy | null {
    const priorityRank = this.modRuntime.has('priority-targeting') ? this.modRuntime.rank('priority-targeting') : -1;
    const rangeSquared = range * range;
    const now = this.time.now;
    let selected: Enemy | null = null;
    let selectedDistanceSquared = Number.POSITIVE_INFINITY;
    let selectedPriority = false;
    let selectedIndex = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.enemies.length; index += 1) {
      const enemy = this.enemies[index];
      if (enemy.isDead()) continue;
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= rangeSquared) continue;
      const priority = priorityRank >= 0 && (this.defuseAssignees.has(enemy)
        || (priorityRank >= 2 && now < (this.defuserMarkedUntil.get(enemy) ?? 0)));
      if (shouldReplaceTurretTarget(
        priority, distanceSquared, index, selected !== null,
        selectedPriority, selectedDistanceSquared, selectedIndex
      )) {
        selected = enemy;
        selectedDistanceSquared = distanceSquared;
        selectedPriority = priority;
        selectedIndex = index;
      }
    }
    return selected;
  }

  private getBlockers(): RectSpec[] {
    return [...this.wallRects];
  }

  private distancePointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const clamped = Phaser.Math.Clamp(t, 0, 1);
    const cx = x1 + clamped * dx;
    const cy = y1 + clamped * dy;
    return Math.hypot(px - cx, py - cy);
  }

  private togglePause(): void {
    if (this.bossFlowPhase === 'intro' || this.bossFlowPhase === 'destruction' || this.bossFlowPhase === 'transitioning') return;
    if (this.state.state === RoundState.Paused) {
      this.resumeGameplay();
      return;
    }

    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();
    this.laserSecurity?.silence();
    this.audio.stopFluxCoreLoop();

    this.state.set(RoundState.Paused);
    this.physics.pause();
    this.clearGameplayInput();
    this.pointerLock?.release();
    this.showPauseMenu();
  }

  private handleSystemInput(): void {
    if (this.pointerLockInitialGate
      && this.playerInput.activeDevice === 'gamepad'
      && this.playerInput.meaningfulGamepadInput) {
      this.pointerLockInitialGate = false;
      this.pointerLock?.hidePrompt();
      this.restoreGameplayAfterPause();
      return;
    }
    if (this.playerInput.pressed('confirm')) {
      if (this.bossFlowPhase === 'intro') {
        this.startBossCombat();
        return;
      }
      if (this.bossFlowPhase === 'loot-collection' && this.bossNextFightButton) {
        this.finishBossCollection();
        return;
      }
    }
    if (!this.playerInput.pressed('pause') || this.tutorialHardPaused) return;
    if (this.bossFlowPhase === 'intro' || this.bossFlowPhase === 'destruction' || this.bossFlowPhase === 'transitioning') return;
    if (this.state.state !== RoundState.Paused) {
      this.togglePause();
      return;
    }
    if (this.pauseMenu && Date.now() - this.pauseMenuOpenedAt < 150) return;
    if (this.playerInput.activeDevice === 'gamepad') {
      this.resumeGameplay();
      return;
    }
    // Preserve the existing keyboard Escape behavior: leave the Pause console
    // and return to the explicit browser mouse-capture gate.
    this.hideEquippedModsViewer();
    this.hidePauseMenu();
    this.pointerLock?.showResume();
  }

  private clearGameplayInput(): void {
    this.playerInput?.clear();
    this.mineSalvoInput.cancel();
    this.pendingMineSalvo = false;
    this.player?.setVelocity(0, 0);
    this.input.keyboard?.resetKeys();
  }

  private pauseForLegendaryModReveal(): void {
    this.legendaryRevealInProgress = true;
    this.audio.stopLowHealthWarning();
    this.legendaryRevealPhysicsWasPaused = this.physics.world.isPaused;
    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();
    this.laserSecurity?.silence();
    this.audio.stopFluxCoreLoop();
    this.clearGameplayInput();
    this.crosshair?.setVisible(false);
    this.physics.pause();
  }

  private resumeAfterLegendaryModReveal(): void {
    this.crosshair?.setVisible(true);
    const shouldRemainPaused = this.legendaryRevealPhysicsWasPaused
      || this.state.state === RoundState.Paused
      || this.state.state === RoundState.Victory
      || this.state.state === RoundState.Defeat;
    if (shouldRemainPaused) this.physics.pause();
    else this.physics.resume();
    if (this.state.state === RoundState.Planting) this.audio.startPlantingLoop();
    if (this.state.state === RoundState.Defusing) this.audio.startDisarmLoop();
    this.legendaryRevealPhysicsWasPaused = false;
    this.legendaryRevealInProgress = false;
  }

  private pauseForPointerLock(reason: 'initial' | 'unlock' | 'blur' | 'hidden' | 'error'): void {
    if (this.state.state === RoundState.Victory || this.state.state === RoundState.Defeat) return;
    if (this.bossFlowPhase === 'loot-collection') {
      this.pointerLock?.hidePrompt();
      this.setMenuCursorMode();
      return;
    }
    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();
    this.laserSecurity?.silence();
    this.audio.stopFluxCoreLoop();
    this.audio.stopLowHealthWarning();
    this.clearGameplayInput();
    this.state.set(RoundState.Paused);
    this.physics.pause();
    this.setMenuCursorMode();
    if (reason === 'initial') this.pointerLockInitialGate = true;
    if (this.bossFlowPhase === 'intro' || this.bossFlowPhase === 'destruction' || this.bossFlowPhase === 'transitioning') {
      this.pointerLock?.hidePrompt();
      return;
    }
    if (reason !== 'initial') {
      this.pointerLock?.hidePrompt();
      this.showPauseMenu();
    }
  }

  private resumeFromPointerLock(): void {
    if (this.state.state !== RoundState.Paused || this.pauseMenu) return;
    if (this.bossFlowPhase === 'intro' || this.bossFlowPhase === 'destruction' || this.bossFlowPhase === 'transitioning') return;
    this.pointerLockInitialGate = false;
    this.restoreGameplayAfterPause();
  }

  private restoreGameplayAfterPause(): void {
    if (this.state.state !== RoundState.Paused) return;
    this.setGameplayCursorMode();
    if (this.anomalySuspensionState) {
      const suspension = this.anomalySuspensionState;
      this.anomalySuspensionState = null;
      this.restoreAnomalySimulation(suspension);
      this.tutorialDirector?.startEligible();
      return;
    }
    if (this.bossEncounter) {
      this.state.set(RoundState.Defense);
      this.physics.resume();
      this.tutorialDirector?.startEligible();
      return;
    }
    const activeSites = this.bombSites.getActiveBombSites();
    const defusing = activeSites.some((site) => site.state === BombSiteState.BeingDefused);
    this.state.set(defusing ? RoundState.Defusing : activeSites.length > 0 ? RoundState.Defense : RoundState.PrePlant);
    if (defusing) this.audio.startDisarmLoop();
    this.physics.resume();
    this.tutorialDirector?.startEligible();
  }

  private setTutorialMode(mode: TutorialMode): void {
    const shouldPause = mode === 'hard-pause';
    if (shouldPause === this.tutorialHardPaused) return;
    this.tutorialHardPaused = shouldPause;
    if (shouldPause) {
      this.tutorialClockWasPaused = this.time.paused;
      this.clearGameplayInput();
      this.setMenuCursorMode();
      this.pointerLock?.hidePrompt();
      this.pointerLock?.release();
      // Window-driven tutorial UI remains animated while the authoritative
      // Arena clock, delayed calls, cooldown timestamps, and physics freeze.
      this.time.paused = true;
      this.physics.pause();
    } else {
      this.time.paused = this.tutorialClockWasPaused;
      this.tutorialClockWasPaused = false;
      const canResumeGameplay = this.state.state !== RoundState.Paused
        && this.state.state !== RoundState.Victory
        && this.state.state !== RoundState.Defeat;
      if (canResumeGameplay) {
        this.physics.resume();
        this.setGameplayCursorMode();
        this.pointerLock?.hidePrompt();
        // Hard-pause Teaching always exits through a trusted Continue click.
        // Restore capture on every gameplay transition rather than depending
        // on whether a prior lock snapshot happened to be retained.
        if (this.scene.isActive() && this.pointerLock?.supported && this.playerInput.activeDevice !== 'gamepad') {
          this.pointerLock.requestLock();
        }
      }
    }
  }

  private resolveTutorialTarget(target: string): TutorialTargetBounds | null {
    if (target.startsWith('hud.')) {
      const id = target.slice(4) as 'vitals' | 'objective' | 'stats' | 'abilities' | 'fence' | 'turret' | 'mine' | 'shield';
      const bounds = this.hud?.getTutorialTargetBounds(id);
      return bounds ? this.canvasBoundsToViewport(bounds) : null;
    }
    if (target === 'world.player' && this.player?.active) {
      return this.worldCircleToViewport(this.player.x, this.player.y, Math.max(28, this.player.displayWidth * 0.8));
    }
    if (target === 'world.bombsite') {
      const site = this.bombSites?.sites.find((candidate) => candidate.state === BombSiteState.Available) ?? this.bombSites?.sites[0];
      return site ? this.worldCircleToViewport(site.x, site.y, 96) : null;
    }
    if (target === 'world.defusingBombsite') {
      const site = this.bombSites?.sites.find((candidate) => candidate.state === BombSiteState.BeingDefused)
        ?? this.bombSites?.getActiveBombSite();
      return site ? this.worldCircleToViewport(site.x, site.y, 226) : null;
    }
    if (target === 'world.enemy') {
      const enemy = this.enemies.find((candidate) => candidate.active);
      return enemy ? this.worldCircleToViewport(enemy.x, enemy.y, Math.max(32, enemy.displayWidth)) : null;
    }
    if (target === 'world.boss' && this.bossEncounter?.boss.active) {
      const boss = this.bossEncounter.boss;
      return this.worldCircleToViewport(boss.x, boss.y, Math.max(70, boss.displayWidth));
    }
    return null;
  }

  private canvasBoundsToViewport(bounds: { x: number; y: number; width: number; height: number }): TutorialTargetBounds {
    const canvas = this.game.canvas.getBoundingClientRect();
    return projectTutorialBoundsToViewport(bounds, canvas, this.scale.width, this.scale.height);
  }

  private worldCircleToViewport(worldX: number, worldY: number, diameter: number): TutorialTargetBounds {
    const camera = this.cameras.main;
    const centerX = camera.x + (worldX - camera.worldView.x) * camera.zoom;
    const centerY = camera.y + (worldY - camera.worldView.y) * camera.zoom;
    const displayDiameter = diameter * camera.zoom;
    return this.canvasBoundsToViewport({
      x: centerX - displayDiameter / 2,
      y: centerY - displayDiameter / 2,
      width: displayDiameter,
      height: displayDiameter
    });
  }

  private showBanner(text: string): void {
    this.bannerText.setText(text).setAlpha(0).setY(148);
    this.tweens.add({
      targets: this.bannerText,
      alpha: { from: 0, to: 1 },
      y: 174,
      duration: 260,
      yoyo: true,
      hold: 800
    });
  }

  private handleResize(size: Phaser.Structs.Size): void {
    const width = size.width;
    const height = size.height;
    this.bannerText.setPosition(width * 0.5, this.bannerText.y);
    this.siteActionText.setPosition(width * 0.5, height - 46);
    this.bossEncounter?.resize(width);
    this.supremeFinale?.resize(width);
    this.bossIntroOverlay?.resize(width, height);
    this.bossNextFightButton?.setGamePosition(width * 0.5, height - 58, 270, 46);
    this.arcadeController?.resize(width, height);
    this.anomalyController?.resize(width);
    this.modAcquisitionPresenter?.resize(width, height);
    if (this.pauseMenu) {
      this.layoutPauseMenu(width, height);
    }
    if (this.equippedModsViewer) this.showEquippedModsViewer();
  }

  private layoutPauseMenu(width: number, height: number): void {
    this.pauseMenu?.resize(width, height);
  }

  private showPauseMenu(): void {
    this.hidePauseMenu();
    this.setMenuCursorMode();
    this.pauseMenuOpenedAt = Date.now();

    this.pauseMenu = createPauseMenuView(this, {
      encounter: this.supremeFinale
        ? 'Supreme Terminal // Trinity Command'
        : this.bossEncounter ? `Boss Gate ${this.bossRound}` : `Round ${this.roundManager.round}`,
      seed: this.layout.seed,
      layout: this.layout.template
    }, [
      { label: 'Resume', onClick: () => this.resumeGameplay(), tone: 'primary' },
      { label: 'Equipped Mod Cards', onClick: () => this.showEquippedModsViewer() },
      { label: 'Mod Collection (Next Run)', onClick: () => {
        this.hidePauseMenu();
        this.scene.pause();
        this.scene.launch(SceneKeys.Mods, { returnScene: SceneKeys.Arena, resumePausedScene: true });
      } },
      { label: 'Restart From Round 1', onClick: () => this.restartFromRoundOne(), tone: 'warning' },
      { label: 'Options', onClick: () => {
        this.hidePauseMenu();
        this.scene.launch(SceneKeys.Options, { returnScene: SceneKeys.Arena, resumeGameplay: true });
        this.scene.pause();
      } },
      { label: 'Store', onClick: () => {
        this.hidePauseMenu();
        this.scene.pause();
        this.scene.launch(SceneKeys.Upgrades, { returnScene: SceneKeys.Arena, resumePausedScene: true });
      }, tone: 'utility' },
      { label: 'Quit To Main Menu', onClick: () => this.quitToMenu(), tone: 'warning' }
    ]);
  }

  private showEquippedModsViewer(): void {
    this.hidePauseMenu();
    this.hideEquippedModsViewer();
    const { width, height } = this.scale;
    const panelWidth = Math.min(width - 40, 1080);
    const panelHeight = Math.min(height - 32, 520);
    const panelTop = (height - panelHeight) / 2;
    const root = this.add.container(0, 0).setScrollFactor(0).setDepth(1250);
    root.add(this.add.rectangle(width / 2, height / 2, width, height, 0x02050b, 0.88));
    root.add(this.add.rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x091521, 0.98).setStrokeStyle(2, 0x62e9ff, 0.9));
    root.add(this.add.text(width / 2, panelTop + 32, 'EQUIPPED MOD CARDS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '28px', color: '#71f6ff', align: 'center',
      wordWrap: { width: panelWidth - 64, useAdvancedWrap: true }
    }).setOrigin(0.5, 0));
    const mods = SaveSystem.getModCollection();
    const loadout = mods.loadouts.find((entry) => entry.id === mods.activeLoadoutId) ?? mods.loadouts[0];
    const equipped = this.modRuntime.snapshot();
    equipped.forEach((entry, index) => {
      const selectedCardId = Object.entries(loadout?.slots ?? {}).find(([, modId]) => modId === entry.id)?.[0] as ModSlot | undefined;
      const card = mods.cards.find((candidate) => candidate.instanceId === (selectedCardId ? loadout?.cardSlots[selectedCardId] : ''))
        ?? mods.cards.find((candidate) => candidate.modId === entry.id);
      if (!card) return;
      const spacing = Math.min(175, (panelWidth - 80) / Math.max(1, equipped.length));
      const x = width / 2 - (equipped.length - 1) * spacing / 2 + index * spacing;
      const cardWidth = Math.min(140, spacing - 12);
      root.add(createModCardView(this, x, height / 2 + 8, card, entry.rank, {
        width: cardWidth,
        height: cardWidth * 1.4,
        compact: true,
        interactive: false,
        equipped: true
      }));
    });
    if (!equipped.length) root.add(this.add.text(width / 2, height / 2, 'NO MOD CARDS EQUIPPED', { fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#7895a8' }).setOrigin(0.5));
    const close = createButton(this, width / 2, panelTop + panelHeight - 38, 'Back To Pause Menu', () => { this.hideEquippedModsViewer(); this.showPauseMenu(); }, 280);
    root.add(close);
    this.equippedModsViewer = root;
  }

  private hideEquippedModsViewer(): void { this.equippedModsViewer?.destroy(true); this.equippedModsViewer = null; }

  private hidePauseMenu(): void {
    if (!this.pauseMenu) return;
    this.pauseMenu.destroy();
    this.pauseMenu = null;
  }

  private resumeGameplay(): void {
    this.hideEquippedModsViewer();
    this.hidePauseMenu();
    if (this.state.state !== RoundState.Paused) return;
    if (this.bossFlowPhase === 'loot-collection') {
      this.setMenuCursorMode();
      this.state.set(RoundState.Defense);
      this.physics.resume();
      return;
    }
    if (this.playerInput.activeDevice === 'gamepad') {
      this.pointerLockInitialGate = false;
      this.pointerLock?.hidePrompt();
      this.restoreGameplayAfterPause();
    } else {
      this.pointerLock?.showResume();
      this.pointerLock?.requestLock();
    }
  }

  private restartFromRoundOne(): void {
    this.arcadeController?.stop('round-ended');
    this.flushPendingCombatProgress();
    this.captureTelemetryEndState();
    GameplayTelemetryRecorder.endEncounter('quit', { credits: this.roundCredits, coreTokens: this.roundCoreTokens, fluxCores: this.roundFluxCores });
    GameplayTelemetryRecorder.finishRun('quit');
    startArenaLoad(this, { reason: 'new-run', message: 'Restarting from round 1...' });
  }

  private quitToMenu(): void {
    this.arcadeController?.stop('round-ended');
    this.setMenuCursorMode();
    this.flushPendingCombatProgress();
    this.captureTelemetryEndState();
    GameplayTelemetryRecorder.endEncounter('quit', { credits: this.roundCredits, coreTokens: this.roundCoreTokens, fluxCores: this.roundFluxCores });
    GameplayTelemetryRecorder.finishRun('quit');
    OnlineRunManager.complete('quit', this.currentCombatRound());
    this.registry.remove('arena-session');
    RunTransitionManager.clearForMenu(this);
    this.scene.start(SceneKeys.MainMenu);
  }

  /**
   * Combat progression is durability-safe at encounter transitions without
   * synchronously serializing the complete profile for every enemy death.
   */
  private flushPendingCombatProgress(): void {
    const enemiesDestroyed = this.pendingProgressEnemyKills;
    const bombSitesDestroyed = this.pendingProgressBombSites;
    if (enemiesDestroyed <= 0 && bombSitesDestroyed <= 0) return;
    this.pendingProgressEnemyKills = 0;
    this.pendingProgressBombSites = 0;
    SaveSystem.recordCombatProgress(enemiesDestroyed, bombSitesDestroyed, this.protocol);
  }

  private prepareForRoundCreation(): void {
    if (this.hasLiveRoundObjects) {
      this.cleanupRoundObjects();
      return;
    }

    // A stopped Phaser scene is restarted using the same class instance. Its
    // display list and physics world are already gone at this point, so only
    // discard our plain references. In particular, never call clear() on the
    // previous run's disposed StaticGroup here.
    this.clearRoundCollections();
  }

  private clearRoundCollections(): void {
    this.bossSequenceTimers.length = 0;
    this.bossNextFightButton?.destroy();
    this.bossNextFightButton = null;
    this.roundInfusionTimers.clear();
    this.roundInfusionEffects.clear();
    this.bossLootLaunchesPending = 0;
    this.wallRects.length = 0;
    this.enemies.length = 0;
    this.bossSupportEnemies.clear();
    this.nextBossSupportEnemyWaveAt = 0;
    this.enemyColliders.clear();
    this.projectiles.length = 0;
    this.pendingSplitProjectiles.length = 0;
    this.hazardDamageTargets.length = 0;
    this.homingMissiles.length = 0;
    this.pickups.length = 0;
    this.modPickups.length = 0;
    this.fences.length = 0;
    this.turrets.length = 0;
    this.mines.length = 0;
    this.deathMines.length = 0;
    this.defuseAssignees.clear();
    this.activeDefusersBySite.clear();
    this.activeDefuserEnemiesBySite.clear();
    this.defuseCandidateBuffer.length = 0;
    this.assignedDefusersPerSite.clear();
    this.defuseTargetByEnemy.clear();
    this.detonatingSiteIds.clear();
    this.playerInput?.clear();
    this.hudBuffs.length = 0;
    this.hudRadarContacts.length = 0;
    this.hudRadarContactPool.length = 0;
    this.hudRadarContactCount = 0;
    this.nextHoloAfterimageAt = 0;
    this.arcadePopSequence = 0;
    this.physicalLootSequence = 0;
    this.temporaryAmmo.reset();
    this.turretWeaponSync.reset();
    this.grenadeProjectileSequence = 0;
    this.enemyNavigationSequence = 0;
    this.navState = new WeakMap<Enemy, NavState>();
    this.patrolTargets = new WeakMap<Enemy, PatrolPoint>();
    this.enemySeparationGrid.clear();
    this.separationSubject = null;
    this.defuseCandidateDistanceSquared = new WeakMap<Enemy, number>();
  }

  private cleanupRoundObjects(): void {
    this.arcadeController?.destroy('replaced');
    this.arcadeController = null;
    this.anomalyController?.destroy('round-ended');
    this.anomalyController = null;
    this.anomalyReturnLifecycle.reset();
    this.pendingAnomalyReturn = null;
    this.anomalyReturnAwaitingFirstUpdate = false;
    this.anomalyReturnAwaitingFirstPhysicsStep = false;
    this.anomalyReturnAwaitingFirstRender = false;
    this.devAnomalyReturnSoak = null;
    this.devAnomalyReturnSoakResult = null;
    this.anomalySuspensionState = null;
    this.clearRoundInfusionEffects();
    this.arenaVisuals?.destroy();
    this.arenaVisuals = null;
    this.supremeConstellation?.destroy();
    this.supremeConstellation = null;
    this.walls?.clear(true, true);
    this.boostVisual?.reset();
    this.mineSalvoInput.cancel();
    this.pendingMineSalvo = false;
    this.playerInput?.clear();
    this.audio.stopFluxCoreLoop();
    for (const timer of this.bossSequenceTimers) timer.remove(false);
    this.bossSequenceTimers.length = 0;
    this.bossNextFightButton?.destroy();
    this.bossNextFightButton = null;
    this.bossEncounter?.destroy();
    this.bossEncounter = null;
    this.supremeFinale?.destroy();
    this.supremeFinale = null;
    this.supremeFinaleOverlay?.destroy();
    this.supremeFinaleOverlay = null;
    this.supremeVictorySequence?.destroy();
    this.supremeVictorySequence = null;
    this.supremeBossWallColliders.forEach((collider) => collider.destroy());
    this.supremeBossWallColliders.length = 0;
    this.clearBossSupportEnemies();
    this.bossIntroOverlay?.destroy();
    this.bossIntroOverlay = null;
    this.bossFlowPhase = 'none';
    this.laserSecurity?.destroy();
    this.laserSecurity = null;
    this.bombletHazard?.destroy();
    this.bombletHazard = null;
    this.gasHazard?.destroy();
    this.gasHazard = null;
    this.fluxCores?.destroy();
    this.fluxCores = null;
    this.supremeModEffects?.destroy();
    this.supremeModEffects = null;
    this.bombsiteMods?.destroy();
    for (const e of this.enemies) {
      this.destroyEnemyColliders(e);
      e.destroy();
    }
    this.playerWallCollider?.destroy();
    this.playerWallCollider = null;
    this.bossWallCollider?.destroy();
    this.bossWallCollider = null;
    for (const p of this.projectiles) this.retireProjectile(p);
    this.projectilePool.releaseAll();
    this.fxCirclePool.releaseAll();
    this.mineExplosionVfx.reset();
    this.bombExplosionCosmeticVfx.reset();
    this.projectileTrails?.reset();
    for (const missile of this.homingMissiles) missile.sprite.destroy();
    for (const p of this.pickups) p.sprite.destroy();
    for (const p of this.modPickups) p.sprite.destroy();
    for (const f of this.fences) f.destroy();
    for (const t of this.turrets) t.destroy();
    for (const m of this.mines) m.destroy();
    for (const m of this.deathMines) m.mine.destroy();
    this.bombSites?.destroy();
    this.destroyShieldOrb();

    this.clearRoundCollections();
    this.hasLiveRoundObjects = false;

    this.children.list
      .filter((obj) => 'depth' in obj
        && (obj as { depth: number }).depth <= 4
        && obj !== this.player
        && !this.projectilePool.owns(obj)
        && !this.fxCirclePool.owns(obj))
      .forEach((obj) => obj.destroy());
  }

  private cleanup(): void {
    // Phaser shuts down the display list, tweens, and Arcade Physics before
    // emitting the Scene shutdown event handled here. Only release our
    // references at this point; cleanupRoundObjects handles explicit teardown
    // while the Arena scene and its plugins are still active.
    this.hasLiveRoundObjects = false;
    this.arcadeController?.destroy('scene-shutdown');
    this.arcadeController = null;
    this.anomalyController?.destroy('scene-shutdown');
    this.anomalyController = null;
    this.anomalyReturnLifecycle.reset();
    this.pendingAnomalyReturn = null;
    this.anomalyReturnAwaitingFirstUpdate = false;
    this.anomalyReturnAwaitingFirstPhysicsStep = false;
    this.anomalyReturnAwaitingFirstRender = false;
    this.devAnomalyReturnSoak = null;
    this.devAnomalyReturnSoakResult = null;
    this.anomalySuspensionState = null;
    this.flushPendingCombatProgress();
    this.arenaVisuals = null;
    this.supremeConstellation = null;
    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();
    this.audio.stopFluxCoreLoop();
    this.audio.stopLowHealthWarning();
    this.modAcquisitionPresenter?.destroy();
    this.modAcquisitionPresenter = null;
    this.tutorialDirector?.destroy();
    this.tutorialDirector = null;
    this.tutorialHardPaused = false;
    this.tutorialClockWasPaused = false;
    this.legendaryRevealInProgress = false;
    this.scale.off('resize', this.handleResize, this);
    this.events.off('resume-from-options', this.onResumeFromOptions);
    this.events.off('return-from-mod-collection', this.onReturnFromModCollection);
    this.events.off('return-from-store', this.onReturnFromStore);
    this.events.off('quit-from-store', this.onQuitFromStore);
    this.events.off('anomaly-return', this.onAnomalyReturn);
    this.events.off(Phaser.Scenes.Events.WAKE, this.onArenaWoken);
    this.events.off(Phaser.Scenes.Events.RENDER, this.onFirstArenaRenderAfterAnomaly, this);
    this.hud?.destroy();
    this.siteActionText?.destroy();
    this.bannerText?.destroy();
    this.crosshair?.destroy();
    this.balanceTelemetry?.destroy();
    this.balanceTelemetry = null;
    this.performanceTelemetry?.destroy();
    this.traversalDebug?.destroy();
    this.traversalDebug = null;
    this.performanceTelemetry = null;
    this.hidePauseMenu();
    this.hideEquippedModsViewer();
    this.bombsiteMods?.destroy();
    this.supremeModEffects?.destroy();
    this.supremeModEffects = null;
    this.bombSites?.destroy();
    this.laserSecurity?.destroy();
    this.laserSecurity = null;
    this.bombletHazard?.destroy();
    this.bombletHazard = null;
    this.gasHazard?.destroy();
    this.gasHazard = null;
    this.fluxCores?.destroy();
    this.fluxCores = null;
    this.bossEncounter?.destroy();
    this.bossEncounter = null;
    this.supremeFinale?.destroy();
    this.supremeFinale = null;
    this.supremeFinaleOverlay?.destroy();
    this.supremeFinaleOverlay = null;
    this.supremeVictorySequence?.destroy();
    this.supremeVictorySequence = null;
    this.supremeBossWallColliders.length = 0;
    this.bossIntroOverlay?.destroy();
    this.bossIntroOverlay = null;
    this.bossFlowPhase = 'none';
    this.destroyShieldOrb();
    this.boostVisual?.destroy();
    this.mineExplosionVfx?.destroy();
    this.bombExplosionCosmeticVfx?.destroy();
    this.projectilePool?.destroy((projectile) => this.destroyPooledProjectile(projectile));
    this.fxCirclePool?.destroy((circle) => circle.destroy());
    this.projectileTrails?.destroy();
    this.projectileTrails = null;
    this.clearRoundCollections();
    this.playerInput?.destroy();
    this.pointerLock?.destroy();
    this.pointerLock = null;
    if (import.meta.env.DEV) {
      const debugGlobal=globalThis as typeof globalThis&{
        forceArenaType?:unknown;
        regenerateArena?:unknown;
        toggleTraversalDebug?:unknown;
        forceArcadeEvent?:unknown;
        forceAnomaly?:unknown;
        forceAnomalyCharge?:unknown;
        setAnomalyCost?:unknown;
        setHeistMiniBoss?:unknown;
        forceSupremeStage?:unknown;
        previewSupremeMod?:unknown;
        forceSupremeFinale?:unknown;
        previewSupremeVictory?:unknown;
        n3onInputDebug?:unknown;
        n3onAnomalyDebug?:unknown;
        n3onAnomalyReturnSoak?:unknown;
      };
      delete debugGlobal.forceArenaType;
      delete debugGlobal.regenerateArena;
      delete debugGlobal.toggleTraversalDebug;
      delete debugGlobal.forceArcadeEvent;
      delete debugGlobal.forceAnomaly;
      delete debugGlobal.forceAnomalyCharge;
      delete debugGlobal.setAnomalyCost;
      delete debugGlobal.setHeistMiniBoss;
      delete debugGlobal.forceSupremeStage;
      delete debugGlobal.previewSupremeMod;
      delete debugGlobal.forceSupremeFinale;
      delete debugGlobal.previewSupremeVictory;
      delete debugGlobal.n3onInputDebug;
      delete debugGlobal.n3onAnomalyDebug;
      delete debugGlobal.n3onAnomalyReturnSoak;
    }
    this.setMenuCursorMode();
  }
}
