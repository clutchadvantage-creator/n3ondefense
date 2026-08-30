import Phaser from 'phaser';
import { SeededRandom } from '../systems/SeededRandom.ts';
import type { RunModeFamily } from '../config/modeBalance.ts';
import { AnomalyHudView } from './AnomalyHudView.ts';
import { AnomalyPortalVisual } from './AnomalyPortalVisual.ts';
import { createSilentAnomalyAudioHooks, type AnomalyAudioHooks } from './AnomalyAudioHooks.ts';
import {
  ANOMALY_ENTRY_COSTS,
  ANOMALY_SCHEDULING,
  ANOMALY_BY_ID,
  getEligibleAnomalies
} from './AnomalyRegistry.ts';
import type { AnomalyDefinition, AnomalyId, AnomalyRuntimeContext, AnomalyState } from './types.ts';

export interface AnomalyControllerOptions {
  enabled: boolean;
  modeFamily: RunModeFamily;
  particlesEnabled: boolean;
  audio?: AnomalyAudioHooks;
}

export class AnomalyController {
  private readonly random: SeededRandom;
  private readonly hud: AnomalyHudView;
  private readonly audio: AnomalyAudioHooks;
  private stateValue: AnomalyState = 'waiting';
  private definition: AnomalyDefinition | null = null;
  private visual: AnomalyPortalVisual | null = null;
  private retiringVisual: AnomalyPortalVisual | null = null;
  private elapsedMs = 0;
  private nextOpportunityAt = Number.POSITIVE_INFINITY;
  private spawnedAt = 0;
  private portalReadyAt = 0;
  private portalIdleStarted = false;
  private transitionStartedAt = 0;
  private charge = 0;
  private chargeTarget = 1;
  private cost = 0;
  private forcedCost: number | null = null;
  private completedThisRound = false;
  private destroyed = false;

  constructor(private readonly context: AnomalyRuntimeContext, private readonly options: AnomalyControllerOptions) {
    this.random = new SeededRandom((context.seed ^ Math.imul(context.round, 0x6d2b79f5) ^ 0xa1104a1f) >>> 0);
    this.hud = new AnomalyHudView(context.scene);
    this.audio = options.audio ?? createSilentAnomalyAudioHooks();
    if (options.enabled && context.round >= 3) {
      this.nextOpportunityAt = this.random.float(ANOMALY_SCHEDULING.minimumOpportunityMs, ANOMALY_SCHEDULING.maximumOpportunityMs);
    }
  }

  update(deltaMs: number): void {
    if (this.destroyed || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    const now = this.context.scene.time.now;
    this.elapsedMs += Math.min(250, deltaMs);
    this.hud.update(now);
    this.visual?.update(now);

    if (this.stateValue === 'transitioning') {
      const progress = Phaser.Math.Clamp((now - this.transitionStartedAt) / ANOMALY_SCHEDULING.transitionDurationMs, 0, 1);
      if (this.visual) {
        const ease = Phaser.Math.Easing.Quadratic.In(progress);
        this.context.player.setPosition(
          Phaser.Math.Linear(this.context.player.x, this.visual.x, Math.min(0.22, 0.05 + ease * 0.12)),
          Phaser.Math.Linear(this.context.player.y, this.visual.y, Math.min(0.22, 0.05 + ease * 0.12))
        );
        this.context.player.setScale(Math.max(0.08, 1 - ease * 0.88)).setAlpha(Math.max(0.08, 1 - ease * 0.9));
        this.visual.setTransitionProgress(ease);
      }
      if (progress >= 1) this.launchActive();
      return;
    }

    if (this.stateValue === 'portal-ready') {
      if (now - this.portalReadyAt >= ANOMALY_SCHEDULING.portalLifetimeMs) {
        this.resolve('declined');
        return;
      }
      const visual = this.visual;
      if (!visual) return;
      if (visual.readyForInteraction && !this.portalIdleStarted) {
        this.portalIdleStarted = true;
        this.audio.play('portal-idle');
      }
      const distanceSquared = (this.context.player.x - visual.x) ** 2 + (this.context.player.y - visual.y) ** 2;
      if (distanceSquared <= ANOMALY_SCHEDULING.interactionRadius ** 2) {
        if (!visual.readyForInteraction) {
          this.hud.show('DIMENSIONAL BREACH FORMING', 'STAND CLEAR // TRANSIT FIELD UNSTABLE', 0x63f7ff);
        } else {
          this.hud.show('ANOMALY // HEIST', `${this.context.interactionPrompt()} ENTER // ${this.cost} FLUX CORES`, 0xff5bd8);
          if (this.context.isInteractPressed()) this.tryEnter();
        }
      }
      return;
    }

    if (this.stateValue === 'charging' || this.stateValue === 'suspended' || this.stateValue === 'resolved') return;
    if (!this.options.enabled || this.completedThisRound || this.elapsedMs < this.nextOpportunityAt) return;
    if (!this.context.isGameplayEligible()) {
      this.nextOpportunityAt = this.elapsedMs + 10_000;
      return;
    }
    const chance = ANOMALY_SCHEDULING.opportunityChance[this.options.modeFamily];
    if (!this.random.bool(chance)) {
      this.nextOpportunityAt = this.elapsedMs + ANOMALY_SCHEDULING.retryAfterMissMs;
      return;
    }
    const eligible = getEligibleAnomalies(this.context.round, this.context.protocol);
    if (!eligible.length || !this.start(this.chooseWeighted(eligible))) {
      this.nextOpportunityAt = this.elapsedMs + ANOMALY_SCHEDULING.retryAfterMissMs;
    }
  }

  handleEnemyKilled(x: number, y: number): void {
    if (this.stateValue !== 'charging' || !this.definition || !this.visual) return;
    this.charge += 1;
    this.visual.setCharge(this.charge / this.chargeTarget);
    this.visual.emitFeed(x, y, this.options.particlesEnabled ? 2 : 1, () => {
      this.audio.play('essence-absorption');
    });
    this.audio.play('essence-release');
    this.audio.play('anomaly-charging');
    this.context.emitMetric({
      name: 'anomaly_charge_progress', anomalyId: this.definition.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: this.elapsedMs - this.spawnedAt,
      progress: Math.min(this.charge, this.chargeTarget), target: this.chargeTarget
    });
    this.hud.show('ANOMALY SIGNAL CHARGING', `${Math.min(this.charge, this.chargeTarget)} / ${this.chargeTarget} HOSTILE ENERGY`, 0x63f7ff, 850);
    if (this.charge >= this.chargeTarget) this.openPortal();
  }

  force(id: AnomalyId = 'heist'): boolean {
    if (this.destroyed || this.stateValue !== 'waiting') return false;
    const definition = ANOMALY_BY_ID.get(id);
    return Boolean(definition && this.start(definition));
  }

  forceCharge(): boolean {
    if (this.stateValue !== 'charging' || !this.definition) return false;
    this.charge = this.chargeTarget;
    this.openPortal();
    return true;
  }

  /** Development-only entry through the exact paid transition path. The only
   * difference is that the wallet transaction is skipped at the portal gate. */
  tryEnterDevBypass(): boolean {
    if (!import.meta.env.DEV || !this.context.isGameplayEligible()
      || this.stateValue !== 'portal-ready' || !this.visual?.readyForInteraction) return false;
    const dx = this.context.player.x - this.visual.x;
    const dy = this.context.player.y - this.visual.y;
    if (dx * dx + dy * dy > ANOMALY_SCHEDULING.interactionRadius ** 2) return false;
    return this.tryEnter({ bypassCost: true, source: 'dev-hotkey' });
  }

  setForcedCost(cost: number | null): void {
    this.forcedCost = cost === null ? null : ANOMALY_ENTRY_COSTS.reduce((best, candidate) =>
      Math.abs(candidate - cost) < Math.abs(best - cost) ? candidate : best, ANOMALY_ENTRY_COSTS[0]);
  }

  resolveReturn(): void {
    if (this.stateValue !== 'suspended') return;
    this.context.player.setScale(1).setAlpha(1).setVisible(true).setActive(true);
    this.audio.play('arena-reentry');
    const visual = this.visual;
    this.visual = null;
    this.retiringVisual = visual;
    visual?.playReturnCollapse(() => {
      visual.destroy();
      if (this.retiringVisual === visual) this.retiringVisual = null;
    });
    this.resolve('round-ended');
  }

  stop(reason: 'round-ended' | 'scene-shutdown'): void { this.resolve(reason); }
  get state(): AnomalyState { return this.stateValue; }
  get blocksArenaGameplay(): boolean { return this.stateValue === 'transitioning'; }
  get activeAnomalyId(): AnomalyId | null { return this.definition?.id ?? null; }
  resize(width: number): void { this.hud.resize(width); }

  destroy(reason: 'round-ended' | 'scene-shutdown' = 'scene-shutdown'): void {
    if (this.destroyed) return;
    this.resolve(reason);
    this.destroyed = true;
    this.audio.stopAll();
    this.retiringVisual?.destroy();
    this.retiringVisual = null;
    this.hud.destroy();
  }

  private start(definition: AnomalyDefinition): boolean {
    const location = this.findLocation();
    if (!location) return false;
    this.definition = definition;
    this.stateValue = 'charging';
    this.spawnedAt = this.elapsedMs;
    this.charge = 0;
    this.portalIdleStarted = false;
    this.chargeTarget = Math.min(definition.chargeMaximum, Math.ceil(definition.chargeBase + this.context.round * definition.chargePerRound));
    this.visual = new AnomalyPortalVisual(this.context.scene, location.x, location.y, this.options.particlesEnabled);
    this.audio.play('anomaly-spawn');
    this.hud.show('ANOMALOUS ENERGY DETECTED', `FEED THE SPHERE // ELIMINATE ${this.chargeTarget} HOSTILES`, 0x63f7ff, 3600);
    this.context.emitMetric({
      name: 'anomaly_spawned', anomalyId: definition.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: this.elapsedMs, target: this.chargeTarget
    });
    return true;
  }

  private openPortal(): void {
    if (this.stateValue !== 'charging' || !this.definition || !this.visual) return;
    this.stateValue = 'portal-ready';
    this.portalReadyAt = this.context.scene.time.now;
    this.cost = this.forcedCost ?? ANOMALY_ENTRY_COSTS[Math.floor(this.random.next() * ANOMALY_ENTRY_COSTS.length)];
    this.visual.transformToPortal();
    this.audio.play('portal-rupture');
    this.hud.show(this.definition.displayName, `${this.definition.description}\nENTRY COST // ${this.cost} FLUX CORES`, 0xff5bd8, 5600);
    this.context.emitMetric({
      name: 'anomaly_portal_opened', anomalyId: this.definition.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: this.elapsedMs - this.spawnedAt, cost: this.cost
    });
  }

  private tryEnter(options: { bypassCost?: boolean; source?: 'dev-hotkey' } = {}): boolean {
    if (this.stateValue !== 'portal-ready' || !this.definition || !this.visual || !this.visual.readyForInteraction) return false;
    if (!options.bypassCost
      && (this.context.availableFluxCores() < this.cost || !this.context.spendFluxCores(this.cost))) {
      this.hud.show('ACCESS DENIED', `INSUFFICIENT FLUX CORES // ${this.context.availableFluxCores()} / ${this.cost}`, 0xff5f7c, 1800);
      this.context.emitMetric({ name: 'anomaly_entry_denied', anomalyId: this.definition.id, round: this.context.round,
        protocol: this.context.protocol, elapsedMs: this.elapsedMs - this.spawnedAt, cost: this.cost, reason: 'insufficient-flux' });
      return false;
    }
    if (options.bypassCost && import.meta.env.DEV) console.debug('[HEIST DEV] Portal cost bypassed via F9');
    this.stateValue = 'transitioning';
    this.transitionStartedAt = this.context.scene.time.now;
    this.context.player.setVelocity(0, 0);
    this.audio.play('portal-entry');
    this.context.emitMetric({ name: 'anomaly_entry_confirmed', anomalyId: this.definition.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: this.elapsedMs - this.spawnedAt, cost: this.cost,
      reason: options.source });
    this.hud.show('ANOMALY TRANSIT LOCKED', 'ARENA STATE SUSPENDING // HEIST LINK ESTABLISHED', 0xff5bd8);
    return true;
  }

  private launchActive(): void {
    if (this.stateValue !== 'transitioning' || !this.definition || !this.visual) return;
    this.stateValue = 'suspended';
    this.context.scene.cameras.main.flash(150, 205, 255, 255, false);
    this.context.player.setVisible(false).setActive(false);
    this.context.beginTransition({
      anomalyId: this.definition.id,
      definition: this.definition,
      sessionId: `${this.context.seed}-${this.context.round}-${Math.floor(this.elapsedMs)}`,
      cost: this.cost,
      portal: { x: this.visual.x, y: this.visual.y }
    });
  }

  private findLocation(): { x: number; y: number } | null {
    const bounds = this.context.bounds;
    const clearance = ANOMALY_SCHEDULING.locationClearance;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const x = this.random.float(bounds.x + clearance, bounds.x + bounds.w - clearance);
      const y = this.random.float(bounds.y + clearance, bounds.y + bounds.h - clearance);
      const dx = x - this.context.player.x;
      const dy = y - this.context.player.y;
      if (dx * dx + dy * dy < 330 * 330) continue;
      if (this.context.isLocationValid(x, y, clearance)) return { x, y };
    }
    return null;
  }

  private chooseWeighted(definitions: readonly AnomalyDefinition[]): AnomalyDefinition {
    let total = 0;
    for (const definition of definitions) total += Math.max(0, definition.weight);
    if (total <= 0) return definitions[0];
    let roll = this.random.next() * total;
    for (const definition of definitions) {
      roll -= Math.max(0, definition.weight);
      if (roll <= 0) return definition;
    }
    return definitions[definitions.length - 1];
  }

  private resolve(reason: 'declined' | 'round-ended' | 'scene-shutdown'): void {
    if (this.stateValue === 'resolved' && !this.visual) return;
    this.completedThisRound = true;
    this.visual?.destroy();
    this.visual = null;
    this.definition = null;
    this.portalIdleStarted = false;
    this.stateValue = 'resolved';
    this.audio.stopAll();
    this.hud.hide();
    this.nextOpportunityAt = this.elapsedMs + ANOMALY_SCHEDULING.cooldownMs;
    if (reason === 'declined') this.completedThisRound = true;
  }
}
