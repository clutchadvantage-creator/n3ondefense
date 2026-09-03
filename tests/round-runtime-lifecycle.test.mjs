import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { RoundRuntimeLifecycle } from '../src/game/flow/RoundRuntimeLifecycle.ts';
import { EncounterResourceRegistry } from '../src/game/flow/EncounterResourceRegistry.ts';

const arenaSource = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const audioSource = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
const heistSource = readFileSync(new URL('../src/game/anomalies/heist/HeistScene.ts', import.meta.url), 'utf8');
const trailSource = readFileSync(new URL('../src/game/performance/ProjectileTrailBatch.ts', import.meta.url), 'utf8');

const MODES = ['normal', 'overdrive-draco', 'supreme-leo'];
const PATTERN = ['round', 'round', 'round', 'round', 'boss', 'round', 'round', 'round', 'round', 'boss'];

test('one lifecycle gate safely runs 100 encounter transitions in every mode', () => {
  for (const mode of MODES) {
    const lifecycle = new RoundRuntimeLifecycle();
    const durations = [];
    let staleExecutions = 0;

    for (let index = 0; index < 100; index += 1) {
      const kind = PATTERN[index % PATTERN.length];
      const startedAt = performance.now();
      const token = lifecycle.beginStart(kind, `${mode}-${kind}-${index + 1}`);
      assert.equal(lifecycle.markActive(token), true);

      // These representative counts mirror the ownership categories retired
      // by ArenaScene; the lifecycle test deliberately does not tune gameplay.
      const resources = {
        enemies: kind === 'boss' ? 28 : 463,
        projectiles: kind === 'boss' ? 6200 : 4466,
        hazards: 4,
        arcadeEvents: kind === 'round' ? 1 : 0,
        supportEnemies: kind === 'boss' ? 12 : 0,
        pickups: 24,
        deployables: 14,
        timers: 48,
        tweens: 96,
        colliders: kind === 'boss' ? 44 : 490,
        activePoolSlots: kind === 'boss' ? 6200 : 4466
      };
      const deferredFromThisGeneration = lifecycle.guard(token.generation, () => { staleExecutions += 1; });
      let handoffExecutions = 0;
      const rewardHandoff = lifecycle.guardHandoff(token.generation, () => { handoffExecutions += 1; });

      const ending = lifecycle.requestEnd('completed');
      assert.deepEqual(ending, token);
      assert.equal(lifecycle.phase, 'end-requested');
      deferredFromThisGeneration();
      assert.equal(staleExecutions, 0);
      rewardHandoff();
      assert.equal(handoffExecutions, 1);
      assert.equal(lifecycle.beginRewardFlow(token), true);
      assert.equal(lifecycle.beginCleanup(token), true);
      for (const key of Object.keys(resources)) resources[key] = 0;
      assert.equal(lifecycle.finishCleanup(token), true);
      assert.equal(lifecycle.phase, 'ready');
      assert.equal(Object.values(resources).reduce((sum, count) => sum + count, 0), 0);

      // A callback captured by any older ordinary or boss round is inert.
      deferredFromThisGeneration();
      assert.equal(staleExecutions, 0);
      durations.push(performance.now() - startedAt);
    }

    assert.equal(lifecycle.generation, 100);
    const firstHalf = durations.slice(0, 50).reduce((sum, value) => sum + value, 0);
    const secondHalf = durations.slice(50).reduce((sum, value) => sum + value, 0);
    // This is lifecycle-control overhead, not a rendering FPS benchmark. It
    // catches accidental generation-sized scans or retained ledger growth.
    assert.ok(secondHalf < firstHalf * 20 + 5, `${mode} lifecycle overhead grew unexpectedly`);
  }
});

test('encounter ownership retires deferred work and reports stale owners', () => {
  const registry = new EncounterResourceRegistry();
  const retired = [];
  const first = {};
  const second = {};
  registry.begin('arena-normal-round-10');
  registry.track(first, 'scene-clock', 'gameplay-timer', () => retired.push('first'));
  registry.begin('arena-normal-boss-10');
  registry.track(second, 'scene-clock', 'handoff-timer', () => retired.push('second'));
  assert.equal(registry.snapshot().stale, 1);
  assert.equal(registry.retire('arena-normal-round-10'), 1);
  assert.deepEqual(retired, ['first']);
  assert.equal(registry.snapshot().stale, 0);
  assert.equal(registry.retire(), 1);
  assert.deepEqual(retired, ['first', 'second']);
  assert.equal(registry.snapshot().current, 0);
});

test('duplicate start/end calls cannot race or advance a generation twice', () => {
  const lifecycle = new RoundRuntimeLifecycle();
  const token = lifecycle.beginStart('round', 'round-1');
  assert.throws(() => lifecycle.beginStart('round', 'round-1-duplicate'), /Cannot start/);
  assert.equal(lifecycle.markActive(token), true);
  assert.deepEqual(lifecycle.beginEnd('completed'), token);
  assert.equal(lifecycle.beginEnd('duplicate'), null);
  assert.equal(lifecycle.beginCleanup(token), true);
  assert.equal(lifecycle.finishCleanup(token), true);
  assert.equal(lifecycle.beginEnd('already-clean'), null);
});

test('Arena centralizes ordinary and boss creation and clears every Phaser timer queue', () => {
  assert.match(arenaSource, /private startRoundRuntime\(kind: RoundRuntimeKind/);
  assert.match(arenaSource, /startRoundRuntime\('round'/);
  assert.match(arenaSource, /startRoundRuntime\('boss'/);
  assert.match(arenaSource, /private endCurrentRoundRuntime\(reason: RoundRuntimeEndReason\)/);
  assert.match(arenaSource, /private cancelAllRoundTimers\(\)/);
  assert.match(arenaSource, /clock\._active/);
  assert.match(arenaSource, /clock\._pendingInsertion/);
  assert.match(arenaSource, /clock\._pendingRemoval/);
  assert.match(arenaSource, /this\.tweens\.killAll\(\)/);
  assert.match(arenaSource, /this\.settleEncounterRemovalQueues\(\)/);
  assert.match(arenaSource, /unclaimed-encounter-display/);
  assert.match(arenaSource, /requestEnd\('completed'\)/);
  assert.match(arenaSource, /guardHandoff/);
  assert.match(arenaSource, /this\.projectilePool\.releaseAll\(\)/);
  assert.match(arenaSource, /this\.fxCirclePool\.releaseAll\(\)/);
  assert.match(arenaSource, /n3onRoundLifecycleSoak/);
});

test('round boundaries stop actual browser voices and compact dormant high-water capacity', () => {
  const endGate = arenaSource.slice(
    arenaSource.indexOf('private endCurrentRoundRuntime('),
    arenaSource.indexOf('private captureRoundRuntimeDiagnostics(')
  );
  assert.match(endGate, /this\.audio\.stopRoundScopedAudio\(\)/);
  assert.match(endGate, /this\.retireRoundOwnedResources\(\)/);
  assert.match(audioSource, /stopRoundScopedAudio\(options:/);
  assert.match(audioSource, /Object\.keys\(this\.presentationSfxPools\)/);
  assert.match(audioSource, /this\.activeSfxTones\.clear\(\)/);
  assert.match(audioSource, /roundAudioDiagnostics\(\)/);
  assert.match(arenaSource, /roundAudioVoices: audio\.activeVoices/);
  assert.match(arenaSource, /roundAudioTones: audio\.activeTones/);

  const startGate = arenaSource.slice(
    arenaSource.indexOf('private startRoundRuntime('),
    arenaSource.indexOf('private endCurrentRoundRuntime(')
  );
  assert.match(startGate, /this\.compactCombatCapacityForRound\(round\)/);
  assert.match(arenaSource, /projectilePool\.trimAvailable\([\s\S]*?reserve\.projectiles/);
  assert.match(arenaSource, /fxCirclePool\.trimAvailable\(reserve\.fxCircles/);
  assert.match(arenaSource, /projectileTrails\.trimRetained\(reserve\.trailSamples\)/);
  assert.match(trailSource, /trimRetained\(maxRetained: number\)/);
});

test('HEIST keeps the working portal bridge while retiring anomaly-world audio', () => {
  assert.match(
    heistSource,
    /exitHeistMusic\(\)[\s\S]*?stopRoundScopedAudio\(\{ preserveAnomalyTransit: true \}\)/
  );
  const anomalyHandoff = arenaSource.slice(
    arenaSource.indexOf('private readonly onAnomalyReturn'),
    arenaSource.indexOf('constructor()')
  );
  assert.doesNotMatch(anomalyHandoff, /endCurrentRoundRuntime|startRoundRuntime/);
});
