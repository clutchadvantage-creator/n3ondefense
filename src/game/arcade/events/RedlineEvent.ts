import { RedlineVisualController } from '../visuals/RedlineVisualController.ts';
import { RedlineMomentum, REDLINE_REWARD_TIERS, REDLINE_STATES, type RedlineResult } from './RedlineMomentum.ts';
import { DRONE_VARIANTS } from '../../enemies/drone/DroneFlight.ts';
import type { Enemy } from '../../enemies/Enemy.ts';
import type { ArcadeEvent, ArcadeEventDefinition, ArcadeEventOutcome, ArcadeGameplayEvent, ArcadeRewardProfile, ArcadeRuntimeContext, ArcadeStopReason } from '../types.ts';
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
  readonly momentum = new RedlineMomentum();
  private visuals: RedlineVisualController | null = null;
  private readonly owned = new Map<Enemy, number>();
  private startedAt = 0;
  private lastX = 0;
  private lastY = 0;
  private lastDash = 0;
  private damageRevision = 0;
  private nextDroneAt = 0;
  private nextTargetAt = 0;
  private highestStage = 0;
  private terminalAt: number | null = null;
  private result: RedlineResult | null = null;
  constructor(private readonly context: ArcadeRuntimeContext, private readonly definition: ArcadeEventDefinition) { }
  start(now: number): boolean {
    this.startedAt = now;
    this.lastX = this.context.player.x;
    this.lastY = this.context.player.y;
    this.lastDash = this.context.player.lastDashMs;
    this.damageRevision = this.context.player.damageRevision;
    this.nextDroneAt = now + 3000;
    this.nextTargetAt = now + 6000;
    this.visuals = new RedlineVisualController(this.context.scene);
    this.context.playArcadeCue('redline-boot');
    return true;
  }
  update(now: number, deltaMs: number): ArcadeEventOutcome | null {
    const remaining = Math.max(0, this.definition.durationMs - (now - this.startedAt));
    if (this.terminalAt !== null) {
      this.visuals?.update(now, this.momentum, 0, now - this.terminalAt, this.result!);
      return now - this.terminalAt >= 3300 ? { success: true, reason: 'success' } : null;
    }
    if (remaining === 0) {
      this.terminalAt = now;
      this.result = this.momentum.result();
      this.retirePressure();
      this.visuals?.announce('REDLINE TERMINATED', now);
      this.context.playArcadeCue('redline-rupture');
      this.context.emitMetric({ name: 'redline_completed', eventId: this.id, round: this.context.round, protocol: this.context.protocol, elapsedMs: now - this.startedAt, success: true, redline: this.result });
      this.visuals?.update(now, this.momentum, 0, 0, this.result);
      return null;
    }
    const p = this.context.player;
    const distance = Math.hypot(p.x - this.lastX, p.y - this.lastY);
    const movement = deltaMs > 0 ? distance / (Math.max(1, p.speed) * deltaMs / 1000) : 0;
    this.momentum.update(deltaMs, movement, p.lastDashMs !== this.lastDash, p.damageRevision !== this.damageRevision);
    this.lastX = p.x;
    this.lastY = p.y;
    this.lastDash = p.lastDashMs;
    this.damageRevision = p.damageRevision;
    const stage = this.momentum.stage;
    if (stage > this.highestStage) {
      this.highestStage = stage;
      this.context.playArcadeCue('redline-stage');
      if (stage === 3)
        this.visuals?.announce('CRITICAL REDLINE / ENERGY OVERCLOCK', now);
      this.context.emitMetric({ name: 'redline_stage_reached', eventId: this.id, round: this.context.round, protocol: this.context.protocol, elapsedMs: now - this.startedAt, progress: stage, target: 3 });
    }
    // A small additive reservoir benefit, only during active Critical updates. No stat mutation.
    if (stage === 3 && p.energy < p.energyStats.max)
      p.energy = Math.min(p.energyStats.max, p.energy + Math.min(deltaMs, 250) / 1000 * 1.5);
    for (const [enemy, expiresAt] of this.owned) {
      if (!enemy.active) {
        this.owned.delete(enemy);
        continue;
      }
      if (now >= expiresAt && !enemy.isDead()) {
        this.context.removeEnemy(enemy);
        this.owned.delete(enemy);
      }
    }
    if (stage >= 1 && now >= this.nextDroneAt) {
      this.nextDroneAt = now + [12000, 9000, 5500, 3500][stage];
      if (this.owned.size < stage)
        this.spawnDrone(now, false);
    }
    if (stage >= 2 && now >= this.nextTargetAt) {
      this.nextTargetAt = now + (stage === 3 ? 8000 : 13000);
      const hasTarget = Array.from(this.owned.keys()).some(e => e.getData('redlineTarget') && e.active);
      if (!hasTarget && this.owned.size < stage + 1)
        this.spawnDrone(now, true);
    }
    this.visuals?.update(now, this.momentum, remaining);
    return null;
  }
  handleGameplayEvent(event: ArcadeGameplayEvent, now: number): ArcadeEventOutcome | null {
    if (event.type !== 'enemy-killed' || this.terminalAt !== null)
      return null;
    const priority = this.owned.has(event.enemy) && Boolean(event.enemy.getData('redlineTarget'));
    this.owned.delete(event.enemy);
    this.momentum.kill(priority);
    if (priority) {
      this.visuals?.announce('TARGET DESTROYED / +20 RPM / CHAIN EXTENDED', now);
      this.context.playArcadeCue('redline-stage');
    }
    return null;
  }
  objectiveText(now: number): string {
    return this.terminalAt !== null ? 'REDLINE // COMPLETE' :
      'REDLINE // ' + Math.round(this.momentum.rpm) + '% RPM / ' + REDLINE_STATES[this.momentum.stage] + ' x' + this.momentum.multiplier
      + ' / ' + Math.floor(this.momentum.score).toLocaleString() + ' PTS / ' + Math.ceil(Math.max(0, this.definition.durationMs - now + this.startedAt) / 1000) + 's';
  }
  rewardPlan() {
    const result = this.result ?? this.momentum.result(), tier = REDLINE_REWARD_TIERS[result.rank];
    const options = REDLINE_REWARDS.options.filter(o => result.rank !== 'D' || o.kind === 'credits').map(o => ({ ...o,
      baseAmount: o.baseAmount === undefined ? undefined : o.baseAmount * tier.amountMultiplier,
      amountPerRound: o.amountPerRound === undefined ? undefined : o.amountPerRound * tier.amountMultiplier }));
    return { origin: { x: this.context.player.x, y: this.context.player.y }, rolls: tier.rolls, profile: { kind: 'random-pool' as const, options } };
  }
  cleanup(_reason: ArcadeStopReason): void { this.retirePressure(); this.visuals?.destroy(); this.visuals = null; }
  private spawnDrone(now: number, target: boolean): void {
    const enemy = this.context.spawnEnemy({ type: 'drone', x: this.context.player.x, y: this.context.player.y, droneVariant: target ? 'target' : 'redline' });
    if (!enemy)
      return;
    enemy.setData('n3onArcadeEvent', this.id);
    enemy.setData('redlineTarget', target);
    this.owned.set(enemy, target ? now + DRONE_VARIANTS.target.lifetimeMs : Infinity);
    if (target)
      this.visuals?.announce('REDLINE TARGET DETECTED', now);
  }
  private retirePressure(): void {
    for (const enemy of this.owned.keys())
      if (enemy.active)
        this.context.removeEnemy(enemy);
    this.owned.clear();
    this.context.retireRedlineProjectiles();
  }
}
