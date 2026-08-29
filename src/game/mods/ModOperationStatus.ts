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

export interface ModOperationStatusRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MOD_OPERATION_STATUS_DURATION_MS = 3_800;

/**
 * Fits the status strip into the existing toolbar row. Width is always the
 * exact remaining span; the compact strip grows upward and shares the bottom
 * alignment used by its neighboring buttons.
 */
export const calculateModOperationStatusRect = (
  statusLeft: number,
  statusRight: number,
  toolbarTop: number,
  toolbarHeight: number,
  compact: boolean
): ModOperationStatusRect => {
  const bottomInset = 4;
  const availableHeight = Math.max(1, toolbarHeight - bottomInset * 2);
  const height = Math.min(compact ? 46 : 50, availableHeight);
  const bottom = toolbarTop + toolbarHeight - bottomInset;
  return {
    x: statusLeft,
    y: bottom - height,
    width: Math.max(1, statusRight - statusLeft),
    height
  };
};

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
