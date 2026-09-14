import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustExchangeAmount } from '../src/game/economy/ExchangeAmountControl.ts';
import { CURRENCY_EXCHANGE_RATES, quoteCurrencyExchange } from '../src/game/economy/CurrencyExchange.ts';

test('exchange shortcuts start at five/ten batches, then add batches and mix with precise steps', () => {
  const wallet = { credits: 20000, coreTokens: 0, plasmaChips: 0, fluxCores: 0 };
  for (const [actions, expected] of [
    [['five','five','five'], [1000,2000,3000]],
    [['ten','ten','five','increase','decrease'], [2000,4000,5000,5200,5000]],
    [['increase','five'], [400,1400]]
  ]) {
    let amount = 200;
    actions.forEach((action,i) => { amount = adjustExchangeAmount(wallet,'credits','coreTokens',amount,action,i===0); assert.equal(amount,expected[i]); });
  }
  assert.equal(wallet.credits,20000);
});

test('all directed exchange pairs stay in affordable batches during repeated input', () => {
  for (const rate of CURRENCY_EXCHANGE_RATES) {
    const wallet = { credits: 0, coreTokens: 0, plasmaChips: 0, fluxCores: 0 };
    wallet[rate.source] = rate.sourceUnits * 37 + (rate.sourceUnits > 1 ? 1 : 0);
    let amount = rate.sourceUnits;
    for (let i=0;i<100;i++) {
      amount = adjustExchangeAmount(wallet,rate.source,rate.target,amount,'increase');
      const quote = quoteCurrencyExchange(wallet,rate.source,rate.target,amount);
      assert.ok(quote.ok); assert.equal(quote.spent,amount); assert.equal(quote.received,quote.batches*rate.targetUnits);
    }
    assert.equal(amount,rate.sourceUnits*37);
    for(let i=0;i<100;i++) amount=adjustExchangeAmount(wallet,rate.source,rate.target,amount,'decrease');
    assert.equal(amount,rate.sourceUnits);
    wallet[rate.source] = rate.sourceUnits-1;
    amount=adjustExchangeAmount(wallet,rate.source,rate.target,amount,'ten');
    assert.equal(amount,rate.sourceUnits);
    assert.equal(quoteCurrencyExchange(wallet,rate.source,rate.target,amount).ok,false);
  }
});
