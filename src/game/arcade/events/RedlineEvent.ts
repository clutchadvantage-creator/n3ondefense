import Phaser from 'phaser';
import type {
  ArcadeEvent,
  ArcadeEventDefinition,
  ArcadeEventOutcome,
  ArcadeGameplayEvent,
  ArcadeRewardProfile,
  ArcadeRuntimeContext,
  ArcadeStopReason
} from '../types.ts';

const ACTIVATION_RADIUS = 118;
const REQUIRED_MS = 9_000;
const DECAY_RATE = 0.24;
const RUPTURE_HOLD_MS = 420;
const REDLINE_REWARDS: ArcadeRewardProfile = {
  kind: 'random-pool',
  options: [
    { kind: 'credits', weight: 32, baseAmount: 330, amountPerRound: 14 },
    { kind: 'core-tokens', weight: 14, baseAmount: 2, amountPerRound: 0.04 },
    { kind: 'flux-cores', weight: 13, baseAmount: 1, amountPerRound: 0.018 },
    { kind: 'plasma-chips', weight: 16, baseAmount: 4, amountPerRound: 0.12 },
    { kind: 'mod', weight: 13 },
    { kind: 'grenade-rounds', weight: 6 },
    { kind: 'scattershot-rounds', weight: 6 }
  ]
};

export class RedlineEvent implements ArcadeEvent {
  readonly id = 'redline' as const;
  private root: Phaser.GameObjects.Container | null = null;
  private zone: Phaser.GameObjects.Arc | null = null;
  private core: Phaser.GameObjects.Polygon | null = null;
  private arcs: Phaser.GameObjects.Graphics | null = null;
  private startedAt = 0;
  private progressMs = 0;
  private stage = 0;
  private origin = { x: 0, y: 0 };
  private nextVisualAt = 0;
  private bonusRoll = false;
  private overloadAt = 0;

  constructor(
    private readonly context: ArcadeRuntimeContext,
    private readonly definition: ArcadeEventDefinition
  ) {}

  start(activeElapsedMs: number): boolean {
    const point = this.context.findSpawnPoints(1, 230)[0];
    if (!point) return false;
    this.startedAt = activeElapsedMs;
    this.origin = point;
    this.bonusRoll = ((this.context.seed ^ Math.imul(this.context.round, 0x9e3779b1) ^ 0x6ed11e) >>> 0) % 100 < 28;
    this.zone = this.context.scene.add.circle(0, 0, ACTIVATION_RADIUS, 0x48efff, 0.035)
      .setStrokeStyle(3, 0x48efff, 0.72).setBlendMode(Phaser.BlendModes.ADD);
    const base = this.context.scene.add.polygon(0, 16, [-35, -13, -20, -29, 20, -29, 35, -13, 31, 13, -31, 13], 0x07121b, 0.98)
      .setStrokeStyle(2, 0xff4cbe, 0.88);
    this.core = this.context.scene.add.polygon(0, -9, [0, -24, 17, -8, 12, 18, -12, 18, -17, -8], 0x48efff, 0.38)
      .setStrokeStyle(2, 0xffffff, 0.88).setBlendMode(Phaser.BlendModes.ADD);
    this.arcs = this.context.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const label = this.context.scene.add.text(0, 48, 'SYSTEM OVERRIDE', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#8cf8ff',
      stroke: '#02050b', strokeThickness: 4
    }).setOrigin(0.5);
    this.root = this.context.scene.add.container(point.x, point.y, [this.zone, base, this.core, this.arcs, label]).setDepth(12);
    return true;
  }

  update(activeElapsedMs: number, deltaMs: number): ArcadeEventOutcome | null {
    if (this.overloadAt > 0) {
      if (activeElapsedMs >= this.nextVisualAt) {
        this.nextVisualAt = activeElapsedMs + 36;
        this.drawVisuals(activeElapsedMs, true);
      }
      return activeElapsedMs - this.overloadAt >= RUPTURE_HOLD_MS
        ? { success: true, reason: 'success' }
        : null;
    }
    if (activeElapsedMs - this.startedAt >= this.definition.durationMs) return { success: false, reason: 'timeout' };
    const dx = this.context.player.x - this.origin.x;
    const dy = this.context.player.y - this.origin.y;
    const inside = dx * dx + dy * dy <= ACTIVATION_RADIUS * ACTIVATION_RADIUS;
    this.progressMs = Phaser.Math.Clamp(
      this.progressMs + (inside ? Math.min(deltaMs, 250) : -Math.min(deltaMs, 250) * DECAY_RATE),
      0,
      REQUIRED_MS
    );
    const nextStage = this.progressMs >= REQUIRED_MS ? 3 : this.progressMs >= REQUIRED_MS * 0.66 ? 2 : this.progressMs >= REQUIRED_MS * 0.33 ? 1 : 0;
    if (nextStage > this.stage) {
      this.stage = nextStage;
      this.context.emitMetric({
        name: 'redline_stage_reached', eventId: this.id, round: this.context.round,
        protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
        progress: this.stage, target: 3
      });
      this.context.scene.cameras.main.flash(75, 40 + this.stage * 20, 170, 230, false);
    }
    if (this.progressMs >= REQUIRED_MS) {
      this.overloadAt = activeElapsedMs;
      this.context.emitMetric({
        name: 'redline_completed', eventId: this.id, round: this.context.round,
        protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
        progress: 3, target: 3, success: true
      });
      this.context.scene.cameras.main.shake(170, 0.0032);
      this.context.scene.cameras.main.flash(120, 70, 210, 255, false);
      if (this.core) this.context.scene.tweens.add({ targets: this.core, scaleX: 0.34, scaleY: 0.34, duration: RUPTURE_HOLD_MS, ease: 'Cubic.easeIn' });
      return null;
    }
    if (activeElapsedMs >= this.nextVisualAt) {
      this.nextVisualAt = activeElapsedMs + 52;
      this.drawVisuals(activeElapsedMs, inside);
    }
    return null;
  }

  handleGameplayEvent(_event: ArcadeGameplayEvent): ArcadeEventOutcome | null { return null; }

  objectiveText(activeElapsedMs: number): string {
    if (this.overloadAt > 0) return 'REDLINE // CRITICAL RUPTURE';
    const remaining = Math.max(0, this.definition.durationMs - (activeElapsedMs - this.startedAt));
    return `REDLINE // OVERLOAD ${Math.round(this.progressMs / REQUIRED_MS * 100)}% // ${(remaining / 1000).toFixed(1)}s`;
  }

  rewardPlan() {
    return { origin: this.origin, rolls: this.bonusRoll ? 3 : 2, profile: REDLINE_REWARDS };
  }

  cleanup(_reason: ArcadeStopReason): void {
    if (this.root) this.context.scene.tweens.killTweensOf([this.root, this.zone, this.core]);
    this.root?.destroy(true);
    this.root = null;
    this.zone = null;
    this.core = null;
    this.arcs = null;
  }

  private drawVisuals(activeElapsedMs: number, inside: boolean): void {
    const intensity = this.progressMs / REQUIRED_MS;
    const color = intensity > 0.66 ? 0xff4cbe : intensity > 0.33 ? 0xaa65ff : 0x48efff;
    const pulse = 0.5 + Math.sin(activeElapsedMs * (0.009 + intensity * 0.012)) * 0.5;
    this.zone?.setStrokeStyle(2 + this.stage, color, 0.58 + pulse * 0.36)
      .setFillStyle(color, 0.025 + intensity * 0.055).setScale(0.98 + pulse * 0.035);
    this.core?.setFillStyle(color, 0.28 + pulse * 0.5).setScale(0.9 + pulse * (0.12 + intensity * 0.1));
    this.arcs?.clear();
    this.arcs?.lineStyle(1 + this.stage * 0.5, color, 0.58 + intensity * 0.35);
    const arcCount = 3 + this.stage * 2;
    for (let index = 0; index < arcCount; index += 1) {
      const angle = activeElapsedMs * 0.0024 * (index % 2 ? -1 : 1) + index * Math.PI * 2 / arcCount;
      const radius = 31 + index % 3 * 9;
      this.arcs?.lineBetween(
        Math.cos(angle) * 18, Math.sin(angle) * 18 - 7,
        Math.cos(angle + (inside ? 0.18 : 0.08)) * radius, Math.sin(angle + (inside ? 0.18 : 0.08)) * radius - 7
      );
    }
  }
}
