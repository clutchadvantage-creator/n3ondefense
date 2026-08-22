import Phaser from 'phaser';
import { BOSS_ARCHETYPES, BOSS_BALANCE, getBossDamageMultiplier, type BossArchetype } from '../config/bossBalance';
import type { RunModeFamily } from '../config/modeBalance.ts';
import type { RectSpec } from '../types';
import type { Player } from '../entities/Player';
import { SeededRandom } from '../systems/SeededRandom';
import { BossCombatVfx } from '../vfx/BossCombatVfx.ts';
import { Boss, type BossDamageSource } from './Boss';

export interface BossEncounterOptions {
  /** Instance-only health scaling used by variants such as N3ON Arcade Mini-Bosses. */
  healthMultiplier?: number;
  /** Compact variants report health through their owning HUD instead of the full boss banner. */
  showHealthUi?: boolean;
  /** Preserves the Options particle toggle while retaining reduced core telegraphs. */
  particlesEnabled?: boolean;
}

export interface BossProjectileSpec {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  color: number;
  size?: number;
  attack: BossAttackKind;
}

export type BossAttackKind =
  | 'artillery-basic'
  | 'artillery-rocket'
  | 'artillery-strike'
  | 'artillery-super'
  | 'storm-basic'
  | 'storm-super'
  | 'brawler-contact'
  | 'brawler-pounce'
  | 'brawler-super';

export interface BossEncounterCallbacks {
  fireProjectile(spec: BossProjectileSpec): void;
  damageArea(x: number, y: number, radius: number, damage: number, attack: BossAttackKind): void;
  dropCredit(x: number, y: number): void;
  onDamaged(damage: number, source: BossDamageSource): void;
  onAttackCast(attack: BossAttackKind): void;
  onDefeated(): void;
}

interface PendingStrike {
  x: number;
  y: number;
  radius: number;
  damage: number;
  triggerAt: number;
  startedAt: number;
  marker: Phaser.GameObjects.Container;
  targetRing: Phaser.GameObjects.Arc;
  timingRing: Phaser.GameObjects.Arc;
  reticle: Phaser.GameObjects.Graphics;
  payload: Phaser.GameObjects.Image;
  color: number;
  attack: BossAttackKind;
}

const BOSS_TITLE_Y = 250;
const BOSS_HEALTH_Y = 280;
const BOSS_CALLOUT_Y = 318;

export class BossEncounter {
  readonly boss: Boss;
  readonly archetype: BossArchetype;
  private readonly random: SeededRandom;
  private readonly damageMultiplier: number;
  private readonly effects = new Set<Phaser.GameObjects.GameObject>();
  private readonly pendingStrikes: PendingStrike[] = [];
  private readonly vfx: BossCombatVfx;
  private readonly healthTrack: Phaser.GameObjects.Rectangle;
  private readonly healthFill: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly healthText: Phaser.GameObjects.Text;
  private readonly callout: Phaser.GameObjects.Text;
  private elapsedMs = 0;
  private lastBasicAt = -99_999;
  private lastSuperAt = 0;
  private lastContactAt = -99_999;
  private lastPounceAt = -99_999;
  private lastTeleportAt = 0;
  private lastRocketAt = -99_999;
  private mageChargeStartsAt = 0;
  private mageChargeEndsAt = 0;
  private mageChargeAim = 0;
  private mageSuperVolleyAt = 0;
  private pounceStartsAt = 0;
  private pounceEndsAt = 0;
  private pounceAngle = 0;
  private pounceLaunchPlayed = false;
  private lastPounceTrailAt = -99_999;
  private creditDamage = 0;
  private calloutUntil = 0;
  private combatActive = true;

  constructor(
    private readonly scene: Phaser.Scene,
    completedRound: number,
    seed: number,
    archetype: BossArchetype,
    spawn: { x: number; y: number },
    private readonly bounds: RectSpec,
    private readonly isBlocked: (x: number, y: number) => boolean,
    private readonly callbacks: BossEncounterCallbacks,
    modeFamily: RunModeFamily,
    options: BossEncounterOptions = {}
  ) {
    this.archetype = archetype;
    this.random = new SeededRandom((seed ^ Math.imul(completedRound, 0x9e3779b1) ^ 0xb055cafe) >>> 0);
    this.damageMultiplier = getBossDamageMultiplier(completedRound, modeFamily);
    this.vfx = new BossCombatVfx(scene, options.particlesEnabled ?? true);
    this.boss = new Boss(
      scene,
      spawn.x,
      spawn.y,
      archetype,
      completedRound,
      (damage, source) => this.handleBossDamage(damage, source),
      () => callbacks.onDefeated(),
      modeFamily,
      { healthMultiplier: options.healthMultiplier }
    );

    const width = Math.min(900, scene.scale.width - 80);
    this.healthTrack = scene.add.rectangle(scene.scale.width * 0.5, BOSS_HEALTH_Y, width, 24, 0x120b16, 0.94)
      .setStrokeStyle(3, BOSS_ARCHETYPES[archetype].color, 0.95).setScrollFactor(0).setDepth(1120);
    this.healthFill = scene.add.rectangle(scene.scale.width * 0.5 - width * 0.5 + 4, BOSS_HEALTH_Y, width - 8, 16, BOSS_ARCHETYPES[archetype].color, 0.95)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(1121);
    this.title = scene.add.text(scene.scale.width * 0.5, BOSS_TITLE_Y, `${BOSS_ARCHETYPES[archetype].label}  •  ${BOSS_ARCHETYPES[archetype].subtitle}`, {
      fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#ffffff', stroke: '#050812', strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1122);
    this.healthText = scene.add.text(scene.scale.width * 0.5, BOSS_HEALTH_Y, '', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#ffffff', stroke: '#050812', strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1122);
    this.callout = scene.add.text(scene.scale.width * 0.5, BOSS_CALLOUT_Y, '', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '20px', color: '#ffd87a', stroke: '#050812', strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1122);
    if (options.showHealthUi === false) {
      this.healthTrack.setVisible(false);
      this.healthFill.setVisible(false);
      this.title.setVisible(false);
      this.healthText.setVisible(false);
      this.callout.setVisible(false);
    }
    this.refreshHealthBar();
  }

  update(deltaMs: number, player: Player): void {
    if (!this.combatActive || this.boss.isDefeated) return;
    this.elapsedMs += Math.max(0, deltaMs);
    this.vfx.update(this.elapsedMs);
    this.callout.setAlpha(this.elapsedMs < this.calloutUntil ? 0.75 + Math.sin(this.elapsedMs * 0.018) * 0.2 : 0);

    if (this.archetype === 'artillery') this.updateArtillery(player);
    else if (this.archetype === 'storm-mage') this.updateStormMage(player);
    else this.updateVoidBrawler(player);
    this.updatePendingStrikes(player);
    const aim = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, player.x, player.y);
    const mageCharge = this.archetype === 'storm-mage' && this.mageChargeEndsAt > this.elapsedMs
      ? Phaser.Math.Clamp((this.elapsedMs - this.mageChargeStartsAt) / Math.max(1, this.mageChargeEndsAt - this.mageChargeStartsAt), 0, 1)
      : 0;
    const brawlerCharge = this.archetype === 'void-brawler' && this.pounceStartsAt > this.elapsedMs
      ? Phaser.Math.Clamp(1 - (this.pounceStartsAt - this.elapsedMs) / BOSS_BALANCE.voidBrawler.pounceTelegraphMs, 0, 1)
      : 0;
    const charge = Math.max(mageCharge, brawlerCharge);
    this.boss.updatePresentation(this.elapsedMs, aim, charge);
    this.refreshHealthBar();
  }

  resize(width: number): void {
    const barWidth = Math.min(900, width - 80);
    this.healthTrack.setPosition(width * 0.5, BOSS_HEALTH_Y).setDisplaySize(barWidth, 24);
    this.healthFill.setPosition(width * 0.5 - barWidth * 0.5 + 4, BOSS_HEALTH_Y).setDisplaySize((barWidth - 8) * this.boss.healthRatio, 16);
    this.title.setX(width * 0.5);
    this.healthText.setX(width * 0.5);
    this.callout.setX(width * 0.5);
  }

  destroy(): void {
    this.boss.destroy();
    this.healthTrack.destroy();
    this.healthFill.destroy();
    this.title.destroy();
    this.healthText.destroy();
    this.callout.destroy();
    for (const strike of this.pendingStrikes) strike.marker.destroy(true);
    this.pendingStrikes.length = 0;
    for (const effect of this.effects) {
      this.scene.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.effects.clear();
    this.vfx.destroy();
  }

  cancelCombat(): void {
    if (!this.combatActive) return;
    this.combatActive = false;
    this.boss.setVelocity(0, 0);
    for (const strike of this.pendingStrikes) strike.marker.destroy(true);
    this.pendingStrikes.length = 0;
    this.mageChargeEndsAt = 0;
    this.mageSuperVolleyAt = 0;
    this.pounceStartsAt = 0;
    this.pounceEndsAt = 0;
    for (const effect of this.effects) {
      this.scene.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.effects.clear();
    this.vfx.reset();
    this.callout.setAlpha(0);
    this.healthTrack.setVisible(false);
    this.healthFill.setVisible(false);
    this.healthText.setVisible(false);
    this.title.setVisible(false);
  }

  setPresentationVisible(visible: boolean): void {
    this.boss.setVisible(visible).setActive(visible);
    this.healthTrack.setVisible(visible);
    this.healthFill.setVisible(visible);
    this.healthText.setVisible(visible);
    this.title.setVisible(visible);
    if (!visible) this.callout.setVisible(false);
    else this.callout.setVisible(true);
  }

  /** Plays an encounter arrival without affecting the boss's active state. */
  playEntrance(): void {
    this.vfx.emitArrival(
      this.archetype,
      this.boss.x,
      this.boss.y,
      BOSS_ARCHETYPES[this.archetype].color,
      this.elapsedMs
    );
  }

  /** Boss-themed reinforcement portal/drop effect used by controlled support waves. */
  playSupportEntrance(x: number, y: number): void {
    this.vfx.emitArrival(this.archetype, x, y, BOSS_ARCHETYPES[this.archetype].color, this.elapsedMs, true);
  }

  private updateArtillery(player: Player): void {
    const config = BOSS_BALANCE.artillery;
    const aim = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, player.x, player.y);
    const desiredX = player.x + Math.cos(this.elapsedMs * 0.00032) * 360;
    const desiredY = player.y + Math.sin(this.elapsedMs * 0.00027) * 260;
    let moveX = desiredX - this.boss.x;
    let moveY = desiredY - this.boss.y;
    const moveDistanceSquared = moveX * moveX + moveY * moveY;
    if (moveDistanceSquared > 64) {
      const scale = config.movementSpeed / Math.sqrt(moveDistanceSquared);
      moveX *= scale;
      moveY *= scale;
      if (this.isBlocked(this.boss.x + moveX * 0.3, this.boss.y + moveY * 0.3)) {
        const temporary = moveX;
        moveX = -moveY * 0.72;
        moveY = temporary * 0.72;
      }
    }
    this.boss.setVelocity(moveX, moveY).setRotation(aim);
    if (this.elapsedMs - this.lastBasicAt >= config.basicCooldownMs) {
      this.lastBasicAt = this.elapsedMs;
      this.callbacks.onAttackCast('artillery-basic');
      const center = (config.rapidBurstCount - 1) * 0.5;
      for (let index = 0; index < config.rapidBurstCount; index += 1) {
        this.fire(aim + (index - center) * config.spreadRadians, config.projectileSpeed, config.projectileDamage, BOSS_ARCHETYPES.artillery.color, 9, 'artillery-basic');
      }
      this.spawnMuzzleEffect(aim, BOSS_ARCHETYPES.artillery.color);
    }
    if (this.elapsedMs - this.lastRocketAt >= config.rocketCooldownMs) {
      this.lastRocketAt = this.elapsedMs;
      this.callbacks.onAttackCast('artillery-rocket');
      this.showCallout('ROCKET LOCK // EVADE', 720);
      const center = (config.rocketCount - 1) * 0.5;
      for (let index = 0; index < config.rocketCount; index += 1) {
        this.fire(aim + (index - center) * 0.17, config.rocketSpeed, config.rocketDamage, 0xffbc62, 17, 'artillery-rocket');
      }
      this.vfx.emit(
        'muzzle-heavy',
        this.boss.x + Math.cos(aim) * 54,
        this.boss.y + Math.sin(aim) * 54,
        62,
        0xffbc62,
        this.elapsedMs,
        240,
        aim
      );
    }
    if (this.elapsedMs - this.lastSuperAt >= config.superCooldownMs) {
      this.lastSuperAt = this.elapsedMs;
      this.callbacks.onAttackCast('artillery-super');
      this.showCallout('SUPER: ORBITAL SIEGE', config.superTelegraphMs);
      for (let index = 0; index < config.superStrikeCount; index += 1) {
        const angle = index / config.superStrikeCount * Math.PI * 2 + this.elapsedMs * 0.0004;
        const distance = index === 0 ? 0 : 105 + index * 18;
        this.scheduleStrike(
          player.x + Math.cos(angle) * distance,
          player.y + Math.sin(angle) * distance,
          config.superRadius,
          config.superDamage * this.damageMultiplier,
          config.superTelegraphMs + index * 110,
          0xffc96a,
          'artillery-strike'
        );
      }
    }
  }

  private updateStormMage(player: Player): void {
    const config = BOSS_BALANCE.stormMage;
    let directionX = player.x + Math.cos(this.elapsedMs * 0.00055) * 260 - this.boss.x;
    let directionY = player.y + Math.sin(this.elapsedMs * 0.0007) * 210 - this.boss.y;
    const distanceSquared = directionX * directionX + directionY * directionY;
    if (distanceSquared > 25) {
      const scale = config.movementSpeed / Math.sqrt(distanceSquared);
      directionX *= scale;
      directionY *= scale;
    }
    this.boss.setVelocity(directionX, directionY).setRotation(-this.elapsedMs * 0.0006);

    if (this.mageChargeEndsAt > 0 && this.elapsedMs >= this.mageChargeEndsAt) {
      this.callbacks.onAttackCast('storm-basic');
      this.fire(this.mageChargeAim, config.projectileSpeed, config.projectileDamage, BOSS_ARCHETYPES['storm-mage'].color, 12, 'storm-basic');
      this.spawnMuzzleEffect(this.mageChargeAim, BOSS_ARCHETYPES['storm-mage'].color);
      this.mageChargeEndsAt = 0;
    } else if (this.mageChargeEndsAt <= 0 && this.elapsedMs - this.lastBasicAt >= config.basicCooldownMs) {
      this.lastBasicAt = this.elapsedMs;
      this.mageChargeStartsAt = this.elapsedMs;
      this.mageChargeEndsAt = this.elapsedMs + config.chargeMs;
      this.mageChargeAim = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, player.x, player.y);
      this.showCallout('ARC CHARGE', config.chargeMs);
      this.vfx.emit(
        'mage-cast', this.boss.x, this.boss.y, 92, BOSS_ARCHETYPES['storm-mage'].color,
        this.elapsedMs, config.chargeMs, this.mageChargeAim
      );
    }
    if (this.mageSuperVolleyAt > 0 && this.elapsedMs >= this.mageSuperVolleyAt) {
      this.callbacks.onAttackCast('storm-super');
      const aim = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, player.x, player.y);
      const center = (config.superProjectileCount - 1) * 0.5;
      for (let index = 0; index < config.superProjectileCount; index += 1) {
        this.fire(aim + (index - center) * 0.105, config.superProjectileSpeed, config.superProjectileDamage, 0xb980ff, 10, 'storm-super');
      }
      this.vfx.emit('mage-volley', this.boss.x, this.boss.y, 128, 0xb980ff, this.elapsedMs, 620, aim);
      this.mageSuperVolleyAt = 0;
    } else if (this.mageSuperVolleyAt <= 0 && this.elapsedMs - this.lastSuperAt >= config.superCooldownMs) {
      this.lastSuperAt = this.elapsedMs;
      this.showCallout('SUPER: PRISMATIC TEMPEST', config.superTelegraphMs);
      this.mageSuperVolleyAt = this.elapsedMs + config.superTelegraphMs;
      this.vfx.emit(
        'mage-cast', this.boss.x, this.boss.y, 132, 0xb980ff,
        this.elapsedMs, config.superTelegraphMs
      );
    }
  }

  private updateVoidBrawler(player: Player): void {
    const config = BOSS_BALANCE.voidBrawler;
    if (this.elapsedMs - this.lastSuperAt >= config.superCooldownMs) {
      this.lastSuperAt = this.elapsedMs;
      this.callbacks.onAttackCast('brawler-super');
      this.showCallout('SUPER: VOID AMBUSH', config.superTelegraphMs);
      this.vfx.emit(
        'brawler-depart', this.boss.x, this.boss.y, 92, 0xff4e82,
        this.elapsedMs, Math.min(460, config.superTelegraphMs * 0.5)
      );
      this.boss.setAlpha(0.12).setVelocity(0, 0);
      const target = this.findClearNear(player.x, player.y, 80, 150);
      this.scheduleStrike(target.x, target.y, config.superRadius, config.superDamage * this.damageMultiplier, config.superTelegraphMs, 0xff4e82, 'brawler-super');
      this.lastTeleportAt = this.elapsedMs;
    }

    if (this.boss.alpha < 0.5) {
      const ambush = this.pendingStrikes.find((strike) => strike.color === 0xff4e82);
      if (ambush && this.elapsedMs >= ambush.triggerAt - 40) {
        this.vfx.emit('brawler-depart', this.boss.x, this.boss.y, 78, 0xff4e82, this.elapsedMs, 320);
        this.boss.setPosition(ambush.x, ambush.y).setAlpha(1);
        this.vfx.emit('brawler-arrive', this.boss.x, this.boss.y, 96, 0xffffff, this.elapsedMs, 470);
      } else {
        return;
      }
    }

    if (this.elapsedMs - this.lastTeleportAt >= config.teleportCooldownMs) {
      this.lastTeleportAt = this.elapsedMs;
      this.vfx.emit('brawler-depart', this.boss.x, this.boss.y, 76, 0xff4e82, this.elapsedMs, 300);
      const target = this.findClearNear(player.x, player.y, 150, 270);
      this.boss.setPosition(target.x, target.y);
      this.vfx.emit('brawler-arrive', target.x, target.y, 88, 0xffffff, this.elapsedMs, 420);
    }

    if (this.pounceStartsAt > 0 && this.elapsedMs >= this.pounceStartsAt && this.elapsedMs < this.pounceEndsAt) {
      if (!this.pounceLaunchPlayed) {
        this.pounceLaunchPlayed = true;
        this.lastPounceTrailAt = this.elapsedMs;
        this.vfx.emit(
          'brawler-launch', this.boss.x, this.boss.y, 125, 0xff4e82,
          this.elapsedMs, 460, this.pounceAngle
        );
      } else if (this.elapsedMs - this.lastPounceTrailAt >= 70) {
        this.lastPounceTrailAt = this.elapsedMs;
        this.vfx.emit(
          'brawler-trail', this.boss.x, this.boss.y, 72, 0xff4e82,
          this.elapsedMs, 260, this.pounceAngle
        );
      }
      this.boss.setVelocity(Math.cos(this.pounceAngle) * config.pounceSpeed, Math.sin(this.pounceAngle) * config.pounceSpeed);
    } else if (this.pounceStartsAt > 0 && this.elapsedMs >= this.pounceEndsAt) {
      this.vfx.emit('brawler-impact', this.boss.x, this.boss.y, 92, 0xff4e82, this.elapsedMs, 620, this.pounceAngle);
      this.pounceStartsAt = 0;
      this.pounceEndsAt = 0;
    } else if (this.elapsedMs - this.lastPounceAt >= config.pounceCooldownMs) {
      this.lastPounceAt = this.elapsedMs;
      this.callbacks.onAttackCast('brawler-pounce');
      this.pounceStartsAt = this.elapsedMs + config.pounceTelegraphMs;
      this.pounceEndsAt = this.pounceStartsAt + config.pounceDurationMs;
      this.pounceAngle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, player.x, player.y);
      this.pounceLaunchPlayed = false;
      this.showCallout('POUNCE LOCKED', config.pounceTelegraphMs);
      this.spawnPounceTelegraph(this.pounceAngle, config.pounceTelegraphMs);
      this.vfx.emit(
        'brawler-windup', this.boss.x, this.boss.y, 78, 0xff4e82,
        this.elapsedMs, config.pounceTelegraphMs, this.pounceAngle
      );
      this.boss.setVelocity(0, 0);
    } else {
      let directionX = player.x - this.boss.x;
      let directionY = player.y - this.boss.y;
      const distanceSquared = directionX * directionX + directionY * directionY;
      if (distanceSquared > 1) {
        const scale = config.movementSpeed / Math.sqrt(distanceSquared);
        directionX *= scale;
        directionY *= scale;
      }
      this.boss.setVelocity(directionX, directionY).setRotation(Phaser.Math.Angle.Between(this.boss.x, this.boss.y, player.x, player.y));
    }

    if (Phaser.Math.Distance.Between(this.boss.x, this.boss.y, player.x, player.y) <= this.boss.hazardRadius + 14
      && this.elapsedMs - this.lastContactAt >= config.contactCooldownMs) {
      this.lastContactAt = this.elapsedMs;
      const pouncing = this.pounceStartsAt > 0 && this.elapsedMs >= this.pounceStartsAt && this.elapsedMs < this.pounceEndsAt;
      if (!pouncing) this.callbacks.onAttackCast('brawler-contact');
      this.callbacks.damageArea(this.boss.x, this.boss.y, this.boss.hazardRadius + 18, config.contactDamage * this.damageMultiplier, pouncing ? 'brawler-pounce' : 'brawler-contact');
      this.vfx.emit(
        'brawler-impact', this.boss.x, this.boss.y, pouncing ? 84 : 58, 0xff4e82,
        this.elapsedMs, pouncing ? 560 : 380, this.pounceAngle
      );
    }
  }

  private fire(angle: number, speed: number, damage: number, color: number, size: number, attack: BossAttackKind): void {
    if (!this.combatActive || this.boss.isDefeated) return;
    this.callbacks.fireProjectile({
      x: this.boss.x + Math.cos(angle) * 42,
      y: this.boss.y + Math.sin(angle) * 42,
      angle,
      speed,
      damage: damage * this.damageMultiplier,
      color,
      size,
      attack
    });
  }

  private scheduleStrike(x: number, y: number, radius: number, damage: number, delayMs: number, color: number, attack: BossAttackKind): void {
    if (!this.combatActive || this.boss.isDefeated) return;
    const target = this.clampPoint(x, y);
    const targetRing = this.scene.add.circle(0, 0, radius, color, 0.055)
      .setStrokeStyle(3, color, 0.94)
      .setBlendMode(Phaser.BlendModes.ADD);
    const timingRing = this.scene.add.circle(0, 0, radius * 0.72, 0x000000, 0)
      .setStrokeStyle(2, 0xffffff, 0.82)
      .setBlendMode(Phaser.BlendModes.ADD);
    const reticle = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    reticle.lineStyle(2, color, 0.78);
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI / 6;
      const inner = radius * (index % 3 === 0 ? 0.7 : 0.82);
      const outer = radius * (index % 3 === 0 ? 1.18 : 1.04);
      reticle.lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer);
    }
    reticle.lineStyle(1, 0xffffff, 0.56)
      .lineBetween(-radius * 0.34, 0, radius * 0.34, 0)
      .lineBetween(0, -radius * 0.34, 0, radius * 0.34);
    const payload = this.scene.add.image(0, -270, 'projectile-missile')
      .setDisplaySize(34, 17)
      .setTint(attack === 'artillery-strike' ? 0xffd070 : color)
      .setRotation(Math.PI * 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(attack === 'artillery-strike');
    const marker = this.scene.add.container(target.x, target.y, [targetRing, timingRing, reticle, payload]).setDepth(7);
    this.pendingStrikes.push({
      ...target,
      radius,
      damage,
      startedAt: this.elapsedMs,
      triggerAt: this.elapsedMs + delayMs,
      marker,
      targetRing,
      timingRing,
      reticle,
      payload,
      color,
      attack
    });
  }

  private updatePendingStrikes(_player: Player): void {
    for (let index = this.pendingStrikes.length - 1; index >= 0; index -= 1) {
      const strike = this.pendingStrikes[index];
      const remaining = Math.max(0, strike.triggerAt - this.elapsedMs);
      const duration = Math.max(1, strike.triggerAt - strike.startedAt);
      const progress = Phaser.Math.Clamp(1 - remaining / duration, 0, 1);
      const urgency = 0.5 + Math.sin(this.elapsedMs * (0.018 + progress * 0.025) + index) * 0.5;
      strike.targetRing
        .setFillStyle(strike.color, 0.035 + progress * 0.09)
        .setStrokeStyle(3 + progress * 2, strike.color, 0.62 + progress * 0.34)
        .setScale(1 + urgency * 0.025);
      strike.timingRing
        .setScale(1.5 - progress * 0.82)
        .setStrokeStyle(2 + progress * 2, progress > 0.78 ? 0xffffff : strike.color, 0.54 + progress * 0.42);
      strike.reticle.setRotation(this.elapsedMs * (0.0008 + progress * 0.0018));
      if (strike.payload.visible) {
        const descent = progress * progress * progress;
        strike.payload.setY(-270 * (1 - descent)).setScale(0.7 + descent * 0.5).setAlpha(0.36 + progress * 0.64);
      }
      if (this.elapsedMs < strike.triggerAt) continue;
      this.callbacks.damageArea(strike.x, strike.y, strike.radius, strike.damage, strike.attack);
      this.spawnStrikeEffect(strike.x, strike.y, strike.radius, strike.color);
      strike.marker.destroy(true);
      this.pendingStrikes.splice(index, 1);
    }
  }

  private spawnStrikeEffect(x: number, y: number, radius: number, color: number): void {
    this.vfx.emit(
      color === 0xff4e82 ? 'brawler-impact' : 'artillery-impact',
      x,
      y,
      radius,
      color,
      this.elapsedMs,
      color === 0xff4e82 ? 650 : 720
    );
  }

  private spawnMuzzleEffect(angle: number, color: number): void {
    const x = this.boss.x + Math.cos(angle) * 55;
    const y = this.boss.y + Math.sin(angle) * 55;
    this.vfx.emit(
      this.archetype === 'artillery' ? 'muzzle-light' : 'mage-volley',
      x,
      y,
      this.archetype === 'artillery' ? 42 : 56,
      color,
      this.elapsedMs,
      this.archetype === 'artillery' ? 170 : 340,
      angle
    );
  }

  private spawnPounceTelegraph(angle: number, durationMs: number): void {
    const length = 390;
    const line = this.scene.add.rectangle(
      this.boss.x + Math.cos(angle) * length * 0.5,
      this.boss.y + Math.sin(angle) * length * 0.5,
      length,
      18,
      0xff4e82,
      0.12
    ).setOrigin(0.5).setRotation(angle).setStrokeStyle(2, 0xff85a8, 0.76).setDepth(7);
    this.effects.add(line);
    this.scene.tweens.add({
      targets: line,
      alpha: { from: 0.1, to: 0.42 },
      scaleY: { from: 0.5, to: 1.1 },
      duration: Math.max(120, durationMs * 0.42),
      yoyo: true,
      onComplete: () => { this.effects.delete(line); line.destroy(); }
    });
  }

  private handleBossDamage(damage: number, source: BossDamageSource): void {
    this.callbacks.onDamaged(damage, source);
    this.creditDamage += damage;
    const threshold = this.boss.maxHp / BOSS_BALANCE.creditDropChunks;
    while (this.creditDamage >= threshold) {
      this.creditDamage -= threshold;
      for (let count = 0; count < BOSS_BALANCE.creditDropsPerChunk; count += 1) this.callbacks.dropCredit(this.boss.x, this.boss.y);
    }
    this.refreshHealthBar();
  }

  private refreshHealthBar(): void {
    const width = Math.max(1, this.healthTrack.displayWidth - 8);
    this.healthFill.displayWidth = width * this.boss.healthRatio;
    this.healthText.setText(`${Math.ceil(this.boss.hp).toLocaleString()} / ${this.boss.maxHp.toLocaleString()}`);
  }

  private showCallout(text: string, durationMs: number): void {
    this.callout.setText(text).setAlpha(1);
    this.calloutUntil = this.elapsedMs + durationMs;
  }

  private findClearNear(x: number, y: number, minimumDistance: number, maximumDistance: number): { x: number; y: number } {
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const angle = this.random.float(0, Math.PI * 2);
      const distance = this.random.float(minimumDistance, maximumDistance);
      const point = this.clampPoint(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance);
      if (!this.isBlocked(point.x, point.y)) return point;
    }
    return this.clampPoint(x + minimumDistance, y);
  }

  private clampPoint(x: number, y: number): { x: number; y: number } {
    const inset = 70;
    return {
      x: Phaser.Math.Clamp(x, this.bounds.x + inset, this.bounds.x + this.bounds.w - inset),
      y: Phaser.Math.Clamp(y, this.bounds.y + inset, this.bounds.y + this.bounds.h - inset)
    };
  }
}
