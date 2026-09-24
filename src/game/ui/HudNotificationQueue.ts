/** Non-Mod presentation only. No timers: the encounter owns the clock. */
export type HudNotificationCategory = 'system' | 'arcade' | 'redline' | 'success' | 'failure' | 'weekly' | 'anomaly' | 'progression' | 'reward';
export type HudNotificationAnimation = 'console' | 'redline' | 'supply' | 'thief' | 'hunt' | 'boss' | 'circuit' | 'anomaly' | 'disarm' | 'reward' | 'hazard';
export const HUD_NOTIFICATION_TIMING = Object.freeze({ deploy: 320, retract: 300, active: 3500, liveRotation: 5000, repeat: 5000 });
export interface HudNotification {
  category: HudNotificationCategory;
  heading: string;
  message?: string;
  secondary?: string;
  durationMs?: number;
  priority?: number;
  key?: string;
  animation?: HudNotificationAnimation;
  /** Real normalized gameplay state, not a decorative timer. */
  progress?: number;
  rpm?: number;
}
export type HudNotificationPhase = 'HIDDEN' | 'DEPLOYING' | 'ACTIVE' | 'RETRACTING';
type Entry = HudNotification & { remainingMs?: number };

export class HudNotificationQueue {
  readonly pending: Entry[] = [];
  readonly live = new Map<string, Entry>();
  active: Entry | null = null;
  phase: HudNotificationPhase = 'HIDDEN';
  elapsedMs = 0;
  phaseMs = 0;
  private readonly recent = new Map<string, number>();
  private clock = 0;
  private lastLiveKey = '';
  private activeLive = false;

  private normalize(value: HudNotification): Entry {
    return { ...value, key: value.key ?? `${value.category}:${value.heading}:${value.message ?? ''}`,
      durationMs: Math.min(6000, Math.max(2500, Number.isFinite(value.durationMs) ? value.durationMs! : HUD_NOTIFICATION_TIMING.active)),
      priority: Number.isFinite(value.priority) ? value.priority! : 0 };
  }
  submit(value: HudNotification): boolean {
    const notice = this.normalize(value), key = notice.key!;
    if (this.active?.key === key || (this.recent.get(key) ?? -Infinity) > this.clock) return false;
    const existing = this.pending.findIndex(item => item.key === key);
    if (existing >= 0) this.pending[existing] = notice;
    else this.pending.push(notice);
    // Distinct outcomes are retained. Repeated signals replace one keyed slot.
    this.pending.sort((a, b) => b.priority! - a.priority!);
    return true;
  }
  setLive(key: string, value: HudNotification): void {
    const previous = this.live.get(key);
    if (previous) Object.assign(previous, value, { key });
    else this.live.set(key, { ...this.normalize(value), key });
  }
  removeLive(key: string): void { this.live.delete(key); }
  private preferredLive(): Entry | undefined {
    let urgent: Entry | undefined;
    for (const item of this.live.values()) if (item.priority! >= 50 && (!urgent || item.priority! > urgent.priority!)) urgent = item;
    if (urgent) return urgent;
    let first: Entry | undefined, afterLast = false;
    for (const item of this.live.values()) {
      first ??= item;
      if (afterLast) return item;
      if (item.key === this.lastLiveKey) afterLast = true;
    }
    return first;
  }
  private begin(): void {
    const live = this.preferredLive();
    this.activeLive = !!live && (live.priority! >= 50 || !this.pending.length);
    this.active = this.activeLive ? live! : this.pending.shift() ?? null;
    if (!this.active) { this.phase = 'HIDDEN'; return; }
    this.phase = 'DEPLOYING'; this.phaseMs = this.elapsedMs = 0;
  }
  private retract(resume: boolean): void {
    if (this.active && !this.activeLive) {
      if (resume) {
        this.pending.unshift({ ...this.active, remainingMs: Math.max(1, (this.active.remainingMs ?? this.active.durationMs!) - this.elapsedMs) });
        this.pending.sort((a, b) => b.priority! - a.priority!);
      } else this.recent.set(this.active.key!, this.clock + HUD_NOTIFICATION_TIMING.repeat);
    }
    if (this.activeLive) this.lastLiveKey = this.active?.key ?? '';
    this.phase = 'RETRACTING'; this.phaseMs = 0;
  }
  update(deltaMs: number): void {
    const dt = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.clock += dt;
    for (const [key, until] of this.recent) if (until <= this.clock) this.recent.delete(key);
    if (this.phase === 'HIDDEN') { this.begin(); return; }
    const urgent = this.preferredLive();
    if (this.phase !== 'RETRACTING' && this.active &&
      ((this.activeLive && !this.live.has(this.active.key!)) ||
       (urgent && urgent.key !== this.active.key && urgent.priority! >= 50 && urgent.priority! > this.active.priority!))) {
      const fraction = this.deployment;
      this.retract(true);
      this.phaseMs = (1 - fraction) * HUD_NOTIFICATION_TIMING.retract;
    }
    this.phaseMs += dt;
    if (this.phase === 'DEPLOYING' && this.phaseMs >= HUD_NOTIFICATION_TIMING.deploy) {
      this.phase = 'ACTIVE'; this.phaseMs = 0;
    } else if (this.phase === 'ACTIVE') {
      this.elapsedMs += dt;
      if (this.activeLive) {
        if (this.active!.priority! < 50 && (this.pending.length ||
          (this.elapsedMs >= HUD_NOTIFICATION_TIMING.liveRotation && this.live.size > 1))) this.retract(false);
      } else if (this.elapsedMs >= (this.active!.remainingMs ?? this.active!.durationMs!)) this.retract(false);
    } else if (this.phase === 'RETRACTING' && this.phaseMs >= HUD_NOTIFICATION_TIMING.retract) {
      this.active = null; this.phase = 'HIDDEN'; this.phaseMs = this.elapsedMs = 0;
      this.begin();
    }
  }
  get deployment(): number {
    if (this.phase === 'HIDDEN') return 0;
    if (this.phase === 'ACTIVE') return 1;
    return Math.max(0, Math.min(1, this.phase === 'DEPLOYING'
      ? this.phaseMs / HUD_NOTIFICATION_TIMING.deploy : 1 - this.phaseMs / HUD_NOTIFICATION_TIMING.retract));
  }
  clear(): void {
    this.pending.length = 0; this.live.clear(); this.recent.clear(); this.active = null;
    this.phase = 'HIDDEN'; this.elapsedMs = this.phaseMs = 0; this.lastLiveKey = ''; this.activeLive = false;
  }
  cancelPrefix(prefix: string): void {
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].key?.startsWith(prefix)) this.pending.splice(i, 1);
    for (const key of this.live.keys()) if (key.startsWith(prefix)) this.live.delete(key);
    if (this.active?.key?.startsWith(prefix) && this.phase !== 'RETRACTING') {
      const fraction = this.deployment; this.retract(false);
      this.phaseMs = (1 - fraction) * HUD_NOTIFICATION_TIMING.retract;
    }
  }
}
