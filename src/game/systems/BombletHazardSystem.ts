import Phaser from 'phaser';
import { BOMBLET_HAZARD_BALANCE } from '../config/bombletHazards';
import type { Player } from '../entities/Player';
import type { ArenaTheme, RectSpec } from '../types';
import { getScaledHazardDamage, type HazardDamageTarget } from '../config/hazardScaling';
import { SeededRandom } from './SeededRandom';
import { AIR_DROP_PATTERN_NAMES, createAirDropPattern } from './AirDropPatterns';

interface TargetPoint {
  x: number;
  y: number;
  marker: Phaser.GameObjects.Arc;
  bomb: Phaser.GameObjects.Container;
  color: number;
  delayMs: number;
  exploded: boolean;
}

/** Telegraphs deterministic air-dropped bomblet patterns without changing arena navigation. */
export class BombletHazardSystem {
  private readonly random: SeededRandom;
  private readonly warningText: Phaser.GameObjects.Text;
  private readonly effects = new Set<Phaser.GameObjects.GameObject>();
  private targets: TargetPoint[] = [];
  private nextStrikeAt: number;
  private strikeStartedAt = 0;
  private strikeIndex = 0;
  private patternIndex = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly round: number,
    seed: number,
    private readonly theme: ArenaTheme,
    private readonly bounds: RectSpec,
    private readonly isBlocked: (x: number, y: number) => boolean,
    private readonly particlesEnabled: boolean,
    private readonly onPlayerDamaged?: (damage: number) => void,
    private readonly onBombletExploded?: () => void
  ) {
    this.random = new SeededRandom((seed ^ Math.imul(round + 17, 0x9e3779b1) ^ 0xb04b1e7) >>> 0);
    this.nextStrikeAt = scene.time.now + BOMBLET_HAZARD_BALANCE.initialDelayMs + this.random.int(0, 1200);
    this.warningText = scene.add.text(scene.scale.width * 0.5, 220, '', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '17px',
      color: '#ffd27a',
      stroke: '#050812',
      strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1050).setAlpha(0);
  }

  get active(): boolean {
    return this.targets.length > 0;
  }

  update(now: number, player: Player, targets: HazardDamageTarget[], anotherHazardActive: boolean): void {
    const config = BOMBLET_HAZARD_BALANCE;
    if (this.round < config.unlockRound) return;

    if (!this.active) {
      this.warningText.setAlpha(0);
      if (now < this.nextStrikeAt) return;
      if (anotherHazardActive) {
        this.nextStrikeAt = now + 500;
        return;
      }
      this.startStrike(now);
      if (!this.active) {
        this.nextStrikeAt = now + 2000;
        return;
      }
    }

    const elapsed = now - this.strikeStartedAt;
    const patternName = AIR_DROP_PATTERN_NAMES[this.patternIndex];
    if (elapsed < config.telegraphMs) {
      const remaining = (config.telegraphMs - elapsed) / 1000;
      const warning = `BOMBLET DROP: ${patternName}  ${remaining.toFixed(1)}s`;
      if (this.warningText.text !== warning) this.warningText.setText(warning);
      this.warningText.setAlpha(0.62 + Math.sin(now * 0.02) * 0.24);
    } else {
      const warning = `BOMBLETS INBOUND: ${patternName}`;
      if (this.warningText.text !== warning) this.warningText.setText(warning);
      this.warningText.setAlpha(0.78);
    }

    for (const [index, target] of this.targets.entries()) {
      const dropElapsed = elapsed - config.telegraphMs - target.delayMs;
      const fallProgress = Phaser.Math.Clamp(dropElapsed / config.fallMs, 0, 1);
      const pulse = 0.72 + Math.sin(now * 0.024 + index * 0.7) * 0.2;
      target.marker.setScale(pulse).setAlpha(target.exploded ? 0 : 0.28 + fallProgress * 0.55);
      target.bomb
        .setPosition(target.x, target.y - config.fallHeight * (1 - fallProgress))
        .setRotation(now * 0.007 + index)
        .setAlpha(dropElapsed < 0 || target.exploded ? 0 : 0.35 + fallProgress * 0.65);

      if (!target.exploded && dropElapsed >= config.fallMs) this.detonate(target, player, targets);
    }

    const finalDelay = this.targets.at(-1)?.delayMs ?? 0;
    if (elapsed >= config.telegraphMs + config.fallMs + finalDelay + config.blastVisualMs) {
      this.clearTargets();
      this.warningText.setAlpha(0);
      const cooldown = Math.max(config.minimumCooldownMs, config.baseCooldownMs - (this.round - 1) * config.cooldownReductionPerRoundMs);
      this.nextStrikeAt = now + cooldown;
      this.strikeIndex += 1;
    }
  }

  destroy(): void {
    this.clearTargets();
    for (const effect of this.effects) {
      this.scene.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.effects.clear();
    this.warningText.destroy();
  }

  private startStrike(now: number): void {
    const config = BOMBLET_HAZARD_BALANCE;
    this.strikeStartedAt = now;
    this.patternIndex = (this.strikeIndex + this.random.int(0, AIR_DROP_PATTERN_NAMES.length - 1)) % AIR_DROP_PATTERN_NAMES.length;
    const count = Math.min(
      config.maximumBomblets,
      config.minimumBomblets + Math.floor((this.round - config.unlockRound) / config.roundsPerAdditionalBomblet)
    );
    const points = createAirDropPattern({
      pattern: this.patternIndex,
      count,
      bounds: this.bounds,
      safeEdgeInset: config.safeEdgeInset,
      minimumSpacing: 58,
      random: this.random,
      isBlocked: this.isBlocked
    });
    this.targets = points.map((point, index) => {
      const color = [this.theme.accent, this.theme.secondary, 0xffa340, 0xff5e75][index % 4];
      const marker = this.scene.add.circle(point.x, point.y, config.blastRadius, color, 0.08)
        .setStrokeStyle(3, color, 0.82)
        .setDepth(5);
      const horizontalFin = this.scene.add.rectangle(0, 0, 26, 4, color, 0.9);
      const verticalFin = this.scene.add.rectangle(0, 0, 4, 26, color, 0.9);
      const shell = this.scene.add.circle(0, 0, 9, 0x10141c, 1).setStrokeStyle(3, color, 0.98);
      const core = this.scene.add.circle(-2, -2, 2, 0xffffff, 0.8);
      const bomb = this.scene.add.container(point.x, point.y - config.fallHeight, [horizontalFin, verticalFin, shell, core])
        .setDepth(8)
        .setAlpha(0);
      return { ...point, marker, bomb, color, delayMs: index * config.staggerMs, exploded: false };
    });
  }

  private detonate(target: TargetPoint, player: Player, damageTargets: HazardDamageTarget[]): void {
    const config = BOMBLET_HAZARD_BALANCE;
    target.exploded = true;
    this.onBombletExploded?.();
    // Do not force-restart an in-progress shake when staggered bomblets overlap.
    this.scene.cameras.main.shake(config.cameraShakeDurationMs, config.cameraShakeIntensity, false);
    target.marker.setAlpha(0);
    target.bomb.setAlpha(0);
    const color = target.color;
    const blast = this.scene.add.circle(target.x, target.y, 8, color, 0.42).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.scene.add.circle(target.x, target.y, 10, 0xffffff, 0.08).setStrokeStyle(3, color, 0.92).setDepth(8);
    this.effects.add(blast);
    this.effects.add(ring);
    this.scene.tweens.add({
      targets: blast,
      radius: config.blastRadius,
      alpha: 0,
      duration: config.blastVisualMs,
      onComplete: () => { this.effects.delete(blast); blast.destroy(); }
    });
    this.scene.tweens.add({
      targets: ring,
      radius: config.blastRadius * 1.15,
      alpha: 0,
      duration: config.blastVisualMs,
      onComplete: () => { this.effects.delete(ring); ring.destroy(); }
    });
    if (this.particlesEnabled) {
      for (let i = 0; i < 6; i += 1) {
        const spark = this.scene.add.circle(target.x, target.y, 2, color, 0.9).setDepth(8);
        this.effects.add(spark);
        const angle = i / 6 * Math.PI * 2;
        this.scene.tweens.add({
          targets: spark,
          x: target.x + Math.cos(angle) * config.blastRadius,
          y: target.y + Math.sin(angle) * config.blastRadius,
          alpha: 0,
          duration: config.blastVisualMs,
          onComplete: () => { this.effects.delete(spark); spark.destroy(); }
        });
      }
    }

    const playerDx = player.x - target.x;
    const playerDy = player.y - target.y;
    const playerRadius = config.blastRadius + 10;
    if (playerDx * playerDx + playerDy * playerDy <= playerRadius * playerRadius) {
      const damage = getScaledHazardDamage(config.playerDamageBase, this.round, config.maximumPlayerDamage);
      if (player.takeDamage(damage)) this.onPlayerDamaged?.(damage);
    }
    const enemyDamage = getScaledHazardDamage(config.enemyDamageBase, this.round, config.maximumEnemyDamage);
    for (const damageTarget of damageTargets) {
      if (!damageTarget.active) continue;
      const dx = damageTarget.x - target.x;
      const dy = damageTarget.y - target.y;
      const radius = config.blastRadius + damageTarget.hazardRadius;
      if (dx * dx + dy * dy <= radius * radius) {
        damageTarget.takeDamage(enemyDamage, 'hazard');
      }
    }
  }

  private clearTargets(): void {
    for (const target of this.targets) {
      target.marker.destroy();
      target.bomb.destroy();
    }
    this.targets = [];
  }
}
