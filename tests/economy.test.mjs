import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRunEconomySnapshot,
  createEmptyCreditSpendBreakdown,
  getNextLoadoutSlotCost,
  getRunSetupCost,
  purchaseRunSetup,
  spendCreditsAtomic
} from '../src/game/economy/EconomyService.ts';
import {
  ECONOMY_BALANCE,
  RUN_CONTRACTS,
  getLegacyRoundCompletionCredits,
  getRoundCompletionCredits
} from '../src/game/economy/economyBalance.ts';
import { rollModDrop } from '../src/game/mods/ModDropService.ts';
import { normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const progress = () => ({
  highestRound: 0,
  roundsCompleted: 0,
  enemiesDestroyed: 0,
  bombSitesDestroyed: 0,
  totalCreditsEarned: 0,
  totalCreditsSpent: 0,
  creditSpendByCategory: createEmptyCreditSpendBreakdown(),
  totalCoreTokensEarned: 0,
  totalPlaytimeSeconds: 0
});

test('completion rewards are controlled, finite, monotonic, and protect early progression', () => {
  let previous = 0;
  for (let round = 1; round <= 500; round += 1) {
    const reward = getRoundCompletionCredits(round);
    assert.ok(Number.isFinite(reward));
    assert.ok(reward >= previous);
    previous = reward;
  }
  assert.ok(getRoundCompletionCredits(10) >= getLegacyRoundCompletionCredits(10));
  assert.ok(getRoundCompletionCredits(50) < getLegacyRoundCompletionCredits(50));
});

test('run setup purchase is all-or-nothing and never permits a negative wallet', () => {
  const selection = { modFocus: 'weapon', contract: 'elite-hunt' };
  const cost = getRunSetupCost(selection);
  const poorWallet = { credits: cost - 1, coreTokens: 0 };
  const poorProgress = progress();
  const failed = purchaseRunSetup(poorWallet, poorProgress, selection);
  assert.equal(failed.ok, false);
  assert.equal(poorWallet.credits, cost - 1);
  assert.equal(poorProgress.totalCreditsSpent, 0);

  const wallet = { credits: cost + 100, coreTokens: 0 };
  const tracked = progress();
  const purchased = purchaseRunSetup(wallet, tracked, selection);
  assert.equal(purchased.ok, true);
  assert.equal(wallet.credits, 100);
  const invalid = purchaseRunSetup(wallet, tracked, { modFocus: 'invalid', contract: null });
  assert.equal(invalid.ok, false);
  assert.equal(wallet.credits, 100);
  assert.equal(tracked.totalCreditsSpent, cost);
  assert.equal(tracked.creditSpendByCategory.modFocus, ECONOMY_BALANCE.modFocus.cost);
  assert.equal(tracked.creditSpendByCategory.contract, RUN_CONTRACTS['elite-hunt'].cost);
  assert.equal(spendCreditsAtomic(wallet, tracked, -10, 'other'), false);
  assert.equal(wallet.credits, 100);
});

test('focused Mod selection remains deterministic and changes category weighting, not drop count', () => {
  const request = { source: 'milestone', round: 20, seed: 13579, sequence: 4, protocol: 'normal', guaranteed: true };
  assert.equal(rollModDrop(request)?.id, rollModDrop(request)?.id);
  let baselineWeapon = 0;
  let focusedWeapon = 0;
  for (let sequence = 0; sequence < 1200; sequence += 1) {
    if (rollModDrop({ ...request, sequence })?.category === 'weapon') baselineWeapon += 1;
    if (rollModDrop({ ...request, sequence, focus: 'weapon' })?.category === 'weapon') focusedWeapon += 1;
  }
  assert.ok(focusedWeapon > baselineWeapon * 1.5);
});

test('every Contract pairs a positive fee and reward opportunity with added challenge', () => {
  for (const contract of Object.values(RUN_CONTRACTS)) {
    assert.ok(contract.cost > 0);
    assert.ok(contract.creditRewardMultiplier >= 1);
    assert.ok(contract.enemyHealthMultiplier > 1 || contract.spawnCadenceMultiplier < 1 || contract.eliteCompositionWeightMultiplier > 1);
  }
});

test('version-five profiles preserve balances and receive economy telemetry defaults', () => {
  const migrated = normalizeLocalSave({
    version: 5,
    profile: { id: 'economy-v5', name: 'Veteran', createdAt: '2026-01-01T00:00:00.000Z', lastPlayedAt: '2026-02-01T00:00:00.000Z' },
    wallet: { credits: 9_876_543, coreTokens: 44 },
    upgrades: { 'weapon.damage': 7 },
    cosmetics: { owned: ['player-cyan'], equipped: { playerColor: 'player-cyan' } },
    progress: { highestRound: 31, roundsCompleted: 80, enemiesDestroyed: 4000, bombSitesDestroyed: 230, totalCreditsEarned: 10_000_000, totalCoreTokensEarned: 80, totalPlaytimeSeconds: 99_000 },
    settings: { masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.8, screenShake: true, particles: true },
    metadata: { updatedAt: '2026-02-01T00:00:00.000Z', saveRevision: 99, gameVersion: '0.0.1' }
  });
  assert.ok(migrated);
  assert.equal(migrated.version, 6);
  assert.equal(migrated.wallet.credits, 9_876_543);
  assert.equal(migrated.wallet.coreTokens, 44);
  assert.equal(migrated.progress.totalCreditsSpent, 0);
  assert.deepEqual(migrated.progress.creditSpendByCategory, createEmptyCreditSpendBreakdown());
  assert.equal(migrated.mods.purchasedLoadoutSlots, 1);
});

test('run telemetry derives progression state without storing hidden adaptive difficulty', () => {
  const upgrades = { 'weapon.damage': 10 };
  const snapshot = buildRunEconomySnapshot(upgrades, { modFocus: 'weapon', contract: 'bomb-rush' }, 37_500);
  assert.equal(snapshot.modFocus, 'weapon');
  assert.equal(snapshot.contract, 'bomb-rush');
  assert.equal(snapshot.creditsSpentBeforeRun, 37_500);
  assert.equal(snapshot.accountProgressionTier, 'new');
  assert.ok(snapshot.upgradeCompletionPercentage > 0);
});

test('saved loadout slot costs escalate without adding active Mod slots', () => {
  assert.equal(getNextLoadoutSlotCost(1), 25_000);
  assert.equal(getNextLoadoutSlotCost(2), 75_000);
  assert.equal(getNextLoadoutSlotCost(5), null);
});
