import type { AnomalyId } from './types.ts';

export const ACCESS_CARD_PRICE = 50_000;
export const ACCESS_CARD_DAILY_LIMIT = 3;
export const ACCESS_CARD_TYPES = ['heist', 'skybreach'] as const;
export const ACCESS_CARD_NAMES = { heist: 'HEIST', skybreach: 'SkyBreach' } as const;
export interface AnomalyAccessCards {
  owned: Record<AnomalyId, number>;
  day: string;
  purchases: number;
  uses: number;
}
const integer = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n)
  ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

/** UTC days match the existing operation calendar. Clock rollback cannot reset caps. */
export function normalizeAccessCards(value: unknown, now = Date.now()): AnomalyAccessCards {
  const source = value && typeof value === 'object' ? value as Partial<AnomalyAccessCards> : {};
  const today = dayKey(now);
  const validDay = typeof source.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.day)
    && Number.isFinite(Date.parse(source.day)) && dayKey(Date.parse(source.day)) === source.day;
  const day = validDay ? source.day! : today;
  const reset = today > day;
  return { owned: { heist: integer(source.owned?.heist, 1_000_000), skybreach: integer(source.owned?.skybreach, 1_000_000) },
    day: reset ? today : day, purchases: reset ? 0 : integer(source.purchases, ACCESS_CARD_DAILY_LIMIT),
    uses: reset ? 0 : integer(source.uses, ACCESS_CARD_DAILY_LIMIT) };
}

export function accessCardUseError(state: AnomalyAccessCards, id: AnomalyId, lastStarted?: string): string | null {
  if (!ACCESS_CARD_TYPES.includes(id)) return 'UNKNOWN ACCESS CARD';
  if (lastStarted === `anomaly:${id}`) return 'LAST EVENT PLAYED — CHOOSE A DIFFERENT ANOMALY';
  if (state.owned[id] < 1) return 'NO CARD OWNED';
  if (state.uses >= ACCESS_CARD_DAILY_LIMIT) return 'DAILY USE LIMIT REACHED';
  return null;
}
