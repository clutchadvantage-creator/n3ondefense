import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { WEEKLY_MISSION_LIBRARY, selectWeeklyMissions, resolveWeeklyMission } from '../src/game/progression/WeeklyMissionLibrary.ts';
import { createDefaultWeeklyOperationsState, getWeeklyRotationSlot, resolveWeeklyOperationDecks, WEEKLY_OPERATION_ROTATIONS, OVERDRIVE_WEEKLY_OPERATION_ROTATIONS } from '../src/game/progression/WeeklyOperations.ts';
import { WEEKLY_REWARD_CAMPAIGNS, createDefaultWeeklyRewardCampaignState, earnWeeklyCampaignRewards, getWeeklyFeaturedRewards, getWeeklyRewardHistory, normalizeWeeklyRewardCampaignState, validateWeeklyRewardCampaigns } from '../src/game/progression/WeeklyRewardCampaigns.ts';
import { deliverWeeklyFeaturedRewards } from '../src/game/progression/WeeklyRewardDelivery.ts';
import { MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';

const start = Date.UTC(2026, 9, 5), week = 7 * 86400000;
const reward = (id, overrides = {}) => ({ rewardId: id, type: 'credits', inventoryRef: 'credits', displayName: 'Test Credits', iconRef: 'pickup:credits', amount: 5, enabled: true, ...overrides });
const campaign = (overrides = {}) => ({ campaignId: 'test-campaign', title: 'Test campaign', description: 'Test only', startsAt: new Date(start).toISOString(), endsAt: new Date(start + week * 3).toISOString(), enabled: true, sharedReward: reward('shared'), overdriveBonus: reward('bonus', { type: 'coreTokens', inventoryRef: 'coreTokens', iconRef: 'pickup:coreToken', amount: 2 }), ...overrides });
const track = (regular, overdrive) => ({ ...createDefaultWeeklyOperationsState(), completedAt: regular, overdrive: { ...createDefaultWeeklyOperationsState().overdrive, completedAt: overdrive } });
const profile = () => createDefaultLocalSave('campaign-test', 'Campaign Test');

test('production campaigns are empty; malformed metadata, UTC ranges and overlapping windows are rejected', () => {
  assert.deepEqual(WEEKLY_REWARD_CAMPAIGNS, []);
  assert.deepEqual(validateWeeklyRewardCampaigns([campaign()]), []);
  for (const input of [campaign({ endsAt: 'invalid' }), campaign({ sharedReward: reward('shared', { amount: 0 }) }), campaign({ overdriveBonus: reward('shared') })]) assert.ok(validateWeeklyRewardCampaigns([input]).length);
  assert.ok(validateWeeklyRewardCampaigns([campaign(), campaign({ campaignId: 'second' })]).length);
});

test('library uses unique stable IDs, clear targets and only eligible systems without repeated categories', () => {
  assert.equal(new Set(WEEKLY_MISSION_LIBRARY.map(item => item.id)).size, WEEKLY_MISSION_LIBRARY.length);
  assert.ok(WEEKLY_MISSION_LIBRARY.length >= 13);
  for (let slot = 2900; slot < 3000; slot++) for (const deck of ['regular', 'overdrive']) {
    const basic = selectWeeklyMissions(deck, slot, { systems: ['combat'] });
    const full = selectWeeklyMissions(deck, slot, { systems: ['combat', 'arcade', 'anomalies', 'mod-upgrade', 'exchange'] });
    assert.equal(basic.length, 3); assert.equal(full.length, 3);
    assert.ok(basic.every(id => WEEKLY_MISSION_LIBRARY.find(item => item.id === id).requiredSystems.every(system => system === 'combat')));
    assert.equal(new Set(full.map(id => resolveWeeklyMission(id, deck, slot).category)).size, 3);
    assert.deepEqual(full, selectWeeklyMissions(deck, slot, { systems: ['combat', 'arcade', 'anomalies', 'mod-upgrade', 'exchange'] }));
    if (deck === 'overdrive') assert.ok(full.every(id => !['mods', 'exchange', 'credits'].includes(id)));
    for (const id of full) {
      const objective = resolveWeeklyMission(id, deck, slot);
      assert.match(objective.description, new RegExp(objective.target.toLocaleString('en-US')));
      assert.ok(objective.title !== objective.description && objective.target > 0);
    }
  }
  assert.equal(resolveWeeklyMission('unsupported-drone-kill', 'regular', 3000), undefined);
});

test('legacy current-week IDs, thresholds, baselines and rewards survive; new assignments freeze across unlock changes', () => {
  const save = profile();
  const legacy = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, save.progress.weeklyOperations, start);
  save.progress.enemiesDestroyed += 20;
  const options = { eligibility: { systems: ['combat', 'arcade', 'anomalies', 'mod-upgrade', 'exchange'] }, claimRewards: false };
  const migrated = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, legacy.state, start + 1000, options);
  assert.deepEqual(migrated.snapshot.regular.objectives.map(item => [item.id, item.target]), legacy.snapshot.regular.objectives.map(item => [item.id, item.target]));
  assert.deepEqual(migrated.state.baselines, legacy.state.baselines);
  const fresh = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, legacy.state, start + week, options);
  const reopened = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, fresh.state, start + week + 1, { eligibility: { systems: ['combat'] } });
  assert.deepEqual(reopened.state.missionIds, fresh.state.missionIds);
  for (const deck of ['regular', 'overdrive']) {
    const rotations = deck === 'regular' ? WEEKLY_OPERATION_ROTATIONS : OVERDRIVE_WEEKLY_OPERATION_ROTATIONS;
    assert.deepEqual(fresh.snapshot[deck].reward, rotations[getWeeklyRotationSlot(start + week).index % rotations.length].reward);
  }
});

test('every library metric completes exactly at its threshold in both eligible decks', () => {
  for (const item of WEEKLY_MISSION_LIBRARY) for (const deck of Object.keys(item.targets)) {
    const save = profile();
    let initial = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, save.progress.weeklyOperations, start);
    const stored = deck === 'regular' ? initial.state : initial.state.overdrive;
    const companions = ['extermination', 'frontline', 'demolition'].filter(id => id !== item.id).slice(0, 2);
    stored.missionIds = [item.id, ...companions];
    const source = deck === 'regular' ? save.progress : save.progress.overdriveWeeklyProgress;
    const target = resolveWeeklyMission(item.id, deck, getWeeklyRotationSlot(start).index).target;
    source[item.statKey] = target - 1;
    let result = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, initial.state, start + 1000, { claimRewards: false });
    assert.equal(result.snapshot[deck].objectives[0].complete, false);
    source[item.statKey]++;
    result = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, initial.state, start + 2000, { claimRewards: false });
    assert.equal(result.snapshot[deck].objectives[0].complete, true);
    assert.equal(result.snapshot[deck].objectives[0].current, target);
  }
});

for (const order of [['regular', 'overdrive'], ['overdrive', 'regular']]) test(`shared + bonus delivery deduplicates ${order.join(' then ')}`, () => {
  const save = profile(), config = [campaign()];
  const before = structuredClone(save.wallet);
  const state = save.progress.weeklyRewardCampaigns;
  for (const deck of order) {
    earnWeeklyCampaignRewards(state, track(deck === 'regular' ? start + 1000 : undefined, deck === 'overdrive' ? start + 1000 : undefined), config);
    assert.ok(getWeeklyFeaturedRewards(state, deck, start + 1000, config).some(item => item.status === 'EARNED' || item.status === 'CLAIMED'));
    deliverWeeklyFeaturedRewards(save, start + 2000);
  }
  assert.equal(state.receipts.length, 2);
  assert.equal(save.wallet.credits, before.credits + 5);
  assert.equal(save.wallet.coreTokens, before.coreTokens + 2);
  assert.equal(deliverWeeklyFeaturedRewards(save, start + 3000), false);
  assert.ok(getWeeklyFeaturedRewards(state, 'overdrive', start + 3000, config).every(item => item.status === 'CLAIMED'));
});

test('zero/one/two featured entries, disabled campaigns/rewards and explicit eligibility', () => {
  const state = createDefaultWeeklyRewardCampaignState();
  const view = (config, deck = 'overdrive') => getWeeklyFeaturedRewards(state, deck, start + 1, [config]);
  assert.equal(view(campaign({ enabled: false })).length, 0);
  assert.equal(view(campaign({ sharedReward: undefined, overdriveBonus: undefined })).length, 0);
  assert.equal(view(campaign({ overdriveBonus: undefined })).length, 1);
  assert.equal(view(campaign()).length, 2);
  assert.equal(view(campaign(), 'regular').length, 1);
  assert.equal(view(campaign({ eligibleDecks: ['regular'] })).length, 0);
  assert.equal(view(campaign({ sharedReward: reward('shared', { enabled: false }) }), 'regular').length, 0);
  earnWeeklyCampaignRewards(state, track(start + 1), [campaign({ eligibleDecks: ['overdrive'] })]);
  assert.equal(state.receipts.length, 0);
});

test('three weekly resets and reloads retain special claims while standard currencies repeat', () => {
  let save = profile();
  const config = [campaign()];
  let grants = 0;
  for (let index = 0; index < 3; index++) {
    const now = start + index * week + 100;
    let result = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, save.progress.weeklyOperations, now);
    for (const objective of result.snapshot.regular.objectives) save.progress[objective.statKey] = objective.progressMode === 'absolute' ? objective.target : result.state.baselines[objective.statKey] + objective.target;
    result = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, result.state, now + 100);
    grants += result.rewardsToGrant.filter(item => item.deck === 'regular').length;
    save.progress.weeklyOperations = result.state;
    earnWeeklyCampaignRewards(save.progress.weeklyRewardCampaigns, result.state, config);
    deliverWeeklyFeaturedRewards(save, now + 100);
    save = normalizeLocalSave(JSON.parse(JSON.stringify(save)));
    assert.ok(save);
  }
  assert.equal(grants, 3);
  assert.equal(save.progress.weeklyRewardCampaigns.receipts.length, 1);
  assert.equal(save.wallet.credits, profile().wallet.credits + 5);
});

test('campaign boundaries are start-inclusive/end-exclusive; earned receipts survive expiration and removed configuration', () => {
  for (const [at, count] of [[start - 1, 0], [start, 1], [start + week * 3 - 1, 1], [start + week * 3, 0]]) {
    const state = createDefaultWeeklyRewardCampaignState();
    earnWeeklyCampaignRewards(state, track(at), [campaign()]);
    assert.equal(state.receipts.length, count);
  }
  const save = profile();
  earnWeeklyCampaignRewards(save.progress.weeklyRewardCampaigns, track(start + 10), [campaign()]);
  const loaded = normalizeLocalSave(JSON.parse(JSON.stringify(save)));
  assert.equal(getWeeklyFeaturedRewards(loaded.progress.weeklyRewardCampaigns, 'regular', start + week * 4, [])[0].status, 'EARNED');
  assert.equal(deliverWeeklyFeaturedRewards(loaded, start + week * 4), true);
  assert.equal(loaded.wallet.credits, save.wallet.credits + 5);
});

test('failed/unavailable inventory adapters keep recoverable receipts; cosmetics and future entitlements have persisted ownership', () => {
  const save = profile();
  const config = [campaign({ sharedReward: reward('shared', { type: 'cosmetic', inventoryRef: 'player-pink', iconRef: 'player-circle' }), overdriveBonus: reward('bonus', { type: 'entitlement', inventoryRef: 'test-only-entitlement', iconRef: 'player-circle', amount: 1 }) })];
  earnWeeklyCampaignRewards(save.progress.weeklyRewardCampaigns, track(undefined, start + 1), config);
  const candidate = structuredClone(save);
  deliverWeeklyFeaturedRewards(candidate, start + 2);
  assert.equal(save.progress.weeklyRewardCampaigns.receipts[0].claimedAt, undefined, 'uncommitted candidate never marks source claimed');
  assert.ok(candidate.cosmetics.owned.includes('player-pink'));
  assert.equal(candidate.progress.weeklyRewardCampaigns.entitlements.length, 1);
  const reload = normalizeLocalSave(candidate);
  assert.deepEqual(reload.progress.weeklyRewardCampaigns, candidate.progress.weeklyRewardCampaigns);
  const broken = profile();
  earnWeeklyCampaignRewards(broken.progress.weeklyRewardCampaigns, track(start + 1), [campaign({ sharedReward: reward('shared', { type: 'cosmetic', inventoryRef: 'missing-test-item' }) })]);
  assert.equal(deliverWeeklyFeaturedRewards(broken, start + 2), false);
  assert.equal(broken.progress.weeklyRewardCampaigns.receipts[0].claimedAt, undefined);
});

test('profile isolation, legacy defaults and existing wallet/Mods/infusions/settings survive normalization', () => {
  const first = profile(), second = createDefaultLocalSave('other', 'Other');
  earnWeeklyCampaignRewards(first.progress.weeklyRewardCampaigns, track(start + 1), [campaign()]);
  assert.equal(second.progress.weeklyRewardCampaigns.receipts.length, 0);
  const legacy = structuredClone(first); delete legacy.progress.weeklyRewardCampaigns; delete legacy.progress.bossesDefeated;
  const loaded = normalizeLocalSave(legacy);
  assert.deepEqual(loaded.wallet, first.wallet); assert.deepEqual(loaded.mods, first.mods); assert.deepEqual(loaded.settings, first.settings);
  assert.deepEqual(loaded.progress.weeklyRewardCampaigns, createDefaultWeeklyRewardCampaignState());
  assert.equal(loaded.progress.bossesDefeated, 0);
  assert.deepEqual(normalizeWeeklyRewardCampaignState({ receipts: [null, {}, { campaignId: '__proto__' }], entitlements: [null] }), createDefaultWeeklyRewardCampaignState());
});

test('all eight standard reward packages retain existing economy values', () => {
  assert.deepEqual(WEEKLY_OPERATION_ROTATIONS.map(item => item.reward), [
    { credits: 750, coreTokens: 1 }, { credits: 1000, coreTokens: 1 }, { credits: 1250, coreTokens: 2 }, { credits: 1500, coreTokens: 2, fluxCores: 1 }
  ]);
  assert.deepEqual(OVERDRIVE_WEEKLY_OPERATION_ROTATIONS.map(item => item.reward), [
    { credits: 35000, coreTokens: 8, plasmaChips: 12, fluxCores: 2 },
    { credits: 45000, coreTokens: 10, plasmaChips: 16, fluxCores: 2, randomMod: true },
    { credits: 60000, coreTokens: 12, plasmaChips: 20, fluxCores: 2, randomMod: true },
    { credits: 50000, coreTokens: 10, plasmaChips: 18, fluxCores: 2, randomMod: true }
  ]);
});

test('first completion timestamp is sticky and entitlement eligibility survives configuration removal', () => {
  const save = profile();
  const initial = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, save.progress.weeklyOperations, start);
  for (const objective of initial.snapshot.regular.objectives) save.progress[objective.statKey] = initial.state.baselines[objective.statKey] + objective.target;
  const done = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, initial.state, start + 1000, { claimRewards: false });
  const reopened = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, done.state, start + 2000, { claimRewards: false });
  assert.equal(reopened.state.completedAt, start + 1000);
  assert.equal(reopened.state.rewardClaimed, false);
  const state = createDefaultWeeklyRewardCampaignState();
  earnWeeklyCampaignRewards(state, track(undefined, start + 1), [campaign({ eligibleDecks: ['overdrive'] })]);
  assert.equal(getWeeklyFeaturedRewards(state, 'regular', start + week * 4, []).length, 0);
  assert.equal(getWeeklyFeaturedRewards(state, 'overdrive', start + week * 4, []).length, 2);
  assert.ok(getWeeklyRewardHistory(createDefaultWeeklyRewardCampaignState(), start + week * 4, [campaign()]).every(item => item.status === 'EXPIRED'));
  assert.ok(getWeeklyRewardHistory(state, start + week * 4, [campaign()]).every(item => item.status === 'EARNED'));
});

test('existing Mod reward delivery persists real card ownership once across reloads', () => {
  const save = profile(), definition = MOD_DEFINITIONS[0];
  earnWeeklyCampaignRewards(save.progress.weeklyRewardCampaigns, track(start + 1), [campaign({ sharedReward: reward('shared', { type: 'mod', inventoryRef: definition.id, iconRef: `mod:${definition.id}`, amount: 1 }) })]);
  const before = save.mods.cards.length;
  deliverWeeklyFeaturedRewards(save, start + 2);
  assert.equal(save.mods.cards.length, before + 1);
  assert.equal(save.mods.cards.at(-1).modId, definition.id);
  const loaded = normalizeLocalSave(JSON.parse(JSON.stringify(save)));
  assert.equal(deliverWeeklyFeaturedRewards(loaded, start + 3), false);
  assert.equal(loaded.mods.cards.length, before + 1);
});

test('live observation does not rescan Mod inventory eligibility after weekly assignment', () => {
  const save = profile(); let scans = 0;
  const options = { eligibility: () => { scans++; return { systems: ['combat'] }; }, claimRewards: false };
  const assigned = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, save.progress.weeklyOperations, start, options);
  assert.equal(scans, 2);
  for (let index = 0; index < 100; index++) resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, assigned.state, start + index + 1, options);
  assert.equal(scans, 2);
});
