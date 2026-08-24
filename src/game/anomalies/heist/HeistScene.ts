import Phaser from 'phaser';
import { ABILITY_BALANCE, PLAYER_BALANCE, WEAPON_BALANCE, getDifficultyCurve } from '../../config/balance/index.ts';
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
import { getCosmeticById, getCosmeticTextureKey } from '../../../data/cosmetics.ts';
import { SaveSystem } from '../../systems/SaveSystem.ts';
import { AudioManager } from '../../systems/AudioManager.ts';
import { Hud, type HudPayload, type HudRadarContact } from '../../systems/Hud.ts';
import { BoostVisualSystem, type BoostFxCircleSpawn } from '../../systems/BoostVisualSystem.ts';
import { SeededRandom } from '../../systems/SeededRandom.ts';
import { ReusableObjectPool } from '../../performance/ReusableObjectPool.ts';
import { ProjectileTrailBatch } from '../../performance/ProjectileTrailBatch.ts';
import { MineExplosionVfx } from '../../vfx/MineExplosionVfx.ts';
import { OperativeShieldEffect } from '../../vfx/OperativeShieldEffect.ts';
import { drawReticle } from '../../ui/ReticleRenderer.ts';
import { createPauseMenuView, type PauseMenuView } from '../../ui/PauseMenuUi.ts';
import { MOD_BALANCE } from '../../mods/modBalance.ts';
import { splitCurrentSecondaryDamage } from '../../mods/ModRules.ts';
import {
  SCATTERSHOT_ANGLE_OFFSETS,
  TEMPORARY_AMMO_BALANCE,
  type TemporaryAmmoMode
} from '../../player/TemporaryAmmoMode.ts';
import { RICOCHET_MAX_WALL_BOUNCES, reflectRicochetVelocity } from '../../player/RicochetRules.ts';
import { createSilentAnomalyAudioHooks } from '../AnomalyAudioHooks.ts';
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
import { HeistRewardService } from './HeistRewardService.ts';
import { HeistLootPickupSystem } from './HeistLootPickupSystem.ts';
import {
  GAMEPLAY_PICKUP_SFX_BY_TYPE,
  GameplayPickupPresentation
} from '../../loot/GameplayPickupPresentation.ts';

type HeistPhase = 'inbound' | 'vault-opening' | 'looting' | 'egress-delay' | 'escape' | 'returning';
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
  kind: 'health' | 'energy';
  root: Phaser.GameObjects.Container;
}

const isSessionData = (value: unknown): value is HeistSessionData => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HeistSessionData>;
  return candidate.anomalyId === 'heist' && typeof candidate.sessionId === 'string' && !!candidate.player && !!candidate.abilities;
};

const emptyLoot = (): PendingAnomalyLoot => ({ credits: 0, coreTokens: 0, plasmaChips: 0, fluxCores: 0, modIds: [] });

export class HeistScene extends Phaser.Scene {
  private readonly audio = createSilentAnomalyAudioHooks();
  private readonly coreAudio = AudioManager.get();
  private session!: HeistSessionData;
  private player!: Player;
  private inputController!: PlayerInput;
  private facility!: HeistFacilityRuntime;
  private random!: SeededRandom;
  private rewards!: HeistRewardService;
  private lootPickups!: HeistLootPickupSystem;
  private pickupPresentation!: GameplayPickupPresentation;
  private pendingLoot: PendingAnomalyLoot = emptyLoot();
  private phase: HeistPhase = 'inbound';
  private elapsedMs = 0;
  private phaseStartedAt = 0;
  private playerWallCollider: Phaser.Physics.Arcade.Collider | null = null;
  private playerDoorCollider: Phaser.Physics.Arcade.Collider | null = null;
  private enemies: Enemy[] = [];
  private projectiles: HeistProjectile[] = [];
  private projectilePool!: ReusableObjectPool<HeistProjectile, HeistProjectileSpawn>;
  private fxCirclePool!: ReusableObjectPool<Phaser.GameObjects.Arc, BoostFxCircleSpawn>;
  private projectileTrails!: ProjectileTrailBatch;
  private boostVisual!: BoostVisualSystem;
  private mineExplosionVfx!: MineExplosionVfx;
  private containers: HeistContainer[] = [];
  private pickups: HeistPickup[] = [];
  private fences: Fence[] = [];
  private turrets: Turret[] = [];
  private mines: Mine[] = [];
  private extractionPortal: AnomalyPortalVisual | null = null;
  private hud!: Hud;
  private hudPayload!: HudPayload;
  private readonly hudBuffs: string[] = [];
  private readonly hudRadarContacts: HudRadarContact[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private lootText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private announcementText!: Phaser.GameObjects.Text;
  private hazardGraphics!: Phaser.GameObjects.Graphics;
  private crosshair!: Phaser.GameObjects.Graphics;
  private shieldVisual: OperativeShieldEffect | null = null;
  private nextPlayerShotAt = 0;
  private damageDealt = 0;
  private damageTaken = 0;
  private containersOpened = 0;
  private miniBossEncountered = false;
  private miniBossKilled = false;
  private returning = false;
  private inputCapturePaused = false;
  private manuallyPaused = false;
  private pauseMenu: PauseMenuView | null = null;
  private aimSettings!: AimSettings;
  private projectileTextureKey = 'projectile-pulse';
  private projectileWidth = 8;
  private projectileHeight = 8;
  private readonly aimScratch = new Phaser.Math.Vector2();
  private readonly mineSalvoInput = new MineSalvoInput();
  private pendingMineSalvo = false;
  private nextHoloAfterimageAt = 0;

  constructor() { super(SceneKeys.Heist); }

  private get modRuntime() { return this.session.sharedRuntime.modRuntime; }
  private get temporaryAmmo() { return this.session.sharedRuntime.temporaryAmmo; }
  private get mineChargeRack() { return this.session.sharedRuntime.mineChargeRack; }
  private get abilityState() { return this.session.abilityState; }

  create(data?: unknown): void {
    if (!isSessionData(data)) {
      this.scene.resume(SceneKeys.Arena);
      this.scene.stop();
      return;
    }
    this.session = data;
    const settings = SaveSystem.get().settings;
    this.aimSettings = normalizeAimSettings(settings.aim);
    this.resolveProjectileCosmetics();
    this.createCombatPools();
    this.boostVisual = new BoostVisualSystem(
      this,
      settings.particles,
      { obtain: (state) => this.fxCirclePool.obtain(state), release: (circle) => this.fxCirclePool.release(circle) },
      (sampleTime) => SaveSystem.getCosmeticColor('dashTrail', sampleTime),
      () => getCosmeticById(SaveSystem.getEquippedCosmeticId('dashTrail'))?.dashTrailEffect ?? 'ion'
    );
    this.mineExplosionVfx = new MineExplosionVfx(this, settings.particles);
    this.random = new SeededRandom((data.seed ^ 0x4e1a57 ^ Math.imul(data.round, 0x27d4eb2d)) >>> 0);
    this.rewards = new HeistRewardService(data.seed, data.round, data.protocol);
    this.pickupPresentation = new GameplayPickupPresentation(
      this,
      () => this.modRuntime.hasInfusion('pickup-orbit')
    );
    this.lootPickups = new HeistLootPickupSystem(this, this.rewards, this.pickupPresentation);
    this.pendingLoot = this.rewards.createEmpty();
    this.physics.world.setBounds(0, 0, HEIST_WORLD.width, HEIST_WORLD.height);
    this.cameras.main.setBounds(0, 0, HEIST_WORLD.width, HEIST_WORLD.height);
    this.cameras.main.setBackgroundColor(0x02050a);
    this.facility = createHeistFacility(this);
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
    this.hazardGraphics = this.add.graphics().setDepth(4);
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
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private resolveProjectileCosmetics(): void {
    this.projectileTextureKey = getCosmeticTextureKey(
      SaveSystem.getEquippedCosmeticId('projectileShape'),
      'projectile-pulse'
    );
    if (this.projectileTextureKey === 'projectile-missile' || this.projectileTextureKey === 'projectile-sword') {
      this.projectileWidth = 17; this.projectileHeight = 8;
    } else if (this.projectileTextureKey === 'projectile-lightning') {
      this.projectileWidth = 15; this.projectileHeight = 10;
    } else if (this.projectileTextureKey === 'projectile-carrot') {
      this.projectileWidth = 16; this.projectileHeight = 9;
    } else if (this.projectileTextureKey === 'projectile-bubbles') {
      this.projectileWidth = 13; this.projectileHeight = 11;
    } else if (this.projectileTextureKey === 'projectile-balloons') {
      this.projectileWidth = 14; this.projectileHeight = 13;
    } else {
      this.projectileWidth = 8; this.projectileHeight = 8;
    }
  }

  private createCombatPools(): void {
    const configureProjectile = (projectile: HeistProjectile, state: HeistProjectileSpawn): void => {
      const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | null;
      if (body) {
        body.enable = true;
        body.reset(state.previousX, state.previousY);
        body.setVelocity(state.velocityX, state.velocityY);
      }
      projectile.sprite.setActive(true).setVisible(true).setPosition(state.previousX, state.previousY)
        .setTexture(state.texture).setDisplaySize(state.width, state.height).clearTint().setTint(state.tint)
        .setAlpha(1).setRotation(state.rotation).setDepth(9);
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
      projectile.crossedFences.clear();
      if (state.crossedFences) for (const fence of state.crossedFences) projectile.crossedFences.add(fence);
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
    this.facility.update(now, this.player.x, this.player.y);
    this.extractionPortal?.update(now);
    this.updateCrosshair();
    this.mineExplosionVfx.update(now);
    this.coreAudio.setLowHealthWarning(!this.manuallyPaused && !this.inputCapturePaused
      && this.player.hp > 0 && this.player.hp <= this.player.stats.maxHealth * 0.25);
    if (this.inputCapturePaused || this.manuallyPaused) {
      this.player.setVelocity(0, 0);
      this.updateHud(now);
      return;
    }
    this.player.updateEnergy(dt);
    this.updatePlayerMovement(now);
    this.updatePlayerCombat(now);
    this.updateAbilities(now);
    this.updateProjectiles(now, delta);
    this.updateEnemies(now, dt);
    this.updateMines(now);
    this.updateFences(now, dt);
    this.updateTurrets(now);
    this.updatePickups(now);
    const pickupField = this.modRuntime.magneticServiceField(this.player.stats.pickupRadius);
    this.lootPickups.update(now, dt, this.player.x, this.player.y, this.player.stats.pickupRadius,
      pickupField.attractionRadius, pickupField.pullSpeed,
      (reward, x, y) => this.collectLoot(reward, x, y));
    this.updateHazards(now);
    this.updateMission(now);
    this.updateHud(now);
    if (this.player.isDead()) this.failHeist();
  }

  private createPlayer(): void {
    const source = this.session.player;
    const start = this.facility.extractionPoint;
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
    this.playerWallCollider = this.physics.add.collider(this.player, this.facility.walls);
    this.playerDoorCollider = this.physics.add.collider(this.player, this.facility.vaultDoor);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setZoom(0.92);
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
        root: this.pickupPresentation.create(entry.kind, entry.x, entry.y).setDepth(8)
      });
    }
  }

  private updatePlayerMovement(now: number): void {
    const move = this.inputController.move;
    const aim = this.getAimPoint();
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    const forwardFacingFrame = this.player.texture.key === 'player-spaceship' || this.player.texture.key === 'player-airplane';
    this.player.setRotation(angle + (forwardFacingFrame ? 0 : Math.PI / 2));
    if (now >= this.player.dashUntil) {
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
    const cadence = 1000 / this.player.fireRate;
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
    const ammoMode = this.temporaryAmmo.activeMode(now);
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
    this.mines.push(new Mine(this, aim.x, aim.y, COLORS.orange, cfg.armMs, cfg.damage, cfg.radius));
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
    points.forEach((point, index) => this.mines.push(new Mine(this, point.x, point.y, COLORS.orange,
      cfg.armMs, cfg.damage, cfg.radius, { fromX: this.player.x, fromY: this.player.y,
        durationMs: salvo.flightMs, delayMs: index * salvo.staggerMs })));
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
    const projectile = this.projectilePool.obtain({
      owner: 'player', texture: grenade ? 'ammo-grenade-round' : scatter ? 'ammo-scatter-pellet' : this.projectileTextureKey,
      width: grenade ? TEMPORARY_AMMO_BALANCE.grenade.width : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.width : this.projectileWidth,
      height: grenade ? TEMPORARY_AMMO_BALANCE.grenade.height : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.height : this.projectileHeight,
      tint, rotation: angle, velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed,
      damage: damage * (scatter ? TEMPORARY_AMMO_BALANCE.scattershot.pelletDamageMultiplier : 1),
      lifeMs: grenade ? TEMPORARY_AMMO_BALANCE.grenade.projectileLifetimeMs
        : scatter ? TEMPORARY_AMMO_BALANCE.scattershot.projectileLifetimeMs : 950,
      trailColor, critical, ricochetsRemaining, ammoMode: mode, previousX: x, previousY: y
    });
    this.projectiles.push(projectile);
  }

  private updateProjectiles(now: number, delta: number): void {
    this.projectileTrails.beginFrame(now);
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      projectile.lifeMs -= delta;
      if (projectile.lifeMs <= 0) {
        this.retireProjectile(projectile, index);
        continue;
      }
      if (now >= projectile.nextTrailAt) {
        if (this.modRuntime.hasInfusion('prismatic-rounds') && projectile.owner === 'player') {
          const phase = now * 0.004 + index * 0.7;
          const red = Math.round(128 + Math.sin(phase) * 127);
          const green = Math.round(128 + Math.sin(phase + 2.094) * 127);
          const blue = Math.round(128 + Math.sin(phase + 4.188) * 127);
          const prism = (red << 16) | (green << 8) | blue;
          projectile.sprite.setTint(prism);
          projectile.trailColor = prism;
        }
        this.projectileTrails.emit(projectile.sprite.x, projectile.sprite.y, projectile.trailColor, now);
        projectile.nextTrailAt = now + 34;
      }
      if (this.pointBlocked(projectile.sprite.x, projectile.sprite.y)) {
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
        const container = this.findContainerHit(projectile.sprite.x, projectile.sprite.y);
        if (container) {
          this.damageContainer(container, projectile.damage);
          this.retireProjectile(projectile, index);
          continue;
        }
        const enemy = this.findEnemyHit(projectile.sprite.x, projectile.sprite.y);
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
    const radius = TEMPORARY_AMMO_BALANCE.grenade.splashRadius;
    const damage = projectile.damage * TEMPORARY_AMMO_BALANCE.grenade.splashDamageMultiplier;
    this.mineExplosionVfx.emit(projectile.sprite.x, projectile.sprite.y, radius,
      [0xffffff, 0xffa340, 0xff4e27, 0xff174f], this.time.now);
    this.coreAudio.playSfx('grenadeShotExplosion');
    for (const enemy of this.enemies) {
      if (enemy === directHit) continue;
      const dx = enemy.x - projectile.sprite.x; const dy = enemy.y - projectile.sprite.y;
      if (dx * dx + dy * dy <= radius * radius) this.damageEnemy(enemy, damage);
    }
  }

  private updateEnemies(now: number, dt: number): void {
    const playerRouteIndex = this.nearestRouteIndex(this.player.x, this.player.y);
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (!enemy.active || enemy.hp <= 0) { this.removeEnemy(enemy, index); continue; }
      enemy.updateDamageFlash(now);
      const navigationTarget = this.enemyNavigationTarget(enemy, playerRouteIndex);
      const dx = navigationTarget.x - enemy.x;
      const dy = navigationTarget.y - enemy.y;
      const playerDx = this.player.x - enemy.x;
      const playerDy = this.player.y - enemy.y;
      const distanceSquared = playerDx * playerDx + playerDy * playerDy;
      const navigationDistance = Math.sqrt(Math.max(1, dx * dx + dy * dy));
      let steerX = dx / navigationDistance;
      let steerY = dy / navigationDistance;
      for (const other of this.enemies) {
        if (other === enemy || !other.active) continue;
        const ox = enemy.x - other.x;
        const oy = enemy.y - other.y;
        const d2 = ox * ox + oy * oy;
        if (d2 > 0 && d2 < 34 * 34) { steerX += ox / d2 * 80; steerY += oy / d2 * 80; }
      }
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

  private updateTurrets(now: number): void {
    for (let index = this.turrets.length - 1; index >= 0; index -= 1) {
      const turret = this.turrets[index];
      if (turret.hp <= 0) { turret.destroy(); this.turrets.splice(index, 1); continue; }
      turret.updateCosmetic(now);
      const target = this.nearestEnemy(turret.sprite.x, turret.sprite.y, turret.range);
      if (!target) continue;
      const angle = Phaser.Math.Angle.Between(turret.sprite.x, turret.sprite.y, target.x, target.y);
      turret.aimAt(angle);
      if (turret.canFire(now)) {
        turret.lastShotMs = now;
        turret.markFired(now);
        this.spawnProjectile('turret', turret.sprite.x, turret.sprite.y, angle, 560, turret.damage,
          SaveSystem.getCosmeticColor('turretSkin', now), 950);
      }
    }
  }

  private updatePickups(now: number): void {
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index];
      this.pickupPresentation.update(pickup.root, now);
      const dx = pickup.root.x - this.player.x;
      const dy = pickup.root.y - this.player.y;
      if (dx * dx + dy * dy > this.player.stats.pickupRadius ** 2) continue;
      if (pickup.kind === 'health') {
        const healthCap = this.player.stats.maxHealth
          * getProtocolModeBalance(this.session.protocol).resourcePickupCapMultiplier;
        this.player.hp = Math.min(healthCap,
          this.player.hp + HEIST_BALANCE.supportHealthAmount * this.modRuntime.multiplier('healthPickupValue'));
        this.coreAudio.playSfx(GAMEPLAY_PICKUP_SFX_BY_TYPE.health);
      } else {
        const energyCap = this.player.energyStats.max
          * getProtocolModeBalance(this.session.protocol).resourcePickupCapMultiplier;
        this.player.energy = Math.min(energyCap,
          this.player.energy + this.player.energyStats.max * HEIST_BALANCE.supportEnergyFraction * this.modRuntime.multiplier('energyPickupValue'));
        this.coreAudio.playSfx(GAMEPLAY_PICKUP_SFX_BY_TYPE.energy);
      }
      pickup.root.destroy(true);
      this.pickups.splice(index, 1);
    }
  }

  private updateHazards(now: number): void {
    this.hazardGraphics.clear();
    if (this.phase !== 'escape') return;
    const electricActive = Math.floor((now - this.phaseStartedAt) / 1500) % 2 === 0;
    const fireActive = Math.floor((now - this.phaseStartedAt + 700) / 1900) % 2 === 0;
    if (electricActive) {
      this.hazardGraphics.fillStyle(0x4deaff, 0.12).fillRect(930, 470, 180, 260);
      this.hazardGraphics.lineStyle(3, 0x79f8ff, 0.7);
      for (let y = 485; y < 725; y += 32) this.hazardGraphics.lineBetween(930, y, 1110, y + (y % 64 ? -16 : 16));
      if (this.player.x >= 930 && this.player.x <= 1110 && this.player.y >= 470 && this.player.y <= 730) {
        this.damagePlayer(4.5 * getProtocolModeBalance(this.session.protocol).hazardDamageMultiplier);
      }
    }
    if (fireActive) {
      this.hazardGraphics.fillStyle(0xff532e, 0.16).fillRect(1370, 525, 230, 150);
      for (let x = 1380; x < 1590; x += 30) this.hazardGraphics.fillTriangle(x, 675, x + 13, 535, x + 26, 675);
      if (this.player.x >= 1370 && this.player.x <= 1600 && this.player.y >= 525 && this.player.y <= 675) {
        this.damagePlayer(5 * getProtocolModeBalance(this.session.protocol).hazardDamageMultiplier);
      }
    }
  }

  private updateMission(now: number): void {
    const doorDistanceSquared = (this.player.x - HEIST_BALANCE.vaultDoorX) ** 2
      + (this.player.y - HEIST_BALANCE.vaultDoorY) ** 2;
    if (this.phase === 'inbound' && doorDistanceSquared <= HEIST_BALANCE.vaultApproachRadius ** 2) {
      this.setPhase('vault-opening');
      this.audio.play('door-activation');
      this.facility.setVaultDoorOpen(true);
      this.audio.play('door-open');
      this.announce('VAULT LINK ACCEPTED', 'SECURITY BULKHEAD OPENING');
    }
    if (this.phase === 'vault-opening' && this.player.x >= HEIST_BALANCE.vaultInsideX) {
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
    if (this.phase === 'escape' && this.extractionPortal) {
      const dx = this.player.x - this.extractionPortal.x;
      const dy = this.player.y - this.extractionPortal.y;
      const nearby = dx * dx + dy * dy <= HEIST_BALANCE.extractionRadius ** 2;
      const ready = this.extractionPortal.readyForInteraction;
      this.promptText.setVisible(nearby).setText(ready
        ? `${this.inputController.prompt('interact', 'E')} EXTRACT // COMMIT COLLECTED HAUL`
        : 'EXTRACTION BREACH STABILIZING');
      if (nearby && ready && this.inputController.pressed('interact')) this.completeHeist();
    } else this.promptText.setVisible(false);
  }

  private startAmbush(): void {
    if (this.phase === 'escape' || this.returning) return;
    this.setPhase('escape');
    this.facility.setEscapeRoute(true);
    this.audio.play('ambush-trigger');
    this.audio.play('warning-state');
    this.emitMetric('anomaly_ambush_started');
    this.announce('SECURITY RESPONSE DETECTED', 'EXTRACTION ACTIVE // GET BACK TO THE PORTAL');
    const count = Math.min(HEIST_BALANCE.maximumRegularEnemies,
      HEIST_BALANCE.initialEnemyCount + Math.floor(this.session.round / 8) * HEIST_BALANCE.enemyPerEightRounds);
    const positions = this.facility.ambushPoints;
    for (let index = 0; index < count; index += 1) {
      const point = positions[index % positions.length];
      const types = this.session.round >= 8 ? ['grunt', 'shooter', 'tank', 'disruptor'] as const
        : this.session.round >= 3 ? ['grunt', 'shooter', 'tank'] as const : ['grunt', 'shooter'] as const;
      this.spawnEnemy(types[index % types.length], point.x + (index % 3) * 32, point.y + Math.floor(index / positions.length) * 28, false);
    }
    const forceMiniBoss = this.session.dev?.forceMiniBoss;
    if (forceMiniBoss === true || (forceMiniBoss !== false && this.random.next() < HEIST_BALANCE.miniBossChance)) {
      this.spawnEnemy('tank', 2780, 1580, true);
    }
    this.openExtraction();
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
    this.physics.add.collider(enemy, this.facility.vaultDoor);
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
    this.time.delayedCall(50, () => { if (enemy.active) enemy.setTint(enemy.stats.color); });
    if (enemy.hp <= 0) this.triggerSplitCurrent(enemy, applied);
  }

  private triggerSplitCurrent(killedEnemy: Enemy, killingDamage: number): void {
    const standard = this.modRuntime.has('split-current');
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
          tint: projectile.sprite.tintTopLeft,
          rotation: angle,
          velocityX: Math.cos(angle) * speed,
          velocityY: Math.sin(angle) * speed,
          damage: newDamage,
          lifeMs: projectile.lifeMs,
          trailColor: projectile.trailColor,
          critical: projectile.critical,
          ricochetsRemaining: projectile.ricochetsRemaining,
          ammoMode: projectile.ammoMode,
          previousX: x,
          previousY: y,
          crossedFences
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
    this.cameras.main.fadeOut(HEIST_BALANCE.transitionDurationMs, 100, 225, 255);
    this.time.delayedCall(HEIST_BALANCE.transitionDurationMs + 20, () => this.returnToArena(true, 'extracted'));
  }

  private failHeist(): void {
    if (this.returning) return;
    this.returning = true;
    this.phase = 'returning';
    this.audio.play('heist-failed');
    this.emitMetric('anomaly_failed', this.finalMetricFields('player-dead'));
    this.announce('HEIST FAILED', 'PROVISIONAL HAUL LOST // ARENA LINK RESTORING');
    this.physics.pause();
    this.time.delayedCall(720, () => this.cameras.main.fadeOut(500, 100, 225, 255));
    this.time.delayedCall(1250, () => this.returnToArena(false, 'player-dead'));
  }

  private returnToArena(success: boolean, reason: 'extracted' | 'player-dead' | 'scene-shutdown'): void {
    const arena = this.scene.get(SceneKeys.Arena);
    const result: AnomalyReturnResult = {
      sessionId: this.session.sessionId,
      anomalyId: 'heist',
      success,
      sourcePortal: { ...this.session.sourcePortal },
      loot: success ? this.pendingLoot : emptyLoot(),
      reason,
      inputDevice: this.inputController.activeDevice,
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
    // Phaser defers both operations until its next SceneManager update. Queue
    // HEIST shutdown first, then let Arena stage the result and request RESUME.
    // Arena performs restoration from its RESUME event, after this cleanup has
    // completed, so no retiring anomaly callback can re-suspend live gameplay.
    this.cameras.main.setAlpha(0).setVisible(false);
    this.scene.stop(SceneKeys.Heist);
    arena.events.emit('anomaly-return', result);
  }

  private updateHud(now: number): void {
    this.lootText.setText(`PENDING HAUL\n¢ ${this.pendingLoot.credits.toLocaleString()}  ◆ ${this.pendingLoot.coreTokens}  ◇ ${this.pendingLoot.plasmaChips}\nFLUX ${this.pendingLoot.fluxCores}  MODS ${this.pendingLoot.modIds.length}`);
    const objective = this.phase === 'inbound' || this.phase === 'vault-opening' ? 'INFILTRATE THE VAULT'
      : this.phase === 'looting' ? `BREACH SECURITY CONTAINERS // ${this.containersOpened} / ${this.containers.length}`
        : this.phase === 'egress-delay' ? 'EXIT THE VAULT'
          : this.phase === 'escape' ? `EXTRACT NOW // ${this.enemies.length} HOSTILES REMAINING`
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
    const target = this.phase === 'escape' ? this.facility.extractionPoint
      : { x: HEIST_BALANCE.vaultDoorX, y: HEIST_BALANCE.vaultDoorY };
    this.hudRadarContacts.push({ kind: 'objective', dx: target.x - this.player.x, dy: target.y - this.player.y,
      state: this.phase === 'escape' ? 'active' : 'available' });

    const wallet = SaveSystem.get();
    Object.assign(this.hudPayload, {
      hp: this.player.hp, maxHp: this.player.stats.maxHealth,
      energy: this.player.energy, maxEnergy: this.player.energyStats.max,
      level: this.session.round, enemies: this.enemies.length,
      credits: wallet.credits, coreTokens: wallet.coreTokens,
      plasmaChips: SaveSystem.getModCollection().plasmaChips, fluxCores: wallet.fluxCores,
      phase: 'ANOMALY', objective
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
      this.input.setDefaultCursor('default');
      this.crosshair.setVisible(false);
      bridge?.showResume('CLICK TO RESUME HEIST');
    } else {
      this.physics.resume();
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
    if (this.facility.vaultDoor.body?.enable && Math.abs(x - this.facility.vaultDoor.x) < 34 && Math.abs(y - this.facility.vaultDoor.y) < 286) return true;
    return this.facility.wallRects.some((rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
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

  private nearestRouteIndex(x: number, y: number): number {
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    const route = this.facility.route;
    for (let index = 0; index < route.length; index += 1) {
      const dx = route[index].x - x;
      const dy = route[index].y - y;
      const distance = dx * dx + dy * dy;
      if (distance < best) { best = distance; nearest = index; }
    }
    return nearest;
  }

  private enemyNavigationTarget(enemy: Enemy, playerRouteIndex: number): { x: number; y: number } {
    const route = this.facility.route;
    const enemyRouteIndex = this.nearestRouteIndex(enemy.x, enemy.y);
    if (Math.abs(enemyRouteIndex - playerRouteIndex) <= 1) return this.player;
    const direction = playerRouteIndex > enemyRouteIndex ? 1 : -1;
    return route[Phaser.Math.Clamp(enemyRouteIndex + direction, 0, route.length - 1)];
  }

  private retireProjectile(projectile: HeistProjectile, activeIndex: number): void {
    this.projectilePool.release(projectile);
    this.projectiles.splice(activeIndex, 1);
  }

  private removeEnemy(enemy: Enemy, index: number): void {
    if (enemy.name === 'heist-mini-boss' && enemy.hp <= 0) this.miniBossKilled = true;
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
    }
    enemy.destroy();
    this.enemies.splice(index, 1);
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

  private cleanup(): void {
    this.audio.stopAll();
    this.coreAudio.setLowHealthWarning(false);
    this.inputController?.destroy();
    this.pauseMenu?.destroy();
    this.pauseMenu = null;
    this.playerWallCollider?.destroy();
    this.playerDoorCollider?.destroy();
    this.facility?.destroy();
    this.lootPickups?.destroy();
    this.extractionPortal?.destroy();
    this.extractionPortal = null;
    this.crosshair?.destroy();
    this.hud?.destroy();
    this.shieldVisual?.destroy();
    this.shieldVisual = null;
    this.boostVisual?.destroy();
    this.mineExplosionVfx?.destroy();
    this.projectileTrails?.destroy();
    this.scale.off('resize', this.handleResize, this);
    this.projectilePool?.destroy((projectile) => projectile.sprite.destroy());
    this.fxCirclePool?.destroy((circle) => circle.destroy());
    this.projectiles.length = 0;
    this.enemies.forEach((enemy) => enemy.destroy());
    this.enemies.length = 0;
    this.containers.forEach((container) => {
      for (const child of container.root.list) this.tweens.killTweensOf(child);
      this.tweens.killTweensOf(container.root);
      container.root.destroy(true);
    });
    this.pickups.forEach((pickup) => pickup.root.destroy(true));
    this.fences.forEach((fence) => fence.destroy());
    this.turrets.forEach((turret) => turret.destroy());
    this.mines.forEach((mine) => mine.destroy());
    if (!this.returning && this.session) {
      const arena = this.scene.get(SceneKeys.Arena);
      arena.events.emit('anomaly-return', {
        sessionId: this.session.sessionId, anomalyId: 'heist', success: false,
        sourcePortal: { ...this.session.sourcePortal }, loot: emptyLoot(), reason: 'scene-shutdown',
        inputDevice: this.inputController?.activeDevice ?? this.session.initialInputDevice
      } satisfies AnomalyReturnResult);
    }
    if (import.meta.env.DEV) {
      const debug = globalThis as typeof globalThis & { forceHeistAmbush?: unknown; forceHeistExtraction?: unknown };
      delete debug.forceHeistAmbush;
      delete debug.forceHeistExtraction;
    }
  }
}
