import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('Arcade registry centralizes scheduling and registers all six events with physical reward profiles', () => {
  const registry = source('../src/game/arcade/ArcadeEventRegistry.ts');
  for (const eventId of ['golden-hunt', 'mini-boss', 'neon-circuit', 'hot-package', 'packet-snatcher', 'redline']) {
    assert.match(registry, new RegExp(`id: '${eventId}'`));
  }
  assert.match(registry, /recentHistorySize: 2/);
  assert.match(registry, /eventCooldownMs: 105_000/);
  assert.equal((registry.match(/reward: randomRewardPool\(/g) ?? []).length, 6);
  for (const rewardKind of ['credits', 'core-tokens', 'flux-cores', 'plasma-chips', 'mod']) {
    assert.match(registry, new RegExp(`kind: '${rewardKind}'`));
  }
});

test('Arcade reward rolls stay side-effect free until the complete plan is physically spawned', () => {
  const spawned = [];
  const context = {
    round: 10,
    player: { x: 12, y: 24 },
    spawnPhysicalRewards: (eventId, origin, rewards) => spawned.push({ eventId, origin, rewards })
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
  assert.deepEqual(rewards.roll(definition, 0), { kind: 'credits', amount: 150, label: '+150 CREDITS' });
  assert.equal(rewards.roll(definition, 0.21).kind, 'core-tokens');
  assert.equal(rewards.roll(definition, 0.41).kind, 'flux-cores');
  assert.equal(rewards.roll(definition, 0.61).kind, 'plasma-chips');
  assert.deepEqual(rewards.roll(definition, 0.99), { kind: 'mod', amount: 1, label: 'RANDOM MOD' });
  assert.equal(spawned.length, 0);

  const planRewards = rewards.spawn('redline', definition, {
    origin: { x: 80, y: 120 },
    guaranteed: [{ kind: 'mod', amount: 1 }],
    rolls: 2
  }, (() => {
    const rolls = [0, 0.99];
    return () => rolls.shift();
  })());
  assert.deepEqual(planRewards.map(({ kind }) => kind), ['mod', 'credits', 'mod']);
  assert.equal(spawned.length, 1);
  assert.deepEqual(spawned[0], { eventId: 'redline', origin: { x: 80, y: 120 }, rewards: planRewards });
});

test('new Arcade events keep distinct objectives, bounded timing, physical reward plans, and cleanup', () => {
  const hotPackage = source('../src/game/arcade/events/HotPackageEvent.ts');
  assert.match(hotPackage, /const CAPTURE_MS = 5_000/);
  assert.match(hotPackage, /qualityRoll < 0\.68 \? 'standard' : qualityRoll < 0\.93 \? 'enhanced' : 'jackpot'/);
  assert.match(hotPackage, /standard: 2, enhanced: 3, jackpot: 5/);
  assert.match(hotPackage, /this\.capturedMs \+= Math\.min\(deltaMs, 250\)/);
  assert.doesNotMatch(hotPackage, /grantCredits|grantCoreTokens|grantGuaranteedMod/);

  const packetSnatcher = source('../src/game/arcade/events/PacketSnatcherEvent.ts');
  assert.match(packetSnatcher, /THIEF_SPEED_MULTIPLIER = 1\.72/);
  assert.match(packetSnatcher, /findExtractionPoint/);
  assert.match(packetSnatcher, /navigateEventEnemy/);
  assert.match(packetSnatcher, /guaranteed: \[[\s\S]*?\{ kind: 'mod'/);
  assert.match(packetSnatcher, /this\.bonusMod[\s\S]*?kind: 'mod'/);
  assert.match(packetSnatcher, /n3onArcadeSuppressBaseLoot/);

  const redline = source('../src/game/arcade/events/RedlineEvent.ts');
  assert.match(redline, /const REQUIRED_MS = 9_000/);
  assert.match(redline, /const DECAY_RATE = 0\.24/);
  assert.match(redline, /redline_stage_reached/);
  assert.match(redline, /rolls: this\.bonusRoll \? 3 : 2/);
  assert.doesNotMatch(redline, /speedBoost|rapidFire|energyRegen|cooldown|damageBoost/);

  for (const eventSource of [hotPackage, packetSnatcher, redline]) {
    assert.match(eventSource, /cleanup\(/);
    assert.match(eventSource, /rewardPlan\(\)/);
  }
});

test('new Arcade events delegate presentation to distinct bounded visual controllers', () => {
  const hotEvent = source('../src/game/arcade/events/HotPackageEvent.ts');
  const packetEvent = source('../src/game/arcade/events/PacketSnatcherEvent.ts');
  const redlineEvent = source('../src/game/arcade/events/RedlineEvent.ts');
  const hotVisual = source('../src/game/arcade/visuals/HotPackageVisualController.ts');
  const packetVisual = source('../src/game/arcade/visuals/PacketSnatcherVisualController.ts');
  const redlineVisual = source('../src/game/arcade/visuals/RedlineVisualController.ts');

  assert.match(hotEvent, /new HotPackageVisualController/);
  assert.match(packetEvent, /new PacketSnatcherVisualController/);
  assert.match(redlineEvent, /new RedlineVisualController/);
  assert.match(hotVisual, /orbital pod presentation/);
  assert.match(packetVisual, /moving data-heist presentation/);
  assert.match(redlineVisual, /unstable override reactor/);
  assert.doesNotMatch(hotVisual, /physics\.add|scene\.time\.addEvent|scene\.events\.on/);
  assert.doesNotMatch(packetVisual, /physics\.add|scene\.time\.addEvent|scene\.events\.on/);
  assert.doesNotMatch(redlineVisual, /physics\.add|scene\.time\.addEvent|scene\.events\.on/);
});

test('Arcade event VFX expose activation, live progress, urgency, terminal feedback, and complete cleanup', () => {
  const hotEvent = source('../src/game/arcade/events/HotPackageEvent.ts');
  const packetEvent = source('../src/game/arcade/events/PacketSnatcherEvent.ts');
  const redlineEvent = source('../src/game/arcade/events/RedlineEvent.ts');
  const hotVisual = source('../src/game/arcade/visuals/HotPackageVisualController.ts');
  const packetVisual = source('../src/game/arcade/visuals/PacketSnatcherVisualController.ts');
  const redlineVisual = source('../src/game/arcade/visuals/RedlineVisualController.ts');

  assert.match(hotEvent, /const LANDING_MS = 1_350/);
  assert.match(packetVisual, /elapsed \/ 1_050/);
  assert.match(redlineVisual, /elapsed \/ 980/);
  for (const visual of [hotVisual, packetVisual, redlineVisual]) {
    assert.match(visual, /remainingMs/);
    assert.match(visual, /beginSuccess/);
    assert.match(visual, /beginFailure/);
    assert.match(visual, /destroy\(\): void/);
    assert.match(visual, /particlesEnabled/);
  }
  assert.match(hotVisual, /captureProgress/);
  assert.match(packetVisual, /healthFraction/);
  assert.match(packetVisual, /Float32Array\(TRAIL_SAMPLES\)/);
  assert.match(redlineVisual, /drawSegmentedRing[\s\S]*?progress/);
  assert.match(hotEvent, /this\.nextVisualAt = activeElapsedMs \+ 42/);
  assert.match(packetEvent, /this\.nextVisualAt = activeElapsedMs \+ 42/);
  assert.match(redlineEvent, /this\.nextVisualAt = activeElapsedMs \+ 42/);
});

test('Arcade VFX polish leaves mechanics and economy constants unchanged while adding isolated audio hooks', () => {
  const hot = source('../src/game/arcade/events/HotPackageEvent.ts');
  const packet = source('../src/game/arcade/events/PacketSnatcherEvent.ts');
  const redline = source('../src/game/arcade/events/RedlineEvent.ts');
  const types = source('../src/game/arcade/types.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');

  assert.match(hot, /const CAPTURE_MS = 5_000/);
  assert.match(hot, /const CAPTURE_RADIUS = 112/);
  assert.match(packet, /const THIEF_SPEED_MULTIPLIER = 1\.72/);
  assert.match(packet, /thief\.hp \*= 2\.2/);
  assert.match(redline, /const ACTIVATION_RADIUS = 118/);
  assert.match(redline, /const REQUIRED_MS = 9_000/);
  assert.match(redline, /const DECAY_RATE = 0\.24/);
  for (const cue of ['hot-package-impact', 'packet-snatcher-alert', 'redline-rupture']) {
    assert.match(types, new RegExp(`'${cue}'`));
  }
  assert.match(arena, /event-specific cue names are ready for dedicated assets/);
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

test('Neon Circuit plays the pooled arena gate cue once at each authoritative checkpoint', () => {
  const circuit = source('../src/game/arcade/events/NeonCircuitEvent.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const audio = source('../src/game/systems/AudioManager.ts');
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/arenacircuitgate.mp3', import.meta.url)));
  assert.match(circuit, /private activateCheckpoint[\s\S]*?this\.context\.playArcadeCue\('circuit-gate'\)/);
  assert.match(arena, /playArcadeCue:[\s\S]*?playSfx\('circuitGate'\)/);
  assert.match(audio, /circuitGate: 'soundeffects\/arenacircuitgate\.mp3'/);
  assert.match(audio, /case 'circuitGate':[\s\S]*?this\.playPresentationSfx\(name\)/);
});

test('Arena integration suppresses Arcade during Teaching and preserves live combat systems', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  assert.match(arena, /firstRunStage === 'complete'/);
  assert.match(arena, /tutorialProgress\.replaySequenceId === null/);
  assert.match(arena, /!this\.tutorialDirector\?\.isActive\(\).*this\.arcadeController\?\.update\(delta\)/);
  assert.match(arena, /this\.arcadeController\?\.handleGameplayEvent\(\{ type: 'enemy-killed', enemy \}\)/);
  assert.match(arena, /this\.tryAwardMod\('milestone', isGuaranteedMilestone\(completedRound\)\)/);
  assert.match(arena, /spawnPhysicalRewards:/);
  assert.match(arena, /this\.spawnPhysicalLootBurst\(/);
  assert.match(arena, /'arcade-loot'/);
  assert.match(arena, /forceArcadeEvent/);
  assert.match(arena, /this\.arcadeController\?\.destroy\('replaced'\)/);
  assert.match(arena, /private nearestActiveBossTarget\(x: number, y: number\)/);
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
