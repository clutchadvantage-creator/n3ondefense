import { getCurrencyExchangeRate, getMaximumExchangeSpend, type ExchangeBalances, type ExchangeCurrency } from './CurrencyExchange.ts';

export type ExchangeAmountAction = 'decrease' | 'increase' | 'five' | 'ten' | 'maximum';

/** Input changes only; the existing quote and transaction remain authoritative. */
export const adjustExchangeAmount = (
  wallet: ExchangeBalances, source: ExchangeCurrency, target: ExchangeCurrency,
  amount: number, action: ExchangeAmountAction, untouchedInitialBatch = false
): number => {
  const units = getCurrencyExchangeRate(source, target)?.sourceUnits ?? 1;
  const maximum = getMaximumExchangeSpend(wallet, source, target);
  const current = Math.max(units, Math.floor((Number.isFinite(amount) ? amount : units) / units) * units);
  let requested = current;
  if (action === 'maximum') requested = maximum;
  else if (action === 'increase') requested += units;
  else if (action === 'decrease') requested -= units;
  else {
    const batches = action === 'five' ? 5 : 10;
    requested = untouchedInitialBatch && current === units ? batches * units : current + batches * units;
  }
  return maximum < units ? units : Math.max(units, Math.min(maximum, requested));
};
