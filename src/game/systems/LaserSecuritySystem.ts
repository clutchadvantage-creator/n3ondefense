import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';
import { LASER_HAZARD_BALANCE } from '../config/laserHazards';
import type { ArenaTheme } from '../types';
import type { Player } from '../entities/Player';
import { getScaledHazardDamage, type HazardDamageTarget } from '../config/hazardScaling';

interface LaserSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const LASER_PATTERN_NAMES = [
  'SWEEP',
  'SPLIT / REJOIN',
  'TWIRL',
  'CROSSWEAVE',
  'SPIN BLOOM',
  'PRISM ORBIT',
  'PINWHEEL FRACTURE',
  'BREACH SWEEP',
  'REVERSAL CASCADE'
] as const;
const LASER_COLORS = [0x39eeff, 0xff4ed3, 0x53ff8a, 0xffa340, 0xae6bff, 0xff5e75] as const;
const MAX_LASER_SEGMENTS = 12;

export class LaserSecuritySystem {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly warningText: Phaser.GameObjects.Text;
  private readonly segments: LaserSegment[] = Array.from({ length: MAX_LASER_SEGMENTS }, () => ({ x1: 0, y1: 0, x2: 0, y2: 0 }));
  private readonly createdAt: number;
  private patternIndex = 0;
  private lastCycle = -1;

  constructor(
    scene: Phaser.Scene,
    private readonly round: number,
    private readonly theme: ArenaTheme,
    private readonly onPlayerDamaged?: (damage: number) => void
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

  update(
    now: number,
    dt: number,
    player: Player,
    targets: HazardDamageTarget[],
    playerLaserImmune = false,
    suppressed = false
  ): void {
    if (suppressed) {
      this.graphics.clear();
      this.warningText.setAlpha(0);
      return;
    }
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
      this.patternIndex = cycle % LASER_PATTERN_NAMES.length;
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
    const segmentCount = this.buildSegments(this.patternIndex, progress);
    this.draw(segmentCount, now, telegraphing);

    if (telegraphing) {
      const remaining = Math.max(0, (config.telegraphMs - cycleTime) / 1000);
      const warning = `SECURITY LASERS: ${LASER_PATTERN_NAMES[this.patternIndex]}  ${remaining.toFixed(1)}s`;
      if (this.warningText.text !== warning) this.warningText.setText(warning);
      this.warningText.setAlpha(0.55 + Math.sin(now * 0.018) * 0.25);
      return;
    }

    const activeWarning = `SECURITY LASERS ACTIVE: ${LASER_PATTERN_NAMES[this.patternIndex]}`;
    if (this.warningText.text !== activeWarning) this.warningText.setText(activeWarning);
    this.warningText.setAlpha(0.72);
    if (!playerLaserImmune && this.touchesAnySegment(player.x, player.y, config.collisionRadius + 11, segmentCount)) {
      const damage = getScaledHazardDamage(config.playerDamagePerHit, this.round, config.maximumPlayerDamagePerHit);
      if (player.takeDamage(damage)) this.onPlayerDamaged?.(damage);
    }
    const enemyDamagePerSecond = getScaledHazardDamage(config.enemyDamagePerSecond, this.round, config.maximumEnemyDamagePerSecond);
    for (const target of targets) {
      if (target.active && this.touchesAnySegment(target.x, target.y, config.collisionRadius + target.hazardRadius, segmentCount)) {
        target.takeDamage(enemyDamagePerSecond * dt, 'hazard');
      }
    }
  }

  isDangerWindow(now: number, suppressed = false): boolean {
    if (suppressed) return false;
    const config = LASER_HAZARD_BALANCE;
    const cooldownMs = Math.max(
      config.minimumCooldownMs,
      config.baseCooldownMs - Math.max(0, this.round - 1) * config.cooldownReductionPerRoundMs
    );
    const elapsed = now - this.createdAt - config.initialDelayMs;
    if (elapsed < 0) return false;
    const cycleLength = config.telegraphMs + config.activeMs + cooldownMs;
    return elapsed % cycleLength < config.telegraphMs + config.activeMs;
  }

  destroy(): void {
    this.graphics.destroy();
    this.warningText.destroy();
  }

  private setSegment(index: number, x1: number, y1: number, x2: number, y2: number): void {
    const segment = this.segments[index];
    segment.x1 = x1;
    segment.y1 = y1;
    segment.x2 = x2;
    segment.y2 = y2;
  }

  private buildSegments(pattern: number, t: number): number {
    const w = WORLD_WIDTH;
    const h = WORLD_HEIGHT;
    if (pattern === 0) {
      const x = Phaser.Math.Linear(-80, w + 80, t);
      this.setSegment(0, x, 0, x, h);
      return 1;
    }
    if (pattern === 1) {
      const separation = Math.sin(t * Math.PI) * w * 0.34;
      const center = w * 0.5;
      this.setSegment(0, center - separation, 0, center - separation * 0.72, h);
      this.setSegment(1, center + separation, 0, center + separation * 0.72, h);
      return 2;
    }
    if (pattern === 2) {
      const angle = t * Math.PI * 2.4;
      const length = Math.hypot(w, h) * 0.62;
      const cx = w * 0.5;
      const cy = h * 0.5;
      for (let index = 0; index < 2; index += 1) {
        const segmentAngle = angle + index * Math.PI / 2;
        const dx = Math.cos(segmentAngle) * length;
        const dy = Math.sin(segmentAngle) * length;
        this.setSegment(index, cx - dx, cy - dy, cx + dx, cy + dy);
      }
      return 2;
    }

    if (pattern === 3) {
      const sway = Math.sin(t * Math.PI * 2) * h * 0.28;
      this.setSegment(0, 0, h * 0.18 + sway, w, h * 0.82 - sway);
      this.setSegment(1, 0, h * 0.82 - sway, w, h * 0.18 + sway);
      return 2;
    }

    if (pattern === 4) {
      const split = Math.sin(t * Math.PI);
      const baseAngle = -Math.PI / 2 + t * Math.PI * 2;
      const length = Math.hypot(w, h) * 0.58;
      const cx = w * 0.5;
      const cy = h * 0.5;
      for (let index = 0; index < 5; index += 1) {
        const band = index - 2;
        const segmentAngle = baseAngle + band * 0.24 * split;
        const offset = band * 72 * split;
        const ox = -Math.sin(baseAngle) * offset;
        const oy = Math.cos(baseAngle) * offset;
        const dx = Math.cos(segmentAngle) * length;
        const dy = Math.sin(segmentAngle) * length;
        this.setSegment(index, cx + ox - dx, cy + oy - dy, cx + ox + dx, cy + oy + dy);
      }
      return 5;
    }

    if (pattern === 5) {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const radius = Math.min(w, h) * (0.2 + Math.sin(t * Math.PI) * 0.18);
      const rotation = t * Math.PI * 3;
      for (let index = 0; index < 6; index += 1) {
        const angle = rotation + index * Math.PI / 3;
        const oppositeAngle = rotation + ((index + 3) % 6) * Math.PI / 3;
        this.setSegment(
          index,
          cx + Math.cos(angle) * radius,
          cy + Math.sin(angle) * radius,
          cx + Math.cos(oppositeAngle) * radius,
          cy + Math.sin(oppositeAngle) * radius
        );
      }
      return 6;
    }

    if (pattern === 6) return this.buildPinwheelFracture(t, w, h);
    if (pattern === 7) return this.buildBreachSweep(t, w, h);
    return this.buildReversalCascade(t, w, h);
  }

  private buildPinwheelFracture(t: number, width: number, height: number): number {
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    if (t < 0.44) {
      const growth = t / 0.44;
      const radius = Math.min(width, height) * (0.08 + growth * 0.48);
      const rotation = t * Math.PI * 4.2;
      for (let arm = 0; arm < 4; arm += 1) {
        const angle = rotation + arm * Math.PI / 2;
        const jointX = centerX + Math.cos(angle) * radius * 0.55;
        const jointY = centerY + Math.sin(angle) * radius * 0.55;
        const tipAngle = angle + 0.62;
        this.setSegment(arm * 2, centerX, centerY, jointX, jointY);
        this.setSegment(
          arm * 2 + 1,
          jointX,
          jointY,
          jointX + Math.cos(tipAngle) * radius * 0.55,
          jointY + Math.sin(tipAngle) * radius * 0.55
        );
      }
      return 8;
    }

    const fracture = (t - 0.44) / 0.56;
    const travel = Math.min(width, height) * 0.43 * fracture;
    const armLength = Math.min(width, height) * (0.16 - fracture * 0.035);
    const rotation = t * Math.PI * 6;
    for (let pinwheel = 0; pinwheel < 4; pinwheel += 1) {
      const travelAngle = pinwheel * Math.PI / 2;
      const x = centerX + Math.cos(travelAngle) * travel;
      const y = centerY + Math.sin(travelAngle) * travel;
      const firstAngle = rotation + pinwheel * Math.PI / 2;
      const secondAngle = firstAngle + Math.PI * 0.62;
      this.setSegment(pinwheel * 2, x, y, x + Math.cos(firstAngle) * armLength, y + Math.sin(firstAngle) * armLength);
      this.setSegment(pinwheel * 2 + 1, x, y, x + Math.cos(secondAngle) * armLength, y + Math.sin(secondAngle) * armLength);
    }
    return 8;
  }

  private buildBreachSweep(t: number, width: number, height: number): number {
    const y = Phaser.Math.Linear(-60, height + 60, t);
    const gapWidth = Math.max(100, width * 0.055);
    const shift = Math.sin(t * Math.PI * 2) * width * 0.045;
    const firstGap = width * 0.22 + shift;
    const secondGap = width * 0.5 - shift * 0.65;
    const thirdGap = width * 0.78 + shift * 0.4;
    this.setSegment(0, 0, y, firstGap - gapWidth * 0.5, y);
    this.setSegment(1, firstGap + gapWidth * 0.5, y, secondGap - gapWidth * 0.5, y);
    this.setSegment(2, secondGap + gapWidth * 0.5, y, thirdGap - gapWidth * 0.5, y);
    this.setSegment(3, thirdGap + gapWidth * 0.5, y, width, y);
    return 4;
  }

  private buildReversalCascade(t: number, width: number, height: number): number {
    if (t < 0.42) {
      const outward = t / 0.42;
      const x = Phaser.Math.Linear(-60, width + 60, outward);
      this.setSegment(0, x, 0, x, height);
      return 1;
    }
    if (t < 0.68) {
      const returning = (t - 0.42) / 0.26;
      const x = Phaser.Math.Linear(width + 60, width * 0.5, returning);
      this.setSegment(0, x, 0, x, height);
      return 1;
    }

    const split = (t - 0.68) / 0.32;
    const separation = width * 0.48 * split;
    const center = width * 0.5;
    const slant = height * 0.18 * Math.sin(split * Math.PI);
    this.setSegment(0, center - separation, 0, center - separation * 0.72, height);
    this.setSegment(1, center, 0 + slant, center, height - slant);
    this.setSegment(2, center + separation, 0, center + separation * 0.72, height);
    return 3;
  }

  private draw(segmentCount: number, now: number, telegraphing: boolean): void {
    this.graphics.clear();
    const colorShift = Math.floor(now / 420);
    for (let index = 0; index < segmentCount; index += 1) {
      const segment = this.segments[index];
      const paletteIndex = (this.patternIndex * 2 + index + colorShift) % (LASER_COLORS.length + 3);
      const color = paletteIndex === 0
        ? this.theme.primary
        : paletteIndex === 1
          ? this.theme.secondary
          : paletteIndex === 2
            ? this.theme.accent
            : LASER_COLORS[paletteIndex - 3];
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

  private touchesAnySegment(x: number, y: number, radius: number, segmentCount: number): boolean {
    const radiusSquared = radius * radius;
    for (let index = 0; index < segmentCount; index += 1) {
      if (this.distanceSquaredToSegment(x, y, this.segments[index]) <= radiusSquared) return true;
    }
    return false;
  }

  private distanceSquaredToSegment(x: number, y: number, segment: LaserSegment): number {
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) {
      const pointDx = x - segment.x1;
      const pointDy = y - segment.y1;
      return pointDx * pointDx + pointDy * pointDy;
    }
    const t = Phaser.Math.Clamp(((x - segment.x1) * dx + (y - segment.y1) * dy) / lengthSq, 0, 1);
    const pointDx = x - (segment.x1 + dx * t);
    const pointDy = y - (segment.y1 + dy * t);
    return pointDx * pointDx + pointDy * pointDy;
  }
}
