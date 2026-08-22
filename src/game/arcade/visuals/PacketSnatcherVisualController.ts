import Phaser from 'phaser';
import {
  ARCADE_TAU,
  clamp01,
  drawCornerBrackets,
  drawDirectionalChevron,
  drawSegmentedRing,
  seededUnit
} from './ArcadeVisualPrimitives.ts';

interface PacketSnatcherVisualOptions {
  spawnX: number;
  spawnY: number;
  extractionX: number;
  extractionY: number;
  thiefRadius: number;
  extractionRadius: number;
  particlesEnabled: boolean;
}

const TRAIL_SAMPLES = 12;
const SAMPLE_INTERVAL_MS = 85;

/** Render-only moving data-heist presentation. Enemy movement stays authoritative. */
export class PacketSnatcherVisualController {
  private readonly routeGraphics: Phaser.GameObjects.Graphics;
  private readonly effectGraphics: Phaser.GameObjects.Graphics;
  private readonly marker: Phaser.GameObjects.Container;
  private readonly markerDynamic: Phaser.GameObjects.Graphics;
  private readonly extraction: Phaser.GameObjects.Container;
  private readonly extractionDynamic: Phaser.GameObjects.Graphics;
  private readonly trailX = new Float32Array(TRAIL_SAMPLES);
  private readonly trailY = new Float32Array(TRAIL_SAMPLES);
  private trailCount = 0;
  private trailCursor = 0;
  private nextTrailAt = 0;
  private lastHealthFraction = 1;
  private hitAt = -10_000;
  private terminal: 'none' | 'success' | 'failure' = 'none';
  private terminalAt = 0;
  private terminalX = 0;
  private terminalY = 0;

  constructor(scene: Phaser.Scene, private readonly options: PacketSnatcherVisualOptions) {
    this.routeGraphics = scene.add.graphics().setDepth(8.25).setBlendMode(Phaser.BlendModes.ADD);
    this.effectGraphics = scene.add.graphics().setDepth(14.2).setBlendMode(Phaser.BlendModes.ADD);

    const ring = scene.add.circle(0, 0, options.thiefRadius + 18, 0x55efff, 0.045)
      .setStrokeStyle(2, 0xff5bcf, 0.92).setBlendMode(Phaser.BlendModes.ADD);
    const cage = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.drawDataCage(cage);
    this.markerDynamic = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const tag = scene.add.text(0, -options.thiefRadius - 34, 'DATA THIEF // INTERCEPT', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#a8fbff',
      stroke: '#02050b', strokeThickness: 4
    }).setOrigin(0.5);
    this.marker = scene.add.container(options.spawnX, options.spawnY, [ring, cage, this.markerDynamic, tag]).setDepth(14);

    const base = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.drawExtractionBase(base);
    this.extractionDynamic = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const extractText = scene.add.text(0, 0, 'DATA EXFIL', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#ff9de6',
      stroke: '#02050b', strokeThickness: 3
    }).setOrigin(0.5);
    this.extraction = scene.add.container(options.extractionX, options.extractionY, [base, this.extractionDynamic, extractText]).setDepth(8.5);
    for (let index = 0; index < TRAIL_SAMPLES; index += 1) {
      this.trailX[index] = options.spawnX;
      this.trailY[index] = options.spawnY;
    }
  }

  update(now: number, startedAt: number, thiefX: number, thiefY: number, healthFraction: number, remainingMs: number): void {
    const elapsed = Math.max(0, now - startedAt);
    const activation = clamp01(elapsed / 1_050);
    const urgency = clamp01((7_000 - remainingMs) / 7_000);
    if (healthFraction < this.lastHealthFraction - 0.001) this.hitAt = now;
    this.lastHealthFraction = healthFraction;
    if (now >= this.nextTrailAt && this.terminal === 'none') {
      this.nextTrailAt = now + SAMPLE_INTERVAL_MS;
      this.trailX[this.trailCursor] = thiefX;
      this.trailY[this.trailCursor] = thiefY;
      this.trailCursor = (this.trailCursor + 1) % TRAIL_SAMPLES;
      this.trailCount = Math.min(TRAIL_SAMPLES, this.trailCount + 1);
    }

    if (this.terminal === 'none') this.marker.setPosition(thiefX, thiefY);
    this.marker.setAlpha(activation).setScale(0.78 + activation * 0.22);
    const pulse = 0.5 + Math.sin(now * (0.012 + urgency * 0.01)) * 0.5;
    this.drawRoute(now, thiefX, thiefY, urgency);
    this.drawMarker(now, healthFraction, pulse, urgency);
    this.drawExtraction(now, pulse, urgency);
    this.effectGraphics.clear();
    const hitProgress = clamp01((now - this.hitAt) / 240);
    if (hitProgress < 1) this.drawHitFeedback(thiefX, thiefY, hitProgress);
    if (this.terminal !== 'none') this.drawTerminal(now);
  }

  beginSuccess(now: number, x: number, y: number): void {
    if (this.terminal !== 'none') return;
    this.terminal = 'success';
    this.terminalAt = now;
    this.terminalX = x;
    this.terminalY = y;
    this.marker.setPosition(x, y);
  }

  beginFailure(now: number, x: number, y: number): void {
    if (this.terminal !== 'none') return;
    this.terminal = 'failure';
    this.terminalAt = now;
    this.terminalX = x;
    this.terminalY = y;
    this.marker.setPosition(x, y);
  }

  destroy(): void {
    this.routeGraphics.destroy();
    this.effectGraphics.destroy();
    this.marker.destroy(true);
    this.extraction.destroy(true);
  }

  private drawDataCage(graphics: Phaser.GameObjects.Graphics): void {
    const radius = this.options.thiefRadius + 12;
    graphics.lineStyle(2, 0x55efff, 0.78);
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * ARCADE_TAU;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      graphics.strokeRect(x - 4, y - 4, 8, 8);
      graphics.lineBetween(x * 0.72, y * 0.72, x, y);
    }
    drawCornerBrackets(graphics, radius + 7, 9, 0xff5bcf, 0.8, 2);
  }

  private drawExtractionBase(graphics: Phaser.GameObjects.Graphics): void {
    const radius = this.options.extractionRadius;
    graphics.fillStyle(0xff5bcf, 0.035).fillCircle(0, 0, radius);
    graphics.lineStyle(2, 0xff5bcf, 0.64).strokeCircle(0, 0, radius);
    graphics.lineStyle(1, 0x55efff, 0.32).strokeCircle(0, 0, radius - 10);
    graphics.lineStyle(1, 0xff5bcf, 0.24);
    for (let index = -2; index <= 2; index += 1) {
      graphics.lineBetween(index * 12, -30, index * 12, 30);
    }
  }

  private drawRoute(now: number, thiefX: number, thiefY: number, urgency: number): void {
    this.routeGraphics.clear();
    const routeColor = urgency > 0.45 && Math.floor(now / 140) % 2 === 0 ? 0xff4c70 : 0x55efff;
    this.routeGraphics.lineStyle(1, routeColor, 0.13 + urgency * 0.2)
      .lineBetween(thiefX, thiefY, this.options.extractionX, this.options.extractionY);
    const dx = this.options.extractionX - thiefX;
    const dy = this.options.extractionY - thiefY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const markerCount = Math.min(8, Math.max(2, Math.floor(distance / 90)));
    for (let index = 1; index <= markerCount; index += 1) {
      const ratio = (index / (markerCount + 1) + (now * 0.00018) % 0.15) % 1;
      drawDirectionalChevron(
        this.routeGraphics,
        thiefX + dx * ratio,
        thiefY + dy * ratio,
        angle,
        7,
        index % 2 ? routeColor : 0xff5bcf,
        0.3 + urgency * 0.38
      );
    }
    if (this.trailCount > 1) {
      for (let index = 1; index < this.trailCount; index += 1) {
        const current = (this.trailCursor - index + TRAIL_SAMPLES) % TRAIL_SAMPLES;
        const previous = (current - 1 + TRAIL_SAMPLES) % TRAIL_SAMPLES;
        const fade = 1 - index / this.trailCount;
        this.routeGraphics.lineStyle(2 + fade * 2, index % 2 ? 0x55efff : 0xff5bcf, fade * 0.38)
          .lineBetween(this.trailX[current], this.trailY[current], this.trailX[previous], this.trailY[previous]);
      }
    }
  }

  private drawMarker(now: number, healthFraction: number, pulse: number, urgency: number): void {
    this.markerDynamic.clear();
    const radius = this.options.thiefRadius + 21;
    drawSegmentedRing(this.markerDynamic, radius, 16, healthFraction, 0x55efff, 0.9, 3, -Math.PI * 0.5);
    drawSegmentedRing(this.markerDynamic, radius + 8, 8, 1, urgency > 0.45 ? 0xff4c70 : 0xff5bcf, 0.35 + pulse * 0.42, 2, now * 0.0012);
    for (let index = 0; index < 5; index += 1) {
      const angle = -now * 0.002 + index / 5 * ARCADE_TAU;
      const orbit = radius + 14 + (index % 2) * 5;
      this.markerDynamic.fillStyle(index % 2 ? 0xff5bcf : 0x55efff, 0.58 + pulse * 0.4)
        .fillRect(Math.cos(angle) * orbit - 2, Math.sin(angle) * orbit - 2, 5, 5);
    }
  }

  private drawExtraction(now: number, pulse: number, urgency: number): void {
    this.extractionDynamic.clear();
    const color = urgency > 0.4 && Math.floor(now / 120) % 2 === 0 ? 0xff496f : 0xff5bcf;
    drawSegmentedRing(this.extractionDynamic, this.options.extractionRadius + 8, 12, 1, color, 0.38 + pulse * 0.45, 3, -now * 0.0014);
    drawCornerBrackets(this.extractionDynamic, 51 + pulse * 4, 12, color, 0.42 + urgency * 0.4, 2);
    this.extractionDynamic.lineStyle(2, 0x55efff, 0.2 + pulse * 0.24).strokeCircle(0, 0, 18 + pulse * 9);
  }

  private drawHitFeedback(x: number, y: number, progress: number): void {
    this.effectGraphics.lineStyle(3, 0xffffff, (1 - progress) * 0.9).strokeCircle(x, y, 18 + progress * 42);
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * ARCADE_TAU;
      const start = 12 + progress * 18;
      const end = 22 + progress * 42;
      this.effectGraphics.lineStyle(2, index % 2 ? 0xff5bcf : 0x55efff, (1 - progress) * 0.72)
        .lineBetween(x + Math.cos(angle) * start, y + Math.sin(angle) * start, x + Math.cos(angle) * end, y + Math.sin(angle) * end);
    }
  }

  private drawTerminal(now: number): void {
    const progress = clamp01((now - this.terminalAt) / 650);
    if (this.terminal === 'success') {
      const shardCount = this.options.particlesEnabled ? 20 : 10;
      this.effectGraphics.lineStyle(4, 0x7dffb2, (1 - progress) * 0.9)
        .strokeCircle(this.terminalX, this.terminalY, 20 + progress * 100);
      for (let index = 0; index < shardCount; index += 1) {
        const angle = index / shardCount * ARCADE_TAU + seededUnit(index, 74) * 0.34;
        const distance = progress * (54 + seededUnit(index, 75) * 96);
        const x = this.terminalX + Math.cos(angle) * distance;
        const y = this.terminalY + Math.sin(angle) * distance;
        this.effectGraphics.fillStyle(index % 3 === 0 ? 0x7dffb2 : index % 2 ? 0xff5bcf : 0x55efff, (1 - progress) * 0.95)
          .fillRect(x - 2, y - 2, 4 + index % 4, 4 + index % 4);
      }
      this.marker.setAlpha(1 - progress).setScale(1 + progress * 0.65);
    } else {
      const dx = this.options.extractionX - this.terminalX;
      const dy = this.options.extractionY - this.terminalY;
      const x = this.terminalX + dx * progress;
      const y = this.terminalY + dy * progress;
      this.marker.setPosition(x, y).setScale(1 - progress * 0.72).setAlpha(1 - progress * 0.8);
      this.effectGraphics.lineStyle(4, 0xff496f, (1 - progress) * 0.82)
        .lineBetween(this.terminalX, this.terminalY, x, y);
      drawCornerBrackets(
        this.effectGraphics,
        18 + progress * 22,
        9,
        0xff496f,
        1 - progress,
        3,
        this.options.extractionX,
        this.options.extractionY
      );
    }
  }
}
