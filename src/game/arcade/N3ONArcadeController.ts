import type { Boss } from '../bosses/Boss.ts';
import type { AudioSfxName } from '../config/audio.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';
import { ArcadeHudView } from './ArcadeHudView.ts';
import {
  ARCADE_EVENT_DEFINITIONS,
  ARCADE_SCHEDULING,
  chooseWeightedArcadeDefinition,
  createArcadeEvent,
  getEligibleArcadeDefinitions
} from './ArcadeEventRegistry.ts';
import { ArcadeRewardService } from './ArcadeRewardService.ts';
import type {
  ArcadeEvent,
  ArcadeEventDefinition,
  ArcadeEventId,
  ArcadeEventOutcome,
  ArcadeGameplayEvent,
  ArcadeRuntimeContext,
  ArcadeStopReason
} from './types.ts';

export interface N3ONArcadeControllerOptions {
  enabled: boolean;
}

type ArcadeEventPresentationSfx = Extract<
  AudioSfxName,
  | 'overloadEvent'
  | 'supplyDropEvent'
  | 'dataThiefEntrance'
  | 'dataThiefFail'
  | 'goldenEnemyEvent'
  | 'goldenEnemyEventFail'
>;

/**
 * Audio terminology follows the player-facing names while runtime IDs remain
 * stable for saves, telemetry, scheduling, and event-specific VFX.
 */
const ARCADE_EVENT_START_SFX: Partial<Record<ArcadeEventId, ArcadeEventPresentationSfx>> = {
  redline: 'overloadEvent',
  'hot-package': 'supplyDropEvent',
  'packet-snatcher': 'dataThiefEntrance',
  'golden-hunt': 'goldenEnemyEvent'
};

const ARCADE_EVENT_FAILURE_SFX: Partial<Record<ArcadeEventId, ArcadeEventPresentationSfx>> = {
  'packet-snatcher': 'dataThiefFail',
  'golden-hunt': 'goldenEnemyEventFail'
};

export class N3ONArcadeController {
  private readonly random: SeededRandom;
  private readonly hud: ArcadeHudView;
  private readonly rewards: ArcadeRewardService;
  private readonly recent: ArcadeEventId[] = [];
  private active: ArcadeEvent | null = null;
  private activeDefinition: ArcadeEventDefinition | null = null;
  private activeElapsedMs = 0;
  private activeStartedAt = 0;
  private nextOpportunityAt = Number.POSITIVE_INFINITY;
  private pendingOutcome: ArcadeEventOutcome | null = null;
  private destroyed = false;

  constructor(
    private readonly context: ArcadeRuntimeContext,
    private readonly options: N3ONArcadeControllerOptions
  ) {
    this.random = new SeededRandom((context.seed ^ Math.imul(context.round, 0x51f15e11) ^ 0xa7cade11) >>> 0);
    this.hud = new ArcadeHudView(context.scene);
    this.rewards = new ArcadeRewardService(context);
    if (options.enabled && context.round >= ARCADE_SCHEDULING.minimumRound) {
      this.nextOpportunityAt = this.random.float(
        ARCADE_SCHEDULING.initialOpportunityMinimumMs,
        ARCADE_SCHEDULING.initialOpportunityMaximumMs
      );
    }
  }

  update(deltaMs: number): void {
    if (this.destroyed || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.activeElapsedMs += Math.min(deltaMs, 250);
    if (this.active) {
      const outcome = this.pendingOutcome ?? this.active.update(this.activeElapsedMs, deltaMs);
      this.pendingOutcome = null;
      if (outcome) {
        this.resolveActive(outcome);
        return;
      }
      this.hud.showObjective(this.active.objectiveText(this.activeElapsedMs));
      return;
    }
    if (!this.options.enabled || this.activeElapsedMs < this.nextOpportunityAt) return;
    const chance = ARCADE_SCHEDULING.opportunityChance[this.context.modeFamily];
    if (!this.random.bool(chance)) {
      this.nextOpportunityAt = this.activeElapsedMs + ARCADE_SCHEDULING.retryAfterMissMs;
      return;
    }
    const definition = chooseWeightedArcadeDefinition(
      getEligibleArcadeDefinitions(this.context.round),
      this.random.next(),
      this.recent
    );
    if (!definition || !this.startDefinition(definition)) {
      this.nextOpportunityAt = this.activeElapsedMs + ARCADE_SCHEDULING.retryAfterMissMs;
    }
  }

  handleGameplayEvent(event: ArcadeGameplayEvent): void {
    if (!this.active || this.pendingOutcome) return;
    this.pendingOutcome = this.active.handleGameplayEvent(event, this.activeElapsedMs);
  }

  force(eventId: ArcadeEventId): boolean {
    if (this.destroyed || this.active) return false;
    const definition = ARCADE_EVENT_DEFINITIONS.find((candidate) => candidate.id === eventId);
    return Boolean(definition && this.startDefinition(definition));
  }

  stop(reason: ArcadeStopReason): void {
    if (!this.active || !this.activeDefinition) return;
    const definition = this.activeDefinition;
    this.active.cleanup(reason);
    AudioManager.get().stopArcadeEventSfx();
    this.context.emitMetric({
      name: 'arcade_event_failed', eventId: definition.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: Math.max(0, this.activeElapsedMs - this.activeStartedAt),
      success: false, reason
    });
    this.active = null;
    this.activeDefinition = null;
    this.pendingOutcome = null;
    this.hud.hideObjective();
  }

  getBossTarget(): Boss | null {
    return this.active?.getBossTarget?.() ?? null;
  }

  get activeEventId(): ArcadeEventId | null {
    return this.activeDefinition?.id ?? null;
  }

  resize(width: number, height: number): void {
    this.hud.resize(width, height);
  }

  destroy(reason: ArcadeStopReason = 'scene-shutdown'): void {
    if (this.destroyed) return;
    this.stop(reason);
    AudioManager.get().stopArcadeEventSfx();
    this.destroyed = true;
    this.hud.destroy();
  }

  private startDefinition(definition: ArcadeEventDefinition): boolean {
    if (this.active) return false;
    const event = createArcadeEvent(this.context, definition);
    if (!event.start(this.activeElapsedMs)) {
      event.cleanup('failed');
      return false;
    }
    this.active = event;
    this.activeDefinition = definition;
    this.activeStartedAt = this.activeElapsedMs;
    this.context.emitMetric({
      name: 'arcade_event_started', eventId: definition.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: 0
    });
    const startSfx = ARCADE_EVENT_START_SFX[definition.id];
    if (startSfx === 'overloadEvent') AudioManager.get().startArcadeEventLoop(startSfx);
    else if (startSfx) AudioManager.get().playSfx(startSfx);
    this.hud.announce(definition.displayName, definition.description);
    this.hud.showObjective(event.objectiveText(this.activeElapsedMs));
    return true;
  }

  private resolveActive(outcome: ArcadeEventOutcome): void {
    if (!this.active || !this.activeDefinition) return;
    const event = this.active;
    const definition = this.activeDefinition;
    // Retire the active event bed before completion/failure stingers so the
    // teardown cannot cut off the newly selected terminal cue.
    AudioManager.get().stopArcadeEventSfx();
    let rewardLabel = '';
    if (outcome.success) {
      const plan = event.rewardPlan?.() ?? {
        origin: { x: this.context.player.x, y: this.context.player.y },
        rolls: 1
      };
      const rewards = this.rewards.spawn(definition.id, definition, plan, () => this.random.next());
      rewardLabel = rewards.length === 1 ? rewards[0].label : `${rewards.length} PHYSICAL DROPS DEPLOYED`;
      for (const reward of rewards) {
        this.context.emitMetric({
          name: 'arcade_reward_rolled', eventId: definition.id, round: this.context.round,
          protocol: this.context.protocol, elapsedMs: Math.max(0, this.activeElapsedMs - this.activeStartedAt),
          rewardKind: reward.kind, rewardAmount: reward.amount
        });
      }
      this.context.emitMetric({
        name: 'arcade_event_completed', eventId: definition.id, round: this.context.round,
        protocol: this.context.protocol, elapsedMs: Math.max(0, this.activeElapsedMs - this.activeStartedAt),
        success: true, reason: outcome.reason
      });
    } else {
      const failureSfx = ARCADE_EVENT_FAILURE_SFX[definition.id];
      if (failureSfx) AudioManager.get().playSfx(failureSfx);
      this.context.emitMetric({
        name: 'arcade_event_failed', eventId: definition.id, round: this.context.round,
        protocol: this.context.protocol, elapsedMs: Math.max(0, this.activeElapsedMs - this.activeStartedAt),
        success: false, reason: outcome.reason
      });
    }
    event.cleanup(outcome.reason);
    this.active = null;
    this.activeDefinition = null;
    this.pendingOutcome = null;
    this.hud.hideObjective();
    this.recent.push(definition.id);
    while (this.recent.length > ARCADE_SCHEDULING.recentHistorySize) this.recent.shift();
    this.nextOpportunityAt = this.activeElapsedMs + ARCADE_SCHEDULING.eventCooldownMs;
    this.hud.announce(
      outcome.success ? 'N3ON ARCADE COMPLETE' : 'N3ON ARCADE FAILED',
      outcome.success ? `${definition.displayName} CLEARED // ${rewardLabel}` : `${definition.displayName} EXPIRED`,
      outcome.success ? 0x7dffb2 : 0xff5d8f
    );
  }
}
