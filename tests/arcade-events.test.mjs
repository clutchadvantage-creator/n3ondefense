import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('new and legacy profiles receive persistent N3ON Arcade challenge counters', () => {
  const fresh = createDefaultLocalSave('arcade-new', 'Arcade New');
  assert.equal(fresh.progress.arcadeEventsCompleted, 0);
  assert.equal(fresh.progress.goldenEnemiesKilled, 0);
  assert.equal(fresh.progress.arcadeMiniBossesKilled, 0);
  assert.equal(fresh.progress.neonCircuitsCompleted, 0);

  const legacy = normalizeLocalSave({
    ...fresh,
    progress: {
      ...fresh.progress,
      arcadeEventsCompleted: undefined,
      goldenEnemiesKilled: undefined,
      arcadeMiniBossesKilled: undefined,
      neonCircuitsCompleted: undefined
    }
  });
  assert.ok(legacy);
  assert.equal(legacy.progress.arcadeEventsCompleted, 0);
  assert.equal(legacy.progress.goldenEnemiesKilled, 0);
  assert.equal(legacy.progress.arcadeMiniBossesKilled, 0);
  assert.equal(legacy.progress.neonCircuitsCompleted, 0);
});

test('Arcade registry centralizes scheduling, rewards, and all three launch events', () => {
  const registry = source('../src/game/arcade/ArcadeEventRegistry.ts');
  assert.match(registry, /id: 'golden-hunt'/);
  assert.match(registry, /id: 'mini-boss'/);
  assert.match(registry, /id: 'neon-circuit'/);
  assert.match(registry, /recentHistorySize: 2/);
  assert.match(registry, /eventCooldownMs: 105_000/);
  assert.match(registry, /reward: \{ kind: 'guaranteed-mod' \}/);
  assert.match(registry, /creditsBase: 650, creditsPerRound: 35, fluxCores: 1/);
  assert.match(registry, /creditsBase: 450, creditsPerRound: 25, fluxCores: 1/);
});

test('Golden Hunt always creates five regular-enemy variants and tracks their kills', () => {
  const golden = source('../src/game/arcade/events/GoldenHuntEvent.ts');
  assert.match(golden, /const GOLDEN_TARGET_COUNT = 5/);
  assert.match(golden, /findSpawnPoints\(GOLDEN_TARGET_COUNT/);
  assert.match(golden, /name: 'golden_enemy_killed'/);
  assert.match(golden, /name: 'golden_hunt_completed'/);
  assert.doesNotMatch(golden, /BossEncounter/);
});

test('Arcade Mini-Boss uses an instance-only reduced health configuration without milestone callbacks', () => {
  const miniBoss = source('../src/game/arcade/events/MiniBossEvent.ts');
  const boss = source('../src/game/bosses/Boss.ts');
  assert.match(miniBoss, /ARCADE_MINIBOSS_HEALTH_MULTIPLIER = 0\.42/);
  assert.match(miniBoss, /showHealthUi: false/);
  assert.match(miniBoss, /name: 'arcade_miniboss_killed'/);
  assert.match(miniBoss, /dropCredit: \(\) => undefined/);
  assert.doesNotMatch(miniBoss, /completeBossFight|startBoss|bossDefeated/);
  assert.match(boss, /getBossHealth\(completedRound, modeFamily\) \* Math\.max\(0\.01, options\.healthMultiplier \?\? 1\)/);
});

test('Neon Circuit uses five ordered reachable checkpoints with complete cleanup', () => {
  const circuit = source('../src/game/arcade/events/NeonCircuitEvent.ts');
  assert.match(circuit, /NEON_CIRCUIT_CHECKPOINT_COUNT = 5/);
  assert.match(circuit, /const target = this\.markers\[this\.current\]/);
  assert.match(circuit, /name: 'neon_checkpoint_reached'/);
  assert.match(circuit, /name: 'neon_circuit_completed'/);
  assert.match(circuit, /marker\.root\.destroy\(true\)/);
});

test('Arena integration suppresses Arcade during Teaching and preserves live combat systems', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  assert.match(arena, /firstRunStage === 'complete'/);
  assert.match(arena, /tutorialProgress\.replaySequenceId === null/);
  assert.match(arena, /!this\.tutorialDirector\?\.isActive\(\).*this\.arcadeController\?\.update\(delta\)/);
  assert.match(arena, /this\.arcadeController\?\.handleGameplayEvent\(\{ type: 'enemy-killed', enemy \}\)/);
  assert.match(arena, /this\.tryAwardMod\('milestone', true, x, y\)/);
  assert.match(arena, /forceArcadeEvent/);
  assert.match(arena, /this\.arcadeController\?\.destroy\('replaced'\)/);
  assert.match(arena, /private activeBossTarget\(\)/);
});

test('Arcade metrics are exported through gameplay telemetry and feed weekly progress', () => {
  const telemetry = source('../src/game/telemetry/GameplayTelemetryRecorder.ts');
  const profile = source('../src/game/state/PlayerProfileStore.ts');
  const weekly = source('../src/game/progression/WeeklyOperations.ts');
  assert.match(telemetry, /arcadeEvents: ArcadeMetricEvent\[\]/);
  assert.match(telemetry, /static recordArcadeEvent\(event: ArcadeMetricEvent\)/);
  assert.match(profile, /static recordArcadeMetric\(event: ArcadeMetricEvent\)/);
  assert.match(weekly, /'arcadeEventsCompleted'/);
  assert.match(weekly, /'goldenEnemiesKilled'/);
  assert.match(weekly, /'arcadeMiniBossesKilled'/);
  assert.match(weekly, /'neonCircuitsCompleted'/);
});
