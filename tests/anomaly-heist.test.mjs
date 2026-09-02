import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ANOMALY_DEFINITIONS, ANOMALY_ENTRY_COSTS, ANOMALY_SCHEDULING } from '../src/game/anomalies/AnomalyRegistry.ts';
import { HeistRewardService, isHeistModRewardEligible } from '../src/game/anomalies/heist/HeistRewardService.ts';
import { HEIST_BALANCE, HEIST_ROUTE, HEIST_WALL_RECTS, HEIST_WORLD } from '../src/game/anomalies/heist/HeistConfig.ts';
import {
  findHeistNodePath,
  generateHeistFacilityLayout,
  validateHeistFacilityLayout
} from '../src/game/anomalies/heist/HeistFacilityLayout.ts';
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

test('HEIST vault starts with a premium currency and Mod floor before weighted extras', () => {
  const rewards = new HeistRewardService(417, 30, 'overdrive-phoenix', 150);
  const firstFour = Array.from({ length: 4 }, () => rewards.rollContainer());
  assert.deepEqual(firstFour.map((reward) => reward.kind), ['credits', 'plasmaChips', 'coreTokens', 'mod']);
  assert.ok(firstFour[0].amount >= 200_000);
  assert.ok(firstFour[1].amount >= 119, 'guaranteed Plasma should fund approximately one engineering roll');
  assert.ok(firstFour[2].amount >= 42);
  assert.ok(firstFour[3].modId);
});

test('HEIST reward scaling improves with entry risk but never guarantees a full Flux refund', () => {
  for (const cost of [100, 150, 200]) {
    let fullRefunds = 0;
    let plasma = 0;
    let flux = 0;
    for (let run = 0; run < 1_000; run += 1) {
      const rewards = new HeistRewardService(1000 + run * 97, 30, 'overdrive-phoenix', cost);
      const loot = rewards.createEmpty();
      const containers = HEIST_BALANCE.containerMinimum + run % (HEIST_BALANCE.containerMaximum - HEIST_BALANCE.containerMinimum + 1);
      for (let index = 0; index < containers; index += 1) rewards.add(loot, rewards.rollContainer());
      plasma += loot.plasmaChips;
      flux += loot.fluxCores;
      if (loot.fluxCores >= cost) fullRefunds += 1;
    }
    assert.ok(plasma / 1_000 >= 120);
    assert.ok(flux / 1_000 > 5, 'Flux recovery should be meaningful across successful expeditions');
    assert.ok(fullRefunds < 25, 'the entry fee must remain real rather than an automatic refund');
  }
});

test('Arena suspension is the authoritative preservation boundary and only commits successful extraction', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  assert.match(arena, /this\.scene\.launch\(SceneKeys\.Heist, session\);[\s\S]{0,400}this\.scene\.sleep\(\)/);
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
  assert.match(heist, /private failHeist\(reason: 'player-dead' \| 'extraction-timeout' = 'player-dead'\)/);
  assert.match(heist, /beginReturnFade\(false, reason, 500\)/);
  assert.doesNotMatch(heist, /SceneKeys\.Results|triggerDefeat/);
  assert.match(heist, /arena\.events\.emit\('anomaly-return'/);
  assert.match(heist, /Phaser\.Cameras\.Scene2D\.Events\.FADE_OUT_COMPLETE/);
  const transition = heist.slice(heist.indexOf('private returnToArena'), heist.indexOf('private updateHud'));
  assert.doesNotMatch(transition, /this\.scene\.resume\(SceneKeys\.Arena\)/);
});

test('Anomaly telemetry, mixer audio hooks, scene registration, and DEV controls remain explicit', () => {
  const telemetry = source('../src/game/telemetry/GameplayTelemetryRecorder.ts');
  const audio = source('../src/game/anomalies/AnomalyAudioHooks.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const boot = source('../src/game/scenes/BootScene.ts');
  assert.match(telemetry, /anomalyEvents: AnomalyMetricEvent\[\]/);
  assert.match(telemetry, /recordAnomalyEvent/);
  assert.match(audio, /createSilentAnomalyAudioHooks/);
  assert.match(audio, /createAnomalyAudioHooks/);
  assert.match(audio, /AudioManager/);
  assert.match(arena, /audio: createAnomalyAudioHooks\(this\.audio\)/);
  for (const control of ['forceAnomaly', 'forceAnomalyCharge', 'setAnomalyCost', 'setHeistMiniBoss']) assert.match(arena, new RegExp(control));
  assert.match(boot, /SceneKeys\.Heist/);
});

test('Anomaly and HEIST sounds follow authoritative feed, portal, door, alarm, pause, and cleanup boundaries', () => {
  const hooks = source('../src/game/anomalies/AnomalyAudioHooks.ts');
  const controller = source('../src/game/anomalies/AnomalyController.ts');
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  const manager = source('../src/game/systems/AudioManager.ts');
  for (const filename of [
    'portalpowerupsound.mp3', 'portalidlesound.mp3', 'portalenterexitsound.mp3',
    'heistdoorsound.mp3', 'alarmsound.mp3', 'heistanomalysound.mp3'
  ]) assert.ok(existsSync(new URL(`../public/assets/audio/soundeffects/${filename}`, import.meta.url)), filename);
  assert.match(hooks, /case 'essence-absorption':[\s\S]*?restartAnomalyPortalPower\(\)/);
  assert.match(hooks, /case 'portal-idle':[\s\S]*?startAnomalyPortalIdle\(\)/);
  assert.match(hooks, /case 'portal-entry':[\s\S]*?case 'portal-return':[\s\S]*?playSfx\('anomalyPortalTransit'\)/);
  assert.match(hooks, /case 'door-open':[\s\S]*?case 'door-close':[\s\S]*?playSfx\('heistDoor'\)/);
  assert.match(hooks, /case 'warning-state':[\s\S]*?startHeistAlarm\(\)/);
  assert.match(controller, /visual\.readyForInteraction && !this\.portalIdleStarted/);
  assert.doesNotMatch(controller.slice(controller.indexOf('private openPortal'), controller.indexOf('private tryEnter')), /play\('portal-idle'\)/);
  assert.match(heist, /ready && !this\.extractionPortalIdleStarted/);
  assert.match(manager, /pauseEventPresentationLoops/);
  assert.match(manager, /resumeEventPresentationLoops/);
  assert.match(heist, /coreAudio\.enterHeistMusic\(\)/);
  assert.match(heist, /coreAudio\.exitHeistMusic\(\)/);
  assert.match(manager, /enterHeistMusic[\s\S]*?musicAudio\?\.pause\(\)[\s\S]*?heistMusicAudio/);
  assert.match(manager, /exitHeistMusic[\s\S]*?heistMusicAudio\?\.pause\(\)[\s\S]*?musicAudio\.play\(\)/);
  assert.match(manager, /stopAnomalySfx/);
  assert.match(manager, /private anomalyPortalPowerAudio: HTMLAudioElement \| null = null/);
  assert.match(manager, /restartAnomalyPortalPower[\s\S]*?audio\.pause\(\)[\s\S]*?audio\.currentTime = 0[\s\S]*?audio\.play\(\)/);
  assert.doesNotMatch(manager, /anomalyPortalPower:\s*\[\]/);
  assert.match(hooks, /case 'portal-idle':[\s\S]*?stopAnomalyPortalPower\(\)[\s\S]*?startAnomalyPortalIdle\(\)/);
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
  assert.match(heist, /resourcePickupCap\(/);
  assert.match(heist, /nextPickupBuffStack\(/);
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
  assert.match(facility, /body\.disableBody\(true, false\)/);
  assert.match(facility, /body\.enableBody\(false, spec\.x, spec\.y, true, false\)/);
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

test('Arena owns ordered HEIST stop, Arena wake, and WAKE-bound restoration', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  const transition = heist.slice(heist.indexOf('private returnToArena'), heist.indexOf('private updateHud'));
  assert.doesNotMatch(transition, /this\.scene\.(?:resume|wake)\(SceneKeys\.Arena\)/);
  assert.doesNotMatch(transition, /this\.scene\.stop\(SceneKeys\.Heist\)/);
  assert.match(transition, /arena\.events\.emit\('anomaly-return'/);
  const stageReturn = arena.slice(arena.indexOf('private readonly onAnomalyReturn'), arena.indexOf('private readonly onArenaWoken'));
  const restoreReturn = arena.slice(arena.indexOf('private readonly onArenaWoken'), arena.indexOf('constructor()'));
  assert.match(stageReturn, /stageReturn\(result\.sessionId\)/);
  assert.ok(stageReturn.indexOf('this.scene.stop(SceneKeys.Heist)') < stageReturn.indexOf('this.scene.wake(SceneKeys.Arena)'));
  assert.match(stageReturn, /this\.scene\.wake\(SceneKeys\.Arena\)/);
  assert.doesNotMatch(stageReturn, /this\.scene\.(?:start|restart)\(SceneKeys\.Arena/);
  assert.doesNotMatch(stageReturn, /restoreAnomalySimulation/);
  assert.match(restoreReturn, /beginRestore\(result\.sessionId\)/);
  assert.match(restoreReturn, /restoreAnomalySimulation/);
  assert.match(arena, /events\.on\(Phaser\.Scenes\.Events\.WAKE, this\.onArenaWoken\)/);
  assert.match(arena, /this\.scene\.sleep\(\)/);
  assert.match(arena, /restoreArenaCamera\(suspension\)/);
  assert.match(arena, /physicsWasPaused: this\.physics\.world\.isPaused/);
  assert.match(arena, /physicsTimeScale: this\.physics\.world\.timeScale/);
  assert.match(arena, /clockWasPaused: this\.time\.paused/);
  assert.match(arena, /clockTimeScale: this\.time\.timeScale/);
  assert.match(arena, /playerBodyEnabled:/);
  assert.match(arena, /this\.state\.set\(suspension\.roundState\)/);
  assert.match(arena, /inputBridge: this\.devAnomalyReturnSoak \? undefined : this\.pointerLock \?\? undefined/);
  assert.match(heist, /inputDevice: this\.session\.dev\?\.instantReturn \? 'gamepad' : this\.inputController\.activeDevice/);
  const entry = arena.slice(arena.indexOf('private beginAnomalyTransition'), arena.indexOf('private commitAnomalyLoot'));
  assert.doesNotMatch(entry, /pointerLock\?\.destroy|pointerLock\?\.release/);
  assert.match(arena, /camera\.resetFX\(\)/);
  assert.match(arena, /camera\.setVisible\(true\)/);
});

test('HEIST shutdown leaves Phaser-owned objects to Phaser and resets reusable scene state', () => {
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  const reset = heist.slice(heist.indexOf('private resetSessionState'), heist.indexOf('private resolveProjectileCosmetics'));
  const cleanup = heist.slice(heist.indexOf('private cleanup()'), heist.lastIndexOf('\n}'));
  assert.match(reset, /this\.returning = false/);
  assert.match(reset, /this\.returnResultDelivered = false/);
  assert.match(reset, /this\.containers\.length = 0/);
  assert.match(cleanup, /Do not destroy[\s\S]*a second time/);
  assert.match(cleanup, /projectilePool\?\.discardReferences\(\)/);
  assert.match(cleanup, /fxCirclePool\?\.discardReferences\(\)/);
  assert.match(cleanup, /lootPickups\?\.discardReferences\(\)/);
  assert.match(heist, /private maintainCombatPools/);
  assert.match(heist, /nextPoolMaintenanceAt = now \+ 2_000/);
  assert.doesNotMatch(cleanup, /this\.facility\?\.destroy|this\.hud\?\.destroy|this\.projectilePool\?\.destroy/);
});

test('DEV anomaly return soak uses scene lifecycle events for repeated full handoffs', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  assert.match(arena, /n3onAnomalyReturnSoak=\(cycles=10\)/);
  assert.match(arena, /private continueDevAnomalyReturnSoak\(\)/);
  assert.match(arena, /this\.continueDevAnomalyReturnSoak\(\)/);
  assert.match(heist, /Phaser\.Scenes\.Events\.POST_UPDATE, this\.onDevInstantReturn/);
  assert.doesNotMatch(arena.slice(
    arena.indexOf('private startDevAnomalyReturnSoak'),
    arena.indexOf('private validateAnomalyReturnInvariants')
  ), /setTimeout|delayedCall/);
});

test('Anomaly return lifecycle is idempotent across 12 consecutive transfers', () => {
  const lifecycle = new AnomalyReturnLifecycle();
  for (let cycle = 0; cycle < 12; cycle += 1) {
    const sessionId = `repeat-${cycle}`;
    assert.equal(lifecycle.begin(sessionId), true);
    assert.deepEqual(lifecycle.snapshot(), { phase: 'arena-sleeping', sessionId });
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
  assert.ok(HEIST_ROUTE.length >= 9);
  for (const point of HEIST_ROUTE) {
    const blocked = HEIST_WALL_RECTS.some((rect) => point.x >= rect.x && point.x <= rect.x + rect.w
      && point.y >= rect.y && point.y <= rect.y + rect.h);
    assert.equal(blocked, false, `route point ${point.x},${point.y} is inside a wall`);
  }
});

test('seeded HEIST layouts validate across varied entry and extraction nodes', () => {
  const entries = new Set();
  const extractions = new Set();
  for (let seed = 1; seed <= 96; seed += 1) {
    const layout = generateHeistFacilityLayout(seed * 0x45d9f3b);
    const validation = validateHeistFacilityLayout(layout);
    assert.deepEqual(validation.reasons, [], `seed ${seed}: ${validation.reasons.join(', ')}`);
    assert.equal(validation.valid, true);
    assert.notEqual(layout.entryNodeId, layout.extractionNodeId);
    assert.ok(layout.vaultDoors.length >= 2);
    assert.ok(layout.diagnostics.loops >= 1);
    assert.ok(layout.diagnostics.deadEnds >= 1);
    assert.equal(layout.diagnostics.initialVaultLineOfSightBlocked, true);
    assert.ok(findHeistNodePath(layout, layout.entryNodeId, layout.vaultNodeId).length >= 9);
    assert.ok(findHeistNodePath(layout, layout.vaultNodeId, layout.extractionNodeId).length >= 7);
    entries.add(layout.entryNodeId);
    extractions.add(layout.extractionNodeId);
  }
  assert.ok(entries.size >= 8, `expected varied entry nodes, got ${entries.size}`);
  assert.ok(extractions.size >= 8, `expected varied extraction nodes, got ${extractions.size}`);
});

test('HEIST DEV F9 bypass skips only payment and enters through the normal transition pipeline', () => {
  const controller = source('../src/game/anomalies/AnomalyController.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const bypass = controller.slice(controller.indexOf('tryEnterDevBypass()'), controller.indexOf('setForcedCost'));
  assert.match(bypass, /import\.meta\.env\.DEV/);
  assert.match(bypass, /this\.context\.isGameplayEligible\(\)/);
  assert.match(bypass, /stateValue !== 'portal-ready'/);
  assert.match(bypass, /readyForInteraction/);
  assert.match(bypass, /interactionRadius/);
  assert.match(bypass, /this\.tryEnter\(\{ bypassCost: true, source: 'dev-hotkey' \}\)/);
  assert.equal((controller.match(/this\.context\.beginTransition\(/g) ?? []).length, 1,
    'paid and DEV entry must share one transition owner');
  assert.match(controller, /Portal cost bypassed via F9/);
  assert.match(arena, /import\.meta\.env\.DEV && Phaser\.Input\.Keyboard\.JustDown\(this\.keys\.f9\)/);
  assert.match(arena, /this\.anomalyController\?\.tryEnterDevBypass\(\)/);
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

test('HEIST escape timer, traps, patrols, and reinforcements remain bounded and phase-correct', () => {
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  const facility = source('../src/game/anomalies/heist/HeistFacility.ts');
  const traps = source('../src/game/anomalies/heist/HeistTrapSystem.ts');
  assert.equal(HEIST_BALANCE.extractionDurationMs, 45_000);
  assert.match(heist, /phase === 'egress-ready' && !this\.facility\.isInsideVault/);
  assert.match(heist, /this\.escapeDeadline = now \+ HEIST_BALANCE\.extractionDurationMs/);
  assert.match(heist, /private spawnInfiltrationPatrols/);
  assert.match(heist, /escapeMaximumEnemies - this\.enemies\.length/);
  assert.match(heist, /selectEnemyPickup/);
  assert.match(heist, /enemyAnomalyLootChance/);
  assert.match(facility, /heistPathPoints\(layout, from, layout\.extractionNodeId\)/);
  assert.match(facility, /guideMarkers\.length/);
  for (const type of ['fire', 'spike', 'snag']) assert.match(traps, new RegExp(`'${type}'`));
  assert.match(traps, /this\.nextUpdateAt = now \+ 50/);
  assert.match(traps, /physicsBodies: 0/);
  assert.match(traps, /now \+ 1_000/);
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
