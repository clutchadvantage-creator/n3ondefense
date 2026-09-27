import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { getCampaignStartRounds, isCampaignModeUnlocked, recordCampaignVictory } from '../src/game/progression/CampaignProgression.ts';
import { prepareCampaignRewardPackages } from '../src/game/progression/CampaignRewardPackages.ts';
import { resolveOperationsConfiguration } from '../src/game/progression/OperationsConfiguration.ts';

const reload = (save) => normalizeLocalSave(JSON.parse(JSON.stringify(save)));
const legacy = () => {
  const save = createDefaultLocalSave('campaign-save', 'Campaign Save');
  save.version = 18;
  delete save.progress.campaign;
  return save;
};

test('new saves cannot unlock modes through old global high-water statistics', () => {
  const save = createDefaultLocalSave('new-campaign', 'New Campaign');
  save.progress.highestRound = 148;
  save.progress.normalHighestRound = 148;
  save.progress.regularOverdriveCompleted = true;
  const restored = reload(save);
  assert.equal(restored.version, 19);
  assert.equal(isCampaignModeUnlocked(restored.progress.campaign, 'overdrive'), false);
  assert.equal(isCampaignModeUnlocked(restored.progress.campaign, 'supreme'), false);
  assert.deepEqual(getCampaignStartRounds(restored.progress.campaign, 'normal'), [1]);
  delete save.progress.campaign;
  assert.equal(isCampaignModeUnlocked(reload(save).progress.campaign, 'supreme'), false);
});

test('legacy deep Supreme access and archive survive repeated normalization without inventing boss wins', () => {
  const save = legacy();
  save.progress.highestRound = 138;
  save.progress.normalHighestRound = 40;
  save.progress.supremeHighestRound = 138;
  save.progress.regularOverdriveCompleted = true;
  save.protocol.preferred = 'supreme-delphinus';
  const migrated = reload(save);
  assert.equal(migrated.legacyCampaign.sourceSaveVersion, 18);
  assert.equal(migrated.legacyCampaign.highestRound, 138);
  assert.equal(migrated.progress.campaign.modes.supreme.highestBossDefeated, 0);
  assert.equal(getCampaignStartRounds(migrated.progress.campaign, 'supreme').at(-1), 28);
  assert.deepEqual(resolveOperationsConfiguration(migrated.protocol, migrated.progress), {
    mode: 'supreme', protocol: 'supreme-delphinus', startingRound: 28
  });
  assert.deepEqual(reload(migrated), migrated);
});

test('migrated packages persist exact cards and claims together without changing wallets or regranting', () => {
  const save = legacy();
  save.progress.normalHighestRound = 30;
  save.progress.regularOverdriveCompleted = true;
  save.tutorials.trainingRoundsCompleted = 3;
  save.wallet = { credits: 12345, coreTokens: 56, fluxCores: 78 };
  const migrated = reload(save);
  const prepared = prepareCampaignRewardPackages(migrated.progress.campaign, migrated.mods, 1234, '2026-09-27T12:00:00.000Z');
  assert.equal(prepared.grants.length, 3);
  migrated.progress.campaign = prepared.progress;
  migrated.mods = prepared.mods;
  const restored = reload(migrated);
  assert.deepEqual(restored.mods.cards, prepared.mods.cards);
  assert.deepEqual(restored.progress.campaign.packages, prepared.progress.packages);
  assert.deepEqual(restored.wallet, save.wallet);
  assert.deepEqual(prepareCampaignRewardPackages(restored.progress.campaign, restored.mods, 999, '2026-09-28T12:00:00.000Z').grants, []);
  assert.deepEqual(restored.legacyCampaign, migrated.legacyCampaign);
});

test('profile copying and reload preserve independently selected arbitrary per-mode starts', () => {
  const save = createDefaultLocalSave('selection-source', 'Selection Source');
  recordCampaignVictory(save.progress.campaign, 'normal', 30, 'boss');
  recordCampaignVictory(save.progress.campaign, 'overdrive', 30, 'boss');
  recordCampaignVictory(save.progress.campaign, 'supreme', 20, 'boss');
  save.protocol = { preferred: 'supreme-taurus', selectedNormalStartRound: 7,
    selectedStartingRounds: { normal: 7, overdrive: 19, supreme: 17 } };
  const copied = createDefaultLocalSave('selection-copy', 'Selection Copy', save);
  assert.deepEqual(copied.protocol.selectedStartingRounds, save.protocol.selectedStartingRounds);
  assert.deepEqual(reload(copied).protocol, copied.protocol);
  assert.equal(resolveOperationsConfiguration(copied.protocol, copied.progress).startingRound, 17);
});

test('terminal Supreme boss alone does not turn into campaign completion on reload', () => {
  const save = createDefaultLocalSave('finale-save', 'Finale Save');
  for (const mode of ['normal', 'overdrive', 'supreme']) recordCampaignVictory(save.progress.campaign, mode, 30, 'boss');
  const beforeTrinity = reload(save);
  assert.equal(beforeTrinity.progress.campaign.modes.supreme.completed, false);
  assert.equal(getCampaignStartRounds(beforeTrinity.progress.campaign, 'supreme').length, 30);
  recordCampaignVictory(beforeTrinity.progress.campaign, 'supreme', 30, 'trinity');
  assert.equal(reload(beforeTrinity).progress.campaign.modes.supreme.completed, true);
});
