import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETICS } from '../src/data/cosmetics.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { addModDrop, equipMod } from '../src/game/mods/ModInventoryService.ts';
import { recordCampaignVictory } from '../src/game/progression/CampaignProgression.ts';
import { GARAGE_MOD_SLOTS, getGaragePresetStatus, loadGaragePreset, renameGaragePreset, saveCurrentGaragePreset } from '../src/game/garage/GarageState.ts';

const fixture = () => {
  const save = createDefaultLocalSave('complete-config', 'Configuration Test');
  for (const slot of GARAGE_MOD_SLOTS) {
    const definition = MOD_DEFINITIONS.find(mod => mod.category === (slot === 'wildcard' ? 'utility' : slot) && mod.rarity !== 'legendary' && mod.rarity !== 'supreme');
    addModDrop(save.mods, definition.id);
    equipMod(save.mods, slot, definition.id, save.mods.cards.at(-1).instanceId);
  }
  save.mods.cards[0].infusionId = 'arcade-pop';
  recordCampaignVictory(save.progress.campaign, 'normal', 30, 'boss');
  recordCampaignVictory(save.progress.campaign, 'overdrive', 30, 'boss');
  recordCampaignVictory(save.progress.campaign, 'supreme', 30, 'boss');
  save.protocol.preferred = 'supreme-leo';
  save.protocol.selectedStartingRounds = { normal: 1, overdrive: 1, supreme: 17 };
  save.garage.nextRun = { contract: 'elite-hunt', modFocus: 'defense' };
  save.garage.savedDeploymentEnabled = true;
  for (const category of new Set(COSMETICS.map(item => item.category))) {
    const item = COSMETICS.find(item => item.category === category && item.cost > 0) ?? COSMETICS.find(item => item.category === category);
    if (!save.cosmetics.owned.includes(item.id)) save.cosmetics.owned.push(item.id);
    save.cosmetics.equipped[category] = item.id;
  }
  assert.equal(saveCurrentGaragePreset(save, 'config-a', '2026-10-08T12:00:00Z', { name: 'TURRET KING' }).ok, true);
  return save;
};

test('complete preset round trip keeps all owned identities, cosmetics, infusions and deployment selections', () => {
  const save = fixture();
  const original = structuredClone(save);
  const preset = save.garage.presets[0];
  assert.equal(Object.values(preset.cardSlots).filter(Boolean).length, 5);
  assert.equal(Object.keys(preset.cosmetics).length, 10);
  assert.equal(preset.infusionIds.weapon, 'arcade-pop');
  save.mods.loadouts[0].cardSlots = Object.fromEntries(GARAGE_MOD_SLOTS.map(slot => [slot, null]));
  save.mods.loadouts[0].slots = { ...save.mods.loadouts[0].cardSlots };
  save.cosmetics.equipped = {};
  save.protocol.preferred = 'normal';
  save.garage.nextRun = { contract: null, modFocus: null };
  save.garage.savedDeploymentEnabled = false;
  assert.equal(loadGaragePreset(save, 'config-a').ok, true);
  assert.deepEqual(save.mods.loadouts, original.mods.loadouts);
  assert.deepEqual(save.mods.cards, original.mods.cards);
  assert.deepEqual(save.cosmetics, original.cosmetics);
  assert.deepEqual(save.wallet, original.wallet);
  assert.deepEqual(save.garage.nextRun, original.garage.nextRun);
  assert.equal(save.protocol.selectedStartingRounds.supreme, 17);
  assert.equal(save.garage.savedDeploymentEnabled, true);
  assert.equal(getGaragePresetStatus(save, preset), 'active');
});

test('names persist through normalization, remain isolated and strip markup/control characters', () => {
  let save = fixture();
  saveCurrentGaragePreset(save, 'config-b', undefined, { name: 'FLUX FARMER' });
  renameGaragePreset(save, 'config-a', '<BOSS>\u0000 KILLER');
  save = normalizeLocalSave(JSON.parse(JSON.stringify(save)));
  assert.equal(save.garage.presets[0].name, 'BOSS KILLER');
  assert.equal(save.garage.presets[1].name, 'FLUX FARMER');
  renameGaragePreset(save, 'config-a', 'x'.repeat(100));
  assert.equal(save.garage.presets[0].name.length, 24);
  renameGaragePreset(save, 'config-a', '');
  assert.equal(save.garage.presets[0].name.length, 24);
});

test('overwrite requires explicit confirmation and saving never equips or charges', () => {
  const save = fixture();
  const original = structuredClone(save);
  assert.equal(saveCurrentGaragePreset(save, 'config-a', undefined, { name: 'UNCONFIRMED' }).ok, false);
  assert.deepEqual(save, original);
  assert.equal(saveCurrentGaragePreset(save, 'config-a', undefined, { name: 'CONFIRMED', overwriteConfirmed: true }).ok, true);
  assert.equal(save.garage.presets[0].name, 'CONFIRMED');
  assert.deepEqual(save.mods, original.mods);
  assert.deepEqual(save.cosmetics, original.cosmetics);
  assert.deepEqual(save.wallet, original.wallet);
  assert.deepEqual(save.protocol, original.protocol);
});

test('a later card upgrade remains on the same instance after loading', () => {
  const save = fixture();
  save.mods.cards[0].upgradeLevel = 3;
  assert.equal(loadGaragePreset(save, 'config-a').ok, true);
  assert.equal(save.mods.cards[0].upgradeLevel, 3);
  assert.equal(save.mods.cards[0].infusionId, 'arcade-pop');
});

for (const [label, corrupt, expected] of [
  ['missing Mod', save => { save.mods.cards.shift(); }, /missing Mod/],
  ['missing cosmetic', save => { save.cosmetics.owned = []; }, /missing cosmetic/],
  ['wrong cosmetic category', save => { save.garage.presets[0].cosmetics.playerColor = 'player-circle'; }, /missing cosmetic/],
  ['duplicate Mod', save => { save.garage.presets[0].cardSlots.wildcard = save.garage.presets[0].cardSlots.weapon; }, /twice/],
  ['changed Infusion', save => { delete save.mods.cards[0].infusionId; }, /Infusion linkage changed/],
  ['locked mode', save => { save.progress.campaign = createDefaultLocalSave('locked', 'Locked').progress.campaign; }, /UNLOCKED/],
  ['invalid checkpoint', save => { save.garage.presets[0].campaignStartRound = 31; }, /UNLOCKED/],
  ['invalid Contract', save => { save.garage.presets[0].contract = 'no-such-contract'; }, /Contract/],
  ['invalid Signal', save => { save.garage.presets[0].modFocus = 'no-such-signal'; }, /Signal/],
  ['future format', save => { save.garage.presets[0].version = 999; }, /newer format/]
]) test(`${label} rejects the whole preset and preserves both current setup and saved preset`, () => {
  const save = fixture(); corrupt(save);
  const before = structuredClone(save);
  const result = loadGaragePreset(save, 'config-a');
  assert.equal(result.ok, false);
  assert.match(result.message, expected);
  assert.deepEqual(save, before);
});

test('normalization retains invalid references as validation issues instead of accepting substitutes', () => {
  const save = fixture();
  save.garage.presets[0].contract = 'retired-contract';
  save.garage.presets[0].campaignStartRound = -9;
  const restored = normalizeLocalSave(JSON.parse(JSON.stringify(save)));
  const before = structuredClone(restored);
  assert.equal(loadGaragePreset(restored, 'config-a').ok, false);
  assert.deepEqual(restored, before);
});

for (const [label, corrupt] of [
  ['malformed version', preset => { preset.version = 'two'; }],
  ['malformed Normal checkpoint', preset => { preset.normalStartRound = -1; }],
  ['missing deployment', preset => { delete preset.protocol; }],
  ['missing cosmetic capture', preset => { delete preset.cosmetics; }],
  ['missing Mod slot', preset => { delete preset.cardSlots.weapon; }],
  ['missing Infusion slot', preset => { delete preset.infusionIds.weapon; }]
]) test(`normalization rejects ${label} without erasing the saved configuration`, () => {
  const save = fixture(); corrupt(save.garage.presets[0]);
  const restored = normalizeLocalSave(JSON.parse(JSON.stringify(save)));
  const before = structuredClone(restored);
  assert.equal(loadGaragePreset(restored, 'config-a').ok, false);
  assert.deepEqual(restored, before);
  assert.equal(restored.garage.presets[0].name, 'TURRET KING');
});

test('legacy presets retain cards and names while leaving previously uncaptured cosmetics/toggle unchanged', () => {
  const save = fixture();
  const preset = save.garage.presets[0];
  delete preset.version; delete preset.name; delete preset.cosmetics;
  delete preset.infusionIds; delete preset.savedDeploymentEnabled;
  const restored = normalizeLocalSave(JSON.parse(JSON.stringify(save)));
  assert.equal(restored.garage.presets[0].name, 'CONFIG A');
  assert.deepEqual(restored.garage.presets[0].cardSlots, preset.cardSlots);
  const cosmetics = structuredClone(restored.cosmetics);
  assert.equal(loadGaragePreset(restored, 'config-a').ok, true);
  assert.deepEqual(restored.cosmetics, cosmetics);
  assert.equal(restored.garage.savedDeploymentEnabled, true);
});

for (const [label, change] of [
  ['Mod slot', save => { save.mods.loadouts[0].cardSlots.weapon = null; }],
  ['cosmetic', save => { save.cosmetics.equipped.playerShape = 'player-circle'; }],
  ['checkpoint', save => { save.protocol.selectedStartingRounds.supreme = 1; }],
  ['mode', save => { save.protocol.preferred = 'normal'; }],
  ['Contract', save => { save.garage.nextRun.contract = null; }],
  ['Signal', save => { save.garage.nextRun.modFocus = null; }],
  ['retain toggle', save => { save.garage.savedDeploymentEnabled = false; }],
  ['Infusion', save => { delete save.mods.cards[0].infusionId; }]
]) test(`active preset is marked modified after changing ${label}`, () => {
  const save = fixture(); loadGaragePreset(save, 'config-a');
  change(save);
  assert.equal(getGaragePresetStatus(save, save.garage.presets[0]), 'modified');
  assert.equal(getGaragePresetStatus(save, save.garage.presets[1]), 'saved');
});
