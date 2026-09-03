import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RoundRuntimeLifecycle } from '../src/game/flow/RoundRuntimeLifecycle.ts';
import { EncounterResourceRegistry } from '../src/game/flow/EncounterResourceRegistry.ts';

const arenaSource = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const anomalySource = readFileSync(new URL('../src/game/anomalies/AnomalyReturnLifecycle.ts', import.meta.url), 'utf8');

const MODES = ['normal', 'overdrive-draco', 'supreme-leo'];
const BOSSES = ['artillery-sentry', 'storm-mage', 'void-brawler'];
const REWARDS = ['none', 'standard', 'corrupted', 'legendary', 'supreme'];
const INPUTS = ['mouse', 'gamepad'];

test('mode, boss, reward, and input matrix converges through one clean encounter contract', () => {
  const lifecycle = new RoundRuntimeLifecycle();
  const resources = new EncounterResourceRegistry();
  let transitions = 0;
  let staleGameplayExecutions = 0;

  for (const mode of MODES) {
    for (const boss of BOSSES) {
      for (const reward of REWARDS) {
        for (const input of INPUTS) {
          const label = `arena-${mode}-boss-${boss}-${reward}-${input}`;
          const token = lifecycle.beginStart('boss', label);
          resources.begin(label);
          assert.equal(lifecycle.markActive(token), true);

          const oldTimer = {};
          const oldTween = {};
          const retired = [];
          resources.track(oldTimer, 'scene-clock', 'gameplay-timer', () => retired.push('timer'));
          resources.track(oldTween, 'presentation', 'reward-tween', () => retired.push('tween'));
          const staleGameplay = lifecycle.guard(token.generation, () => { staleGameplayExecutions += 1; });
          let handoffs = 0;
          const rewardHandoff = lifecycle.guardHandoff(token.generation, () => { handoffs += 1; });

          assert.deepEqual(lifecycle.requestEnd('completed'), token);
          staleGameplay();
          assert.equal(staleGameplayExecutions, 0);
          assert.equal(lifecycle.beginRewardFlow(token), true);
          rewardHandoff();
          assert.equal(handoffs, 1);
          assert.equal(resources.retire(label), 2);
          assert.deepEqual(retired.sort(), ['timer', 'tween']);
          assert.equal(lifecycle.beginCleanup(token), true);
          assert.equal(lifecycle.finishCleanup(token), true);
          assert.equal(resources.snapshot().current, 0);

          // A reveal completion or Next Fight activation that arrives after
          // teardown cannot re-enter the retired generation.
          rewardHandoff();
          staleGameplay();
          assert.equal(handoffs, 1);
          assert.equal(lifecycle.phase, 'ready');
          transitions += 1;
        }
      }
    }
  }

  assert.equal(transitions, 90);
  assert.equal(lifecycle.generation, transitions);
  assert.equal(lifecycle.diagnostics().starts, transitions);
  assert.equal(lifecycle.diagnostics().activations, transitions);
  assert.equal(lifecycle.diagnostics().rewardFlows, transitions);
  assert.equal(lifecycle.diagnostics().cleanups, transitions);
  assert.equal(lifecycle.diagnostics().rejectedGameplayCallbacks, transitions * 2);
  assert.equal(lifecycle.diagnostics().rejectedHandoffCallbacks, transitions);
});

test('ordinary, milestone, mercy, and boss handoffs use the shared lifecycle gates', () => {
  assert.match(arenaSource, /roundRuntime\.requestEnd\('completed'\)/);
  assert.match(arenaSource, /roundRuntime\.requestEnd\('defeated'\)/);
  assert.match(arenaSource, /roundRuntime\.beginRewardFlow\(endToken\)/);
  assert.match(arenaSource, /transitionAfterModReveals/);
  assert.match(arenaSource, /scheduleRoundHandoffCall/);
  assert.match(arenaSource, /roundRuntime\.claimCleanup\(reason\)/);
  assert.match(arenaSource, /startRoundRuntime\('round'/);
  assert.match(arenaSource, /startRoundRuntime\('boss'/);
  assert.match(arenaSource, /duplicate HUD creation/);
  assert.match(arenaSource, /settleEncounterRemovalQueues/);
  assert.match(arenaSource, /pendingPhysicsBodies/);
});

test('anomaly return remains a suspension/restoration boundary, not a new encounter', () => {
  const wakeHandler = arenaSource.slice(
    arenaSource.indexOf('private readonly onArenaWoken'),
    arenaSource.indexOf('constructor()')
  );
  assert.doesNotMatch(wakeHandler, /startRoundRuntime|endCurrentRoundRuntime/);
  assert.match(wakeHandler, /anomalyReturnLifecycle\.beginRestore/);
  assert.match(anomalySource, /beginRestore/);
});
