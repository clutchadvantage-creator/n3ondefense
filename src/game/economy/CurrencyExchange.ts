export type ExchangeCurrency = 'credits' | 'coreTokens' | 'plasmaChips' | 'fluxCores';

export interface ExchangeBalances {
  credits: number;
  coreTokens: number;
  plasmaChips: number;
  fluxCores: number;
}

export interface CurrencyExchangeRate {
  source: ExchangeCurrency;
  target: ExchangeCurrency;
  sourceUnits: number;
  targetUnits: number;
}

export interface CurrencyExchangeQuote {
  ok: boolean;
  source: ExchangeCurrency;
  target: ExchangeCurrency;
  requestedAmount: number;
  spent: number;
  received: number;
  batches: number;
  maximumSpend: number;
  message: string;
}

const rate = (
  source: ExchangeCurrency,
  target: ExchangeCurrency,
  sourceUnits: number,
  targetUnits: number
): CurrencyExchangeRate => ({ source, target, sourceUnits, targetUnits });

/**
 * The market deliberately has strong conversion loss in both directions.
 * Rates are directed rather than inferred so adding a currency never creates
 * an accidental reversible-profit loop.
 */
export const CURRENCY_EXCHANGE_RATES: readonly CurrencyExchangeRate[] = [
  rate('credits', 'coreTokens', 200, 1),
  rate('credits', 'plasmaChips', 100, 1),
  rate('credits', 'fluxCores', 60_000, 1),
  rate('coreTokens', 'credits', 1, 80),
  rate('coreTokens', 'plasmaChips', 1, 2),
  rate('coreTokens', 'fluxCores', 400, 1),
  rate('plasmaChips', 'credits', 1, 40),
  rate('plasmaChips', 'coreTokens', 3, 1),
  rate('plasmaChips', 'fluxCores', 1_200, 1),
  rate('fluxCores', 'credits', 1, 30_000),
  rate('fluxCores', 'coreTokens', 1, 250),
  rate('fluxCores', 'plasmaChips', 1, 350)
] as const;

const RATE_BY_PAIR = new Map(CURRENCY_EXCHANGE_RATES.map((entry) => [`${entry.source}:${entry.target}`, entry]));

export const getCurrencyExchangeRate = (
  source: ExchangeCurrency,
  target: ExchangeCurrency
): CurrencyExchangeRate | null => RATE_BY_PAIR.get(`${source}:${target}`) ?? null;

export const getMaximumExchangeSpend = (
  balances: Readonly<ExchangeBalances>,
  source: ExchangeCurrency,
  target: ExchangeCurrency
): number => {
  const selectedRate = getCurrencyExchangeRate(source, target);
  if (!selectedRate) return 0;
  const available = Math.max(0, Math.floor(balances[source]));
  return Math.floor(available / selectedRate.sourceUnits) * selectedRate.sourceUnits;
};

export const quoteCurrencyExchange = (
  balances: Readonly<ExchangeBalances>,
  source: ExchangeCurrency,
  target: ExchangeCurrency,
  requestedAmount: number
): CurrencyExchangeQuote => {
  const selectedRate = getCurrencyExchangeRate(source, target);
  const safeRequested = Number.isFinite(requestedAmount) ? Math.floor(requestedAmount) : 0;
  const maximumSpend = getMaximumExchangeSpend(balances, source, target);
  const base = { source, target, requestedAmount: safeRequested, spent: 0, received: 0, batches: 0, maximumSpend };
  if (source === target) return { ...base, ok: false, message: 'Select two different currencies.' };
  if (!selectedRate) return { ...base, ok: false, message: 'That exchange route is unavailable.' };
  if (safeRequested <= 0) return { ...base, ok: false, message: 'Select a positive exchange amount.' };
  if (safeRequested % selectedRate.sourceUnits !== 0) {
    return { ...base, ok: false, message: `Amount must be a multiple of ${selectedRate.sourceUnits.toLocaleString()}.` };
  }
  if (safeRequested > Math.floor(balances[source])) {
    return { ...base, ok: false, message: `Insufficient ${source}.` };
  }
  const batches = safeRequested / selectedRate.sourceUnits;
  return {
    ...base,
    ok: true,
    spent: safeRequested,
    received: batches * selectedRate.targetUnits,
    batches,
    message: 'Exchange ready.'
  };
};

/** Mutates balances only after the complete transaction has validated. */
export const executeCurrencyExchange = (
  balances: ExchangeBalances,
  source: ExchangeCurrency,
  target: ExchangeCurrency,
  requestedAmount: number
): CurrencyExchangeQuote => {
  const quote = quoteCurrencyExchange(balances, source, target, requestedAmount);
  if (!quote.ok) return quote;
  const nextSource = balances[source] - quote.spent;
  const nextTarget = balances[target] + quote.received;
  if (!Number.isSafeInteger(nextSource) || !Number.isSafeInteger(nextTarget) || nextSource < 0) {
    return { ...quote, ok: false, spent: 0, received: 0, batches: 0, message: 'Exchange exceeds safe account limits.' };
  }
  balances[source] = nextSource;
  balances[target] = nextTarget;
  return { ...quote, message: 'Exchange completed.' };
};
