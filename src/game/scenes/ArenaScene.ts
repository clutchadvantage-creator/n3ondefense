import Phaser from 'phaser';
import { starterWeapon } from '../../data/weapons';
import { getUpgradeEffect, getUpgradeLevel } from '../../data/upgrades';
import { getCosmeticTextureKey } from '../../data/cosmetics';
import { COLORS, WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';
import { OBJECTIVE_CONFIG } from '../config/gameplay';
import { ABILITY_BALANCE, ENEMY_BALANCE, OBJECTIVE_BALANCE, PICKUP_BALANCE, PLAYER_BALANCE, REWARD_BALANCE, TANK_HOMING_MISSILE_BALANCE, WEAPON_BALANCE, getConcurrentSpawnPressure, getDefuseAssigneeCount, getDifficultyCurve, getSpawnCadenceMultiplier, getSpawnProfile } from '../config/balance';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import { Mine } from '../abilities/Mine';
import { Turret } from '../abilities/Turret';
import { Fence } from '../abilities/Fence';
import { MAX_DISTINCT_FENCE_SPLITS, resolveFenceSplitStage } from '../abilities/FenceSplitRules.ts';
import { Player } from '../entities/Player';
import { baseEnemyStats, Enemy } from '../enemies/Enemy';
import { getTankHomingMissileSpeed, steerTankHomingMissile } from '../enemies/HomingMissile.ts';
import { BombSiteState, RoundState, type AbilityType, type ArenaLayout, type ArenaReward, type ArenaSessionState, type ArenaTemplate, type BombSiteRuntime, type EnemyType, type PickupType, type RectSpec, type RoundFinishedPayload } from '../types';
import { AudioManager } from '../systems/AudioManager';
import { BombSiteManager } from '../systems/BombSiteManager';
import { GameStateMachine } from '../systems/GameStateMachine';
import { GridPathfinder } from '../systems/GridPathfinder';
import { Hud } from '../systems/Hud';
import type { HudPayload, HudRadarContact } from '../systems/Hud';
import { RoundManager } from '../systems/RoundManager';
import { SaveSystem } from '../systems/SaveSystem';
import { ArenaGenerator } from '../systems/ArenaGenerator';
import { LaserSecuritySystem } from '../systems/LaserSecuritySystem';
import { BombletHazardSystem } from '../systems/BombletHazardSystem';
import { GasHazardSystem } from '../systems/GasHazardSystem';
import { GAS_HAZARD_BALANCE } from '../config/gasHazards';
import type { HazardDamageTarget } from '../config/hazardScaling';
import { BOSS_ARCHETYPES, BOSS_BALANCE, getBossRewards, isBossRound, selectBossArchetype, type BossArchetype } from '../config/bossBalance';
import { BossEncounter, type BossAttackKind, type BossProjectileSpec } from '../bosses/BossEncounter';
import { SeededRandom } from '../systems/SeededRandom';
import { startArenaLoad } from '../utils/runFlow';
import { createButton } from '../utils/ui';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { GameplayPointerLock } from '../input/GameplayPointerLock';
import { ABILITY_ACTIONS, compactBindingLabel, type AbilityAction, type AbilityBindings } from '../config/controls';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { MOD_BALANCE, normalizeRunProtocolId } from '../mods/modBalance.ts';
import { isGuaranteedMilestone, rollModDrop } from '../mods/ModDropService.ts';
import type { ModDropSource, ModRewardRecord, ModSlot, RunProtocolId } from '../mods/types.ts';
import { magneticResistanceForEnemy, splitCurrentSecondaryDamage } from '../mods/ModRules.ts';
import { createModCardView } from '../mods/ModCardView.ts';
import { ModAcquisitionPresenter } from '../mods/ModAcquisitionPresenter.ts';
import { MOD_FOCUS_CATEGORIES, RUN_CONTRACT_IDS, getContract, getRoundCompletionCredits } from '../economy/economyBalance.ts';
import type { AccountProgressionTier, ModFocusSignalId, RunContractId } from '../economy/types.ts';
import { GameplayTelemetryRecorder } from '../telemetry/GameplayTelemetryRecorder.ts';
import { ReusableObjectPool } from '../performance/ReusableObjectPool.ts';
import { FramePerformanceMonitor } from '../performance/FramePerformanceMonitor.ts';
import { shouldReplaceTurretTarget } from '../performance/Targeting.ts';

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
}

interface ProjectileSpawn extends Omit<Projectile, 'sprite' | 'crossedFences'> {
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
}

interface Pickup {
  type: PickupType;
  sprite: Phaser.GameObjects.Container;
  expiresAt: number;
  source: 'enemy' | 'arena-support' | 'site-recovery' | 'boss-damage' | 'boss-support';
}

interface DeathMine {
  sprite: Phaser.GameObjects.Arc;
  detonateAt: number;
  damage: number;
  radius: number;
}

interface NavState {
  path: Phaser.Math.Vector2[];
  waypointIndex: number;
  nextRepathAt: number;
  targetKey: string;
  lastSampleX: number;
  lastSampleY: number;
  lastSampleAt: number;
  stuckTicks: number;
}

interface PatrolPoint {
  x: number;
  y: number;
}

interface TurretTargetDecision {
  turret: Turret | null;
  reconsiderAt: number;
}

interface PauseMenuElements {
  backdrop: Phaser.GameObjects.Rectangle;
  panel: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  subtitle: Phaser.GameObjects.Text;
  buttons: Phaser.GameObjects.Container[];
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

export class ArenaScene extends Phaser.Scene {
  private readonly state = new GameStateMachine(RoundState.PrePlant);
  private readonly audio = AudioManager.get();

  private player!: Player;
  private hud!: Hud;
  private bannerText!: Phaser.GameObjects.Text;

  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private wallRects: RectSpec[] = [];

  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private readonly pendingSplitProjectiles: Projectile[] = [];
  private projectilePool!: ReusableObjectPool<Projectile, ProjectileSpawn>;
  private fxCirclePool!: ReusableObjectPool<Phaser.GameObjects.Arc, FxCircleSpawn>;
  private readonly hazardDamageTargets: HazardDamageTarget[] = [];
  private homingMissiles: HomingMissile[] = [];
  private pickups: Pickup[] = [];
  private fences: Fence[] = [];
  private turrets: Turret[] = [];
  private mines: Mine[] = [];
  private deathMines: DeathMine[] = [];
  private readonly defuseAssignees = new Set<Enemy>();
  private readonly activeDefusersBySite = new Map<string, number>();
  private readonly defuseCandidateBuffer: Enemy[] = [];
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
  private runStartedAt = Date.now();
  private readonly detonatingSiteIds = new Set<string>();
  private readonly enemyTurretTargets = new WeakMap<Enemy, TurretTargetDecision>();
  private nextHoloAfterimageAt = 0;
  private arcadePopSequence = 0;

  private roundManager!: RoundManager;
  private layout!: ArenaLayout;
  private pathfinder!: GridPathfinder;
  private bombSites!: BombSiteManager;
  private laserSecurity: LaserSecuritySystem | null = null;
  private bombletHazard: BombletHazardSystem | null = null;
  private gasHazard: GasHazardSystem | null = null;
  private bossEncounter: BossEncounter | null = null;
  private bossRound = 0;
  private pendingRoundPayload: RoundFinishedPayload | null = null;
  private bossPickupRandom: SeededRandom | null = null;
  private nextBossSupportPickupAt = 0;
  private bossSupportSequence = 0;
  private bossVictoryHandled = false;

  private roundCredits = 0;
  private roundCoreTokens = 0;
  private totalCreditsCollected = 0;

  private activePlantingSite: BombSiteRuntime | null = null;
  private plantingProgressMs = 0;
  private lastPlayerShotMs = 0;
  private lastShotEnergyDeniedAt = -99_999;
  private pointerDown = false;
  private pointerLock: GameplayPointerLock | null = null;
  private readonly aimWorldPoint = new Phaser.Math.Vector2();
  private abilityBindings!: AbilityBindings;
  private readonly pressedAbilityActions = new Set<AbilityAction>();

  private nextSpawnAt = 0;
  private nextArenaHealthDropAt = 0;
  private lastSpecialSpawnAt = -99_999;
  private lastDefuserSpawnAt = -99_999;
  private turretTelemetrySequence = 0;

  private pauseMenu: PauseMenuElements | null = null;
  private equippedModsViewer: Phaser.GameObjects.Container | null = null;
  private modAcquisitionPresenter: ModAcquisitionPresenter | null = null;
  private legendaryRevealPhysicsWasPaused = false;
  private siteActionText!: Phaser.GameObjects.Text;
  private crosshair!: Phaser.GameObjects.Graphics;
  private balanceTelemetry: Phaser.GameObjects.Text | null = null;
  private performanceTelemetry: Phaser.GameObjects.Text | null = null;
  private readonly performanceMonitor = new FramePerformanceMonitor(600);
  private nextPerformanceTelemetryAt = 0;
  private readonly telemetryFrameBuffs = { damageBoost: false, speedBoost: false, rapidFire: false };
  private readonly telemetryFrameInput: {
    activeWeight: number;
    activeCountCap: number | undefined;
    activeWeightCap: number | undefined;
    activeBombs: number;
    activeDefusers: number;
    buffs: { damageBoost: boolean; speedBoost: boolean; rapidFire: boolean };
  } = {
    activeWeight: 0,
    activeCountCap: undefined,
    activeWeightCap: undefined,
    activeBombs: 0,
    activeDefusers: 0,
    buffs: this.telemetryFrameBuffs
  };

  private keys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    one: Phaser.Input.Keyboard.Key;
    two: Phaser.Input.Keyboard.Key;
    three: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
    f8: Phaser.Input.Keyboard.Key;
    f7: Phaser.Input.Keyboard.Key;
    f6: Phaser.Input.Keyboard.Key;
    f5: Phaser.Input.Keyboard.Key;
  };

  private selectedAbility: AbilityType = 'fence';
  private abilityCooldownUntil: Record<AbilityType, number> = { fence: 0, turret: 0, mine: 0 };
  private shieldCooldownUntil = 0;
  private shieldActiveUntil = 0;
  private shieldOrb: Phaser.GameObjects.Arc | null = null;
  private shieldPulseTween: Phaser.Tweens.Tween | null = null;
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
    phase: 'PRE-PLANT',
    objective: 'SITE A AVAILABLE',
    objectiveTimerMs: null,
    defuseAlert: false,
    bombUrgent: false,
    bombActive: false,
    bombProgress: 0,
    buffs: this.hudBuffs,
    abilities: [
      { id: 'fence', keybind: 'Q', icon: '⛔', label: 'FENCE', cooldownMs: 0, cooldownDurationMs: ABILITY_BALANCE.fence.cooldownMs, selected: false, hasEnergy: true, underLimit: true },
      { id: 'turret', keybind: 'F', icon: '⌖', label: 'TURRET', cooldownMs: 0, cooldownDurationMs: ABILITY_BALANCE.turret.cooldownMs, selected: false, hasEnergy: true, underLimit: true },
      { id: 'mine', keybind: 'R', icon: '✹', label: 'MINE', cooldownMs: 0, cooldownDurationMs: ABILITY_BALANCE.mine.cooldownMs, selected: false, hasEnergy: true, underLimit: true },
      { id: 'shield', keybind: 'MMB', icon: '◉', label: 'SHIELD', cooldownMs: 0, cooldownDurationMs: ABILITY_BALANCE.shield.cooldownMs, active: false, selected: false, hasEnergy: true, underLimit: true }
    ],
    radarRange: 900,
    radarContacts: this.hudRadarContacts
  };

  private navState = new WeakMap<Enemy, NavState>();
  private patrolTargets = new WeakMap<Enemy, PatrolPoint>();
  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.state.state === RoundState.Paused) return;
    if (pointer.button === 0) {
      this.pointerDown = true;
      return;
    }
    const action = this.actionForBinding(`Mouse:${pointer.button}`);
    if (action) {
      pointer.event?.preventDefault();
      this.pressedAbilityActions.add(action);
    }
  };
  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.button === 0) {
      this.pointerDown = false;
    }
  };
  private readonly onResumeFromOptions = (): void => {
    this.refreshAbilityBindings();
    this.particlesEnabled = SaveSystem.get().settings.particles;
    this.resumeGameplay();
  };
  private readonly onReturnFromModCollection = (): void => {
    if (this.state.state === RoundState.Paused) this.showPauseMenu();
  };
  private readonly onReturnFromStore = (): void => {
    if (this.state.state === RoundState.Paused) this.showPauseMenu();
  };
  private readonly onQuitFromStore = (): void => this.quitToMenu();
  private readonly onAbilityKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || !this.scene.isActive() || this.state.state === RoundState.Paused) return;
    const action = this.actionForBinding(`Keyboard:${event.code}`);
    if (action) this.pressedAbilityActions.add(action);
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
    this.modRuntime = new ModRuntime(SaveSystem.getModCollection(), session?.equippedMods);
    this.createCombatPools();
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

    this.scale.on('resize', this.handleResize, this);
    this.events.on('resume-from-options', this.onResumeFromOptions);
    this.events.on('return-from-mod-collection', this.onReturnFromModCollection);
    this.events.on('return-from-store', this.onReturnFromStore);
    this.events.on('quit-from-store', this.onQuitFromStore);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.pointerLock = new GameplayPointerLock(this.game, {
      onLocked: () => this.resumeFromPointerLock(),
      onLost: (reason) => this.pauseForPointerLock(reason)
    });
    this.pauseForPointerLock('initial');
    this.pointerLock.showInitial();
    if(import.meta.env.DEV){
      const debugGlobal=globalThis as typeof globalThis&{forceArenaType?:(type:ArenaTemplate|null)=>void;regenerateArena?:()=>void};
      debugGlobal.forceArenaType=(type)=>{ArenaGenerator.forceArenaType(type);this.createRoundFromDefinition(this.roundManager.currentDefinition());};
      debugGlobal.regenerateArena=()=>this.createRoundFromDefinition(this.roundManager.currentDefinition());
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
    this.cleanupRoundObjects();
    this.pendingRoundPayload = null;
    this.bossRound = 0;
    this.bossPickupRandom = null;
    this.bossVictoryHandled = false;
    this.detonatingSiteIds.clear();
    this.hidePauseMenu();
    this.physics.resume();

    this.layout = ArenaGenerator.generate(def.seed, def.template, def.round, def.siteCount);
    this.drawProceduralArena(this.layout);
    this.pathfinder = new GridPathfinder(WORLD_WIDTH, WORLD_HEIGHT, 32, this.getBlockers(), 8);

    this.createOrMovePlayer();
    this.modRuntime.beginRound(1);
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
    this.laserSecurity = new LaserSecuritySystem(this, def.round, this.layout.theme, (damage) => {
      this.audio.playSfx('playerDamage');
      GameplayTelemetryRecorder.recordPlayerDamage('laser', damage);
    });
    this.bombletHazard = new BombletHazardSystem(
      this,
      def.round,
      def.seed,
      this.layout.theme,
      this.layout.generation.bounds,
      (x, y) => this.hitWall(x, y),
      this.particlesEnabled,
      (damage) => {
        this.audio.playSfx('playerDamage');
        GameplayTelemetryRecorder.recordPlayerDamage('bomblet', damage);
      }
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
          this.audio.playSfx('playerDamage');
          GameplayTelemetryRecorder.recordPlayerDamage('gas', damage);
        }
      );
    }

    this.registerBombSiteEvents();

    this.nextSpawnAt = this.time.now + 2500;
    this.nextArenaHealthDropAt = this.time.now + Phaser.Math.Between(PICKUP_BALANCE.arenaHealthFirstMinMs, PICKUP_BALANCE.arenaHealthFirstMaxMs);
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

    this.state.set(RoundState.PrePlant);

    this.showBanner(`ROUND ${def.round} - ${def.template.toUpperCase()}\nSeed ${def.seed}`);
  }

  private drawProceduralArena(layout: ArenaLayout): void {
    this.add.rectangle(WORLD_WIDTH * 0.5, WORLD_HEIGHT * 0.5, WORLD_WIDTH, WORLD_HEIGHT, 0x090d14, 1).setDepth(0);

    const floor = this.add.graphics();
    floor.lineStyle(1, 0x131d2f, 0.6);
    for (let x = 0; x < WORLD_WIDTH; x += 100) floor.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = 0; y < WORLD_HEIGHT; y += 100) floor.lineBetween(0, y, WORLD_WIDTH, y);

    this.walls = this.physics.add.staticGroup();
    this.wallRects = [];

    for (const wall of layout.walls) {
      this.add.rectangle(wall.x + wall.w * 0.5, wall.y + wall.h * 0.5, wall.w, wall.h, 0x0c1119, 1)
        .setStrokeStyle(2, layout.theme.primary, 0.92)
        .setDepth(2);
      const body = this.walls.create(wall.x + wall.w * 0.5, wall.y + wall.h * 0.5, 'pixel');
      body.setDisplaySize(wall.w, wall.h);
      body.refreshBody();
      this.wallRects.push({ ...wall });
    }

    for (const obstacle of layout.obstacles) {
      this.drawObstacle(obstacle, layout.theme.primary, layout.theme.secondary);
      const rect = {
        x: obstacle.x - obstacle.w * 0.5,
        y: obstacle.y - obstacle.h * 0.5,
        w: obstacle.w,
        h: obstacle.h
      };
      const body = this.walls.create(obstacle.x, obstacle.y, 'pixel');
      body.setDisplaySize(rect.w, rect.h);
      body.refreshBody();
      this.wallRects.push(rect);
    }

    for (const deco of layout.decorativeNeon) {
      const color = Math.random() < 0.5 ? layout.theme.primary : layout.theme.secondary;
      const line = this.add.rectangle(deco.x, deco.y, deco.w, deco.h, color, 0.15).setDepth(1);
      this.tweens.add({ targets: line, alpha: { from: 0.08, to: 0.3 }, duration: 900 + Math.random() * 1000, yoyo: true, repeat: -1 });
    }
  }

  private drawObstacle(obstacle: ArenaLayout['obstacles'][number], primary: number, secondary: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x0f141d, 0.96);
    g.lineStyle(2, Math.random() < 0.5 ? primary : secondary, 0.95);

    const x = obstacle.x;
    const y = obstacle.y;
    const rx = obstacle.w * 0.5;
    const ry = obstacle.h * 0.5;

    if (obstacle.kind === 'circle' || obstacle.kind === 'energy-column') {
      g.fillCircle(x, y, Math.min(rx, ry));
      g.strokeCircle(x, y, Math.min(rx, ry));
    } else if (obstacle.kind === 'triangle') {
      g.fillPoints([{ x, y: y - ry }, { x: x - rx, y: y + ry }, { x: x + rx, y: y + ry }], true);
      g.strokePoints([{ x, y: y - ry }, { x: x - rx, y: y + ry }, { x: x + rx, y: y + ry }], true);
    } else if (obstacle.kind === 'hexagon' || obstacle.kind === 'octagon') {
      const points: Phaser.Types.Math.Vector2Like[] = [];
      const sides = obstacle.kind === 'hexagon' ? 6 : 8;
      for (let i = 0; i < sides; i += 1) {
        const a = (Math.PI * 2 * i) / sides;
        points.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry });
      }
      g.fillPoints(points, true);
      g.strokePoints(points, true);
    } else {
      g.fillRect(x - rx, y - ry, obstacle.w, obstacle.h);
      g.strokeRect(x - rx, y - ry, obstacle.w, obstacle.h);
    }
    g.setDepth(3);
  }

  private createOrMovePlayer(): void {
    const up = this.runUpgrades;
    const hasValidBody = !!this.player && !!this.player.active && !!this.player.body;

    if (!hasValidBody) {
      const baseMaxHealth = PLAYER_BALANCE.maxHealth + getUpgradeLevel(up, 'player.maxHealth') * 10;
      const baseDashCooldownMs = Math.max(1500, PLAYER_BALANCE.dashCooldownMs - getUpgradeLevel(up, 'player.dashCooldown') * 120);
      const baseDashDistance = PLAYER_BALANCE.dashDistanceMultiplier + getUpgradeLevel(up, 'player.dashDistance') * 0.06;
      const basePickupRadius = PLAYER_BALANCE.pickupRadius + getUpgradeLevel(up, 'player.pickupRadius') * 7;
      const stats = {
        maxHealth: Math.max(1, Math.round(baseMaxHealth * this.modRuntime.multiplier('playerMaxHealth'))),
        moveSpeed: PLAYER_BALANCE.moveSpeed + getUpgradeLevel(up, 'player.moveSpeed') * 7,
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

      const playerShape = SaveSystem.getEquippedCosmeticId('playerShape') ?? 'player-circle';
      this.player = new Player(this, this.layout.playerSpawn.x, this.layout.playerSpawn.y, playerShape, stats, energy, weapon);
      this.player.permanentModSpeedMultiplier = this.modRuntime.permanentMoveSpeedMultiplier();
      this.player.setCosmeticTint(SaveSystem.getCosmeticColor('playerColor', this.time.now));
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
      this.player.setCosmeticTint(SaveSystem.getCosmeticColor('playerColor', this.time.now));
    }

    this.physics.add.collider(this.player, this.walls);
  }

  private createHudLayer(): void {
    if (this.hud) this.hud.destroy();
    if (this.bannerText) this.bannerText.destroy();
    if (this.siteActionText) this.siteActionText.destroy();

    this.hud = new Hud(this);

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
      GameplayTelemetryRecorder.recordBombArmed(site.id);
      this.state.set(RoundState.Defense);
      this.bombSites.refreshVisuals(this.layout.theme);
      const graceMs = getSpawnProfile(this.roundManager.round, this.bombSites.destroyedCount()).initialGraceMs;
      if (this.bombSites.activeBombCount() === 1) this.nextSpawnAt = this.time.now + graceMs;
      this.showBanner(`SITE ${site.letter} ARMED\n${this.bombSites.activeBombCount()} ACTIVE CHARGE${this.bombSites.activeBombCount() === 1 ? '' : 'S'}`);
      this.audio.playSfx('beep');
    });

    this.bombSites.on('bomb-site-defuse-started', (site: BombSiteRuntime) => {
      GameplayTelemetryRecorder.recordDefuseStarted(site.id);
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
      this.audio.stopDisarmLoop();
      SaveSystem.recordBombSiteDestroyed();
      this.recoveryAfterSiteDestroy();
    });

    this.bombSites.on('all-bomb-sites-destroyed', () => {
      this.completeRound();
    });
  }

  update(_time: number, delta: number): void {
    const now = this.time.now;
    const dt = delta / 1000;

    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.togglePause();
    }
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

    if (this.state.state === RoundState.Paused || this.state.state === RoundState.Victory || this.state.state === RoundState.Defeat) {
      return;
    }

    this.performanceMonitor.record(delta);
    this.updatePerformanceTelemetry(now);

    this.recordTelemetryFrame(delta, now);
    const energyBeforeRegeneration = this.player.energy;
    const requestedRegeneration = this.player.energyStats.regenPerSecond * dt;
    this.player.updateEnergy(dt);
    GameplayTelemetryRecorder.recordEnergyRegeneration(requestedRegeneration, this.player.energy - energyBeforeRegeneration);
    this.refreshAimWorldPoint();
    this.updatePrismCosmetics(now);
    this.updatePlayerMovement(now);
    this.updatePlayerShooting(now);

    if (this.bossEncounter) {
      this.bossEncounter.update(delta, this.player);
      const bossHazardTargets = this.getHazardDamageTargets();
      const playerLaserImmune = now < this.player.dashUntil || now < this.shieldActiveUntil;
      this.gasHazard?.update(now, this.player, this.modRuntime.multiplier('gasDamageTaken'));
      const gasSuppressesLasers = this.gasHazard?.isLaserSuppressed(now) ?? false;
      const laserDangerWindow = this.laserSecurity?.isDangerWindow(now, gasSuppressesLasers) ?? false;
      this.laserSecurity?.update(now, dt, this.player, bossHazardTargets, playerLaserImmune, gasSuppressesLasers);
      this.bombletHazard?.update(now, this.player, bossHazardTargets, laserDangerWindow);
      this.updateProjectiles(delta);
      this.updateAbilities(now, dt);
      this.updateDeathMines(now);
      this.updateShieldState(now);
      this.updateBossSupportPickups(now);
      this.updatePickups(now, dt);
      this.updateEmergencyCapacitor(now);
      this.updateCrosshair();
      this.updateHud(now);
      this.updateBalanceTelemetry();
      if (this.player.isDead()) this.triggerDefeat('playerDead');
      return;
    }

    this.updatePlanting(delta);
    this.bombSites.updateAmbient(this.player.x, this.player.y, now, this.particlesEnabled);

    const activeSites = this.bombSites.getActiveBombSites();
    if (activeSites.length > 0) {
      const detonated = this.bombSites.tickActive(delta);
      for (const site of detonated) this.detonateSite(site);
    }

    this.updateRelentlessSpawns(now, activeSites.length > 0);

    const playerLaserImmune = now < this.player.dashUntil || now < this.shieldActiveUntil;
    const hazardTargets = this.getHazardDamageTargets();
    this.gasHazard?.update(now, this.player, this.modRuntime.multiplier('gasDamageTaken'));
    const gasSuppressesLasers = this.gasHazard?.isLaserSuppressed(now) ?? false;
    const laserDangerWindow = this.laserSecurity?.isDangerWindow(now, gasSuppressesLasers) ?? false;
    this.laserSecurity?.update(now, dt, this.player, hazardTargets, playerLaserImmune, gasSuppressesLasers);
    this.bombletHazard?.update(now, this.player, hazardTargets, laserDangerWindow);
    this.updateEnemies(now, dt);
    this.updateHomingMissiles(delta);
    this.updateProjectiles(delta);
    this.updateAbilities(now, dt);
    this.updateDeathMines(now);
    this.updateShieldState(now);
    this.updateArenaHealthDrops(now);
    this.updatePickups(now, dt);
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
      w: kb.addKey('W'),
      a: kb.addKey('A'),
      s: kb.addKey('S'),
      d: kb.addKey('D'),
      e: kb.addKey('E'),
      one: kb.addKey('ONE'),
      two: kb.addKey('TWO'),
      three: kb.addKey('THREE'),
      esc: kb.addKey('ESC')
      ,f8: kb.addKey('F8')
      ,f7: kb.addKey('F7')
      ,f6: kb.addKey('F6')
      ,f5: kb.addKey('F5')
    };

    this.input.on('pointerdown', this.onPointerDown);
    this.input.on('pointerup', this.onPointerUp);
    this.refreshAbilityBindings();
    window.addEventListener('keydown', this.onAbilityKeyDown);
    this.setGameplayCursorMode();
  }

  private recordTelemetryFrame(delta: number, now: number): void {
    let activeWeight = 0;
    for (const enemy of this.enemies) activeWeight += ENEMY_BALANCE[enemy.stats.type].weight;
    let activeCountCap: number | undefined;
    let activeWeightCap: number | undefined;
    let activeBombs = 0;
    if (!this.bossEncounter) {
      const profile = getSpawnProfile(this.roundManager.round, this.bombSites.destroyedCount());
      activeBombs = this.bombSites.activeBombCount();
      const pressure = getConcurrentSpawnPressure(profile, activeBombs);
      activeCountCap = pressure.activeCountCap;
      activeWeightCap = pressure.activeWeightCap;
    }
    this.telemetryFrameBuffs.damageBoost = now < this.player.buffs.damageBoostUntil;
    this.telemetryFrameBuffs.speedBoost = now < this.player.buffs.speedBoostUntil;
    this.telemetryFrameBuffs.rapidFire = now < this.player.buffs.rapidFireUntil;
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
    this.abilityBindings = { ...SaveSystem.get().settings.abilityBindings };
    const slots = this.hudPayload.abilities;
    slots[0].keybind = compactBindingLabel(this.abilityBindings.fence);
    slots[1].keybind = compactBindingLabel(this.abilityBindings.turret);
    slots[2].keybind = compactBindingLabel(this.abilityBindings.mine);
    slots[3].keybind = compactBindingLabel(this.abilityBindings.shield);
  }

  private actionForBinding(binding: string): AbilityAction | null {
    return ABILITY_ACTIONS.find(({ action }) => this.abilityBindings?.[action] === binding)?.action ?? null;
  }

  private consumeAbilityAction(action: AbilityAction): boolean {
    if (!this.pressedAbilityActions.has(action)) return false;
    this.pressedAbilityActions.delete(action);
    return true;
  }

  private createCrosshair(): void {
    this.crosshair = this.add.graphics().setDepth(2100);
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
      this.player.setCosmeticTint(SaveSystem.getCosmeticColor('playerColor', now));
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
      sprite.setTexture(state.texture).setScale(1).setDisplaySize(state.width, state.height);
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
      }
    );

    const configureFxCircle = (circle: Phaser.GameObjects.Arc, state: FxCircleSpawn): void => {
      circle.setActive(true).setVisible(true).setPosition(state.x, state.y).setRadius(state.radius);
      circle.setScale(1).setAlpha(1).setFillStyle(state.color, state.alpha).setDepth(state.depth);
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
  }

  private obtainProjectile(state: ProjectileSpawn): Projectile {
    return this.projectilePool.obtain(state);
  }

  private retireProjectile(projectile: Projectile): void {
    this.projectilePool.release(projectile);
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
    const forwardFacingFrame = this.player.texture.key === 'player-spaceship' || this.player.texture.key === 'player-airplane';
    this.player.setRotation(angle + (forwardFacingFrame ? 0 : Math.PI / 2));

    let movementX = 0;
    let movementY = 0;
    if (this.keys.w.isDown) movementY -= 1;
    if (this.keys.s.isDown) movementY += 1;
    if (this.keys.a.isDown) movementX -= 1;
    if (this.keys.d.isDown) movementX += 1;

    if (now >= this.player.dashUntil) {
      const movementLengthSquared = movementX * movementX + movementY * movementY;
      if (movementLengthSquared > 0) {
        const speedScale = this.player.speed / Math.sqrt(movementLengthSquared);
        this.player.setVelocity(movementX * speedScale, movementY * speedScale);
      } else {
        this.player.setVelocity(0, 0);
      }
    }

    if (this.consumeAbilityAction('dash')) {
      if (!this.player.canDash(now)) {
        GameplayTelemetryRecorder.recordAbilityDenied('dash', 'cooldown');
      } else if (!this.player.canSpendEnergy(PLAYER_BALANCE.dashEnergyCost)) {
        GameplayTelemetryRecorder.recordEnergyDenied('dash', PLAYER_BALANCE.dashEnergyCost, this.player.energy);
      } else {
        this.player.spendEnergy(PLAYER_BALANCE.dashEnergyCost);
        GameplayTelemetryRecorder.recordAbilityUse('dash', PLAYER_BALANCE.dashEnergyCost);
        this.player.dashTowardPoint(aim.x, aim.y, now);
        if (this.sound.get('sfx-boost')) {
          this.sound.play('sfx-boost', { volume: this.audio.getSfxVolume() });
        } else {
          this.audio.playSfx('boost');
        }
        for (let i = 0; i < 9; i += 1) {
          const c = SaveSystem.getCosmeticColor('dashTrail', now + i * 95);
          const p = this.add.circle(this.player.x, this.player.y, Phaser.Math.Between(3, 7), c, 0.8).setDepth(3);
          this.tweens.add({
            targets: p,
            x: this.player.x - Math.cos(angle) * (18 + i * 7),
            y: this.player.y - Math.sin(angle) * (18 + i * 7),
            alpha: 0,
            scale: 0.35,
            duration: 210 + i * 16,
            onComplete: () => p.destroy()
          });
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.one)) this.selectedAbility = 'fence';
    if (Phaser.Input.Keyboard.JustDown(this.keys.two)) this.selectedAbility = 'turret';
    if (Phaser.Input.Keyboard.JustDown(this.keys.three)) this.selectedAbility = 'mine';

    if (this.consumeAbilityAction('fence')) this.placeAbility('fence', now);
    if (this.consumeAbilityAction('turret')) this.placeAbility('turret', now);
    if (this.consumeAbilityAction('mine')) this.placeAbility('mine', now);
    if (this.consumeAbilityAction('shield')) this.activateShield(now);
    this.updateHoloAfterimage(now);
  }

  private updateHoloAfterimage(now: number): void {
    if (!this.modRuntime.hasInfusion('holo-afterimage') || now < this.nextHoloAfterimageAt) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (!body || body.velocity.lengthSq() < 36) return;
    this.nextHoloAfterimageAt = now + (this.particlesEnabled ? 90 : 180);
    const echo = this.add.image(this.player.x, this.player.y, this.player.texture.key, this.player.frame.name)
      .setDisplaySize(this.player.displayWidth, this.player.displayHeight)
      .setRotation(this.player.rotation)
      .setTint(this.infusionSpectrumColor(0.12))
      .setAlpha(0.32)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7);
    this.tweens.add({
      targets: echo,
      alpha: 0,
      scaleX: 1.16,
      scaleY: 1.16,
      duration: 360,
      ease: 'Quad.Out',
      onComplete: () => echo.destroy()
    });
  }

  private updatePlayerShooting(now: number): void {
    if (!this.pointerDown) return;
    if (this.player.heat >= this.player.weapon.maxHeat) return;

    const cadence = 1000 / this.player.fireRate;
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
    const damage = this.player.weapon.damage * this.player.damageMultiplier * (crit ? criticalMultiplier : 1);
    GameplayTelemetryRecorder.recordShot(damage, shotEnergyCost, crit);

    const spawnX = this.player.x + Math.cos(angle) * 14;
    const spawnY = this.player.y + Math.sin(angle) * 14;
    this.projectiles.push(this.obtainProjectile({
      x: spawnX,
      y: spawnY,
      texture: this.projectileTextureKey,
      width: this.projectileWidth,
      height: this.projectileHeight,
      tint: SaveSystem.getCosmeticColor('projectileColor', now),
      rotation: angle,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      depth: 8,
      damage,
      from: 'player',
      lifeMs: 950,
      trailColor: SaveSystem.getCosmeticColor('trailColor', now),
      splitCurrentEligible: true,
      previousX: spawnX,
      previousY: spawnY,
      telemetryOwner: 'weapon',
      critical: crit
    }));

    this.player.heat += this.player.weapon.heatPerShot;

    const flash = this.obtainFxCircle({
      x: this.player.x + Math.cos(angle) * 18, y: this.player.y + Math.sin(angle) * 18,
      radius: 11, color: 0xffffff, alpha: 0.8, depth: 9
    });
    this.tweens.add({ targets: flash, alpha: 0, scale: 2.2, duration: 110, onComplete: () => this.retireFxCircle(flash) });
    this.audio.playSfx('shot');
  }

  private updatePlanting(delta: number): void {
    const activeBombCount = this.bombSites.activeBombCount();

    const near = this.bombSites.getNearestAvailable(this.player.x, this.player.y, 90);
    if (!near) {
      this.audio.stopPlantingLoop();
      this.activePlantingSite = null;
      this.plantingProgressMs = 0;
      this.siteActionText.setText(activeBombCount > 0
        ? `${activeBombCount} charge${activeBombCount === 1 ? '' : 's'} active. Defend them or move to another available site to plant.`
        : 'Move to an available site and hold E to plant.');
      return;
    }

    if (!this.bombSites.canPlant(near)) {
      this.audio.stopPlantingLoop();
      this.siteActionText.setText('Maximum active charges reached.');
      return;
    }

    if (this.keys.e.isDown) {
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
      this.siteActionText.setText(`Site ${near.letter} ready. Hold E to plant${activeBombCount > 0 ? ' while defending active charges' : ''}.`);
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
    const cadenceMs = Math.round((defensePhase ? profile.defenseCadenceMs : profile.prePlantCadenceMs) * phaseMultiplier * concurrentPressure.cadenceMultiplier * contractCadence);
    const { activeCountCap, activeWeightCap } = concurrentPressure;

    if (now < this.nextSpawnAt) return;
    this.nextSpawnAt = now + cadenceMs;
    if (this.enemies.length >= activeCountCap) {
      GameplayTelemetryRecorder.recordSpawnAttempt('count-cap', cadenceMs);
      return;
    }

    const type = this.pickEnemyType(profile, now, defensePhase);
    if (!type) {
      GameplayTelemetryRecorder.recordSpawnAttempt('composition', cadenceMs);
      return;
    }
    const activeWeight = this.enemies.reduce((sum, enemy) => sum + ENEMY_BALANCE[enemy.stats.type].weight, 0);
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
    if (this.pointerLock) {
      this.pointerLock.worldPoint(this.cameras.main, this.aimWorldPoint);
    } else {
      this.aimWorldPoint.set(this.input.activePointer.worldX, this.input.activePointer.worldY);
    }
  }

  private pickEnemyType(profile: ReturnType<typeof getSpawnProfile>, now: number, defensePhase: boolean): EnemyType | null {
    const activeCount = (type: EnemyType): number => this.enemies.filter((enemy) => enemy.stats.type === type).length;
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

    const eliteWeightMultiplier = getContract(this.contract)?.eliteCompositionWeightMultiplier ?? 1;
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

  private spawnEnemy(type: EnemyType, defensePhase: boolean): void {
    const base = baseEnemyStats[type];
    const spawn = Phaser.Utils.Array.GetRandom(this.layout.enemySpawns);
    const curve = getDifficultyCurve(this.roundManager.round, this.bombSites.destroyedCount());
    const phaseScale = defensePhase ? 1 : 0.9;

    const stats = {
      ...base,
      hp: Math.round(base.hp * (1 + (curve.healthMultiplier - 1) * phaseScale) * (getContract(this.contract)?.enemyHealthMultiplier ?? 1)),
      speed: Math.round(base.speed * curve.speedMultiplier),
      damage: Math.round(base.damage * (1 + (curve.damageMultiplier - 1) * phaseScale))
    };

    const enemyTexture = type === 'star' ? 'enemy-star' : `enemy-${type}`;
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
    this.physics.add.collider(enemy, this.walls);
    this.physics.add.collider(enemy, this.player, () => {
      const hit = this.player.takeDamage(enemy.stats.damage);
      if (hit) {
        this.audio.playSfx('playerDamage');
        GameplayTelemetryRecorder.recordPlayerDamage('enemy-contact', enemy.stats.damage);
      }
    });

    this.enemies.push(enemy);
    this.navState.set(enemy, {
      path: [],
      waypointIndex: 0,
      nextRepathAt: 0,
      targetKey: '',
      lastSampleX: enemy.x,
      lastSampleY: enemy.y,
      lastSampleAt: this.time.now,
      stuckTicks: 0
    });
    this.patrolTargets.set(enemy, { x: spawn.x, y: spawn.y });
  }

  private updateEnemies(now: number, dt: number): void {
    const activeSites = this.bombSites.getActiveBombSites();
    const activeDefusersBySite = this.activeDefusersBySite;
    activeDefusersBySite.clear();
    this.refreshDefuseAssignments(activeSites, now);

    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.isDead()) continue;
      enemy.updateDamageFlash(now);

      const assignedSite = this.defuseTargetByEnemy.get(enemy);
      const targetSite = assignedSite ?? this.selectEnemyObjective(enemy, activeSites);
      if (enemy.stats.type === 'tank' && !assignedSite) this.updateTankHomingMissile(enemy, now);
      if (!targetSite) {
        this.updateEnemyPatrol(enemy, now);
      } else if (assignedSite && this.defuseAssignees.has(enemy)) {
        if (this.updateDefuser(enemy, assignedSite, now, dt)) {
          activeDefusersBySite.set(assignedSite.id, (activeDefusersBySite.get(assignedSite.id) ?? 0) + 1);
        }
      } else if (enemy.stats.type === 'shooter') {
        this.updateShooter(enemy, now, targetSite);
      } else if (enemy.stats.type === 'disruptor') {
        this.updateDisruptor(enemy, now);
      } else {
        this.updateMelee(enemy, targetSite, now);
      }
    }

    this.activeDefuserCountForTelemetry = 0;
    for (const count of activeDefusersBySite.values()) this.activeDefuserCountForTelemetry += count;

    let anyDefusing = false;
    for (const site of activeSites) {
      const activeDefusers = activeDefusersBySite.get(site.id) ?? 0;
      if (activeDefusers > 0) {
        if (site.state === BombSiteState.Armed) this.activateEmergencyBombShield(site, now);
        this.bombSites.startDefuse(site);
        anyDefusing = true;
        const cooperationMultiplier = 1 + Math.min(0.75, (activeDefusers - 1) * 0.25);
        const requestedProgressMs = dt * 1000 * cooperationMultiplier;
        const shieldBlocked = this.modRuntime.bombShieldBlocks(site.id, now);
        GameplayTelemetryRecorder.recordDefuseProgress(
          site.id,
          shieldBlocked ? 0 : requestedProgressMs,
          shieldBlocked ? requestedProgressMs : 0,
          activeDefusers
        );
        if (!shieldBlocked
          && this.bombSites.applyDefuse(site, requestedProgressMs, OBJECTIVE_CONFIG.defuseRequiredMs)) {
          GameplayTelemetryRecorder.recordDefuseCompleted(site.id);
          this.triggerDefeat('bombDefused');
          return;
        }
      } else {
        this.bombSites.stopDefuse(site);
      }
    }
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

    const desired = getDefuseAssigneeCount(this.roundManager.round) + Math.max(0, activeSites.length - 1);
    const candidates = this.defuseCandidateBuffer;
    candidates.length = 0;
    for (const enemy of this.enemies) {
      if (enemy.active && !enemy.isDead() && now >= enemy.defuseInterruptedUntil) candidates.push(enemy);
    }
    candidates.sort((a, b) => {
        const specialistDifference = Number(b.stats.type === 'defuser') - Number(a.stats.type === 'defuser');
        if (specialistDifference !== 0) return specialistDifference;
        let nearestA = Number.POSITIVE_INFINITY;
        let nearestB = Number.POSITIVE_INFINITY;
        for (const site of activeSites) {
          const aDx = a.x - site.x;
          const aDy = a.y - site.y;
          nearestA = Math.min(nearestA, aDx * aDx + aDy * aDy);
          const bDx = b.x - site.x;
          const bDy = b.y - site.y;
          nearestB = Math.min(nearestB, bDx * bDx + bDy * bDy);
        }
        return nearestA - nearestB;
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
    const tx = toBomb < 260 || Math.random() < 0.42 ? site.x : this.player.x;
    const ty = toBomb < 260 || Math.random() < 0.42 ? site.y : this.player.y;

    this.navigateEnemy(enemy, tx, ty, now, enemy.stats.speed);

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
      return;
    }
    if (now < this.shieldCooldownUntil) {
      GameplayTelemetryRecorder.recordAbilityDenied('shield', 'cooldown');
      return;
    }
    if (!this.player.canSpendEnergy(energyCost)) {
      GameplayTelemetryRecorder.recordEnergyDenied('shield', energyCost, this.player.energy);
      return;
    }

    this.player.spendEnergy(energyCost);
    GameplayTelemetryRecorder.recordAbilityUse('shield', energyCost);

    this.shieldActiveUntil = now + durationMs;
    this.shieldCooldownUntil = now + cooldownMs;
    this.player.invulnUntil = Math.max(this.player.invulnUntil, this.shieldActiveUntil);

    if (!this.shieldOrb) {
      this.shieldOrb = this.add.circle(this.player.x, this.player.y, 30, COLORS.cyan, 0.22)
        .setStrokeStyle(2, COLORS.cyan, 0.8)
        .setDepth(12);
      this.shieldPulseTween = this.tweens.add({
        targets: this.shieldOrb,
        radius: { from: 28, to: 34 },
        alpha: { from: 0.14, to: 0.32 },
        duration: 260,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    this.shieldOrb.setVisible(true);
    this.audio.playSfx('shieldOn');
  }

  private updateShieldState(now: number): void {
    if (!this.shieldOrb) return;
    if (now >= this.shieldActiveUntil) {
      this.destroyShieldOrb();
      return;
    }

    this.shieldOrb.setPosition(this.player.x, this.player.y);
    this.player.invulnUntil = Math.max(this.player.invulnUntil, this.shieldActiveUntil);
  }

  private destroyShieldOrb(): void {
    this.shieldPulseTween?.remove();
    this.shieldPulseTween = null;
    this.shieldOrb?.destroy();
    this.shieldOrb = null;
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
      damage: TANK_HOMING_MISSILE_BALANCE.damage,
      detonated: false
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
      this.spawnProjectileTrail(missile.sprite.x, missile.sprite.y, COLORS.pink);

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
    this.audio.playSfx('mine');

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
        this.audio.playSfx('playerDamage');
        GameplayTelemetryRecorder.recordPlayerDamage('enemy-missile', missile.damage);
      }
      return;
    }

    GameplayTelemetryRecorder.recordProjectileMiss('enemy', cause === 'wall' ? 'wall' : 'expired');
  }

  private updateShooter(enemy: Enemy, now: number, site: BombSiteRuntime): void {
    const turretTarget = this.getSecondaryTurretTarget(enemy, now);
    const focusX = turretTarget?.sprite.x ?? (Math.random() < 0.25 ? site.x : this.player.x);
    const focusY = turretTarget?.sprite.y ?? (Math.random() < 0.25 ? site.y : this.player.y);

    const focusDeltaX = focusX - enemy.x;
    const focusDeltaY = focusY - enemy.y;
    const distanceSquared = focusDeltaX * focusDeltaX + focusDeltaY * focusDeltaY;
    const ideal = 230;
    const movementSpeed = enemy.effectiveSpeed(enemy.stats.speed, now);
    if (distanceSquared > (ideal + 24) * (ideal + 24)) {
      this.navigateEnemy(enemy, focusX, focusY, now, movementSpeed);
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
      this.navigateEnemy(enemy, site.x, site.y, now, enemy.stats.speed);
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

  private navigateEnemy(enemy: Enemy, targetX: number, targetY: number, now: number, speed: number): void {
    speed = enemy.effectiveSpeed(speed, now);
    const nav = this.navState.get(enemy);
    if (!nav) return;

    const body = enemy.body as Phaser.Physics.Arcade.Body | null;
    if (body && (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down)) {
      const bounceX = (body.blocked.left ? 1 : 0) + (body.blocked.right ? -1 : 0);
      const bounceY = (body.blocked.up ? 1 : 0) + (body.blocked.down ? -1 : 0);
      enemy.setVelocity(
        (bounceX + Phaser.Math.FloatBetween(-0.25, 0.25)) * speed,
        (bounceY + Phaser.Math.FloatBetween(-0.25, 0.25)) * speed
      );
      nav.path.length = 0;
      nav.waypointIndex = 0;
      nav.nextRepathAt = now + 70;
      return;
    }

    if (now - nav.lastSampleAt >= 240) {
      const moved = Phaser.Math.Distance.Between(enemy.x, enemy.y, nav.lastSampleX, nav.lastSampleY);
      const targetDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, targetX, targetY);
      if (targetDist > 46 && moved < 5) {
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
        nav.nextRepathAt = now + 45;
        enemy.setVelocity(
          Phaser.Math.FloatBetween(-1, 1) * speed * 0.7,
          Phaser.Math.FloatBetween(-1, 1) * speed * 0.7
        );
        if (nav.stuckTicks >= 3) {
          const recovery = this.pathfinder.findNearestWalkableWorld(enemy.x, enemy.y, 1, 4);
          if (recovery) {
            enemy.setPosition(recovery.x, recovery.y);
            body?.reset(recovery.x, recovery.y);
            nav.lastSampleX = recovery.x;
            nav.lastSampleY = recovery.y;
          }
          nav.stuckTicks = 0;
        }
        return;
      }
    }

    const key = `${Math.floor(targetX / 40)},${Math.floor(targetY / 40)}:${this.fences.length}-${this.mines.length}`;

    if (nav.path.length === 0 || nav.targetKey !== key || now >= nav.nextRepathAt) {
      const penalty = (cx: number, cy: number): number => {
        const w = this.pathfinder.cellToWorld(cx, cy);
        let p = 0;
        for (const m of this.mines) {
          if (!m.armed) continue;
          const d = Phaser.Math.Distance.Between(w.x, w.y, m.sprite.x, m.sprite.y);
          if (d < m.radius + 60) p += ((m.radius + 60 - d) / (m.radius + 60)) * 9;
        }
        for (const f of this.fences) {
          const d = this.distancePointToSegment(
            w.x,
            w.y,
            f.x1,
            f.y1,
            f.x2,
            f.y2
          );
          if (d < 68) p += ((68 - d) / 68) * 6;
        }
        return p;
      };
      nav.path = this.pathfinder.findPath(enemy.x, enemy.y, targetX, targetY, { cellPenalty: penalty, smooth: nav.stuckTicks === 0, maxIterations: 4800 });
      nav.waypointIndex = 0;
      nav.nextRepathAt = now + Phaser.Math.Between(360, 650);
      nav.targetKey = key;
    }

    let waypoint = nav.path[nav.waypointIndex];
    if (waypoint) {
      const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, waypoint.x, waypoint.y);
      if (d < 18 && nav.waypointIndex < nav.path.length - 1) {
        nav.waypointIndex += 1;
        waypoint = nav.path[nav.waypointIndex];
      }
    }

    if (waypoint) {
      const dx = waypoint.x - enemy.x;
      const dy = waypoint.y - enemy.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > 0.2) {
        const inverseDistance = 1 / Math.sqrt(distanceSquared);
        enemy.setVelocity(dx * inverseDistance * speed, dy * inverseDistance * speed);
        return;
      }
    }

    const directX = targetX - enemy.x;
    const directY = targetY - enemy.y;
    const directDistanceSquared = directX * directX + directY * directY;
    if (directDistanceSquared <= 1) {
      enemy.setVelocity(0, 0);
    } else {
      const inverseDistance = 1 / Math.sqrt(directDistanceSquared);
      enemy.setVelocity(directX * inverseDistance * speed, directY * inverseDistance * speed);
    }
  }

  private applyEnemySeparation(): void {
    for (let i = 0; i < this.enemies.length; i += 1) {
      for (let j = i + 1; j < this.enemies.length; j += 1) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 0 || d2 > 31 * 31) continue;
        const d = Math.sqrt(d2);
        const push = (31 - d) * 1.8;
        const nx = dx / d;
        const ny = dy / d;
        const bodyA = a.body as Phaser.Physics.Arcade.Body | null;
        const bodyB = b.body as Phaser.Physics.Arcade.Body | null;
        if (bodyA) {
          bodyA.velocity.x -= nx * push;
          bodyA.velocity.y -= ny * push;
        }
        if (bodyB) {
          bodyB.velocity.x += nx * push;
          bodyB.velocity.y += ny * push;
        }
      }
    }
  }

  private updateProjectiles(delta: number): void {
    this.pendingSplitProjectiles.length = 0;
    const prismaticRounds = this.modRuntime.hasInfusion('prismatic-rounds');
    const jailbrokeTurrets = this.modRuntime.has('jailbroke-turrets');
    const now = this.time.now;
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.projectiles.length; readIndex += 1) {
      const p = this.projectiles[readIndex];
      p.lifeMs -= delta;
      if (p.lifeMs <= 0 || !p.sprite.body) {
        if (p.lifeMs <= 0 && p.telemetryOwner) GameplayTelemetryRecorder.recordProjectileMiss(p.telemetryOwner, 'expired');
        this.retireProjectile(p);
        continue;
      }

      if (this.hitWall(p.sprite.x, p.sprite.y)) {
        if (p.telemetryOwner) GameplayTelemetryRecorder.recordProjectileMiss(p.telemetryOwner, 'wall');
        this.spawnImpact(p.sprite.x, p.sprite.y, p.trailColor);
        this.retireProjectile(p);
        continue;
      }

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
      this.spawnProjectileTrail(p.sprite.x, p.sprite.y, visualTrailColor);

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

      if (p.from === 'player' || p.from === 'turret') {
        if (p.from === 'player') {
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
            this.spawnImpact(p.sprite.x, p.sprite.y, COLORS.cyan);
            this.retireProjectile(p);
            this.audio.playSfx('hit');
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

        const boss = this.bossEncounter?.boss;
        if (boss?.active && !boss.isDefeated
          && (boss.x - p.sprite.x) ** 2 + (boss.y - p.sprite.y) ** 2 < (boss.hazardRadius + 8) ** 2) {
          const applied = boss.takeDamage(p.damage, p.from === 'player' ? 'weapon' : 'turret');
          const overkill = Math.max(0, p.damage - applied);
          if (p.from === 'turret') GameplayTelemetryRecorder.recordTurretHit(p.turretId ?? '', applied, overkill);
          else GameplayTelemetryRecorder.recordProjectileHit('weapon', applied, overkill, p.critical);
          this.spawnImpact(p.sprite.x, p.sprite.y, p.sprite.tintTopLeft);
          this.retireProjectile(p);
          this.audio.playSfx('hit');
          continue;
        }
        const hitEnemy = this.findProjectileHitEnemy(p.sprite.x, p.sprite.y);
        if (hitEnemy) {
          const markedForTurret = this.defuseAssignees.has(hitEnemy) || now < (this.defuserMarkedUntil.get(hitEnemy) ?? 0);
          const conditionalBonus = p.from === 'turret' && this.modRuntime.rank('priority-targeting') === 3 && markedForTurret
            ? this.modRuntime.conditionalDamageBonus([MOD_BALANCE.priorityTargeting.rank3TurretDamageBonus])
            : 0;
          const finalDamage = p.damage * (1 + conditionalBonus);
          const wasAlive = !hitEnemy.isDead();
          const applied = hitEnemy.takeDamage(finalDamage, p.from === 'player' ? 'weapon' : 'turret');
          const overkill = Math.max(0, finalDamage - applied);
          if (p.from === 'turret') GameplayTelemetryRecorder.recordTurretHit(p.turretId ?? '', applied, overkill);
          else GameplayTelemetryRecorder.recordProjectileHit('weapon', applied, overkill, p.critical);
          hitEnemy.defuseProgressMs = 0;
          hitEnemy.defuseInterruptedUntil = now + 800;
          if (wasAlive && hitEnemy.isDead() && p.from === 'player' && p.splitCurrentEligible) {
            this.triggerSplitCurrent(hitEnemy, finalDamage);
          }
          this.spawnImpact(p.sprite.x, p.sprite.y, p.sprite.tintTopLeft);
          this.retireProjectile(p);
          this.audio.playSfx('hit');
          continue;
        }
      }

      if (p.from === 'enemy') {
        if ((this.player.x - p.sprite.x) ** 2 + (this.player.y - p.sprite.y) ** 2 < 16 * 16) {
          const hit = this.player.takeDamage(p.damage);
          if (p.telemetryOwner) GameplayTelemetryRecorder.recordProjectileHit(p.telemetryOwner, hit ? p.damage : 0, 0, false, !hit);
          if (p.bossAttack) GameplayTelemetryRecorder.recordBossAttackIntersection(p.bossAttack, hit ? p.damage : 0, !hit);
          if (hit) {
            this.audio.playSfx('playerDamage');
            GameplayTelemetryRecorder.recordPlayerDamage(p.bossAttack ? 'boss' : 'enemy-projectile', p.damage);
          }
          this.retireProjectile(p);
          continue;
        }

        let hitTurret = false;
        for (const t of this.turrets) {
          if ((t.sprite.x - p.sprite.x) ** 2 + (t.sprite.y - p.sprite.y) ** 2 < 18 * 18) {
            const applied = t.takeDamage(p.damage);
            GameplayTelemetryRecorder.recordTurretDamaged(t.telemetryId, applied);
            if (p.telemetryOwner) GameplayTelemetryRecorder.recordProjectileHit(p.telemetryOwner, applied);
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
        turretId: projectile.turretId
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

  private spawnProjectileTrail(x: number, y: number, color: number): void {
    if (Math.random() < 0.45) return;
    const spark = this.obtainFxCircle({ x, y, radius: Phaser.Math.Between(1, 3), color, alpha: 0.62, depth: 5 });
    this.tweens.add({ targets: spark, alpha: 0, scale: 0.3, duration: 130, onComplete: () => this.retireFxCircle(spark) });
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

  private placeAbility(type: AbilityType, now: number): void {
    const cfg = this.getAbilityConfig(type);
    if (now < this.abilityCooldownUntil[type]) {
      GameplayTelemetryRecorder.recordAbilityDenied(type, 'cooldown');
      return;
    }
    if (!this.player.canSpendEnergy(cfg.energyCost)) {
      GameplayTelemetryRecorder.recordEnergyDenied(type, cfg.energyCost, this.player.energy);
      return;
    }

    const { x, y } = this.getAimWorldPoint();
    if (!this.isValidPlacement(x, y)) {
      GameplayTelemetryRecorder.recordAbilityDenied(type, 'invalid-placement');
      return;
    }

    if (type === 'fence') {
      if (this.fences.length >= cfg.maxActive) {
        GameplayTelemetryRecorder.recordAbilityDenied('fence', 'active-limit');
        return;
      }
      const fence = new Fence(this, x, y, this.player.rotation, SaveSystem.getCosmeticColor('fenceStyle', now), ABILITY_BALANCE.fence.width, cfg.durationMs, cfg.hp, cfg.damage, ABILITY_BALANCE.fence.slowFactor);
      this.fences.push(fence);
    }

    if (type === 'turret') {
      if (this.turrets.length >= cfg.maxActive) {
        GameplayTelemetryRecorder.recordAbilityDenied('turret', 'active-limit');
        return;
      }
      const turret = new Turret(this, x, y, SaveSystem.getCosmeticColor('turretSkin', now), cfg.hp, cfg.damage, cfg.fireRate, cfg.range);
      turret.telemetryId = `turret-${++this.turretTelemetrySequence}`;
      this.turrets.push(turret);
      GameplayTelemetryRecorder.recordTurretPlaced(turret.telemetryId, { maximumHealth: cfg.hp, damage: cfg.damage, fireRate: cfg.fireRate, range: cfg.range });
    }

    if (type === 'mine') {
      if (this.mines.length >= cfg.maxActive) {
        GameplayTelemetryRecorder.recordAbilityDenied('mine', 'active-limit');
        return;
      }
      const mine = new Mine(this, x, y, COLORS.orange, cfg.armMs, cfg.damage, cfg.radius);
      this.mines.push(mine);
    }

    this.player.spendEnergy(cfg.energyCost);
    GameplayTelemetryRecorder.recordAbilityUse(type, cfg.energyCost);
    this.abilityCooldownUntil[type] = now + cfg.cooldownMs;
    this.audio.playSfx('place');
  }

  private updateAbilities(now: number, dt: number): void {
    for (const turret of this.turrets) {
      const enemyTarget = this.getNearestEnemy(turret.sprite.x, turret.sprite.y, turret.range);
      const bossTarget = this.bossEncounter?.boss;
      const bossInRange = Boolean(bossTarget?.active && !bossTarget.isDefeated
        && (bossTarget.x - turret.sprite.x) ** 2 + (bossTarget.y - turret.sprite.y) ** 2 <= turret.range * turret.range);
      const target: { x: number; y: number } | null = bossInRange ? bossTarget! : enemyTarget;
      if (!target) continue;
      const angle = Phaser.Math.Angle.Between(turret.sprite.x, turret.sprite.y, target.x, target.y);
      turret.aimAt(angle);
      if (!turret.canFire(now)) continue;

      turret.lastShotMs = now;
      GameplayTelemetryRecorder.recordTurretShot(turret.telemetryId);
      this.projectiles.push(this.obtainProjectile({
        x: turret.sprite.x, y: turret.sprite.y, texture: 'circle', width: 6, height: 6,
        tint: SaveSystem.getCosmeticColor('projectileColor', now), rotation: angle,
        velocityX: Math.cos(angle) * 560, velocityY: Math.sin(angle) * 560, depth: 0,
        damage: turret.damage, from: 'turret', lifeMs: 1150,
        trailColor: SaveSystem.getCosmeticColor('trailColor', now), telemetryOwner: 'turret', turretId: turret.telemetryId
      }));
    }

    for (const mine of this.mines) {
      mine.update(now);
      if (!mine.armed) continue;
      const bossTarget = this.bossEncounter?.boss;
      const radiusSquared = mine.radius * mine.radius;
      const bossDx = (bossTarget?.x ?? 0) - mine.sprite.x;
      const bossDy = (bossTarget?.y ?? 0) - mine.sprite.y;
      const bossInRange = Boolean(bossTarget?.active && !bossTarget.isDefeated
        && bossDx * bossDx + bossDy * bossDy <= radiusSquared);
      let trigger = bossInRange;
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

      this.audio.playSfx('mine');
      const blast = this.obtainFxCircle({ x: mine.sprite.x, y: mine.sprite.y, radius: 10, color: COLORS.orange, alpha: 0.35, depth: 7 });
      this.tweens.add({ targets: blast, radius: mine.radius, alpha: 0, duration: 280, onComplete: () => this.retireFxCircle(blast) });
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
      if (bossTarget?.active && !bossTarget.isDefeated) {
        const distanceSquared = bossDx * bossDx + bossDy * bossDy;
        if (distanceSquared <= radiusSquared) {
          const d = Math.sqrt(distanceSquared);
          bossTarget.takeDamage(mine.damage * (1 - d / (mine.radius + 1)), 'mine');
        }
      }

      mine.destroy();
      mine.armed = false;
    }

    for (const fence of this.fences) {
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
          enemy.takeDamage(fence.dps * dt, 'fence');
          const body = enemy.body as Phaser.Physics.Arcade.Body | null;
          if (body) enemy.setVelocity(body.velocity.x * fence.slowFactor, body.velocity.y * fence.slowFactor);
          if (enemy.stats.type === 'tank') fence.hp -= 16 * dt;
        }
      }
      const bossTarget = this.bossEncounter?.boss;
      if (bossTarget?.active && !bossTarget.isDefeated) {
        const distance = this.distancePointToSegment(
          bossTarget.x,
          bossTarget.y,
          fence.x1,
          fence.y1,
          fence.x2,
          fence.y2
        );
        if (distance < bossTarget.hazardRadius + 8) {
          bossTarget.takeDamage(fence.dps * dt, 'fence');
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
    for (const mine of this.deathMines) {
      if (now < mine.detonateAt) {
        this.deathMines[writeIndex] = mine;
        writeIndex += 1;
        continue;
      }

      this.audio.playSfx('mine');
      const blast = this.obtainFxCircle({ x: mine.sprite.x, y: mine.sprite.y, radius: 16, color: COLORS.cyan, alpha: 0.28, depth: 8 });
      const ring = this.obtainFxCircle({ x: mine.sprite.x, y: mine.sprite.y, radius: 14, color: 0xffffff, alpha: 0.2, depth: 8 });
      this.tweens.add({ targets: blast, radius: mine.radius, alpha: 0, duration: 360, onComplete: () => this.retireFxCircle(blast) });
      this.tweens.add({ targets: ring, radius: mine.radius * 0.82, alpha: 0, duration: 320, onComplete: () => this.retireFxCircle(ring) });

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

      mine.sprite.destroy();
    }
    this.deathMines.length = writeIndex;
  }

  private updatePickups(now: number, dt: number): void {
    const collectionRadius = this.player.stats.pickupRadius;
    const collectionRadiusSquared = collectionRadius * collectionRadius;
    const magneticField = this.modRuntime.magneticServiceField(collectionRadius);
    const attractionRadiusSquared = magneticField.attractionRadius * magneticField.attractionRadius;
    let writeIndex = 0;
    for (const p of this.pickups) {
      p.sprite.rotation += dt * 2;
      if (now > p.expiresAt) {
        GameplayTelemetryRecorder.recordPickupExpired(p.type);
        p.sprite.destroy();
        continue;
      }
      const dx = this.player.x - p.sprite.x;
      const dy = this.player.y - p.sprite.y;
      const distanceSquared = dx * dx + dy * dy;
      const energyCollectionBlocked = p.type === 'energy'
        && this.player.energy > this.player.energyStats.max * (1 - PICKUP_BALANCE.energyAutoCollectMissingFraction);
      if (distanceSquared < collectionRadiusSquared) {
        if (energyCollectionBlocked) {
          this.pickups[writeIndex] = p;
          writeIndex += 1;
          continue;
        }
        this.collectPickup(p.type, p.source);
        p.sprite.destroy();
        continue;
      }
      if (!energyCollectionBlocked && magneticField.pullSpeed > 0 && distanceSquared < attractionRadiusSquared) {
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
        const spark = this.add.circle(bx, by, Phaser.Math.Between(2, 4), colors[(burst + ray) % colors.length], 1).setDepth(42);
        this.tweens.add({ targets: spark, x: bx + Math.cos(angle) * distance, y: by + Math.sin(angle) * distance, alpha: 0, duration: Phaser.Math.Between(480, 760), ease: 'Cubic.Out', onComplete: () => spark.destroy() });
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
          timer = null;
          return;
        }
        emitBurst();
      }
    });
  }

  private updateArenaHealthDrops(now: number): void {
    if (now < this.nextArenaHealthDropAt) return;

    this.nextArenaHealthDropAt = now + Phaser.Math.Between(
      PICKUP_BALANCE.arenaHealthMinIntervalMs,
      PICKUP_BALANCE.arenaHealthMaxIntervalMs
    );

    const activeHealthDrops = this.pickups.filter((pickup) => pickup.type === 'health').length;
    if (activeHealthDrops >= PICKUP_BALANCE.maxArenaHealthDrops) return;

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const bounds=this.layout.generation.bounds;
      const x = Phaser.Math.Between(bounds.x+100, bounds.x+bounds.w-100);
      const y = Phaser.Math.Between(bounds.y+100, bounds.y+bounds.h-100);
      if (!this.isClearForArenaPickup(x, y)) continue;

      const pickup = this.createPickupSprite('health', x, y, COLORS.green);
      this.tweens.add({ targets: pickup, alpha: { from: 0.45, to: 1 }, yoyo: true, duration: 360, repeat: -1 });
      this.pickups.push({
        type: 'health',
        sprite: pickup,
        expiresAt: now + PICKUP_BALANCE.arenaHealthLifetimeMs,
        source: 'arena-support'
      });
      GameplayTelemetryRecorder.recordPickupDropped('health', 'arena-support');
      return;
    }
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

  private collectPickup(type: PickupType, source: Pickup['source']): void {
    this.audio.playSfx('pickup');
    let requestedRestoration = 0;
    let appliedRestoration = 0;
    if (type === 'health') {
      const before = this.player.hp;
      requestedRestoration = PICKUP_BALANCE.healthRestore * this.modRuntime.multiplier('healthPickupValue');
      this.player.hp = Math.min(this.player.stats.maxHealth, this.player.hp + requestedRestoration);
      appliedRestoration = this.player.hp - before;
    }
    if (type === 'energy') {
      const before = this.player.energy;
      const restored = this.player.energyStats.max * PICKUP_BALANCE.energyRestoreFraction * this.modRuntime.multiplier('energyPickupValue');
      requestedRestoration = restored;
      this.player.energy = Math.min(this.player.energyStats.max, this.player.energy + restored);
      appliedRestoration = this.player.energy - before;
    }
    const buffDurationMs = WEAPON_BALANCE.buffDurationMs * this.modRuntime.multiplier('buffDuration');
    if (type === 'damageBoost') this.player.buffs.damageBoostUntil = this.time.now + buffDurationMs;
    if (type === 'speedBoost') this.player.buffs.speedBoostUntil = this.time.now + buffDurationMs;
    if (type === 'rapidFire') this.player.buffs.rapidFireUntil = this.time.now + buffDurationMs;
    if (type === 'credits') {
      const credits = this.scaleModCredits(PICKUP_BALANCE.credits);
      this.roundCredits += credits;
      this.totalCreditsCollected += credits;
    }
    if (type === 'coreToken') this.roundCoreTokens += 1;
    GameplayTelemetryRecorder.recordPickupCollected(type, source, requestedRestoration, appliedRestoration);

    const t = this.add.text(this.player.x, this.player.y - 24, `+${type}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '18px',
      color: '#96ffe4'
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: t.y - 20, alpha: 0, duration: 620, onComplete: () => t.destroy() });
  }

  private killEnemy(enemy: Enemy): void {
    this.audio.playSfx('enemyDeath');
    const enemyCredits = this.scaleModCredits(enemy.stats.valueCredits);
    this.roundCredits += enemyCredits;
    this.roundCoreTokens += enemy.stats.valueCoreTokens;
    this.totalCreditsCollected += enemyCredits;
    SaveSystem.recordEnemyDestroyed();

    GameplayTelemetryRecorder.recordEnemyKill({
      type: enemy.stats.type,
      maximumHealth: enemy.stats.hp,
      spawnedAtActiveMs: enemy.telemetrySpawnedAtActiveMs,
      firstDamagedAtActiveMs: enemy.telemetryFirstDamagedAtActiveMs,
      finalSource: enemy.lastDamageSource,
      damageBySource: enemy.damageTakenBySource,
      credits: enemyCredits,
      coreTokens: enemy.stats.valueCoreTokens
    });

    this.tryAwardMod(enemy.stats.type === 'star' ? 'eliteEnemy' : 'normalEnemy', false, enemy.x, enemy.y);

    const pickupChance = Math.min(1, PICKUP_BALANCE.enemyDropChance * this.modRuntime.multiplier('enemyPickupChance'));
    if (Math.random() < pickupChance) this.dropPickup(enemy.x, enemy.y);

    if (this.modRuntime.hasInfusion('ghost-echoes')) this.playEnemyGhostEcho(enemy);
    if (this.modRuntime.hasInfusion('arcade-pop')) this.playArcadePop(enemy.x, enemy.y);
    this.createDeathExplosion(enemy.x, enemy.y, enemy.stats.color);

    if (enemy.stats.type === 'star') {
      const mineSprite = this.add.circle(enemy.x, enemy.y, 14, COLORS.cyan, 0.78).setDepth(8);
      mineSprite.setStrokeStyle(3, 0xffffff, 0.95);
      const prePulse = this.add.circle(enemy.x, enemy.y, 20, COLORS.cyan, 0.16).setDepth(7);
      this.tweens.add({
        targets: mineSprite,
        alpha: { from: 0.3, to: 1 },
        duration: 160,
        yoyo: true,
        repeat: 5
      });
      this.tweens.add({ targets: prePulse, radius: 30, alpha: 0, duration: 950, onComplete: () => prePulse.destroy() });

      this.deathMines.push({
        sprite: mineSprite,
        detonateAt: this.time.now + 1000,
        damage: 62,
        radius: 170
      });
    }

    enemy.destroy();
  }

  private playEnemyGhostEcho(enemy: Enemy): void {
    const ghost = this.add.image(enemy.x, enemy.y, enemy.texture.key, enemy.frame.name)
      .setDisplaySize(enemy.displayWidth, enemy.displayHeight)
      .setRotation(enemy.rotation)
      .setTint(0x74f7ff)
      .setAlpha(0.42)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7);
    this.tweens.add({
      targets: ghost,
      y: ghost.y - 42,
      alpha: 0,
      scaleX: 1.22,
      scaleY: 1.22,
      duration: 720,
      ease: 'Cubic.Out',
      onComplete: () => ghost.destroy()
    });
  }

  private playArcadePop(x: number, y: number): void {
    const callouts = ['ZAP!', 'NICE!', 'RAD!', 'POP!', 'NEON!'];
    const index = this.arcadePopSequence++ % callouts.length;
    const label = this.add.text(x, y - 18, callouts[index], {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(this.infusionSpectrumColor(index * 0.14)).rgba,
      stroke: '#020711',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(13).setRotation(Phaser.Math.FloatBetween(-0.1, 0.1));
    this.tweens.add({
      targets: label,
      y: label.y - 34,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      delay: 180,
      duration: 760,
      ease: 'Back.easeOut',
      onComplete: () => label.destroy()
    });
  }

  private tryAwardMod(source: ModDropSource, guaranteed = false, x = this.player.x, y = this.player.y): void {
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
    if (!definition) return;
    const duplicate = Boolean(SaveSystem.getModCollection().inventory[definition.id]?.discovered);
    const result = SaveSystem.addMod(definition.id);
    if (!result.ok) return;
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
        sourceScreenY: sourcePosition.y
      });
    }
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
    const roll = Math.random();
    let type: PickupType = 'credits';
    if (roll < PICKUP_BALANCE.healthShare) type = 'health';
    else if (roll < PICKUP_BALANCE.healthShare + PICKUP_BALANCE.energyShare) type = 'energy';
    else if (roll < PICKUP_BALANCE.healthShare + PICKUP_BALANCE.energyShare + PICKUP_BALANCE.damageBoostShare) type = 'damageBoost';
    else if (roll < PICKUP_BALANCE.healthShare + PICKUP_BALANCE.energyShare + PICKUP_BALANCE.damageBoostShare + PICKUP_BALANCE.speedBoostShare) type = 'speedBoost';
    else if (roll < 1 - PICKUP_BALANCE.creditsShare - PICKUP_BALANCE.coreTokenShare) type = 'rapidFire';
    else if (roll < 1 - PICKUP_BALANCE.coreTokenShare) type = 'credits';
    else type = 'coreToken';

    const colorMap: Record<PickupType, number> = {
      health: COLORS.green,
      energy: COLORS.cyan,
      damageBoost: COLORS.red,
      speedBoost: COLORS.pink,
      rapidFire: COLORS.orange,
      credits: 0xf2ff72,
      coreToken: COLORS.purple
    };

    const p = this.createPickupSprite(type, x, y, colorMap[type]);
    this.tweens.add({ targets: p, alpha: { from: 0.45, to: 1 }, yoyo: true, duration: 280, repeat: -1 });
    this.pickups.push({ type, sprite: p, expiresAt: this.time.now + PICKUP_BALANCE.lifetimeMs, source: 'enemy' });
    GameplayTelemetryRecorder.recordPickupDropped(type, 'enemy');
    return type;
  }

  private createPickupSprite(type: PickupType, x: number, y: number, color: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(6);
    if (this.modRuntime?.hasInfusion('pickup-orbit')) {
      const orbit = this.add.circle(0, 0, 17, color, 0.06).setStrokeStyle(1, color, 0.72);
      const satelliteA = this.add.circle(17, 0, 3, 0xffffff, 0.95).setStrokeStyle(1, color, 1);
      const satelliteB = this.add.circle(-17, 0, 2, color, 0.95).setStrokeStyle(1, 0xffffff, 0.85);
      container.add([orbit, satelliteA, satelliteB]);
    }

    if (type === 'health') {
      const v = this.add.rectangle(0, 0, 5, 16, COLORS.green, 0.95).setStrokeStyle(1, 0xbaffc6, 1);
      const h = this.add.rectangle(0, 0, 16, 5, COLORS.green, 0.95).setStrokeStyle(1, 0xbaffc6, 1);
      const glow = this.add.circle(0, 0, 13, COLORS.green, 0.15).setStrokeStyle(1, COLORS.green, 0.55);
      container.add([glow, v, h]);
      return container;
    }

    if (type === 'energy') {
      const boltPoints = [
        -4, -12,
        2, -12,
        -1, -3,
        6, -3,
        -2, 12,
        1, 3,
        -6, 3
      ];
      const glow = this.add.circle(0, 0, 13, COLORS.cyan, 0.14).setStrokeStyle(1, COLORS.cyan, 0.5);
      const bolt = this.add.polygon(0, 0, boltPoints, COLORS.cyan, 0.95).setStrokeStyle(1, 0xddfbff, 0.95);
      container.add([glow, bolt]);
      return container;
    }

    if (type === 'damageBoost') {
      const glow = this.add.circle(0, 0, 15, color, 0.13).setStrokeStyle(1, color, 0.45);
      const body = this.add.rectangle(-1, -2, 18, 7, color, 0.95).setStrokeStyle(1, 0xffffff, 0.9);
      const barrel = this.add.rectangle(10, -2, 10, 3, 0xffffff, 0.92);
      const grip = this.add.polygon(-4, 5, [0, 0, 6, 0, 3, 10, -2, 10], color, 0.95);
      container.add([glow, body, barrel, grip]);
      return container;
    }

    if (type === 'speedBoost') {
      const glow = this.add.circle(0, 0, 15, color, 0.13).setStrokeStyle(1, color, 0.45);
      const rocket = this.add.polygon(0, -1, [0, -14, 7, -4, 6, 8, 0, 12, -6, 8, -7, -4], color, 0.96)
        .setStrokeStyle(1, 0xffffff, 0.9);
      const flame = this.add.triangle(0, 14, -5, 0, 5, 0, 0, 9, COLORS.orange, 0.92);
      container.add([glow, flame, rocket]);
      return container;
    }

    if (type === 'rapidFire') {
      const glow = this.add.circle(0, 0, 15, color, 0.13).setStrokeStyle(1, color, 0.45);
      const bolts = [-7, 0, 7].map((offset) => this.add.rectangle(offset, 0, 4, 20, color, 0.95)
        .setRotation(0.35).setStrokeStyle(1, 0xffffff, 0.7));
      container.add([glow, ...bolts]);
      return container;
    }

    if (type === 'credits') {
      const diamond = this.add.polygon(0, 0, [0, -11, 10, 0, 0, 11, -10, 0], color, 0.9)
        .setStrokeStyle(2, 0xffffff, 0.8);
      container.add(diamond);
      return container;
    }

    if (type === 'coreToken') {
      const token = this.add.polygon(0, 0, [0, -12, 10, -6, 10, 6, 0, 12, -10, 6, -10, -6], color, 0.88)
        .setStrokeStyle(2, 0xffffff, 0.9);
      const core = this.add.circle(0, 0, 4, 0xffffff, 0.9);
      container.add([token, core]);
      return container;
    }

    const circle = this.add.circle(0, 0, 8, color, 0.85).setStrokeStyle(2, color, 1);
    container.add(circle);
    return container;
  }

  private detonateSite(site: BombSiteRuntime): void {
    if (this.detonatingSiteIds.has(site.id)) return;
    this.detonatingSiteIds.add(site.id);
    this.state.set(this.bombSites.activeBombCount() > 1 ? RoundState.Defense : RoundState.Victory);

    const color = SaveSystem.getCosmeticColor('bombColor', this.time.now);
    const prismBomb = this.prismBombColor;
    this.audio.playSfx('bomb');
    this.cameras.main.shake(760, 0.02);
    this.physics.world.timeScale = 0.35;

    const ring1 = this.add.circle(site.x, site.y, 22, color, 0.38).setDepth(30);
    const ring2 = this.add.circle(site.x, site.y, 18, 0xffffff, 0.22).setDepth(29);
    this.tweens.add({ targets: ring1, radius: 520, alpha: 0, duration: 760, onComplete: () => ring1.destroy() });
    this.tweens.add({ targets: ring2, radius: 360, alpha: 0, duration: 620, onComplete: () => ring2.destroy() });

    for (let i = 0; i < 70; i += 1) {
      const shardColor = prismBomb
        ? SaveSystem.getCosmeticColor('bombColor', this.time.now + i * 75)
        : Math.random() < 0.5 ? color : this.layout.theme.secondary;
      const shard = this.add.rectangle(site.x, site.y, Phaser.Math.Between(2, 5), Phaser.Math.Between(8, 18), shardColor, 0.95).setDepth(31);
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(90, 420);
      this.tweens.add({
        targets: shard,
        x: site.x + Math.cos(a) * dist,
        y: site.y + Math.sin(a) * dist,
        angle: Phaser.Math.Between(-220, 220),
        alpha: 0,
        duration: Phaser.Math.Between(420, 900),
        onComplete: () => shard.destroy()
      });
    }

    if (this.modRuntime.hasInfusion('detonation-fireworks')) this.playDetonationFireworks(site.x, site.y);

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
    this.abilityCooldownUntil.mine = Math.min(this.abilityCooldownUntil.mine, this.time.now + 900);

    const recoveryCredits = this.scaleModCredits(REWARD_BALANCE.siteRecoveryCredits);
    this.roundCredits += recoveryCredits;
    this.totalCreditsCollected += recoveryCredits;

    for (const s of this.bombSites.getRemainingSites()) {
      const pickupType: PickupType = Math.random() < 0.5 ? 'health' : 'energy';
      const px = s.x + Phaser.Math.Between(-20, 20);
      const py = s.y + Phaser.Math.Between(-20, 20);
      const p = this.createPickupSprite(pickupType, px, py, pickupType === 'health' ? COLORS.green : COLORS.cyan);
      this.tweens.add({ targets: p, alpha: { from: 0.45, to: 1 }, yoyo: true, duration: 280, repeat: -1 });
      this.pickups.push({ type: pickupType, sprite: p, expiresAt: this.time.now + 11_000, source: 'site-recovery' });
      GameplayTelemetryRecorder.recordPickupDropped(pickupType, 'site-recovery');
    }
  }

  private completeRound(): void {
    if (this.state.state === RoundState.Victory && this.pendingRoundPayload) return;
    this.showBanner('ALL TARGETS DESTROYED');

    const completedRound = this.roundManager.round;
    const completedSeed = this.layout.seed;
    const completedTemplate = this.layout.template;
    this.tryAwardMod('milestone', isGuaranteedMilestone(completedRound));

    const rawRewardCredits = this.roundCredits + this.scaleModCredits(getRoundCompletionCredits(completedRound));
    const rewardCredits = Math.round(rawRewardCredits * (getContract(this.contract)?.creditRewardMultiplier ?? 1));
    const rewardTokens = this.roundCoreTokens + Math.max(REWARD_BALANCE.completionBaseTokens, Math.floor(completedRound / REWARD_BALANCE.tokenRoundDivisor));
    SaveSystem.addCredits(rewardCredits);
    SaveSystem.addCoreTokens(rewardTokens);
    SaveSystem.recordRoundCompletion(completedRound);
    OnlineRunManager.recordMilestone(completedRound);
    this.captureTelemetryEndState();
    GameplayTelemetryRecorder.endEncounter('completed', { credits: rewardCredits, coreTokens: rewardTokens });

    this.transitionAfterModReveals(1400, () => {
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
        plasmaChipsGained: 0,
        bossDefeated: null,
        protocol: this.protocol,
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

      if (isBossRound(completedRound)) {
        this.beginBossFight(payload);
        return;
      }
      this.registry.set('round-finished', payload);
      this.scene.start(SceneKeys.RoundFinished);
    });
  }

  private beginBossFight(payload: RoundFinishedPayload): void {
    this.cleanupRoundObjects();
    this.pendingRoundPayload = payload;
    this.bossRound = payload.completedRound;
    this.bossVictoryHandled = false;
    this.runCreditsEarned = payload.runCreditsEarned;
    this.roundCredits = 0;
    this.roundCoreTokens = 0;
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
    this.layout = ArenaGenerator.generate(bossSeed, arenaByBoss[archetype], this.bossRound, 1);
    this.drawProceduralArena(this.layout);
    this.pathfinder = new GridPathfinder(WORLD_WIDTH, WORLD_HEIGHT, 32, this.getBlockers(), 8);
    this.createOrMovePlayer();
    this.modRuntime.beginRound(1);
    this.createHudLayer();

    this.bombSites = new BombSiteManager('open', 1);
    this.bombSites.initialize(this, [], this.layout.theme);
    this.laserSecurity = new LaserSecuritySystem(this, this.bossRound, this.layout.theme, (damage) => {
      this.audio.playSfx('playerDamage');
      GameplayTelemetryRecorder.recordPlayerDamage('laser', damage);
    });
    this.bombletHazard = new BombletHazardSystem(
      this,
      this.bossRound,
      bossSeed,
      this.layout.theme,
      this.layout.generation.bounds,
      (x, y) => this.hitWall(x, y),
      this.particlesEnabled,
      (damage) => {
        this.audio.playSfx('playerDamage');
        GameplayTelemetryRecorder.recordPlayerDamage('bomblet', damage);
      }
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
          this.audio.playSfx('playerDamage');
          GameplayTelemetryRecorder.recordPlayerDamage('gas', damage);
        }
      );
    }

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
    this.bossEncounter = new BossEncounter(
      this,
      this.bossRound,
      bossSeed,
      archetype,
      spawn,
      this.layout.generation.bounds,
      (x, y) => this.hitWall(x, y),
      {
        fireProjectile: (spec) => this.spawnBossProjectile(spec),
        damageArea: (x, y, radius, damage, attack) => this.applyBossAreaDamage(x, y, radius, damage, attack),
        dropCredit: (x, y) => this.dropBossCredit(x, y),
        onDamaged: (damage, source) => GameplayTelemetryRecorder.recordBossDamage(source, damage),
        onAttackCast: (attack) => GameplayTelemetryRecorder.recordBossAttackCast(attack),
        onDefeated: () => this.completeBossFight()
      }
    );
    GameplayTelemetryRecorder.startBoss(archetype, this.bossEncounter.boss.maxHp);
    this.physics.add.collider(this.bossEncounter.boss, this.walls);

    this.bossPickupRandom = new SeededRandom((bossSeed ^ 0x51f15e11) >>> 0);
    this.bossSupportSequence = 0;
    this.nextBossSupportPickupAt = this.time.now + BOSS_BALANCE.supportPickupFirstDelayMs;
    this.shieldActiveUntil = 0;
    this.shieldCooldownUntil = 0;
    this.abilityCooldownUntil = { fence: 0, turret: 0, mine: 0 };
    this.destroyShieldOrb();
    this.activePlantingSite = null;
    this.plantingProgressMs = 0;
    this.state.set(RoundState.Defense);
    this.cameras.main.flash(450, 40, 10, 60);
    this.showBanner(`BOSS INTERCEPT\n${BOSS_ARCHETYPES[archetype].label}`);
  }

  private spawnBossProjectile(spec: BossProjectileSpec): void {
    GameplayTelemetryRecorder.recordBossProjectileFired(spec.attack);
    this.projectiles.push(this.obtainProjectile({
      x: spec.x, y: spec.y, texture: 'projectile-orb', width: spec.size ?? 9, height: spec.size ?? 9,
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
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= radius + 12) {
      const hit = this.player.takeDamage(damage);
      GameplayTelemetryRecorder.recordBossAttackIntersection(attack, hit ? damage : 0, !hit);
      if (hit) {
        this.audio.playSfx('playerDamage');
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

  private dropBossCredit(x: number, y: number): void {
    const random = this.bossPickupRandom;
    const angle = random?.float(0, Math.PI * 2) ?? 0;
    const distance = random?.float(28, 72) ?? 42;
    const px = Phaser.Math.Clamp(x + Math.cos(angle) * distance, 50, WORLD_WIDTH - 50);
    const py = Phaser.Math.Clamp(y + Math.sin(angle) * distance, 50, WORLD_HEIGHT - 50);
    const sprite = this.createPickupSprite('credits', px, py, 0xffd65a);
    this.tweens.add({ targets: sprite, alpha: { from: 0.5, to: 1 }, yoyo: true, duration: 320, repeat: -1 });
    this.pickups.push({ type: 'credits', sprite, expiresAt: this.time.now + BOSS_BALANCE.supportPickupLifetimeMs, source: 'boss-damage' });
    GameplayTelemetryRecorder.recordPickupDropped('credits', 'boss-damage');
    GameplayTelemetryRecorder.recordBossCreditDrop();
  }

  private updateBossSupportPickups(now: number): void {
    if (!this.bossEncounter || now < this.nextBossSupportPickupAt || !this.bossPickupRandom) return;
    const supportCount = this.pickups.filter((pickup) => pickup.type === 'health' || pickup.type === 'energy').length;
    if (supportCount >= BOSS_BALANCE.maximumSupportPickups) {
      this.nextBossSupportPickupAt = now + 1800;
      return;
    }

    const bounds = this.layout.generation.bounds;
    let point: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = {
        x: this.bossPickupRandom.float(bounds.x + 80, bounds.x + bounds.w - 80),
        y: this.bossPickupRandom.float(bounds.y + 80, bounds.y + bounds.h - 80)
      };
      if (this.isClearForArenaPickup(candidate.x, candidate.y)
        && Phaser.Math.Distance.Between(candidate.x, candidate.y, this.bossEncounter.boss.x, this.bossEncounter.boss.y) > 150) {
        point = candidate;
        break;
      }
    }
    const interval = this.bossPickupRandom.int(BOSS_BALANCE.supportPickupMinimumIntervalMs, BOSS_BALANCE.supportPickupMaximumIntervalMs);
    this.nextBossSupportPickupAt = now + interval;
    if (!point) return;

    const type: PickupType = this.bossSupportSequence++ % 2 === 0 ? 'health' : 'energy';
    const color = type === 'health' ? COLORS.green : COLORS.cyan;
    const sprite = this.createPickupSprite(type, point.x, point.y, color);
    this.tweens.add({ targets: sprite, alpha: { from: 0.45, to: 1 }, yoyo: true, duration: 300, repeat: -1 });
    this.pickups.push({ type, sprite, expiresAt: now + BOSS_BALANCE.supportPickupLifetimeMs, source: 'boss-support' });
    GameplayTelemetryRecorder.recordPickupDropped(type, 'boss-support');
    this.showBanner(`${type.toUpperCase()} SUPPORT DROP`);
  }

  private completeBossFight(): void {
    if (this.bossVictoryHandled || !this.bossEncounter || !this.pendingRoundPayload) return;
    this.bossVictoryHandled = true;
    this.state.set(RoundState.Victory);
    this.pointerDown = false;
    this.physics.pause();
    this.audio.playSfx('enemyDeath');
    this.createDeathExplosion(this.bossEncounter.boss.x, this.bossEncounter.boss.y, BOSS_ARCHETYPES[this.bossEncounter.archetype].color, true);
    this.bossEncounter.boss.setVisible(false);
    SaveSystem.recordEnemyDestroyed();

    const rewards = getBossRewards(this.bossRound);
    const bossCredits = this.scaleModCredits(rewards.credits);
    const collectedCredits = this.roundCredits;
    const collectedTokens = this.roundCoreTokens;
    SaveSystem.addCredits(collectedCredits + bossCredits);
    SaveSystem.addCoreTokens(collectedTokens + rewards.coreTokens);
    SaveSystem.addPlasmaChips(rewards.plasmaChips);
    this.totalCreditsCollected += bossCredits;
    this.runCreditsEarned += collectedCredits + bossCredits;
    this.tryAwardMod('boss', false, this.bossEncounter.boss.x, this.bossEncounter.boss.y);
    GameplayTelemetryRecorder.recordBossDefeated();
    this.captureTelemetryEndState();
    GameplayTelemetryRecorder.endEncounter('bossDefeated', {
      credits: collectedCredits + bossCredits,
      coreTokens: collectedTokens + rewards.coreTokens,
      plasmaChips: rewards.plasmaChips
    });

    const payload: RoundFinishedPayload = {
      ...this.pendingRoundPayload,
      creditsGained: this.pendingRoundPayload.creditsGained + collectedCredits + bossCredits,
      coreTokensGained: this.pendingRoundPayload.coreTokensGained + collectedTokens + rewards.coreTokens,
      plasmaChipsGained: rewards.plasmaChips,
      bossDefeated: this.bossEncounter.archetype,
      modsEarned: [...this.modsEarned],
      runCreditsEarned: this.runCreditsEarned
    };
    this.pendingRoundPayload = payload;
    this.showBanner(`BOSS DESTROYED\n+${bossCredits.toLocaleString()} CREDITS  +${rewards.coreTokens} TOKENS  +${rewards.plasmaChips} PLASMA`);
    this.transitionAfterModReveals(2200, () => {
      this.registry.set('round-finished', payload);
      this.scene.start(SceneKeys.RoundFinished);
    });
  }

  private triggerDefeat(reason: 'playerDead' | 'bombDefused'): void {
    if (this.state.state === RoundState.Defeat) return;
    if (reason === 'playerDead') {
      this.audio.playSfx('playerDeath');
      this.createDeathExplosion(this.player.x, this.player.y, SaveSystem.getCosmeticColor('playerColor', this.time.now), true);
      this.player.setVisible(false);
    }
    this.state.set(RoundState.Defeat);
    this.audio.stopDisarmLoop();
    this.physics.pause();

    const currentCombatRound = this.currentCombatRound();
    const result: ArenaReward = {
      credits: this.roundCredits,
      runCreditsEarned: this.runCreditsEarned + this.roundCredits,
      coreTokens: this.roundCoreTokens,
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
    this.captureTelemetryEndState();
    GameplayTelemetryRecorder.endEncounter(reason, { credits: result.credits, coreTokens: result.coreTokens });
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

  private refreshHudBuffs(now: number): void {
    this.hudBuffs.length = 0;
    this.appendHudBuff('DAMAGE+', this.player.buffs.damageBoostUntil, now);
    this.appendHudBuff('SPEED+', this.player.buffs.speedBoostUntil, now);
    this.appendHudBuff('RAPID FIRE+', this.player.buffs.rapidFireUntil, now);
  }

  private appendHudBuff(label: string, until: number, now: number): void {
    const seconds = Math.max(0, (until - now) / 1000);
    if (seconds <= 0) return;
    const shown = seconds < 1 ? seconds.toFixed(1) : `${Math.ceil(seconds)}`;
    this.hudBuffs.push(`${label} ${shown}s`);
  }

  private updateHud(now: number): void {
    if (this.bossEncounter) {
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
    const objectiveText = hudFocus
      ? defusingCount > 0
        ? `SITE ${hudFocus.letter} — DEFUSE${activeSummary}`
        : `SITE ${hudFocus.letter} — DEFEND${activeSummary}`
      : targetSite
        ? `SITE ${targetSite.letter} ${targetSite.state === BombSiteState.Planting ? '— PLANTING' : 'AVAILABLE'}`
        : this.state.state === RoundState.Victory ? 'ALL SITES SECURED' : 'OBJECTIVE COMPLETE';

    this.refreshHudBuffs(now);

    const fenceCfg = this.getAbilityConfig('fence');
    const turretCfg = this.getAbilityConfig('turret');
    const mineCfg = this.getAbilityConfig('mine');

    const fenceCdMs = Math.max(0, this.abilityCooldownUntil.fence - now);
    const turretCdMs = Math.max(0, this.abilityCooldownUntil.turret - now);
    const mineCdMs = Math.max(0, this.abilityCooldownUntil.mine - now);
    const shieldCdMs = Math.max(0, this.shieldCooldownUntil - now);

    this.hudPayload.hp = this.player.hp;
    this.hudPayload.maxHp = this.player.stats.maxHealth;
    this.hudPayload.energy = this.player.energy;
    this.hudPayload.maxEnergy = this.player.energyStats.max;
    this.hudPayload.level = this.roundManager.round;
    this.hudPayload.enemies = this.enemies.length;
    this.hudPayload.credits = this.totalCreditsCollected;
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

    turretSlot.cooldownMs = turretCdMs;
    turretSlot.cooldownDurationMs = turretCfg.cooldownMs;
    turretSlot.selected = this.selectedAbility === 'turret';
    turretSlot.hasEnergy = this.player.energy >= turretCfg.energyCost;
    turretSlot.underLimit = this.turrets.length < turretCfg.maxActive;

    mineSlot.cooldownMs = mineCdMs;
    mineSlot.cooldownDurationMs = mineCfg.cooldownMs;
    mineSlot.selected = this.selectedAbility === 'mine';
    mineSlot.hasEnergy = this.player.energy >= mineCfg.energyCost;
    mineSlot.underLimit = this.mines.length < mineCfg.maxActive;

    shieldSlot.cooldownMs = now < this.shieldActiveUntil ? this.shieldActiveUntil - now : shieldCdMs;
    shieldSlot.cooldownDurationMs = now < this.shieldActiveUntil
      ? this.getShieldDurationMs()
      : this.getShieldCooldownMs();
    shieldSlot.active = now < this.shieldActiveUntil;
    shieldSlot.hasEnergy = this.player.energy >= this.getShieldEnergyCost();

    this.hud.update(this.hudPayload);
  }

  private updateBossHud(now: number): void {
    const encounter = this.bossEncounter;
    if (!encounter) return;
    this.refreshHudBuffs(now);

    const fenceCfg = this.getAbilityConfig('fence');
    const turretCfg = this.getAbilityConfig('turret');
    const mineCfg = this.getAbilityConfig('mine');
    this.hudPayload.hp = this.player.hp;
    this.hudPayload.maxHp = this.player.stats.maxHealth;
    this.hudPayload.energy = this.player.energy;
    this.hudPayload.maxEnergy = this.player.energyStats.max;
    this.hudPayload.level = this.bossRound;
    this.hudPayload.enemies = encounter.boss.isDefeated ? 0 : 1;
    this.hudPayload.credits = this.totalCreditsCollected;
    this.hudPayload.phase = this.state.state === RoundState.Paused ? 'PAUSED' : 'BOSS FIGHT';
    this.hudPayload.objective = `ELIMINATE ${BOSS_ARCHETYPES[encounter.archetype].label}`;
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
    turretSlot.cooldownMs = Math.max(0, this.abilityCooldownUntil.turret - now);
    turretSlot.cooldownDurationMs = turretCfg.cooldownMs;
    turretSlot.selected = this.selectedAbility === 'turret';
    turretSlot.hasEnergy = this.player.energy >= turretCfg.energyCost;
    turretSlot.underLimit = this.turrets.length < turretCfg.maxActive;
    mineSlot.cooldownMs = Math.max(0, this.abilityCooldownUntil.mine - now);
    mineSlot.cooldownDurationMs = mineCfg.cooldownMs;
    mineSlot.selected = this.selectedAbility === 'mine';
    mineSlot.hasEnergy = this.player.energy >= mineCfg.energyCost;
    mineSlot.underLimit = this.mines.length < mineCfg.maxActive;
    shieldSlot.cooldownMs = now < this.shieldActiveUntil
      ? this.shieldActiveUntil - now
      : Math.max(0, this.shieldCooldownUntil - now);
    shieldSlot.cooldownDurationMs = now < this.shieldActiveUntil
      ? this.getShieldDurationMs()
      : this.getShieldCooldownMs();
    shieldSlot.active = now < this.shieldActiveUntil;
    shieldSlot.hasEnergy = this.player.energy >= this.getShieldEnergyCost();
    this.hud.update(this.hudPayload);
  }

  private refreshHudRadarContacts(): void {
    this.hudRadarContactCount = 0;
    const playerX = this.player.x;
    const playerY = this.player.y;

    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.isDead()) continue;
      this.appendHudRadarContact('enemy', 'normal', enemy.x - playerX, enemy.y - playerY);
    }

    if (this.bossEncounter?.boss.active && !this.bossEncounter.boss.isDefeated) {
      this.appendHudRadarContact('boss', 'normal', this.bossEncounter.boss.x - playerX, this.bossEncounter.boss.y - playerY);
    } else if (this.bombSites) {
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
    return this.bossEncounter ? this.bossRound : this.roundManager.round;
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
    if (this.bossEncounter?.boss.active && !this.bossEncounter.boss.isDefeated) this.hazardDamageTargets.push(this.bossEncounter.boss);
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
      const turret = new Turret(
        this,
        this.player.x + Math.cos(angle) * 72,
        this.player.y + Math.sin(angle) * 72,
        SaveSystem.getCosmeticColor('turretSkin', now),
        turretCfg.hp, turretCfg.damage, turretCfg.fireRate, turretCfg.range
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
    this.performanceTelemetry.setText(
      `PERF DEV (F6)  avg ${frames.averageMs.toFixed(1)}ms  p95 ${frames.p95Ms.toFixed(1)}ms  max ${frames.maximumMs.toFixed(1)}ms\n`
      + `>33ms ${frames.framesOver33Ms}/${frames.samples}  >50ms ${frames.framesOver50Ms}/${frames.samples}\n`
      + `Enemies ${this.enemies.length}  Projectiles ${this.projectiles.length}  Missiles ${this.homingMissiles.length}\n`
      + `Projectile pool new ${projectiles.created} reuse ${projectiles.reused} free ${projectiles.available}\n`
      + `FX pool new ${fx.created} reuse ${fx.reused} active ${fx.active}`
    );
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
    const color = valid ? 0x6ff6ff : COLORS.red;

    this.crosshair.clear();
    this.crosshair.lineStyle(2, color, 0.95);
    this.crosshair.strokeCircle(x, y, 10);
    this.crosshair.lineBetween(x - 16, y, x - 5, y);
    this.crosshair.lineBetween(x + 5, y, x + 16, y);
    this.crosshair.lineBetween(x, y - 16, x, y - 5);
    this.crosshair.lineBetween(x, y + 5, x, y + 16);
    this.crosshair.fillStyle(color, 0.95);
    this.crosshair.fillCircle(x, y, 1.8);
  }

  private getAbilityConfig(type: AbilityType): {
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
  } {
    const up = this.runUpgrades;
    if (type === 'fence') {
      const upgradedDamage = ABILITY_BALANCE.fence.damage + getUpgradeLevel(up, 'fence.damage') * 4;
      const upgradedHealth = ABILITY_BALANCE.fence.hp + getUpgradeLevel(up, 'fence.health') * 16;
      return {
        energyCost: ABILITY_BALANCE.fence.energyCost * this.modRuntime.multiplier('fenceEnergyCost'),
        cooldownMs: ABILITY_BALANCE.fence.cooldownMs * this.modRuntime.multiplier('fenceCooldown'),
        maxActive: ABILITY_BALANCE.fence.maxActive + getUpgradeLevel(up, 'fence.max') + Math.floor(this.modRuntime.addition('fenceMaxActive')),
        damage: upgradedDamage * this.modRuntime.fenceDamageMultiplier() * this.modRuntime.multiplier('fenceDamage'),
        hp: upgradedHealth * this.modRuntime.fenceHealthMultiplier() * this.modRuntime.multiplier('fenceHealth'),
        durationMs: (ABILITY_BALANCE.fence.durationMs + getUpgradeLevel(up, 'fence.duration') * 1200) * this.modRuntime.multiplier('fenceDuration'),
        range: 0,
        fireRate: 0,
        armMs: 0,
        radius: 0
      };
    }
    if (type === 'turret') {
      return {
        energyCost: ABILITY_BALANCE.turret.energyCost * this.modRuntime.multiplier('turretEnergyCost'),
        cooldownMs: ABILITY_BALANCE.turret.cooldownMs * this.modRuntime.multiplier('turretCooldown'),
        maxActive: ABILITY_BALANCE.turret.maxActive + getUpgradeLevel(up, 'turret.max') + Math.floor(this.modRuntime.addition('turretMaxActive')),
        damage: (ABILITY_BALANCE.turret.damage + getUpgradeLevel(up, 'turret.damage') * 2) * this.modRuntime.multiplier('turretDamage'),
        hp: (ABILITY_BALANCE.turret.hp + getUpgradeLevel(up, 'turret.health') * 20) * this.modRuntime.multiplier('turretHealth'),
        durationMs: 0,
        range: (ABILITY_BALANCE.turret.range + getUpgradeLevel(up, 'turret.range') * 12) * this.modRuntime.multiplier('turretRange'),
        fireRate: (ABILITY_BALANCE.turret.fireRate + getUpgradeLevel(up, 'turret.fireRate') * 0.25) * this.modRuntime.multiplier('turretFireRate'),
        armMs: 0,
        radius: 0
      };
    }

    const upgradedMineDamage = ABILITY_BALANCE.mine.damage + getUpgradeLevel(up, 'mine.damage') * 7;
    const upgradedMineArmMs = Math.max(400, ABILITY_BALANCE.mine.armMs - getUpgradeLevel(up, 'mine.arm') * 70);
    return {
      energyCost: ABILITY_BALANCE.mine.energyCost * this.modRuntime.multiplier('mineEnergyCost'),
      cooldownMs: ABILITY_BALANCE.mine.cooldownMs * this.modRuntime.multiplier('mineCooldown'),
      maxActive: ABILITY_BALANCE.mine.maxActive + getUpgradeLevel(up, 'mine.max') + Math.floor(this.modRuntime.addition('mineMaxActive')),
      damage: upgradedMineDamage * this.modRuntime.mineDamageMultiplier() * this.modRuntime.multiplier('mineDamage'),
      hp: 0,
      durationMs: 0,
      range: 0,
      fireRate: 0,
      armMs: Math.max(100, upgradedMineArmMs * this.modRuntime.mineArmTimeMultiplier() * this.modRuntime.multiplier('mineArmTime')),
      radius: (ABILITY_BALANCE.mine.radius + getUpgradeLevel(up, 'mine.radius') * 7) * this.modRuntime.multiplier('mineRadius')
    };
  }

  private getShieldDurationMs(): number {
    const upgraded = Math.min(
      ABILITY_BALANCE.shield.maximumDurationMs,
      ABILITY_BALANCE.shield.durationMs + getUpgradeEffect(this.runUpgrades, 'player.shieldDuration')
    );
    return upgraded * this.modRuntime.multiplier('shieldDuration');
  }

  private getShieldCooldownMs(): number {
    return ABILITY_BALANCE.shield.cooldownMs * this.modRuntime.multiplier('shieldCooldown');
  }

  private getShieldEnergyCost(): number {
    return ABILITY_BALANCE.shield.energyCost * this.modRuntime.multiplier('shieldEnergyCost');
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
    if (this.state.state === RoundState.Paused) {
      this.resumeGameplay();
      return;
    }

    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();

    this.state.set(RoundState.Paused);
    this.physics.pause();
    this.clearGameplayInput();
    this.pointerLock?.release();
    this.showPauseMenu();
  }

  private clearGameplayInput(): void {
    this.pointerDown = false;
    this.pressedAbilityActions.clear();
    this.player?.setVelocity(0, 0);
    this.input.keyboard?.resetKeys();
  }

  private pauseForLegendaryModReveal(): void {
    this.legendaryRevealPhysicsWasPaused = this.physics.world.isPaused;
    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();
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
  }

  private pauseForPointerLock(reason: 'initial' | 'unlock' | 'blur' | 'hidden' | 'error'): void {
    if (this.state.state === RoundState.Victory || this.state.state === RoundState.Defeat) return;
    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();
    this.clearGameplayInput();
    this.state.set(RoundState.Paused);
    this.physics.pause();
    this.setMenuCursorMode();
    if (reason !== 'initial') {
      this.pointerLock?.hidePrompt();
      this.showPauseMenu();
    }
  }

  private resumeFromPointerLock(): void {
    if (this.state.state !== RoundState.Paused || this.pauseMenu) return;
    this.setGameplayCursorMode();
    if (this.bossEncounter) {
      this.state.set(RoundState.Defense);
      this.physics.resume();
      return;
    }
    const activeSites = this.bombSites.getActiveBombSites();
    const defusing = activeSites.some((site) => site.state === BombSiteState.BeingDefused);
    this.state.set(defusing ? RoundState.Defusing : activeSites.length > 0 ? RoundState.Defense : RoundState.PrePlant);
    if (defusing) this.audio.startDisarmLoop();
    this.physics.resume();
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
    this.modAcquisitionPresenter?.resize(width, height);
    if (this.pauseMenu) {
      this.layoutPauseMenu(width, height);
    }
    if (this.equippedModsViewer) this.showEquippedModsViewer();
  }

  private layoutPauseMenu(width: number, height: number): void {
    if (!this.pauseMenu) return;
    const panelWidth = Math.min(600, width - 40);
    const panelHeight = Math.min(620, height - 32);
    const panelTop = (height - panelHeight) / 2;
    const buttonGap = Math.min(50, Math.max(40, (panelHeight - 220) / Math.max(1, this.pauseMenu.buttons.length - 1)));
    const buttonStartY = panelTop + 174;
    this.pauseMenu.backdrop.setPosition(width * 0.5, height * 0.5).setDisplaySize(width, height);
    this.pauseMenu.panel.setPosition(width * 0.5, height * 0.5).setDisplaySize(panelWidth, panelHeight);
    this.pauseMenu.title.setPosition(width * 0.5, panelTop + 36).setWordWrapWidth(panelWidth - 64, true);
    this.pauseMenu.subtitle.setPosition(width * 0.5, panelTop + 98).setWordWrapWidth(panelWidth - 64, true);
    this.pauseMenu.buttons.forEach((button, index) => button.setPosition(width * 0.5, buttonStartY + index * buttonGap));
  }

  private showPauseMenu(): void {
    this.hidePauseMenu();
    this.setMenuCursorMode();

    const { width, height } = this.scale;
    const backdrop = this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x03060c, 0.72)
      .setScrollFactor(0)
      .setDepth(1185);
    const panel = this.add.rectangle(width * 0.5, height * 0.5, 560, 590, 0x0c1320, 0.96)
      .setStrokeStyle(2, 0x53dfff, 0.9)
      .setScrollFactor(0)
      .setDepth(1190);

    const title = this.add.text(width * 0.5, 0, 'PAUSED', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '44px',
      color: '#70f7ff'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1192);

    const subtitle = this.add.text(
      width * 0.5,
      0,
      `${this.bossEncounter ? `Boss Gate ${this.bossRound}` : `Round ${this.roundManager.round}`} | Seed ${this.layout.seed} | Layout ${this.layout.template}`,
      {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '23px',
        color: '#e1f8ff',
        align: 'center',
        lineSpacing: 3
      }
    ).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1192);

    const buttons = [
      createButton(this, width * 0.5, height * 0.5 - 68, 'Resume', () => this.resumeGameplay(), 280),
      createButton(this, width * 0.5, height * 0.5 - 16, 'Equipped Mod Cards', () => this.showEquippedModsViewer(), 280),
      createButton(this, width * 0.5, height * 0.5 + 36, 'Mod Collection (Next Run)', () => {
        this.hidePauseMenu();
        this.scene.pause();
        this.scene.launch(SceneKeys.Mods, { returnScene: SceneKeys.Arena, resumePausedScene: true });
      }, 280),
      createButton(this, width * 0.5, height * 0.5 + 88, 'Restart From Round 1', () => this.restartFromRoundOne(), 280),
      createButton(this, width * 0.5, height * 0.5 + 140, 'Options', () => {
        this.hidePauseMenu();
        this.scene.launch(SceneKeys.Options, { returnScene: SceneKeys.Arena, resumeGameplay: true });
        this.scene.pause();
      }, 280),
      createButton(this, width * 0.5, height * 0.5 + 192, 'Store', () => {
        this.hidePauseMenu();
        this.scene.pause();
        this.scene.launch(SceneKeys.Upgrades, { returnScene: SceneKeys.Arena, resumePausedScene: true });
      }, 280),
      createButton(this, width * 0.5, height * 0.5 + 244, 'Quit To Main Menu', () => this.quitToMenu(), 280)
    ];
    buttons.forEach((btn) => {
      btn.setScrollFactor(0).setDepth(1195);
      for (const child of btn.list) {
        if ('setScrollFactor' in child && typeof child.setScrollFactor === 'function') {
          child.setScrollFactor(0);
        }
      }
    });

    this.pauseMenu = { backdrop, panel, title, subtitle, buttons };
    this.layoutPauseMenu(width, height);
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
    this.pauseMenu.backdrop.destroy();
    this.pauseMenu.panel.destroy();
    this.pauseMenu.title.destroy();
    this.pauseMenu.subtitle.destroy();
    this.pauseMenu.buttons.forEach((btn) => btn.destroy());
    this.pauseMenu = null;
  }

  private resumeGameplay(): void {
    this.hideEquippedModsViewer();
    this.hidePauseMenu();
    if (this.state.state !== RoundState.Paused) return;
    this.pointerLock?.showResume();
    this.pointerLock?.requestLock();
  }

  private restartFromRoundOne(): void {
    this.captureTelemetryEndState();
    GameplayTelemetryRecorder.endEncounter('quit', { credits: this.roundCredits, coreTokens: this.roundCoreTokens });
    GameplayTelemetryRecorder.finishRun('quit');
    startArenaLoad(this, { reason: 'new-run', message: 'Restarting from round 1...' });
  }

  private quitToMenu(): void {
    this.setMenuCursorMode();
    this.captureTelemetryEndState();
    GameplayTelemetryRecorder.endEncounter('quit', { credits: this.roundCredits, coreTokens: this.roundCoreTokens });
    GameplayTelemetryRecorder.finishRun('quit');
    OnlineRunManager.complete('quit', this.currentCombatRound());
    this.registry.remove('arena-session');
    RunTransitionManager.clearForMenu(this);
    this.scene.start(SceneKeys.MainMenu);
  }

  private cleanupRoundObjects(): void {
    this.bossEncounter?.destroy();
    this.bossEncounter = null;
    this.laserSecurity?.destroy();
    this.laserSecurity = null;
    this.bombletHazard?.destroy();
    this.bombletHazard = null;
    this.gasHazard?.destroy();
    this.gasHazard = null;
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) this.retireProjectile(p);
    this.projectilePool.releaseAll();
    this.fxCirclePool.releaseAll();
    for (const missile of this.homingMissiles) missile.sprite.destroy();
    for (const p of this.pickups) p.sprite.destroy();
    for (const f of this.fences) f.destroy();
    for (const t of this.turrets) t.destroy();
    for (const m of this.mines) m.destroy();
    for (const m of this.deathMines) m.sprite.destroy();
    this.bombSites?.destroy();
    this.destroyShieldOrb();

    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.homingMissiles.length = 0;
    this.pickups.length = 0;
    this.fences.length = 0;
    this.turrets.length = 0;
    this.mines.length = 0;
    this.deathMines.length = 0;
    this.pendingSplitProjectiles.length = 0;
    this.defuseAssignees.clear();
    this.nextHoloAfterimageAt = 0;
    this.arcadePopSequence = 0;

    this.children.list
      .filter((obj) => 'depth' in obj
        && (obj as { depth: number }).depth <= 4
        && obj !== this.player
        && !this.projectilePool.owns(obj)
        && !this.fxCirclePool.owns(obj))
      .forEach((obj) => obj.destroy());
  }

  private cleanup(): void {
    this.audio.stopPlantingLoop();
    this.audio.stopDisarmLoop();
    this.modAcquisitionPresenter?.destroy();
    this.modAcquisitionPresenter = null;
    this.scale.off('resize', this.handleResize, this);
    this.events.off('resume-from-options', this.onResumeFromOptions);
    this.events.off('return-from-mod-collection', this.onReturnFromModCollection);
    this.events.off('return-from-store', this.onReturnFromStore);
    this.events.off('quit-from-store', this.onQuitFromStore);
    this.hud?.destroy();
    this.siteActionText?.destroy();
    this.bannerText?.destroy();
    this.crosshair?.destroy();
    this.balanceTelemetry?.destroy();
    this.balanceTelemetry = null;
    this.performanceTelemetry?.destroy();
    this.performanceTelemetry = null;
    this.hidePauseMenu();
    this.hideEquippedModsViewer();
    this.bombSites?.destroy();
    this.laserSecurity?.destroy();
    this.laserSecurity = null;
    this.bombletHazard?.destroy();
    this.bombletHazard = null;
    this.gasHazard?.destroy();
    this.gasHazard = null;
    this.bossEncounter?.destroy();
    this.bossEncounter = null;
    this.destroyShieldOrb();
    this.projectilePool?.destroy((projectile) => projectile.sprite.destroy());
    this.fxCirclePool?.destroy((circle) => circle.destroy());
    this.pendingSplitProjectiles.length = 0;
    this.input.off('pointerdown', this.onPointerDown);
    this.input.off('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onAbilityKeyDown);
    this.pointerLock?.destroy();
    this.pointerLock = null;
    this.setMenuCursorMode();
  }
}
