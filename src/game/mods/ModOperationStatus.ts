export type ModOperationStatusTone = 'success' | 'warning' | 'error' | 'info';

export interface ModOperationResult {
  ok: boolean;
  message?: string;
}

export interface ModStatusCurrencyAvailability {
  credits: number;
  coreTokens: number;
  plasmaChips: number;
  fluxCores: number;
}

export interface ModOperationStatusPresentation {
  message: string;
  tone: ModOperationStatusTone;
}

export const MOD_OPERATION_STATUS_DURATION_MS = 3_800;

const CURRENCY_MATCHERS: ReadonlyArray<{
  pattern: RegExp;
  key: keyof ModStatusCurrencyAvailability;
}> = [
  { pattern: /credits?/i, key: 'credits' },
  { pattern: /core tokens?/i, key: 'coreTokens' },
  { pattern: /plasma chips?/i, key: 'plasmaChips' },
  { pattern: /flux cores?/i, key: 'fluxCores' }
];

const classifyFailure = (message: string): ModOperationStatusTone => {
  if (/requires?|not enough|insufficient|missing|not found|invalid|unknown/i.test(message)) return 'error';
  if (/limit|maximum|max(?:imum)? level|already|cannot|can't|only one|only two|locked|unavailable|equipped|fully upgraded/i.test(message)) return 'warning';
  return 'info';
};

export const buildModOperationStatus = (
  result: ModOperationResult,
  available?: ModStatusCurrencyAvailability
): ModOperationStatusPresentation => {
  const rawMessage = result.message?.trim() || (result.ok ? 'MODULE OPERATION COMPLETE' : 'MODULE OPERATION BLOCKED');
  let message = rawMessage.replace(/^(success|blocked|error|warning)\s*:\s*/i, '').toUpperCase();

  if (!result.ok && available && !/\bAVAILABLE\b/i.test(message)) {
    const currency = CURRENCY_MATCHERS.find((entry) => entry.pattern.test(message));
    if (currency) message += ` // ${available[currency.key].toLocaleString()} AVAILABLE`;
  }

  return {
    message,
    tone: result.ok ? 'success' : classifyFailure(rawMessage)
  };
};
