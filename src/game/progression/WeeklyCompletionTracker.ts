import type { WeeklyOperationDecksSnapshot } from './WeeklyOperations.ts';
import type { HudNotification } from '../ui/HudNotificationQueue.ts';

/** Observes projected live counters; never grants rewards or mutates the save. */
export class WeeklyCompletionTracker {
  private previous: WeeklyOperationDecksSnapshot;
  constructor(previous: WeeklyOperationDecksSnapshot) { this.previous = previous; }

  update(snapshot: WeeklyOperationDecksSnapshot, notify: (notice: HudNotification) => void): void {
    for (const deck of ['regular', 'overdrive'] as const) {
      const before = this.previous[deck], current = snapshot[deck];
      if (before.rotationId !== current.rotationId) continue;
      for (const objective of current.objectives) {
        if (!objective.complete || before.objectives.find(item => item.id === objective.id)?.complete !== false) continue;
        notify({ category: 'weekly', heading: 'WEEKLY CHALLENGE COMPLETE', message: objective.title,
          secondary: `${objective.description} // ${deck === 'overdrive' ? 'OVERDRIVE' : 'REGULAR'}`,
          durationMs: 2900, priority: 2, key: `weekly:${current.rotationId}:${objective.id}` });
      }
      if (current.complete && !before.complete) notify({ category: 'weekly', heading: 'WEEKLY DECK COMPLETE',
        message: `${deck === 'overdrive' ? 'OVERDRIVE' : 'REGULAR'} OPERATIONS`,
        // Rewards belong to the full deck, never to each individual objective.
        // The existing Garage resolver still owns collection, including independent Mod rewards.
        secondary: 'View weekly rewards in Garage', durationMs: 2900, priority: 2,
        key: `weekly-deck:${current.rotationId}` });
    }
    this.previous = snapshot;
  }
}
