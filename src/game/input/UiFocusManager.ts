export type UiFocusDirection = 'up' | 'down' | 'left' | 'right';

export interface UiFocusRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiFocusableControl {
  id: string;
  getRect(): UiFocusRect;
  activate(): unknown;
  setFocused(focused: boolean): void;
  isVisible?(): boolean;
  isDisabled?(): boolean;
  /** Locked controls remain inspectable but cannot be activated. */
  isLocked?(): boolean;
  adjust?(direction: -1 | 1): unknown;
  scroll?(amount: number): unknown;
  neighbors?: Partial<Record<UiFocusDirection, string>>;
  group?: string;
  modalDepth?: number;
  order?: number;
  defaultPriority?: number;
  destructive?: boolean;
}

export type UiActivationResult = 'activated' | 'blocked' | 'missing';

const center = (rect: UiFocusRect): { x: number; y: number } => ({
  x: rect.x + rect.width * 0.5,
  y: rect.y + rect.height * 0.5
});

const isFiniteRect = (rect: UiFocusRect): boolean => (
  Number.isFinite(rect.x) && Number.isFinite(rect.y)
  && Number.isFinite(rect.width) && Number.isFinite(rect.height)
  && rect.width >= 0 && rect.height >= 0
);

/**
 * Rendering-framework-neutral focus graph. Phaser and DOM adapters both use
 * this implementation so directional behavior, modal safety and invalidation
 * remain identical throughout the game.
 */
export class UiFocusManager {
  private readonly controls = new Map<string, UiFocusableControl>();
  private readonly previousFocusByModal = new Map<number, string>();
  private focusedId: string | null = null;
  private activeModalDepth = 0;
  private nextOrder = 0;

  register(control: UiFocusableControl): () => void {
    // Dynamic card grids can replace a control with the same stable focus id
    // before the old display object emits its destroy event. Retire that old
    // registration now, and make its eventual cleanup token-safe so it cannot
    // unregister the replacement.
    if (this.controls.has(control.id)) this.unregister(control.id);
    const normalized: UiFocusableControl = {
      ...control,
      modalDepth: Math.max(0, control.modalDepth ?? 0),
      order: control.order ?? this.nextOrder++
    };
    this.controls.set(normalized.id, normalized);
    this.ensureFocus();
    const current = this.focusedId ? this.controls.get(this.focusedId) : null;
    if (this.isEligible(normalized)
      && (normalized.modalDepth ?? 0) === this.activeModalDepth
      && !normalized.destructive
      && (current?.destructive === true || (normalized.defaultPriority ?? 0) > (current?.defaultPriority ?? 0))) {
      this.applyFocus(normalized.id);
    }
    return () => {
      if (this.controls.get(normalized.id) === normalized) this.unregister(normalized.id);
    };
  }

  unregister(id: string): void {
    const wasFocused = this.focusedId === id;
    if (wasFocused) this.controls.get(id)?.setFocused(false);
    this.controls.delete(id);
    if (wasFocused) this.focusedId = null;
    for (const [depth, remembered] of this.previousFocusByModal) {
      if (remembered === id) this.previousFocusByModal.delete(depth);
    }
    this.ensureFocus();
  }

  clear(): void {
    if (this.focusedId) this.controls.get(this.focusedId)?.setFocused(false);
    this.controls.clear();
    this.previousFocusByModal.clear();
    this.focusedId = null;
    this.activeModalDepth = 0;
  }

  get currentId(): string | null {
    this.ensureFocus();
    return this.focusedId;
  }

  get current(): UiFocusableControl | null {
    this.ensureFocus();
    return this.focusedId ? this.controls.get(this.focusedId) ?? null : null;
  }

  get size(): number { return this.controls.size; }

  focus(id: string): boolean {
    this.syncModalDepth();
    const control = this.controls.get(id);
    if (!control || !this.isEligible(control) || (control.modalDepth ?? 0) !== this.activeModalDepth) return false;
    this.applyFocus(id);
    return true;
  }

  focusDefault(): boolean {
    this.syncModalDepth();
    const candidates = this.eligibleControls();
    if (candidates.length === 0) {
      this.applyFocus(null);
      return false;
    }
    const safe = candidates.filter((candidate) => !candidate.destructive);
    const pool = safe.length > 0 ? safe : candidates;
    pool.sort((a, b) => (b.defaultPriority ?? 0) - (a.defaultPriority ?? 0) || (a.order ?? 0) - (b.order ?? 0));
    this.applyFocus(pool[0].id);
    return true;
  }

  move(direction: UiFocusDirection): boolean {
    this.ensureFocus();
    const current = this.current;
    if (!current) return this.focusDefault();
    const explicitId = current.neighbors?.[direction];
    if (explicitId && this.focus(explicitId)) return true;

    const originRect = current.getRect();
    if (!isFiniteRect(originRect)) return false;
    const origin = center(originRect);
    let best: UiFocusableControl | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of this.eligibleControls()) {
      if (candidate.id === current.id) continue;
      const rect = candidate.getRect();
      if (!isFiniteRect(rect)) continue;
      const point = center(rect);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
      if (primary <= 1) continue;
      const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      // Favor the requested half-plane, then favor visually aligned rows/columns.
      const anglePenalty = cross / Math.max(1, primary);
      const score = primary + cross * 1.7 + anglePenalty * 180;
      if (score < bestScore || (score === bestScore && (candidate.order ?? 0) < (best?.order ?? Number.MAX_SAFE_INTEGER))) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) return false;
    this.applyFocus(best.id);
    return true;
  }

  activate(): UiActivationResult {
    const control = this.current;
    if (!control) return 'missing';
    if (control.isDisabled?.() || control.isLocked?.()) return 'blocked';
    control.activate();
    return 'activated';
  }

  adjust(direction: -1 | 1): boolean {
    const control = this.current;
    if (!control?.adjust || control.isDisabled?.() || control.isLocked?.()) return false;
    control.adjust(direction);
    return true;
  }

  scroll(amount: number): boolean {
    const control = this.current;
    if (!control?.scroll || control.isDisabled?.()) return false;
    control.scroll(amount);
    return true;
  }

  invalidate(): void { this.ensureFocus(); }

  private eligibleControls(): UiFocusableControl[] {
    return [...this.controls.values()].filter((control) => (
      (control.modalDepth ?? 0) === this.activeModalDepth && this.isEligible(control)
    ));
  }

  private isEligible(control: UiFocusableControl): boolean {
    return control.isVisible?.() !== false && control.isDisabled?.() !== true;
  }

  private highestVisibleModalDepth(): number {
    let depth = 0;
    for (const control of this.controls.values()) {
      if (control.isVisible?.() === false) continue;
      depth = Math.max(depth, control.modalDepth ?? 0);
    }
    return depth;
  }

  private syncModalDepth(): void {
    const nextDepth = this.highestVisibleModalDepth();
    if (nextDepth === this.activeModalDepth) return;
    if (nextDepth > this.activeModalDepth && this.focusedId) {
      this.previousFocusByModal.set(nextDepth, this.focusedId);
    }
    const previousDepth = this.activeModalDepth;
    this.activeModalDepth = nextDepth;
    const restore = nextDepth < previousDepth ? this.previousFocusByModal.get(previousDepth) : null;
    if (restore && this.controls.has(restore)) {
      this.previousFocusByModal.delete(previousDepth);
      this.applyFocus(restore);
    } else {
      this.applyFocus(null);
    }
  }

  private ensureFocus(): void {
    this.syncModalDepth();
    const current = this.focusedId ? this.controls.get(this.focusedId) : null;
    if (current && this.isEligible(current) && (current.modalDepth ?? 0) === this.activeModalDepth) return;
    this.applyFocus(null);
    this.focusDefault();
  }

  private applyFocus(id: string | null): void {
    if (this.focusedId === id) return;
    if (this.focusedId) this.controls.get(this.focusedId)?.setFocused(false);
    this.focusedId = id;
    if (id) this.controls.get(id)?.setFocused(true);
  }
}

export interface UiRepeatProfile {
  initialDelayMs: number;
  intervalMs: number;
}

export const UI_NAVIGATION_REPEAT: Readonly<UiRepeatProfile> = { initialDelayMs: 330, intervalMs: 105 };
export const UI_SLIDER_REPEAT: Readonly<UiRepeatProfile> = { initialDelayMs: 300, intervalMs: 72 };

/** Shared deterministic repeat timing for stick/D-pad navigation and sliders. */
export class UiInputRepeater<T extends string> {
  private active: T | null = null;
  private nextAt = 0;

  update(value: T | null, now: number, profile: UiRepeatProfile): boolean {
    if (value === null) {
      this.reset();
      return false;
    }
    if (value !== this.active) {
      this.active = value;
      this.nextAt = now + profile.initialDelayMs;
      return true;
    }
    if (now < this.nextAt) return false;
    this.nextAt = now + profile.intervalMs;
    return true;
  }

  reset(): void {
    this.active = null;
    this.nextAt = 0;
  }
}

/** Converts an analog axis into deliberate digital motion with hysteresis. */
export class UiAxisHysteresis {
  private direction: -1 | 0 | 1 = 0;

  update(value: number, engage = 0.72, release = 0.46): -1 | 0 | 1 {
    if (this.direction === 0) {
      if (value <= -engage) this.direction = -1;
      else if (value >= engage) this.direction = 1;
      return this.direction;
    }
    if (Math.abs(value) <= release) this.direction = 0;
    else if (this.direction < 0 && value >= engage) this.direction = 1;
    else if (this.direction > 0 && value <= -engage) this.direction = -1;
    return this.direction;
  }

  reset(): void { this.direction = 0; }
}
