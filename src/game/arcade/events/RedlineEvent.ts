import Phaser from 'phaser';
import { RedlineVisualController } from '../visuals/RedlineVisualController.ts';
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
const RUPTURE_HOLD_MS = 680;
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
  private visuals: RedlineVisualController | null = null;
  private startedAt = 0;
  private progressMs = 0;
  private stage = 0;
  private origin = { x: 0, y: 0 };
  private nextVisualAt = 0;
  private bonusRoll = false;
  private overloadAt = 0;
  private failureAt = 0;

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
    this.visuals = new RedlineVisualController(this.context.scene, {
      x: point.x,
      y: point.y,
      radius: ACTIVATION_RADIUS,
      particlesEnabled: this.context.particlesEnabled
    });
    this.context.playArcadeCue('redline-boot');
    return true;
  }

  update(activeElapsedMs: number, deltaMs: number): ArcadeEventOutcome | null {
    if (this.failureAt > 0) {
      this.refreshVisuals(activeElapsedMs, false, 0);
      return activeElapsedMs - this.failureAt >= RUPTURE_HOLD_MS
        ? { success: false, reason: 'timeout' }
        : null;
    }
    if (this.overloadAt > 0) {
      this.refreshVisuals(activeElapsedMs, true, 0);
      return activeElapsedMs - this.overloadAt >= RUPTURE_HOLD_MS
        ? { success: true, reason: 'success' }
        : null;
    }
    const remainingMs = Math.max(0, this.definition.durationMs - (activeElapsedMs - this.startedAt));
    if (remainingMs <= 0) {
      this.failureAt = activeElapsedMs;
      this.visuals?.beginFailure(activeElapsedMs);
      this.context.playArcadeCue('redline-failed');
      return null;
    }
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
      this.context.playArcadeCue('redline-stage');
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
      this.visuals?.beginSuccess(activeElapsedMs);
      this.context.playArcadeCue('redline-rupture');
      return null;
    }
    this.refreshVisuals(activeElapsedMs, inside, remainingMs);
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
    this.visuals?.destroy();
    this.visuals = null;
  }

  private refreshVisuals(activeElapsedMs: number, inside: boolean, remainingMs: number): void {
    if (activeElapsedMs < this.nextVisualAt) return;
    this.nextVisualAt = activeElapsedMs + 42;
    this.visuals?.update(
      activeElapsedMs,
      this.startedAt,
      Math.min(1, this.progressMs / REQUIRED_MS),
      this.stage,
      inside,
      remainingMs
    );
  }
}
