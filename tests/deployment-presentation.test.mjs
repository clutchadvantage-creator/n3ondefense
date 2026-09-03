import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { arenaCombatWarmupPlan } from '../src/game/performance/ArenaRuntimePreparation.ts';
import { resolveMechanicalFragmentBudget } from '../src/game/vfx/MechanicalDestructionBudget.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('combat preparation reserves mechanical debris without capping gameplay entities', () => {
  const normal = arenaCombatWarmupPlan('normal', 30, true);
  const overdrive = arenaCombatWarmupPlan('overdrive-draco', 30, true);
  const supreme = arenaCombatWarmupPlan('supreme-leo', 51, true);
  assert.ok(normal.destructionFragments >= 64);
  assert.ok(overdrive.destructionFragments > normal.destructionFragments);
  assert.ok(supreme.destructionFragments > overdrive.destructionFragments);
  assert.ok(supreme.projectiles >= overdrive.projectiles);
});

test('mechanical destruction preserves detail at low load and degrades optional fragments predictably', () => {
  assert.deepEqual(resolveMechanicalFragmentBudget(7, 0, 168), { count: 7, degraded: false });
  assert.deepEqual(resolveMechanicalFragmentBudget(7, 90, 168), { count: 5, degraded: true });
  assert.deepEqual(resolveMechanicalFragmentBudget(7, 130, 168), { count: 3, degraded: true });
  assert.deepEqual(resolveMechanicalFragmentBudget(7, 160, 168), { count: 1, degraded: true });
});

test('deployment confirmation and arena startup remain subordinate to authoritative transition/lifecycle gates', () => {
  const loading = source('../src/game/scenes/LoadingScene.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const transition = source('../src/game/flow/RunTransitionManager.ts');
  assert.match(loading, /DEPLOYMENT READY/);
  assert.match(loading, /CLICK TO DEPLOY/);
  assert.match(loading, /PRESS A TO DEPLOY/);
  assert.match(transition, /awaitUserConfirmation[\s\S]*?clearWatchdog/);
  assert.match(arena, /roundRuntime\.beginStart[\s\S]*?pendingRoundActivation/);
  assert.match(arena, /activateRoundRuntime[\s\S]*?roundRuntime\.markActive/);
  assert.doesNotMatch(source('../src/game/ui/ArenaStartupPresentation.ts'), /physics\.add|time\.delayedCall|tweens\.add/);
});

test('enemy and boss death presentation uses pooled non-physics mechanical debris', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const vfx = source('../src/game/vfx/MechanicalDestructionVfx.ts');
  assert.match(arena, /emitEnemy\(enemy\.stats\.type/);
  assert.match(arena, /emitBossStage/);
  assert.match(vfx, /new ReusableObjectPool<DebrisSlot, DebrisSpawn>/);
  assert.match(vfx, /const MAX_FRAGMENTS = 168/);
  assert.doesNotMatch(vfx, /physics\.add|tweens\.add|delayedCall/);
});
