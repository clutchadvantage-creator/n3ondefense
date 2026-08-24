import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANOMALY_DEFINITIONS, ANOMALY_ENTRY_COSTS, ANOMALY_SCHEDULING } from '../src/game/anomalies/AnomalyRegistry.ts';
import { HeistRewardService, isHeistModRewardEligible } from '../src/game/anomalies/heist/HeistRewardService.ts';
import { HEIST_ROUTE, HEIST_WALL_RECTS, HEIST_WORLD } from '../src/game/anomalies/heist/HeistConfig.ts';
import { AnomalyReturnLifecycle } from '../src/game/anomalies/AnomalyReturnLifecycle.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Anomaly registry keeps the first event data-driven and entry prices on the exact approved table', () => {
  assert.deepEqual([...ANOMALY_ENTRY_COSTS], [100, 125, 150, 175, 200, 225, 250]);
  assert.equal(ANOMALY_DEFINITIONS.length, 1);
  assert.equal(ANOMALY_DEFINITIONS[0].id, 'heist');
  assert.ok(ANOMALY_SCHEDULING.cooldownMs > ANOMALY_SCHEDULING.maximumOpportunityMs);
  assert.ok(ANOMALY_SCHEDULING.interactionRadius > 0);
});

test('HEIST rewards accumulate in an isolated pending container without mutating profile services', () => {
  const rewards = new HeistRewardService(417, 18, 'normal');
  const pending = rewards.createEmpty();
  for (let index = 0; index < 8; index += 1) rewards.add(pending, rewards.rollContainer());
  assert.ok(pending.credits + pending.coreTokens + pending.plasmaChips + pending.fluxCores + pending.modIds.length > 0);
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  assert.doesNotMatch(heist, /SaveSystem\.add(?:Credits|CoreTokens|FluxCores|PlasmaChips|Mod)/);
  assert.match(heist, /loot: success \? this\.pendingLoot : emptyLoot\(\)/);
});

test('Arena suspension is the authoritative preservation boundary and only commits successful extraction', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  assert.match(arena, /this\.scene\.launch\(SceneKeys\.Heist, session\);\s*this\.scene\.pause\(\)/);
  assert.match(arena, /if \(result\.success\) this\.commitAnomalyLoot\(result\)/);
  assert.match(arena, /this\.player\.invulnUntil = Math\.max\([\s\S]*?HEIST_BALANCE\.safeReturnInvulnerabilityMs/);
  assert.match(arena, /sharedRuntime:\s*\{[\s\S]*?modRuntime: this\.modRuntime,[\s\S]*?temporaryAmmo: this\.temporaryAmmo,[\s\S]*?mineChargeRack: this\.mineChargeRack/);
  assert.match(arena, /player:\s*\{[\s\S]*?hp: this\.player\.hp,[\s\S]*?energy: this\.player\.energy,[\s\S]*?buffs: this\.player\.buffs/);
  assert.doesNotMatch(arena, /beginAnomalyTransition[\s\S]{0,5000}invulnUntil\s*=\s*Number\.POSITIVE_INFINITY/);
  assert.match(arena, /spendAnomalyEntryCost/);
  assert.match(arena, /SaveSystem\.spendFluxCores/);
});

test('HEIST failure bypasses normal defeat and restores through the Arena return event', () => {
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  assert.match(heist, /private failHeist\(\)/);
  assert.match(heist, /returnToArena\(false, 'player-dead'\)/);
  assert.doesNotMatch(heist, /SceneKeys\.Results|triggerDefeat/);
  assert.match(heist, /arena\.events\.emit\('anomaly-return'/);
  const transition = heist.slice(heist.indexOf('private returnToArena'), heist.indexOf('private updateHud'));
  assert.doesNotMatch(transition, /this\.scene\.resume\(SceneKeys\.Arena\)/);
});

test('Anomaly telemetry, silent audio hooks, scene registration, and DEV controls remain explicit', () => {
  const telemetry = source('../src/game/telemetry/GameplayTelemetryRecorder.ts');
  const audio = source('../src/game/anomalies/AnomalyAudioHooks.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const boot = source('../src/game/scenes/BootScene.ts');
  assert.match(telemetry, /anomalyEvents: AnomalyMetricEvent\[\]/);
  assert.match(telemetry, /recordAnomalyEvent/);
  assert.match(audio, /createSilentAnomalyAudioHooks/);
  assert.doesNotMatch(audio, /AudioManager|playSfx/);
  for (const control of ['forceAnomaly', 'forceAnomalyCharge', 'setAnomalyCost', 'setHeistMiniBoss']) assert.match(arena, new RegExp(control));
  assert.match(boot, /SceneKeys\.Heist/);
});

test('HEIST combat pool fully disables and resets retired projectile bodies', () => {
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  assert.match(heist, /new ReusableObjectPool<HeistProjectile, HeistProjectileSpawn>/);
  assert.match(heist, /projectile\.crossedFences\.clear\(\)/);
  assert.match(heist, /body\.enable = true/);
  assert.match(heist, /body\.stop\(\); body\.enable = false/);
  assert.match(heist, /setPosition\(-10_000, -10_000\)/);
  assert.match(heist, /body\.reset\(state\.previousX, state\.previousY\)/);
});

test('HEIST uses the shared combat runtime instead of a parallel simplified loadout', () => {
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  const rules = source('../src/game/gameplay/AbilityRuntimeRules.ts');
  for (const runtime of ['new Player', 'new Hud', 'new Fence', 'new Turret', 'new Mine', 'new OperativeShieldEffect']) {
    assert.match(heist, new RegExp(runtime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(heist, /this\.session\.sharedRuntime\.modRuntime/);
  assert.match(heist, /this\.session\.sharedRuntime\.temporaryAmmo/);
  assert.match(heist, /this\.session\.sharedRuntime\.mineChargeRack/);
  assert.match(rules, /resolveAbilityRuntimeConfig/);
  assert.match(rules, /resolveShieldRuntime/);
  assert.match(heist, /findTurretHit[\s\S]*?turret\.takeDamage\(projectile\.damage\)/);
  assert.match(heist, /findFenceHit[\s\S]*?fence\.hp -= projectile\.damage/);
  assert.match(heist, /applyEnemyHealthMode/);
  assert.match(heist, /applyEnemyDamageMode/);
  assert.match(heist, /resourcePickupCapMultiplier/);
  assert.match(heist, /this\.player\.hp = Math\.max\(0, source\.hp\)/);
  assert.match(heist, /this\.player\.energy = Math\.max\(0, source\.energy\)/);
  assert.match(heist, /this\.time\.now < this\.abilityState\.shieldActiveUntil/);
  assert.match(heist, /hasInfusion\('pickup-orbit'\)/);
});

test('HEIST vault collision follows the real door body and world geometry in both directions', () => {
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  const facility = source('../src/game/anomalies/heist/HeistFacility.ts');
  assert.match(heist, /HEIST_WORLD\.height - 74/);
  assert.match(heist, /this\.facility\.vaultDoor\.body\?\.enable/);
  assert.doesNotMatch(heist, /y > 948/);
  assert.match(facility, /door\.body\.enable = false/);
  assert.match(facility, /door\.body\.enable = true/);
});

test('HEIST facility and shared Arcade HUD use bounded dimensional presentation layers', () => {
  const facility = source('../src/game/anomalies/heist/HeistFacility.ts');
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  const arcadeHud = source('../src/game/arcade/ArcadeHudView.ts');
  assert.match(facility, /top cap/i);
  assert.match(facility, /warning strips/i);
  assert.match(heist, /lockHousing/);
  assert.match(heist, /sparkArc/);
  assert.match(arcadeHud, /objectiveChassis/);
  assert.match(arcadeHud, /leftRail/);
});

test('Anomaly return stops HEIST before Arena resumes and restores from the RESUME lifecycle', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  const transition = heist.slice(heist.indexOf('private returnToArena'), heist.indexOf('private updateHud'));
  assert.doesNotMatch(transition, /this\.scene\.resume\(SceneKeys\.Arena\)/);
  assert.ok(transition.indexOf('this.scene.stop(SceneKeys.Heist)') < transition.indexOf("arena.events.emit('anomaly-return'"));
  const stageReturn = arena.slice(arena.indexOf('private readonly onAnomalyReturn'), arena.indexOf('private readonly onArenaResumed'));
  const restoreReturn = arena.slice(arena.indexOf('private readonly onArenaResumed'), arena.indexOf('constructor()'));
  assert.match(stageReturn, /stageReturn\(result\.sessionId\)/);
  assert.match(stageReturn, /this\.scene\.resume\(SceneKeys\.Arena\)/);
  assert.doesNotMatch(stageReturn, /restoreAnomalySimulation/);
  assert.match(restoreReturn, /beginRestore\(result\.sessionId\)/);
  assert.match(restoreReturn, /restoreAnomalySimulation/);
  assert.match(arena, /events\.on\(Phaser\.Scenes\.Events\.RESUME, this\.onArenaResumed\)/);
  assert.match(arena, /physicsWasPaused: this\.physics\.world\.isPaused/);
  assert.match(arena, /physicsTimeScale: this\.physics\.world\.timeScale/);
  assert.match(arena, /clockWasPaused: this\.time\.paused/);
  assert.match(arena, /clockTimeScale: this\.time\.timeScale/);
  assert.match(arena, /playerBodyEnabled:/);
  assert.match(arena, /this\.state\.set\(suspension\.roundState\)/);
  assert.match(arena, /inputBridge: this\.pointerLock \?\? undefined/);
  assert.match(heist, /inputDevice: this\.inputController\.activeDevice/);
  const entry = arena.slice(arena.indexOf('private beginAnomalyTransition'), arena.indexOf('private commitAnomalyLoot'));
  assert.doesNotMatch(entry, /pointerLock\?\.destroy|pointerLock\?\.release/);
  assert.match(arena, /cameras\.main\.resetFX\(\)\.setAlpha\(1\)\.setVisible\(true\)/);
});

test('Anomaly return lifecycle is idempotent across 12 consecutive transfers', () => {
  const lifecycle = new AnomalyReturnLifecycle();
  for (let cycle = 0; cycle < 12; cycle += 1) {
    const sessionId = `repeat-${cycle}`;
    assert.equal(lifecycle.begin(sessionId), true);
    assert.equal(lifecycle.begin(`${sessionId}-duplicate`), false);
    assert.equal(lifecycle.stageReturn(sessionId), true);
    assert.equal(lifecycle.stageReturn(sessionId), false);
    assert.equal(lifecycle.beginRestore(sessionId), true);
    assert.equal(lifecycle.beginRestore(sessionId), false);
    assert.equal(lifecycle.complete(sessionId), true);
    assert.deepEqual(lifecycle.snapshot(), { phase: 'idle', sessionId: null });
  }
});

test('HEIST facility is a multi-room route with no guide point embedded in collision geometry', () => {
  assert.ok(HEIST_WORLD.width >= 4_000);
  assert.ok(HEIST_WORLD.height >= 2_300);
  assert.ok(HEIST_ROUTE.length >= 12);
  for (const point of HEIST_ROUTE) {
    const blocked = HEIST_WALL_RECTS.some((rect) => point.x >= rect.x && point.x <= rect.x + rect.w
      && point.y >= rect.y && point.y <= rect.y + rect.h);
    assert.equal(blocked, false, `route point ${point.x},${point.y} is inside a wall`);
  }
});

test('HEIST creates physical provisional loot and extraction never waits for every hostile to die', () => {
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  const lootSystem = source('../src/game/anomalies/heist/HeistLootPickupSystem.ts');
  assert.match(heist, /this\.lootPickups\.spawn\(/);
  assert.match(heist, /private collectLoot[\s\S]*this\.rewards\.add\(this\.pendingLoot, reward\)/);
  assert.match(lootSystem, /pickup\.settled/);
  assert.match(lootSystem, /createPhysicalLootPlan/);
  assert.match(lootSystem, /GameplayPickupPresentation/);
  assert.match(lootSystem, /createGameplayModPickupVisual/);
  assert.match(lootSystem, /onCollect\(pickup\.reward/);
  assert.match(heist, /this\.openExtraction\(\);/);
  assert.doesNotMatch(heist, /this\.enemies\.length === 0\) this\.openExtraction/);
  assert.match(heist, /phase === 'escape'/);
});

test('HEIST Supreme Mod eligibility is restricted to Supreme Overdrive protocols', () => {
  const supremeId = 'supreme-eventide-arsenal';
  assert.equal(isHeistModRewardEligible(supremeId, 'normal'), false);
  assert.equal(isHeistModRewardEligible(supremeId, 'overdrive-pegasus'), false);
  assert.equal(isHeistModRewardEligible(supremeId, 'supreme-leo'), true);
  assert.equal(isHeistModRewardEligible('split-current', 'normal'), true);
});

test('successful extraction sends Mods through Arena shared acquisition and reveal pipeline', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const commit = arena.slice(arena.indexOf('private commitAnomalyLoot'), arena.indexOf('private findArcadeSpawnPoints'));
  assert.match(commit, /this\.awardResolvedMod\([\s\S]*?'anomaly'/);
  assert.doesNotMatch(commit, /SaveSystem\.addMod/);
  assert.match(arena, /private awardResolvedMod[\s\S]*?SaveSystem\.addMod[\s\S]*?modAcquisitionPresenter\?\.enqueue/);
});

test('Portal and anomaly audio boundaries expose the complete second-pass presentation lifecycle', () => {
  const portal = source('../src/game/anomalies/AnomalyPortalVisual.ts');
  const audio = source('../src/game/anomalies/AnomalyAudioHooks.ts');
  for (const feature of ['portalVoid', 'portalEnergy', 'shockwave', 'activeWisps', 'absorptionPulseUntil', 'readyForInteraction']) {
    assert.match(portal, new RegExp(feature));
  }
  for (const cue of [
    'anomaly-spawn', 'anomaly-charging', 'essence-release', 'essence-absorption', 'portal-rupture',
    'portal-idle', 'portal-entry', 'facility-arrival', 'corridor-ambience', 'door-activation',
    'door-open', 'door-close', 'loot-container-impact', 'loot-container-break', 'loot-spawn',
    'ambush-trigger', 'warning-state', 'extraction-activation', 'portal-return', 'arena-reentry'
  ]) assert.match(audio, new RegExp(`'${cue}'`));
});
