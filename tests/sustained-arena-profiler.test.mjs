import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaLifecycleProfiler } from '../src/game/performance/ArenaLifecycleProfiler.ts';

test('generation profiling detects late slowdown with bounded storage and lifetime allocation counts', () => {
  const profiler = new ArenaLifecycleProfiler();
  profiler.beginGeneration(1, 'round 68', 5, 100, 200);
  for (let i = 0; i < 600; i++) profiler.recordFrame(16, 100, 200);
  for (let i = 0; i < 600; i++) profiler.recordFrame(30, 103, 202);
  const report = profiler.report().generations[0];
  assert.equal(report.framesSampled, 1200);
  assert.equal(report.frameTime.samples, 600);
  assert.equal(report.frameTime.averageMs, 30);
  assert.equal(report.projectileAllocationsDuringSample, 3);
  assert.equal(report.fxAllocationsDuringSample, 2);
  profiler.finishGeneration('complete');
  profiler.beginGeneration(2, 'round 69', 4, 103, 202);
  profiler.recordFrame(16, 103, 202);
  assert.equal(profiler.report().generations[1].frameTime.averageMs, 16);
});
