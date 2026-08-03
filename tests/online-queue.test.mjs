import test from 'node:test';
import assert from 'node:assert/strict';
import { PendingSubmissionQueue } from '../src/online/PendingSubmissionQueue.ts';

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const submission = {
  profileId: 'profile-1', runId: 'run-1', runToken: 'token',
  path: '/v1/runs/run-1/complete', kind: 'completion',
  body: { idempotency_key: 'run-1-complete-key' }
};

test('duplicate completion retries retain one idempotent queue item', () => {
  localStorage.clear();
  PendingSubmissionQueue.add(submission);
  PendingSubmissionQueue.add(submission);
  assert.equal(PendingSubmissionQueue.count(), 1);
  assert.equal(PendingSubmissionQueue.due()[0].body.idempotency_key, 'run-1-complete-key');
});

test('retry backs an item off without changing its run identity', () => {
  localStorage.clear();
  PendingSubmissionQueue.add(submission);
  const item = PendingSubmissionQueue.due()[0];
  PendingSubmissionQueue.retry(item.id);
  assert.equal(PendingSubmissionQueue.count(), 1);
  assert.equal(PendingSubmissionQueue.due().length, 0);
});
