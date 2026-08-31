export type WalletCurrency = 'credits' | 'coreTokens' | 'plasmaChips' | 'fluxCores';

export interface WalletSnapshot {
  profileId: string;
  credits: number;
  coreTokens: number;
  plasmaChips: number;
  fluxCores: number;
}

export interface WalletChange {
  previous: WalletSnapshot;
  current: WalletSnapshot;
  deltas: Record<WalletCurrency, number>;
}

export type WalletChangeListener = (change: WalletChange) => void;

const CURRENCIES: readonly WalletCurrency[] = ['credits', 'coreTokens', 'plasmaChips', 'fluxCores'];
const copySnapshot = (snapshot: WalletSnapshot): WalletSnapshot => ({ ...snapshot });

const sameWallet = (left: WalletSnapshot, right: WalletSnapshot): boolean =>
  left.profileId === right.profileId && CURRENCIES.every((currency) => left[currency] === right[currency]);

/**
 * Tiny synchronous publisher for presentation surfaces. The player profile is
 * still the sole source of truth; this only tells mounted HUD/menu readouts to
 * re-read it after an atomic save transaction.
 */
export class WalletStatePublisher {
  private current: WalletSnapshot | null = null;
  private readonly listeners = new Set<WalletChangeListener>();

  prime(snapshot: WalletSnapshot | null): void {
    this.current = snapshot ? copySnapshot(snapshot) : null;
  }

  publish(snapshot: WalletSnapshot, force = false): boolean {
    const next = copySnapshot(snapshot);
    const profileChanged = Boolean(this.current && this.current.profileId !== next.profileId);
    const previous = this.current && !profileChanged ? copySnapshot(this.current) : copySnapshot(next);
    if (!force && this.current && sameWallet(this.current, next)) return false;
    this.current = next;
    const deltas = {} as Record<WalletCurrency, number>;
    for (const currency of CURRENCIES) deltas[currency] = next[currency] - previous[currency];
    const change: WalletChange = { previous, current: copySnapshot(next), deltas };
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error('[WalletState] listener failed', error);
      }
    }
    return true;
  }

  subscribe(listener: WalletChangeListener, emitCurrent = true): () => void {
    this.listeners.add(listener);
    if (emitCurrent && this.current) {
      const current = copySnapshot(this.current);
      listener({
        previous: copySnapshot(current),
        current,
        deltas: { credits: 0, coreTokens: 0, plasmaChips: 0, fluxCores: 0 }
      });
    }
    return () => this.listeners.delete(listener);
  }
}

export const walletState = new WalletStatePublisher();
