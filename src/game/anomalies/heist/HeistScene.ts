import Phaser from 'phaser';
import { ABILITY_BALANCE, PICKUP_BALANCE, PLAYER_BALANCE, WEAPON_BALANCE, getDifficultyCurve } from '../../config/balance/index.ts';
import { COLORS } from '../../config/constants.ts';
import { applyEnemyDamageMode, applyEnemyHealthMode, getProtocolModeBalance } from '../../config/modeBalance.ts';
import { normalizeControllerSettings } from '../../config/controllerSettings.ts';
import { normalizeAimSettings, type AimSettings } from '../../config/interfaceSettings.ts';
import { compactBindingLabel } from '../../config/controls.ts';
import { SceneKeys } from '../../flow/SceneKeys.ts';
import { PlayerInput } from '../../input/PlayerInput.ts';
import { MineSalvoInput, type MineSalvoInputResolution } from '../../input/MineSalvoInput.ts';
import { baseEnemyStats, Enemy, type EnemyStats } from '../../enemies/Enemy.ts';
import { ENEMY_ROBOT_FRAMES } from '../../enemies/EnemyRobotFrames.ts';
import { Player } from '../../entities/Player.ts';
import { Fence } from '../../abilities/Fence.ts';
import { Turret } from '../../abilities/Turret.ts';
import { Mine } from '../../abilities/Mine.ts';
import { getMineRackEnergyCost, getMineRackPatternOffsets } from '../../abilities/MineRackSalvo.ts';
import { resolveFenceSplitStage } from '../../abilities/FenceSplitRules.ts';
import { getCosmeticById } from '../../../data/cosmetics.ts';
import { SaveSystem } from '../../systems/SaveSystem.ts';
import { AudioManager } from '../../systems/AudioManager.ts';
import { Hud, type HudPayload, type HudRadarContact } from '../../systems/Hud.ts';
import { BoostVisualSystem, type BoostFxCircleSpawn } from '../../systems/BoostVisualSystem.ts';
import { SeededRandom } from '../../systems/SeededRandom.ts';
import { selectEnemyPickup } from '../../player/PickupDropTable.ts';
import { ReusableObjectPool } from '../../performance/ReusableObjectPool.ts';
import { UniformSpatialGrid } from '../../performance/UniformSpatialGrid.ts';
import { ProjectileTrailBatch } from '../../performance/ProjectileTrailBatch.ts';
import { MineExplosionVfx } from '../../vfx/MineExplosionVfx.ts';
import { OperativeShieldEffect } from '../../vfx/OperativeShieldEffect.ts';
import { PlayerMuzzleFlashVfx } from '../../vfx/PlayerMuzzleFlashVfx.ts';
import { nextPickupBuffStack, resourcePickupCap } from '../../player/OverdriveRules.ts';
import { resolveMineFrameAppearance } from '../../cosmetics/MineFrameAppearance.ts';
import { resolveProjectileCosmeticPresentation } from '../../cosmetics/ProjectileCosmeticPresentation.ts';
import { drawReticle } from '../../ui/ReticleRenderer.ts';
import { createPauseMenuView, type PauseMenuView } from '../../ui/PauseMenuUi.ts';
import { MOD_BALANCE } from '../../mods/modBalance.ts';
import { splitCurrentSecondaryDamage } from '../../mods/ModRules.ts';
import {
  SCATTERSHOT_ANGLE_OFFSETS,
  TEMPORARY_AMMO_BALANCE,
  grenadeArcHeight,
  grenadeBounceCountForSequence,
  grenadeFireIntervalMs,
  grenadeProximityCheckDue,
  grenadeProximityFuseContains,
  initialGrenadeProximityCheckAt,
  nextGrenadeProximityCheckAt,
  type TemporaryAmmoMode
} from '../../player/TemporaryAmmoMode.ts';
import { RICOCHET_MAX_WALL_BOUNCES, reflectRicochetVelocity } from '../../player/RicochetRules.ts';
import { createAnomalyAudioHooks } from '../AnomalyAudioHooks.ts';
import { AnomalyPortalVisual } from '../AnomalyPortalVisual.ts';
import { recordAnomalyMetric } from '../AnomalyTelemetry.ts';
import type {
  AnomalyMetricName,
  AnomalyReturnResult,
  HeistSessionData,
  PendingAnomalyLoot
} from '../types.ts';
import { HEIST_BALANCE, HEIST_WORLD } from './HeistConfig.ts';
import { createHeistFacility, type HeistFacilityRuntime } from './HeistFacility.ts';
import { HeistRewardService, type HeistContainerReward } from './HeistRewardService.ts';
import { HeistLootPickupSystem } from './HeistLootPickupSystem.ts';
import { HeistTrapSystem } from './HeistTrapSystem.ts';
import { HeistPerformanceProfiler } from './HeistPerformanceProfiler.ts';
import { HeistCameraPresentation } from './HeistCameraPresentation.ts';
import {
  GAMEPLAY_PICKUP_COLOR_BY_TYPE,
  GAMEPLAY_PICKUP_SFX_BY_TYPE,
  GameplayPickupPresentation
} from '../../loot/GameplayPickupPresentation.ts';
import type { PickupType } from '../../types.ts';

type HeistPhase = 'inbound' | 'vault-opening' | 'looting' | 'egress-delay' | 'egress-ready' | 'escape' | 'returning';
type ProjectileOwner = 'player' | 'enemy' | 'turret';

interface HeistProjectile {
  sprite: Phaser.Physics.Arcade.Image;
  owner: ProjectileOwner;
  damage: number;
  lifeMs: number;
  trailColor: number;
  critical: boolean;
  ricochetsRemaining: number;
  ammoMode: TemporaryAmmoMode;
  previousX: number;
  previousY: number;
  nextTrailAt: number;
  crossedFences: Set<Fence>;
  grenadeShadow?: Phaser.GameObjects.Arc;
  grenadeBouncesRemaining?: number;
  grenadeTotalBounces?: number;
  grenadeBounceStartedAt?: number;
  grenadeNextBounceAt?: number;
  grenadeArcHeightMax?: number;
  grenadeFuseAt?: number;
  grenadeArmedAt?: number;
  grenadeNextProximityCheckAt?: number;
  grenadeDetonated?: boolean;
  nativePalette?: boolean;
  emissiveColor?: number;
}

interface HeistProjectileSpawn extends Omit<HeistProjectile, 'sprite' | 'crossedFences' | 'nextTrailAt'> {
  texture: string;
  width: number;
  height: number;
  tint: number;
  rotation: number;
  velocityX: number;
  velocityY: number;
  crossedFences?: ReadonlySet<Fence>;
}

interface HeistContainer {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  cracks: Phaser.GameObjects.Graphics;
  maximumHp: number;
  hp: number;
  opened: boolean;
  index: number;
}

interface HeistPickup {
  kind: PickupType;
  root: Phaser.GameObjects.Container;
  expiresAt: number;
  source: 'support' | 'enemy';
  provisionalReward?: HeistContainerReward;
}

const isSessionData = (value: unknown): value is HeistSessionData => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HeistSessionData>;
  return candidate.anomalyId === 'heist' && typeof candidate.sessionId === 'string' && !!candidate.player && !!candidate.abilities;
};

const emptyLoot = (): PendingAnomalyLoot => ({ credits: 0, coreTokens: 0, plasmaChips: 0, fluxCores: 0, modIds: [] });

export class HeistScene extends Phaser.Scene {
  private readonly audio = createAnomalyAudioHooks();
  private readonly coreAudio = AudioManager.get();
  private session!: HeistSessionData;
  private player!: Player;
  private inputController!: PlayerInput;
  private facility!: HeistFacilityRuntime;
  private cameraPresentation: HeistCameraPresentation | null = null;
  private trapSystem!: HeistTrapSystem;
  private random!: SeededRandom;
  private rewards!: HeistRewardService;
  private lootPickups!: HeistLootPickupSystem;
  private pickupPresentation!: GameplayPickupPresentation;
  private pendingLoot: PendingAnomalyLoot = emptyLoot();
  private phase: HeistPhase = 'inbound';
  private elapsedMs = 0;
  private phaseStartedAt = 0;
  private enemies: Enemy[] = [];
  private projectiles: HeistProjectile[] = [];
  private projectilePool!: ReusableObjectPool<HeistProjectile, HeistProjectileSpawn>;
  private fxCirclePool!: ReusableObjectPool<Phaser.GameObjects.Arc, BoostFxCircleSpawn>;
  private projectileTrails!: ProjectileTrailBatch;
  private muzzleFlashVfx!: PlayerMuzzleFlashVfx;
  private boostVisual!: BoostVisualSystem;
  private mineExplosionVfx!: MineExplosionVfx;
  private containers: HeistContainer[] = [];
  private pickups: HeistPickup[] = [];
  private fences: Fence[] = [];
  private turrets: Turret[] = [];
  private mines: Mine[] = [];
  private extractionPortal: AnomalyPortalVisual | null = null;
  private extractionPortalIdleStarted = false;
  private hud!: Hud;
  private hudPayload!: HudPayload;
  private readonly hudBuffs: string[] = [];
  private readonly hudRadarContacts: HudRadarContact[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private lootText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private announcementText!: Phaser.GameObjects.Text;
  private crosshair!: Phaser.GameObjects.Graphics;
  private shieldVisual: OperativeShieldEffect | null = null;
  private nextPlayerShotAt = 0;
  private damageDealt = 0;
  private damageTaken = 0;
  private containersOpened = 0;
  private miniBossEncountered = false;
  private miniBossKilled = false;
  private returning = false;
  private returnResultDelivered = false;
  private pendingFadeReturn: { success: boolean; reason: 'extracted' | 'player-dead' | 'extraction-timeout' } | null = null;
  private inputCapturePaused = false;
  private manuallyPaused = false;
  private pauseMenu: PauseMenuView | null = null;
  private aimSettings!: AimSettings;
  private projectileTextureKey = 'projectile-pulse';
  private projectileWidth = 8;
  private projectileHeight = 8;
  private projectileNativePalette = false;
  private readonly aimScratch = new Phaser.Math.Vector2();
  private readonly mineSalvoInput = new MineSalvoInput();
  private pendingMineSalvo = false;
  private nextHoloAfterimageAt = 0;
  private grenadeProjectileSequence = 0;
  private readonly enemySpatialGrid = new UniformSpatialGrid<Enemy>(64);
  private readonly navigationTargetScratch = { x: 0, y: 0 };
  private separationSubject: Enemy | null = null;
  private separationSteerX = 0;
  private separationSteerY = 0;
  private grenadeFuseQueryX = 0;
  private grenadeFuseQueryY = 0;
  private grenadeFuseQueryProximity = false;
  private grenadeFuseQueryCandidate: Enemy | null = null;
  private grenadeFuseQueryCandidateDistanceSquared = Number.POSITIVE_INFINITY;
  private grenadeSplashX = 0;
  private grenadeSplashY = 0;
  private grenadeSplashRadiusSquared = 0;
  private grenadeSplashDamage = 0;
  private grenadeSplashExcludedEnemy: Enemy | null = null;
  private nextPoolMaintenanceAt = 0;
  private escapeDeadline = 0;
  private nextEscapeReinforcementAt = 0;
  private escapeReinforcementSequence = 0;
  private movementSnaredUntil = 0;
  private enemyLootSequence = 0;
  private performanceProfiler = import.meta.env.DEV ? new HeistPerformanceProfiler() : null;
  private devPerformanceOverlay: Phaser.GameObjects.Text | null = null;
  private devRenderStartedAt = 0;
  private devPhysicsUpdateStartedAt = 0;
  private nextDevPerformanceOverlayAt = 0;
  private devFirstCombatFrameReported = false;
  private readonly findGrenadeFuseNeighbor = (enemy: Enemy): void => {
    if (!enemy.active || enemy.hp <= 0) return;
    const dx = enemy.x - this.grenadeFuseQueryX;
    const dy = enemy.y - this.grenadeFuseQueryY;
    const distanceSquared = dx * dx + dy * dy;
    const directHitRadius = enemy.stats.size * 0.55 + 6;
    const withinTrigger = this.grenadeFuseQueryProximity
      ? grenadeProximityFuseContains(dx, dy)
      : distanceSquared <= directHitRadius * directHitRadius;
    if (!withinTrigger
      || distanceSquared >= this.grenadeFuseQueryCandidateDistanceSquared) return;
    this.grenadeFuseQueryCandidateDistanceSquared = distanceSquared;
    this.grenadeFuseQueryCandidate = enemy;
  };
  private readonly applyGrenadeSplashNeighbor = (enemy: Enemy): void => {
    if (enemy === this.grenadeSplashExcludedEnemy || !enemy.active || enemy.hp <= 0) return;
    const dx = enemy.x - this.grenadeSplashX;
    const dy = enemy.y - this.grenadeSplashY;
    if (dx * dx + dy * dy > this.grenadeSplashRadiusSquared) return;
    this.damageEnemy(enemy, this.grenadeSplashDamage);
  };
  private readonly applyEnemySeparationNeighbor = (other: Enemy): void => {
    const enemy = this.separationSubject;
    if (!enemy || other === enemy || !other.active) return;
    const offsetX = enemy.x - other.x;
    const offsetY = enemy.y - other.y;
    const distanceSquared = offsetX * offsetX + offsetY * offsetY;
    if (distanceSquared <= 0 || distanceSquared >= 34 * 34) return;
    this.separationSteerX += offsetX / distanceSquared * 80;
    this.separationSteerY += offsetY / distanceSquared * 80;
  };

  constructor() { super(SceneKeys.Heist); }

  private get modRuntime() { return this.session.sharedRuntime.modRuntime; }
  private get temporaryAmmo() { return this.session.sharedRuntime.temporaryAmmo; }
  private get turretWeaponSync() { return this.session.sharedRuntime.turretWeaponSync; }
  private get mineChargeRack() { return this.session.sharedRuntime.mineChargeRack; }
  private get abilityState() { return this.session.abilityState; }

  create(data?: unknown): void {
    if (!isSessionData(data)) {
      this.scene.wake(SceneKeys.Arena);
      this.scene.stop();
      return;
    }
    const devCreateStartedAt = import.meta.env.DEV ? performance.now() : 0;
    this.resetSessionState();
    this.session = data;
    const settings = SaveSystem.get().settings;
    this.aimSettings = normalizeAimSettings(settings.aim);
    this.resolveProjectileCosmetics();
    this.createCombatPools();
    this.muzzleFlashVfx = new PlayerMuzzleFlashVfx(this, settings.particles);
    this.boostVisual = new BoostVisualSystem(
      this,
      settings.particles,
      { obtain: (state) => this.fxCirclePool.obtain(state), release: (circle) => this.fxCirclePool.release(circle) },
      (sampleTime) => SaveSystem.getCosmeticColor('dashTrail', sampleTime),
      () => getCosmeticById(SaveSystem.getEquippedCosmeticId('dashTrail'))?.dashTrailEffect ?? 'ion'
    );
    this.mineExplosionVfx = new MineExplosionVfx(this, settings.particles);
    this.random = new SeededRandom((data.seed ^ 0x4e1a57 ^ Math.imul(data.round, 0x27d4eb2d)) >>> 0);
    this.rewards = new HeistRewardService(data.seed, data.round, data.protocol, data.cost);
    this.pickupPresentation = new GameplayPickupPresentation(
      this,
      () => this.modRuntime.hasInfusion('pickup-orbit')
    );
    this.lootPickups = new HeistLootPickupSystem(this, this.rewards, this.pickupPresentation);
    this.pendingLoot = this.rewards.createEmpty();
    this.physics.world.setBounds(0, 0, HEIST_WORLD.width, HEIST_WORLD.height);
    this.cameras.main.setBounds(0, 0, HEIST_WORLD.width, HEIST_WORLD.height);
    this.cameras.main.setBackgroundColor(0x02050a);
    this.facility = createHeistFacility(this, (data.seed ^ Math.imul(data.round, 0x45d9f3b)) >>> 0);
    if (import.meta.env.DEV) console.debug('[HEIST lifecycle] facility-ready', {
      elapsedMs: performance.now() - devCreateStartedAt,
      facility: this.facility.diagnostics
    });
    this.createPlayer();
    if (this.time.now < this.abilityState.shieldActiveUntil) {
      this.shieldVisual = new OperativeShieldEffect(this, this.player);
    }
    this.inputController = new PlayerInput(this, settings.abilityBindings, normalizeControllerSettings(settings.controller));
    if (data.initialInputDevice) this.inputController.adoptDevice(data.initialInputDevice);
    this.input.keyboard?.resetKeys();
    this.createVaultContainers();
    this.createHud();
    this.createSupportPickups();
    this.trapSystem = new HeistTrapSystem(this, this.facility.trapPlacements, {
      damagePlayer: (amount) => this.damagePlayer(amount),
      snarePlayer: (until) => { this.movementSnaredUntil = Math.max(this.movementSnaredUntil, until); },
      playSfx: (name) => this.coreAudio.playSfx(name)
    });
    this.spawnInfiltrationPatrols();
    this.crosshair = this.add.graphics().setDepth(20_050);
    this.input.setDefaultCursor('none');
    this.audio.play('facility-arrival');
    this.audio.play('corridor-ambience');
    this.announce('ANOMALY TRANSIT COMPLETE', 'HEIST // SECURITY FACILITY 07');
    this.cameras.main.fadeIn(540, 208, 255, 255);
    this.scale.on('resize', this.handleResize, this);
    if (import.meta.env.DEV) {
      const debug = globalThis as typeof globalThis & {
        forceHeistAmbush?: () => void;
        forceHeistExtraction?: () => void;
        forceHeistReturn?: (success?: boolean) => boolean;
        n3onHeistPerf?: () => Record<string, unknown>;
      };
      debug.forceHeistAmbush = () => {
        for (const container of this.containers) container.opened = true;
        this.containersOpened = this.containers.length;
        this.facility.setVaultDoorOpen(true);
        this.startAmbush();
      };
      debug.forceHeistExtraction = () => {
        this.startAmbush();
      };
      debug.forceHeistReturn = (success = true) => {
        if (this.returning) return false;
        this.returning = true;
        this.phase = 'returning';
        this.returnToArena(success, success ? 'extracted' : 'player-dead');
        return true;
      };
      debug.n3onHeistPerf = () => this.createDevPerformanceSnapshot();
      this.input.keyboard?.on('keydown-F6', this.toggleDevPerformanceOverlay, this);
      this.events.on(Phaser.Scenes.Events.PRE_RENDER, this.onDevPreRender, this);
      this.events.on(Phaser.Scenes.Events.RENDER, this.onDevRender, this);
      this.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.onDevPreUpdate, this);
      this.events.on(Phaser.Scenes.Events.UPDATE, this.onDevPhysicsUpdateComplete, this);
      console.debug('[HEIST lifecycle] scene-created', {
        createMs: performance.now() - devCreateStartedAt,
        ...this.createDevPerformanceSnapshot()
      });
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    if (import.meta.env.DEV && data.dev?.instantReturn) {
      this.events.once(Phaser.Scenes.Events.POST_UPDATE, this.onDevInstantReturn, this);
    }
  }

  private readonly onDevInstantReturn = (): void => {
    if (this.returning) return;
    this.returning = true;
    this.phase = 'returning';
    this.returnToArena(true, 'extracted');
  };

  private resetSessionState(): void {
    this.pendingLoot = emptyLoot();
    this.phase = 'inbound';
    this.elapsedMs = 0;
    this.phaseStartedAt = 0;
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.containers.length = 0;
    this.pickups.length = 0;
    this.fences.length = 0;
    this.turrets.length = 0;
    this.mines.length = 0;
    this.extractionPortal = null;
    this.extractionPortalIdleStarted = false;
    this.hudBuffs.length = 0;
    this.hudRadarContacts.length = 0;
    this.shieldVisual = null;
    this.nextPlayerShotAt = 0;
    this.grenadeProjectileSequence = 0;
    this.enemySpatialGrid.clear();
    this.separationSubject = null;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.containersOpened = 0;
    this.miniBossEncountered = false;
    this.miniBossKilled = false;
    this.returning = false;
    this.returnResultDelivered = false;
    this.pendingFadeReturn = null;
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.onDevInstantReturn, this);
    this.inputCapturePaused = false;
    this.manuallyPaused = false;
    this.pauseMenu = null;
    this.pendingMineSalvo = false;
    this.mineSalvoInput.cancel();
    this.nextHoloAfterimageAt = 0;
    this.nextPoolMaintenanceAt = 0;
    this.devFirstCombatFrameReported = false;
    this.escapeDeadline = 0;
    this.nextEscapeReinforcementAt = 0;
    this.escapeReinforcementSequence = 0;
    this.movementSnaredUntil = 0;
    this.enemyLootSequence = 0;
    if (import.meta.env.DEV) this.performanceProfiler = new HeistPerformanceProfiler();
  }

  private resolveProjectileCosmetics(): void {
    const presentation = resolveProjectileCosmeticPresentation(
      getCosmeticById(SaveSystem.getEquippedCosmeticId('projectileShape'))
    );
    this.projectileTextureKey = presentation.textureKey;
    this.projectileWidth = presentation.displayWidth;
    this.projectileHeight = presentation.displayHeight;
    this.projectileNativePalette = presentation.preserveNativePalette;
  }

  private createCombatPools(): void {
    const configureProjectile = (projectile: HeistProjectile, state: HeistProjectileSpawn): void => {
      const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
      if (body) {
        body.enable = true;
        body.reset(state.previousX, state.previousY);
        body.setVelocity(state.velocityX, state.velocityY);
      }
      const nativePalette = state.nativePalette ?? (
        state.owner !== 'enemy'
        && state.ammoMode === 'normal'
        && state.texture === this.projectileTextureKey
        && this.projectileNativePalette
      );
      projectile.sprite.setActive(true).setVisible(true).setPosition(state.previousX, state.previousY)
        .setTexture(state.texture).setOrigin(0.5).setDisplaySize(state.width, state.height).clearTint()
        .setAlpha(1).setRotation(state.rotation).setDepth(9);
      if (!nativePalette) projectile.sprite.setTint(state.tint);
      if (body && nativePalette) {
        body.setSize(
          8 / Math.max(0.001, Math.abs(projectile.sprite.scaleX)),
          8 / Math.max(0.001, Math.abs(projectile.sprite.scaleY)),
          true
        );
      } else if (body) body.setSize(projectile.sprite.width, projectile.sprite.height, true);
      projectile.owner = state.owner;
      projectile.damage = state.damage;
      projectile.lifeMs = state.lifeMs;
      projectile.trailColor = state.trailColor;
      projectile.critical = state.critical;
      projectile.ricochetsRemaining = state.ricochetsRemaining;
      projectile.ammoMode = state.ammoMode;
      projectile.previousX = state.previousX;
      projectile.previousY = state.previousY;
      projectile.nextTrailAt = this.time.now;
      projectile.grenadeBouncesRemaining = state.grenadeBouncesRemaining ?? 0;
      projectile.grenadeTotalBounces = state.grenadeTotalBounces ?? 0;
      projectile.grenadeBounceStartedAt = state.grenadeBounceStartedAt ?? 0;
      projectile.grenadeNextBounceAt = state.grenadeNextBounceAt ?? 0;
      projectile.grenadeArcHeightMax = state.grenadeArcHeightMax ?? 0;
      projectile.grenadeFuseAt = state.grenadeFuseAt ?? 0;
      projectile.grenadeArmedAt = state.grenadeArmedAt ?? 0;
      projectile.grenadeNextProximityCheckAt = state.grenadeNextProximityCheckAt ?? 0;
      projectile.grenadeDetonated = false;
      projectile.nativePalette = nativePalette;
      projectile.emissiveColor = state.emissiveColor ?? state.tint;
      projectile.crossedFences.clear();
      if (state.crossedFences) for (const fence of state.crossedFences) projectile.crossedFences.add(fence);
      if (projectile.ammoMode === 'grenade') {
        projectile.grenadeShadow ??= this.add.circle(state.previousX, state.previousY + 3, 7, 0x02050a, 0.42)
          .setStrokeStyle(1, state.tint, 0.28).setDepth(8);
        projectile.grenadeShadow.setActive(true).setVisible(true).setPosition(state.previousX, state.previousY + 3)
          .setScale(1).setAlpha(0.42).setStrokeStyle(1, state.tint, 0.28);
      } else projectile.grenadeShadow?.setActive(false).setVisible(false).setPosition(-10_000, -10_000);
    };
    this.projectilePool = new ReusableObjectPool<HeistProjectile, HeistProjectileSpawn>(
      (state) => {
        const projectile: HeistProjectile = {
          sprite: this.physics.add.image(state.previousX, state.previousY, state.texture),
          owner: state.owner,
          damage: state.damage,
          lifeMs: state.lifeMs,
          trailColor: state.trailColor,
          critical: state.critical,
          ricochetsRemaining: state.ricochetsRemaining,
          ammoMode: state.ammoMode,
          previousX: state.previousX,
          previousY: state.previousY,
          nextTrailAt: 0,
          crossedFences: new Set<Fence>()
        };
        configureProjectile(projectile, state);
        return projectile;
      },
      configureProjectile,
      (projectile) => {
        const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
        if (body) { body.stop(); body.enable = false; }
        projectile.sprite.setActive(false).setVisible(false).setPosition(-10_000, -10_000);
        projectile.crossedFences.clear();
        projectile.sprite.setOrigin(0.5);
        projectile.grenadeBouncesRemaining = 0;
        projectile.grenadeTotalBounces = 0;
        projectile.grenadeBounceStartedAt = 0;
        projectile.grenadeNextBounceAt = 0;
        projectile.grenadeArcHeightMax = 0;
        projectile.grenadeFuseAt = 0;
        projectile.grenadeArmedAt = 0;
        projectile.grenadeNextProximityCheckAt = 0;
        projectile.grenadeDetonated = false;
        projectile.nativePalette = false;
        projectile.emissiveColor = undefined;
        projectile.grenadeShadow?.setActive(false).setVisible(false).setPosition(-10_000, -10_000);
      }
    );
    const configureCircle = (circle: Phaser.GameObjects.Arc, state: BoostFxCircleSpawn): void => {
      circle.setActive(true).setVisible(true).setPosition(state.x, state.y).setRadius(state.radius)
        .setScale(1).setAlpha(1).setFillStyle(state.color, state.alpha).setDepth(state.depth)
        .setStrokeStyle(state.strokeWidth ?? 0, state.strokeColor ?? state.color, state.strokeAlpha ?? 0);
    };
    this.fxCirclePool = new ReusableObjectPool(
      (state: BoostFxCircleSpawn) => { const circle = this.add.circle(state.x, state.y, state.radius); configureCircle(circle, state); return circle; },
      configureCircle,
      (circle) => { this.tweens.killTweensOf(circle); circle.setActive(false).setVisible(false).setPosition(-10_000, -10_000); }
    );
    this.projectileTrails = new ProjectileTrailBatch(this);
  }

  update(_time: number, delta: number): void {
    if (this.returning) return;
    const profiler = import.meta.env.DEV ? this.performanceProfiler : null;
    profiler?.beginFrame(delta);
    const now = this.time.now;
    const dt = Math.min(delta, 100) / 1000;
    this.elapsedMs += Math.min(delta, 250);
    this.player.updatePresentation(now);
    this.inputController.update(this.manuallyPaused || this.inputCapturePaused ? 'paused' : 'gameplay');
    if (this.inputController.pressed('pause')) {
      if (this.manuallyPaused) this.resumeHeist();
      else this.pauseHeist();
    }
    this.updateInputCapture();
    profiler?.mark('presentationInput');
    this.facility.update(now, this.player.x, this.player.y);
    this.cameraPresentation?.update(delta, this.facility.isPresentationOpenArea());
    this.extractionPortal?.update(now);
    this.updateCrosshair();
    this.mineExplosionVfx.update(now);
    this.coreAudio.setLowHealthWarning(!this.manuallyPaused && !this.inputCapturePaused
      && this.player.hp > 0 && this.player.hp <= this.player.stats.maxHealth * 0.25);
    profiler?.mark('facilityAndVfx');
    if (this.inputCapturePaused || this.manuallyPaused) {
      this.player.setVelocity(0, 0);
      this.muzzleFlashVfx.reset();
      this.updateHud(now);
      profiler?.mark('hudMaintenance');
      profiler?.finishFrame();
      if (import.meta.env.DEV) this.updateDevPerformanceOverlay(now);
      return;
    }
    this.player.updateEnergy(dt);
    this.updatePlayerMovement(now);
    this.updatePlayerCombat(now);
    this.muzzleFlashVfx.update(now);
    this.updateAbilities(now);
    this.facility.prepareNavigationTarget(this.player.x, this.player.y);
    profiler?.mark('playerCombatAndMods');
    this.enemySpatialGrid.rebuild(this.enemies);
    this.updateProjectiles(now, delta);
    profiler?.mark('projectiles');
    this.updateEnemies(now, dt);
    profiler?.mark('enemies');
    this.updateMines(now);
    this.updateFences(now, dt);
    this.updateTurrets(now);
    profiler?.mark('deployables');
    this.updatePickups(now);
    const pickupField = this.modRuntime.magneticServiceField(this.player.stats.pickupRadius);
    this.lootPickups.update(now, dt, this.player.x, this.player.y, this.player.stats.pickupRadius,
      pickupField.attractionRadius, pickupField.pullSpeed,
      (reward, x, y) => this.collectLoot(reward, x, y));
    this.trapSystem.update(now, this.player.x, this.player.y,
      getProtocolModeBalance(this.session.protocol).hazardDamageMultiplier);
    this.updateMission(now);
    this.updateEscapeReinforcements(now);
    profiler?.mark('pickupsHazardsMission');
    this.updateHud(now);
    this.maintainCombatPools(now);
    profiler?.mark('hudMaintenance');
    profiler?.finishFrame();
    if (import.meta.env.DEV) this.updateDevPerformanceOverlay(now);
    if (import.meta.env.DEV && !this.devFirstCombatFrameReported && this.enemies.length > 0) {
      this.devFirstCombatFrameReported = true;
      console.debug('[HEIST lifecycle] first-combat-frame', this.createDevPerformanceSnapshot());
    }
    if (this.player.isDead()) this.failHeist();
  }

  private maintainCombatPools(now: number): void {
    if (now < this.nextPoolMaintenanceAt) return;
    this.nextPoolMaintenanceAt = now + 2_000;
    const projectileStats = this.projectilePool.stats();
    if (projectileStats.active < 256 && projectileStats.available > 960) {
      this.projectilePool.trimAvailable(640, (projectile) => {
        projectile.grenadeShadow?.destroy();
        projectile.sprite.destroy();
      }, 96);
    }
    const fxStats = this.fxCirclePool.stats();
    if (fxStats.active < 64 && fxStats.available > 512) {
      this.fxCirclePool.trimAvailable(256, (circle) => circle.destroy(), 64);
    }
  }

  private createPlayer(): void {
    const source = this.session.player;
    const start = this.facility.layout.entryPoint;
    this.player = new Player(this, start.x, start.y, source.textureKey, { ...source.stats }, { ...source.energyStats }, { ...source.weapon });
    // Preserve valid Overdrive/Supreme overhealth and overcharge exactly as
    // they existed at the anomaly threshold. The anomaly is the same run.
    this.player.hp = Math.max(0, source.hp);
    this.player.energy = Math.max(0, source.energy);
    this.player.heat = Phaser.Math.Clamp(source.heat, 0, source.weapon.maxHeat);
    this.player.invulnUntil = source.invulnUntil;
    this.player.lastDashMs = source.lastDashMs;
    this.player.dashUntil = source.dashUntil;
    this.player.modSpeedBoostUntil = source.modSpeedBoostUntil;
    this.player.modSpeedMultiplier = source.modSpeedMultiplier;
    this.player.buffs = source.buffs;
    this.player.permanentModSpeedMultiplier = source.permanentSpeedMultiplier;
    this.player.setAppearanceResolver((timeMs) => SaveSystem.getOperativeFrameAppearance(timeMs));
    this.player.restoreOperativeAppearance(this.time.now, true);
    if (source.tint !== null) this.player.setTint(source.tint);
    this.physics.add.collider(this.player, this.facility.walls);
    this.physics.add.collider(this.player, this.facility.vaultDoors);
    this.cameraPresentation = new HeistCameraPresentation(
      this.cameras.main,
      this.player,
      this.facility.layout.vaultBounds
    );
  }

  private createVaultContainers(): void {
    const count = this.random.int(HEIST_BALANCE.containerMinimum, HEIST_BALANCE.containerMaximum);
    const positions = this.facility.containerPoints;
    for (let index = 0; index < count; index += 1) {
      const point = positions[index];
      const color = index % 2 ? 0xff4fd8 : 0x58f5ff;
      const glow = this.add.rectangle(0, 3, 90, 67, color, 0.1).setStrokeStyle(2, color, 0.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      const shadow = this.add.ellipse(4, 28, 82, 22, 0x000000, 0.66);
      const chassis = this.add.graphics();
      chassis.fillStyle(0x050a11, 0.9).fillPoints([
        new Phaser.Geom.Point(-38, -16), new Phaser.Geom.Point(29, -16),
        new Phaser.Geom.Point(40, -7), new Phaser.Geom.Point(40, 26),
        new Phaser.Geom.Point(-30, 26), new Phaser.Geom.Point(-40, 17)
      ], true);
      chassis.fillStyle(0x122b3b, 1).fillPoints([
        new Phaser.Geom.Point(-34, -22), new Phaser.Geom.Point(27, -22),
        new Phaser.Geom.Point(35, -14), new Phaser.Geom.Point(35, 20),
        new Phaser.Geom.Point(-34, 20)
      ], true);
      chassis.fillStyle(0x1c3d4c, 0.95).fillPoints([
        new Phaser.Geom.Point(-34, -22), new Phaser.Geom.Point(27, -22),
        new Phaser.Geom.Point(35, -14), new Phaser.Geom.Point(-27, -14)
      ], true);
      chassis.fillStyle(0x07131e, 1).fillPoints([
        new Phaser.Geom.Point(27, -22), new Phaser.Geom.Point(35, -14),
        new Phaser.Geom.Point(35, 20), new Phaser.Geom.Point(27, 14)
      ], true);
      chassis.lineStyle(2, color, 0.94).strokePoints([
        new Phaser.Geom.Point(-34, -22), new Phaser.Geom.Point(27, -22),
        new Phaser.Geom.Point(35, -14), new Phaser.Geom.Point(35, 20),
        new Phaser.Geom.Point(-34, 20), new Phaser.Geom.Point(-34, -22)
      ]);
      chassis.lineStyle(1, 0xbffbff, 0.3).strokeRect(-27, -8, 54, 21);
      const body = this.add.rectangle(0, 2, 54, 21, 0x0a1822, 1).setStrokeStyle(1, color, 0.48);
      const stripe = this.add.rectangle(0, -13, 54, 4, color, 0.9).setBlendMode(Phaser.BlendModes.ADD);
      const lockHousing = this.add.rectangle(0, 2, 17, 17, 0x03070d, 1).setStrokeStyle(2, color, 0.92);
      const lockCore = this.add.circle(0, 2, 4, color, 0.9).setStrokeStyle(1, 0xffffff, 0.9)
        .setBlendMode(Phaser.BlendModes.ADD);
      const braceLeft = this.add.rectangle(-29, 2, 5, 31, 0x193746, 1).setStrokeStyle(1, color, 0.68);
      const braceRight = this.add.rectangle(29, 2, 5, 31, 0x193746, 1).setStrokeStyle(1, color, 0.68);
      const cracks = this.add.graphics();
      const label = this.add.text(0, 27, `SEC-${String(index + 1).padStart(2, '0')} // SEALED`, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: '#c9faff', fontStyle: 'bold', letterSpacing: 1
      }).setOrigin(0.5);
      const root = this.add.container(point.x, point.y,
        [shadow, glow, chassis, body, stripe, braceLeft, braceRight, lockHousing, lockCore, cracks, label]).setDepth(7);
      this.tweens.add({
        targets: [glow, lockCore], alpha: { from: 0.28, to: 0.82 }, scaleX: { from: 0.9, to: 1.12 },
        scaleY: { from: 0.9, to: 1.12 }, duration: 780 + index * 37, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut'
      });
      const maximumHp = 54 + this.session.round * 2.2;
      this.containers.push({ root, body, cracks, maximumHp, hp: maximumHp, opened: false, index });
    }
  }

  private createHud(): void {
    const width = this.scale.width;
    this.hud = new Hud(this, SaveSystem.get().settings.hud);
    this.createHudPayload();
    this.titleText = this.add.text(width * 0.5, 132, 'ANOMALY // HEIST', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: '#ff63dc', stroke: '#030912', strokeThickness: 5
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20_000);
    this.objectiveText = this.add.text(width * 0.5, 156, 'INFILTRATE THE VAULT', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#8ef9ff', backgroundColor: '#06121de6',
      padding: { x: 14, y: 6 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20_000);
    this.lootText = this.add.text(width - 18, 136, '', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#ffe16d', align: 'right', backgroundColor: '#06121de6',
      padding: { x: 10, y: 6 }
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(20_000);
    this.promptText = this.add.text(width * 0.5, this.scale.height - 48, '', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '20px', color: '#ffffff', backgroundColor: '#0a1525e8',
      padding: { x: 18, y: 10 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20_000).setVisible(false);
    this.announcementText = this.add.text(width * 0.5, this.scale.height * 0.32, '', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '32px', color: '#ff63dc', align: 'center',
      stroke: '#02050a', strokeThickness: 9
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20_100).setAlpha(0);
  }

  private createHudPayload(): void {
    const bindings = SaveSystem.get().settings.abilityBindings;
    const slot = (id: 'fence' | 'turret' | 'mine' | 'shield', label: string, keybind: string) => ({
      id, keybind, icon: id, label, cooldownMs: 0, cooldownDurationMs: 1,
      selected: false, hasEnergy: true, underLimit: true, count: 0,
      capacity: id === 'shield' ? null : 1
    });
    const wallet = SaveSystem.get();
    this.hudPayload = {
      hp: this.player.hp, maxHp: this.player.stats.maxHealth,
      energy: this.player.energy, maxEnergy: this.player.energyStats.max,
      level: this.session.round, enemies: 0,
      credits: wallet.credits, coreTokens: wallet.coreTokens,
      plasmaChips: SaveSystem.getModCollection().plasmaChips, fluxCores: wallet.fluxCores,
      phase: 'ANOMALY', objective: 'INFILTRATE THE VAULT', objectiveTimerMs: null,
      defuseAlert: false, bombUrgent: false, bombActive: false, bombProgress: 0,
      buffs: this.hudBuffs,
      abilities: [
        slot('fence', 'FENCE', this.inputController.prompt('fence', compactBindingLabel(bindings.fence))),
        slot('turret', 'TURRET', this.inputController.prompt('turret', compactBindingLabel(bindings.turret))),
        slot('mine', 'MINE', this.inputController.prompt('mine', compactBindingLabel(bindings.mine))),
        slot('shield', 'SHIELD', this.inputController.prompt('shield', compactBindingLabel(bindings.shield)))
      ],
      radarRange: 700, radarContacts: this.hudRadarContacts
    };
    this.hud.update(this.hudPayload);
  }


  private createSupportPickups(): void {
    for (const entry of this.facility.supportPoints) {
      this.pickups.push({
        kind: entry.kind,
        root: this.pickupPresentation.create(entry.kind, entry.x, entry.y).setDepth(8),
        expiresAt: Number.POSITIVE_INFINITY,
        source: 'support'
      });
    }
  }

  private updatePlayerMovement(now: number): void {
    const move = this.inputController.move;
    const aim = this.getAimPoint();
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    const forwardFacingFrame = this.player.texture.key === 'player-spaceship' || this.player.texture.key === 'player-airplane';
    this.player.setRotation(angle + (forwardFacingFrame ? 0 : Math.PI / 2));
    if (now < this.movementSnaredUntil || this.trapSystem.isMovementSnared(now)) {
      this.player.setVelocity(0, 0);
    } else if (now >= this.player.dashUntil) {
      const lengthSquared = move.x * move.x + move.y * move.y;
      if (lengthSquared > 0) {
        const scale = this.inputController.activeDevice === 'gamepad'
          ? this.player.speed
          : this.player.speed / Math.sqrt(Math.max(1, lengthSquared));
        this.player.setVelocity(move.x * scale, move.y * scale);
      } else this.player.setVelocity(0, 0);
    }
    if (this.inputController.pressed('dash')) {
      if (!this.player.canDash(now) || !this.player.canSpendEnergy(PLAYER_BALANCE.dashEnergyCost)) {
        this.coreAudio.playSfx('unavailable');
      } else {
        this.player.spendEnergy(PLAYER_BALANCE.dashEnergyCost);
        this.player.dashTowardPoint(aim.x, aim.y, now);
        this.coreAudio.playSfx('boost');
        this.boostVisual.start(this.player, angle, now, this.player.dashUntil);
      }
    }
    this.boostVisual.update(this.player, now);
    if (this.modRuntime.hasInfusion('holo-afterimage') && now < this.player.dashUntil && now >= this.nextHoloAfterimageAt) {
      this.nextHoloAfterimageAt = now + 72;
      const echo = this.add.image(this.player.x, this.player.y, this.player.texture.key)
        .setRotation(this.player.rotation).setScale(this.player.scaleX, this.player.scaleY)
        .setTint(SaveSystem.getCosmeticColor('playerColor', now)).setAlpha(0.27).setDepth(7);
      this.tweens.add({ targets: echo, alpha: 0, scaleX: echo.scaleX * 1.12, scaleY: echo.scaleY * 1.12,
        duration: 310, onComplete: () => echo.destroy() });
    }

    if (this.inputController.pressed('selectFence')) this.abilityState.selectedAbility = 'fence';
    if (this.inputController.pressed('selectTurret')) this.abilityState.selectedAbility = 'turret';
    if (this.inputController.pressed('selectMine')) this.abilityState.selectedAbility = 'mine';
    this.updateMineSalvoInput(now);
    if (this.inputController.pressed('fence')) this.placeFence(now);
    if (this.inputController.pressed('turret')) this.placeTurret(now);
    if (!this.modRuntime.has('full-rack-salvo') && this.inputController.pressed('mine')) this.placeMine(now);
    if (this.pendingMineSalvo) {
      this.pendingMineSalvo = false;
      this.placeFullRackSalvo(now, aim.x, aim.y);
    }
  }

  private updatePlayerCombat(now: number): void {
    if (!this.inputController.held('fire') || this.player.heat >= this.player.weapon.maxHeat) return;
    const ammoMode = this.temporaryAmmo.activeMode(now);
    const cadence = ammoMode === 'grenade'
      ? grenadeFireIntervalMs(this.player.weapon.fireRate)
      : 1000 / this.player.fireRate;
    if (now < this.nextPlayerShotAt) return;
    const corruptedCost = this.modRuntime.has('fractured-current') ? MOD_BALANCE.fracturedCurrent.extraShotEnergyCost : 0;
    const cost = (WEAPON_BALANCE.energyCostPerShot + corruptedCost) * this.modRuntime.multiplier('weaponEnergyCost');
    if (!this.player.canSpendEnergy(cost)) return;
    this.player.spendEnergy(cost);
    this.player.heat += this.player.weapon.heatPerShot;
    this.nextPlayerShotAt = now + cadence;
    const aim = this.getAimPoint();
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    const critical = this.random.next() < this.player.weapon.critChance;
    const criticalMultiplier = WEAPON_BALANCE.critMultiplier * this.modRuntime.multiplier('weaponCritDamage');
    const damage = this.player.weapon.damage * this.player.damageMultiplier * (critical ? criticalMultiplier : 1);
    const projectileColor = SaveSystem.getCosmeticColor('projectileColor', now);
    const trailColor = SaveSystem.getCosmeticColor('trailColor', now);
    const ricochets = now < this.player.buffs.ricochetUntil ? RICOCHET_MAX_WALL_BOUNCES : 0;
    const x = this.player.x + Math.cos(angle) * 14;
    const y = this.player.y + Math.sin(angle) * 14;
    if (ammoMode === 'scattershot') {
      for (const offset of SCATTERSHOT_ANGLE_OFFSETS) {
        this.spawnPlayerAmmoProjectile(ammoMode, x, y, angle + offset, damage, projectileColor, trailColor, critical, ricochets);
      }
    } else this.spawnPlayerAmmoProjectile(ammoMode, x, y, angle, damage, projectileColor, trailColor, critical, ricochets);
    this.muzzleFlashVfx.emit(
      x,
      y,
      angle,
      projectileColor,
      now,
      ammoMode === 'scattershot' ? 1.18 : ammoMode === 'grenade' ? 1.1 : 1
    );
    this.coreAudio.playSfx('shot');
  }

  private updateAbilities(now: number): void {
    if (this.inputController.pressed('shield')) this.activateShield(now);
    if (this.shieldVisual) {
      this.shieldVisual.update(this.player, now);
      if (now >= this.abilityState.shieldActiveUntil) {
        this.shieldVisual.destroy();
        this.shieldVisual = null;
        this.coreAudio.playSfx('shieldOff');
      }
    }
  }

  private activateShield(now: number): void {
    if (now < this.abilityState.shieldCooldownUntil || !this.player.canSpendEnergy(this.session.abilities.shieldEnergyCost)) {
      this.coreAudio.playSfx('unavailable');
      return;
    }
    this.player.spendEnergy(this.session.abilities.shieldEnergyCost);
    this.abilityState.shieldActiveUntil = now + this.session.abilities.shieldDurationMs;
    this.abilityState.shieldCooldownUntil = now + this.session.abilities.shieldCooldownMs;
    this.shieldVisual?.destroy();
    this.shieldVisual = new OperativeShieldEffect(this, this.player);
    this.coreAudio.playSfx('shieldOn');
  }

  private placeFence(now: number): void {
    const cfg = this.session.abilities.fence;
    const aim = this.getAimPoint();
    if (now < this.abilityState.cooldownUntil.fence || this.fences.length >= cfg.maxActive
      || !this.player.canSpendEnergy(cfg.energyCost) || !this.isValidPlacement(aim.x, aim.y)) {
      this.coreAudio.playSfx('unavailable');
      return;
    }
    this.player.spendEnergy(cfg.energyCost);
    this.abilityState.cooldownUntil.fence = now + cfg.cooldownMs;
    this.fences.push(new Fence(this, aim.x, aim.y, this.player.rotation,
      SaveSystem.getCosmeticColor('fenceStyle', now), ABILITY_BALANCE.fence.width,
      cfg.durationMs, cfg.hp, cfg.damage, ABILITY_BALANCE.fence.slowFactor));
    this.coreAudio.playSfx('electricFence');
  }

  private placeTurret(now: number): void {
    const cfg = this.session.abilities.turret;
    const aim = this.getAimPoint();
    if (now < this.abilityState.cooldownUntil.turret || this.turrets.length >= cfg.maxActive
      || !this.player.canSpendEnergy(cfg.energyCost) || !this.isValidPlacement(aim.x, aim.y)) {
      this.coreAudio.playSfx('unavailable');
      return;
    }
    this.player.spendEnergy(cfg.energyCost);
    this.abilityState.cooldownUntil.turret = now + cfg.cooldownMs;
    const cosmetic = getCosmeticById(SaveSystem.getEquippedCosmeticId('turretSkin'));
    this.turrets.push(new Turret(this, aim.x, aim.y, SaveSystem.getCosmeticColor('turretSkin', now),
      cfg.hp, cfg.damage, cfg.fireRate, cfg.range, cosmetic?.turretSkinEffect, cosmetic?.accentColor));
    this.coreAudio.playSfx('placeTurret');
  }

  private placeMine(now: number): void {
    const cfg = this.session.abilities.mine;
    const aim = this.getAimPoint();
    if (this.mineChargeRack.availability(now, cfg.cooldownMs) !== 'ready'
      || !this.player.canSpendEnergy(cfg.energyCost) || !this.isValidPlacement(aim.x, aim.y)) {
      this.coreAudio.playSfx('unavailable');
      return;
    }
    if (!this.mineChargeRack.spend(now, cfg.cooldownMs)) return;
    this.player.spendEnergy(cfg.energyCost);
    this.mines.push(new Mine(
      this, aim.x, aim.y, COLORS.orange, cfg.armMs, cfg.damage, cfg.radius,
      undefined, undefined,
      resolveMineFrameAppearance(getCosmeticById(SaveSystem.getEquippedCosmeticId('mineFrame')))
    ));
    this.coreAudio.playSfx('placeMine');
  }

  private updateMineSalvoInput(now: number): void {
    if (!this.modRuntime.has('full-rack-salvo')) {
      this.mineSalvoInput.cancel();
      this.pendingMineSalvo = false;
      return;
    }
    const queue = (resolution: MineSalvoInputResolution | null): void => {
      if (resolution === 'tap') this.placeMine(now);
      if (resolution === 'salvo') this.pendingMineSalvo = true;
    };
    if (this.inputController.pressed('mine')) this.mineSalvoInput.press('action:mine', now);
    if (this.inputController.released('mine')) queue(this.mineSalvoInput.release('action:mine', now));
    queue(this.mineSalvoInput.update(now));
  }

  private placeFullRackSalvo(now: number, aimX: number, aimY: number): void {
    const salvo = this.modRuntime.fullRackSalvo();
    if (!salvo) return;
    const cfg = this.session.abilities.mine;
    const count = this.mineChargeRack.snapshot(now, cfg.cooldownMs).currentCharges;
    const cost = getMineRackEnergyCost(cfg.energyCost, count, salvo.energyCostMultiplier);
    const rotation = Phaser.Math.Angle.Between(this.player.x, this.player.y, aimX, aimY) + Math.PI / 4;
    const points = getMineRackPatternOffsets(count, salvo.spacing, rotation)
      .map((offset) => ({ x: aimX + offset.x, y: aimY + offset.y }));
    if (count <= 0 || !this.player.canSpendEnergy(cost) || points.some((point) => !this.isValidPlacement(point.x, point.y))
      || !this.mineChargeRack.spendMany(now, cfg.cooldownMs, count)) {
      this.coreAudio.playSfx('unavailable');
      return;
    }
    const mineFrame = resolveMineFrameAppearance(getCosmeticById(SaveSystem.getEquippedCosmeticId('mineFrame')));
    points.forEach((point, index) => this.mines.push(new Mine(this, point.x, point.y, COLORS.orange,
      cfg.armMs, cfg.damage, cfg.radius, { fromX: this.player.x, fromY: this.player.y,
        durationMs: salvo.flightMs, delayMs: index * salvo.staggerMs }, undefined, mineFrame)));
    this.player.spendEnergy(cost);
    this.time.delayedCall(salvo.flightMs, () => this.coreAudio.playSfx('placeMine'));
  }

  private isValidPlacement(x: number, y: number): boolean {
    if (x < 92 || y < 92 || x > HEIST_WORLD.width - 92 || y > HEIST_WORLD.height - 92) return false;
    if (this.pointBlocked(x, y)) return false;
    return !this.containers.some((container) => !container.opened
      && Math.abs(container.root.x - x) < 52 && Math.abs(container.root.y - y) < 44);
  }

  private spawnProjectile(owner: ProjectileOwner, x: number, y: number, angle: number, speed: number, damage: number, color: number, lifeMs: number): void {
    const projectile = this.projectilePool.obtain({ owner, texture: owner === 'enemy' ? 'pixel' : this.projectileTextureKey,
      width: owner === 'enemy' ? 10 : this.projectileWidth, height: owner === 'enemy' ? 5 : this.projectileHeight,
      tint: color, rotation: angle, velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed,
      damage, lifeMs, trailColor: color, critical: false, ricochetsRemaining: 0, ammoMode: 'normal',
      previousX: x, previousY: y });
    this.projectiles.push(projectile);
  }

  private spawnPlayerAmmoProjectile(mode: TemporaryAmmoMode, x: number, y: number, angle: number, damage: number,
    tint: number, trailColor: number, critical: boolean, ricochetsRemaining: number): void {
    const grenade = mode === 'grenade';
    const scatter = mode === 'scattershot';
    const speedMultiplier = grenade ? TEMPORARY_AMMO_BALANCE.grenade.projectileSpeedMultiplier
      : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.projectileSpeedMultiplier : 1;
    const speed = this.player.weapon.projectileSpeed * speedMultiplier;
    const grenadeSequence = grenade ? this.grenadeProjectileSequence++ : 0;
    const bounceCount = grenade ? grenadeBounceCountForSequence(grenadeSequence) : 0;
    const now = this.time.now;
    const projectile = this.projectilePool.obtain({
      owner: 'player', texture: grenade ? 'ammo-grenade-round' : scatter ? 'ammo-scatter-pellet' : this.projectileTextureKey,
      width: grenade ? TEMPORARY_AMMO_BALANCE.grenade.width : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.width : this.projectileWidth,
      height: grenade ? TEMPORARY_AMMO_BALANCE.grenade.height : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.height : this.projectileHeight,
      tint, rotation: angle, velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed,
      damage: damage * (scatter ? TEMPORARY_AMMO_BALANCE.scattershot.pelletDamageMultiplier : 1),
      lifeMs: grenade ? TEMPORARY_AMMO_BALANCE.grenade.projectileLifetimeMs
        : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.projectileLifetimeMs : 950,
      trailColor, critical, ricochetsRemaining, ammoMode: mode, previousX: x, previousY: y,
      grenadeBouncesRemaining: bounceCount,
      grenadeTotalBounces: bounceCount,
      grenadeBounceStartedAt: grenade ? now : 0,
      grenadeNextBounceAt: grenade ? now + TEMPORARY_AMMO_BALANCE.grenade.firstBounceDelayMs : 0,
      grenadeArcHeightMax: grenade ? TEMPORARY_AMMO_BALANCE.grenade.initialArcHeight : 0,
      grenadeFuseAt: grenade ? now + TEMPORARY_AMMO_BALANCE.grenade.fuseMs : 0,
      grenadeArmedAt: grenade ? now + TEMPORARY_AMMO_BALANCE.grenade.proximityArmingDelayMs : 0,
      grenadeNextProximityCheckAt: grenade ? initialGrenadeProximityCheckAt(now, grenadeSequence) : 0
    });
    this.projectiles.push(projectile);
  }

  private consumeGrenadeBounce(projectile: HeistProjectile, now: number): boolean {
    const pulse = this.fxCirclePool.obtain({
      x: projectile.sprite.x, y: projectile.sprite.y, radius: 4,
      color: projectile.sprite.tintTopLeft, alpha: 0.55, depth: 10,
      strokeWidth: 1, strokeColor: 0xffffff, strokeAlpha: 0.65
    });
    this.tweens.add({ targets: pulse, radius: 13, alpha: 0, duration: 120,
      onComplete: () => this.fxCirclePool.release(pulse) });
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

  private updateGrenadeFlight(projectile: HeistProjectile, now: number, delta: number): boolean {
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

  private findGrenadeEnemy(x: number, y: number, proximity: boolean): Enemy | null {
    this.grenadeFuseQueryX = x;
    this.grenadeFuseQueryY = y;
    this.grenadeFuseQueryProximity = proximity;
    this.grenadeFuseQueryCandidate = null;
    this.grenadeFuseQueryCandidateDistanceSquared = Number.POSITIVE_INFINITY;
    this.enemySpatialGrid.forEachNearby(
      x,
      y,
      TEMPORARY_AMMO_BALANCE.grenade.proximityFuseRadius,
      this.findGrenadeFuseNeighbor
    );
    return this.grenadeFuseQueryCandidate;
  }

  private detonateGrenadeForNearbyTarget(projectile: HeistProjectile, now: number): boolean {
    const directEnemy = this.findGrenadeEnemy(projectile.sprite.x, projectile.sprite.y, false);
    if (directEnemy) {
      this.detonateGrenade(projectile, directEnemy);
      return true;
    }
    if (!grenadeProximityCheckDue(
      now,
      projectile.grenadeArmedAt ?? Number.POSITIVE_INFINITY,
      projectile.grenadeNextProximityCheckAt ?? Number.POSITIVE_INFINITY
    )) return false;

    projectile.grenadeNextProximityCheckAt = nextGrenadeProximityCheckAt(now);
    const nearbyEnemy = this.findGrenadeEnemy(projectile.sprite.x, projectile.sprite.y, true);
    if (!nearbyEnemy) return false;
    this.detonateGrenade(projectile, nearbyEnemy);
    return true;
  }

  /** 0 = blocked, 1 = continue, 2 = detonate. */
  private bounceGrenadeFromWall(projectile: HeistProjectile, now: number): 0 | 1 | 2 {
    const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return 0;
    const vertical = this.pointBlocked(projectile.sprite.x, projectile.previousY);
    const horizontal = this.pointBlocked(projectile.previousX, projectile.sprite.y);
    const reflected = reflectRicochetVelocity(body.velocity.x, body.velocity.y, vertical, horizontal);
    if (Math.hypot(reflected.x, reflected.y) <= 0.01) return 0;
    body.reset(projectile.previousX, projectile.previousY);
    body.setVelocity(reflected.x, reflected.y);
    projectile.sprite.setRotation(Math.atan2(reflected.y, reflected.x));
    return this.consumeGrenadeBounce(projectile, now) ? 2 : 1;
  }

  private updateProjectiles(now: number, delta: number): void {
    this.projectileTrails.beginFrame(now);
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      projectile.lifeMs -= delta;
      if (projectile.lifeMs <= 0) {
        if (projectile.ammoMode === 'grenade' && projectile.owner !== 'enemy') this.detonateGrenade(projectile);
        this.retireProjectile(projectile, index);
        continue;
      }
      if (projectile.ammoMode === 'grenade' && projectile.owner !== 'enemy') {
        if (this.detonateGrenadeForNearbyTarget(projectile, now)) {
          this.retireProjectile(projectile, index);
          continue;
        }
        if (this.updateGrenadeFlight(projectile, now, delta)) {
          this.detonateGrenade(projectile);
          this.retireProjectile(projectile, index);
          continue;
        }
      }
      if (now >= projectile.nextTrailAt) {
        if (this.modRuntime.hasInfusion('prismatic-rounds') && projectile.owner === 'player') {
          const phase = now * 0.004 + index * 0.7;
          const red = Math.round(128 + Math.sin(phase) * 127);
          const green = Math.round(128 + Math.sin(phase + 2.094) * 127);
          const blue = Math.round(128 + Math.sin(phase + 4.188) * 127);
          const prism = (red << 16) | (green << 8) | blue;
          if (!projectile.nativePalette) projectile.sprite.setTint(prism);
          projectile.emissiveColor = prism;
          projectile.trailColor = prism;
        }
        this.projectileTrails.emit(projectile.sprite.x, projectile.sprite.y, projectile.trailColor, now);
        if (projectile.owner !== 'enemy' && projectile.nativePalette) {
          this.projectileTrails.emitAccent(
            projectile.sprite.x,
            projectile.sprite.y,
            projectile.emissiveColor ?? projectile.trailColor,
            now
          );
        }
        projectile.nextTrailAt = now + 34;
      }
      if (this.pointBlocked(projectile.sprite.x, projectile.sprite.y)) {
        if (projectile.ammoMode === 'grenade' && projectile.owner !== 'enemy') {
          const bounce = this.bounceGrenadeFromWall(projectile, now);
          if (bounce === 1) continue;
          this.detonateGrenade(projectile);
          this.retireProjectile(projectile, index);
          continue;
        }
        if (projectile.owner === 'player' && projectile.ricochetsRemaining > 0) {
          const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
          if (body) {
            const vertical = this.pointBlocked(projectile.sprite.x, projectile.previousY);
            const horizontal = this.pointBlocked(projectile.previousX, projectile.sprite.y);
            const reflected = reflectRicochetVelocity(body.velocity.x, body.velocity.y, vertical, horizontal);
            body.reset(projectile.previousX, projectile.previousY);
            body.setVelocity(reflected.x, reflected.y);
            projectile.sprite.setRotation(Math.atan2(reflected.y, reflected.x));
            projectile.ricochetsRemaining -= 1;
            continue;
          }
        }
        if (projectile.ammoMode === 'grenade') this.detonateGrenade(projectile);
        this.retireProjectile(projectile, index);
        continue;
      }
      if (projectile.owner === 'player' || projectile.owner === 'turret') {
        const container = projectile.ammoMode === 'grenade' ? null : this.findContainerHit(projectile.sprite.x, projectile.sprite.y);
        if (container) {
          this.damageContainer(container, projectile.damage);
          this.retireProjectile(projectile, index);
          continue;
        }
        const enemy = projectile.ammoMode === 'grenade' ? null : this.findEnemyHit(projectile.sprite.x, projectile.sprite.y);
        if (enemy) {
          this.damageEnemy(enemy, projectile.damage);
          if (projectile.ammoMode === 'grenade') this.detonateGrenade(projectile, enemy);
          this.retireProjectile(projectile, index);
          continue;
        }
        this.splitAtFence(projectile);
      } else {
        const turret = this.findTurretHit(projectile.sprite.x, projectile.sprite.y);
        if (turret) {
          turret.takeDamage(projectile.damage);
          this.retireProjectile(projectile, index);
          continue;
        }
        const fence = this.findFenceHit(projectile.sprite.x, projectile.sprite.y);
        if (fence) {
          fence.hp -= projectile.damage;
          this.retireProjectile(projectile, index);
          continue;
        }
        const radius = 15;
        const dx = projectile.sprite.x - this.player.x;
        const dy = projectile.sprite.y - this.player.y;
        if (dx * dx + dy * dy <= radius * radius) {
          this.damagePlayer(projectile.damage);
          this.retireProjectile(projectile, index);
        }
      }
      projectile.previousX = projectile.sprite.x;
      projectile.previousY = projectile.sprite.y;
    }
    this.projectileTrails.render(now);
  }

  private detonateGrenade(projectile: HeistProjectile, directHit?: Enemy): void {
    if (projectile.grenadeDetonated) return;
    projectile.grenadeDetonated = true;
    const radius = TEMPORARY_AMMO_BALANCE.grenade.splashRadius;
    const damage = projectile.damage * TEMPORARY_AMMO_BALANCE.grenade.splashDamageMultiplier;
    this.mineExplosionVfx.emit(projectile.sprite.x, projectile.sprite.y, radius,
      [0xffffff, 0xffa340, 0xff4e27, 0xff174f], this.time.now, 'grenade-round');
    this.coreAudio.playSfx('grenadeShotExplosion');
    const primary = directHit ?? this.findEnemyHit(projectile.sprite.x, projectile.sprite.y);
    if (primary) this.damageEnemy(primary, projectile.damage);
    const container = this.findContainerHit(projectile.sprite.x, projectile.sprite.y);
    if (container) this.damageContainer(container, projectile.damage);
    this.grenadeSplashX = projectile.sprite.x;
    this.grenadeSplashY = projectile.sprite.y;
    this.grenadeSplashRadiusSquared = radius * radius;
    this.grenadeSplashDamage = damage;
    this.grenadeSplashExcludedEnemy = primary;
    this.enemySpatialGrid.forEachNearby(
      projectile.sprite.x,
      projectile.sprite.y,
      radius,
      this.applyGrenadeSplashNeighbor
    );
    this.grenadeSplashExcludedEnemy = null;
  }

  private updateEnemies(now: number, dt: number): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (!enemy.active || enemy.hp <= 0) { this.removeEnemy(enemy, index); continue; }
      enemy.updateDamageFlash(now);
      const navigationTarget = this.facility.navigationTarget(
        enemy.x,
        enemy.y,
        this.player.x,
        this.player.y,
        this.navigationTargetScratch
      );
      const dx = navigationTarget.x - enemy.x;
      const dy = navigationTarget.y - enemy.y;
      const playerDx = this.player.x - enemy.x;
      const playerDy = this.player.y - enemy.y;
      const distanceSquared = playerDx * playerDx + playerDy * playerDy;
      const navigationDistance = Math.sqrt(Math.max(1, dx * dx + dy * dy));
      let steerX = dx / navigationDistance;
      let steerY = dy / navigationDistance;
      this.separationSubject = enemy;
      this.separationSteerX = steerX;
      this.separationSteerY = steerY;
      this.enemySpatialGrid.forEachNearby(enemy.x, enemy.y, 34, this.applyEnemySeparationNeighbor);
      steerX = this.separationSteerX;
      steerY = this.separationSteerY;
      if (enemy.stats.type === 'shooter' && distanceSquared < 360 * 360) {
        enemy.setVelocity(steerX * enemy.stats.speed * 0.2, steerY * enemy.stats.speed * 0.2);
        if (now - enemy.lastShotMs >= 1350) {
          enemy.lastShotMs = now;
          const angle = Math.atan2(playerDy, playerDx);
          this.spawnProjectile('enemy', enemy.x, enemy.y, angle, 330, enemy.stats.damage, 0xff6a91, HEIST_BALANCE.enemyProjectileLifeMs);
        }
      } else enemy.setVelocity(steerX * enemy.stats.speed, steerY * enemy.stats.speed);
      if (distanceSquared <= (enemy.stats.size * 0.5 + 16) ** 2 && now - enemy.lastAttackMs >= HEIST_BALANCE.contactCooldownMs) {
        enemy.lastAttackMs = now;
        this.damagePlayer(enemy.stats.damage);
      }
      if (dt > 0 && this.phase === 'escape') enemy.setRotation(Math.atan2(dy, dx) + Math.PI / 2);
    }
  }

  private updateMines(now: number): void {
    for (let index = this.mines.length - 1; index >= 0; index -= 1) {
      const mine = this.mines[index];
      mine.update(now);
      if (!mine.armed) continue;
      const radiusSquared = mine.radius * mine.radius;
      const target = this.enemies.find((enemy) => enemy.active
        && (enemy.x - mine.sprite.x) ** 2 + (enemy.y - mine.sprite.y) ** 2 <= radiusSquared);
      if (target && mine.detonateAt === 0) mine.beginDetonation(now,
        this.modRuntime.has('magnetic-payload') ? MOD_BALANCE.magneticPayload.preDetonationMs : 0);
      if (mine.detonateAt > 0 && !mine.readyToDetonate(now) && this.modRuntime.has('magnetic-payload')) {
        const rank = this.modRuntime.rank('magnetic-payload');
        const pullRadius = MOD_BALANCE.magneticPayload.pullRadius[rank];
        const strength = MOD_BALANCE.magneticPayload.pullStrength[rank];
        for (const enemy of this.enemies) {
          const dx = mine.sprite.x - enemy.x; const dy = mine.sprite.y - enemy.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared <= 1 || distanceSquared > pullRadius * pullRadius) continue;
          const inverseDistance = 1 / Math.sqrt(distanceSquared);
          enemy.setVelocity(dx * inverseDistance * strength, dy * inverseDistance * strength);
        }
      }
      if (!mine.readyToDetonate(now)) continue;
      this.coreAudio.playSfx('mine');
      this.mineExplosionVfx.emit(mine.sprite.x, mine.sprite.y, mine.radius, mine.explosionPalette, now);
      this.blast(mine.sprite.x, mine.sprite.y, mine.radius, mine.damage);
      mine.destroy();
      this.mines.splice(index, 1);
    }
  }

  private updateFences(now: number, dt: number): void {
    for (let index = this.fences.length - 1; index >= 0; index -= 1) {
      const fence = this.fences[index];
      if (fence.isExpired(now)) { fence.destroy(); this.fences.splice(index, 1); continue; }
      for (const enemy of this.enemies) {
        if (this.distanceToSegment(enemy.x, enemy.y, fence.x1, fence.y1, fence.x2, fence.y2) < enemy.stats.size * 0.5 + 7) {
          this.damageEnemy(enemy, fence.dps * dt);
        }
      }
    }
  }

  private spawnTurretAmmoVolley(turret: Turret, mode: TemporaryAmmoMode, angle: number, damage: number, now: number): void {
    const scatter = mode === 'scattershot';
    const grenade = mode === 'grenade';
    const count = scatter ? SCATTERSHOT_ANGLE_OFFSETS.length : 1;
    // Preserve the established turret skin projectile in normal mode; synced
    // temporary ammunition adopts the Operative projectile/trail treatment.
    const color = mode === 'normal'
      ? SaveSystem.getCosmeticColor('turretSkin', now)
      : SaveSystem.getCosmeticColor('projectileColor', now);
    const trailColor = mode === 'normal' ? color : SaveSystem.getCosmeticColor('trailColor', now);
    for (let index = 0; index < count; index += 1) {
      const projectileAngle = angle + (scatter ? SCATTERSHOT_ANGLE_OFFSETS[index] : 0);
      const speed = 560 * (grenade ? TEMPORARY_AMMO_BALANCE.grenade.projectileSpeedMultiplier
        : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.projectileSpeedMultiplier : 1);
      const grenadeSequence = grenade ? this.grenadeProjectileSequence++ : 0;
      const bounceCount = grenade ? grenadeBounceCountForSequence(grenadeSequence) : 0;
      this.projectiles.push(this.projectilePool.obtain({
        owner: 'turret',
        texture: grenade ? 'ammo-grenade-round' : scatter ? 'ammo-scatter-pellet' : this.projectileTextureKey,
        width: grenade ? TEMPORARY_AMMO_BALANCE.grenade.width : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.width : this.projectileWidth,
        height: grenade ? TEMPORARY_AMMO_BALANCE.grenade.height : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.height : this.projectileHeight,
        tint: color,
        rotation: projectileAngle,
        velocityX: Math.cos(projectileAngle) * speed,
        velocityY: Math.sin(projectileAngle) * speed,
        damage: damage * (scatter ? TEMPORARY_AMMO_BALANCE.scattershot.pelletDamageMultiplier : 1),
        lifeMs: grenade ? TEMPORARY_AMMO_BALANCE.grenade.projectileLifetimeMs
          : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.projectileLifetimeMs : 950,
        trailColor,
        critical: false,
        ricochetsRemaining: 0,
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
    }
  }

  private updateTurrets(now: number): void {
    for (let index = this.turrets.length - 1; index >= 0; index -= 1) {
      const turret = this.turrets[index];
      if (turret.hp <= 0) { turret.destroy(); this.turrets.splice(index, 1); continue; }
      turret.updateCosmetic(now);
      const playerAmmoMode = this.temporaryAmmo.activeSpecialMode(now);
      const turretAmmoMode = this.turretWeaponSync.activeAmmoMode(
        now, playerAmmoMode, this.modRuntime.turretWeaponSyncEnabled()
      );
      const damageBoosted = this.turretWeaponSync.damageBoostActive(
        now, this.player.buffs.damageBoostUntil, this.modRuntime.turretWeaponSyncEnabled()
      );
      turret.setWeaponSyncActive(Boolean(turretAmmoMode || damageBoosted));
      const target = this.nearestEnemy(turret.sprite.x, turret.sprite.y, turret.range);
      if (!target) continue;
      const angle = Phaser.Math.Angle.Between(turret.sprite.x, turret.sprite.y, target.x, target.y);
      turret.aimAt(angle);
      // HEIST shares the turret's authoritative baseline cadence. Weapon Sync
      // grenade mode no longer imposes an obsolete fixed launcher interval.
      const canFire = turret.canFire(now);
      if (canFire) {
        turret.lastShotMs = now;
        turret.markFired(now);
        this.spawnTurretAmmoVolley(
          turret,
          turretAmmoMode ?? 'normal',
          angle,
          turret.damage * (damageBoosted ? WEAPON_BALANCE.damageBoostMultiplier : 1),
          now
        );
      }
    }
  }

  private updatePickups(now: number): void {
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index];
      if (!pickup.root.active || now > pickup.expiresAt) {
        pickup.root.destroy(true);
        this.pickups.splice(index, 1);
        continue;
      }
      this.pickupPresentation.update(pickup.root, now);
      const dx = pickup.root.x - this.player.x;
      const dy = pickup.root.y - this.player.y;
      if (dx * dx + dy * dy > this.player.stats.pickupRadius ** 2) continue;
      this.collectGameplayPickup(pickup, now);
      pickup.root.destroy(true);
      this.pickups.splice(index, 1);
    }
  }

  private collectGameplayPickup(pickup: HeistPickup, now: number): void {
    const type = pickup.kind;
    this.coreAudio.playSfx(GAMEPLAY_PICKUP_SFX_BY_TYPE[type]);
    if (pickup.provisionalReward) this.rewards.add(this.pendingLoot, pickup.provisionalReward);
    if (type === 'health') {
      const healthCap = resourcePickupCap(this.player.stats.maxHealth, this.session.protocol !== 'normal');
      const baseRestore = pickup.source === 'support'
        ? HEIST_BALANCE.supportHealthAmount
        : PICKUP_BALANCE.healthRestore;
      this.player.hp = Math.min(healthCap,
        this.player.hp + baseRestore * this.modRuntime.multiplier('healthPickupValue'));
    } else if (type === 'energy') {
      const energyCap = resourcePickupCap(this.player.energyStats.max, this.session.protocol !== 'normal');
      const restoreFraction = pickup.source === 'support'
        ? HEIST_BALANCE.supportEnergyFraction
        : PICKUP_BALANCE.energyRestoreFraction;
      this.player.energy = Math.min(energyCap,
        this.player.energy + this.player.energyStats.max * restoreFraction
        * this.modRuntime.multiplier('energyPickupValue'));
    }
    const duration = WEAPON_BALANCE.buffDurationMs * this.modRuntime.multiplier('buffDuration');
    if (type === 'damageBoost') {
      this.player.buffs.damageBoostUntil = now + duration;
      this.turretWeaponSync.inherit(
        'damageBoost', now, this.player.buffs.damageBoostUntil, this.modRuntime.turretWeaponSyncEnabled()
      );
    }
    if (type === 'speedBoost') {
      const wasActive = now < this.player.buffs.speedBoostUntil;
      this.player.buffs.speedBoostUntil = now + duration;
      this.player.buffs.speedBoostStacks = nextPickupBuffStack(
        this.player.buffs.speedBoostStacks, wasActive, this.session.protocol !== 'normal'
      );
    }
    if (type === 'rapidFire') {
      const wasActive = now < this.player.buffs.rapidFireUntil;
      this.player.buffs.rapidFireUntil = now + duration;
      this.player.buffs.rapidFireStacks = nextPickupBuffStack(
        this.player.buffs.rapidFireStacks, wasActive, this.session.protocol !== 'normal'
      );
    }
    if (type === 'ricochet') this.player.buffs.ricochetUntil = now + duration;
    if (type === 'grenadeRounds' || type === 'scattershot') {
      const mode = type === 'grenadeRounds' ? 'grenade' : 'scattershot';
      const activation = this.temporaryAmmo.activate(mode, now, this.session.protocol !== 'normal',
        this.modRuntime.multiplier('buffDuration'));
      this.turretWeaponSync.inherit(type, now, activation.activeUntil, this.modRuntime.turretWeaponSyncEnabled());
    }
    const label = pickup.provisionalReward ? this.rewards.label(pickup.provisionalReward)
      : `+${type === 'ricochet' ? 'RICOCHET ROUNDS' : type === 'grenadeRounds' ? 'GRENADE ROUNDS'
        : type === 'scattershot' ? 'SCATTERSHOT ROUNDS' : type.toUpperCase()}`;
    const text = this.add.text(this.player.x, this.player.y - 25, label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#96ffe4',
      stroke: '#020711', strokeThickness: 3
    }).setOrigin(0.5).setDepth(13);
    this.tweens.add({ targets: text, y: text.y - 24, alpha: 0, duration: 620,
      onComplete: () => text.destroy() });
  }

  private updateMission(now: number): void {
    const doorDistanceSquared = this.facility.distanceSquaredToVault(this.player.x, this.player.y);
    if (this.phase === 'inbound' && doorDistanceSquared <= HEIST_BALANCE.vaultApproachRadius ** 2) {
      this.setPhase('vault-opening');
      this.audio.play('door-activation');
      this.facility.setVaultDoorOpen(true);
      this.audio.play('door-open');
      this.announce('VAULT LINK ACCEPTED', 'SECURITY BULKHEAD OPENING');
    }
    if (this.phase === 'vault-opening' && this.facility.isInsideVault(this.player.x, this.player.y, 28)) {
      this.setPhase('looting');
      this.facility.setVaultDoorOpen(false);
      this.audio.play('door-close');
      this.emitMetric('anomaly_vault_opened');
    }
    if (this.phase === 'egress-delay' && now - this.phaseStartedAt >= HEIST_BALANCE.alarmDelayMs) {
      this.facility.setVaultDoorOpen(true);
      this.audio.play('door-open');
      this.startAmbush();
    }
    if (this.phase === 'egress-ready' && !this.facility.isInsideVault(this.player.x, this.player.y, -18)) {
      this.startTimedEscape(now);
    }
    if (this.phase === 'escape' && this.extractionPortal) {
      if (now >= this.escapeDeadline) {
        this.failHeist('extraction-timeout');
        return;
      }
      const dx = this.player.x - this.extractionPortal.x;
      const dy = this.player.y - this.extractionPortal.y;
      const nearby = dx * dx + dy * dy <= HEIST_BALANCE.extractionRadius ** 2;
      const ready = this.extractionPortal.readyForInteraction;
      if (ready && !this.extractionPortalIdleStarted) {
        this.extractionPortalIdleStarted = true;
        this.audio.play('portal-idle');
      }
      this.promptText.setVisible(nearby).setText(ready
        ? `${this.inputController.prompt('interact', 'E')} EXTRACT // COMMIT COLLECTED HAUL`
        : 'EXTRACTION BREACH STABILIZING');
      if (nearby && ready && this.inputController.pressed('interact')) this.completeHeist();
    } else this.promptText.setVisible(false);
  }

  private startAmbush(): void {
    if (this.phase === 'egress-ready' || this.phase === 'escape' || this.returning) return;
    this.setPhase('egress-ready');
    this.audio.play('ambush-trigger');
    this.audio.play('warning-state');
    this.emitMetric('anomaly_ambush_started');
    this.announce('SECURITY RESPONSE DETECTED', 'LEAVE THE VAULT // EXTRACTION CLOCK ARMS ON EXIT');
    const forceMiniBoss = this.session.dev?.forceMiniBoss;
    const spawnMiniBoss = forceMiniBoss === true
      || (forceMiniBoss !== false && this.random.next() < HEIST_BALANCE.miniBossChance);
    const regularCapacity = Math.max(0, HEIST_BALANCE.escapeMaximumEnemies - this.enemies.length
      - (spawnMiniBoss ? 1 : 0));
    const count = Math.min(regularCapacity,
      HEIST_BALANCE.escapeInitialEnemyCount + Math.floor(this.session.round / 8) * HEIST_BALANCE.enemyPerEightRounds);
    const positions = this.facility.ambushPoints;
    for (let index = 0; index < count; index += 1) {
      const point = positions[index % positions.length];
      const types = this.session.round >= 8 ? ['grunt', 'shooter', 'tank', 'disruptor'] as const
        : this.session.round >= 3 ? ['grunt', 'shooter', 'tank'] as const : ['grunt', 'shooter'] as const;
      this.spawnEnemy(types[index % types.length], point.x + (index % 3 - 1) * 34,
        point.y + (Math.floor(index / 3) % 3 - 1) * 30, false);
    }
    if (spawnMiniBoss && this.enemies.length < HEIST_BALANCE.escapeMaximumEnemies) {
      const point = positions[Math.min(positions.length - 1, this.facility.layout.vaultDoors.length + 2)];
      this.spawnEnemy('tank', point.x, point.y, true);
    }
  }

  private spawnInfiltrationPatrols(): void {
    const count = Math.min(HEIST_BALANCE.maximumRegularEnemies,
      HEIST_BALANCE.initialEnemyCount + Math.floor(this.session.round / 10));
    const positions = this.facility.ambushPoints;
    const types = this.session.round >= 8 ? ['grunt', 'shooter', 'tank', 'disruptor'] as const
      : this.session.round >= 3 ? ['grunt', 'shooter', 'tank'] as const : ['grunt', 'shooter'] as const;
    let spawned = 0;
    const startIndex = this.random.int(0, Math.max(0, positions.length - 1));
    for (let offset = 0; offset < positions.length && spawned < count; offset += 1) {
      const point = positions[(startIndex + offset) % positions.length];
      const entryDx = point.x - this.facility.layout.entryPoint.x;
      const entryDy = point.y - this.facility.layout.entryPoint.y;
      if (entryDx * entryDx + entryDy * entryDy < 620 * 620 || this.pointBlocked(point.x, point.y)) continue;
      this.spawnEnemy(types[spawned % types.length], point.x, point.y, false);
      spawned += 1;
    }
  }

  private startTimedEscape(now: number): void {
    if (this.phase !== 'egress-ready' || this.returning) return;
    this.setPhase('escape');
    this.escapeDeadline = now + HEIST_BALANCE.extractionDurationMs;
    this.nextEscapeReinforcementAt = now + HEIST_BALANCE.escapeReinforcementIntervalMs;
    this.facility.activateEscapeGuide(this.player.x, this.player.y);
    this.openExtraction();
    this.announce('45 SECOND EXTRACTION WINDOW', 'FOLLOW THE EMERGENCY ROUTE LIGHTS // HAUL REMAINS PROVISIONAL');
  }

  private updateEscapeReinforcements(now: number): void {
    if (this.phase !== 'escape' || now < this.nextEscapeReinforcementAt || this.returning) return;
    this.nextEscapeReinforcementAt = now + HEIST_BALANCE.escapeReinforcementIntervalMs;
    const capacity = Math.max(0, HEIST_BALANCE.escapeMaximumEnemies - this.enemies.length);
    const count = Math.min(capacity, HEIST_BALANCE.escapeReinforcementCount);
    if (count <= 0) return;
    const positions = this.facility.ambushPoints;
    const types = this.session.round >= 8 ? ['grunt', 'shooter', 'tank', 'disruptor'] as const
      : ['grunt', 'shooter', 'tank'] as const;
    let spawned = 0;
    for (let offset = 0; offset < positions.length && spawned < count; offset += 1) {
      const index = (this.escapeReinforcementSequence + offset) % positions.length;
      const point = positions[index];
      const dx = point.x - this.player.x;
      const dy = point.y - this.player.y;
      if (dx * dx + dy * dy < 460 * 460 || this.pointBlocked(point.x, point.y)) continue;
      this.spawnEnemy(types[(this.escapeReinforcementSequence + spawned) % types.length], point.x, point.y, false);
      spawned += 1;
    }
    this.escapeReinforcementSequence = (this.escapeReinforcementSequence + Math.max(1, spawned)) % positions.length;
  }

  private spawnEnemy(type: keyof typeof baseEnemyStats, x: number, y: number, elite: boolean): void {
    const base = baseEnemyStats[type];
    const curve = getDifficultyCurve(this.session.round);
    const mode = getProtocolModeBalance(this.session.protocol);
    const stats: EnemyStats = {
      ...base,
      hp: applyEnemyHealthMode(base.hp * curve.healthMultiplier * (elite ? 2.8 : 1), this.session.protocol),
      damage: applyEnemyDamageMode(base.damage * curve.damageMultiplier * (elite ? 1.35 : 1), this.session.protocol),
      speed: base.speed * curve.speedMultiplier * mode.enemySpeedMultiplier * (elite ? 0.92 : 1),
      size: base.size * (elite ? 1.55 : 1),
      color: elite ? 0xffd85c : base.color
    };
    const enemy = new Enemy(this, x, y, ENEMY_ROBOT_FRAMES[type].textureKey, stats);
    if (this.modRuntime.hasInfusion('enemy-growth')) enemy.setScale(elite ? 1.7 : 1.12);
    if (elite) {
      enemy.setName('heist-mini-boss');
      this.miniBossEncountered = true;
    }
    this.enemies.push(enemy);
    this.physics.add.collider(enemy, this.facility.walls);
    this.physics.add.collider(enemy, this.facility.vaultDoors);
  }

  private openExtraction(): void {
    if (this.extractionPortal) return;
    this.audio.play('extraction-activation');
    this.emitMetric('anomaly_extraction_started');
    const point = this.facility.extractionPoint;
    this.extractionPortal = new AnomalyPortalVisual(this, point.x, point.y, SaveSystem.get().settings.particles);
    this.extractionPortal.transformToPortal();
  }

  private damageContainer(container: HeistContainer, amount: number): void {
    if (container.opened || this.phase !== 'looting') return;
    container.hp -= amount;
    this.audio.play('loot-container-impact');
    container.body.setFillStyle(0xffffff, 1);
    this.time.delayedCall(55, () => { if (container.root.active) container.body.setFillStyle(0x0a1822, 1); });
    this.drawContainerCracks(container);
    if (container.hp > 0) return;
    container.opened = true;
    this.containersOpened += 1;
    const reward = this.rewards.rollContainer();
    this.audio.play('loot-container-break');
    this.audio.play('loot-spawn');
    this.emitMetric('anomaly_container_opened', { progress: this.containersOpened, target: this.containers.length });
    this.createContainerBurst(container);
    this.lootPickups.spawn(container.root.x, container.root.y, reward, container.index);
    this.tweens.add({
      targets: container.root, alpha: 0, scaleX: 1.5, scaleY: 0.72, duration: 260,
      onComplete: () => container.root.setVisible(false).setActive(false)
    });
    if (this.containersOpened >= this.containers.length) {
      this.setPhase('egress-delay');
      this.audio.play('warning-state');
      this.announce('VAULT BREACHED // LOOT PROVISIONAL', 'COLLECT WHAT YOU CAN // EXTRACTION ROUTE OPENING');
    }
  }

  private collectLoot(reward: ReturnType<HeistRewardService['rollContainer']>, x: number, y: number): void {
    this.rewards.add(this.pendingLoot, reward);
    if (reward.kind === 'mod') this.coreAudio.playSfx('modPickup');
    else {
      const pickupType = reward.kind === 'credits' ? 'credits'
        : reward.kind === 'coreTokens' ? 'coreToken'
          : reward.kind === 'fluxCores' ? 'fluxCore' : 'plasmaChip';
      this.coreAudio.playSfx(GAMEPLAY_PICKUP_SFX_BY_TYPE[pickupType]);
    }
    this.lootPickups.showCollectionLabel(reward, x, y);
  }

  private drawContainerCracks(container: HeistContainer): void {
    const ratio = Phaser.Math.Clamp(1 - container.hp / container.maximumHp, 0, 1);
    const cracks = container.cracks;
    cracks.clear().lineStyle(2, 0xeaffff, 0.35 + ratio * 0.55);
    const branches = Math.max(1, Math.ceil(ratio * 5));
    for (let index = 0; index < branches; index += 1) {
      const side = index % 2 ? -1 : 1;
      const startX = side * (7 + index * 2);
      const startY = -18 + index * 8;
      cracks.beginPath();
      cracks.moveTo(startX, startY);
      cracks.lineTo(startX + side * (7 + ratio * 7), startY + 7);
      cracks.lineTo(startX + side * (3 + ratio * 11), startY + 15);
      cracks.strokePath();
    }
  }

  private createContainerBurst(container: HeistContainer): void {
    const x = container.root.x;
    const y = container.root.y;
    const color = container.index % 2 ? 0xff55d2 : 0x62f5ff;
    const flash = this.add.circle(x, y, 18, 0xffffff, 0.88).setBlendMode(Phaser.BlendModes.ADD).setDepth(13);
    const ring = this.add.circle(x, y, 14, color, 0.18).setStrokeStyle(4, color, 1).setDepth(12);
    this.tweens.add({ targets: flash, scale: 3.2, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
    this.tweens.add({ targets: ring, scale: 4.8, alpha: 0, duration: 390, onComplete: () => ring.destroy() });
    const sparkArc = this.add.graphics().setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
    sparkArc.lineStyle(2, 0xffffff, 0.92);
    for (let index = 0; index < 4; index += 1) {
      const angle = index / 4 * Math.PI * 2 + container.index * 0.31;
      sparkArc.beginPath();
      sparkArc.moveTo(x + Math.cos(angle) * 8, y + Math.sin(angle) * 8);
      sparkArc.lineTo(x + Math.cos(angle + 0.16) * 27, y + Math.sin(angle + 0.16) * 27);
      sparkArc.lineTo(x + Math.cos(angle - 0.09) * 43, y + Math.sin(angle - 0.09) * 43);
      sparkArc.strokePath();
    }
    this.tweens.add({ targets: sparkArc, alpha: 0, scaleX: 1.35, scaleY: 1.35, duration: 210,
      onComplete: () => sparkArc.destroy() });
    for (let index = 0; index < 11; index += 1) {
      const angle = index / 11 * Math.PI * 2 + container.index * 0.37;
      const fragment = this.add.rectangle(x, y, 7 + index % 3 * 3, 3 + index % 2 * 3,
        index % 2 ? color : 0xbdefff, 0.92).setRotation(angle).setDepth(12);
      const distance = 38 + index % 4 * 13;
      this.tweens.add({
        targets: fragment,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        rotation: angle + (index % 2 ? 2.3 : -2.1),
        alpha: 0,
        duration: 430 + index * 22,
        ease: 'Cubic.Out',
        onComplete: () => fragment.destroy()
      });
    }
  }

  private damageEnemy(enemy: Enemy, amount: number): void {
    if (!enemy.active || enemy.hp <= 0 || amount <= 0) return;
    const applied = Math.min(enemy.hp, amount);
    enemy.hp -= applied;
    this.damageDealt += applied;
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(50, () => { if (enemy.active) enemy.restoreVisualPalette(); });
    if (enemy.hp <= 0) this.triggerSplitCurrent(enemy, applied);
  }

  private triggerSplitCurrent(killedEnemy: Enemy, killingDamage: number): void {
    const standard = this.modRuntime.has('split-current') && this.modRuntime.nativeSlotActive('split-current', 0);
    const corrupted = this.modRuntime.has('fractured-current');
    if (!standard && !corrupted) return;
    const standardRank = this.modRuntime.rank('split-current');
    const corruptedRank = this.modRuntime.rank('fractured-current');
    const standardShare = standard ? MOD_BALANCE.splitCurrent.damageShare[standardRank] : 0;
    const corruptedShare = corrupted ? MOD_BALANCE.fracturedCurrent.damageShare[corruptedRank] : 0;
    const radius = corruptedShare > standardShare
      ? MOD_BALANCE.fracturedCurrent.radius[corruptedRank] : MOD_BALANCE.splitCurrent.radius[standardRank];
    let target: Enemy | null = null;
    let best = radius * radius;
    for (const enemy of this.enemies) {
      if (enemy === killedEnemy || enemy.hp <= 0) continue;
      const distance = (enemy.x - killedEnemy.x) ** 2 + (enemy.y - killedEnemy.y) ** 2;
      if (distance <= best) { best = distance; target = enemy; }
    }
    if (!target) return;
    const damage = corruptedShare > standardShare
      ? killingDamage * corruptedShare : splitCurrentSecondaryDamage(killingDamage, standardRank, false);
    const arc = this.add.graphics().setDepth(11).lineStyle(3, COLORS.cyan, 0.95);
    arc.lineBetween(killedEnemy.x, killedEnemy.y, target.x, target.y);
    this.tweens.add({ targets: arc, alpha: 0, duration: 210, onComplete: () => arc.destroy() });
    this.damageEnemy(target, damage);
  }

  private damagePlayer(amount: number): void {
    const now = this.time.now;
    if (now < this.abilityState.shieldActiveUntil || now < this.player.dashUntil || now < this.player.invulnUntil) return;
    const before = this.player.hp;
    if (this.player.takeDamage(amount)) {
      this.damageTaken += before - this.player.hp;
      const capacitor = this.modRuntime.checkEmergencyCapacitor(this.player.hp / this.player.stats.maxHealth);
      if (capacitor) {
        this.player.energy = Math.min(this.player.energyStats.max,
          this.player.energy + this.player.energyStats.max * capacitor.energyShare);
        if (capacitor.speedDurationMs > 0) {
          this.player.modSpeedMultiplier = capacitor.speedMultiplier;
          this.player.modSpeedBoostUntil = now + capacitor.speedDurationMs;
        }
        const pulse = this.add.circle(this.player.x, this.player.y, 18, COLORS.cyan, 0.25)
          .setStrokeStyle(3, 0xffffff, 0.9).setDepth(12);
        this.tweens.add({ targets: pulse, radius: 54, alpha: 0, duration: 340, onComplete: () => pulse.destroy() });
      }
    }
  }

  private blast(x: number, y: number, radius: number, damage: number): void {
    for (const enemy of this.enemies) {
      const dx = enemy.x - x; const dy = enemy.y - y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= radius * radius) {
        const distance = Math.sqrt(distanceSquared);
        this.damageEnemy(enemy, damage * (1 - distance / (radius + 1)));
      }
    }
  }

  private splitAtFence(projectile: HeistProjectile): void {
    for (const fence of this.fences) {
      if (projectile.crossedFences.has(fence)) continue;
      const crossed = this.segmentsIntersect(projectile.previousX, projectile.previousY,
        projectile.sprite.x, projectile.sprite.y, fence.x1, fence.y1, fence.x2, fence.y2)
        || this.distanceToSegment(projectile.sprite.x, projectile.sprite.y, fence.x1, fence.y1, fence.x2, fence.y2) <= 10;
      if (!crossed) continue;
      const turretFan = projectile.owner === 'turret' ? this.modRuntime.jailbrokeTurretFan() : null;
      if (projectile.owner === 'turret' && !turretFan) return;
      const stage = resolveFenceSplitStage(
        turretFan?.streamCount ?? ABILITY_BALANCE.fence.projectileFanCount,
        turretFan?.damageShare ?? ABILITY_BALANCE.fence.projectileFanDamageShare,
        projectile.crossedFences.size
      );
      if (!stage) return;
      projectile.crossedFences.add(fence);
      const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;
      const base = Math.atan2(body.velocity.y, body.velocity.x);
      const speed = Math.max(1, body.velocity.length());
      const spacing = ABILITY_BALANCE.fence.projectileFanSpacingRadians;
      const newDamage = projectile.damage * stage.damageShare;
      const crossedFences = new Set(projectile.crossedFences);
      for (let stream = 0; stream < stage.streamCount; stream += 1) {
        const angle = base + (stream - (stage.streamCount - 1) * 0.5) * spacing;
        if (stream === 0) {
          body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
          projectile.sprite.setRotation(angle);
          projectile.damage = newDamage;
          continue;
        }
        const x = projectile.sprite.x + Math.cos(angle) * 11;
        const y = projectile.sprite.y + Math.sin(angle) * 11;
        this.projectiles.push(this.projectilePool.obtain({
          owner: projectile.owner,
          texture: projectile.sprite.texture.key,
          width: projectile.sprite.displayWidth,
          height: projectile.sprite.displayHeight,
          tint: projectile.nativePalette
            ? (projectile.emissiveColor ?? projectile.trailColor)
            : projectile.sprite.tintTopLeft,
          rotation: angle,
          velocityX: Math.cos(angle) * speed,
          velocityY: Math.sin(angle) * speed,
          damage: newDamage,
          lifeMs: projectile.lifeMs,
          trailColor: projectile.trailColor,
          critical: projectile.critical,
          ricochetsRemaining: projectile.ricochetsRemaining,
          ammoMode: projectile.ammoMode,
          nativePalette: projectile.nativePalette,
          emissiveColor: projectile.emissiveColor,
          previousX: x,
          previousY: y,
          crossedFences,
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
      return;
    }
  }

  private segmentsIntersect(ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number): boolean {
    const cross = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number =>
      (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const abC = cross(ax, ay, bx, by, cx, cy);
    const abD = cross(ax, ay, bx, by, dx, dy);
    const cdA = cross(cx, cy, dx, dy, ax, ay);
    const cdB = cross(cx, cy, dx, dy, bx, by);
    return ((abC <= 0 && abD >= 0) || (abC >= 0 && abD <= 0))
      && ((cdA <= 0 && cdB >= 0) || (cdA >= 0 && cdB <= 0));
  }

  private completeHeist(): void {
    if (this.returning) return;
    this.returning = true;
    this.phase = 'returning';
    this.audio.play('portal-return');
    this.emitMetric('anomaly_completed', this.finalMetricFields('extracted'));
    this.cameras.main.flash(160, 180, 255, 255, false);
    this.beginReturnFade(true, 'extracted', HEIST_BALANCE.transitionDurationMs);
  }

  private failHeist(reason: 'player-dead' | 'extraction-timeout' = 'player-dead'): void {
    if (this.returning) return;
    this.returning = true;
    this.phase = 'returning';
    this.audio.play('heist-failed');
    this.emitMetric('anomaly_failed', this.finalMetricFields(reason));
    this.announce(reason === 'extraction-timeout' ? 'EXTRACTION WINDOW LOST' : 'HEIST FAILED',
      'PROVISIONAL HAUL LOST // ARENA LINK RESTORING');
    this.physics.pause();
    this.time.delayedCall(720, () => this.beginReturnFade(false, reason, 500));
  }

  private beginReturnFade(
    success: boolean,
    reason: 'extracted' | 'player-dead' | 'extraction-timeout',
    durationMs: number
  ): void {
    this.pendingFadeReturn = { success, reason };
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      this.onReturnFadeComplete,
      this
    );
    this.cameras.main.fadeOut(durationMs, 100, 225, 255);
  }

  private readonly onReturnFadeComplete = (): void => {
    const pending = this.pendingFadeReturn;
    this.pendingFadeReturn = null;
    if (pending) this.returnToArena(pending.success, pending.reason);
  };

  private returnToArena(success: boolean, reason: 'extracted' | 'player-dead' | 'extraction-timeout' | 'scene-shutdown'): void {
    if (this.returnResultDelivered) return;
    this.returnResultDelivered = true;
    this.inputController.clear();
    this.input.enabled = false;
    this.physics.pause();
    const arena = this.scene.get(SceneKeys.Arena);
    const result: AnomalyReturnResult = {
      sessionId: this.session.sessionId,
      anomalyId: 'heist',
      success,
      sourcePortal: { ...this.session.sourcePortal },
      loot: success ? this.pendingLoot : emptyLoot(),
      reason,
      // The automated DEV soak uses a gamepad return so browser pointer-lock
      // policy cannot turn a successful lifecycle test into a click gate.
      inputDevice: this.session.dev?.instantReturn ? 'gamepad' : this.inputController.activeDevice,
      playerState: {
        hp: this.player.hp,
        energy: this.player.energy,
        heat: this.player.heat,
        invulnUntil: this.player.invulnUntil,
        lastDashMs: this.player.lastDashMs,
        dashUntil: this.player.dashUntil,
        modSpeedBoostUntil: this.player.modSpeedBoostUntil,
        modSpeedMultiplier: this.player.modSpeedMultiplier,
        buffs: this.player.buffs
      },
      abilityState: {
        cooldownUntil: { ...this.abilityState.cooldownUntil },
        shieldActiveUntil: this.abilityState.shieldActiveUntil,
        shieldCooldownUntil: this.abilityState.shieldCooldownUntil,
        selectedAbility: this.abilityState.selectedAbility
      }
    };
    // Transfer plain result data only. Arena's shared return lifecycle owns the
    // ordered HEIST stop -> Arena resume operation for every future anomaly.
    this.cameras.main.setAlpha(0).setVisible(false);
    arena.events.emit('anomaly-return', result);
  }

  private updateHud(now: number): void {
    this.lootText.setText(`PENDING HAUL\n¢ ${this.pendingLoot.credits.toLocaleString()}  ◆ ${this.pendingLoot.coreTokens}  ◇ ${this.pendingLoot.plasmaChips}\nFLUX ${this.pendingLoot.fluxCores}  MODS ${this.pendingLoot.modIds.length}`);
    const objective = this.phase === 'inbound' || this.phase === 'vault-opening' ? 'INFILTRATE THE VAULT'
      : this.phase === 'looting' ? `BREACH SECURITY CONTAINERS // ${this.containersOpened} / ${this.containers.length}`
        : this.phase === 'egress-delay' ? 'EXIT THE VAULT'
          : this.phase === 'egress-ready' ? 'CROSS THE VAULT THRESHOLD // ARM EXTRACTION CLOCK'
            : this.phase === 'escape' ? `EXTRACT // ${Math.max(0, Math.ceil((this.escapeDeadline - now) / 1000))}s // ${this.enemies.length} HOSTILES`
            : 'ARENA LINK RESTORING';
    this.objectiveText.setText(objective);
    this.hudBuffs.length = 0;
    const appendBuff = (label: string, until: number): void => {
      if (until > now) this.hudBuffs.push(`${label} ${Math.ceil((until - now) / 1000)}s`);
    };
    appendBuff('DAMAGE+', this.player.buffs.damageBoostUntil);
    appendBuff('SPEED+', this.player.buffs.speedBoostUntil);
    appendBuff('RAPID FIRE', this.player.buffs.rapidFireUntil);
    appendBuff('RICOCHET', this.player.buffs.ricochetUntil);
    const ammo = this.temporaryAmmo.activeSpecialMode(now);
    if (ammo) appendBuff(ammo === 'grenade' ? 'GRENADE ROUNDS' : 'SCATTERSHOT', this.temporaryAmmo.activeUntil(now));

    this.hudRadarContacts.length = 0;
    for (const enemy of this.enemies) this.hudRadarContacts.push({
      kind: enemy.name === 'heist-mini-boss' ? 'boss' : 'enemy',
      dx: enemy.x - this.player.x, dy: enemy.y - this.player.y, state: 'normal'
    });
    if (this.phase !== 'escape') {
      const target = {
        x: this.facility.layout.vaultBounds.x + this.facility.layout.vaultBounds.w * 0.5,
        y: this.facility.layout.vaultBounds.y + this.facility.layout.vaultBounds.h * 0.5
      };
      this.hudRadarContacts.push({ kind: 'objective', dx: target.x - this.player.x, dy: target.y - this.player.y,
        state: 'available' });
    }

    const wallet = SaveSystem.get();
    Object.assign(this.hudPayload, {
      hp: this.player.hp, maxHp: this.player.stats.maxHealth,
      energy: this.player.energy, maxEnergy: this.player.energyStats.max,
      level: this.session.round, enemies: this.enemies.length,
      credits: wallet.credits, coreTokens: wallet.coreTokens,
      plasmaChips: SaveSystem.getModCollection().plasmaChips, fluxCores: wallet.fluxCores,
      phase: 'ANOMALY', objective,
      objectiveTimerMs: this.phase === 'escape' ? Math.max(0, this.escapeDeadline - now) : null
    });
    const [fenceSlot, turretSlot, mineSlot, shieldSlot] = this.hudPayload.abilities;
    const fenceCfg = this.session.abilities.fence;
    const turretCfg = this.session.abilities.turret;
    const mineCfg = this.session.abilities.mine;
    Object.assign(fenceSlot, { cooldownMs: Math.max(0, this.abilityState.cooldownUntil.fence - now),
      cooldownDurationMs: fenceCfg.cooldownMs, selected: this.abilityState.selectedAbility === 'fence',
      hasEnergy: this.player.energy >= fenceCfg.energyCost, underLimit: this.fences.length < fenceCfg.maxActive,
      count: this.fences.length, capacity: fenceCfg.maxActive });
    Object.assign(turretSlot, { cooldownMs: Math.max(0, this.abilityState.cooldownUntil.turret - now),
      cooldownDurationMs: turretCfg.cooldownMs, selected: this.abilityState.selectedAbility === 'turret',
      hasEnergy: this.player.energy >= turretCfg.energyCost, underLimit: this.turrets.length < turretCfg.maxActive,
      count: this.turrets.length, capacity: turretCfg.maxActive });
    const rack = this.mineChargeRack.snapshot(now, mineCfg.cooldownMs);
    Object.assign(mineSlot, { cooldownMs: rack.nextChargeRemainingMs, cooldownDurationMs: rack.rechargeDurationMs,
      recharging: rack.currentCharges > 0 && rack.currentCharges < rack.maxCharges,
      selected: this.abilityState.selectedAbility === 'mine', hasEnergy: this.player.energy >= mineCfg.energyCost,
      underLimit: rack.currentCharges > 0, count: rack.currentCharges, capacity: rack.maxCharges });
    const shieldActive = now < this.abilityState.shieldActiveUntil;
    Object.assign(shieldSlot, { cooldownMs: shieldActive ? this.abilityState.shieldActiveUntil - now
      : Math.max(0, this.abilityState.shieldCooldownUntil - now),
      cooldownDurationMs: shieldActive ? this.session.abilities.shieldDurationMs : this.session.abilities.shieldCooldownMs,
      active: shieldActive, hasEnergy: this.player.energy >= this.session.abilities.shieldEnergyCost,
      count: shieldActive ? 1 : 0, capacity: null });
    this.hud.update(this.hudPayload);
  }

  private announce(title: string, detail: string): void {
    this.announcementText.setText(`${title}\n${detail}`).setAlpha(0).setScale(0.92);
    this.tweens.killTweensOf(this.announcementText);
    this.tweens.add({ targets: this.announcementText, alpha: 1, scale: 1, duration: 180, yoyo: true, hold: 1050 });
  }

  private readonly handleResize = (size: Phaser.Structs.Size): void => {
    const width = size.width;
    const height = size.height;
    this.titleText?.setX(width * 0.5);
    this.objectiveText?.setX(width * 0.5);
    this.lootText?.setX(width - 18);
    this.promptText?.setPosition(width * 0.5, height - 48);
    this.announcementText?.setPosition(width * 0.5, height * 0.32);
    this.devPerformanceOverlay?.setX(width - 14);
  };

  private setPhase(phase: HeistPhase): void { this.phase = phase; this.phaseStartedAt = this.time.now; }

  private getAimPoint(): { x: number; y: number } {
    if (this.inputController.activeDevice === 'gamepad' && this.inputController.controllerAim.magnitude > 0) {
      return { x: this.player.x + this.inputController.controllerAim.x * 300, y: this.player.y + this.inputController.controllerAim.y * 300 };
    }
    const bridge = this.session.inputBridge;
    if (bridge?.locked) return bridge.worldPoint(this.cameras.main, this.aimScratch);
    return this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
  }

  private pauseHeist(): void {
    if (this.manuallyPaused || this.returning) return;
    this.manuallyPaused = true;
    this.physics.pause();
    this.coreAudio.pauseEventPresentationLoops();
    this.inputController.clear();
    this.session.inputBridge?.release?.();
    this.session.inputBridge?.hidePrompt();
    this.input.setDefaultCursor('default');
    this.crosshair.setVisible(false);
    this.pauseMenu?.destroy();
    this.pauseMenu = createPauseMenuView(this, {
      encounter: 'Anomaly // Heist', seed: this.session.seed, layout: 'Security Facility 07'
    }, [
      { label: 'Resume Heist', tone: 'primary', onClick: () => this.resumeHeist() },
      { label: 'Options', onClick: () => {
        this.scene.launch(SceneKeys.Options, { returnScene: SceneKeys.Heist, resumePausedScene: true });
        this.scene.pause();
      } },
      { label: 'Abort Heist // Return To Arena', tone: 'warning', onClick: () => {
        this.pauseMenu?.destroy();
        this.pauseMenu = null;
        this.returning = true;
        this.returnToArena(false, 'scene-shutdown');
      } }
    ]);
  }

  private resumeHeist(): void {
    if (!this.manuallyPaused) return;
    this.pauseMenu?.destroy();
    this.pauseMenu = null;
    this.manuallyPaused = false;
    this.inputController.clear();
    if (this.inputController.activeDevice === 'gamepad' || !this.session.inputBridge?.supported) {
      this.inputCapturePaused = false;
      this.physics.resume();
      this.input.setDefaultCursor('none');
      this.crosshair.setVisible(true);
      this.coreAudio.resumeEventPresentationLoops();
      return;
    }
    this.session.inputBridge.showResume('CLICK TO RESUME HEIST');
    this.session.inputBridge.requestLock();
  }

  private updateInputCapture(): void {
    const bridge = this.session.inputBridge;
    if (this.manuallyPaused) {
      bridge?.hidePrompt();
      this.inputCapturePaused = false;
      return;
    }
    const requiresPointer = this.inputController.activeDevice !== 'gamepad' && Boolean(bridge?.supported);
    const shouldPause = requiresPointer && !bridge?.locked;
    if (shouldPause === this.inputCapturePaused) return;
    this.inputCapturePaused = shouldPause;
    this.inputController.clear();
    if (shouldPause) {
      this.physics.pause();
      this.coreAudio.pauseEventPresentationLoops();
      this.input.setDefaultCursor('default');
      this.crosshair.setVisible(false);
      bridge?.showResume('CLICK TO RESUME HEIST');
    } else {
      this.physics.resume();
      this.coreAudio.resumeEventPresentationLoops();
      this.input.setDefaultCursor('none');
      this.crosshair.setVisible(true);
      bridge?.hidePrompt();
    }
  }

  private updateCrosshair(): void {
    if (this.inputCapturePaused || this.manuallyPaused) return;
    const aim = this.getAimPoint();
    const color = this.phase === 'escape' ? 0xff6985 : 0x6af5ff;
    this.crosshair.setPosition(aim.x, aim.y);
    drawReticle(this.crosshair, 0, 0, this.aimSettings.reticle, color);
  }

  private pointBlocked(x: number, y: number): boolean {
    if (x < 74 || x > HEIST_WORLD.width - 74 || y < 74 || y > HEIST_WORLD.height - 74) return true;
    if (this.facility.vaultDoor.body?.enable && this.facility.layout.vaultDoors.some((door) => {
      const halfWidth = door.orientation === 'horizontal' ? door.width * 0.5 : 34;
      const halfHeight = door.orientation === 'horizontal' ? 34 : door.width * 0.5;
      return Math.abs(x - door.x) <= halfWidth && Math.abs(y - door.y) <= halfHeight;
    })) return true;
    return this.facility.containsWallPoint(x, y);
  }

  private findContainerHit(x: number, y: number): HeistContainer | null {
    if (this.phase !== 'looting') return null;
    return this.containers.find((container) => !container.opened && Math.abs(x - container.root.x) <= 38 && Math.abs(y - container.root.y) <= 30) ?? null;
  }

  private findEnemyHit(x: number, y: number): Enemy | null {
    return this.enemies.find((enemy) => enemy.active && (enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= (enemy.stats.size * 0.55 + 6) ** 2) ?? null;
  }

  private findTurretHit(x: number, y: number): Turret | null {
    return this.turrets.find((turret) => turret.hp > 0
      && (turret.sprite.x - x) ** 2 + (turret.sprite.y - y) ** 2 <= 19 * 19) ?? null;
  }

  private findFenceHit(x: number, y: number): Fence | null {
    return this.fences.find((fence) => fence.hp > 0
      && this.distanceToSegment(x, y, fence.x1, fence.y1, fence.x2, fence.y2) <= 9) ?? null;
  }

  private nearestEnemy(x: number, y: number, range: number): Enemy | null {
    let nearest: Enemy | null = null;
    let best = range * range;
    for (const enemy of this.enemies) {
      const distance = (enemy.x - x) ** 2 + (enemy.y - y) ** 2;
      if (enemy.active && distance < best) { best = distance; nearest = enemy; }
    }
    return nearest;
  }

  private retireProjectile(projectile: HeistProjectile, activeIndex: number): void {
    this.projectilePool.release(projectile);
    this.projectiles.splice(activeIndex, 1);
  }

  private removeEnemy(enemy: Enemy, index: number): void {
    if (enemy.name === 'heist-mini-boss' && enemy.hp <= 0) {
      this.miniBossKilled = true;
      const premiumDrop = this.rewards.rollMiniBossReward();
      this.audio.play('loot-spawn');
      this.lootPickups.spawn(enemy.x, enemy.y, premiumDrop, 1000 + this.containersOpened);
    }
    if (enemy.hp <= 0) {
      this.coreAudio.playSfx('enemyDeath');
      const color = enemy.stats.color;
      const pulse = this.fxCirclePool.obtain({ x: enemy.x, y: enemy.y, radius: 9, color, alpha: 0.28,
        depth: 11, strokeWidth: 2, strokeColor: 0xffffff, strokeAlpha: 0.75 });
      this.tweens.add({ targets: pulse, radius: 38, alpha: 0, duration: 230,
        onComplete: () => this.fxCirclePool.release(pulse) });
      if (this.modRuntime.hasInfusion('arcade-pop')) {
        const callout = this.add.text(enemy.x, enemy.y - 20, 'ZAP!', {
          fontFamily: 'Orbitron, sans-serif', fontSize: '19px', color: '#fff06d',
          stroke: '#ff3fbd', strokeThickness: 4, fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(13);
        this.tweens.add({ targets: callout, y: callout.y - 35, alpha: 0, duration: 920,
          onComplete: () => callout.destroy() });
      }
      if (this.modRuntime.hasInfusion('ghost-echoes')) {
        const echo = this.add.image(enemy.x, enemy.y, enemy.texture.key).setTint(color).setAlpha(0.28)
          .setScale(enemy.scaleX).setRotation(enemy.rotation).setDepth(7);
        this.tweens.add({ targets: echo, y: echo.y - 40, alpha: 0, scaleX: echo.scaleX * 1.18,
          scaleY: echo.scaleY * 1.18, duration: 620, onComplete: () => echo.destroy() });
      }
      this.spawnEnemyDrops(enemy);
    }
    enemy.destroy();
    this.enemies.splice(index, 1);
  }

  private spawnEnemyDrops(enemy: Enemy): void {
    const standardChance = Math.min(1,
      PICKUP_BALANCE.enemyDropChance * this.modRuntime.multiplier('enemyPickupChance'));
    if (this.random.next() < standardChance) {
      const kind = selectEnemyPickup(this.random.next());
      const provisionalReward: HeistContainerReward | undefined = kind === 'credits'
        ? { kind: 'credits', amount: Math.max(1, Math.round(enemy.stats.valueCredits)) }
        : kind === 'coreToken'
          ? { kind: 'coreTokens', amount: Math.max(1, enemy.stats.valueCoreTokens || 1) }
          : undefined;
      this.pickups.push({
        kind,
        root: this.pickupPresentation.create(kind, enemy.x, enemy.y, GAMEPLAY_PICKUP_COLOR_BY_TYPE[kind]).setDepth(8),
        expiresAt: this.time.now + PICKUP_BALANCE.lifetimeMs,
        source: 'enemy',
        provisionalReward
      });
    }
    if (this.random.next() >= HEIST_BALANCE.enemyAnomalyLootChance) return;
    const reward = this.rewards.rollEnemyBonus();
    this.audio.play('loot-spawn');
    this.lootPickups.spawn(enemy.x + 18, enemy.y - 12, reward, 2_000 + this.enemyLootSequence++);
  }

  private finalMetricFields(reason: string): Partial<Parameters<typeof recordAnomalyMetric>[0]> {
    return {
      reason,
      damageDealt: Math.round(this.damageDealt * 100) / 100,
      damageTaken: Math.round(this.damageTaken * 100) / 100,
      containersOpened: this.containersOpened,
      miniBossEncountered: this.miniBossEncountered,
      miniBossKilled: this.miniBossKilled
    };
  }

  private distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1; const dy = y2 - y1;
    const length = dx * dx + dy * dy;
    if (length <= 0) return Math.hypot(px - x1, py - y1);
    const t = Phaser.Math.Clamp(((px - x1) * dx + (py - y1) * dy) / length, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  private emitMetric(name: AnomalyMetricName, extra: Partial<Parameters<typeof recordAnomalyMetric>[0]> = {}): void {
    recordAnomalyMetric({
      name, anomalyId: 'heist', round: this.session.round, protocol: this.session.protocol,
      elapsedMs: this.elapsedMs, ...extra
    });
  }

  private readonly onDevPreRender = (): void => {
    this.devRenderStartedAt = performance.now();
  };

  private readonly onDevPreUpdate = (): void => {
    this.devPhysicsUpdateStartedAt = performance.now();
  };

  private readonly onDevPhysicsUpdateComplete = (): void => {
    if (this.devPhysicsUpdateStartedAt <= 0) return;
    // Arcade World.update is registered on Scene UPDATE before this DEV-only
    // listener. This captures that update envelope without wrapping or
    // replacing Phaser's physics implementation.
    this.performanceProfiler?.recordPhysicsUpdateEnvelope(performance.now() - this.devPhysicsUpdateStartedAt);
    this.devPhysicsUpdateStartedAt = 0;
  };

  private readonly onDevRender = (): void => {
    if (this.devRenderStartedAt <= 0) return;
    this.performanceProfiler?.recordRender(performance.now() - this.devRenderStartedAt);
    this.devRenderStartedAt = 0;
  };

  private readonly toggleDevPerformanceOverlay = (): void => {
    if (!import.meta.env.DEV) return;
    if (!this.devPerformanceOverlay) {
      this.devPerformanceOverlay = this.add.text(this.scale.width - 14, 14, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '12px',
        color: '#bdfaff',
        backgroundColor: '#02070eef',
        padding: { x: 10, y: 8 },
        lineSpacing: 2
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(50_000);
    } else this.devPerformanceOverlay.setVisible(!this.devPerformanceOverlay.visible);
    this.nextDevPerformanceOverlayAt = 0;
  };

  private updateDevPerformanceOverlay(now: number): void {
    if (!this.devPerformanceOverlay?.visible || now < this.nextDevPerformanceOverlayAt) return;
    this.nextDevPerformanceOverlayAt = now + 500;
    const snapshot = this.performanceProfiler?.snapshot();
    if (!snapshot) return;
    const projectiles = this.projectilePool.stats();
    const fx = this.fxCirclePool.stats();
    const category = snapshot.categories;
    this.devPerformanceOverlay.setText(
      `HEIST PERF (F6)  frame ${snapshot.frameTime.averageMs.toFixed(1)}ms p95 ${snapshot.frameTime.p95Ms.toFixed(1)}`
      + ` p99 ${snapshot.frameTime.p99Ms.toFixed(1)} max ${snapshot.frameTime.maximumMs.toFixed(1)}\n`
      + `update ${snapshot.updateWork.averageMs.toFixed(2)}ms physics ${snapshot.physicsUpdateEnvelope.averageMs.toFixed(2)}`
      + ` render ${snapshot.renderWork.averageMs.toFixed(2)}ms\n`
      + `facility/VFX ${category.facilityAndVfx.averageMs.toFixed(2)}`
      + ` player/Mods ${category.playerCombatAndMods.averageMs.toFixed(2)}`
      + ` projectile ${category.projectiles.averageMs.toFixed(2)}`
      + ` enemy ${category.enemies.averageMs.toFixed(2)} HUD ${category.hudMaintenance.averageMs.toFixed(2)}\n`
      + `enemy ${this.enemies.length} projectile ${this.projectiles.length} display ${this.children.list.length}`
      + ` physics ${this.physics.world.bodies.entries.length}/${this.physics.world.staticBodies.entries.length}\n`
      + `walls ${this.facility.diagnostics.sourceWallRects}->${this.facility.diagnostics.runtimeWallRects}`
      + ` bucket max ${this.facility.diagnostics.wallIndexMaximumCandidates}`
      + ` pool P ${projectiles.active}/${projectiles.available} FX ${fx.active}/${fx.available}\n`
      + `Arena sleeping ${this.scene.isSleeping(SceneKeys.Arena)} visible ${this.scene.isVisible(SceneKeys.Arena)}`
    );
  }

  private createDevPerformanceSnapshot(): Record<string, unknown> {
    const arena = this.scene.manager.getScene(SceneKeys.Arena);
    const arenaRuntime = arena as Phaser.Scene & { physics?: Phaser.Physics.Arcade.ArcadePhysics };
    const arenaClock = arena.time as unknown as { _active?: unknown[]; _pendingInsertion?: unknown[] };
    const heistClock = this.time as unknown as { _active?: unknown[]; _pendingInsertion?: unknown[] };
    const arenaChildren = arena.children?.list ?? [];
    const heistChildren = this.children?.list ?? [];
    const projectiles = this.projectilePool?.stats();
    const fx = this.fxCirclePool?.stats();
    return {
      profiler: this.performanceProfiler?.snapshot() ?? null,
      scenes: this.scene.manager.scenes.map((scene, index) => ({
        index,
        key: scene.sys.settings.key,
        active: scene.sys.isActive(),
        visible: scene.sys.isVisible(),
        sleeping: scene.sys.isSleeping(),
        paused: scene.sys.isPaused(),
        status: scene.sys.getStatus(),
        displayObjects: scene.sys.displayList?.list.length ?? 0
      })),
      arenaIsolation: {
        active: arena.sys.isActive(),
        visible: arena.sys.isVisible(),
        sleeping: arena.sys.isSleeping(),
        paused: arena.sys.isPaused(),
        status: arena.sys.getStatus(),
        displayObjectsRetained: arena.sys.displayList?.list.length ?? 0,
        activeVisibleSprites: arenaChildren.filter((child) => child.active
          && (child as Phaser.GameObjects.GameObject & { visible?: boolean }).visible
          && (child.type === 'Sprite' || child.type === 'Image')).length,
        graphicsObjects: arenaChildren.filter((child) => child.type === 'Graphics').length,
        particleEmitters: arenaChildren.filter((child) => child.type === 'ParticleEmitter').length,
        dynamicPhysicsBodies: arenaRuntime.physics?.world.bodies.entries.length ?? 0,
        staticPhysicsBodies: arenaRuntime.physics?.world.staticBodies.entries.length ?? 0,
        colliders: arenaRuntime.physics?.world.colliders.getActive().length ?? 0,
        tweens: arena.tweens?.getTweens().length ?? 0,
        timers: (arenaClock._active?.length ?? 0) + (arenaClock._pendingInsertion?.length ?? 0),
        simulationAndRenderingInert: arena.sys.isSleeping() && !arena.sys.isActive() && !arena.sys.isVisible()
      },
      heist: {
        phase: this.phase,
        elapsedMs: this.elapsedMs,
        displayObjects: heistChildren.length,
        activeVisibleSprites: heistChildren.filter((child) => child.active
          && (child as Phaser.GameObjects.GameObject & { visible?: boolean }).visible
          && (child.type === 'Sprite' || child.type === 'Image')).length,
        graphicsObjects: heistChildren.filter((child) => child.type === 'Graphics').length,
        particleEmitters: heistChildren.filter((child) => child.type === 'ParticleEmitter').length,
        dynamicPhysicsBodies: this.physics?.world?.bodies.entries.length ?? 0,
        staticPhysicsBodies: this.physics?.world?.staticBodies.entries.length ?? 0,
        colliders: this.physics?.world?.colliders.getActive().length ?? 0,
        tweens: this.tweens?.getTweens().length ?? 0,
        timers: (heistClock._active?.length ?? 0) + (heistClock._pendingInsertion?.length ?? 0),
        playingAudioInstances: this.sound?.getAllPlaying().length ?? 0,
        domUiElements: typeof document === 'undefined' ? 0 : document.querySelectorAll('#game-ui-root *').length,
        enemies: this.enemies.length,
        projectiles: this.projectiles.length,
        containers: this.containers.length,
        pickups: this.pickups.length,
        mines: this.mines.length,
        fences: this.fences.length,
        turrets: this.turrets.length,
        facility: this.facility?.diagnostics ?? null,
        projectilePool: projectiles,
        fxPool: fx
      },
      listeners: {
        sceneShutdown: this.events.listenerCount(Phaser.Scenes.Events.SHUTDOWN),
        scenePreRender: this.events.listenerCount(Phaser.Scenes.Events.PRE_RENDER),
        sceneRender: this.events.listenerCount(Phaser.Scenes.Events.RENDER),
        scenePreUpdate: this.events.listenerCount(Phaser.Scenes.Events.PRE_UPDATE),
        sceneUpdate: this.events.listenerCount(Phaser.Scenes.Events.UPDATE),
        resize: this.scale.listenerCount('resize'),
        f6: this.input.keyboard?.listenerCount('keydown-F6') ?? 0
      }
    };
  }

  private cleanup(): void {
    const finalInputDevice = this.inputController?.activeDevice ?? this.session?.initialInputDevice;
    this.pendingFadeReturn = null;
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.onDevInstantReturn, this);
    // Phaser's CameraManager, DisplayList, Clock, TweenManager and Arcade
    // Physics shutdown listeners run before this user callback. Do not destroy
    // their objects a second time here: a teardown exception would abort the
    // SceneManager queue before the sleeping Arena can be woken.
    const safely = (label: string, action: () => void): void => {
      try { action(); }
      catch (error) {
        // Never let non-authoritative cleanup strand the following Arena wake
        // operation in Phaser's SceneManager queue.
        if (import.meta.env.DEV) console.error(`[HEIST shutdown] ${label} cleanup failed`, error);
      }
    };
    safely('anomaly-audio', () => this.audio.stopAll());
    safely('low-health-audio', () => this.coreAudio.setLowHealthWarning(false));
    safely('input-controller', () => this.inputController?.destroy());
    this.pauseMenu = null;
    this.devPerformanceOverlay = null;
    safely('performance-listeners', () => {
      this.input.keyboard?.off('keydown-F6', this.toggleDevPerformanceOverlay, this);
      this.events.off(Phaser.Scenes.Events.PRE_RENDER, this.onDevPreRender, this);
      this.events.off(Phaser.Scenes.Events.RENDER, this.onDevRender, this);
      this.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.onDevPreUpdate, this);
      this.events.off(Phaser.Scenes.Events.UPDATE, this.onDevPhysicsUpdateComplete, this);
    });
    this.extractionPortal = null;
    this.cameraPresentation = null;
    this.shieldVisual = null;
    safely('resize-listener', () => this.scale.off('resize', this.handleResize, this));
    this.projectiles.length = 0;
    safely('projectile-pool-references', () => this.projectilePool?.discardReferences());
    safely('fx-pool-references', () => this.fxCirclePool?.discardReferences());
    safely('loot-pickup-references', () => this.lootPickups?.discardReferences());
    this.enemies.length = 0;
    this.separationSubject = null;
    this.enemySpatialGrid.clear();
    this.containers.length = 0;
    this.pickups.length = 0;
    this.fences.length = 0;
    this.turrets.length = 0;
    this.mines.length = 0;
    if (!this.returning && this.session) {
      const arena = this.scene.get(SceneKeys.Arena);
      arena.events.emit('anomaly-return', {
        sessionId: this.session.sessionId, anomalyId: 'heist', success: false,
        sourcePortal: { ...this.session.sourcePortal }, loot: emptyLoot(), reason: 'scene-shutdown',
        inputDevice: finalInputDevice
      } satisfies AnomalyReturnResult);
    }
    if (import.meta.env.DEV) {
      const debug = globalThis as typeof globalThis & {
        forceHeistAmbush?: unknown;
        forceHeistExtraction?: unknown;
        forceHeistReturn?: unknown;
        n3onHeistPerf?: unknown;
      };
      delete debug.forceHeistAmbush;
      delete debug.forceHeistExtraction;
      delete debug.forceHeistReturn;
      delete debug.n3onHeistPerf;
    }
  }
}
