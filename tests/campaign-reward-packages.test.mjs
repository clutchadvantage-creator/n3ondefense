import test from 'node:test';
import assert from 'node:assert/strict';
import { MOD_DEFINITIONS, MOD_BY_ID } from '../src/game/mods/definitions.ts';
import { createDefaultModCollection, addModDrop } from '../src/game/mods/ModInventoryService.ts';
import { createCampaignProgress, recordCampaignVictory, recordCampaignTrainingCompletion } from '../src/game/progression/CampaignProgression.ts';
import { prepareCampaignRewardPackages } from '../src/game/progression/CampaignRewardPackages.ts';

const acquiredAt = '2026-09-25T12:00:00.000Z';
const eligible = () => {
  const progress = createCampaignProgress();
  recordCampaignTrainingCompletion(progress);
  recordCampaignVictory(progress, 'normal', 30, 'boss');
  recordCampaignVictory(progress, 'overdrive', 30, 'boss');
  return progress;
};

for (const collection of ['empty', 'partial', 'nearly-complete', 'complete']) {
  test(`packages prefer unowned cards and safely retain duplicates with a ${collection} collection`, () => {
    const mods = createDefaultModCollection();
    for (const rarity of ['common', 'epic', 'legendary', 'supreme']) {
      const pool = MOD_DEFINITIONS.filter((definition) => definition.rarity === rarity);
      const count = collection === 'empty' ? 0 : collection === 'partial' ? Math.floor(pool.length / 2)
        : collection === 'nearly-complete' ? pool.length - 1 : pool.length;
      for (const definition of pool.slice(0, count)) addModDrop(mods, definition.id, acquiredAt);
    }
    const progress = eligible();
    const original = structuredClone({ progress, mods });
    const result = prepareCampaignRewardPackages(progress, mods, 12345, acquiredAt);
    assert.deepEqual({ progress, mods }, original, 'preparation must not mutate the live save');
    assert.equal(result.mods.cards.length, mods.cards.length + 9);
    assert.deepEqual(result.grants.map((grant) => grant.modIds.map((id) => MOD_BY_ID.get(id).rarity)), [
      ['common', 'common', 'common'], ['epic', 'epic', 'legendary'], ['supreme', 'supreme', 'legendary']
    ]);
    const owned = new Set(Object.keys(mods.inventory));
    for (const grant of result.grants) {
      assert.equal(new Set(grant.modIds).size, 3, 'no within-package duplicates with the current eligible pools');
      for (const id of grant.modIds) {
        const rarity = MOD_BY_ID.get(id).rarity;
        const remainingUnowned = MOD_DEFINITIONS.filter((definition) => definition.rarity === rarity && !owned.has(definition.id));
        if (remainingUnowned.length) assert.equal(owned.has(id), false, 'an unowned candidate must take priority');
        owned.add(id);
      }
      assert.equal(result.progress.packages[grant.packageId].claimed, true);
    }
    const replay = prepareCampaignRewardPackages(JSON.parse(JSON.stringify(result.progress)), result.mods, 99999, acquiredAt);
    assert.deepEqual(replay.grants, []);
    assert.deepEqual(replay.mods, result.mods);
  });
}

test('owning Supreme cards is neither package eligibility nor a claim', () => {
  const progress = createCampaignProgress();
  const mods = createDefaultModCollection();
  addModDrop(mods, MOD_DEFINITIONS.find((definition) => definition.rarity === 'supreme').id, acquiredAt);
  const result = prepareCampaignRewardPackages(progress, mods, 1, acquiredAt);
  assert.deepEqual(result.grants, []);
  assert.equal(result.progress.packages.overdrive.claimed, false);
});

test('invalid Supreme package eligibility cannot grant any partial rewards or claims', () => {
  const progress = createCampaignProgress();
  progress.packages.training.eligible = true;
  progress.packages.overdrive.eligible = true;
  const mods = createDefaultModCollection();
  const original = structuredClone({ progress, mods });
  assert.throws(() => prepareCampaignRewardPackages(progress, mods, 1, acquiredAt), /Supreme must be unlocked/);
  assert.deepEqual({ progress, mods }, original);
});

test('training randomizes eligible choices across seeds while retaining three different Commons', () => {
  const progress = createCampaignProgress();
  recordCampaignTrainingCompletion(progress);
  const signatures = new Set();
  for (let seed = 1; seed <= 16; seed++) {
    const result = prepareCampaignRewardPackages(progress, createDefaultModCollection(), seed, acquiredAt);
    const ids = result.grants[0].modIds;
    assert.equal(new Set(ids).size, 3);
    signatures.add(ids.join(','));
  }
  assert.ok(signatures.size > 1);
});
