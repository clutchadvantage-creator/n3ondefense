import Phaser from 'phaser';
import type {
  ArcadeEvent,
  ArcadeEventDefinition,
  ArcadeEventOutcome,
  ArcadeGameplayEvent,
  ArcadeRuntimeContext,
  ArcadeStopReason
} from '../types.ts';

export const NEON_CIRCUIT_CHECKPOINT_COUNT = 5;
const GATE_HALF_WIDTH = 68;
const GATE_TRIGGER_HALF_DEPTH = 24;
const GATE_POST_DEPTH = 42;
const CHECKER_COLUMNS = 10;
const CHECKER_ROWS = 2;

interface CircuitGate {
  root: Phaser.GameObjects.Container;
  gatePlane: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  checkers: Phaser.GameObjects.Graphics;
  banner: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
  forwardX: number;
  forwardY: number;
}

/**
 * A lightweight, render-only gate course. Gates never receive physics bodies;
 * the ordered pass-through test uses the player's previous and current points
 * so a fast frame cannot tunnel across a thin finish line.
 */
export class NeonCircuitEvent implements ArcadeEvent {
  readonly id = 'neon-circuit' as const;
  private readonly markers: CircuitGate[] = [];
  private startedAt = 0;
  private current = 0;
  private nextVisualUpdateAt = 0;
  private previousPlayerX = 0;
  private previousPlayerY = 0;

  constructor(
    private readonly context: ArcadeRuntimeContext,
    private readonly definition: ArcadeEventDefinition
  ) {}

  start(activeElapsedMs: number): boolean {
    this.startedAt = activeElapsedMs;
    this.previousPlayerX = this.context.player.x;
    this.previousPlayerY = this.context.player.y;
    const points = this.context.findCheckpointPoints(NEON_CIRCUIT_CHECKPOINT_COUNT);
    if (points.length < NEON_CIRCUIT_CHECKPOINT_COUNT) return false;

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const previous = index === 0
        ? { x: this.context.player.x, y: this.context.player.y }
        : points[index - 1];
      const next = points[index + 1] ?? previous;
      let forwardX = point.x - previous.x;
      let forwardY = point.y - previous.y;
      let length = Math.hypot(forwardX, forwardY);
      if (length < 0.001) {
        forwardX = next.x - point.x;
        forwardY = next.y - point.y;
        length = Math.max(0.001, Math.hypot(forwardX, forwardY));
      }
      forwardX /= length;
      forwardY /= length;

      const frame = this.context.scene.add.graphics();
      this.drawGateFrame(frame, index === 0);
      const checkers = this.context.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      this.drawCheckeredFinish(checkers, index === 0);
      const gatePlane = this.context.scene.add.container(0, 0, [frame, checkers])
        .setRotation(Math.atan2(forwardY, forwardX) - Math.PI * 0.5);

      const banner = this.context.scene.add.rectangle(0, -58, 104, 27, 0x071925, 0.96)
        .setStrokeStyle(index === 0 ? 2 : 1, index === 0 ? 0x4ef9ff : 0x55778a, index === 0 ? 0.94 : 0.45);
      const label = this.context.scene.add.text(0, -58, `GATE ${index + 1}`, {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: index === 0 ? '#ffffff' : '#648395',
        stroke: '#02050b',
        strokeThickness: 4
      }).setOrigin(0.5);
      const root = this.context.scene.add.container(point.x, point.y, [gatePlane, banner, label]).setDepth(8.4);
      this.markers.push({ root, gatePlane, frame, checkers, banner, label, x: point.x, y: point.y, forwardX, forwardY });
    }
    return true;
  }

  update(activeElapsedMs: number): ArcadeEventOutcome | null {
    if (activeElapsedMs - this.startedAt >= this.definition.durationMs) return { success: false, reason: 'timeout' };
    const target = this.markers[this.current];
    if (!target) return { success: true, reason: 'success' };

    const playerX = this.context.player.x;
    const playerY = this.context.player.y;
    if (this.didPlayerPassGate(target, playerX, playerY)) {
      this.activateCheckpoint(activeElapsedMs, target);
      if (this.current >= this.markers.length) {
        this.context.emitMetric({
          name: 'neon_circuit_completed', eventId: this.id, round: this.context.round,
          protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
          progress: this.current, target: this.markers.length, success: true
        });
        return { success: true, reason: 'success' };
      }
    }
    this.previousPlayerX = playerX;
    this.previousPlayerY = playerY;

    if (activeElapsedMs >= this.nextVisualUpdateAt) {
      this.nextVisualUpdateAt = activeElapsedMs + 55;
      this.refreshMarkerPresentation(activeElapsedMs);
    }
    return null;
  }

  handleGameplayEvent(_event: ArcadeGameplayEvent): ArcadeEventOutcome | null {
    return null;
  }

  objectiveText(activeElapsedMs: number): string {
    const remaining = Math.max(0, this.definition.durationMs - (activeElapsedMs - this.startedAt));
    return `NEON CIRCUIT // GATE ${Math.min(this.current + 1, this.markers.length || NEON_CIRCUIT_CHECKPOINT_COUNT)}/${this.markers.length || NEON_CIRCUIT_CHECKPOINT_COUNT} // ${(remaining / 1000).toFixed(1)}s`;
  }

  cleanup(_reason: ArcadeStopReason): void {
    for (const marker of this.markers) {
      this.context.scene.tweens.killTweensOf(marker.root);
      marker.root.destroy(true);
    }
    this.markers.length = 0;
  }

  private drawGateFrame(graphics: Phaser.GameObjects.Graphics, active: boolean): void {
    const cyan = active ? 0x4ef9ff : 0x55778a;
    const magenta = active ? 0xff5bd6 : 0x513c5d;
    graphics.fillStyle(0x02070d, 0.8).fillRoundedRect(-GATE_HALF_WIDTH - 11, -GATE_POST_DEPTH, 20, GATE_POST_DEPTH * 2, 5);
    graphics.fillStyle(0x02070d, 0.8).fillRoundedRect(GATE_HALF_WIDTH - 9, -GATE_POST_DEPTH, 20, GATE_POST_DEPTH * 2, 5);
    graphics.lineStyle(active ? 3 : 2, cyan, active ? 0.95 : 0.42)
      .strokeRoundedRect(-GATE_HALF_WIDTH - 11, -GATE_POST_DEPTH, 20, GATE_POST_DEPTH * 2, 5);
    graphics.lineStyle(active ? 3 : 2, magenta, active ? 0.9 : 0.38)
      .strokeRoundedRect(GATE_HALF_WIDTH - 9, -GATE_POST_DEPTH, 20, GATE_POST_DEPTH * 2, 5);
    graphics.fillStyle(cyan, active ? 0.78 : 0.3).fillCircle(-GATE_HALF_WIDTH - 1, -GATE_POST_DEPTH + 7, 4);
    graphics.fillStyle(magenta, active ? 0.76 : 0.28).fillCircle(GATE_HALF_WIDTH + 1, -GATE_POST_DEPTH + 7, 4);
    graphics.lineStyle(1, cyan, active ? 0.4 : 0.16).lineBetween(-GATE_HALF_WIDTH + 10, -18, GATE_HALF_WIDTH - 10, -18);
    graphics.lineStyle(1, magenta, active ? 0.38 : 0.14).lineBetween(-GATE_HALF_WIDTH + 10, 18, GATE_HALF_WIDTH - 10, 18);
  }

  private drawCheckeredFinish(graphics: Phaser.GameObjects.Graphics, active: boolean): void {
    const stripWidth = (GATE_HALF_WIDTH - 11) * 2;
    const tileWidth = stripWidth / CHECKER_COLUMNS;
    const tileHeight = 8;
    const left = -stripWidth * 0.5;
    for (let row = 0; row < CHECKER_ROWS; row += 1) {
      for (let column = 0; column < CHECKER_COLUMNS; column += 1) {
        const bright = (row + column) % 2 === 0;
        const color = bright ? (active ? 0xf4feff : 0x71858d) : (active ? 0x12232e : 0x091117);
        graphics.fillStyle(color, active ? 0.92 : 0.5)
          .fillRect(left + column * tileWidth, -tileHeight + row * tileHeight, tileWidth + 0.5, tileHeight + 0.5);
      }
    }
    graphics.lineStyle(2, active ? 0x4ef9ff : 0x55778a, active ? 0.9 : 0.34)
      .strokeRect(left, -tileHeight, stripWidth, tileHeight * CHECKER_ROWS);
  }

  private didPlayerPassGate(marker: CircuitGate, playerX: number, playerY: number): boolean {
    const currentX = playerX - marker.x;
    const currentY = playerY - marker.y;
    const previousX = this.previousPlayerX - marker.x;
    const previousY = this.previousPlayerY - marker.y;
    const acrossX = -marker.forwardY;
    const acrossY = marker.forwardX;
    const currentForward = currentX * marker.forwardX + currentY * marker.forwardY;
    const currentAcross = currentX * acrossX + currentY * acrossY;
    if (Math.abs(currentForward) <= GATE_TRIGGER_HALF_DEPTH && Math.abs(currentAcross) <= GATE_HALF_WIDTH) return true;

    const previousForward = previousX * marker.forwardX + previousY * marker.forwardY;
    if ((previousForward < 0) === (currentForward < 0)) return false;
    const denominator = previousForward - currentForward;
    if (Math.abs(denominator) < 0.0001) return false;
    const crossingRatio = previousForward / denominator;
    const previousAcross = previousX * acrossX + previousY * acrossY;
    const crossingAcross = previousAcross + (currentAcross - previousAcross) * crossingRatio;
    return crossingRatio >= 0 && crossingRatio <= 1 && Math.abs(crossingAcross) <= GATE_HALF_WIDTH;
  }

  private activateCheckpoint(activeElapsedMs: number, marker: CircuitGate): void {
    this.current += 1;
    this.context.emitMetric({
      name: 'neon_checkpoint_reached', eventId: this.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
      progress: this.current, target: this.markers.length
    });
    marker.banner.setFillStyle(0x123b2b, 0.97).setStrokeStyle(2, 0x7dffb2, 1);
    marker.label.setText('GATE CLEAR').setColor('#8fffc0');
    this.context.scene.tweens.add({
      targets: marker.root, alpha: 0, scaleX: 1.28, scaleY: 1.28,
      duration: 230, ease: 'Quad.easeOut'
    });
    const next = this.markers[this.current];
    if (next) {
      next.frame.clear();
      next.checkers.clear();
      this.drawGateFrame(next.frame, true);
      this.drawCheckeredFinish(next.checkers, true);
      next.root.setAlpha(1);
      next.gatePlane.setAlpha(1);
      next.banner.setFillStyle(0x071925, 0.96).setStrokeStyle(2, 0x4ef9ff, 0.94);
      next.label.setColor('#ffffff');
    }
  }

  private refreshMarkerPresentation(activeElapsedMs: number): void {
    for (let index = this.current; index < this.markers.length; index += 1) {
      const marker = this.markers[index];
      const active = index === this.current;
      const pulse = 0.5 + Math.sin(activeElapsedMs * 0.009 + index * 0.8) * 0.5;
      marker.root.setScale(active ? 0.98 + pulse * 0.05 : 1).setAlpha(active ? 0.82 + pulse * 0.18 : 0.38);
      marker.gatePlane.setAlpha(active ? 0.78 + pulse * 0.22 : 0.52);
    }
  }
}
