import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';
import { LASER_HAZARD_BALANCE } from '../config/laserHazards';
import type { ArenaTheme } from '../types';
import type { Player } from '../entities/Player';
import type { Enemy } from '../enemies/Enemy';

interface LaserSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const PATTERN_NAMES = ['SWEEP', 'SPLIT / REJOIN', 'TWIRL', 'CROSSWEAVE'] as const;

export class LaserSecuritySystem {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly warningText: Phaser.GameObjects.Text;
  private readonly createdAt: number;
  private patternIndex = 0;
  private lastCycle = -1;

  constructor(
    scene: Phaser.Scene,
    private readonly round: number,
    private readonly theme: ArenaTheme
  ) {
    this.createdAt = scene.time.now;
    this.graphics = scene.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.warningText = scene.add.text(scene.scale.width * 0.5, 192, '', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '17px',
      color: '#ff9fe6',
      stroke: '#050812',
      strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1050).setAlpha(0);
  }

  update(now: number, dt: number, player: Player, enemies: Enemy[], playerLaserImmune = false): void {
    const config = LASER_HAZARD_BALANCE;
    const cooldownMs = Math.max(
      config.minimumCooldownMs,
      config.baseCooldownMs - Math.max(0, this.round - 1) * config.cooldownReductionPerRoundMs
    );
    const elapsed = now - this.createdAt - config.initialDelayMs;
    if (elapsed < 0) {
      this.graphics.clear();
      return;
    }

    const cycleLength = config.telegraphMs + config.activeMs + cooldownMs;
    const cycle = Math.floor(elapsed / cycleLength);
    const cycleTime = elapsed - cycle * cycleLength;
    if (cycle !== this.lastCycle) {
      this.lastCycle = cycle;
      this.patternIndex = cycle % PATTERN_NAMES.length;
    }

    if (cycleTime >= config.telegraphMs + config.activeMs) {
      this.graphics.clear();
      this.warningText.setAlpha(0);
      return;
    }

    const telegraphing = cycleTime < config.telegraphMs;
    const progress = telegraphing
      ? 0
      : Phaser.Math.Clamp((cycleTime - config.telegraphMs) / config.activeMs, 0, 1);
    const segments = this.getSegments(this.patternIndex, progress);
    this.draw(segments, now, telegraphing);

    if (telegraphing) {
      const remaining = Math.max(0, (config.telegraphMs - cycleTime) / 1000);
      this.warningText.setText(`SECURITY LASERS: ${PATTERN_NAMES[this.patternIndex]}  ${remaining.toFixed(1)}s`)
        .setAlpha(0.55 + Math.sin(now * 0.018) * 0.25);
      return;
    }

    this.warningText.setText(`SECURITY LASERS ACTIVE: ${PATTERN_NAMES[this.patternIndex]}`).setAlpha(0.72);
    if (!playerLaserImmune && this.touchesAnySegment(player.x, player.y, config.collisionRadius + 11, segments)) {
      player.takeDamage(config.playerDamagePerHit);
    }
    for (const enemy of enemies) {
      if (enemy.active && this.touchesAnySegment(enemy.x, enemy.y, config.collisionRadius + enemy.stats.size * 0.45, segments)) {
        enemy.takeDamage(config.enemyDamagePerSecond * dt);
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.warningText.destroy();
  }

  private getSegments(pattern: number, t: number): LaserSegment[] {
    const w = WORLD_WIDTH;
    const h = WORLD_HEIGHT;
    if (pattern === 0) {
      const x = Phaser.Math.Linear(-80, w + 80, t);
      return [{ x1: x, y1: 0, x2: x, y2: h }];
    }
    if (pattern === 1) {
      const separation = Math.sin(t * Math.PI) * w * 0.34;
      const center = w * 0.5;
      return [
        { x1: center - separation, y1: 0, x2: center - separation * 0.72, y2: h },
        { x1: center + separation, y1: 0, x2: center + separation * 0.72, y2: h }
      ];
    }
    if (pattern === 2) {
      const angle = t * Math.PI * 2.4;
      const length = Math.hypot(w, h) * 0.62;
      const cx = w * 0.5;
      const cy = h * 0.5;
      return [0, Math.PI / 2].map((offset) => ({
        x1: cx - Math.cos(angle + offset) * length,
        y1: cy - Math.sin(angle + offset) * length,
        x2: cx + Math.cos(angle + offset) * length,
        y2: cy + Math.sin(angle + offset) * length
      }));
    }

    const sway = Math.sin(t * Math.PI * 2) * h * 0.28;
    return [
      { x1: 0, y1: h * 0.18 + sway, x2: w, y2: h * 0.82 - sway },
      { x1: 0, y1: h * 0.82 - sway, x2: w, y2: h * 0.18 + sway }
    ];
  }

  private draw(segments: LaserSegment[], now: number, telegraphing: boolean): void {
    this.graphics.clear();
    const color = this.patternIndex % 2 === 0 ? this.theme.secondary : this.theme.accent;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (telegraphing) {
        this.graphics.lineStyle(2, color, 0.3 + Math.sin(now * 0.025 + index) * 0.16);
        this.graphics.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
        continue;
      }

      this.graphics.lineStyle(18, color, 0.1);
      this.graphics.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
      this.graphics.lineStyle(7, color, 0.72);
      this.graphics.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);

      const dx = segment.x2 - segment.x1;
      const dy = segment.y2 - segment.y1;
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / length;
      const ny = dx / length;
      this.graphics.lineStyle(2, 0xffffff, 0.92);
      this.graphics.beginPath();
      this.graphics.moveTo(segment.x1, segment.y1);
      for (let step = 1; step < 18; step += 1) {
        const p = step / 18;
        const jitter = Math.sin(now * 0.045 + step * 2.7 + index * 5) * 7 + Math.sin(now * 0.017 + step) * 4;
        this.graphics.lineTo(segment.x1 + dx * p + nx * jitter, segment.y1 + dy * p + ny * jitter);
      }
      this.graphics.lineTo(segment.x2, segment.y2);
      this.graphics.strokePath();
    }
  }

  private touchesAnySegment(x: number, y: number, radius: number, segments: LaserSegment[]): boolean {
    return segments.some((segment) => this.distanceToSegment(x, y, segment) <= radius);
  }

  private distanceToSegment(x: number, y: number, segment: LaserSegment): number {
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return Phaser.Math.Distance.Between(x, y, segment.x1, segment.y1);
    const t = Phaser.Math.Clamp(((x - segment.x1) * dx + (y - segment.y1) * dy) / lengthSq, 0, 1);
    return Phaser.Math.Distance.Between(x, y, segment.x1 + dx * t, segment.y1 + dy * t);
  }
}
