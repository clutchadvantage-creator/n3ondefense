export type ModStatChangeReason = 'recalibrated' | 'reset-native';

export interface ModStatChangedEvent {
  profileId: string;
  instanceId: string;
  modId: string;
  reason: ModStatChangeReason;
}

export type ModStatChangeListener = (event: ModStatChangedEvent) => void;

/** Small event-driven invalidation bus. It carries identity only; consumers
 * always re-read values through resolveModStatState instead of duplicating
 * recalibration math in event handlers. */
class ModStatEventPublisher {
  private readonly listeners = new Set<ModStatChangeListener>();

  subscribe(listener: ModStatChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: ModStatChangedEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('[ModStatEvents] listener failed', error);
      }
    }
  }
}

export const modStatEvents = new ModStatEventPublisher();
