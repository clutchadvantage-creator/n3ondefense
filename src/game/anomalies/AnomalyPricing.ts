/** Shared entry quote rules for every anomaly. Prices are whole Flux Cores. */
export const ANOMALY_ENTRY_PRICING = Object.freeze({ minimum: 35, maximum: 90, defaultCost: 60 });
export const ANOMALY_ENTRY_COSTS: readonly number[] = Object.freeze(Array.from(
  { length: ANOMALY_ENTRY_PRICING.maximum - ANOMALY_ENTRY_PRICING.minimum + 1 },
  (_, index) => ANOMALY_ENTRY_PRICING.minimum + index
));

export const isValidAnomalyEntryCost = (cost: unknown): cost is number => typeof cost === 'number'
  && Number.isInteger(cost) && cost >= ANOMALY_ENTRY_PRICING.minimum && cost <= ANOMALY_ENTRY_PRICING.maximum;

/** Normalize before publishing a quote, never only at display or deduction. */
export const normalizeAnomalyEntryCost = (cost: number): number => Number.isFinite(cost)
  ? Math.max(ANOMALY_ENTRY_PRICING.minimum, Math.min(ANOMALY_ENTRY_PRICING.maximum, Math.floor(cost)))
  : ANOMALY_ENTRY_PRICING.defaultCost;

export const rollAnomalyEntryCost = (random: number): number => {
  const unit = Number.isFinite(random) ? Math.max(0, Math.min(1, random)) : 0;
  return ANOMALY_ENTRY_COSTS[Math.min(ANOMALY_ENTRY_COSTS.length - 1, Math.floor(unit * ANOMALY_ENTRY_COSTS.length))];
};
