import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyCampaignProgress } from '../src/game/progression/CampaignLegacyMigration.ts';
import { getCampaignStartRounds, getPendingCampaignPackages, recordCampaignVictory } from '../src/game/progression/CampaignProgression.ts';

const legacy = (overrides = {}) => ({
  sourceSaveVersion: 18, highestRound: 0, normalHighestRound: 0, supremeHighestRound: 0,
  regularOverdriveCompleted: false, supremeOverdriveCompleted: false,
  preferredProtocol: 'normal', selectedNormalStartRound: 1,
  trainingRoundsCompleted: 0, completedTutorialSequences: [], ...overrides
});

test('legacy access remains separate from boss proof and completion packages', () => {
  const { progress } = migrateLegacyCampaignProgress(legacy({ highestRound: 23, normalHighestRound: 23 }));
  assert.equal(getCampaignStartRounds(progress, 'normal').at(-1), 20);
  assert.equal(getCampaignStartRounds(progress, 'overdrive').at(-1), 20);
  assert.deepEqual(getCampaignStartRounds(progress, 'supreme'), []);
  assert.equal(progress.modes.normal.completed, false);
  assert.equal(progress.modes.overdrive.highestBossDefeated, 0);
  assert.deepEqual(getPendingCampaignPackages(progress), []);
  recordCampaignVictory(progress, 'overdrive', 24, 'arena');
  assert.equal(getCampaignStartRounds(progress, 'overdrive').at(-1), 20);
  recordCampaignVictory(progress, 'overdrive', 25, 'boss');
  assert.equal(getCampaignStartRounds(progress, 'overdrive').at(-1), 25);
});

test('high Normal records retain their original values and do not imply an Overdrive clear', () => {
  const input = legacy({ highestRound: 170, normalHighestRound: 170, selectedNormalStartRound: 165 });
  const before = structuredClone(input);
  const migrated = migrateLegacyCampaignProgress(input);
  assert.deepEqual(input, before);
  assert.deepEqual(migrated.legacy, input);
  assert.notEqual(migrated.legacy, input);
  assert.equal(migrated.progress.modes.normal.completed, true);
  assert.equal(migrated.progress.modes.overdrive.completed, false);
  assert.equal(getCampaignStartRounds(migrated.progress, 'overdrive').at(-1), 30);
  assert.deepEqual(getCampaignStartRounds(migrated.progress, 'supreme'), []);
  assert.deepEqual(getPendingCampaignPackages(migrated.progress), ['normal']);
});

test('old Overdrive completion preserves Supreme entry and grants its new package eligibility once installed', () => {
  const { progress } = migrateLegacyCampaignProgress(legacy({ regularOverdriveCompleted: true }));
  assert.equal(progress.modes.overdrive.completed, true);
  assert.deepEqual(getCampaignStartRounds(progress, 'supreme'), [1]);
  assert.deepEqual(getPendingCampaignPackages(progress), ['overdrive']);
  progress.packages.overdrive.claimed = true;
  assert.deepEqual(getPendingCampaignPackages(JSON.parse(JSON.stringify(progress))), []);
  assert.throws(() => migrateLegacyCampaignProgress(legacy({ sourceSaveVersion: 19 })), /pre-campaign/);
});

test('each legacy Supreme unlock maps to the same named constellation in the compressed campaign', () => {
  for (const [oldRound, newStart] of [[51, 1], [58, 4], [68, 7], [78, 10], [88, 13], [98, 16],
    [108, 19], [118, 22], [128, 25], [138, 28], [148, 30]]) {
    const { progress, legacy: archive } = migrateLegacyCampaignProgress(legacy({
      highestRound: oldRound, supremeHighestRound: oldRound, regularOverdriveCompleted: true
    }));
    assert.equal(getCampaignStartRounds(progress, 'supreme').at(-1), newStart);
    assert.equal(progress.modes.supreme.highestBossDefeated, 0);
    assert.equal(archive.supremeHighestRound, oldRound);
    assert.equal(progress.modes.supreme.completed, false);
  }
});

test('old Centaurus completion survives even when its recorded round is 100 rather than unlock threshold 148', () => {
  const { progress } = migrateLegacyCampaignProgress(legacy({
    highestRound: 100, supremeHighestRound: 100, supremeOverdriveCompleted: true
  }));
  assert.equal(progress.modes.supreme.completed, true);
  assert.equal(getCampaignStartRounds(progress, 'supreme').at(-1), 30);
  assert.equal(progress.modes.overdrive.completed, true);
});

test('completed training qualifies retroactively; skipped or unfinished training does not', () => {
  for (const evidence of [{ trainingRoundsCompleted: 3 }, { completedTutorialSequences: ['onboarding.certification'] }]) {
    const { progress } = migrateLegacyCampaignProgress(legacy(evidence));
    assert.deepEqual(getPendingCampaignPackages(progress), ['training']);
    assert.equal(progress.packages.training.claimed, false);
  }
  assert.deepEqual(getPendingCampaignPackages(migrateLegacyCampaignProgress(legacy({ trainingRoundsCompleted: 2 })).progress), []);
});
