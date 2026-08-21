import Phaser from 'phaser';
import type { Enemy } from '../../enemies/Enemy.ts';
import type { EnemyType } from '../../types.ts';
import type {
  ArcadeEvent,
  ArcadeEventDefinition,
  ArcadeEventOutcome,
  ArcadeGameplayEvent,
  ArcadeRuntimeContext,
  ArcadeStopReason
} from '../types.ts';

const GOLDEN_TARGET_COUNT = 5;
const GOLD = 0xffd84f;
const GOLD_LIGHT = 0xfff3a0;

interface GoldenVisual {
  aura: Phaser.GameObjects.Arc;
  marker: Phaser.GameObjects.Text;
  phase: number;
}

export class GoldenHuntEvent implements ArcadeEvent {
  readonly id = 'golden-hunt' as const;
  private readonly targets = new Set<Enemy>();
  private readonly visuals = new Map<Enemy, GoldenVisual>();
  private readonly sparkles: Phaser.GameObjects.Graphics;
  private startedAt = 0;
  private killed = 0;
  private nextVisualUpdateAt = 0;

  constructor(
    private readonly context: ArcadeRuntimeContext,
    private readonly definition: ArcadeEventDefinition
  ) {
    this.sparkles = context.scene.add.graphics().setDepth(8.6).setBlendMode(Phaser.BlendModes.ADD);
  }

  start(activeElapsedMs: number): boolean {
    this.startedAt = activeElapsedMs;
    const points = this.context.findSpawnPoints(GOLDEN_TARGET_COUNT, 280);
    if (points.length < GOLDEN_TARGET_COUNT) return false;
    const unlocked: EnemyType[] = this.context.round >= 10
      ? ['grunt', 'shooter', 'tank', 'disruptor', 'grunt']
      : this.context.round >= 5
        ? ['grunt', 'shooter', 'grunt', 'tank', 'shooter']
        : ['grunt', 'shooter', 'grunt', 'shooter', 'grunt'];
    for (let index = 0; index < GOLDEN_TARGET_COUNT; index += 1) {
      const enemy = this.context.spawnEnemy({ type: unlocked[index], x: points[index].x, y: points[index].y });
      if (!enemy) {
        this.cleanup('failed');
        return false;
      }
      enemy.setData('n3onArcadeEvent', this.id);
      enemy.setTint(GOLD);
      const aura = this.context.scene.add.circle(enemy.x, enemy.y, enemy.hazardRadius + 11, GOLD, 0.08)
        .setStrokeStyle(2, GOLD_LIGHT, 0.9)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(6.8);
      const marker = this.context.scene.add.text(enemy.x, enemy.y - enemy.hazardRadius - 19, '◆', {
        fontFamily: 'Orbitron, sans-serif', fontSize: '15px', color: '#fff29a',
        stroke: '#5a3500', strokeThickness: 4
      }).setOrigin(0.5).setDepth(8.7);
      this.targets.add(enemy);
      this.visuals.set(enemy, { aura, marker, phase: index * 1.37 });
    }
    return this.targets.size === GOLDEN_TARGET_COUNT;
  }

  update(activeElapsedMs: number): ArcadeEventOutcome | null {
    if (activeElapsedMs - this.startedAt >= this.definition.durationMs) return { success: false, reason: 'timeout' };
    if (activeElapsedMs < this.nextVisualUpdateAt) return null;
    this.nextVisualUpdateAt = activeElapsedMs + 70;
    this.sparkles.clear();
    for (const enemy of this.targets) {
      if (!enemy.active || enemy.isDead()) continue;
      enemy.setTint(GOLD);
      const visual = this.visuals.get(enemy);
      if (!visual) continue;
      const pulse = 0.5 + Math.sin(activeElapsedMs * 0.008 + visual.phase) * 0.5;
      visual.aura.setPosition(enemy.x, enemy.y).setScale(0.94 + pulse * 0.15).setAlpha(0.1 + pulse * 0.16);
      visual.marker.setPosition(enemy.x, enemy.y - enemy.hazardRadius - 18 - pulse * 3).setAlpha(0.75 + pulse * 0.25);
      if (this.context.particlesEnabled) {
        for (let spark = 0; spark < 2; spark += 1) {
          const angle = visual.phase + activeElapsedMs * 0.0018 + spark * Math.PI;
          const radius = enemy.hazardRadius + 15 + spark * 4;
          this.sparkles.fillStyle(spark === 0 ? GOLD_LIGHT : GOLD, 0.55 + pulse * 0.35);
          this.sparkles.fillCircle(enemy.x + Math.cos(angle) * radius, enemy.y + Math.sin(angle) * radius, 1.4 + pulse);
        }
      }
    }
    return null;
  }

  handleGameplayEvent(event: ArcadeGameplayEvent, activeElapsedMs: number): ArcadeEventOutcome | null {
    if (event.type !== 'enemy-killed' || !this.targets.has(event.enemy)) return null;
    this.targets.delete(event.enemy);
    this.destroyVisual(event.enemy);
    this.killed += 1;
    this.context.emitMetric({
      name: 'golden_enemy_killed', eventId: this.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
      progress: this.killed, target: GOLDEN_TARGET_COUNT
    });
    if (this.killed < GOLDEN_TARGET_COUNT) return null;
    this.context.emitMetric({
      name: 'golden_hunt_completed', eventId: this.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
      progress: this.killed, target: GOLDEN_TARGET_COUNT, success: true
    });
    return { success: true, reason: 'success' };
  }

  objectiveText(activeElapsedMs: number): string {
    const remaining = Math.max(0, this.definition.durationMs - (activeElapsedMs - this.startedAt));
    return `GOLDEN HUNT  —  ${this.killed}/${GOLDEN_TARGET_COUNT}  —  ${(remaining / 1000).toFixed(1)}s`;
  }

  cleanup(reason: ArcadeStopReason): void {
    for (const enemy of this.targets) {
      this.destroyVisual(enemy);
      enemy.setData('n3onArcadeEvent', null);
      if (reason !== 'success') this.context.removeEnemy(enemy);
    }
    this.targets.clear();
    for (const enemy of this.visuals.keys()) this.destroyVisual(enemy);
    this.visuals.clear();
    this.sparkles.destroy();
  }

  private destroyVisual(enemy: Enemy): void {
    const visual = this.visuals.get(enemy);
    if (!visual) return;
    visual.aura.destroy();
    visual.marker.destroy();
    this.visuals.delete(enemy);
  }
}
