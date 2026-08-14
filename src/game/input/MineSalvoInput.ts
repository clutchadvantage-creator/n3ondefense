export const FULL_RACK_SALVO_HOLD_MS = 250;

export type MineSalvoInputResolution = 'tap' | 'salvo';

/**
 * Timer-free tap/hold resolver. ArenaScene polls it with the scene clock, so
 * pausing, shutting down, or changing rounds cannot leave a delayed callback.
 */
export class MineSalvoInput {
  private heldBinding: string | null = null;
  private pressedAt = 0;
  private holdResolved = false;

  press(binding: string, now: number): boolean {
    if (this.heldBinding !== null) return false;
    this.heldBinding = binding;
    this.pressedAt = now;
    this.holdResolved = false;
    return true;
  }

  update(now: number): MineSalvoInputResolution | null {
    if (this.heldBinding === null || this.holdResolved) return null;
    if (now - this.pressedAt < FULL_RACK_SALVO_HOLD_MS) return null;
    this.holdResolved = true;
    return 'salvo';
  }

  release(binding: string, now: number): MineSalvoInputResolution | null {
    if (binding !== this.heldBinding) return null;
    const resolution = this.holdResolved
      ? null
      : now - this.pressedAt >= FULL_RACK_SALVO_HOLD_MS ? 'salvo' : 'tap';
    this.cancel();
    return resolution;
  }

  cancel(): void {
    this.heldBinding = null;
    this.pressedAt = 0;
    this.holdResolved = false;
  }
}
