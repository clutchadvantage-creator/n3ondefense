import test from 'node:test';
import assert from 'node:assert/strict';
import { getHeistCampaignPositions } from '../src/game/anomalies/heist/HeistCampaignProgression.ts';
import { HeistRewardService } from '../src/game/anomalies/heist/HeistRewardService.ts';
import { HEIST_BALANCE } from '../src/game/anomalies/heist/HeistConfig.ts';
import { getCampaignProtocol } from '../src/game/progression/CampaignProgression.ts';

test('HEIST keeps local, reward and difficulty positions separate throughout all three campaigns', () => {
  for (const [mode, offset] of [['normal', 0], ['overdrive', 30], ['supreme', 60]]) {
    let previous = 0;
    for (let localRound = 1; localRound <= 30; localRound++) {
      const positions = getHeistCampaignPositions(getCampaignProtocol(mode, localRound), localRound);
      assert.equal(positions.localRound, localRound);
      assert.equal(positions.rewardPosition, offset + localRound);
      assert.equal(positions.difficultyPosition, mode === 'supreme' ? 61 + (localRound - 1) * 3 : offset + localRound);
      assert.ok(positions.difficultyPosition > previous);
      if (previous) assert.equal(positions.difficultyPosition - previous, mode === 'supreme' ? 3 : 1);
      assert.ok(positions.difficultyPosition <= 148);
      previous = positions.difficultyPosition;
    }
  }
  for (const invalid of [0, 31, 1.5, NaN, Infinity]) assert.throws(() => getHeistCampaignPositions('normal', invalid), RangeError);
});

test('campaign HEIST payouts exactly match unchanged reward service at the approved reward positions', () => {
  for (const mode of ['normal', 'overdrive', 'supreme']) {
    for (const localRound of [1, 10, 20, 30]) {
      const protocol = getCampaignProtocol(mode, localRound);
      for (const fee of [35, 60, 90]) {
        const campaign = HeistRewardService.forCampaign(417, localRound, protocol, fee);
        const existing = new HeistRewardService(417, getHeistCampaignPositions(protocol, localRound).rewardPosition, protocol, fee);
        for (let i = 0; i < 8; i++) assert.deepEqual(campaign.rollContainer(), existing.rollContainer());
        assert.deepEqual(campaign.rollMiniBossReward(), existing.rollMiniBossReward());
        for (let i = 0; i < 20; i++) assert.deepEqual(campaign.rollEnemyBonus(), existing.rollEnemyBonus());
      }
    }
  }
});

test('compressed terminal difficulty reaches the existing patrol and escape caps without exceeding the old endpoint', () => {
  const terminal = getHeistCampaignPositions('supreme-centaurus', 30);
  assert.equal(terminal.rewardPosition, 90);
  assert.equal(terminal.difficultyPosition, 148);
  const patrols = (position) => Math.min(HEIST_BALANCE.maximumRegularEnemies, HEIST_BALANCE.initialEnemyCount + Math.floor(position / 10));
  const escape = (position) => Math.min(HEIST_BALANCE.escapeMaximumEnemies, HEIST_BALANCE.escapeInitialEnemyCount + Math.floor(position / 8) * HEIST_BALANCE.enemyPerEightRounds);
  assert.equal(patrols(terminal.difficultyPosition), 16);
  assert.equal(escape(terminal.difficultyPosition), 24);
  for (let round = 1; round <= 30; round++) {
    const { difficultyPosition } = getHeistCampaignPositions(getCampaignProtocol('supreme', round), round);
    assert.ok(patrols(difficultyPosition) <= patrols(148));
    assert.ok(escape(difficultyPosition) <= escape(148));
  }
});
