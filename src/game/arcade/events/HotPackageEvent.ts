import Phaser from 'phaser';
import { SeededRandom } from '../../systems/SeededRandom.ts';
import type {
  ArcadeEvent,
  ArcadeEventDefinition,
  ArcadeEventOutcome,
  ArcadeGameplayEvent,
  ArcadeRewardProfile,
  ArcadeRuntimeContext,
  ArcadeStopReason
} from '../types.ts';

type PackageQuality = 'standard' | 'enhanced' | 'jackpot';

const CAPTURE_MS = 5_000;
const CAPTURE_RADIUS = 112;
const LANDING_MS = 1_350;
const OPENING_HOLD_MS = 360;
const QUALITY_COLOR: Record<PackageQuality, number> = {
  standard: 0x55efff,
  enhanced: 0xb55cff,
  jackpot: 0xffd65a
};
const QUALITY_ROLLS: Record<PackageQuality, number> = { standard: 2, enhanced: 3, jackpot: 5 };

const rewardProfile = (quality: PackageQuality): ArcadeRewardProfile => {
  const improved = quality === 'enhanced';
  const jackpot = quality === 'jackpot';
  return {
    kind: 'random-pool',
    options: [
      { kind: 'credits', weight: jackpot ? 25 : 34, baseAmount: jackpot ? 420 : improved ? 300 : 220, amountPerRound: jackpot ? 16 : 10 },
      { kind: 'core-tokens', weight: jackpot ? 18 : 12, baseAmount: jackpot ? 3 : 1, amountPerRound: 0.04 },
      { kind: 'flux-cores', weight: jackpot ? 15 : 9, baseAmount: jackpot ? 2 : 1, amountPerRound: 0.015 },
      { kind: 'plasma-chips', weight: jackpot ? 16 : 13, baseAmount: jackpot ? 5 : 3, amountPerRound: 0.1 },
      { kind: 'mod', weight: jackpot ? 16 : improved ? 12 : 6 },
      { kind: 'grenade-rounds', weight: 6 },
      { kind: 'scattershot-rounds', weight: 6 }
    ]
  };
};

export class HotPackageEvent implements ArcadeEvent {
  readonly id = 'hot-package' as const;
  private root: Phaser.GameObjects.Container | null = null;
  private zone: Phaser.GameObjects.Arc | null = null;
  private pod: Phaser.GameObjects.Container | null = null;
  private doors: Phaser.GameObjects.Rectangle[] = [];
  private startedAt = 0;
  private landedAt = 0;
  private capturedMs = 0;
  private quality: PackageQuality = 'standard';
  private origin = { x: 0, y: 0 };
  private opened = false;
  private openedAt = 0;
  private completionMetricSent = false;
  private nextVisualAt = 0;

  constructor(
    private readonly context: ArcadeRuntimeContext,
    private readonly definition: ArcadeEventDefinition
  ) {}

  start(activeElapsedMs: number): boolean {
    const point = this.context.findSpawnPoints(1, 250)[0];
    if (!point) return false;
    this.startedAt = activeElapsedMs;
    this.landedAt = activeElapsedMs + LANDING_MS;
    this.origin = point;
    const random = new SeededRandom((this.context.seed ^ Math.imul(this.context.round, 0x7f4a7c15) ^ 0x50dca6e) >>> 0);
    const qualityRoll = random.next();
    this.quality = qualityRoll < 0.68 ? 'standard' : qualityRoll < 0.93 ? 'enhanced' : 'jackpot';
    const color = QUALITY_COLOR[this.quality];

    this.zone = this.context.scene.add.circle(0, 0, CAPTURE_RADIUS, color, 0.035)
      .setStrokeStyle(3, color, 0.82)
      .setBlendMode(Phaser.BlendModes.ADD);
    const reticle = this.context.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    reticle.lineStyle(2, color, 0.72);
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI / 6;
      reticle.lineBetween(Math.cos(angle) * 88, Math.sin(angle) * 88, Math.cos(angle) * 108, Math.sin(angle) * 108);
    }
    const shadow = this.context.scene.add.ellipse(0, 15, 84, 30, 0x000000, 0.65);
    const shell = this.context.scene.add.polygon(0, 0, [-38, -31, 26, -31, 39, -16, 39, 29, -39, 29, -39, -16], 0x07131d, 0.99)
      .setStrokeStyle(3, color, 0.95);
    const window = this.context.scene.add.rectangle(0, -10, 47, 18, color, 0.13).setStrokeStyle(1, 0xffffff, 0.6);
    const leftDoor = this.context.scene.add.rectangle(-15, 13, 27, 20, 0x101f29, 1).setStrokeStyle(1, color, 0.8);
    const rightDoor = this.context.scene.add.rectangle(15, 13, 27, 20, 0x101f29, 1).setStrokeStyle(1, color, 0.8);
    const quality = this.context.scene.add.text(0, -49, `${this.quality.toUpperCase()} PACKAGE`, {
      fontFamily: 'Orbitron, sans-serif', fontSize: '12px', fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(color).rgba, stroke: '#02050b', strokeThickness: 4
    }).setOrigin(0.5);
    this.pod = this.context.scene.add.container(0, -290, [shadow, shell, window, leftDoor, rightDoor, quality]);
    this.doors = [leftDoor, rightDoor];
    this.root = this.context.scene.add.container(point.x, point.y, [this.zone, reticle, this.pod]).setDepth(13);
    this.context.scene.tweens.add({
      targets: this.pod, y: 0, duration: LANDING_MS, ease: 'Cubic.easeIn',
      onComplete: () => {
        if (!this.root?.active) return;
        this.context.scene.cameras.main.shake(130, 0.0023);
        this.context.scene.tweens.add({ targets: this.zone, scaleX: 1.22, scaleY: 1.22, alpha: 0.12, duration: 180, yoyo: true });
      }
    });
    return true;
  }

  update(activeElapsedMs: number, deltaMs: number): ArcadeEventOutcome | null {
    if (this.opened) {
      return activeElapsedMs - this.openedAt >= OPENING_HOLD_MS
        ? { success: true, reason: 'success' }
        : null;
    }
    if (activeElapsedMs - this.startedAt >= this.definition.durationMs) return { success: false, reason: 'timeout' };
    if (activeElapsedMs < this.landedAt) return null;
    const dx = this.context.player.x - this.origin.x;
    const dy = this.context.player.y - this.origin.y;
    if (dx * dx + dy * dy <= CAPTURE_RADIUS * CAPTURE_RADIUS) this.capturedMs += Math.min(deltaMs, 250);
    if (this.capturedMs >= CAPTURE_MS) {
      if (!this.opened) {
        this.openedAt = activeElapsedMs;
        this.openPod();
      }
      if (!this.completionMetricSent) {
        this.completionMetricSent = true;
        this.context.emitMetric({
          name: 'hot_package_secured', eventId: this.id, round: this.context.round,
          protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
          progress: CAPTURE_MS, target: CAPTURE_MS, success: true
        });
      }
      return null;
    }
    if (activeElapsedMs >= this.nextVisualAt) {
      this.nextVisualAt = activeElapsedMs + 55;
      const pulse = 0.5 + Math.sin(activeElapsedMs * 0.009) * 0.5;
      this.zone?.setAlpha(0.035 + pulse * 0.075).setScale(0.98 + pulse * 0.04);
      this.pod?.setScale(0.98 + pulse * 0.025);
    }
    return null;
  }

  handleGameplayEvent(_event: ArcadeGameplayEvent): ArcadeEventOutcome | null { return null; }

  objectiveText(activeElapsedMs: number): string {
    const remaining = Math.max(0, this.definition.durationMs - (activeElapsedMs - this.startedAt));
    if (activeElapsedMs < this.landedAt) return `HOT PACKAGE // INBOUND // ${(remaining / 1000).toFixed(1)}s`;
    if (this.opened) return 'HOT PACKAGE // CRACKING SUPPLY POD';
    return `HOT PACKAGE // SECURE ${Math.min(100, Math.round(this.capturedMs / CAPTURE_MS * 100))}% // ${(remaining / 1000).toFixed(1)}s`;
  }

  rewardPlan() {
    return { origin: this.origin, rolls: QUALITY_ROLLS[this.quality], profile: rewardProfile(this.quality) };
  }

  cleanup(_reason: ArcadeStopReason): void {
    if (this.root) this.context.scene.tweens.killTweensOf([this.root, this.pod, this.zone, ...this.doors]);
    this.root?.destroy(true);
    this.root = null;
    this.pod = null;
    this.zone = null;
    this.doors = [];
  }

  private openPod(): void {
    if (this.opened) return;
    this.opened = true;
    const [left, right] = this.doors;
    if (left) this.context.scene.tweens.add({ targets: left, x: -34, rotation: -0.3, duration: 180, ease: 'Back.easeOut' });
    if (right) this.context.scene.tweens.add({ targets: right, x: 34, rotation: 0.3, duration: 180, ease: 'Back.easeOut' });
    this.context.scene.cameras.main.flash(120, 80, 240, 255, false);
  }
}
