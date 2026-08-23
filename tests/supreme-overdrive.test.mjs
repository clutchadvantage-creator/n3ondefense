import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getProtocolModeBalance } from '../src/game/config/modeBalance.ts';
import { addModDrop, createDefaultModCollection, equipMod } from '../src/game/mods/ModInventoryService.ts';
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

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Supreme progression owns eleven unique five-round constellation deployments from 50 through 100', () => {
  assert.equal(SUPREME_STAGE_DEFINITIONS.length, 11);
  assert.deepEqual(SUPREME_STAGE_DEFINITIONS.map((stage) => stage.level), [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
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

test('Supreme unlocks use global clearance once, then persistent Supreme round progression', () => {
  const [leo, gemini, cassiopeia, aquila] = SUPREME_STAGE_DEFINITIONS;
  assert.equal(isSupremeStageUnlocked(leo, { highestRound: 52, supremeHighestRound: 100 }), false);
  assert.equal(isSupremeStageUnlocked(leo, { highestRound: 53, supremeHighestRound: 0 }), true);
  assert.equal(isSupremeStageUnlocked(gemini, { highestRound: 200, supremeHighestRound: 57 }), false);
  assert.equal(isSupremeStageUnlocked(gemini, { highestRound: 58, supremeHighestRound: 58 }), true);
  assert.equal(isSupremeStageUnlocked(cassiopeia, { highestRound: 200, supremeHighestRound: 68 }), true);
  assert.equal(isSupremeStageUnlocked(aquila, { highestRound: 200, supremeHighestRound: 77 }), false);
  assert.equal(isRunProtocolUnlocked('supreme-aquila', { highestRound: 200, supremeHighestRound: 78 }), true);
  assert.equal(protocolStart('supreme-gemini', 200, 57).protocol, 'normal');
  assert.equal(protocolStart('supreme-gemini', 200, 58).startingRound, 55);
  assert.equal(cycleUnlockedProtocol('overdrive-pegasus', 53, 1, 0), 'supreme-leo');
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
  assert.equal(definitions.length, 10);
  assert.equal(new Set(definitions.map((definition) => definition.id)).size, 10);
  for (const definition of definitions) {
    assert.ok(definition.id.startsWith('supreme-'));
    assert.equal(definition.modifiers?.length, 3);
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

test('Supreme Mods use the existing inventory/loadout/runtime path with hard stability ceilings', () => {
  const mods = createDefaultModCollection();
  const carapace = addModDrop(mods, 'supreme-quantum-carapace');
  const mask = addModDrop(mods, 'gas-mask');
  assert.equal(carapace.ok, true);
  assert.equal(mask.ok, true);
  mods.cards.find((card) => card.modId === 'supreme-quantum-carapace').upgradeLevel = 3;
  mods.cards.find((card) => card.modId === 'gas-mask').upgradeLevel = 3;
  assert.equal(equipMod(mods, 'player', 'supreme-quantum-carapace').ok, true);
  assert.equal(equipMod(mods, 'wildcard', 'gas-mask').ok, true);
  const runtime = new ModRuntime(mods);
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
  delete old.progress.supremeHighestRound;
  delete old.progress.supremeOverdriveCompleted;
  const migrated = normalizeLocalSave(old);
  assert.equal(migrated.version, 14);
  assert.equal(migrated.wallet.credits, 76543);
  assert.equal(migrated.progress.highestRound, 63);
  assert.equal(migrated.progress.supremeHighestRound, 0);
  assert.equal(migrated.progress.supremeOverdriveCompleted, false);
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
