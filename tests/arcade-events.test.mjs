import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { ArcadeRewardService } from '../src/game/arcade/ArcadeRewardService.ts';

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

test('Arcade registry centralizes scheduling and gives all three events the complete randomized reward pool', () => {
  const registry = source('../src/game/arcade/ArcadeEventRegistry.ts');
  assert.match(registry, /id: 'golden-hunt'/);
  assert.match(registry, /id: 'mini-boss'/);
  assert.match(registry, /id: 'neon-circuit'/);
  assert.match(registry, /recentHistorySize: 2/);
  assert.match(registry, /eventCooldownMs: 105_000/);
  assert.equal((registry.match(/reward: randomRewardPool\(/g) ?? []).length, 3);
  for (const rewardKind of ['credits', 'core-tokens', 'flux-cores', 'plasma-chips', 'mod']) {
    assert.match(registry, new RegExp(`kind: '${rewardKind}'`));
  }
});

test('Arcade reward rolls award exactly one authoritative resource category', () => {
  const granted = [];
  const context = {
    round: 10,
    player: { x: 12, y: 24 },
    grantCredits: (amount) => granted.push(['credits', amount]),
    grantCoreTokens: (amount) => granted.push(['core-tokens', amount]),
    grantFluxCores: (amount) => granted.push(['flux-cores', amount]),
    grantPlasmaChips: (amount) => granted.push(['plasma-chips', amount]),
    grantGuaranteedMod: (x, y) => granted.push(['mod', x, y])
  };
  const definition = {
    reward: {
      kind: 'random-pool',
      options: [
        { kind: 'credits', weight: 1, baseAmount: 100, amountPerRound: 5 },
        { kind: 'core-tokens', weight: 1, baseAmount: 2, amountPerRound: 0.1 },
        { kind: 'flux-cores', weight: 1, baseAmount: 1, amountPerRound: 0.1 },
        { kind: 'plasma-chips', weight: 1, baseAmount: 4, amountPerRound: 0.2 },
        { kind: 'mod', weight: 1 }
      ]
    }
  };
  const rewards = new ArcadeRewardService(context);
  assert.deepEqual(rewards.grant(definition, 0), { kind: 'credits', amount: 150, label: '+150 CREDITS' });
  assert.equal(rewards.grant(definition, 0.21).kind, 'core-tokens');
  assert.equal(rewards.grant(definition, 0.41).kind, 'flux-cores');
  assert.equal(rewards.grant(definition, 0.61).kind, 'plasma-chips');
  assert.deepEqual(rewards.grant(definition, 0.99), { kind: 'mod', amount: 1, label: 'RANDOM MOD' });
  assert.deepEqual(granted.map(([kind]) => kind), ['credits', 'core-tokens', 'flux-cores', 'plasma-chips', 'mod']);
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

test('Neon Circuit uses five ordered reachable, body-free checkered gates with complete cleanup', () => {
  const circuit = source('../src/game/arcade/events/NeonCircuitEvent.ts');
  assert.match(circuit, /NEON_CIRCUIT_CHECKPOINT_COUNT = 5/);
  assert.match(circuit, /const target = this\.markers\[this\.current\]/);
  assert.match(circuit, /drawCheckeredFinish/);
  assert.match(circuit, /`GATE \$\{index \+ 1\}`/);
  assert.match(circuit, /didPlayerPassGate/);
  assert.match(circuit, /previousPlayerX/);
  assert.doesNotMatch(circuit, /physics\.add|enableBody|setCircle|setBody/);
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
  assert.match(arena, /grantCoreTokens: \(amount\)/);
  assert.match(arena, /grantPlasmaChips: \(amount\)/);
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
