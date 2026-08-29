import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getProtocolModeBalance } from '../src/game/config/modeBalance.ts';
import { addModDrop, createDefaultModCollection, equipMod, unequipMod } from '../src/game/mods/ModInventoryService.ts';
import { enqueueModAcquisition } from '../src/game/mods/ModAcquisition.ts';
import { getModRarityProbability, getModDropChance } from '../src/game/mods/ModDropService.ts';
import { ModRuntime, SUPREME_MOD_STABILITY_CAPS } from '../src/game/mods/ModRuntime.ts';
import { MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { protocolStart } from '../src/game/mods/ModRules.ts';
import { RUN_PROTOCOL_IDS, RUN_PROTOCOLS, cycleUnlockedProtocol, isRunProtocolUnlocked } from '../src/game/mods/modBalance.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import {
  SUPREME_CONSTELLATIONS,
  SUPREME_STAGE_DEFINITIONS,
  isSupremeStageUnlocked,
  isSupremeTerminalRound
} from '../src/game/progression/SupremeProgression.ts';
import { calculateProtocolTerminalVerticalLayout } from '../src/game/garage/protocolTerminalLayout.ts';
import { resolveSupremeBridgeReward } from '../src/game/progression/SupremeBridgeReward.ts';
import { resolveSupremePostRoundPlan } from '../src/game/progression/SupremeRoundTransition.ts';

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Supreme progression starts after Overdrive Round 50 and runs through the Round 100 terminal', () => {
  assert.equal(SUPREME_STAGE_DEFINITIONS.length, 11);
  assert.deepEqual(SUPREME_STAGE_DEFINITIONS.map((stage) => stage.level), [51, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
  assert.equal(RUN_PROTOCOLS['overdrive-pegasus'].startingRound, 50);
  assert.equal(RUN_PROTOCOLS['supreme-leo'].startingRound, 51);
  assert.equal(new Set(SUPREME_STAGE_DEFINITIONS.map((stage) => stage.constellation)).size, 11);
  const existingNames = new Set(RUN_PROTOCOL_IDS
    .map((id) => RUN_PROTOCOLS[id])
    .filter((definition) => definition.family === 'overdrive')
    .map((definition) => definition.label.replace('OVERDRIVE ', '')));
  for (const stage of SUPREME_STAGE_DEFINITIONS) {
    assert.equal(RUN_PROTOCOLS[stage.protocolId].family, 'supreme');
    assert.equal(RUN_PROTOCOLS[stage.protocolId].startingRound, stage.level);
    assert.equal(existingNames.has(stage.constellation), false, `${stage.constellation} was already used by Overdrive`);
    assert.ok(SUPREME_CONSTELLATIONS[stage.constellationKey]);
  }
  assert.equal(SUPREME_STAGE_DEFINITIONS.at(-1).terminalEncounter, true);
  assert.equal(isSupremeTerminalRound('supreme-centaurus', 100), true);
  assert.equal(isSupremeTerminalRound('supreme-centaurus', 99), false);
});

test('Supreme unlocks require a successful regular Overdrive clear, then persistent Supreme round progression', () => {
  const [leo, gemini, cassiopeia, aquila] = SUPREME_STAGE_DEFINITIONS;
  assert.equal(leo.unlockSource, 'regular-overdrive');
  assert.equal(gemini.unlockSource, 'supreme');
  assert.equal(isSupremeStageUnlocked(leo, { highestRound: 200, supremeHighestRound: 100 }), false);
  assert.equal(isSupremeStageUnlocked(leo, { highestRound: 50, supremeHighestRound: 0, regularOverdriveCompleted: true }), true);
  assert.equal(isSupremeStageUnlocked(gemini, { highestRound: 200, supremeHighestRound: 57 }), false);
  assert.equal(isSupremeStageUnlocked(gemini, { highestRound: 58, supremeHighestRound: 58 }), true);
  assert.equal(isSupremeStageUnlocked(cassiopeia, { highestRound: 200, supremeHighestRound: 68 }), true);
  assert.equal(isSupremeStageUnlocked(aquila, { highestRound: 200, supremeHighestRound: 77 }), false);
  assert.equal(isRunProtocolUnlocked('supreme-aquila', { highestRound: 200, supremeHighestRound: 78 }), true);
  assert.equal(protocolStart('supreme-gemini', 200, 57).protocol, 'normal');
  assert.equal(protocolStart('supreme-gemini', 200, 58).startingRound, 55);
  assert.equal(cycleUnlockedProtocol('overdrive-pegasus', 53, 1, 0, true), 'supreme-leo');
});

test('Round 50 completion advances to Supreme 51 only after the successful completion decision', () => {
  const base = {
    protocol: 'overdrive-pegasus', completedRound: 50,
    firstSupremeAwarded: false, firstSupremeTutorialSeen: false,
    regularOverdriveCompleted: false
  };
  assert.deepEqual(resolveSupremePostRoundPlan(base), {
    completesRegularOverdrive: true,
    newlyUnlocksSupremeOverdrive: true,
    nextProtocol: 'supreme-leo',
    milestone: 'overdrive-unlocked'
  });
  assert.equal(resolveSupremePostRoundPlan({ ...base, firstSupremeAwarded: true }).milestone, 'overdrive-unlocked-first-supreme');
  assert.equal(resolveSupremePostRoundPlan({ ...base, completedRound: 49 }).nextProtocol, 'overdrive-pegasus');
  assert.equal(resolveSupremePostRoundPlan({ ...base, protocol: 'normal' }).completesRegularOverdrive, false);
});

test('Supreme stage scaling is centralized, monotonic, and stronger than the Overdrive baseline', () => {
  const overdrive = getProtocolModeBalance('overdrive');
  const first = getProtocolModeBalance('supreme-leo');
  const final = getProtocolModeBalance('supreme-centaurus');
  for (const key of ['enemyHealthMultiplier', 'enemyDamageMultiplier', 'enemySpeedMultiplier', 'hazardDamageMultiplier', 'activePressureMultiplier', 'elitePressureMultiplier', 'bossHealthMultiplier', 'bossDamageMultiplier', 'modDropChanceMultiplier', 'highRarityWeightMultiplier', 'legendaryWeightMultiplier', 'scoreMultiplier']) {
    assert.ok(first[key] > overdrive[key], `${key} does not exceed Overdrive`);
    assert.ok(final[key] > first[key], `${key} does not increase through Supreme`);
  }
  for (const key of ['enemyDefuseTimeMultiplier', 'spawnCadenceMultiplier']) {
    assert.ok(first[key] < overdrive[key], `${key} is not more aggressive than Overdrive`);
    assert.ok(final[key] < first[key], `${key} does not intensify through Supreme`);
  }
  assert.equal(first.overhealthEnabled, true);
  assert.equal(first.overchargeEnabled, true);
  assert.equal(first.pickupStackLimit, overdrive.pickupStackLimit);
});

test('ten Supreme Mods are three-system endgame cards and remain exclusive to Supreme drop tables', () => {
  const definitions = MOD_DEFINITIONS.filter((definition) => definition.rarity === 'supreme');
  const definitionsWithOneRuntimeEffect = new Set([
    'supreme-singularity-chamber',
    'supreme-final-protocol',
    'supreme-crown-of-stars'
  ]);
  assert.equal(definitions.length, 10);
  assert.equal(new Set(definitions.map((definition) => definition.id)).size, 10);
  for (const definition of definitions) {
    assert.ok(definition.id.startsWith('supreme-'));
    assert.equal(definition.supremeEffects?.length, 3);
    assert.equal(new Set(definition.supremeEffects?.map((effect) => effect.family)).size, 3);
    assert.equal(
      definition.modifiers.length,
      definitionsWithOneRuntimeEffect.has(definition.id) ? 2 : 3,
      `${definition.id} must expose exactly three total systems`
    );
    assert.equal(definition.modifiers?.some((modifier) => modifier.stat === 'weaponFireRate'), false);
    assert.equal(Object.keys(definition.rankDescriptions).length, 4);
  }
  const request = { source: 'boss', round: 100, seed: 413, sequence: 0, guaranteed: true };
  assert.equal(getModRarityProbability({ ...request, protocol: 'normal' }, 'supreme'), 0);
  assert.equal(getModRarityProbability({ ...request, protocol: 'overdrive-pegasus' }, 'supreme'), 0);
  const early = getModRarityProbability({ ...request, protocol: 'supreme-leo' }, 'supreme');
  const terminal = getModRarityProbability({ ...request, protocol: 'supreme-centaurus' }, 'supreme');
  assert.ok(early > 0);
  assert.ok(terminal > early);
  assert.ok(getModDropChance({ ...request, protocol: 'supreme-centaurus', guaranteed: false }) > getModDropChance({ ...request, protocol: 'overdrive', guaranteed: false }));
});

test('Supreme Mods are a native Epic-like Supreme ecosystem across every intended reward source', () => {
  const sources = ['normalEnemy', 'eliteEnemy', 'milestone', 'boss', 'arcade', 'anomaly'];
  for (const sourceName of sources) {
    const request = {
      source: sourceName,
      round: sourceName === 'milestone' ? 55 : 51,
      seed: 991,
      sequence: 0,
      protocol: 'supreme-leo',
      guaranteed: sourceName === 'milestone' || sourceName === 'arcade' || sourceName === 'anomaly'
    };
    const supreme = getModRarityProbability(request, 'supreme');
    assert.ok(supreme > 0, `${sourceName} cannot award a Supreme Mod`);
    if (sourceName !== 'normalEnemy') {
      const epic = getModRarityProbability(request, 'epic');
      assert.ok(supreme >= epic * 0.65, `${sourceName} Supreme rate fell well below Epic`);
      assert.ok(supreme <= epic * 1.25, `${sourceName} Supreme rate exceeded the intended Epic-like band`);
    }
    assert.equal(getModRarityProbability({ ...request, protocol: 'normal' }, 'supreme'), 0);
    assert.equal(getModRarityProbability({ ...request, protocol: 'overdrive-pegasus' }, 'supreme'), 0);
  }
});

test('Supreme Bomb Time effects accelerate detonation at every rank', () => {
  for (const id of ['supreme-eventide-arsenal', 'supreme-triune-bastion']) {
    const definition = MOD_DEFINITIONS.find((entry) => entry.id === id);
    const duration = definition?.modifiers.find((modifier) => modifier.stat === 'bombDuration');
    assert.ok(duration, `${id} is missing bombDuration`);
    for (const value of Object.values(duration.values)) assert.ok(value < 1, `${id} lengthens the countdown`);
    assert.match(definition.description, /accelerated/i);
    assert.doesNotMatch(Object.values(definition.rankDescriptions).join(' '), /detonation(?: time)? \+/i);
  }
});

test('Supreme Mods use the existing inventory/loadout/runtime path with hard stability ceilings', () => {
  const mods = createDefaultModCollection();
  const carapace = addModDrop(mods, 'supreme-quantum-carapace');
  const mask = addModDrop(mods, 'gas-mask');
  assert.equal(carapace.ok, true);
  assert.equal(mask.ok, true);
  mods.cards.find((card) => card.modId === 'supreme-quantum-carapace').upgradeLevel = 3;
  mods.cards.find((card) => card.modId === 'gas-mask').upgradeLevel = 3;
  assert.equal(equipMod(mods, 'player', 'supreme-quantum-carapace').ok, false, 'Normal rejects Supreme activation');
  assert.equal(equipMod(mods, 'player', 'supreme-quantum-carapace', undefined, 'overdrive-pegasus').ok, false, 'regular Overdrive rejects Supreme activation');
  assert.equal(equipMod(mods, 'weapon', 'supreme-quantum-carapace', undefined, 'supreme-leo').ok, true, 'Supreme is universal in Supreme Overdrive');
  assert.equal(equipMod(mods, 'wildcard', 'gas-mask').ok, true);
  assert.equal(new ModRuntime(mods).has('supreme-quantum-carapace'), false, 'Normal runtime suppresses a saved Supreme reference');
  const runtime = new ModRuntime(mods, undefined, 'supreme-leo');
  assert.equal(runtime.has('supreme-quantum-carapace'), true);
  assert.equal(runtime.multiplier('playerMaxHealth'), 2.45);
  assert.equal(runtime.multiplier('gasDamageTaken'), SUPREME_MOD_STABILITY_CAPS.minimumMultiplier);
});

test('Supreme reveals preempt Legendary and standard presentations without losing FIFO awards', () => {
  const card = (instanceId) => ({ instanceId, modId: 'split-current', upgradeLevel: 0 });
  const queue = [];
  enqueueModAcquisition(queue, { card: card('common-1'), rarity: 'common', duplicate: false, sourceScreenX: 0, sourceScreenY: 0 });
  enqueueModAcquisition(queue, { card: card('legendary-1'), rarity: 'legendary', duplicate: false, sourceScreenX: 0, sourceScreenY: 0 });
  enqueueModAcquisition(queue, { card: card('supreme-1'), rarity: 'supreme', duplicate: false, sourceScreenX: 0, sourceScreenY: 0 });
  enqueueModAcquisition(queue, { card: card('supreme-2'), rarity: 'supreme', duplicate: false, sourceScreenX: 0, sourceScreenY: 0 });
  assert.deepEqual(queue.map((entry) => entry.card.instanceId), ['supreme-1', 'supreme-2', 'legendary-1', 'common-1']);
});

test('version-thirteen saves migrate Supreme progression defaults without losing existing data', () => {
  const old = structuredClone(createDefaultLocalSave('supreme-v13', 'Supreme Legacy'));
  old.version = 13;
  old.wallet.credits = 76543;
  old.progress.highestRound = 63;
  delete old.progress.normalHighestRound;
  delete old.progress.supremeHighestRound;
  delete old.progress.supremeOverdriveCompleted;
  const migrated = normalizeLocalSave(old);
  assert.equal(migrated.version, 17);
  assert.equal(migrated.wallet.credits, 76543);
  assert.equal(migrated.progress.highestRound, 63);
  assert.equal(migrated.progress.supremeHighestRound, 0);
  assert.equal(migrated.progress.supremeOverdriveCompleted, false);
  assert.equal(migrated.progress.normalHighestRound, 63);
});

test('Supreme universal-slot access still enforces a hard two-card active limit', () => {
  const slots = ['weapon', 'player', 'defense', 'bombSite', 'wildcard'];
  for (const definition of MOD_DEFINITIONS.filter((entry) => entry.rarity === 'supreme')) {
    for (const slot of slots) {
      const universal = createDefaultModCollection();
      assert.equal(addModDrop(universal, definition.id).ok, true);
      assert.equal(equipMod(universal, slot, definition.id, undefined, 'supreme-leo').ok, true, `${definition.id} rejected ${slot}`);
      assert.equal(new ModRuntime(universal, undefined, 'supreme-leo').has(definition.id), true);
    }
  }

  const mods = createDefaultModCollection();
  const ids = MOD_DEFINITIONS.filter((definition) => definition.rarity === 'supreme').slice(0, 3).map((definition) => definition.id);
  for (const id of ids) assert.equal(addModDrop(mods, id).ok, true);
  assert.equal(equipMod(mods, 'weapon', ids[0], undefined, 'supreme-leo').ok, true);
  assert.equal(equipMod(mods, 'bombSite', ids[1], undefined, 'supreme-leo').ok, true);
  assert.equal(equipMod(mods, 'defense', ids[2], undefined, 'supreme-leo').ok, false);
  assert.equal(new ModRuntime(mods, undefined, 'supreme-leo').snapshot().filter((entry) => entry.id.startsWith('supreme-')).length, 2);
  unequipMod(mods, 'weapon');
  assert.equal(equipMod(mods, 'defense', ids[2], undefined, 'supreme-leo').ok, true, 'capacity reopens after removing one Supreme');
});

test('regular Overdrive Supreme bridge is deterministic, one-time, and forced by Round 50', () => {
  const base = { protocol: 'overdrive-pegasus', seed: 812733, alreadyAwarded: false, ownedModIds: [] };
  assert.equal(resolveSupremeBridgeReward({ ...base, protocol: 'normal', completedRound: 50 }).eligible, false);
  assert.equal(resolveSupremeBridgeReward({ ...base, protocol: 'supreme-leo', completedRound: 50 }).eligible, false);
  assert.equal(resolveSupremeBridgeReward({ ...base, completedRound: 47 }).eligible, false);
  const forced = resolveSupremeBridgeReward({ ...base, completedRound: 50 });
  assert.equal(forced.guaranteed, true);
  assert.equal(forced.markSatisfied, true);
  assert.ok(forced.modId?.startsWith('supreme-'));
  assert.deepEqual(forced, resolveSupremeBridgeReward({ ...base, completedRound: 50 }));
  assert.equal(resolveSupremeBridgeReward({ ...base, completedRound: 50, alreadyAwarded: true }).modId, null);
  assert.equal(resolveSupremeBridgeReward({ ...base, completedRound: 49, ownedModIds: [forced.modId] }).markSatisfied, true);

  const persisted = createDefaultLocalSave('bridge-persist', 'Bridge Persist');
  persisted.progress.regularOverdriveSupremeBridgeAwarded = true;
  assert.equal(normalizeLocalSave(structuredClone(persisted)).progress.regularOverdriveSupremeBridgeAwarded, true);
});

test('terminal finale owns three simultaneous real boss encounters and persists only an all-defeated clear', () => {
  const finale = source('../src/game/bosses/SupremeFinaleController.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const save = source('../src/game/state/PlayerProfileStore.ts');
  const debrief = source('../src/game/scenes/RoundFinishedScene.ts');
  assert.match(finale, /\['artillery', 'storm-mage', 'void-brawler'\]/);
  assert.match(finale, /ARCHETYPES\.map[\s\S]*?new BossEncounter/);
  assert.match(finale, /if \(remaining === 0\)[\s\S]*?callbacks\.onComplete\(\)/);
  assert.match(arena, /isSupremeTerminalRound\(this\.protocol, completedRound\)/);
  assert.match(arena, /SaveSystem\.recordSupremeCompletion\(\)/);
  assert.match(arena, /terminalBossesDefeated: 3/);
  assert.match(save, /supremeOverdriveCompleted = true/);
  assert.match(debrief, /SUPREME OVERDRIVE COMPLETE/);
  assert.match(debrief, /ALL THREE COMMAND BOSSES ELIMINATED/);
});

test('Supreme floor and terminal presentation remain bounded and clean up with Arena lifecycle', () => {
  const floor = source('../src/game/vfx/SupremeConstellationFloor.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const victory = source('../src/game/bosses/SupremeVictorySequence.ts');
  assert.match(floor, /One static command buffer plus one traveling light/);
  assert.match(floor, /now - this\.lastUpdateAt < 50/);
  assert.match(floor, /this\.finaleJourney\?\.destroy\(\)/);
  assert.match(arena, /this\.supremeFinale\?\.destroy\(\)/);
  assert.match(arena, /this\.supremeConstellation\?\.destroy\(\)/);
  assert.match(arena, /forceSupremeStage/);
  assert.match(arena, /forceSupremeFinale/);
  assert.match(arena, /previewSupremeMod/);
  assert.match(victory, /index < 72/);
  assert.match(victory, /this\.timers\.forEach[\s\S]*?this\.tweens\.forEach[\s\S]*?this\.objects\.forEach/);
});

test('Supreme terminal switch row is anchored below its real header at supported desktop sizes', () => {
  for (const [width, height] of [[1920, 1080], [1600, 900], [1366, 768]]) {
    const compact = width < 760;
    const frameTop = compact ? 94 : 104;
    const frameHeight = height - frameTop - (compact ? 12 : 20);
    const headerHeight = frameHeight < 80 ? 34 : 38;
    const layout = calculateProtocolTerminalVerticalLayout(frameTop, frameHeight, headerHeight, compact);
    const switchTop = layout.switchRowY - layout.switchButtonHeight / 2;
    const switchBottom = layout.switchRowY + layout.switchButtonHeight / 2;
    assert.ok(switchTop >= frameTop + headerHeight + 9, `${width}x${height} switch row overlaps header`);
    assert.ok(layout.cardsTop >= switchBottom + 11, `${width}x${height} cards overlap switch row`);
    assert.ok(layout.cardsBottom > layout.cardsTop, `${width}x${height} has no stage-card region`);
  }
  const garage = source('../src/game/scenes/OperatorGarageScene.ts');
  assert.match(garage, /getModCollectionFrameHeaderHeight\(frameHeight\)/);
  assert.match(garage, /terminalLayout\.switchRowY/);
  assert.doesNotMatch(garage, /frameTop \+ 48, 'OVERDRIVE'/);
});

test('all ten Supreme Mods use one layered, personality-driven, motion-aware card controller', () => {
  const effects = source('../src/game/mods/SupremeModCardEffects.ts');
  const card = source('../src/game/mods/ModCardView.ts');
  const reveal = source('../src/game/scenes/LegendaryModRevealScene.ts');
  const supremeIds = MOD_DEFINITIONS.filter((definition) => definition.rarity === 'supreme').map((definition) => definition.id);
  for (const id of supremeIds) assert.match(effects, new RegExp(`'${id}'`));
  const personalities = [...effects.matchAll(/energyStyle: '([^']+)'/g)].map((match) => match[1]);
  assert.equal(new Set(personalities).size, 10);
  for (const layer of ['holographic substrate', 'energized frame', 'foil system', 'Reactor chamber', 'electrical discharges']) {
    assert.match(effects, new RegExp(layer, 'i'));
  }
  assert.match(effects, /detail === 'full'/);
  assert.match(effects, /detail === 'reduced'/);
  assert.match(effects, /motion === 'off'/);
  assert.match(effects, /setHovered\(hovered: boolean\)/);
  assert.match(effects, /presentationState === 'acquired'/);
  assert.match(effects, /this\.tweens\.forEach\(\(tween\) => tween\.remove\(\)\)/);
  assert.match(card, /new SupremeModCardEffects/);
  assert.match(card, /supremeEffects\?\.setHovered\(true\)/);
  assert.match(card, /supremeEffects\?\.setHovered\(false\)/);
  assert.match(reveal, /presentationState: supreme \? 'acquired' : 'idle'/);
});
