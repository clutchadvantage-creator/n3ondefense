import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COSMETICS } from '../src/data/cosmetics.ts';
import {
  GARAGE_MOD_SLOTS,
  createDefaultGarageState,
  getGarageDockModels,
  getGarageWallet,
  getModLibraryEntries,
  getModLibraryProgress,
  getOwnedGarageCosmetics,
  loadGaragePreset,
  normalizeGarageState,
  saveCurrentGaragePreset
} from '../src/game/garage/GarageState.ts';
import { calculateGarageLayout } from '../src/game/garage/garageLayout.ts';
import { calculateGearLockerLayout } from '../src/game/garage/gearLockerLayout.ts';
import { MOD_BY_ID, MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { addModDrop, deleteModCard, equipMod, unequipMod } from '../src/game/mods/ModInventoryService.ts';
import { ModRuntime } from '../src/game/mods/ModRuntime.ts';
import { RUN_PROTOCOLS } from '../src/game/mods/modBalance.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const categorySlots = {
  weapon: 'weapon',
  player: 'player',
  defense: 'defense',
  bombSite: 'bombSite',
  utility: 'wildcard'
};

const addCategoryLoadout = (save) => {
  const cards = {};
  for (const [category, slot] of Object.entries(categorySlots)) {
    const definition = MOD_DEFINITIONS.find((entry) => entry.category === category && entry.rarity !== 'legendary');
    assert.ok(definition, `missing ${category} fixture Mod`);
    assert.equal(addModDrop(save.mods, definition.id).ok, true);
    const card = save.mods.cards.findLast((entry) => entry.modId === definition.id);
    assert.ok(card);
    assert.equal(equipMod(save.mods, slot, definition.id, card.instanceId).ok, true);
    cards[slot] = card;
  }
  return cards;
};

test('Garage defaults provide five attractive empty category docks', () => {
  const save = createDefaultLocalSave('garage-empty', 'Garage Empty');
  const docks = getGarageDockModels(save.mods);
  assert.deepEqual(docks.map((dock) => dock.slot), GARAGE_MOD_SLOTS);
  assert.equal(docks.length, 5);
  assert.ok(docks.every((dock) => dock.empty && dock.card === null));
  assert.match(docks[4].label, /UTILITY \/ WILDCARD/);
});

test('Garage dock models preserve the exact equipped card, rank, and infusion', () => {
  const save = createDefaultLocalSave('garage-equipped', 'Garage Equipped');
  const cards = addCategoryLoadout(save);
  cards.weapon.upgradeLevel = 2;
  cards.weapon.infusionId = 'arcade-pop';
  const docks = getGarageDockModels(save.mods);
  assert.ok(docks.every((dock) => !dock.empty));
  assert.equal(docks.find((dock) => dock.slot === 'weapon').card, cards.weapon);
  assert.equal(docks.find((dock) => dock.slot === 'weapon').card.upgradeLevel, 2);
  assert.equal(docks.find((dock) => dock.slot === 'weapon').card.infusionId, 'arcade-pop');
});

test('Garage uses existing Mod category validation instead of inventing equip rules', () => {
  const save = createDefaultLocalSave('garage-category', 'Garage Category');
  const definition = MOD_DEFINITIONS.find((entry) => entry.category === 'weapon' && entry.rarity !== 'legendary');
  addModDrop(save.mods, definition.id);
  const card = save.mods.cards[0];
  assert.equal(equipMod(save.mods, 'player', definition.id, card.instanceId).ok, false);
  assert.equal(equipMod(save.mods, 'weapon', definition.id, card.instanceId).ok, true);
});

test('Garage presets restore at most two universal Supreme Mods only with a Supreme protocol', () => {
  const save = createDefaultLocalSave('garage-supreme', 'Garage Supreme');
  save.progress.highestRound = 53;
  save.protocol.preferred = 'supreme-leo';
  const supremeIds = MOD_DEFINITIONS.filter((entry) => entry.rarity === 'supreme').slice(0, 3).map((entry) => entry.id);
  for (const id of supremeIds) assert.equal(addModDrop(save.mods, id).ok, true);
  assert.equal(equipMod(save.mods, 'weapon', supremeIds[0], undefined, 'supreme-leo').ok, true);
  assert.equal(equipMod(save.mods, 'bombSite', supremeIds[1], undefined, 'supreme-leo').ok, true);
  assert.equal(saveCurrentGaragePreset(save, 'config-a').ok, true);

  unequipMod(save.mods, 'weapon');
  unequipMod(save.mods, 'bombSite');
  assert.equal(loadGaragePreset(save, 'config-a').ok, true);
  assert.equal(new ModRuntime(save.mods, undefined, 'supreme-leo').snapshot().filter((entry) => entry.id.startsWith('supreme-')).length, 2);

  const invalid = save.garage.presets.find((entry) => entry.id === 'config-b');
  invalid.saved = true;
  invalid.protocol = 'normal';
  invalid.cardSlots = { ...save.garage.presets.find((entry) => entry.id === 'config-a').cardSlots };
  const rejected = loadGaragePreset(save, 'config-b');
  assert.equal(rejected.ok, true);
  assert.equal(rejected.missingCards, 2);
  assert.equal(new ModRuntime(save.mods, undefined, 'normal').snapshot().some((entry) => entry.id.startsWith('supreme-')), false);
});

test('Garage Browse opens the Collection on the matching slot category', () => {
  const source = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  assert.match(source, /dock\.slot === 'wildcard' \? 'all' : dock\.slot/);
  assert.match(source, /definition\?\.category \?\? 'all'/);
  assert.match(source, /this\.scene\.start\(SceneKeys\.Mods, \{ returnScene: SceneKeys\.Garage, selectedCardId, initialCategory, targetSlot \}\)/);
});

test('Overdrive progression terminal keeps full constellation protocol names in the shared cyber-console treatment', () => {
  const source = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  const terminalStart = source.indexOf("private showOverdrive(requestedFamily?: 'overdrive' | 'supreme'): void");
  const terminalEnd = source.indexOf('private showPresets(): void', terminalStart);
  assert.ok(terminalStart >= 0 && terminalEnd > terminalStart);

  const terminalSource = source.slice(terminalStart, terminalEnd);
  assert.match(terminalSource, /PROTOCOL LADDER \/\/ CONSTELLATION CLEARANCE MATRIX/);
  assert.match(terminalSource, /createModCollectionFrame\(this/);
  assert.match(terminalSource, /createConsoleChamferPoints/);
  assert.match(terminalSource, /definition\.label/);
  assert.doesNotMatch(terminalSource, /definition\.label\.replace/);
});

test('Garage presets save and immediately restore five Mod and deployment references', () => {
  const save = createDefaultLocalSave('garage-preset', 'Garage Preset');
  const cards = addCategoryLoadout(save);
  save.progress.highestRound = 60;
  save.protocol.preferred = 'overdrive-draco';
  save.garage.nextRun = { contract: 'elite-hunt', modFocus: 'defense' };
  assert.equal(saveCurrentGaragePreset(save, 'config-a', '2026-08-10T00:00:00.000Z').ok, true);

  for (const slot of GARAGE_MOD_SLOTS) unequipMod(save.mods, slot);
  save.protocol.preferred = 'normal';
  save.garage.nextRun = { contract: null, modFocus: null };
  const result = loadGaragePreset(save, 'config-a');
  assert.equal(result.ok, true);
  assert.equal(result.missingCards, 0);
  assert.equal(result.ignoredProtocol, false);
  assert.equal(save.protocol.preferred, 'overdrive-draco');
  assert.deepEqual(save.garage.nextRun, { contract: 'elite-hunt', modFocus: 'defense' });
  const loadout = save.mods.loadouts[0];
  for (const slot of GARAGE_MOD_SLOTS) assert.equal(loadout.cardSlots[slot], cards[slot].instanceId);
});

test('a preset safely skips a missing card reference', () => {
  const save = createDefaultLocalSave('garage-missing', 'Garage Missing');
  const cards = addCategoryLoadout(save);
  saveCurrentGaragePreset(save, 'config-a');
  save.garage.presets[0].cardSlots.weapon = 'missing-card-instance';
  const result = loadGaragePreset(save, 'config-a');
  assert.equal(result.ok, true);
  assert.equal(result.missingCards, 1);
  assert.equal(save.mods.loadouts[0].cardSlots.weapon, null);
  assert.equal(save.mods.loadouts[0].cardSlots.player, cards.player.instanceId);
});

test('a recycled or deleted preset card becomes an empty slot without crashing', () => {
  const save = createDefaultLocalSave('garage-deleted', 'Garage Deleted');
  const cards = addCategoryLoadout(save);
  saveCurrentGaragePreset(save, 'config-b');
  assert.equal(deleteModCard(save.mods, cards.defense.instanceId).ok, true);
  const result = loadGaragePreset(save, 'config-b');
  assert.equal(result.ok, true);
  assert.equal(result.missingCards, 1);
  assert.equal(save.mods.loadouts[0].cardSlots.defense, null);
});

test('invalid Contract and Signal references are ignored when a preset loads', () => {
  const save = createDefaultLocalSave('garage-invalid-setup', 'Garage Invalid Setup');
  save.garage.presets[0] = {
    ...save.garage.presets[0], saved: true, contract: 'removed-contract', modFocus: 'removed-signal'
  };
  const result = loadGaragePreset(save, 'config-a');
  assert.equal(result.ok, true);
  assert.deepEqual(save.garage.nextRun, { contract: null, modFocus: null });
  assert.deepEqual(normalizeGarageState({ nextRun: { contract: 'bad', modFocus: 'bad' } }).nextRun, { contract: null, modFocus: null });
});

test('a preset never restores a locked Overdrive protocol', () => {
  const save = createDefaultLocalSave('garage-locked', 'Garage Locked');
  save.garage.presets[0] = { ...save.garage.presets[0], saved: true, protocol: 'overdrive-draco' };
  assert.ok(save.progress.highestRound < RUN_PROTOCOLS['overdrive-draco'].unlockHighestRound);
  const result = loadGaragePreset(save, 'config-a');
  assert.equal(result.ok, true);
  assert.equal(result.ignoredProtocol, true);
  assert.equal(save.protocol.preferred, 'normal');
});

test('version-seven profiles migrate to empty Garage presets without losing data', () => {
  const existing = createDefaultLocalSave('garage-migrate', 'Garage Migrate');
  existing.wallet.credits = 4567;
  existing.mods.plasmaChips = 33;
  const legacy = { ...existing, version: 7 };
  delete legacy.garage;
  const migrated = normalizeLocalSave(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 16);
  assert.equal(migrated.wallet.credits, 4567);
  assert.equal(migrated.mods.plasmaChips, 33);
  assert.deepEqual(migrated.garage, createDefaultGarageState());
});

test('Mod Library count and owned/unowned state come directly from the definition registry', () => {
  const save = createDefaultLocalSave('garage-library', 'Garage Library');
  const ownedDefinition = MOD_DEFINITIONS[7];
  addModDrop(save.mods, ownedDefinition.id);
  const entries = getModLibraryEntries(save.mods);
  const progress = getModLibraryProgress(save.mods);
  assert.equal(entries.length, MOD_DEFINITIONS.length);
  assert.equal(progress.total, MOD_DEFINITIONS.length);
  assert.equal(progress.discovered, 1);
  assert.equal(entries.find((entry) => entry.definition.id === ownedDefinition.id).owned, true);
  assert.equal(entries.find((entry) => entry.definition.id !== ownedDefinition.id).owned, false);
  assert.equal(MOD_BY_ID.size, progress.total);
});

test('owned cosmetics, equipped cosmetics, and wallet values remain profile-owned state', () => {
  const save = createDefaultLocalSave('garage-owned', 'Garage Owned');
  const cosmetic = COSMETICS.find((entry) => entry.id === 'player-clover');
  save.cosmetics.owned.push(cosmetic.id);
  save.cosmetics.equipped.playerShape = cosmetic.id;
  save.wallet.credits = 12_345;
  save.wallet.coreTokens = 678;
  save.wallet.fluxCores = 12;
  save.mods.plasmaChips = 90;
  const normalized = normalizeLocalSave(save);
  assert.equal(getOwnedGarageCosmetics(normalized).some((entry) => entry.id === cosmetic.id), true);
  assert.equal(normalized.cosmetics.equipped.playerShape, cosmetic.id);
  assert.deepEqual(getGarageWallet(normalized), { credits: 12_345, coreTokens: 678, plasmaChips: 90, fluxCores: 12 });
});

test('Garage responsive layout keeps critical docks, terminals, and stations on screen', () => {
  for (const [width, height] of [[640, 480], [1024, 640], [1366, 768], [1920, 1080], [2560, 1440], [720, 900]]) {
    const layout = calculateGarageLayout(width, height);
    assert.equal(layout.dockCenters.length, 5);
    assert.equal(layout.stationCenters.length, 5);
    assert.ok(layout.cardWidth >= 84);
    for (const point of layout.dockCenters) {
      assert.ok(point.x - layout.cardWidth / 2 >= layout.safe - 1);
      assert.ok(point.x + layout.cardWidth / 2 <= width - layout.safe + 1);
      assert.ok(point.y - layout.cardHeight / 2 > 65);
      assert.ok(point.y + layout.cardHeight / 2 < height - 45);
    }
    const dockActionBottom = layout.dockCenters[0].y + layout.cardHeight / 2 + layout.dockActionGap + layout.dockActionHeight;
    const stationHousingTop = layout.stationCenters[0].y - (layout.stationHeight + 14) / 2;
    assert.ok(dockActionBottom <= stationHousingTop, 'dock actions must not overlap station consoles');
    const slotLabelOffset = layout.compact ? 14 : Math.max(17, Math.min(25, layout.cardWidth * 0.115));
    const dockLabelTop = layout.dockCenters[0].y - layout.cardHeight / 2 - slotLabelOffset;
    assert.ok(dockLabelTop > layout.configTerminal.y + layout.configTerminal.height);
    const workbenchTop = layout.dockCenters[0].y - layout.cardHeight / 2 - layout.workbenchTopPadding;
    assert.ok(workbenchTop >= layout.configTerminal.y + layout.configTerminal.height + 8, 'workbench must clear terminal mount casing');
    for (const rect of [layout.configTerminal, layout.walletTerminal, layout.operatorPreview]) {
      assert.ok(rect.x >= 0 && rect.y >= 0);
      assert.ok(rect.x + rect.width <= width);
      assert.ok(rect.y + rect.height <= height);
    }
    assert.ok(layout.stationCenters.every((point) => point.x > 0 && point.x < width && point.y < height));
  }
});

test('desktop Garage gives the deployment, wallet, and operative displays readable space', () => {
  const layout = calculateGarageLayout(1920, 1080);
  assert.ok(layout.cardWidth >= 195);
  assert.ok(layout.cardHeight >= 270);
  assert.ok(layout.configTerminal.width >= 500);
  assert.ok(layout.configTerminal.height >= 290);
  assert.equal(layout.walletTerminal.width, layout.configTerminal.width);
  assert.equal(layout.walletTerminal.height, layout.configTerminal.height);
  assert.ok(layout.configTerminal.x > layout.safe + 30);
  assert.equal(1920 - layout.walletTerminal.x - layout.walletTerminal.width, layout.configTerminal.x);
  assert.ok(layout.configTerminal.y >= 106);
  assert.ok(layout.operatorPreview.width >= 490);
  assert.ok(layout.operatorPreview.height >= 270);
  assert.ok(layout.operatorPreview.y >= 88);
  assert.ok(layout.stationWidth >= 240);
  assert.ok(layout.stationHeight >= 52);
  assert.ok(layout.dockActionHeight >= 46);
});

test('large desktop Garage scaling grows usefully but remains clamped', () => {
  const standard = calculateGarageLayout(1920, 1080);
  const large = calculateGarageLayout(2560, 1440);
  assert.ok(large.cardWidth > standard.cardWidth);
  assert.ok(large.stationWidth > standard.stationWidth);
  assert.ok(large.stationHeight > standard.stationHeight);
  assert.ok(large.cardWidth <= 240);
  assert.ok(large.configTerminal.width <= 550);
  assert.ok(large.operatorPreview.width <= 510);
});

test('equipping an operative frame or color refreshes the Garage showcase', () => {
  const source = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  assert.match(source, /item\.category === 'playerShape' \|\| item\.category === 'playerColor'/);
  assert.match(source, /this\.refreshOperatorPreview\(\)/);
  assert.match(source, /getEquippedCosmeticId\('playerShape'\)/);
  assert.match(source, /getOperativeFrameAppearance\(this\.time\.now\)/);
});

test('Gear Locker uses category-aware cosmetic previews instead of generic color balls', () => {
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../src/game/cosmetics/CosmeticPreview.ts', import.meta.url), 'utf8');
  assert.match(garage, /createCosmeticPreview\(this, item/);
  for (const category of ['playerShape', 'playerColor', 'projectileShape', 'projectileColor', 'trailColor', 'dashTrail', 'bombColor', 'turretSkin', 'fenceStyle']) {
    assert.match(preview, new RegExp(`case '${category}'`));
  }
});

test('Gear Locker uses the cyber terminal category strip, tall owned cards, and equipped hologram chamber', () => {
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  const presentation = readFileSync(new URL('../src/game/garage/GearLockerUi.ts', import.meta.url), 'utf8');
  assert.match(garage, /createCosmeticCategoryNavigation/);
  assert.match(garage, /GEAR_LOCKER_CATEGORY_LABELS\[category\]/);
  assert.match(garage, /createCosmeticLockerCard/);
  assert.match(garage, /\/\/ CURRENTLY EQUIPPED/);
  assert.match(garage, /DYNAMIC.*COLOR CODE|COLOR CODE.*DYNAMIC/s);
  assert.match(garage, /SaveSystem\.equipCosmetic\(item\.category, item\.id\)/);
  assert.match(presentation, /createGearLockerCategoryIcon/);
  assert.doesNotMatch(garage, /LOCKER: \$\{COSMETIC_CATEGORY_LABELS/);
});

test('Gear Locker responsive layout keeps inventory and preview separate at supported desktop sizes', () => {
  for (const [width, height] of [[2560, 1440], [1920, 1080], [1600, 900], [1366, 768]]) {
    const layout = calculateGearLockerLayout(width, height, 9);
    assert.ok(layout.inventory.width >= 650, `${width} inventory width`);
    assert.ok(layout.preview.width >= 270, `${width} preview width`);
    assert.ok(layout.inventory.x + layout.inventory.width < layout.preview.x, `${width} module gap`);
    assert.ok(layout.preview.x + layout.preview.width <= width - layout.safe, `${width} preview safe edge`);
    assert.ok(layout.inventory.y + layout.inventory.height < layout.footerY - layout.footerHeight / 2, `${width} footer clearance`);
    assert.ok(layout.visibleCategoryCount >= 3 && layout.visibleCategoryCount <= 9, `${width} tab count`);
  }
});

test('Garage navigation is registered and Mod Collection preserves its return route', () => {
  const sceneKeys = readFileSync(new URL('../src/game/flow/SceneKeys.ts', import.meta.url), 'utf8');
  const boot = readFileSync(new URL('../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');
  const collection = readFileSync(new URL('../src/game/scenes/ModCollectionScene.ts', import.meta.url), 'utf8');
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  assert.match(sceneKeys, /Garage: 'garage'/);
  assert.match(boot, /OperatorGarageScene/);
  assert.match(menu, /Operator Garage/);
  assert.match(collection, /Back To Garage/);
  assert.match(garage, /createModCardView/);
  assert.match(garage, /returnScene: SceneKeys\.Garage/);
});

test('loading a Garage preset cannot mutate an already-created encounter Mod snapshot', () => {
  const save = createDefaultLocalSave('garage-snapshot', 'Garage Snapshot');
  addCategoryLoadout(save);
  const encounterSnapshot = new ModRuntime(save.mods).snapshot();
  const frozenCopy = structuredClone(encounterSnapshot);
  saveCurrentGaragePreset(save, 'config-c');
  for (const slot of GARAGE_MOD_SLOTS) unequipMod(save.mods, slot);
  loadGaragePreset(save, 'config-c');
  assert.deepEqual(encounterSnapshot, frozenCopy);
});
