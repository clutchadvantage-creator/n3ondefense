import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WalletStatePublisher } from '../src/game/economy/WalletState.ts';

const snapshot = (overrides = {}) => ({
  profileId: 'operative-a',
  credits: 1000,
  coreTokens: 20,
  plasmaChips: 50,
  fluxCores: 3,
  ...overrides
});

test('wallet publisher emits one atomic cross-currency delta and ignores unrelated saves', () => {
  const publisher = new WalletStatePublisher();
  publisher.prime(snapshot());
  const changes = [];
  const unsubscribe = publisher.subscribe((change) => changes.push(change), false);
  assert.equal(publisher.publish(snapshot()), false);
  assert.equal(changes.length, 0);

  assert.equal(publisher.publish(snapshot({ credits: 750, plasmaChips: 175, fluxCores: 2 })), true);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].deltas, {
    credits: -250,
    coreTokens: 0,
    plasmaChips: 125,
    fluxCores: -1
  });
  assert.deepEqual(changes[0].current, snapshot({ credits: 750, plasmaChips: 175, fluxCores: 2 }));

  unsubscribe();
  publisher.publish(snapshot({ credits: 700 }));
  assert.equal(changes.length, 1);
});

test('switching profiles refreshes the wallet without reporting phantom currency gains or losses', () => {
  const publisher = new WalletStatePublisher();
  publisher.prime(snapshot());
  let change;
  publisher.subscribe((next) => { change = next; }, false);
  publisher.publish(snapshot({ profileId: 'operative-b', credits: 25, coreTokens: 1, plasmaChips: 0, fluxCores: 0 }), true);
  assert.deepEqual(change.deltas, { credits: 0, coreTokens: 0, plasmaChips: 0, fluxCores: 0 });
});

test('wallet presentation surfaces subscribe to the authoritative profile transaction publisher', () => {
  const profile = readFileSync(new URL('../src/game/state/PlayerProfileStore.ts', import.meta.url), 'utf8');
  const saveSystem = readFileSync(new URL('../src/game/systems/SaveSystem.ts', import.meta.url), 'utf8');
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  const collection = readFileSync(new URL('../src/game/scenes/ModCollectionScene.ts', import.meta.url), 'utf8');
  const upgrades = readFileSync(new URL('../src/game/scenes/UpgradeStoreScene.ts', import.meta.url), 'utf8');
  const cosmetics = readFileSync(new URL('../src/game/scenes/CosmeticsStoreScene.ts', import.meta.url), 'utf8');
  assert.match(profile, /walletState\.publish\(PlayerProfileStore\.walletSnapshot\(save\)\)/);
  assert.match(saveSystem, /static subscribeWalletChanges/);
  assert.match(garage, /subscribeWalletChanges[\s\S]*?refreshWalletTerminalState/);
  assert.match(collection, /subscribeWalletChanges[\s\S]*?setReadoutValue\('PLASMA CHIPS'/);
  assert.match(upgrades, /subscribeWalletChanges[\s\S]*?refreshWalletReadout/);
  assert.match(cosmetics, /subscribeWalletChanges[\s\S]*?refreshWalletReadout/);
});
