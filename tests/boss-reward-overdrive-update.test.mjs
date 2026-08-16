import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOSS_BALANCE } from '../src/game/config/bossBalance.ts';
import { MOD_BALANCE } from '../src/game/mods/modBalance.ts';
import {
  OVERDRIVE_MAX_PICKUP_BUFF_STACKS,
  nextPickupBuffStack,
  resourcePickupCap,
  stackedPickupMultiplier
} from '../src/game/player/OverdriveRules.ts';

const arenaSource = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const encounterSource = readFileSync(new URL('../src/game/bosses/BossEncounter.ts', import.meta.url), 'utf8');
const audioSource = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');

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

test('arena Mod drops are physical before inventory award and boss chance increases modestly', () => {
  assert.match(arenaSource, /spawnModPickup\(definition, source, x, y\)/);
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
