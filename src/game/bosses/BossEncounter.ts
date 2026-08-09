import Phaser from 'phaser';
import { BOSS_ARCHETYPES, BOSS_BALANCE, getBossDamageMultiplier, type BossArchetype } from '../config/bossBalance';
import type { RectSpec } from '../types';
import type { Player } from '../entities/Player';
import { SeededRandom } from '../systems/SeededRandom';
import { Boss, type BossDamageSource } from './Boss';

export interface BossProjectileSpec {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  color: number;
  size?: number;
}

export interface BossEncounterCallbacks {
  fireProjectile(spec: BossProjectileSpec): void;
  damageArea(x: number, y: number, radius: number, damage: number): void;
  dropCredit(x: number, y: number): void;
  onDefeated(): void;
}

interface PendingStrike {
  x: number;
  y: number;
  radius: number;
  damage: number;
  triggerAt: number;
  marker: Phaser.GameObjects.Arc;
  color: number;
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
  private pounceStartsAt = 0;
  private pounceEndsAt = 0;
  private pounceAngle = 0;
  private creditDamage = 0;
  private calloutUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    completedRound: number,
    seed: number,
    archetype: BossArchetype,
    spawn: { x: number; y: number },
    private readonly bounds: RectSpec,
    private readonly isBlocked: (x: number, y: number) => boolean,
    private readonly callbacks: BossEncounterCallbacks
  ) {
    this.archetype = archetype;
    this.random = new SeededRandom((seed ^ Math.imul(completedRound, 0x9e3779b1) ^ 0xb055cafe) >>> 0);
    this.damageMultiplier = getBossDamageMultiplier(completedRound);
    this.boss = new Boss(
      scene,
      spawn.x,
      spawn.y,
      archetype,
      completedRound,
      (damage, source) => this.handleBossDamage(damage, source),
      () => callbacks.onDefeated()
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
    this.refreshHealthBar();
  }

  update(deltaMs: number, player: Player): void {
    if (this.boss.isDefeated) return;
    this.elapsedMs += Math.max(0, deltaMs);
    this.callout.setAlpha(this.elapsedMs < this.calloutUntil ? 0.75 + Math.sin(this.elapsedMs * 0.018) * 0.2 : 0);

    if (this.archetype === 'artillery') this.updateArtillery(player);
    else if (this.archetype === 'storm-mage') this.updateStormMage(player);
    else this.updateVoidBrawler(player);
    this.updatePendingStrikes(player);
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
    for (const strike of this.pendingStrikes) strike.marker.destroy();
    this.pendingStrikes.length = 0;
    for (const effect of this.effects) effect.destroy();
    this.effects.clear();
  }

  private updateArtillery(player: Player): void {
    const config = BOSS_BALANCE.artillery;
    this.boss.setVelocity(0, 0).setRotation(this.elapsedMs * 0.00035);
    if (this.elapsedMs - this.lastBasicAt >= config.basicCooldownMs) {
      this.lastBasicAt = this.elapsedMs;
      const aim = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, player.x, player.y);
      for (const offset of [-config.spreadRadians, 0, config.spreadRadians]) {
        this.fire(aim + offset, config.projectileSpeed, config.projectileDamage, BOSS_ARCHETYPES.artillery.color, 11);
      }
    }
    if (this.elapsedMs - this.lastSuperAt >= config.superCooldownMs) {
      this.lastSuperAt = this.elapsedMs;
      this.showCallout('SUPER: SIEGE NOVA', 1500);
      for (let i = 0; i < config.superProjectileCount; i += 1) {
        const angle = i / config.superProjectileCount * Math.PI * 2 + this.elapsedMs * 0.0002;
        this.fire(angle, config.superProjectileSpeed, config.superProjectileDamage, 0xffd36a, 9);
      }
    }
  }

  private updateStormMage(player: Player): void {
    const config = BOSS_BALANCE.stormMage;
    const desired = new Phaser.Math.Vector2(
      player.x + Math.cos(this.elapsedMs * 0.00055) * 260,
      player.y + Math.sin(this.elapsedMs * 0.0007) * 210
    );
    const direction = desired.subtract(new Phaser.Math.Vector2(this.boss.x, this.boss.y));
    if (direction.lengthSq() > 25) direction.normalize().scale(config.movementSpeed);
    this.boss.setVelocity(direction.x, direction.y).setRotation(-this.elapsedMs * 0.0006);

    if (this.elapsedMs - this.lastBasicAt >= config.basicCooldownMs) {
      this.lastBasicAt = this.elapsedMs;
      const aim = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, player.x, player.y);
      const center = (config.basicProjectileCount - 1) * 0.5;
      for (let i = 0; i < config.basicProjectileCount; i += 1) {
        this.fire(aim + (i - center) * 0.09, config.projectileSpeed, config.projectileDamage, BOSS_ARCHETYPES['storm-mage'].color, 9);
      }
    }
    if (this.elapsedMs - this.lastSuperAt >= config.superCooldownMs) {
      this.lastSuperAt = this.elapsedMs;
      this.showCallout('SUPER: CROWN OF STORMS', config.superTelegraphMs);
      for (let i = 0; i < config.superStrikeCount; i += 1) {
        const angle = i / config.superStrikeCount * Math.PI * 2;
        const radius = i === 0 ? 0 : 105;
        this.scheduleStrike(
          player.x + Math.cos(angle) * radius,
          player.y + Math.sin(angle) * radius,
          config.superRadius,
          config.superDamage * this.damageMultiplier,
          config.superTelegraphMs + i * 90,
          0xa978ff
        );
      }
    }
  }

  private updateVoidBrawler(player: Player): void {
    const config = BOSS_BALANCE.voidBrawler;
    if (this.elapsedMs - this.lastSuperAt >= config.superCooldownMs) {
      this.lastSuperAt = this.elapsedMs;
      this.showCallout('SUPER: VOID AMBUSH', config.superTelegraphMs);
      this.boss.setAlpha(0.12).setVelocity(0, 0);
      const target = this.findClearNear(player.x, player.y, 80, 150);
      this.scheduleStrike(target.x, target.y, config.superRadius, config.superDamage * this.damageMultiplier, config.superTelegraphMs, 0xff4e82);
      this.lastTeleportAt = this.elapsedMs;
    }

    if (this.boss.alpha < 0.5) {
      const ambush = this.pendingStrikes.find((strike) => strike.color === 0xff4e82);
      if (ambush && this.elapsedMs >= ambush.triggerAt - 40) {
        this.flashAt(this.boss.x, this.boss.y, 0xff4e82);
        this.boss.setPosition(ambush.x, ambush.y).setAlpha(1);
        this.flashAt(this.boss.x, this.boss.y, 0xffffff);
      } else {
        return;
      }
    }

    if (this.elapsedMs - this.lastTeleportAt >= config.teleportCooldownMs) {
      this.lastTeleportAt = this.elapsedMs;
      this.flashAt(this.boss.x, this.boss.y, 0xff4e82);
      const target = this.findClearNear(player.x, player.y, 150, 270);
      this.boss.setPosition(target.x, target.y);
      this.flashAt(target.x, target.y, 0xffffff);
    }

    if (this.pounceStartsAt > 0 && this.elapsedMs >= this.pounceStartsAt && this.elapsedMs < this.pounceEndsAt) {
      this.boss.setVelocity(Math.cos(this.pounceAngle) * config.pounceSpeed, Math.sin(this.pounceAngle) * config.pounceSpeed);
    } else if (this.pounceStartsAt > 0 && this.elapsedMs >= this.pounceEndsAt) {
      this.pounceStartsAt = 0;
      this.pounceEndsAt = 0;
    } else if (this.elapsedMs - this.lastPounceAt >= config.pounceCooldownMs) {
      this.lastPounceAt = this.elapsedMs;
      this.pounceStartsAt = this.elapsedMs + config.pounceTelegraphMs;
      this.pounceEndsAt = this.pounceStartsAt + config.pounceDurationMs;
      this.pounceAngle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, player.x, player.y);
      this.showCallout('POUNCE LOCKED', config.pounceTelegraphMs);
      this.boss.setVelocity(0, 0);
    } else {
      const direction = new Phaser.Math.Vector2(player.x - this.boss.x, player.y - this.boss.y);
      if (direction.lengthSq() > 1) direction.normalize().scale(config.movementSpeed);
      this.boss.setVelocity(direction.x, direction.y).setRotation(Phaser.Math.Angle.Between(this.boss.x, this.boss.y, player.x, player.y));
    }

    if (Phaser.Math.Distance.Between(this.boss.x, this.boss.y, player.x, player.y) <= this.boss.hazardRadius + 14
      && this.elapsedMs - this.lastContactAt >= config.contactCooldownMs) {
      this.lastContactAt = this.elapsedMs;
      this.callbacks.damageArea(this.boss.x, this.boss.y, this.boss.hazardRadius + 18, config.contactDamage * this.damageMultiplier);
    }
  }

  private fire(angle: number, speed: number, damage: number, color: number, size: number): void {
    this.callbacks.fireProjectile({
      x: this.boss.x + Math.cos(angle) * 42,
      y: this.boss.y + Math.sin(angle) * 42,
      angle,
      speed,
      damage: damage * this.damageMultiplier,
      color,
      size
    });
  }

  private scheduleStrike(x: number, y: number, radius: number, damage: number, delayMs: number, color: number): void {
    const target = this.clampPoint(x, y);
    const marker = this.scene.add.circle(target.x, target.y, radius, color, 0.08).setStrokeStyle(3, color, 0.9).setDepth(7);
    this.pendingStrikes.push({ ...target, radius, damage, triggerAt: this.elapsedMs + delayMs, marker, color });
  }

  private updatePendingStrikes(_player: Player): void {
    for (let index = this.pendingStrikes.length - 1; index >= 0; index -= 1) {
      const strike = this.pendingStrikes[index];
      const remaining = Math.max(0, strike.triggerAt - this.elapsedMs);
      strike.marker.setAlpha(0.18 + Math.sin(this.elapsedMs * 0.025 + index) * 0.12).setScale(1 + remaining / 5000);
      if (this.elapsedMs < strike.triggerAt) continue;
      this.callbacks.damageArea(strike.x, strike.y, strike.radius, strike.damage);
      this.spawnStrikeEffect(strike.x, strike.y, strike.radius, strike.color);
      strike.marker.destroy();
      this.pendingStrikes.splice(index, 1);
    }
  }

  private spawnStrikeEffect(x: number, y: number, radius: number, color: number): void {
    const core = this.scene.add.circle(x, y, 8, 0xffffff, 0.9).setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.scene.add.circle(x, y, 12, color, 0.25).setStrokeStyle(4, color, 1).setDepth(11);
    this.effects.add(core);
    this.effects.add(ring);
    this.scene.tweens.add({ targets: core, radius: radius * 0.55, alpha: 0, duration: 260, onComplete: () => { this.effects.delete(core); core.destroy(); } });
    this.scene.tweens.add({ targets: ring, radius, alpha: 0, duration: 420, onComplete: () => { this.effects.delete(ring); ring.destroy(); } });
  }

  private flashAt(x: number, y: number, color: number): void {
    const flash = this.scene.add.circle(x, y, 16, color, 0.5).setDepth(10);
    this.effects.add(flash);
    this.scene.tweens.add({ targets: flash, radius: 70, alpha: 0, duration: 360, onComplete: () => { this.effects.delete(flash); flash.destroy(); } });
  }

  private handleBossDamage(damage: number, _source: BossDamageSource): void {
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
