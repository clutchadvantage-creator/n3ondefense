import Phaser from 'phaser';
import type { Enemy } from '../../enemies/Enemy.ts';
import type {
  ArcadeEvent,
  ArcadeEventDefinition,
  ArcadeEventOutcome,
  ArcadeGameplayEvent,
  ArcadeRewardProfile,
  ArcadeRuntimeContext,
  ArcadeStopReason
} from '../types.ts';

const EXTRACTION_RADIUS = 42;
const THIEF_SPEED_MULTIPLIER = 1.72;
const SECONDARY_PROFILE: ArcadeRewardProfile = {
  kind: 'random-pool',
  options: [
    { kind: 'credits', weight: 34, baseAmount: 420, amountPerRound: 17 },
    { kind: 'plasma-chips', weight: 28, baseAmount: 4, amountPerRound: 0.14 },
    { kind: 'core-tokens', weight: 10, baseAmount: 1, amountPerRound: 0.035 },
    { kind: 'flux-cores', weight: 8, baseAmount: 1, amountPerRound: 0.012 },
    { kind: 'mod', weight: 20 }
  ]
};

export class PacketSnatcherEvent implements ArcadeEvent {
  readonly id = 'packet-snatcher' as const;
  private thief: Enemy | null = null;
  private marker: Phaser.GameObjects.Container | null = null;
  private extraction: Phaser.GameObjects.Container | null = null;
  private extractionPoint = { x: 0, y: 0 };
  private rewardOrigin = { x: 0, y: 0 };
  private startedAt = 0;
  private nextVisualAt = 0;
  private jukePhase = 0;
  private bonusMod = false;

  constructor(
    private readonly context: ArcadeRuntimeContext,
    private readonly definition: ArcadeEventDefinition
  ) {}

  start(activeElapsedMs: number): boolean {
    const spawn = this.context.findSpawnPoints(1, 330)[0];
    if (!spawn) return false;
    const extraction = this.context.findExtractionPoint(spawn.x, spawn.y);
    if (!extraction) return false;
    const thief = this.context.spawnEnemy({ type: 'disruptor', x: spawn.x, y: spawn.y });
    if (!thief) return false;
    this.startedAt = activeElapsedMs;
    this.thief = thief;
    this.extractionPoint = extraction;
    this.rewardOrigin = spawn;
    this.jukePhase = ((this.context.seed ^ 0x5a17c4) >>> 0) / 0x100000000 * Math.PI * 2;
    this.bonusMod = ((this.context.seed ^ Math.imul(this.context.round, 0x45d9f3b)) >>> 0) % 100 < 22;
    thief.hp *= 2.2;
    thief.setData('n3onArcadeEvent', this.id);
    thief.setData('arcadeMovementControlled', true);
    thief.setData('n3onArcadeSuppressBaseLoot', true);
    thief.setTint(0x54f5ff);

    const ring = this.context.scene.add.circle(0, 0, thief.hazardRadius + 15, 0x55efff, 0.07)
      .setStrokeStyle(2, 0xff5bcf, 0.92).setBlendMode(Phaser.BlendModes.ADD);
    const blocks = this.context.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2;
      blocks.fillStyle(index % 2 ? 0xff5bcf : 0x55efff, 0.85)
        .fillRect(Math.cos(angle) * 28 - 2, Math.sin(angle) * 28 - 2, 5, 5);
    }
    const tag = this.context.scene.add.text(0, -thief.hazardRadius - 25, 'DATA THIEF', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#a8fbff',
      stroke: '#02050b', strokeThickness: 4
    }).setOrigin(0.5);
    this.marker = this.context.scene.add.container(thief.x, thief.y, [ring, blocks, tag]).setDepth(14);

    const extractRing = this.context.scene.add.circle(0, 0, EXTRACTION_RADIUS, 0xff5bcf, 0.045)
      .setStrokeStyle(3, 0xff5bcf, 0.82).setBlendMode(Phaser.BlendModes.ADD);
    const extractText = this.context.scene.add.text(0, 0, 'EXTRACT', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#ff9de6',
      stroke: '#02050b', strokeThickness: 3
    }).setOrigin(0.5);
    this.extraction = this.context.scene.add.container(extraction.x, extraction.y, [extractRing, extractText]).setDepth(8.5);
    return true;
  }

  update(activeElapsedMs: number): ArcadeEventOutcome | null {
    const thief = this.thief;
    if (!thief || !thief.active || thief.isDead()) return null;
    const elapsed = activeElapsedMs - this.startedAt;
    if (elapsed >= this.definition.durationMs) return this.escape(activeElapsedMs);

    const toExtractX = this.extractionPoint.x - thief.x;
    const toExtractY = this.extractionPoint.y - thief.y;
    const distanceSquared = toExtractX * toExtractX + toExtractY * toExtractY;
    if (distanceSquared <= EXTRACTION_RADIUS * EXTRACTION_RADIUS) return this.escape(activeElapsedMs);
    const distance = Math.max(1, Math.sqrt(distanceSquared));
    const lateralX = -toExtractY / distance;
    const lateralY = toExtractX / distance;
    const juke = Math.sin(elapsed * 0.006 + this.jukePhase) * Math.min(42, distance * 0.15);
    const dash = Math.sin(elapsed * 0.013 + this.jukePhase) > 0.92 ? 1.22 : 1;
    this.context.navigateEventEnemy(
      thief,
      this.extractionPoint.x + lateralX * juke,
      this.extractionPoint.y + lateralY * juke,
      thief.stats.speed * THIEF_SPEED_MULTIPLIER * dash
    );

    if (activeElapsedMs >= this.nextVisualAt) {
      this.nextVisualAt = activeElapsedMs + 50;
      const pulse = 0.5 + Math.sin(activeElapsedMs * 0.014) * 0.5;
      this.marker?.setPosition(thief.x, thief.y).setRotation(activeElapsedMs * 0.0018).setAlpha(0.75 + pulse * 0.25);
      this.extraction?.setScale(0.96 + pulse * 0.08).setAlpha(0.6 + pulse * 0.4);
      thief.setTint(pulse > 0.82 ? 0xffffff : 0x54f5ff);
    }
    return null;
  }

  handleGameplayEvent(event: ArcadeGameplayEvent, activeElapsedMs: number): ArcadeEventOutcome | null {
    if (event.type !== 'enemy-killed' || event.enemy !== this.thief) return null;
    this.rewardOrigin = { x: event.enemy.x, y: event.enemy.y };
    this.context.emitMetric({
      name: 'packet_snatcher_destroyed', eventId: this.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt, success: true
    });
    return { success: true, reason: 'success' };
  }

  objectiveText(activeElapsedMs: number): string {
    const remaining = Math.max(0, this.definition.durationMs - (activeElapsedMs - this.startedAt));
    return `PACKET SNATCHER // INTERCEPT DATA THIEF // ${(remaining / 1000).toFixed(1)}s`;
  }

  rewardPlan() {
    return {
      origin: this.rewardOrigin,
      guaranteed: [
        { kind: 'mod' as const, amount: 1 },
        ...(this.bonusMod ? [{ kind: 'mod' as const, amount: 1 }] : [])
      ],
      rolls: 1,
      profile: SECONDARY_PROFILE
    };
  }

  cleanup(reason: ArcadeStopReason): void {
    const thief = this.thief;
    if (thief?.active) {
      thief.setData('arcadeMovementControlled', false);
      thief.setData('n3onArcadeEvent', null);
      if (reason !== 'success') this.context.removeEnemy(thief);
    }
    if (this.marker) this.context.scene.tweens.killTweensOf(this.marker);
    if (this.extraction) this.context.scene.tweens.killTweensOf(this.extraction);
    this.marker?.destroy(true);
    this.extraction?.destroy(true);
    this.marker = null;
    this.extraction = null;
    this.thief = null;
  }

  private escape(activeElapsedMs: number): ArcadeEventOutcome {
    this.context.emitMetric({
      name: 'packet_snatcher_escaped', eventId: this.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
      success: false, reason: 'failed'
    });
    return { success: false, reason: 'failed' };
  }
}
