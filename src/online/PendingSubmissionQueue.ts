import type { QueuedSubmission } from './onlineTypes';

const QUEUE_KEY = 'n3on-defense.online.pending-submissions';

const load = (): QueuedSubmission[] => {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((item): item is QueuedSubmission => Boolean(item && typeof item === 'object')) : [];
  } catch { return []; }
};

const save = (items: QueuedSubmission[]): void => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(0, 500))); } catch { /* no-op */ }
};

export class PendingSubmissionQueue {
  static add(item: Omit<QueuedSubmission, 'id' | 'attempts' | 'nextAttemptAt' | 'createdAt'>): void {
    const items = load();
    if (items.some((existing) => existing.runId === item.runId && existing.path === item.path && JSON.stringify(existing.body) === JSON.stringify(item.body))) return;
    items.push({ ...item, id: crypto.randomUUID(), attempts: 0, nextAttemptAt: Date.now(), createdAt: Date.now() });
    save(items);
  }

  static due(): QueuedSubmission[] { return load().filter((item) => item.nextAttemptAt <= Date.now()); }
  static remove(id: string): void { save(load().filter((item) => item.id !== id)); }
  static retry(id: string): void {
    const items = load();
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    item.attempts += 1;
    item.nextAttemptAt = Date.now() + Math.min(300_000, 2 ** item.attempts * 2_000);
    save(items);
  }
  static count(): number { return load().length; }
}
