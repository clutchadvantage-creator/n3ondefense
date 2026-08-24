import Phaser from 'phaser';
import { PLAYER_BALANCE, WEAPON_BALANCE, getDifficultyCurve } from '../../config/balance/index.ts';
import { normalizeControllerSettings } from '../../config/controllerSettings.ts';
import { SceneKeys } from '../../flow/SceneKeys.ts';
import { PlayerInput } from '../../input/PlayerInput.ts';
import { baseEnemyStats, Enemy, type EnemyStats } from '../../enemies/Enemy.ts';
import { ENEMY_ROBOT_FRAMES } from '../../enemies/EnemyRobotFrames.ts';
import { Player } from '../../entities/Player.ts';
import { SaveSystem } from '../../systems/SaveSystem.ts';
import { SeededRandom } from '../../systems/SeededRandom.ts';
import { createSilentAnomalyAudioHooks } from '../AnomalyAudioHooks.ts';
import { AnomalyPortalVisual } from '../AnomalyPortalVisual.ts';
import { recordAnomalyMetric } from '../AnomalyTelemetry.ts';
import type {
  AnomalyMetricName,
  AnomalyReturnResult,
  HeistAbilityConfig,
  HeistSessionData,
  PendingAnomalyLoot
} from '../types.ts';
import { HEIST_BALANCE, HEIST_WORLD } from './HeistConfig.ts';
import { createHeistFacility, type HeistFacilityRuntime } from './HeistFacility.ts';
import { HeistRewardService } from './HeistRewardService.ts';
import { HeistLootPickupSystem } from './HeistLootPickupSystem.ts';

type HeistPhase = 'inbound' | 'vault-opening' | 'looting' | 'egress-delay' | 'escape' | 'returning';
type ProjectileOwner = 'player' | 'enemy' | 'turret';

interface HeistProjectile {
  sprite: Phaser.Physics.Arcade.Image;
  owner: ProjectileOwner;
  damage: number;
  expiresAt: number;
  active: boolean;
  crossedFences: Set<HeistFence>;
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
  baseY: number;
  phase: number;
}

interface HeistFence {
  root: Phaser.GameObjects.Container;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  expiresAt: number;
  damage: number;
}

interface HeistTurret {
  root: Phaser.GameObjects.Container;
  expiresAt: number;
  nextShotAt: number;
  config: HeistAbilityConfig;
}

interface HeistMine {
  root: Phaser.GameObjects.Container;
  armedAt: number;
  config: HeistAbilityConfig;
}

const isSessionData = (value: unknown): value is HeistSessionData => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HeistSessionData>;
  return candidate.anomalyId === 'heist' && typeof candidate.sessionId === 'string' && !!candidate.player && !!candidate.abilities;
};

const emptyLoot = (): PendingAnomalyLoot => ({ credits: 0, coreTokens: 0, plasmaChips: 0, fluxCores: 0, modIds: [] });

export class HeistScene extends Phaser.Scene {
  private readonly audio = createSilentAnomalyAudioHooks();
  private session!: HeistSessionData;
  private player!: Player;
  private inputController!: PlayerInput;
  private facility!: HeistFacilityRuntime;
  private random!: SeededRandom;
  private rewards!: HeistRewardService;
  private lootPickups!: HeistLootPickupSystem;
  private pendingLoot: PendingAnomalyLoot = emptyLoot();
  private phase: HeistPhase = 'inbound';
  private elapsedMs = 0;
  private phaseStartedAt = 0;
  private playerWallCollider: Phaser.Physics.Arcade.Collider | null = null;
  private playerDoorCollider: Phaser.Physics.Arcade.Collider | null = null;
  private enemies: Enemy[] = [];
  private projectiles: HeistProjectile[] = [];
  private projectilePool: HeistProjectile[] = [];
  private containers: HeistContainer[] = [];
  private pickups: HeistPickup[] = [];
  private fences: HeistFence[] = [];
  private turrets: HeistTurret[] = [];
  private mines: HeistMine[] = [];
  private extractionPortal: AnomalyPortalVisual | null = null;
  private titleText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private vitalsText!: Phaser.GameObjects.Text;
  private lootText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private announcementText!: Phaser.GameObjects.Text;
  private hazardGraphics!: Phaser.GameObjects.Graphics;
  private crosshair!: Phaser.GameObjects.Graphics;
  private shieldVisual: Phaser.GameObjects.Arc | null = null;
  private shieldUntil = 0;
  private shieldCooldownUntil = 0;
  private nextPlayerShotAt = 0;
  private abilityReadyAt = { fence: 0, turret: 0, mine: 0 };
  private damageDealt = 0;
  private damageTaken = 0;
  private containersOpened = 0;
  private miniBossEncountered = false;
  private miniBossKilled = false;
  private returning = false;
  private inputCapturePaused = false;
  private readonly aimScratch = new Phaser.Math.Vector2();

  constructor() { super(SceneKeys.Heist); }

  create(data?: unknown): void {
    if (!isSessionData(data)) {
      this.scene.resume(SceneKeys.Arena);
      this.scene.stop();
      return;
    }
    this.session = data;
    this.random = new SeededRandom((data.seed ^ 0x4e1a57 ^ Math.imul(data.round, 0x27d4eb2d)) >>> 0);
    this.rewards = new HeistRewardService(data.seed, data.round, data.protocol);
    this.lootPickups = new HeistLootPickupSystem(this, this.rewards);
    this.pendingLoot = this.rewards.createEmpty();
    this.physics.world.setBounds(0, 0, HEIST_WORLD.width, HEIST_WORLD.height);
    this.cameras.main.setBounds(0, 0, HEIST_WORLD.width, HEIST_WORLD.height);
    this.cameras.main.setBackgroundColor(0x02050a);
    this.facility = createHeistFacility(this);
    this.createPlayer();
    this.createVaultContainers();
    this.createHud();
    this.createSupportPickups();
    this.hazardGraphics = this.add.graphics().setDepth(4);
    const settings = SaveSystem.get().settings;
    this.inputController = new PlayerInput(this, settings.abilityBindings, normalizeControllerSettings(settings.controller));
    if (data.initialInputDevice) this.inputController.adoptDevice(data.initialInputDevice);
    this.input.keyboard?.resetKeys();
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

  update(_time: number, delta: number): void {
    if (this.returning) return;
    const now = this.time.now;
    const dt = Math.min(delta, 100) / 1000;
    this.elapsedMs += Math.min(delta, 250);
    this.inputController.update('gameplay');
    this.updateInputCapture();
    this.facility.update(now, this.player.x, this.player.y);
    this.extractionPortal?.update(now);
    this.updateCrosshair();
    if (this.inputCapturePaused) {
      this.player.setVelocity(0, 0);
      this.updateHud(now);
      return;
    }
    this.player.updatePresentation(now);
    this.player.updateEnergy(dt);
    this.updatePlayerMovement(now);
    this.updatePlayerCombat(now);
    this.updateAbilities(now);
    this.updateProjectiles(now);
    this.updateEnemies(now, dt);
    this.updateMines(now);
    this.updateFences(now, dt);
    this.updateTurrets(now);
    this.updatePickups(now);
    this.lootPickups.update(now, dt, this.player.x, this.player.y, this.player.stats.pickupRadius,
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
    this.player.hp = Math.min(source.hp, source.stats.maxHealth);
    this.player.energy = Math.min(source.energy, source.energyStats.max);
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
      const glow = this.add.rectangle(0, 0, 82, 64, 0xff4fd8, 0.12).setStrokeStyle(2, 0xff58d7, 0.7);
      const body = this.add.rectangle(0, 0, 66, 50, 0x102637, 1).setStrokeStyle(2, index % 2 ? 0xff4fd8 : 0x58f5ff, 1);
      const stripe = this.add.rectangle(0, -9, 54, 5, index % 2 ? 0xff4fd8 : 0x58f5ff, 0.85);
      const cracks = this.add.graphics();
      const label = this.add.text(0, 11, `SEC-${String(index + 1).padStart(2, '0')}`, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#c9faff', fontStyle: 'bold'
      }).setOrigin(0.5);
      const root = this.add.container(point.x, point.y, [glow, body, stripe, cracks, label]).setDepth(7);
      const maximumHp = 54 + this.session.round * 2.2;
      this.containers.push({ root, body, cracks, maximumHp, hp: maximumHp, opened: false, index });
    }
  }

  private createHud(): void {
    const width = this.scale.width;
    this.titleText = this.add.text(width * 0.5, 22, 'ANOMALY // HEIST', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '28px', color: '#ff63dc', stroke: '#030912', strokeThickness: 7
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20_000);
    this.objectiveText = this.add.text(width * 0.5, 64, 'INFILTRATE THE VAULT', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '23px', color: '#8ef9ff', backgroundColor: '#06121de6',
      padding: { x: 18, y: 9 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20_000);
    this.vitalsText = this.add.text(18, 18, '', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', color: '#c7faff', backgroundColor: '#06121de6',
      padding: { x: 13, y: 9 }
    }).setScrollFactor(0).setDepth(20_000);
    this.lootText = this.add.text(width - 18, 18, '', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '19px', color: '#ffe16d', align: 'right', backgroundColor: '#06121de6',
      padding: { x: 13, y: 9 }
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

  private createSupportPickups(): void {
    const entries = this.facility.supportPoints;
    for (const [index, entry] of entries.entries()) {
      const color = entry.kind === 'health' ? 0x65ff92 : 0x52ecff;
      const halo = this.add.circle(0, 0, 25, color, 0.12).setStrokeStyle(2, color, 0.75);
      const core = this.add.circle(0, 0, 11, color, 0.9).setBlendMode(Phaser.BlendModes.ADD);
      const icon = this.add.text(0, 0, entry.kind === 'health' ? '+' : '⚡', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#07111d', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.pickups.push({ kind: entry.kind, root: this.add.container(entry.x, entry.y, [halo, core, icon]).setDepth(8),
        baseY: entry.y, phase: index * 1.7 });
    }
  }

  private updatePlayerMovement(now: number): void {
    const move = this.inputController.move;
    if (now >= this.player.dashUntil) {
      const lengthSquared = move.x * move.x + move.y * move.y;
      if (lengthSquared > 0) {
        const scale = this.player.speed / Math.sqrt(Math.max(1, lengthSquared));
        this.player.setVelocity(move.x * scale, move.y * scale);
      } else this.player.setVelocity(0, 0);
    }
    const aim = this.getAimPoint();
    this.player.setRotation(Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y) + Math.PI / 2);
    if (this.inputController.pressed('dash') && this.player.canDash(now) && this.player.canSpendEnergy(PLAYER_BALANCE.dashEnergyCost)) {
      this.player.spendEnergy(PLAYER_BALANCE.dashEnergyCost);
      this.player.dashTowardPoint(aim.x, aim.y, now);
    }
  }

  private updatePlayerCombat(now: number): void {
    if (!this.inputController.held('fire') || this.player.heat >= this.player.weapon.maxHeat) return;
    if (now < this.nextPlayerShotAt) return;
    const cost = WEAPON_BALANCE.energyCostPerShot;
    if (!this.player.canSpendEnergy(cost)) return;
    this.player.spendEnergy(cost);
    this.player.heat += this.player.weapon.heatPerShot;
    this.nextPlayerShotAt = now + 1000 / this.player.fireRate;
    const aim = this.getAimPoint();
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, aim.x, aim.y);
    const critical = this.random.next() < this.player.weapon.critChance;
    const damage = this.player.weapon.damage * this.player.damageMultiplier * (critical ? 1.8 : 1);
    this.spawnProjectile('player', this.player.x + Math.cos(angle) * 18, this.player.y + Math.sin(angle) * 18,
      angle, this.player.weapon.projectileSpeed, damage, critical ? 0xfff07b : SaveSystem.getCosmeticColor('projectileColor', now), HEIST_BALANCE.playerProjectileLifeMs);
  }

  private updateAbilities(now: number): void {
    if (this.inputController.pressed('shield')) this.activateShield(now);
    if (this.inputController.pressed('fence')) this.placeFence(now);
    if (this.inputController.pressed('turret')) this.placeTurret(now);
    if (this.inputController.pressed('mine')) this.placeMine(now);
    if (this.shieldVisual) {
      this.shieldVisual.setPosition(this.player.x, this.player.y).setRotation(now * 0.001);
      if (now >= this.shieldUntil) { this.shieldVisual.destroy(); this.shieldVisual = null; }
    }
  }

  private activateShield(now: number): void {
    if (now < this.shieldCooldownUntil || !this.player.canSpendEnergy(this.session.abilities.shieldEnergyCost)) return;
    this.player.spendEnergy(this.session.abilities.shieldEnergyCost);
    this.shieldUntil = now + this.session.abilities.shieldDurationMs;
    this.shieldCooldownUntil = now + this.session.abilities.shieldCooldownMs;
    this.shieldVisual?.destroy();
    this.shieldVisual = this.add.circle(this.player.x, this.player.y, 32, 0x56eaff, 0.13)
      .setStrokeStyle(3, 0x77f8ff, 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(10);
  }

  private placeFence(now: number): void {
    const cfg = this.session.abilities.fence;
    if (now < this.abilityReadyAt.fence || this.fences.length >= cfg.maxActive || !this.player.canSpendEnergy(cfg.energyCost)) return;
    this.player.spendEnergy(cfg.energyCost);
    this.abilityReadyAt.fence = now + cfg.cooldownMs;
    const angle = this.player.rotation - Math.PI / 2;
    const tangentX = -Math.sin(angle) * 52;
    const tangentY = Math.cos(angle) * 52;
    const wire = this.add.rectangle(0, 0, 104, 5, 0x55f5ff, 0.62).setStrokeStyle(2, 0xffffff, 0.8);
    const left = this.add.circle(-52, 0, 7, 0x15384b, 1).setStrokeStyle(2, 0x58f5ff, 1);
    const right = this.add.circle(52, 0, 7, 0x15384b, 1).setStrokeStyle(2, 0xff4fd8, 1);
    const root = this.add.container(this.player.x, this.player.y, [wire, left, right]).setRotation(angle).setDepth(7);
    this.fences.push({ root, x1: this.player.x - tangentX, y1: this.player.y - tangentY,
      x2: this.player.x + tangentX, y2: this.player.y + tangentY, expiresAt: now + cfg.durationMs, damage: cfg.damage });
  }

  private placeTurret(now: number): void {
    const cfg = this.session.abilities.turret;
    if (now < this.abilityReadyAt.turret || this.turrets.length >= cfg.maxActive || !this.player.canSpendEnergy(cfg.energyCost)) return;
    this.player.spendEnergy(cfg.energyCost);
    this.abilityReadyAt.turret = now + cfg.cooldownMs;
    const base = this.add.circle(0, 0, 15, 0x102737, 1).setStrokeStyle(2, 0x58f5ff, 1);
    const barrel = this.add.rectangle(12, 0, 24, 5, 0xff4fd8, 0.9);
    const root = this.add.container(this.player.x, this.player.y, [base, barrel]).setDepth(8);
    this.turrets.push({ root, expiresAt: Number.POSITIVE_INFINITY, nextShotAt: now + 250, config: cfg });
  }

  private placeMine(now: number): void {
    const cfg = this.session.abilities.mine;
    if (now < this.abilityReadyAt.mine || this.mines.length >= cfg.maxActive || !this.player.canSpendEnergy(cfg.energyCost)) return;
    this.player.spendEnergy(cfg.energyCost);
    this.abilityReadyAt.mine = now + cfg.cooldownMs;
    const ring = this.add.circle(0, 0, 16, 0x34140b, 1).setStrokeStyle(3, 0xff713d, 1);
    const core = this.add.circle(0, 0, 6, 0xffd15b, 0.9);
    this.mines.push({ root: this.add.container(this.player.x, this.player.y, [ring, core]).setDepth(7), armedAt: now + cfg.armMs, config: cfg });
  }

  private spawnProjectile(owner: ProjectileOwner, x: number, y: number, angle: number, speed: number, damage: number, color: number, lifeMs: number): void {
    let projectile = this.projectilePool.find((candidate) => !candidate.active);
    if (!projectile) {
      const sprite = this.physics.add.image(-10_000, -10_000, 'pixel').setDisplaySize(10, 5).setDepth(9);
      projectile = { sprite, owner, damage, expiresAt: 0, active: false, crossedFences: new Set() };
      this.projectilePool.push(projectile);
    }
    projectile.active = true;
    projectile.owner = owner;
    projectile.damage = damage;
    projectile.expiresAt = this.time.now + lifeMs;
    projectile.crossedFences.clear();
    projectile.sprite.setActive(true).setVisible(true).setPosition(x, y).setTint(color).setRotation(angle).setAlpha(1);
    if (projectile.sprite.body) projectile.sprite.body.enable = true;
    projectile.sprite.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.projectiles.push(projectile);
  }

  private updateProjectiles(now: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile.active || now >= projectile.expiresAt || this.pointBlocked(projectile.sprite.x, projectile.sprite.y)) {
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
          this.retireProjectile(projectile, index);
          continue;
        }
        if (projectile.owner === 'player') this.splitAtFence(projectile);
      } else {
        const radius = 15;
        const dx = projectile.sprite.x - this.player.x;
        const dy = projectile.sprite.y - this.player.y;
        if (dx * dx + dy * dy <= radius * radius) {
          this.damagePlayer(projectile.damage);
          this.retireProjectile(projectile, index);
        }
      }
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
      mine.root.setScale(1 + Math.sin(now * 0.012 + index) * 0.08);
      if (now < mine.armedAt) continue;
      const target = this.enemies.find((enemy) => enemy.active && (enemy.x - mine.root.x) ** 2 + (enemy.y - mine.root.y) ** 2 <= mine.config.radius ** 2);
      if (!target) continue;
      this.blast(mine.root.x, mine.root.y, mine.config.radius, mine.config.damage, 0xff6a32);
      mine.root.destroy(true);
      this.mines.splice(index, 1);
    }
  }

  private updateFences(now: number, dt: number): void {
    for (let index = this.fences.length - 1; index >= 0; index -= 1) {
      const fence = this.fences[index];
      if (now >= fence.expiresAt) { fence.root.destroy(true); this.fences.splice(index, 1); continue; }
      fence.root.setAlpha(0.72 + Math.sin(now * 0.016 + index) * 0.2);
      for (const enemy of this.enemies) {
        if (this.distanceToSegment(enemy.x, enemy.y, fence.x1, fence.y1, fence.x2, fence.y2) < enemy.stats.size * 0.5 + 7) {
          this.damageEnemy(enemy, fence.damage * dt);
        }
      }
    }
  }

  private updateTurrets(now: number): void {
    for (let index = this.turrets.length - 1; index >= 0; index -= 1) {
      const turret = this.turrets[index];
      if (now >= turret.expiresAt) { turret.root.destroy(true); this.turrets.splice(index, 1); continue; }
      const target = this.nearestEnemy(turret.root.x, turret.root.y, turret.config.range);
      if (!target) continue;
      const angle = Phaser.Math.Angle.Between(turret.root.x, turret.root.y, target.x, target.y);
      turret.root.setRotation(angle);
      if (now >= turret.nextShotAt) {
        turret.nextShotAt = now + 1000 / turret.config.fireRate;
        this.spawnProjectile('turret', turret.root.x, turret.root.y, angle, 560, turret.config.damage, 0x69f7ff, 950);
      }
    }
  }

  private updatePickups(now: number): void {
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index];
      pickup.root.y = pickup.baseY + Math.sin(now * 0.003 + pickup.phase) * 7;
      pickup.root.setScale(1 + Math.sin(now * 0.004 + pickup.phase) * 0.06);
      const dx = pickup.root.x - this.player.x;
      const dy = pickup.root.y - this.player.y;
      if (dx * dx + dy * dy > this.player.stats.pickupRadius ** 2) continue;
      if (pickup.kind === 'health') this.player.hp = Math.min(this.player.stats.maxHealth, this.player.hp + HEIST_BALANCE.supportHealthAmount);
      else this.player.energy = Math.min(this.player.energyStats.max, this.player.energy + this.player.energyStats.max * HEIST_BALANCE.supportEnergyFraction);
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
      if (this.player.x >= 930 && this.player.x <= 1110 && this.player.y >= 470 && this.player.y <= 730) this.damagePlayer(4.5);
    }
    if (fireActive) {
      this.hazardGraphics.fillStyle(0xff532e, 0.16).fillRect(1370, 525, 230, 150);
      for (let x = 1380; x < 1590; x += 30) this.hazardGraphics.fillTriangle(x, 675, x + 13, 535, x + 26, 675);
      if (this.player.x >= 1370 && this.player.x <= 1600 && this.player.y >= 525 && this.player.y <= 675) this.damagePlayer(5);
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
    const stats: EnemyStats = {
      ...base,
      hp: base.hp * curve.healthMultiplier * (elite ? 2.8 : 1),
      damage: base.damage * curve.damageMultiplier * (elite ? 1.35 : 1),
      speed: base.speed * curve.speedMultiplier * (elite ? 0.92 : 1),
      size: base.size * (elite ? 1.55 : 1),
      color: elite ? 0xffd85c : base.color
    };
    const enemy = new Enemy(this, x, y, ENEMY_ROBOT_FRAMES[type].textureKey, stats);
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
    this.time.delayedCall(55, () => { if (container.root.active) container.body.setFillStyle(0x102637, 1); });
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
    for (let index = 0; index < 7; index += 1) {
      const angle = index / 7 * Math.PI * 2 + container.index * 0.37;
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
  }

  private damagePlayer(amount: number): void {
    const now = this.time.now;
    if (now < this.shieldUntil || now < this.player.dashUntil || now < this.player.invulnUntil) return;
    const before = this.player.hp;
    if (this.player.takeDamage(amount)) this.damageTaken += before - this.player.hp;
  }

  private blast(x: number, y: number, radius: number, damage: number, color: number): void {
    const ring = this.add.circle(x, y, 12, color, 0.32).setStrokeStyle(5, 0xffe48a, 1).setDepth(12);
    this.tweens.add({ targets: ring, scale: radius / 12, alpha: 0, duration: 360, onComplete: () => ring.destroy() });
    for (const enemy of this.enemies) {
      const dx = enemy.x - x; const dy = enemy.y - y;
      if (dx * dx + dy * dy <= radius * radius) this.damageEnemy(enemy, damage);
    }
  }

  private splitAtFence(projectile: HeistProjectile): void {
    for (const fence of this.fences) {
      if (projectile.crossedFences.has(fence)) continue;
      if (this.distanceToSegment(projectile.sprite.x, projectile.sprite.y, fence.x1, fence.y1, fence.x2, fence.y2) > 10) continue;
      projectile.crossedFences.add(fence);
      const base = projectile.sprite.rotation;
      for (const offset of [-0.12, 0.12]) this.spawnProjectile('player', projectile.sprite.x, projectile.sprite.y, base + offset, this.player.weapon.projectileSpeed,
        projectile.damage * 0.45, SaveSystem.getCosmeticColor('projectileColor', this.time.now), 720);
    }
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
      reason
    };
    // Resume the preserved Arena before delivering the result. Emitting into a
    // paused scene and then stopping the current top scene caused an ordering
    // race that could leave no visible camera for a frame (or indefinitely in
    // some browsers). Arena owns restoration and is brought to the top first.
    this.scene.resume(SceneKeys.Arena);
    arena.events.emit('anomaly-return', result);
    this.cameras.main.setAlpha(0);
    this.scene.stop(SceneKeys.Heist);
  }

  private updateHud(now: number): void {
    const shield = now < this.shieldUntil ? ' // SHIELD ACTIVE' : '';
    this.vitalsText.setText(`HP ${Math.ceil(this.player.hp)} / ${this.player.stats.maxHealth}\nEN ${Math.ceil(this.player.energy)} / ${this.player.energyStats.max}${shield}`);
    this.lootText.setText(`PENDING HAUL\n¢ ${this.pendingLoot.credits.toLocaleString()}  ◆ ${this.pendingLoot.coreTokens}  ◇ ${this.pendingLoot.plasmaChips}\nFLUX ${this.pendingLoot.fluxCores}  MODS ${this.pendingLoot.modIds.length}`);
    const objective = this.phase === 'inbound' || this.phase === 'vault-opening' ? 'INFILTRATE THE VAULT'
      : this.phase === 'looting' ? `BREACH SECURITY CONTAINERS // ${this.containersOpened} / ${this.containers.length}`
        : this.phase === 'egress-delay' ? 'EXIT THE VAULT'
          : this.phase === 'escape' ? `EXTRACT NOW // ${this.enemies.length} HOSTILES REMAINING`
            : 'ARENA LINK RESTORING';
    this.objectiveText.setText(objective);
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

  private updateInputCapture(): void {
    const bridge = this.session.inputBridge;
    const requiresPointer = this.inputController.activeDevice !== 'gamepad' && Boolean(bridge?.supported);
    const shouldPause = requiresPointer && !bridge?.locked;
    if (shouldPause === this.inputCapturePaused) return;
    this.inputCapturePaused = shouldPause;
    this.inputController.clear();
    if (shouldPause) {
      this.physics.pause();
      this.time.paused = true;
      this.input.setDefaultCursor('default');
      this.crosshair.setVisible(false);
      bridge?.showResume('CLICK TO RESUME HEIST');
    } else {
      this.time.paused = false;
      this.physics.resume();
      this.input.setDefaultCursor('none');
      this.crosshair.setVisible(true);
      bridge?.hidePrompt();
    }
  }

  private updateCrosshair(): void {
    if (this.inputCapturePaused) return;
    const aim = this.getAimPoint();
    const color = this.phase === 'escape' ? 0xff6985 : 0x6af5ff;
    this.crosshair.setPosition(aim.x, aim.y).clear();
    this.crosshair.lineStyle(2, color, 0.9).strokeCircle(0, 0, 8);
    this.crosshair.lineBetween(-15, 0, -6, 0).lineBetween(6, 0, 15, 0)
      .lineBetween(0, -15, 0, -6).lineBetween(0, 6, 0, 15);
  }

  private pointBlocked(x: number, y: number): boolean {
    if (x < 74 || x > HEIST_WORLD.width - 74 || y < 252 || y > 948) return true;
    if (this.facility.vaultDoor.body?.enable && Math.abs(x - this.facility.vaultDoor.x) < 26 && Math.abs(y - this.facility.vaultDoor.y) < 148) return true;
    return this.facility.wallRects.some((rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
  }

  private findContainerHit(x: number, y: number): HeistContainer | null {
    if (this.phase !== 'looting') return null;
    return this.containers.find((container) => !container.opened && Math.abs(x - container.root.x) <= 38 && Math.abs(y - container.root.y) <= 30) ?? null;
  }

  private findEnemyHit(x: number, y: number): Enemy | null {
    return this.enemies.find((enemy) => enemy.active && (enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= (enemy.stats.size * 0.55 + 6) ** 2) ?? null;
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
    projectile.active = false;
    projectile.sprite.setActive(false).setVisible(false).setPosition(-10_000, -10_000).setVelocity(0, 0);
    if (projectile.sprite.body) projectile.sprite.body.enable = false;
    this.projectiles.splice(activeIndex, 1);
  }

  private removeEnemy(enemy: Enemy, index: number): void {
    if (enemy.name === 'heist-mini-boss' && enemy.hp <= 0) this.miniBossKilled = true;
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
    this.inputController?.destroy();
    this.playerWallCollider?.destroy();
    this.playerDoorCollider?.destroy();
    this.facility?.destroy();
    this.lootPickups?.destroy();
    this.extractionPortal?.destroy();
    this.extractionPortal = null;
    this.crosshair?.destroy();
    this.scale.off('resize', this.handleResize, this);
    for (const projectile of this.projectilePool) projectile.sprite.destroy();
    this.projectiles.length = 0;
    this.projectilePool.length = 0;
    this.enemies.forEach((enemy) => enemy.destroy());
    this.enemies.length = 0;
    this.containers.forEach((container) => container.root.destroy(true));
    this.pickups.forEach((pickup) => pickup.root.destroy(true));
    this.fences.forEach((fence) => fence.root.destroy(true));
    this.turrets.forEach((turret) => turret.root.destroy(true));
    this.mines.forEach((mine) => mine.root.destroy(true));
    if (!this.returning && this.session) {
      const arena = this.scene.get(SceneKeys.Arena);
      this.scene.resume(SceneKeys.Arena);
      arena.events.emit('anomaly-return', {
        sessionId: this.session.sessionId, anomalyId: 'heist', success: false,
        sourcePortal: { ...this.session.sourcePortal }, loot: emptyLoot(), reason: 'scene-shutdown'
      } satisfies AnomalyReturnResult);
    }
    if (import.meta.env.DEV) {
      const debug = globalThis as typeof globalThis & { forceHeistAmbush?: unknown; forceHeistExtraction?: unknown };
      delete debug.forceHeistAmbush;
      delete debug.forceHeistExtraction;
    }
  }
}
