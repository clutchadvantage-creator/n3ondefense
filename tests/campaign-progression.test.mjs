import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCampaignProgress, getCampaignEncounterKind, getCampaignProtocol, getCampaignRewardPosition,
  getCampaignStartRounds, getCampaignVictoryDestination, getPendingCampaignPackages,
  isCampaignBossRound, isCampaignModeUnlocked, isCampaignStartUnlocked,
  recordCampaignTrainingCompletion, recordCampaignVictory
} from '../src/game/progression/CampaignProgression.ts';

test('approved reward positions remain contiguous across modes and end at 90', () => {
  const positions = ['normal', 'overdrive', 'supreme'].flatMap((mode) =>
    Array.from({ length: 30 }, (_, index) => getCampaignRewardPosition(mode, index + 1)));
  assert.deepEqual(positions, Array.from({ length: 90 }, (_, index) => index + 1));
  assert.throws(() => getCampaignRewardPosition('supreme', 31), RangeError);
});

test('fresh campaigns expose only Normal 1; malformed and out-of-campaign starts are rejected', () => {
  const progress = createCampaignProgress();
  assert.deepEqual(getCampaignStartRounds(progress, 'normal'), [1]);
  for (const mode of ['overdrive', 'supreme']) {
    assert.deepEqual(getCampaignStartRounds(progress, mode), []);
    assert.throws(() => recordCampaignVictory(progress, mode, 1, 'arena'), /locked/);
  }
  for (const round of [0, -1, 1.5, 31, 100, NaN, Infinity]) {
    assert.equal(isCampaignStartUnlocked(progress, 'normal', round), false);
    assert.equal(isCampaignBossRound(round), false);
    assert.throws(() => getCampaignEncounterKind(round), RangeError);
  }
});

test('all three modes have 24 ordinary rounds and six boss rounds, with no ordinary fifth round', () => {
  for (const mode of ['normal', 'overdrive', 'supreme']) {
    const progress = createCampaignProgress();
    progress.legacyModeAccess = { overdrive: true, supreme: true };
    let bosses = 0;
    for (let round = 1; round <= 30; round++) {
      const kind = getCampaignEncounterKind(round);
      if (kind === 'boss') bosses++;
      const before = structuredClone(progress);
      assert.throws(() => recordCampaignVictory(progress, mode, round, kind === 'boss' ? 'arena' : 'boss'));
      assert.deepEqual(progress, before, 'invalid completion must not mutate progress');
      recordCampaignVictory(progress, mode, round, kind);
    }
    assert.equal(bosses, 6);
  }
});

test('reaching Boss 5 or 10 without victory grants no new checkpoint; victories unlock every earned round', () => {
  const progress = createCampaignProgress();
  for (let round = 1; round <= 4; round++) recordCampaignVictory(progress, 'normal', round, 'arena');
  assert.deepEqual(getCampaignStartRounds(progress, 'normal'), [1]);
  recordCampaignVictory(progress, 'normal', 5, 'boss');
  assert.deepEqual(getCampaignStartRounds(progress, 'normal'), [1, 2, 3, 4, 5]);
  for (let round = 6; round <= 9; round++) recordCampaignVictory(progress, 'normal', round, 'arena');
  assert.equal(isCampaignStartUnlocked(progress, 'normal', 10), false);
  recordCampaignVictory(progress, 'normal', 10, 'boss');
  assert.equal(isCampaignStartUnlocked(progress, 'normal', 7), true);
  assert.equal(isCampaignStartUnlocked(progress, 'normal', 10), true);
  assert.equal(isCampaignStartUnlocked(progress, 'normal', 11), false);
});

test('mode victories unlock the next mode without automatically deploying it', () => {
  const progress = createCampaignProgress();
  assert.deepEqual(recordCampaignVictory(progress, 'normal', 30, 'boss'), { kind: 'mode-complete' });
  assert.equal(isCampaignModeUnlocked(progress, 'overdrive'), true);
  assert.deepEqual(getCampaignStartRounds(progress, 'overdrive'), [1]);
  assert.equal(isCampaignModeUnlocked(progress, 'supreme'), false);
  assert.deepEqual(recordCampaignVictory(progress, 'overdrive', 30, 'boss'), { kind: 'mode-complete' });
  assert.equal(isCampaignModeUnlocked(progress, 'supreme'), true);
  assert.deepEqual(getCampaignStartRounds(progress, 'supreme'), [1]);
});

test('Supreme 30 routes through its ordinary boss, then Trinity, then campaign completion', () => {
  const progress = createCampaignProgress();
  progress.legacyModeAccess.supreme = true;
  assert.throws(() => recordCampaignVictory(progress, 'supreme', 30, 'trinity'), /boss must be defeated/);
  assert.deepEqual(recordCampaignVictory(progress, 'supreme', 30, 'boss'), { kind: 'trinity', round: 30 });
  assert.equal(progress.modes.supreme.completed, false);
  assert.equal(progress.modes.supreme.highestBossDefeated, 30);
  assert.deepEqual(recordCampaignVictory(progress, 'supreme', 30, 'trinity'), { kind: 'campaign-complete' });
  assert.equal(progress.modes.supreme.completed, true);
  assert.equal(getCampaignStartRounds(progress, 'supreme').length, 30);
  assert.throws(() => getCampaignVictoryDestination('normal', 30, 'trinity'));
  assert.throws(() => getCampaignVictoryDestination('supreme', 29, 'trinity'));
});

test('Supreme stages advance at every authored boundary independently of selected legacy protocol', () => {
  const names = ['leo', 'gemini', 'cassiopeia', 'aquila', 'ursa-major', 'scorpius', 'taurus', 'virgo', 'capricornus'];
  for (let round = 1; round <= 30; round++) {
    const name = round === 30 ? 'centaurus' : round >= 28 ? 'delphinus' : names[Math.floor((round - 1) / 3)];
    assert.equal(getCampaignProtocol('supreme', round), `supreme-${name}`);
    assert.equal(getCampaignProtocol('normal', round), 'normal');
    assert.equal(getCampaignProtocol('overdrive', round), 'overdrive');
  }
});

test('package eligibility and claims are independent and replay cannot clear an existing claim', () => {
  const progress = createCampaignProgress();
  assert.deepEqual(getPendingCampaignPackages(progress), []);
  recordCampaignTrainingCompletion(progress);
  recordCampaignVictory(progress, 'normal', 30, 'boss');
  recordCampaignVictory(progress, 'overdrive', 30, 'boss');
  assert.deepEqual(getPendingCampaignPackages(progress), ['training', 'normal', 'overdrive']);
  for (const reward of Object.values(progress.packages)) reward.claimed = true;
  const reload = JSON.parse(JSON.stringify(progress));
  recordCampaignTrainingCompletion(reload);
  recordCampaignVictory(reload, 'normal', 30, 'boss');
  recordCampaignVictory(reload, 'overdrive', 30, 'boss');
  assert.deepEqual(getPendingCampaignPackages(reload), []);
});

test('grandfathered access is separate from victory records and new ordinary rounds cannot expand it', () => {
  const progress = createCampaignProgress();
  progress.legacyModeAccess.overdrive = true;
  progress.modes.overdrive.legacyStartRound = 13;
  assert.equal(isCampaignStartUnlocked(progress, 'overdrive', 13), true);
  assert.equal(progress.modes.overdrive.highestBossDefeated, 0);
  recordCampaignVictory(progress, 'overdrive', 14, 'arena');
  assert.equal(isCampaignStartUnlocked(progress, 'overdrive', 14), false);
  recordCampaignVictory(progress, 'overdrive', 15, 'boss');
  assert.equal(isCampaignStartUnlocked(progress, 'overdrive', 15), true);
  assert.equal(progress.modes.overdrive.legacyStartRound, 13);
  assert.equal(progress.modes.normal.completed, false);
  assert.equal(progress.packages.normal.eligible, false);
});
