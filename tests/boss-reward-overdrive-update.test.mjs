import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOSS_BALANCE } from '../src/game/config/bossBalance.ts';
import { MOD_BALANCE } from '../src/game/mods/modBalance.ts';
import { canAdvanceFromBossLootCollection } from '../src/game/bosses/BossLootCollectionGate.ts';
import {
  OVERDRIVE_MAX_PICKUP_BUFF_STACKS,
  nextPickupBuffStack,
  resourcePickupCap,
  stackedPickupMultiplier
} from '../src/game/player/OverdriveRules.ts';

const arenaSource = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const encounterSource = readFileSync(new URL('../src/game/bosses/BossEncounter.ts', import.meta.url), 'utf8');
const introOverlaySource = readFileSync(new URL('../src/game/bosses/BossIntroOverlay.ts', import.meta.url), 'utf8');
const audioSource = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
const legendaryRevealSource = readFileSync(new URL('../src/game/scenes/LegendaryModRevealScene.ts', import.meta.url), 'utf8');

test('Overdrive pickup stacks cap at two and refresh without changing normal mode', () => {
  assert.equal(OVERDRIVE_MAX_PICKUP_BUFF_STACKS, 2);
  assert.equal(nextPickupBuffStack(1, true, true), 2);
  assert.equal(nextPickupBuffStack(2, true, true), 2);
  assert.equal(nextPickupBuffStack(2, true, false), 1);
  assert.equal(stackedPickupMultiplier(1.3, 2), 1.6);
  assert.equal(resourcePickupCap(130, true), 260);
  assert.equal(resourcePickupCap(130, false), 130);
});

test('bosses use a gated state flow, distinct attacks, and collection-first rewards', () => {
  assert.match(arenaSource, /type BossFlowPhase = 'none' \| 'intro' \| 'combat' \| 'destruction' \| 'loot-collection' \| 'transitioning'/);
  assert.match(arenaSource, /new BossIntroOverlay/);
  assert.match(arenaSource, /beginBossLootCollection/);
  assert.match(arenaSource, /showBossNextFightButton/);
  assert.match(arenaSource, /source: 'boss-loot'/);
  assert.match(encounterSource, /artillery-rocket/);
  assert.match(encounterSource, /ORBITAL SIEGE/);
  assert.match(encounterSource, /PRISMATIC TEMPEST/);
  assert.match(encounterSource, /spawnPounceTelegraph/);
  assert.ok(BOSS_BALANCE.artillery.movementSpeed > 0);
});

test('boss READY and NEXT FIGHT use camera-independent DOM commands', () => {
  assert.match(introOverlaySource, /this\.ready = new ArenaCommandButton/);
  assert.match(introOverlaySource, /this\.ready\.setGamePosition\(width \* 0\.5, height \* 0\.5 \+ 170 \* scale/);
  assert.doesNotMatch(introOverlaySource, /this\.root\.add\([^;]*this\.ready/);
  assert.match(arenaSource, /this\.bossNextFightButton = new ArenaCommandButton\(this, 'NEXT FIGHT'/);
  assert.match(arenaSource, /this\.finishBossCollection\(\)/);
});

test('boss NEXT FIGHT remains locked until every physical reward and reveal is complete', () => {
  const ready = {
    phase: 'loot-collection',
    pendingLaunches: 0,
    resourcePickupsRemaining: 0,
    modPickupsRemaining: 0,
    revealQueueBusy: false,
    premiumRevealActive: false
  };
  assert.equal(canAdvanceFromBossLootCollection(ready), true);
  for (const blocked of [
    { pendingLaunches: 1 },
    { resourcePickupsRemaining: 1 },
    { modPickupsRemaining: 1 },
    { revealQueueBusy: true },
    { premiumRevealActive: true },
    { phase: 'transitioning' }
  ]) {
    assert.equal(canAdvanceFromBossLootCollection({ ...ready, ...blocked }), false);
  }
  assert.match(arenaSource, /private finishBossCollection\(\): void \{[\s\S]*?if \(!this\.canFinishBossCollection\(\)\)[\s\S]*?transitionBossFlow\('loot-collection', 'transitioning'\)/);
  assert.match(arenaSource, /if \(bossLootChanged\) this\.refreshBossCollectionGate\(\)/);
  assert.match(arenaSource, /if \(source === 'boss'\) this\.refreshBossCollectionGate\(\)/);
  assert.match(arenaSource, /collectibleAt: Number\.POSITIVE_INFINITY,[\s\S]*?source: 'boss-loot'/);
  assert.match(arenaSource, /pickup\.collectibleAt = this\.time\.now/);
});

test('premium Mod reveal completes presenter bookkeeping before resuming the Arena', () => {
  const handoff = legendaryRevealSource.slice(
    legendaryRevealSource.indexOf('private completeOwnerHandoff'),
    legendaryRevealSource.indexOf('private cleanup')
  );
  const completionEvent = handoff.indexOf('LEGENDARY_MOD_REVEAL_COMPLETE_EVENT');
  const ownerResume = handoff.indexOf('this.scene.resume(this.ownerSceneKey)');
  assert.ok(completionEvent >= 0);
  assert.ok(ownerResume > completionEvent);
});

test('boss and Supreme handoffs retire the live encounter before changing scenes', () => {
  const handoff = arenaSource.slice(
    arenaSource.indexOf('private endCurrentRoundRuntime'),
    arenaSource.indexOf('private clearRoundCollections')
  );
  assert.match(handoff, /this\.retireRoundOwnedResources\(\)/);
  assert.match(handoff, /this\.validateRoundRuntimeCleanup\(/);
  assert.match(handoff, /this\.audio\.stopSecurityLaserLoop\(\)/);
  const completed = arenaSource.slice(
    arenaSource.indexOf('private presentCompletedRound'),
    arenaSource.indexOf('private beginBossFight')
  );
  assert.match(completed, /this\.endCurrentRoundRuntime\('completed'\)/);
  const supreme = arenaSource.slice(
    arenaSource.indexOf('private completeSupremeTerminalEncounter'),
    arenaSource.indexOf('private beginBossDestruction')
  );
  assert.match(supreme, /this\.endCurrentRoundRuntime\('completed'\)[\s\S]*?this\.scene\.start\(SceneKeys\.RoundFinished\)/);
  const shutdown = arenaSource.slice(arenaSource.indexOf('private cleanup(): void'));
  assert.match(shutdown, /this\.projectilePool\?\.discardReferences\(\)/);
  assert.doesNotMatch(shutdown, /this\.projectilePool\?\.destroy/);
});

test('boss and standard arenas keep a bounded health and energy support reserve', () => {
  assert.equal(BOSS_BALANCE.supportPickupTargetPerType, 2);
  assert.equal(BOSS_BALANCE.maximumSupportPickups, 4);
  assert.match(arenaSource, /pickup\.source !== 'arena-support'/);
  assert.match(arenaSource, /PICKUP_BALANCE\.arenaSupportTargetPerType - active/);
  assert.match(arenaSource, /pickup\.source !== 'boss-support'/);
  assert.match(arenaSource, /BOSS_BALANCE\.supportPickupTargetPerType - active/);
});

test('round transitions explicitly retire standalone infusion timers and effects', () => {
  assert.match(arenaSource, /private clearRoundInfusionEffects\(\)/);
  assert.match(arenaSource, /for \(const timer of this\.roundInfusionTimers\) timer\.remove\(false\)/);
  assert.match(arenaSource, /private completeRound\(\): void \{[\s\S]*?this\.clearRoundInfusionEffects\(\)/);
});

test('arena Mod drops are physical before inventory award and boss chance increases modestly', () => {
  assert.match(arenaSource, /spawnModPickup\(definition, source, x, y, arcadeEventId\)/);
  assert.match(arenaSource, /distanceSquared <= collectionRadiusSquared/);
  assert.match(arenaSource, /awardResolvedMod\(pickup\.definition, pickup\.source/);
  assert.equal(MOD_BALANCE.dropChance.boss, 0.62);
  assert.equal(MOD_BALANCE.rarityWeights.legendary, 0.5);
});

test('all five requested tracks are part of the shuffled playlist', () => {
  for (const track of ['NeonShamisen.mp3', 'NeonShamisenV2.mp3', 'NeonSwampRiot.mp3', 'NeonSwampRiotV2.mp3', 'NeonTokyoNights.mp3']) {
    assert.match(audioSource, new RegExp(track.replace('.', '\\.')));
  }
  assert.match(audioSource, /shufflePlaylist\(\)/);
});
