export interface OperativeAppearanceSnapshot {
  textureKey: string;
  /** Null means the authored texture is displayed without a full-sprite tint. */
  tint: number | null;
}

export type OperativeAppearanceResolver = (timeMs: number) => OperativeAppearanceSnapshot;

export interface OperativeAppearanceTarget {
  isActive(): boolean;
  getTextureKey(): string;
  setTexture(textureKey: string): void;
  clearTint(): void;
  setTint(color: number): void;
  setTintFill(color: number): void;
}

/**
 * Owns the temporary damage override and the one authoritative path back to an
 * Operative's current cosmetic appearance. The controller never caches the
 * resolved texture/tint: restoration deliberately asks the resolver again so
 * a cosmetic change made during a flash wins when that flash ends.
 */
export class OperativeAppearanceController {
  private readonly target: OperativeAppearanceTarget;
  private resolver: OperativeAppearanceResolver;
  private damageFlashActive = false;
  private damageFlashUntil = 0;

  constructor(
    target: OperativeAppearanceTarget,
    resolver: OperativeAppearanceResolver
  ) {
    this.target = target;
    this.resolver = resolver;
  }

  setResolver(resolver: OperativeAppearanceResolver): void {
    this.resolver = resolver;
  }

  beginDamageFlash(now: number, durationMs: number): void {
    this.damageFlashActive = true;
    // A new hit owns the single active flash window. There are no delayed
    // callbacks that can later restore an older texture or tint.
    this.damageFlashUntil = now + Math.max(0, durationMs);
    if (this.target.isActive()) this.target.setTintFill(0xffffff);
  }

  update(now: number): void {
    if (!this.damageFlashActive || now < this.damageFlashUntil) return;
    this.damageFlashActive = false;
    this.applyResolvedAppearance(now, true);
  }

  /**
   * Refreshes the current appearance. A normal refresh cannot interrupt active
   * hit feedback; a round/reset boundary can explicitly cancel the flash.
   */
  restore(now: number, cancelDamageFlash = false): boolean {
    if (cancelDamageFlash) {
      this.damageFlashActive = false;
      this.damageFlashUntil = 0;
    } else if (this.damageFlashActive && now < this.damageFlashUntil) {
      return false;
    }
    return this.applyResolvedAppearance(now, cancelDamageFlash);
  }

  get isDamageFlashing(): boolean {
    return this.damageFlashActive;
  }

  private applyResolvedAppearance(now: number, resetTintMode = false): boolean {
    if (!this.target.isActive()) return false;
    const appearance = this.resolver(now);
    const textureChanged = this.target.getTextureKey() !== appearance.textureKey;
    if (textureChanged) {
      this.target.setTexture(appearance.textureKey);
    }
    // clearTint removes the temporary TintFill mode as well as any prior
    // override. Native Palette intentionally stops here; other palettes then
    // apply their current instance tint to the cached texture.
    if (resetTintMode || textureChanged || appearance.tint === null) this.target.clearTint();
    if (appearance.tint !== null) this.target.setTint(appearance.tint);
    return true;
  }
}
