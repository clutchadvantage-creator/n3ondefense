import type { LyraContext, LyraMessage } from './LyraTypes.ts';

interface Pending { message: LyraMessage; scope: string; expires: number; }
/** Pure scheduling policy; speech and presentation never own gameplay state. */
export class LyraQueue {
  readonly pending: Pending[] = [];
  active: LyraMessage | null = null;
  private context: LyraContext = { scope: '', scene: '', blocked: true, training: false, ambientSafe: false };
  private readonly cooldowns = new Map<string, number>();
  private readonly runSeen = new Set<string>();
  private lastEnd = -Infinity;
  private readonly now: () => number;
  private readonly seen: (id: string) => boolean;
  private readonly start: (message: LyraMessage) => void;
  private readonly stop: () => void;
  constructor(now: () => number, seen: (id: string) => boolean, start: (message: LyraMessage) => void, stop: () => void) {
    this.now = now; this.seen = seen; this.start = start; this.stop = stop;
  }
  setContext(context: LyraContext): void {
    if (context.scope !== this.context.scope || context.blocked) this.clear();
    this.context = context;
    if (this.active && !this.valid(this.active)) this.cancel();
  }
  submit(message: LyraMessage): boolean {
    if (!this.valid(message) || this.active?.id === message.id || this.pending.some(p => p.message.id === message.id)
      || (this.cooldowns.get(message.id) ?? -Infinity) > this.now()
      || (message.once === 'profile' && this.seen(message.id)) || (message.once === 'run' && this.runSeen.has(message.id))) return false;
    if (this.active && message.priority > this.active.priority && this.active.interruptible !== false) this.cancel();
    this.pending.push({ message, scope: this.context.scope, expires: this.now() + (message.expiryMs ?? 8000) });
    this.pending.sort((a, b) => b.message.priority - a.message.priority);
    if (this.pending.length > 12) this.pending.length = 12;
    this.tick();
    return true;
  }
  tick(): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.expires <= this.now() || p.scope !== this.context.scope || !this.valid(p.message)) this.pending.splice(i, 1);
    }
    if (this.active || !this.pending.length) return;
    if (this.pending[0].message.priority < 90 && this.now() - this.lastEnd < 1800) return;
    const message = this.pending.shift()!.message;
    this.active = message;
    this.cooldowns.set(message.id, this.now() + (message.cooldownMs ?? 30000));
    if (message.once === 'run') this.runSeen.add(message.id);
    this.start(message);
  }
  finish(): void { this.active = null; this.lastEnd = this.now(); }
  cancel(): void { if (this.active) { this.stop(); this.finish(); } }
  clear(): void { this.pending.length = 0; this.cancel(); }
  resetRun(): void { this.clear(); this.runSeen.clear(); }
  resetCooldowns(): void { this.cooldowns.clear(); this.lastEnd = -Infinity; }
  private valid(message: LyraMessage): boolean {
    return !this.context.blocked && (!message.scenes || message.scenes.includes(this.context.scene))
      && (message.condition !== 'low-health' || this.context.lowHealth === true)
      && (message.condition !== 'defusing' || this.context.defusing === true)
      && (!this.context.training || message.tutorial === true || message.priority >= 100)
      && (message.mode !== 'AMBIENT' || this.context.ambientSafe);
  }
}
