import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANOMALY_DEFINITIONS, ANOMALY_ENTRY_COSTS, ANOMALY_SCHEDULING } from '../src/game/anomalies/AnomalyRegistry.ts';
import { HeistRewardService } from '../src/game/anomalies/heist/HeistRewardService.ts';

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
  assert.match(arena, /this\.player\.invulnUntil = this\.time\.now \+ HEIST_BALANCE\.safeReturnInvulnerabilityMs/);
  assert.match(arena, /spendAnomalyEntryCost/);
  assert.match(arena, /SaveSystem\.spendFluxCores/);
});

test('HEIST failure bypasses normal defeat and restores through the Arena return event', () => {
  const heist = source('../src/game/anomalies/heist/HeistScene.ts');
  assert.match(heist, /private failHeist\(\)/);
  assert.match(heist, /returnToArena\(false, 'player-dead'\)/);
  assert.doesNotMatch(heist, /SceneKeys\.Results|triggerDefeat/);
  assert.match(heist, /arena\.events\.emit\('anomaly-return'/);
  assert.match(heist, /this\.scene\.resume\(SceneKeys\.Arena\)/);
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
  assert.match(heist, /projectile\.crossedFences\.clear\(\)/);
  assert.match(heist, /projectile\.sprite\.body\.enable = true/);
  assert.match(heist, /projectile\.sprite\.body\.enable = false/);
  assert.match(heist, /setVelocity\(0, 0\)/);
});

