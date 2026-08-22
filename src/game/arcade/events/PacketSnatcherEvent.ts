import type { Enemy } from '../../enemies/Enemy.ts';
import { PacketSnatcherVisualController } from '../visuals/PacketSnatcherVisualController.ts';
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
const TERMINAL_HOLD_MS = 650;
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
  private visuals: PacketSnatcherVisualController | null = null;
  private extractionPoint = { x: 0, y: 0 };
  private rewardOrigin = { x: 0, y: 0 };
  private startedAt = 0;
  private nextVisualAt = 0;
  private jukePhase = 0;
  private bonusMod = false;
  private initialHealth = 1;
  private terminalOutcome: ArcadeEventOutcome | null = null;
  private terminalAt = 0;

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
    this.initialHealth = thief.hp;
    thief.setData('n3onArcadeEvent', this.id);
    thief.setData('arcadeMovementControlled', true);
    thief.setData('n3onArcadeSuppressBaseLoot', true);
    thief.setTint(0x54f5ff);

    this.visuals = new PacketSnatcherVisualController(this.context.scene, {
      spawnX: thief.x,
      spawnY: thief.y,
      extractionX: extraction.x,
      extractionY: extraction.y,
      thiefRadius: thief.hazardRadius,
      extractionRadius: EXTRACTION_RADIUS,
      particlesEnabled: this.context.particlesEnabled
    });
    this.context.playArcadeCue('packet-snatcher-alert');
    return true;
  }

  update(activeElapsedMs: number): ArcadeEventOutcome | null {
    const thief = this.thief;
    if (this.terminalOutcome) {
      this.refreshVisuals(activeElapsedMs, thief?.x ?? this.rewardOrigin.x, thief?.y ?? this.rewardOrigin.y, 0);
      return activeElapsedMs - this.terminalAt >= TERMINAL_HOLD_MS ? this.terminalOutcome : null;
    }
    if (!thief || !thief.active || thief.isDead()) return null;
    const elapsed = activeElapsedMs - this.startedAt;
    if (elapsed >= this.definition.durationMs) {
      this.beginEscape(activeElapsedMs, thief.x, thief.y);
      return null;
    }

    const toExtractX = this.extractionPoint.x - thief.x;
    const toExtractY = this.extractionPoint.y - thief.y;
    const distanceSquared = toExtractX * toExtractX + toExtractY * toExtractY;
    if (distanceSquared <= EXTRACTION_RADIUS * EXTRACTION_RADIUS) {
      this.beginEscape(activeElapsedMs, thief.x, thief.y);
      return null;
    }
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
      this.refreshVisuals(activeElapsedMs, thief.x, thief.y, Math.max(0, this.definition.durationMs - elapsed));
      const pulse = 0.5 + Math.sin(activeElapsedMs * 0.014) * 0.5;
      thief.setTint(pulse > 0.88 ? 0xffffff : 0x54f5ff);
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
    this.terminalOutcome = { success: true, reason: 'success' };
    this.terminalAt = activeElapsedMs;
    this.visuals?.beginSuccess(activeElapsedMs, event.enemy.x, event.enemy.y);
    this.context.playArcadeCue('packet-snatcher-intercepted');
    return null;
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
    this.visuals?.destroy();
    this.visuals = null;
    this.thief = null;
  }

  private beginEscape(activeElapsedMs: number, x: number, y: number): void {
    if (this.terminalOutcome) return;
    this.terminalOutcome = { success: false, reason: 'failed' };
    this.terminalAt = activeElapsedMs;
    this.thief?.setVelocity(0, 0);
    this.visuals?.beginFailure(activeElapsedMs, x, y);
    this.context.playArcadeCue('packet-snatcher-escaped');
    this.context.emitMetric({
      name: 'packet_snatcher_escaped', eventId: this.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
      success: false, reason: 'failed'
    });
  }

  private refreshVisuals(activeElapsedMs: number, x: number, y: number, remainingMs: number): void {
    this.nextVisualAt = activeElapsedMs + 42;
    this.visuals?.update(
      activeElapsedMs,
      this.startedAt,
      x,
      y,
      Math.max(0, Math.min(1, (this.thief?.hp ?? 0) / Math.max(1, this.initialHealth))),
      remainingMs
    );
  }
}
