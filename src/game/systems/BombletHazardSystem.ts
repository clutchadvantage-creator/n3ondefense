import Phaser from 'phaser';
import { BOMBLET_HAZARD_BALANCE } from '../config/bombletHazards';
import type { Player } from '../entities/Player';
import type { ArenaTheme, RectSpec } from '../types';
import { SeededRandom } from './SeededRandom';

const PATTERN_NAMES = ['LANE DROP', 'CHECKER BURST', 'ORBITAL RING', 'SPIRAL RAIN', 'CROSS DROP', 'SCATTER GRID'] as const;

interface TargetPoint {
  x: number;
  y: number;
  marker: Phaser.GameObjects.Arc;
  bomb: Phaser.GameObjects.Container;
  color: number;
  delayMs: number;
  exploded: boolean;
}

interface Point {
  x: number;
  y: number;
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
    private readonly onPlayerDamaged?: () => void
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

  update(now: number, player: Player, anotherHazardActive: boolean): void {
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
    const patternName = PATTERN_NAMES[this.patternIndex];
    if (elapsed < config.telegraphMs) {
      const remaining = (config.telegraphMs - elapsed) / 1000;
      this.warningText.setText(`BOMBLET DROP: ${patternName}  ${remaining.toFixed(1)}s`)
        .setAlpha(0.62 + Math.sin(now * 0.02) * 0.24);
    } else {
      this.warningText.setText(`BOMBLETS INBOUND: ${patternName}`).setAlpha(0.78);
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

      if (!target.exploded && dropElapsed >= config.fallMs) this.detonate(target, player);
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
    for (const effect of this.effects) effect.destroy();
    this.effects.clear();
    this.warningText.destroy();
  }

  private startStrike(now: number): void {
    const config = BOMBLET_HAZARD_BALANCE;
    this.strikeStartedAt = now;
    this.patternIndex = (this.strikeIndex + this.random.int(0, PATTERN_NAMES.length - 1)) % PATTERN_NAMES.length;
    const count = Math.min(
      config.maximumBomblets,
      config.minimumBomblets + Math.floor((this.round - config.unlockRound) / config.roundsPerAdditionalBomblet)
    );
    const points = this.createPattern(this.patternIndex, count);
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

  private createPattern(pattern: number, count: number): Point[] {
    const inset = BOMBLET_HAZARD_BALANCE.safeEdgeInset;
    const left = this.bounds.x + inset;
    const right = this.bounds.x + this.bounds.w - inset;
    const top = this.bounds.y + inset;
    const bottom = this.bounds.y + this.bounds.h - inset;
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const center = {
      x: this.random.float(left + width * 0.2, right - width * 0.2),
      y: this.random.float(top + height * 0.2, bottom - height * 0.2)
    };
    const candidates: Point[] = [];

    if (pattern === 0) {
      const vertical = this.random.bool();
      const lane = this.random.float(0.22, 0.78);
      for (let i = 0; i < count; i += 1) {
        const progress = count === 1 ? 0.5 : i / (count - 1);
        candidates.push(vertical
          ? { x: left + width * lane + Math.sin(i * 1.7) * 34, y: top + height * progress }
          : { x: left + width * progress, y: top + height * lane + Math.sin(i * 1.7) * 34 });
      }
    } else if (pattern === 1) {
      const columns = Math.max(3, Math.ceil(Math.sqrt(count * 1.5)));
      const rows = Math.ceil(count / columns);
      for (let i = 0; i < count; i += 1) {
        const column = i % columns;
        const row = Math.floor(i / columns);
        candidates.push({
          x: left + width * ((column + 0.5) / columns),
          y: top + height * ((row + 0.5) / rows) + (column % 2 === 0 ? -22 : 22)
        });
      }
    } else if (pattern === 2) {
      const radius = Math.min(width, height) * this.random.float(0.2, 0.36);
      for (let i = 0; i < count; i += 1) {
        const angle = i / count * Math.PI * 2 + this.random.float(-0.12, 0.12);
        candidates.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
      }
    } else if (pattern === 3) {
      for (let i = 0; i < count; i += 1) {
        const progress = (i + 1) / count;
        const radius = Math.min(width, height) * 0.38 * progress;
        const angle = progress * Math.PI * 4.5;
        candidates.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
      }
    } else if (pattern === 4) {
      for (let i = 0; i < count; i += 1) {
        const progress = count === 1 ? 0.5 : i / (count - 1);
        const alternate = i % 2 === 0;
        candidates.push({
          x: left + width * progress,
          y: alternate ? top + height * progress : bottom - height * progress
        });
      }
    } else {
      for (let i = 0; i < count * 2; i += 1) {
        candidates.push({ x: this.random.float(left, right), y: this.random.float(top, bottom) });
      }
    }

    const accepted: Point[] = [];
    for (const point of candidates) {
      const resolved = this.resolvePlayablePoint(point, left, right, top, bottom);
      if (!resolved || accepted.some((other) => Phaser.Math.Distance.Between(other.x, other.y, resolved.x, resolved.y) < 58)) continue;
      accepted.push(resolved);
      if (accepted.length >= count) break;
    }
    for (let tries = 0; accepted.length < count && tries < 80; tries += 1) {
      const fallback = this.resolvePlayablePoint({ x: this.random.float(left, right), y: this.random.float(top, bottom) }, left, right, top, bottom);
      if (fallback && accepted.every((other) => Phaser.Math.Distance.Between(other.x, other.y, fallback.x, fallback.y) >= 58)) accepted.push(fallback);
    }
    return accepted;
  }

  private resolvePlayablePoint(point: Point, left: number, right: number, top: number, bottom: number): Point | null {
    const clamped = { x: Phaser.Math.Clamp(point.x, left, right), y: Phaser.Math.Clamp(point.y, top, bottom) };
    if (!this.isBlocked(clamped.x, clamped.y)) return clamped;
    for (let radius = 40; radius <= 160; radius += 40) {
      for (let step = 0; step < 8; step += 1) {
        const angle = step / 8 * Math.PI * 2;
        const candidate = {
          x: Phaser.Math.Clamp(clamped.x + Math.cos(angle) * radius, left, right),
          y: Phaser.Math.Clamp(clamped.y + Math.sin(angle) * radius, top, bottom)
        };
        if (!this.isBlocked(candidate.x, candidate.y)) return candidate;
      }
    }
    return null;
  }

  private detonate(target: TargetPoint, player: Player): void {
    const config = BOMBLET_HAZARD_BALANCE;
    target.exploded = true;
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

    if (Phaser.Math.Distance.Between(player.x, player.y, target.x, target.y) <= config.blastRadius + 10) {
      const damage = Math.min(config.maximumPlayerDamage, config.playerDamageBase + Math.max(0, this.round - 1) * config.playerDamagePerRound);
      if (player.takeDamage(damage)) this.onPlayerDamaged?.();
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
