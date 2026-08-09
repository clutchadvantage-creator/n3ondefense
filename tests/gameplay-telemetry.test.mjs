import test from 'node:test';
import assert from 'node:assert/strict';
import { GameplayTelemetryRecorder } from '../src/game/telemetry/GameplayTelemetryRecorder.ts';

test('live telemetry aggregates enemy TTK, kill sources, drops, pickups, and player actions', () => {
  GameplayTelemetryRecorder.resetForTests();
  GameplayTelemetryRecorder.beginRun({
    runId: 'run-telemetry', startedAt: 1_700_000_000_000, baseSeed: 77, protocol: 'normal',
    contract: null, modFocus: null, upgrades: { 'weapon.damage': 4 }, equippedMods: [{ id: 'split-current', rank: 2 }]
  });
  GameplayTelemetryRecorder.beginEncounter({
    kind: 'round', round: 3, seed: 88, layout: 'maze', maximumPlayerHealth: 130,
    maximumPlayerEnergy: 110, weaponDamage: 24, weaponFireRate: 10, weaponCritChance: 0.18,
    weaponHeatPerShot: 7.4, energyRegenPerSecond: 1.4
  });
  GameplayTelemetryRecorder.recordActiveFrame(200, 1, 120, 90);
  const spawnedAt = GameplayTelemetryRecorder.recordEnemySpawn('grunt', 50);
  GameplayTelemetryRecorder.recordShot(24, 0.5);
  GameplayTelemetryRecorder.recordAbilityUse('mine', 10);
  GameplayTelemetryRecorder.recordPickupDropped('energy', 'enemy');
  GameplayTelemetryRecorder.recordPickupCollected('energy');
  GameplayTelemetryRecorder.recordPlayerDamage('enemy-projectile', 9);
  GameplayTelemetryRecorder.recordActiveFrame(800, 4, 111, 70);
  GameplayTelemetryRecorder.recordEnemyDamage('grunt', 'weapon', 44);
  GameplayTelemetryRecorder.recordEnemyDamage('grunt', 'hazard', 6);
  GameplayTelemetryRecorder.recordEnemyKill({
    type: 'grunt', maximumHealth: 50, spawnedAtActiveMs: spawnedAt, finalSource: 'weapon',
    damageBySource: { weapon: 44, hazard: 6 }, credits: 3, coreTokens: 0
  });
  GameplayTelemetryRecorder.endEncounter('completed', { credits: 250, coreTokens: 1 });

  const encounter = GameplayTelemetryRecorder.snapshot().activeRun.encounters[0];
  assert.equal(encounter.enemySpawns, 1);
  assert.equal(encounter.enemyKills, 1);
  assert.equal(encounter.peakActiveEnemies, 4);
  assert.equal(encounter.enemyMetrics.grunt.killSources.weapon, 1);
  assert.equal(encounter.enemyMetrics.grunt.damageBySource.hazard, 6);
  assert.equal(encounter.pickupDrops.energy, 1);
  assert.equal(encounter.pickupsCollected.energy, 1);
  assert.equal(encounter.shotsFired, 1);
  assert.equal(encounter.abilitiesUsed.mine, 1);
  assert.equal(encounter.playerDamageBySource['enemy-projectile'], 9);
  assert.equal(encounter.derived.pickupCollectionRate, 1);
  assert.ok(encounter.derived.killsPerActiveMinute > 0);
});

test('boss telemetry records its health, source damage, credit drops, and active fight TTK', () => {
  GameplayTelemetryRecorder.resetForTests();
  GameplayTelemetryRecorder.beginRun({
    runId: 'boss-run', startedAt: 1_700_000_000_000, baseSeed: 99, protocol: 'overdrive',
    contract: 'elite-hunt', modFocus: 'weapon', upgrades: {}, equippedMods: []
  });
  GameplayTelemetryRecorder.beginEncounter({
    kind: 'boss', round: 5, seed: 100, layout: 'crossroads', maximumPlayerHealth: 130,
    maximumPlayerEnergy: 110, weaponDamage: 16, weaponFireRate: 9, weaponCritChance: 0.1,
    weaponHeatPerShot: 9, energyRegenPerSecond: 1
  });
  GameplayTelemetryRecorder.startBoss('artillery', 7200);
  GameplayTelemetryRecorder.recordActiveFrame(250, 0, 130, 110);
  GameplayTelemetryRecorder.recordBossDamage('weapon', 100);
  GameplayTelemetryRecorder.recordBossDamage('hazard', 20);
  GameplayTelemetryRecorder.recordBossCreditDrop();
  GameplayTelemetryRecorder.recordBossDefeated();
  GameplayTelemetryRecorder.endEncounter('bossDefeated', { credits: 1200, coreTokens: 3, plasmaChips: 3 });
  GameplayTelemetryRecorder.finishRun('quit');

  const run = GameplayTelemetryRecorder.snapshot().completedRuns[0];
  const boss = run.encounters[0].boss;
  assert.equal(boss.maximumHealth, 7200);
  assert.equal(boss.damageBySource.weapon, 100);
  assert.equal(boss.damageBySource.hazard, 20);
  assert.equal(boss.creditsDropped, 1);
  assert.equal(boss.defeated, true);
  assert.equal(boss.ttkMs, 250);
  assert.equal(run.encounters[0].plasmaChipsEarned, 3);
});
