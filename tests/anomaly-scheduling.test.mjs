import test from 'node:test';
import assert from 'node:assert/strict';
import { AnomalyOpportunityClock, normalizeAnomalyOpportunityMs } from '../src/game/anomalies/AnomalyOpportunityClock.ts';
import { ANOMALY_SCHEDULING, getEligibleAnomalies } from '../src/game/anomalies/AnomalyRegistry.ts';

const advance = (clock, ms, eligible = true) => {
  for (let remaining = ms; remaining > 0; remaining -= 250) clock.advance(Math.min(remaining, 250), eligible);
};

test('short rounds preserve an opportunity rather than restarting its initial delay', () => {
  let clock = new AnomalyOpportunityClock(100_000);
  for (let round = 0; round < 3; round++) {
    advance(clock, 30_000);
    assert.equal(clock.ready, false);
    clock = new AnomalyOpportunityClock(138_000, clock.snapshot);
  }
  assert.equal(clock.snapshot, 10_000);
  advance(clock, 10_000);
  assert.equal(clock.ready, true);
  assert.equal(new AnomalyOpportunityClock(138_000, clock.snapshot).ready, true);
});

test('boss/Arcade/pause exclusions hold remaining eligible time without resetting it', () => {
  const clock = new AnomalyOpportunityClock(72_000);
  advance(clock, 22_000);
  advance(clock, 600_000, false);
  assert.equal(clock.snapshot, 50_000);
  advance(clock, 50_000);
  assert.equal(clock.ready, true);
});

test('miss delays and completed-opportunity cooldowns survive encounter handoffs', () => {
  for (const delay of [ANOMALY_SCHEDULING.retryAfterMissMs, ANOMALY_SCHEDULING.cooldownMs]) {
    const clock = new AnomalyOpportunityClock(72_000);
    clock.defer(delay);
    advance(clock, 20_000);
    const next = new AnomalyOpportunityClock(138_000, clock.snapshot);
    assert.equal(next.snapshot, delay - 20_000);
    advance(next, delay - 20_000);
    assert.equal(next.ready, true);
  }
});

test('invalid carried time cannot suppress anomalies forever; fresh deployments start fresh', () => {
  for (const invalid of [NaN, Infinity, -1, '0', null]) {
    assert.equal(normalizeAnomalyOpportunityMs(invalid), undefined);
    assert.equal(new AnomalyOpportunityClock(72_000, invalid).snapshot, 72_000);
  }
  assert.equal(normalizeAnomalyOpportunityMs(1e9), ANOMALY_SCHEDULING.cooldownMs);
  const fresh = new AnomalyOpportunityClock(72_000);
  for (const delta of [NaN, Infinity, -250, 0]) fresh.advance(delta, true);
  assert.equal(fresh.snapshot, 72_000);
});

test('both anomalies are available from the first ordinary round in every mode', () => {
  for (const protocol of ['normal', 'overdrive-phoenix', 'supreme-phoenix'])
    assert.deepEqual(getEligibleAnomalies(1, protocol).map(d => d.id), ['heist', 'skybreach']);
});
