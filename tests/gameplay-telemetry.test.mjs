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
  GameplayTelemetryRecorder.recordActiveFrame(200, 1, 120, 90, {
    activeWeight: 1, activeCountCap: 4, activeWeightCap: 5, activeBombs: 1,
    activeDefusers: 0, buffs: { damageBoost: true, grenadeRounds: true }
  });
  const spawnedAt = GameplayTelemetryRecorder.recordEnemySpawn('grunt', 50);
  GameplayTelemetryRecorder.recordShot(24, 0.5, true);
  GameplayTelemetryRecorder.recordProjectileHit('weapon', 24, 0, true);
  GameplayTelemetryRecorder.recordAbilityUse('mine', 10);
  GameplayTelemetryRecorder.recordEnergyRegeneration(0.2, 0.1);
  GameplayTelemetryRecorder.recordEnergyDenied('dash', 20, 7);
  GameplayTelemetryRecorder.recordPickupDropped('energy', 'enemy');
  GameplayTelemetryRecorder.recordPickupCollected('energy', 'enemy', 55, 40);
  GameplayTelemetryRecorder.recordPickupDropped('fluxCore', 'flux-core');
  GameplayTelemetryRecorder.recordPickupCollected('fluxCore', 'flux-core');
  GameplayTelemetryRecorder.recordPlayerDamage('enemy-projectile', 9);
  GameplayTelemetryRecorder.recordTurretPlaced('turret-1', { maximumHealth: 145, damage: 13, fireRate: 2.5, range: 215 });
  GameplayTelemetryRecorder.recordTurretShot('turret-1');
  GameplayTelemetryRecorder.recordTurretHit('turret-1', 13);
  GameplayTelemetryRecorder.recordTurretDamaged('turret-1', 8);
  GameplayTelemetryRecorder.recordBombArmed('site-A');
  GameplayTelemetryRecorder.recordDefuseStarted('site-A');
  GameplayTelemetryRecorder.recordDefuseProgress('site-A', 300, 100, 1);
  GameplayTelemetryRecorder.recordModEffect('kill-switch', 'countdownMs', 850);
  GameplayTelemetryRecorder.recordModEffect('arc-surge', 'damage', 18);
  GameplayTelemetryRecorder.recordSpawnAttempt('count-cap', 900);
  GameplayTelemetryRecorder.recordActiveFrame(800, 4, 111, 0, {
    activeWeight: 5, activeCountCap: 4, activeWeightCap: 5, activeBombs: 1,
    activeDefusers: 1, buffs: { damageBoost: true, scattershot: true }
  });
  GameplayTelemetryRecorder.recordEnemyDamage('grunt', 'weapon', 44);
  GameplayTelemetryRecorder.recordEnemyDamage('grunt', 'hazard', 6);
  GameplayTelemetryRecorder.recordEnemyKill({
    type: 'grunt', maximumHealth: 50, spawnedAtActiveMs: spawnedAt, firstDamagedAtActiveMs: 300, finalSource: 'weapon',
    damageBySource: { weapon: 44, hazard: 6 }, credits: 3, coreTokens: 0
  });
  GameplayTelemetryRecorder.recordDefuseStopped('site-A');
  GameplayTelemetryRecorder.recordEncounterEndState({ playerHealth: 111, playerEnergy: 0, activePickups: {} });
  GameplayTelemetryRecorder.endEncounter('completed', { credits: 250, coreTokens: 1, fluxCores: 1 });

  const encounter = GameplayTelemetryRecorder.snapshot().activeRun.encounters[0];
  assert.equal(encounter.enemySpawns, 1);
  assert.equal(encounter.enemyKills, 1);
  assert.equal(encounter.peakActiveEnemies, 4);
  assert.equal(encounter.enemyMetrics.grunt.killSources.weapon, 1);
  assert.equal(encounter.enemyMetrics.grunt.damageBySource.hazard, 6);
  assert.equal(encounter.pickupDrops.energy, 1);
  assert.equal(encounter.pickupsCollected.energy, 1);
  assert.equal(encounter.pickupDrops.fluxCore, 1);
  assert.equal(encounter.pickupDropsBySource['flux-core'], 1);
  assert.equal(encounter.pickupsCollected.fluxCore, 1);
  assert.equal(encounter.fluxCoresEarned, 1);
  assert.equal(encounter.shotsFired, 1);
  assert.equal(encounter.projectiles.weapon.hits, 1);
  assert.equal(encounter.projectiles.weapon.criticalHits, 1);
  assert.equal(encounter.abilitiesUsed.mine, 1);
  assert.equal(encounter.energy.deniedActions.dash, 1);
  assert.equal(encounter.energy.timeAtZeroMs, 250);
  assert.ok(Math.abs(encounter.energy.regenerationWasted - 0.1) < 0.000_001);
  assert.equal(encounter.restoration.energy.applied, 40);
  assert.equal(encounter.restoration.energy.wasted, 15);
  assert.equal(encounter.enemyMetrics.grunt.totalTimeToFirstDamageMs, 100);
  assert.equal(encounter.enemyMetrics.grunt.totalCombatTtkMs, 150);
  assert.equal(encounter.turrets.hits, 1);
  assert.equal(encounter.turrets.damageTaken, 8);
  assert.equal(encounter.spawnPressure.blockedAttempts['count-cap'], 1);
  assert.equal(encounter.objectives.defuseAttempts, 1);
  assert.equal(encounter.objectives.defuseInterruptions, 1);
  assert.equal(encounter.objectives.defuseProgressBlockedMs, 100);
  assert.equal(encounter.modEffects['kill-switch'].countdownMs, 850);
  assert.equal(encounter.modEffects['arc-surge'].damage, 18);
  assert.equal(encounter.buffUptimeMs.damageBoost, 450);
  assert.equal(encounter.buffUptimeMs.grenadeRounds, 200);
  assert.equal(encounter.buffUptimeMs.scattershot, 250);
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
  GameplayTelemetryRecorder.recordBossAttackCast('artillery-basic');
  GameplayTelemetryRecorder.recordBossProjectileFired('artillery-basic');
  GameplayTelemetryRecorder.recordBossAttackIntersection('artillery-basic', 13, false);
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
  assert.equal(boss.attacks['artillery-basic'].casts, 1);
  assert.equal(boss.attacks['artillery-basic'].playerHits, 1);
  assert.equal(boss.attacks['artillery-basic'].damage, 13);
  assert.equal(run.encounters[0].plasmaChipsEarned, 3);
});
