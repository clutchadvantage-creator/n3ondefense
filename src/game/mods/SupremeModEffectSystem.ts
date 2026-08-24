import Phaser from 'phaser';
import type { Enemy } from '../enemies/Enemy.ts';
import type { Player } from '../entities/Player.ts';
import type { BombSiteRuntime } from '../types.ts';
import type { ModRuntime } from './ModRuntime.ts';

export interface SupremeModEffectCallbacks {
  playPulseCue(): void;
}

/**
 * Bounded controller for Supreme mechanics that cannot be expressed as a stat
 * modifier. It performs one staggered enemy pass, owns no per-enemy timers,
 * and destroys all temporary presentation on scene shutdown.
 */
export class SupremeModEffectSystem {
  private readonly nextPulseBySite = new Map<string, number>();
  private readonly activeSiteIds = new Set<string>();
  private readonly effects = new Set<Phaser.GameObjects.GameObject>();
  private readonly suppressionConfig: ReturnType<ModRuntime['supremeSuppressionField']>;
  private readonly bombsitePulseConfig: ReturnType<ModRuntime['supremeBombsitePulse']>;
  private field: Phaser.GameObjects.Container | null = null;
  private nextSuppressionScanAt = 0;
  private lastPickupSurgeVfxAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly scene: Phaser.Scene,
    runtime: ModRuntime,
    private readonly callbacks: SupremeModEffectCallbacks
  ) {
    // The equipped runtime cannot change during an encounter. Resolve these
    // immutable configurations once instead of allocating objects every frame.
    this.suppressionConfig = runtime.supremeSuppressionField();
    this.bombsitePulseConfig = runtime.supremeBombsitePulse();
  }

  update(now: number, enemies: readonly Enemy[], sites: readonly BombSiteRuntime[], player: Player): void {
    this.updateSuppression(now, enemies, player);
    this.updateBombsitePulses(now, enemies, sites, player);
  }

  /** Shared, rate-limited presentation hook for Crown of Stars pickup surges. */
  showPickupSurge(now: number, x: number, y: number): void {
    if (now - this.lastPickupSurgeVfxAt < 120) return;
    this.lastPickupSurgeVfxAt = now;
    const ring = this.scene.add.circle(x, y, 12, 0xff67dc, 0.12)
      .setStrokeStyle(3, 0xf5ffff, 0.92).setBlendMode(Phaser.BlendModes.ADD).setDepth(14);
    const star = this.scene.add.star(x, y, 8, 7, 15, 0xeaffff, 0.82)
      .setStrokeStyle(2, 0xff72df, 0.88).setBlendMode(Phaser.BlendModes.ADD).setDepth(14);
    this.effects.add(ring);
    this.effects.add(star);
    this.scene.tweens.add({
      targets: ring,
      radius: 58,
      alpha: 0,
      duration: 430,
      ease: 'Cubic.Out',
      onComplete: () => { this.effects.delete(ring); ring.destroy(); }
    });
    this.scene.tweens.add({
      targets: star,
      scale: 1.9,
      rotation: 0.5,
      alpha: 0,
      duration: 520,
      ease: 'Quad.Out',
      onComplete: () => { this.effects.delete(star); star.destroy(); }
    });
  }

  destroy(): void {
    this.nextPulseBySite.clear();
    this.activeSiteIds.clear();
    this.lastPickupSurgeVfxAt = Number.NEGATIVE_INFINITY;
    this.field?.destroy();
    this.field = null;
    for (const effect of this.effects) {
      this.scene.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.effects.clear();
  }

  private updateSuppression(now: number, enemies: readonly Enemy[], player: Player): void {
    const config = this.suppressionConfig;
    if (!config) {
      this.field?.setVisible(false);
      return;
    }
    if (!this.field) {
      this.field = this.scene.add.container(player.x, player.y).setDepth(5);
      const outer = this.scene.add.circle(0, 0, config.radius, 0x6e52ff, 0.018)
        .setStrokeStyle(2, 0x70efff, 0.32);
      const inner = this.scene.add.circle(0, 0, config.radius * 0.78, 0x000000, 0)
        .setStrokeStyle(1, 0xff6cdd, 0.17);
      const phase = this.scene.add.circle(0, 0, config.radius * 0.93, 0x000000, 0)
        .setStrokeStyle(1, 0xdfffff, 0.1);
      this.field.add([outer, inner, phase]);
      for (let index = 0; index < 12; index += 1) {
        const angle = Phaser.Math.PI2 * index / 12;
        this.field.add(this.scene.add.rectangle(
          Math.cos(angle) * config.radius,
          Math.sin(angle) * config.radius,
          index % 3 === 0 ? 12 : 6,
          2,
          index % 2 === 0 ? 0x71f8ff : 0xff67dc,
          0.42
        ).setRotation(angle));
      }
    }
    this.field.setVisible(true).setPosition(player.x, player.y)
      .setRotation(now * 0.00012)
      .setAlpha(0.68 + Math.sin(now * 0.003) * 0.12);
    if (now < this.nextSuppressionScanAt) return;
    this.nextSuppressionScanAt = now + 120;
    const radiusSquared = config.radius * config.radius;
    for (const enemy of enemies) {
      if (!enemy.active || enemy.isDead()) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      if (dx * dx + dy * dy > radiusSquared) continue;
      enemy.slowFactor = Math.min(enemy.slowFactor, config.slowFactor);
      enemy.slowedUntil = Math.max(enemy.slowedUntil, now + config.refreshMs);
    }
  }

  private updateBombsitePulses(
    now: number,
    enemies: readonly Enemy[],
    sites: readonly BombSiteRuntime[],
    player: Player
  ): void {
    const config = this.bombsitePulseConfig;
    if (!config) {
      this.nextPulseBySite.clear();
      return;
    }
    this.activeSiteIds.clear();
    for (const site of sites) {
      this.activeSiteIds.add(site.id);
      const next = this.nextPulseBySite.get(site.id) ?? now + config.intervalMs;
      if (now < next) {
        this.nextPulseBySite.set(site.id, next);
        continue;
      }
      this.nextPulseBySite.set(site.id, now + config.intervalMs);
      const radiusSquared = config.radius * config.radius;
      const damage = Math.max(1, player.weapon.damage * player.damageMultiplier * config.weaponDamageMultiplier);
      for (const enemy of enemies) {
        if (!enemy.active || enemy.isDead()) continue;
        const dx = enemy.x - site.x;
        const dy = enemy.y - site.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > radiusSquared) continue;
        enemy.takeDamage(damage, 'bombSite');
        const resistance = enemy.stats.type === 'star' ? 0.22 : enemy.stats.type === 'tank' ? 0.38 : enemy.stats.type === 'disruptor' ? 0.65 : 1;
        const inverseDistance = distanceSquared > 1 ? 1 / Math.sqrt(distanceSquared) : 1;
        enemy.setVelocity((distanceSquared > 1 ? dx : 1) * inverseDistance * config.knockbackSpeed * resistance,
          (distanceSquared > 1 ? dy : 0) * inverseDistance * config.knockbackSpeed * resistance);
        enemy.defuseInterruptedUntil = Math.max(enemy.defuseInterruptedUntil, now + config.staggerMs * resistance);
      }
      this.showPulse(site.x, site.y, config.radius);
      this.callbacks.playPulseCue();
    }
    for (const siteId of this.nextPulseBySite.keys()) if (!this.activeSiteIds.has(siteId)) this.nextPulseBySite.delete(siteId);
  }

  private showPulse(x: number, y: number, radius: number): void {
    const ring = this.scene.add.circle(x, y, 18, 0x6ffcff, 0.12).setStrokeStyle(5, 0xf4ffff, 0.95).setDepth(13);
    const echo = this.scene.add.circle(x, y, 10, 0xff5fdb, 0.08).setStrokeStyle(3, 0xff72dc, 0.75).setDepth(13);
    const core = this.scene.add.circle(x, y, 15, 0xffffff, 0.9).setStrokeStyle(5, 0x6ffcff, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(14);
    const arcs = this.scene.add.graphics({ x, y }).setBlendMode(Phaser.BlendModes.ADD).setDepth(13);
    for (let index = 0; index < 8; index += 1) {
      const angle = Phaser.Math.PI2 * index / 8;
      const color = index % 2 === 0 ? 0x6ffcff : 0xff64db;
      arcs.lineStyle(index % 2 === 0 ? 3 : 2, color, 0.88);
      arcs.beginPath();
      arcs.moveTo(Math.cos(angle) * 15, Math.sin(angle) * 15);
      arcs.lineTo(Math.cos(angle + 0.09) * 38, Math.sin(angle + 0.09) * 38);
      arcs.lineTo(Math.cos(angle - 0.05) * 56, Math.sin(angle - 0.05) * 56);
      arcs.strokePath();
    }
    this.effects.add(ring);
    this.effects.add(echo);
    this.effects.add(core);
    this.effects.add(arcs);
    this.scene.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.Out',
      onComplete: () => { this.effects.delete(ring); ring.destroy(); }
    });
    this.scene.tweens.add({
      targets: echo,
      radius: radius * 0.72,
      alpha: 0,
      duration: 680,
      delay: 70,
      ease: 'Quad.Out',
      onComplete: () => { this.effects.delete(echo); echo.destroy(); }
    });
    this.scene.tweens.add({
      targets: core,
      scale: 2.2,
      alpha: 0,
      duration: 260,
      ease: 'Quad.Out',
      onComplete: () => { this.effects.delete(core); core.destroy(); }
    });
    this.scene.tweens.add({
      targets: arcs,
      scale: Math.max(1.5, radius / 72),
      rotation: 0.28,
      alpha: 0,
      duration: 610,
      ease: 'Cubic.Out',
      onComplete: () => { this.effects.delete(arcs); arcs.destroy(); }
    });
  }
}
