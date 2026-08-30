import Phaser from 'phaser';
import { BOMBLET_HAZARD_BALANCE } from '../config/bombletHazards';
import type { Player } from '../entities/Player';
import type { ArenaTheme, RectSpec } from '../types';
import { getScaledHazardDamage, type HazardDamageTarget } from '../config/hazardScaling';
import { SeededRandom } from './SeededRandom';
import { AIR_DROP_PATTERN_NAMES, createAirDropPattern } from './AirDropPatterns';
import type { ExplosionPalette } from '../vfx/MineExplosionVfx.ts';

interface TargetPoint {
  x: number;
  y: number;
  marker: Phaser.GameObjects.Arc;
  bomb: Phaser.GameObjects.Container;
  bombArt: Phaser.GameObjects.Graphics;
  bombEmissive: Phaser.GameObjects.Graphics;
  explosionPalette: [core: number, primary: number, secondary: number, outer: number];
  delayMs: number;
  exploded: boolean;
}

/** Telegraphs deterministic air-dropped bomblet patterns without changing arena navigation. */
export class BombletHazardSystem {
  private readonly random: SeededRandom;
  private readonly warningText: Phaser.GameObjects.Text;
  /** Display objects are prewarmed once so a late-game strike never constructs them mid-frame. */
  private readonly targetPool: TargetPoint[];
  private readonly targets: TargetPoint[] = [];
  private nextStrikeAt: number;
  private strikeStartedAt = 0;
  private strikeIndex = 0;
  private patternIndex = 0;
  private strikeDetonationCount = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly round: number,
    seed: number,
    private readonly theme: ArenaTheme,
    private readonly bounds: RectSpec,
    private readonly isBlocked: (x: number, y: number) => boolean,
    _particlesEnabled: boolean,
    private readonly onPlayerDamaged?: (damage: number) => void,
    private readonly onBombletExploded?: (
      x: number,
      y: number,
      blastRadius: number,
      shouldPlaySound: boolean,
      explosionPalette: ExplosionPalette
    ) => void,
    private readonly playerDamageMultiplier = 1
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
    this.targetPool = Array.from(
      { length: BOMBLET_HAZARD_BALANCE.maximumBomblets },
      () => this.createTargetSlot()
    );
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

    for (let index = 0; index < this.targets.length; index += 1) {
      const target = this.targets[index];
      const dropElapsed = elapsed - config.telegraphMs - target.delayMs;
      const fallProgress = Phaser.Math.Clamp(dropElapsed / config.fallMs, 0, 1);
      const pulse = 0.72 + Math.sin(now * 0.024 + index * 0.7) * 0.2;
      target.marker.setScale(pulse).setAlpha(target.exploded ? 0 : 0.28 + fallProgress * 0.55);
      target.bomb
        .setPosition(target.x, target.y - config.fallHeight * (1 - fallProgress))
        // Keep the armored nose aimed into the fall, with a small aerodynamic
        // sway instead of spinning the detailed silhouette into visual noise.
        .setRotation(Math.sin(now * 0.009 + index * 1.31) * 0.14)
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
    for (const target of this.targetPool) {
      target.marker.destroy();
      target.bomb.destroy(true);
    }
    this.targetPool.length = 0;
    this.warningText.destroy();
  }

  /** Starts the production strike path immediately, but is unreachable in production builds. */
  forceStrikeForDevelopment(now: number): boolean {
    if (!import.meta.env.DEV) return false;
    this.clearTargets();
    this.startStrike(now);
    return this.active;
  }

  diagnostics(): Readonly<{ activeTargets: number; pooledTargets: number }> {
    return { activeTargets: this.targets.length, pooledTargets: this.targetPool.length };
  }

  private startStrike(now: number): void {
    const config = BOMBLET_HAZARD_BALANCE;
    this.strikeStartedAt = now;
    this.strikeDetonationCount = 0;
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
    this.targets.length = 0;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const target = this.targetPool[index];
      let color = this.theme.accent;
      let secondaryColor = this.theme.secondary;
      switch (index % 7) {
        case 1:
          color = this.theme.secondary;
          secondaryColor = this.theme.primary;
          break;
        case 2:
          color = 0xffa340;
          secondaryColor = 0xff563d;
          break;
        case 3:
          color = 0x39eeff;
          secondaryColor = 0x3d7dff;
          break;
        case 4:
          color = 0x53ff8a;
          secondaryColor = 0xb8ff3d;
          break;
        case 5:
          color = 0xff4ed3;
          secondaryColor = 0xff5e75;
          break;
        case 6:
          color = 0xffdf52;
          secondaryColor = 0xff8d32;
          break;
      }
      target.x = point.x;
      target.y = point.y;
      target.delayMs = index * config.staggerMs;
      target.exploded = false;
      target.explosionPalette[0] = 0xffffff;
      target.explosionPalette[1] = color;
      target.explosionPalette[2] = secondaryColor;
      target.explosionPalette[3] = this.theme.primary;
      target.marker
        .setPosition(point.x, point.y)
        .setRadius(config.blastRadius)
        .setFillStyle(color, 0.08)
        .setStrokeStyle(3, color, 0.82)
        .setVisible(true)
        .setActive(true)
        .setScale(1)
        .setAlpha(0.08);
      this.drawBombletArt(target, color, secondaryColor);
      target.bomb
        .setPosition(point.x, point.y - config.fallHeight)
        .setRotation(0)
        .setVisible(true)
        .setActive(true)
        .setAlpha(0);
      this.targets.push(target);
    }
  }

  private createTargetSlot(): TargetPoint {
    const marker = this.scene.add.circle(0, 0, BOMBLET_HAZARD_BALANCE.blastRadius, 0xffffff, 0)
      .setDepth(5)
      .setVisible(false)
      .setActive(false);
    // These two retained Graphics objects replace the old four-primitive cross.
    // They are redrawn only when a strike starts and remain fixed-slot pooled.
    const bombArt = this.scene.add.graphics();
    const bombEmissive = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const bomb = this.scene.add.container(0, 0, [bombArt, bombEmissive])
      .setDepth(8)
      .setVisible(false)
      .setActive(false)
      .setAlpha(0);
    return {
      x: 0,
      y: 0,
      marker,
      bomb,
      bombArt,
      bombEmissive,
      explosionPalette: [0xffffff, 0xffffff, 0xffffff, 0xffffff],
      delayMs: 0,
      exploded: false
    };
  }

  /**
   * Bakes one classic tapered bomb silhouette into its retained slot.
   * This runs at strike setup (at most 15 times), never in the frame loop.
   */
  private drawBombletArt(target: TargetPoint, accent: number, secondaryAccent: number): void {
    const art = target.bombArt;
    const glow = target.bombEmissive;
    art.clear();
    glow.clear();

    // Compact glow keeps the colored identity readable without obscuring the
    // dark metallic body or becoming a large transparent-overdraw disc.
    glow.fillStyle(accent, 0.075).fillEllipse(0, 3, 31, 53);
    glow.lineStyle(5, accent, 0.12).lineBetween(-10, -22, -5, -12);
    glow.lineBetween(10, -22, 5, -12);
    glow.lineStyle(3, secondaryAccent, 0.34).strokeEllipse(0, 15, 19, 7);
    glow.fillStyle(accent, 0.52).fillRoundedRect(-7, -4, 14, 4, 1.5);

    // Baked drop shadow and broad old-military silhouette.
    art.fillStyle(0x000000, 0.42).fillEllipse(2.5, 5, 26, 47);
    art.fillStyle(0x070b11, 1);
    art.beginPath();
    art.moveTo(-5, -15);
    art.lineTo(-15, -28);
    art.lineTo(-13, -10);
    art.lineTo(-7, -5);
    art.lineTo(7, -5);
    art.lineTo(13, -10);
    art.lineTo(15, -28);
    art.lineTo(5, -15);
    art.closePath();
    art.fillPath();
    art.lineStyle(1.6, 0x8ca1ae, 0.72).strokePath();

    // Accent inset on the rear stabilizer fins, with a recessed center stem.
    art.fillStyle(accent, 0.78);
    art.beginPath();
    art.moveTo(-6, -16);
    art.lineTo(-12, -24);
    art.lineTo(-11, -12);
    art.lineTo(-6, -8);
    art.closePath();
    art.fillPath();
    art.beginPath();
    art.moveTo(6, -16);
    art.lineTo(12, -24);
    art.lineTo(11, -12);
    art.lineTo(6, -8);
    art.closePath();
    art.fillPath();
    art.fillStyle(0x111923, 1).fillRoundedRect(-4, -24, 8, 14, 2);
    art.lineStyle(1, secondaryAccent, 0.9).strokeRoundedRect(-3.5, -23.5, 7, 13, 2);

    // Layered steel body: broad face, darker side plate, and a cool-metal
    // highlight create dimensionality while keeping one clean silhouette.
    art.fillStyle(0x1b2732, 1).fillEllipse(0, 5, 24, 43);
    art.lineStyle(2, 0x91a9b8, 0.9).strokeEllipse(0, 5, 24, 43);
    art.fillStyle(0x080d14, 0.88).fillEllipse(4.2, 5.5, 14, 39);
    art.fillStyle(0x526573, 0.34).fillEllipse(-4.4, 2.5, 7, 31);
    art.fillStyle(0xc9e1ec, 0.22).fillEllipse(-5.5, -1.5, 2.6, 17);

    // Reinforcement collars, glowing panel seam, vents, and rivets give the
    // shell the same layered industrial detail language as premium cosmetics.
    art.fillStyle(0x070b10, 0.94).fillRoundedRect(-10.5, -12, 21, 5, 1.5);
    art.lineStyle(1.5, accent, 0.96).lineBetween(-9, -9.5, 9, -9.5);
    art.fillStyle(0x05080d, 0.94).fillRoundedRect(-9, -4.5, 18, 6, 1.5);
    art.fillStyle(accent, 0.75).fillRoundedRect(-7.5, -3, 15, 3, 1);
    art.lineStyle(1, secondaryAccent, 0.8).strokeRoundedRect(-7.5, -3, 15, 3, 1);
    art.lineStyle(1.2, 0x8ca3b1, 0.7).lineBetween(0, 2, 0, 18);
    art.lineStyle(1.3, secondaryAccent, 0.88).strokeEllipse(0, 15, 18, 6);
    art.fillStyle(0x020509, 0.88).fillRoundedRect(4, 4, 4, 9, 1);
    art.lineStyle(1, accent, 0.72);
    art.lineBetween(5, 6, 7, 6);
    art.lineBetween(5, 8.5, 7, 8.5);
    art.lineBetween(5, 11, 7, 11);
    art.fillStyle(0x05080d, 0.96).fillCircle(-7.4, -7.4, 1.45);
    art.fillStyle(0xd9f3ff, 0.84).fillCircle(-7.7, -7.7, 0.62);
    art.fillStyle(0x05080d, 0.96).fillCircle(7.4, -7.4, 1.45);
    art.fillStyle(accent, 0.92).fillCircle(7.1, -7.7, 0.62);

    // The tapered armored nose remains dark metal with a color-coded arming band.
    art.fillStyle(0x0a1018, 1);
    art.beginPath();
    art.moveTo(-8.4, 17);
    art.lineTo(0, 29);
    art.lineTo(8.4, 17);
    art.closePath();
    art.fillPath();
    art.lineStyle(1.6, 0x91a9b8, 0.82).strokePath();
    art.lineStyle(2.2, accent, 0.94).lineBetween(-7.1, 19, 7.1, 19);
    art.fillStyle(secondaryAccent, 0.88).fillCircle(0, 25.2, 1.7);
    art.fillStyle(0xffffff, 0.82).fillCircle(-0.45, 24.7, 0.58);
  }

  private detonate(target: TargetPoint, player: Player, damageTargets: HazardDamageTarget[]): void {
    const config = BOMBLET_HAZARD_BALANCE;
    target.exploded = true;
    const shouldPlaySound = this.strikeDetonationCount % 2 === 0;
    this.strikeDetonationCount += 1;
    this.onBombletExploded?.(
      target.x,
      target.y,
      config.blastRadius,
      shouldPlaySound,
      target.explosionPalette
    );
    // Do not force-restart an in-progress shake when staggered bomblets overlap.
    this.scene.cameras.main.shake(config.cameraShakeDurationMs, config.cameraShakeIntensity, false);
    target.marker.setAlpha(0);
    target.bomb.setAlpha(0);

    const playerDx = player.x - target.x;
    const playerDy = player.y - target.y;
    const playerRadius = config.blastRadius + 10;
    if (playerDx * playerDx + playerDy * playerDy <= playerRadius * playerRadius) {
      const damage = getScaledHazardDamage(config.playerDamageBase, this.round, config.maximumPlayerDamage)
        * this.playerDamageMultiplier;
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
      target.marker.setVisible(false).setActive(false).setAlpha(0).setScale(1);
      target.bomb.setVisible(false).setActive(false).setAlpha(0).setRotation(0);
      target.exploded = false;
    }
    this.targets.length = 0;
  }
}
