import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidAnomalyEntryCost, normalizeAnomalyEntryCost, rollAnomalyEntryCost } from '../src/game/anomalies/AnomalyPricing.ts';

test('shared anomaly quotes include both boundaries and every integer price across repeated rolls', () => {
  const seen = new Set();
  for (let n = 0; n <= 10000; n++) {
    const price = rollAnomalyEntryCost(n / 10000);
    assert.ok(isValidAnomalyEntryCost(price));
    seen.add(price);
  }
  assert.equal(seen.size, 56);
  assert.equal(rollAnomalyEntryCost(0), 35);
  assert.equal(rollAnomalyEntryCost(1), 90);
});

test('invalid or legacy forced prices normalize before quote publication; transaction validation rejects them', () => {
  for (const value of [-100, 0, 34, 91, 150, 250, NaN, Infinity, -Infinity, 35.5]) {
    assert.equal(isValidAnomalyEntryCost(value), false);
    assert.ok(isValidAnomalyEntryCost(normalizeAnomalyEntryCost(value)));
  }
  assert.equal(normalizeAnomalyEntryCost(35), 35);
  assert.equal(normalizeAnomalyEntryCost(90), 90);
  assert.equal(normalizeAnomalyEntryCost(250), 90);
  assert.equal(normalizeAnomalyEntryCost(-1), 35);
});
