import { SeededRandom } from '../../systems/SeededRandom.ts';
import { HotPackageVisualController, type HotPackageQuality as PackageQuality } from '../visuals/HotPackageVisualController.ts';
import type {
  ArcadeEvent,
  ArcadeEventDefinition,
  ArcadeEventOutcome,
  ArcadeGameplayEvent,
  ArcadeRewardProfile,
  ArcadeRuntimeContext,
  ArcadeStopReason
} from '../types.ts';

const CAPTURE_MS = 5_000;
const CAPTURE_RADIUS = 112;
const LANDING_MS = 1_350;
const OPENING_HOLD_MS = 650;
const PACKAGE_CLEARANCE = 72;
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
  private visuals: HotPackageVisualController | null = null;
  private startedAt = 0;
  private landedAt = 0;
  private capturedMs = 0;
  private quality: PackageQuality = 'standard';
  private origin = { x: 0, y: 0 };
  private opened = false;
  private openedAt = 0;
  private completionMetricSent = false;
  private nextVisualAt = 0;
  private landedCueSent = false;
  private failureAt = 0;

  constructor(
    private readonly context: ArcadeRuntimeContext,
    private readonly definition: ArcadeEventDefinition
  ) {}

  start(activeElapsedMs: number): boolean {
    // The pod's dimensional crate/parachute footprint needs more room than a
    // normal event marker. Arena owns geometry, bombsite, and reachability
    // validation; this event only declares its presentation clearance.
    const point = this.context.findSpawnPoints(1, 250, PACKAGE_CLEARANCE)[0];
    if (!point) return false;
    this.startedAt = activeElapsedMs;
    this.landedAt = activeElapsedMs + LANDING_MS;
    this.origin = point;
    const random = new SeededRandom((this.context.seed ^ Math.imul(this.context.round, 0x7f4a7c15) ^ 0x50dca6e) >>> 0);
    const qualityRoll = random.next();
    this.quality = qualityRoll < 0.68 ? 'standard' : qualityRoll < 0.93 ? 'enhanced' : 'jackpot';
    const color = QUALITY_COLOR[this.quality];
    this.visuals = new HotPackageVisualController(this.context.scene, {
      x: point.x,
      y: point.y,
      radius: CAPTURE_RADIUS,
      landingMs: LANDING_MS,
      quality: this.quality,
      color,
      particlesEnabled: this.context.particlesEnabled
    }, activeElapsedMs);
    this.context.playArcadeCue('hot-package-inbound');
    return true;
  }

  update(activeElapsedMs: number, deltaMs: number): ArcadeEventOutcome | null {
    if (this.failureAt > 0) {
      this.refreshVisuals(activeElapsedMs, false, 0);
      return activeElapsedMs - this.failureAt >= OPENING_HOLD_MS
        ? { success: false, reason: 'timeout' }
        : null;
    }
    if (this.opened) {
      this.refreshVisuals(activeElapsedMs, true, 0);
      return activeElapsedMs - this.openedAt >= OPENING_HOLD_MS
        ? { success: true, reason: 'success' }
        : null;
    }
    const remainingMs = Math.max(0, this.definition.durationMs - (activeElapsedMs - this.startedAt));
    if (remainingMs <= 0) {
      this.failureAt = activeElapsedMs;
      this.visuals?.beginFailure(activeElapsedMs);
      this.context.playArcadeCue('hot-package-failed');
      return null;
    }
    if (activeElapsedMs >= this.landedAt && !this.landedCueSent) {
      this.landedCueSent = true;
      this.context.scene.cameras.main.shake(130, 0.0023);
      this.context.playArcadeCue('hot-package-impact');
    }
    if (activeElapsedMs < this.landedAt) {
      this.refreshVisuals(activeElapsedMs, false, remainingMs);
      return null;
    }
    const dx = this.context.player.x - this.origin.x;
    const dy = this.context.player.y - this.origin.y;
    const inside = dx * dx + dy * dy <= CAPTURE_RADIUS * CAPTURE_RADIUS;
    if (inside) this.capturedMs += Math.min(deltaMs, 250);
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
    this.refreshVisuals(activeElapsedMs, inside, remainingMs);
    return null;
  }

  private refreshVisuals(activeElapsedMs: number, inside: boolean, remainingMs: number): void {
    if (activeElapsedMs < this.nextVisualAt) return;
    this.nextVisualAt = activeElapsedMs + 42;
    this.visuals?.update(
      activeElapsedMs,
      this.startedAt,
      Math.min(1, this.capturedMs / CAPTURE_MS),
      inside,
      remainingMs
    );
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
    this.visuals?.destroy();
    this.visuals = null;
  }

  private openPod(): void {
    if (this.opened) return;
    this.opened = true;
    this.visuals?.beginSuccess(this.openedAt);
    this.context.playArcadeCue('hot-package-open');
    this.context.scene.cameras.main.flash(120, 80, 240, 255, false);
  }
}
