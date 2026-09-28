import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseWorldEvent, WorldEventRotation, normalizeWorldEventRotation, WORLD_EVENT_TIMING } from '../src/game/arcade/WorldEventRotation.ts';

const pool = [
  ...['golden-hunt', 'mini-boss', 'neon-circuit', 'hot-package', 'packet-snatcher', 'redline'].map(id => ({ kind: 'arcade', id })),
  ...['heist', 'skybreach'].map(id => ({ kind: 'anomaly', id }))
];
const advance = (rotation, ms, start, eligible = true, active = false) => {
  for (let remaining = ms; remaining > 0; remaining -= 250)
    rotation.update(Math.min(remaining, 250), eligible, active, start);
};

test('every Arcade event and anomaly owns an identical interval in the same random draw', () => {
  const counts = new Map(pool.map(entry => [entry.id, 0]));
  for (let i = 0; i < 8000; i++) {
    const entry = chooseWorldEvent(pool, (i + .5) / 8000);
    counts.set(entry.id, counts.get(entry.id) + 1);
  }
  assert.deepEqual([...counts.values()], Array(8).fill(1000));
  pool.forEach((entry, i) => assert.equal(chooseWorldEvent(pool, i / 8), entry));
  assert.equal(chooseWorldEvent(pool, 1), pool.at(-1));
  assert.equal(chooseWorldEvent([], .5), undefined);
});

test('each due opportunity selects an event without a second chance roll', () => {
  const observed = new Set();
  for (let seed = 1; seed <= 1000; seed++) {
    let count = 0;
    const rotation = new WorldEventRotation(seed, pool, { remainingMs: 0, drawIndex: 1 });
    rotation.update(1, true, false, entry => { observed.add(entry.id); count++; return true; });
    assert.equal(count, 1);
    assert.equal(rotation.snapshot.remainingMs, WORLD_EVENT_TIMING.cooldownMs);
  }
  assert.equal(observed.size, 8);
});

test('the previous event is excluded while all seven alternatives retain equal chances', () => {
  for (const previous of pool) {
    const counts = new Map(pool.map(entry => [entry.id, 0]));
    for (let i = 0; i < 700; i++) {
      const entry = chooseWorldEvent(pool, (i + .5) / 700, `${previous.kind}:${previous.id}`);
      counts.set(entry.id, counts.get(entry.id) + 1);
    }
    for (const entry of pool) assert.equal(counts.get(entry.id), entry.id === previous.id ? 0 : 100);
  }
});

test('no immediate repeats across serialized round handoffs; an event may return after another', () => {
  let rotation = new WorldEventRotation(4, pool.slice(-2), { remainingMs: 0, drawIndex: 1 });
  const starts = [];
  for (let i = 0; i < 20; i++) {
    rotation.update(1, true, false, entry => { starts.push(entry.id); return true; });
    const state = normalizeWorldEventRotation(JSON.parse(JSON.stringify(rotation.snapshot)));
    assert.equal(state.lastStarted, `anomaly:${starts.at(-1)}`);
    rotation = new WorldEventRotation(4, pool.slice(-2), { ...state, remainingMs: 0 });
  }
  for (let i = 1; i < starts.length; i++) assert.notEqual(starts[i], starts[i - 1]);
  assert.equal(starts[0], starts[2]);
});

test('failed placement does not replace last-started history or allow a stale pending repeat', () => {
  const rotation = new WorldEventRotation(3, pool, { remainingMs: 0, drawIndex: 1,
    lastStarted: 'anomaly:heist', pending: 'anomaly:heist' });
  let selected;
  rotation.update(1, true, false, entry => { selected = entry; return false; });
  assert.notEqual(selected.id, 'heist');
  assert.equal(rotation.snapshot.lastStarted, 'anomaly:heist');
  const pending = rotation.snapshot.pending;
  advance(rotation, WORLD_EVENT_TIMING.placementRetryMs, entry => {
    assert.equal(`${entry.kind}:${entry.id}`, pending); return true;
  });
  assert.equal(rotation.snapshot.lastStarted, pending);
});

test('short-round handoffs preserve the same selection sequence as uninterrupted eligible time', () => {
  const continuous = new WorldEventRotation(123, pool);
  let split = new WorldEventRotation(123, pool);
  const first = [], second = [];
  advance(continuous, 300_000, entry => { first.push(entry.id); return true; });
  for (let i = 0; i < 15; i++) {
    advance(split, 20_000, entry => { second.push(entry.id); return true; });
    split = new WorldEventRotation(123, pool, split.snapshot);
  }
  assert.deepEqual(second, first);
  assert.deepEqual(split.snapshot, continuous.snapshot);
});

test('bosses, pauses, and active events hold the common clock and consume no random draw', () => {
  const rotation = new WorldEventRotation(19, pool);
  const before = rotation.snapshot;
  const forbidden = () => assert.fail('event attempted while excluded');
  advance(rotation, 300_000, forbidden, false);
  advance(rotation, 300_000, forbidden, true, true);
  assert.deepEqual(rotation.snapshot, before);
});

test('unsafe placement retries the same selection across rounds instead of biasing toward other types', () => {
  let rotation = new WorldEventRotation(42, pool, { remainingMs: 0, drawIndex: 1 });
  const attempts = [];
  const fail = entry => { attempts.push(entry.id); return false; };
  rotation.update(1, true, false, fail);
  const drawn = rotation.snapshot.drawIndex;
  for (let i = 0; i < 4; i++) {
    rotation = new WorldEventRotation(42, pool, rotation.snapshot);
    advance(rotation, WORLD_EVENT_TIMING.placementRetryMs, fail);
  }
  assert.equal(new Set(attempts).size, 1);
  assert.equal(rotation.snapshot.drawIndex, drawn);
  advance(rotation, WORLD_EVENT_TIMING.placementRetryMs, () => true);
  assert.equal(rotation.snapshot.pending, undefined);
});

test('fresh deployments and malformed carried snapshots cannot inherit a permanent lockout', () => {
  for (const state of [null, {}, { remainingMs: Infinity, drawIndex: 1 }, { remainingMs: -1, drawIndex: 1 }, { remainingMs: 0, drawIndex: NaN }])
    assert.equal(normalizeWorldEventRotation(state), undefined);
  const fresh = new WorldEventRotation(2, pool).snapshot;
  assert.ok(fresh.remainingMs >= 28000 && fresh.remainingMs <= 52000);
  assert.equal(fresh.pending, undefined);
  const snapshot = new WorldEventRotation(2, pool).snapshot;
  snapshot.remainingMs = 0;
  assert.deepEqual(new WorldEventRotation(2, pool).snapshot, fresh);
});
