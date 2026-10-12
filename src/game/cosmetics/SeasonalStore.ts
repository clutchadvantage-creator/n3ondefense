import type { CosmeticOption } from '../types.ts';

export type HolidayId = 'halloween' | 'christmas' | 'independence-day';
export interface HolidayWindow {
  id: HolidayId;
  label: string;
  start: readonly [month: number, day: number];
  end: readonly [month: number, day: number];
  dates: string;
}

/** Annual, inclusive windows in the player's local calendar. June's last seven days start on the 24th. */
export const HOLIDAY_WINDOWS: readonly HolidayWindow[] = [
  { id: 'halloween', label: 'HALLOWEEN', start: [10, 1], end: [11, 1], dates: 'OCT 1 - NOV 1' },
  { id: 'christmas', label: 'CHRISTMAS', start: [12, 5], end: [1, 3], dates: 'DEC 5 - JAN 3' },
  { id: 'independence-day', label: 'JULY 4', start: [6, 24], end: [7, 5], dates: 'JUN 24 - JUL 5' }
];

export const isHolidayActive = (holiday: HolidayId, now = new Date()): boolean => {
  const window = HOLIDAY_WINDOWS.find(candidate => candidate.id === holiday);
  if (!window || !Number.isFinite(now.getTime())) return false;
  const today = (now.getMonth() + 1) * 100 + now.getDate();
  const start = window.start[0] * 100 + window.start[1];
  const end = window.end[0] * 100 + window.end[1];
  return start <= end ? today >= start && today <= end : today >= start || today <= end;
};

export const isCosmeticInSeason = (item: Pick<CosmeticOption, 'holiday'>, now = new Date()): boolean =>
  !item.holiday || isHolidayActive(item.holiday, now);

/** Store discovery only. Inventory, rewards and equipped cosmetics always use the full catalog. */
export const getSeasonalStoreInventory = (items: readonly CosmeticOption[], now = new Date()): CosmeticOption[] =>
  items.filter(item => isCosmeticInSeason(item, now))
    .sort((first, second) => Number(!!second.holiday) - Number(!!first.holiday));

export const getStoreCalendarKey = (now = new Date()): string =>
  `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
