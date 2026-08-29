import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CURRENCY_EXCHANGE_RATES,
  executeCurrencyExchange,
  getMaximumExchangeSpend,
  quoteCurrencyExchange
} from '../src/game/economy/CurrencyExchange.ts';
import { createBaseOperativeFrameSvgDataUri, isBaseOperativeFrameShape } from '../src/ui/stores/BaseOperativeFrameSvg.ts';

const balances = () => ({ credits: 100_000, coreTokens: 1_000, plasmaChips: 1_000, fluxCores: 10 });

test('currency exchange exposes every directed pair with explicit asymmetric rates', () => {
  assert.equal(CURRENCY_EXCHANGE_RATES.length, 12);
  assert.equal(new Set(CURRENCY_EXCHANGE_RATES.map((entry) => `${entry.source}:${entry.target}`)).size, 12);
  assert.deepEqual(CURRENCY_EXCHANGE_RATES.find((entry) => entry.source === 'fluxCores' && entry.target === 'credits'), {
    source: 'fluxCores', target: 'credits', sourceUnits: 1, targetUnits: 30_000
  });
  assert.deepEqual(CURRENCY_EXCHANGE_RATES.find((entry) => entry.source === 'credits' && entry.target === 'fluxCores'), {
    source: 'credits', target: 'fluxCores', sourceUnits: 60_000, targetUnits: 1
  });
});

test('every supported conversion route executes its published exact rate', () => {
  for (const rate of CURRENCY_EXCHANGE_RATES) {
    const wallet = { credits: 1_000_000, coreTokens: 10_000, plasmaChips: 10_000, fluxCores: 100 };
    const sourceBefore = wallet[rate.source];
    const targetBefore = wallet[rate.target];
    const result = executeCurrencyExchange(wallet, rate.source, rate.target, rate.sourceUnits);
    assert.equal(result.ok, true, `${rate.source} -> ${rate.target}`);
    assert.equal(wallet[rate.source], sourceBefore - rate.sourceUnits);
    assert.equal(wallet[rate.target], targetBefore + rate.targetUnits);
  }
});

test('direct and three-currency market loops never create extra exchange value', () => {
  const factor = new Map(CURRENCY_EXCHANGE_RATES.map((rate) => [`${rate.source}:${rate.target}`, rate.targetUnits / rate.sourceUnits]));
  const currencies = ['credits', 'coreTokens', 'plasmaChips', 'fluxCores'];
  for (const first of currencies) for (const second of currencies) {
    if (first === second) continue;
    assert.ok(factor.get(`${first}:${second}`) * factor.get(`${second}:${first}`) <= 1);
    for (const third of currencies) {
      if (third === first || third === second) continue;
      assert.ok(factor.get(`${first}:${second}`) * factor.get(`${second}:${third}`) * factor.get(`${third}:${first}`) <= 1);
    }
  }
});

test('currency exchange quotes exact batches, MAX, and rejects malformed or unaffordable requests', () => {
  const wallet = balances();
  const quote = quoteCurrencyExchange(wallet, 'credits', 'coreTokens', 1_000);
  assert.equal(quote.ok, true);
  assert.equal(quote.spent, 1_000);
  assert.equal(quote.received, 5);
  assert.equal(getMaximumExchangeSpend({ ...wallet, credits: 1_999 }, 'credits', 'coreTokens'), 1_800);
  assert.equal(quoteCurrencyExchange(wallet, 'credits', 'credits', 200).ok, false);
  assert.equal(quoteCurrencyExchange(wallet, 'credits', 'coreTokens', 201).ok, false);
  assert.equal(quoteCurrencyExchange({ ...wallet, credits: 199 }, 'credits', 'coreTokens', 200).ok, false);
  assert.equal(quoteCurrencyExchange(wallet, 'credits', 'coreTokens', Number.NaN).ok, false);
});

test('currency exchange commits atomically and leaves balances untouched on failure', () => {
  const wallet = balances();
  const before = structuredClone(wallet);
  assert.equal(executeCurrencyExchange(wallet, 'credits', 'fluxCores', 60_001).ok, false);
  assert.deepEqual(wallet, before);
  const result = executeCurrencyExchange(wallet, 'credits', 'fluxCores', 60_000);
  assert.equal(result.ok, true);
  assert.equal(wallet.credits, 40_000);
  assert.equal(wallet.fluxCores, 11);
  assert.equal(wallet.coreTokens, before.coreTokens);
  assert.equal(wallet.plasmaChips, before.plasmaChips);
});

test('Garage exchange is a sixth controller-capable station with a guarded confirmation action', () => {
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  assert.match(garage, /CURRENCY EXCHANGE/);
  assert.match(garage, /showCurrencyExchange/);
  assert.match(garage, /SaveSystem\.exchangeCurrency/);
  assert.match(garage, /exchangeConfirmLockedUntil/);
  assert.match(garage, /exchangeConfirmationArmed/);
  assert.match(garage, /focusModalDepth: 30/);
});

test('all original geometric frames share a layered SVG source across Boot and Store previews', () => {
  const shapes = ['circle', 'square', 'triangle', 'star', 'hexagon', 'diamond', 'cross'];
  for (const shape of shapes) {
    assert.equal(isBaseOperativeFrameShape(shape), true);
    const source = createBaseOperativeFrameSvgDataUri(shape);
    assert.match(source, /^data:image\/svg\+xml;base64,/);
  }
  assert.equal(isBaseOperativeFrameShape('airplane'), false);
  const boot = readFileSync(new URL('../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
  const storefront = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ui/stores/storefront.css', import.meta.url), 'utf8');
  assert.match(boot, /createBaseOperativeFrameSvgDataUri/);
  assert.match(storefront, /createBaseOperativeFrameSvg/);
  assert.match(storefront, /cyber-palette-control/);
  assert.match(css, /\.base-frame-svg/);
  assert.match(css, /\.cyber-palette-tray/);
});
