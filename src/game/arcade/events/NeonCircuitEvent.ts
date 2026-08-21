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
const CHECKPOINT_RADIUS = 42;

interface CircuitMarker {
  root: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  beacon: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
}

export class NeonCircuitEvent implements ArcadeEvent {
  readonly id = 'neon-circuit' as const;
  private readonly markers: CircuitMarker[] = [];
  private startedAt = 0;
  private current = 0;
  private nextVisualUpdateAt = 0;

  constructor(
    private readonly context: ArcadeRuntimeContext,
    private readonly definition: ArcadeEventDefinition
  ) {}

  start(activeElapsedMs: number): boolean {
    this.startedAt = activeElapsedMs;
    const points = this.context.findCheckpointPoints(NEON_CIRCUIT_CHECKPOINT_COUNT);
    if (points.length < NEON_CIRCUIT_CHECKPOINT_COUNT) return false;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const ring = this.context.scene.add.circle(0, 0, CHECKPOINT_RADIUS, 0x4ef9ff, index === 0 ? 0.13 : 0.035)
        .setStrokeStyle(index === 0 ? 4 : 2, index === 0 ? 0x4ef9ff : 0x55778a, index === 0 ? 1 : 0.42)
        .setBlendMode(Phaser.BlendModes.ADD);
      const beacon = this.context.scene.add.rectangle(0, -78, index === 0 ? 7 : 4, 145, index === 0 ? 0x4ef9ff : 0x426776, index === 0 ? 0.22 : 0.08)
        .setOrigin(0.5, 1)
        .setBlendMode(Phaser.BlendModes.ADD);
      const label = this.context.scene.add.text(0, -8, `${index + 1}`, {
        fontFamily: 'Orbitron, sans-serif', fontSize: '15px', fontStyle: 'bold',
        color: index === 0 ? '#ffffff' : '#648395', stroke: '#02050b', strokeThickness: 4
      }).setOrigin(0.5);
      const root = this.context.scene.add.container(point.x, point.y, [beacon, ring, label]).setDepth(8.4);
      this.markers.push({ root, ring, beacon, label, x: point.x, y: point.y });
    }
    return true;
  }

  update(activeElapsedMs: number): ArcadeEventOutcome | null {
    if (activeElapsedMs - this.startedAt >= this.definition.durationMs) return { success: false, reason: 'timeout' };
    const target = this.markers[this.current];
    if (!target) return { success: true, reason: 'success' };
    const dx = this.context.player.x - target.x;
    const dy = this.context.player.y - target.y;
    if (dx * dx + dy * dy <= CHECKPOINT_RADIUS * CHECKPOINT_RADIUS) {
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
    return `NEON CIRCUIT  —  ${this.current}/${this.markers.length || NEON_CIRCUIT_CHECKPOINT_COUNT}  —  ${(remaining / 1000).toFixed(1)}s`;
  }

  cleanup(_reason: ArcadeStopReason): void {
    for (const marker of this.markers) {
      this.context.scene.tweens.killTweensOf(marker.root);
      marker.root.destroy(true);
    }
    this.markers.length = 0;
  }

  private activateCheckpoint(activeElapsedMs: number, marker: CircuitMarker): void {
    this.current += 1;
    this.context.emitMetric({
      name: 'neon_checkpoint_reached', eventId: this.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
      progress: this.current, target: this.markers.length
    });
    marker.ring.setFillStyle(0x7dffb2, 0.22).setStrokeStyle(4, 0x7dffb2, 1);
    marker.label.setText('✓').setColor('#8fffc0');
    marker.beacon.setFillStyle(0x7dffb2, 0.22);
    this.context.scene.tweens.add({
      targets: marker.root, alpha: 0, scaleX: 1.45, scaleY: 1.45,
      duration: 230, ease: 'Quad.easeOut'
    });
    const next = this.markers[this.current];
    if (next) {
      next.ring.setFillStyle(0x4ef9ff, 0.13).setStrokeStyle(4, 0x4ef9ff, 1);
      next.beacon.setFillStyle(0x4ef9ff, 0.22).setDisplaySize(7, 145);
      next.label.setColor('#ffffff');
    }
  }

  private refreshMarkerPresentation(activeElapsedMs: number): void {
    for (let index = this.current; index < this.markers.length; index += 1) {
      const marker = this.markers[index];
      const active = index === this.current;
      const pulse = 0.5 + Math.sin(activeElapsedMs * 0.009 + index * 0.8) * 0.5;
      marker.ring.setScale(active ? 0.94 + pulse * 0.16 : 0.97 + pulse * 0.04)
        .setAlpha(active ? 0.72 + pulse * 0.28 : 0.36);
      marker.beacon.setAlpha(active ? 0.13 + pulse * 0.18 : 0.06);
    }
  }
}
