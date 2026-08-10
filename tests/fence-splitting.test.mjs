import assert from 'node:assert/strict';
import test from 'node:test';
import { ABILITY_BALANCE } from '../src/game/config/balance/index.ts';
import { MAX_DISTINCT_FENCE_SPLITS, resolveFenceSplitStage } from '../src/game/abilities/FenceSplitRules.ts';

test('two distinct operative fences stack the native fan from four to eight streams', () => {
  const firstFence = resolveFenceSplitStage(
    ABILITY_BALANCE.fence.projectileFanCount,
    ABILITY_BALANCE.fence.projectileFanDamageShare,
    0
  );
  const secondFence = resolveFenceSplitStage(
    ABILITY_BALANCE.fence.projectileFanCount,
    ABILITY_BALANCE.fence.projectileFanDamageShare,
    1
  );

  assert.deepEqual(firstFence, { streamCount: 4, damageShare: 0.45 });
  assert.deepEqual(secondFence, { streamCount: 2, damageShare: 1 });
  assert.equal(firstFence.streamCount * secondFence.streamCount, 8);
  assert.equal(resolveFenceSplitStage(4, 0.45, MAX_DISTINCT_FENCE_SPLITS), null);
});

test('a second fence doubles every Jailbroke Turrets rank without runaway later splits', () => {
  for (const initialStreams of [1, 2, 3, 4]) {
    const firstFence = resolveFenceSplitStage(initialStreams, 0.45, 0);
    const secondFence = resolveFenceSplitStage(initialStreams, 0.45, 1);
    assert.equal(firstFence.streamCount * secondFence.streamCount, initialStreams * 2);
  }
});
