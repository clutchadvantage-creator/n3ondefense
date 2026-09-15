/** Temporary, non-Mod messages only. Dedicated Mod presentation owns its own lifecycle. */
export type HudNotificationCategory = 'system' | 'arcade' | 'redline' | 'success' | 'failure' | 'weekly' | 'anomaly' | 'progression' | 'reward';
export interface HudNotification {
  category: HudNotificationCategory;
  heading: string;
  message?: string;
  secondary?: string;
  durationMs?: number;
  priority?: number;
  /** Coalesce repeated signals, or replace a queued status that has become obsolete. */
  key?: string;
}

export class HudNotificationQueue {
  readonly pending: HudNotification[] = [];
  active: HudNotification | null = null;
  elapsedMs = 0;
  private readonly recent = new Map<string, number>();
  private clock = 0;

  submit(value: HudNotification): boolean {
    const key = value.key ?? `${value.category}:${value.heading}:${value.message ?? ''}`;
    if (this.active?.key === key || (this.recent.get(key) ?? -Infinity) > this.clock) return false;
    const duration = Number.isFinite(value.durationMs) ? value.durationMs! : 2700;
    const notice = { ...value, key, durationMs: Math.min(6000, Math.max(1800, duration)), priority: Number.isFinite(value.priority) ? value.priority! : 0 };
    const existing = this.pending.findIndex(item => item.key === key);
    if (existing >= 0) this.pending.splice(existing, 1);
    if (this.pending.length >= 12) {
      const lowest = this.pending.at(-1)!;
      if (lowest.priority! > notice.priority) return false;
      this.pending.pop();
    }
    this.pending.push(notice);
    // Stable sort retains submission order for equal priorities.
    this.pending.sort((a, b) => b.priority! - a.priority!);
    return true;
  }

  update(deltaMs: number): void {
    const dt = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.clock += dt;
    this.elapsedMs += dt;
    for (const [key, until] of this.recent) if (until <= this.clock) this.recent.delete(key);
    if (this.active && this.elapsedMs >= this.active.durationMs!) {
      this.recent.set(this.active.key!, this.clock + 5000);
      this.active = null;
    }
    if (!this.active && this.pending.length) {
      this.active = this.pending.shift()!;
      this.elapsedMs = 0;
    }
  }

  clear(): void {
    this.pending.length = 0;
    this.active = null;
    this.elapsedMs = 0;
    this.recent.clear();
  }

  cancelPrefix(prefix: string): void {
    for (let index = this.pending.length - 1; index >= 0; index--) {
      if (this.pending[index].key?.startsWith(prefix)) this.pending.splice(index, 1);
    }
    if (this.active?.key?.startsWith(prefix)) { this.active = null; this.elapsedMs = 0; }
  }
}
