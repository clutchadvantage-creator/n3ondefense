import { MOD_BY_ID } from './definitions.ts';
import { MOD_BALANCE } from './modBalance.ts';
import { LOWER_IS_BETTER_MOD_STATS, type ModCardInstance, type ModDefinition, type ModRank, type ModStat, type ModStatCalibration, type ModStatModifier, type PlasmaRecalibrationQuality } from './types.ts';

export const PLASMA_RECALIBRATION_BALANCE = {
  rollCost: 125,
  revealDurationMs: 1050,
  /** Rare top-end rolls may edge past the strongest standard (non-Supreme,
   * non-Corrupted) native version of the same stat without turning every
   * calibration into an automatic replacement. */
  nativeOverclockCeiling: 1.10,
  qualityWeights: {
    optimal: 0.15,
    enhanced: 0.40,
    stable: 0.35,
    degraded: 0.08,
    misaligned: 0.02
  } satisfies Record<PlasmaRecalibrationQuality, number>,
  qualityRanges: {
    optimal: [0.90, 1],
    enhanced: [0.68, 0.90],
    stable: [0.45, 0.68],
    degraded: [0.25, 0.45],
    misaligned: [0.05, 0.25]
  } satisfies Record<PlasmaRecalibrationQuality, readonly [number, number]>,
  rankPower: { 0: 0.52, 1: 0.68, 2: 0.84, 3: 1 } satisfies Record<ModRank, number>
} as const;

export interface RecalibrationRange {
  mode: 'multiply' | 'add';
  minimum: number;
  baseline: number;
  high: number;
}

/** Rank-3 beneficial contribution ranges. These are power budgets, not raw
 * global percentages: inverse stats are resolved in their beneficial direction. */
export const PLASMA_RECALIBRATION_STAT_RANGES: Partial<Record<ModStat, RecalibrationRange>> = {
  weaponDamage: { mode: 'multiply', minimum: .05, baseline: .18, high: .36 },
  weaponFireRate: { mode: 'multiply', minimum: .05, baseline: .18, high: .34 },
  weaponProjectileSpeed: { mode: 'multiply', minimum: .07, baseline: .26, high: .48 },
  weaponCritChance: { mode: 'add', minimum: .015, baseline: .07, high: .14 },
  weaponCritDamage: { mode: 'multiply', minimum: .08, baseline: .30, high: .62 },
  weaponHeatPerShot: { mode: 'multiply', minimum: .03, baseline: .15, high: .29 },
  weaponMaxHeat: { mode: 'multiply', minimum: .06, baseline: .25, high: .48 },
  weaponCooling: { mode: 'multiply', minimum: .07, baseline: .28, high: .58 },
  weaponEnergyCost: { mode: 'multiply', minimum: .03, baseline: .14, high: .28 },
  playerMaxHealth: { mode: 'multiply', minimum: .06, baseline: .22, high: .44 },
  playerEnergyMax: { mode: 'multiply', minimum: .07, baseline: .25, high: .50 },
  playerEnergyRegen: { mode: 'multiply', minimum: .07, baseline: .27, high: .56 },
  playerMoveSpeed: { mode: 'multiply', minimum: .03, baseline: .12, high: .24 },
  playerDashCooldown: { mode: 'multiply', minimum: .04, baseline: .16, high: .31 },
  playerDashDistance: { mode: 'multiply', minimum: .06, baseline: .22, high: .44 },
  playerPickupRadius: { mode: 'multiply', minimum: .10, baseline: .48, high: 1.05 },
  playerInvulnerability: { mode: 'multiply', minimum: .05, baseline: .20, high: .40 },
  gasDamageTaken: { mode: 'multiply', minimum: .06, baseline: .25, high: .48 },
  fenceDamage: { mode: 'multiply', minimum: .06, baseline: .25, high: .52 },
  fenceHealth: { mode: 'multiply', minimum: .07, baseline: .30, high: .62 },
  fenceDuration: { mode: 'multiply', minimum: .06, baseline: .24, high: .50 },
  fenceMaxActive: { mode: 'add', minimum: .25, baseline: 1, high: 2.20 },
  fenceCooldown: { mode: 'multiply', minimum: .04, baseline: .16, high: .31 },
  fenceEnergyCost: { mode: 'multiply', minimum: .03, baseline: .14, high: .28 },
  turretDamage: { mode: 'multiply', minimum: .06, baseline: .24, high: .50 },
  turretHealth: { mode: 'multiply', minimum: .07, baseline: .29, high: .60 },
  turretFireRate: { mode: 'multiply', minimum: .05, baseline: .20, high: .40 },
  turretRange: { mode: 'multiply', minimum: .05, baseline: .19, high: .38 },
  turretMaxActive: { mode: 'add', minimum: .25, baseline: 1, high: 2.20 },
  turretCooldown: { mode: 'multiply', minimum: .04, baseline: .16, high: .31 },
  turretEnergyCost: { mode: 'multiply', minimum: .03, baseline: .14, high: .28 },
  mineDamage: { mode: 'multiply', minimum: .07, baseline: .29, high: .62 },
  mineRadius: { mode: 'multiply', minimum: .05, baseline: .20, high: .42 },
  mineArmTime: { mode: 'multiply', minimum: .05, baseline: .20, high: .38 },
  mineMaxActive: { mode: 'add', minimum: .25, baseline: 1, high: 2.20 },
  mineCooldown: { mode: 'multiply', minimum: .04, baseline: .16, high: .31 },
  mineEnergyCost: { mode: 'multiply', minimum: .03, baseline: .14, high: .28 },
  shieldDuration: { mode: 'multiply', minimum: .06, baseline: .24, high: .50 },
  shieldCooldown: { mode: 'multiply', minimum: .04, baseline: .16, high: .31 },
  shieldEnergyCost: { mode: 'multiply', minimum: .03, baseline: .14, high: .28 },
  healthPickupValue: { mode: 'multiply', minimum: .07, baseline: .28, high: .56 },
  energyPickupValue: { mode: 'multiply', minimum: .07, baseline: .28, high: .56 },
  buffDuration: { mode: 'multiply', minimum: .06, baseline: .25, high: .52 },
  creditValue: { mode: 'multiply', minimum: .05, baseline: .22, high: .46 },
  enemyPickupChance: { mode: 'multiply', minimum: .08, baseline: .34, high: .72 },
  bombDuration: { mode: 'multiply', minimum: .04, baseline: .15, high: .29 }
};

/** Every entry in this registry is consumed by ModRuntime and therefore has a
 * real gameplay effect. Recalibration intentionally uses the full matrix so a
 * movement card can discover weapon, mine, defense, pickup, or economy stats. */
export const PLASMA_RECALIBRATION_STAT_POOL = Object.freeze(
  Object.keys(PLASMA_RECALIBRATION_STAT_RANGES) as ModStat[]
);

const SPECIAL_SLOT_IDS = new Set(['split-current']);
const PROTECTED_CORRUPTED_SLOTS: Readonly<Record<string, readonly number[]>> = {
  'ruptured-heat-sink': [1],
  'glass-cannon': [1],
  'volatile-reactor': [2],
  'black-star-engine': [3, 4]
};

export interface RecalibrationSlot {
  slotIndex: number;
  nativeStat: ModStat | null;
  label: string;
  protected: boolean;
}

export interface PlasmaRecalibrationCandidate {
  stat: ModStat;
  mode: 'multiply' | 'add';
  quality: PlasmaRecalibrationQuality;
  normalizedPower: number;
}

export interface PlasmaRecalibrationRollResult {
  ok: boolean;
  message: string;
  candidate?: PlasmaRecalibrationCandidate;
}

type CalibrationCarrier = Pick<ModCardInstance, 'calibrations'>;

const statLabel = (stat: ModStat): string => stat.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase();

export const getRecalibrationSlots = (definition: ModDefinition): RecalibrationSlot[] => {
  if (SPECIAL_SLOT_IDS.has(definition.id)) {
    return [{ slotIndex: 0, nativeStat: null, label: 'ARC DAMAGE // ARC RANGE', protected: false }];
  }
  const protectedSlots = new Set(PROTECTED_CORRUPTED_SLOTS[definition.id] ?? []);
  return (definition.modifiers ?? []).map((modifier, slotIndex) => ({
    slotIndex,
    nativeStat: modifier.stat,
    label: statLabel(modifier.stat),
    protected: protectedSlots.has(slotIndex)
  }));
};

export const getActiveCalibration = (card: CalibrationCarrier | undefined, slotIndex: number): ModStatCalibration | undefined =>
  card?.calibrations?.find((entry) => entry.slotIndex === slotIndex);

const activeStatAtSlot = (card: CalibrationCarrier | undefined, slot: RecalibrationSlot): ModStat | null =>
  getActiveCalibration(card, slot.slotIndex)?.stat ?? slot.nativeStat;

/** A rolled stat may replace any open slot unless that would leave the card
 * with the same stat in two slots. A same-stat overclock is valid on the slot
 * that already owns that stat. */
export const getApplicableRecalibrationSlots = (
  definition: ModDefinition,
  card: CalibrationCarrier | undefined,
  stat: ModStat
): RecalibrationSlot[] => {
  const slots = getRecalibrationSlots(definition);
  return slots.filter((slot) => {
    if (slot.protected) return false;
    return !slots.some((other) => other.slotIndex !== slot.slotIndex && activeStatAtSlot(card, other) === stat);
  });
};

export const getRecalibrationCandidatePool = (definition: ModDefinition, card?: CalibrationCarrier): ModStat[] => {
  const slots = getRecalibrationSlots(definition).filter((slot) => !slot.protected);
  if (!slots.length) return [];
  return PLASMA_RECALIBRATION_STAT_POOL.filter((stat) => getApplicableRecalibrationSlots(definition, card, stat).length > 0);
};

const rollQuality = (random: () => number): PlasmaRecalibrationQuality => {
  const roll = Math.max(0, Math.min(.999999999, random()));
  let cursor = 0;
  for (const quality of ['optimal', 'enhanced', 'stable', 'degraded', 'misaligned'] as const) {
    cursor += PLASMA_RECALIBRATION_BALANCE.qualityWeights[quality];
    if (roll < cursor) return quality;
  }
  return 'misaligned';
};

export const rollPlasmaRecalibrationCandidate = (
  definition: ModDefinition,
  card: ModCardInstance,
  random: () => number = Math.random
): PlasmaRecalibrationRollResult => {
  const pool = getRecalibrationCandidatePool(definition, card);
  if (!pool.length) return { ok: false, message: 'NO SAFE RECALIBRATION ATTRIBUTES AVAILABLE' };
  const stat = pool[Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length))];
  const range = PLASMA_RECALIBRATION_STAT_RANGES[stat];
  if (!range) return { ok: false, message: 'ATTRIBUTE RANGE UNAVAILABLE' };
  const quality = rollQuality(random);
  const [minimum, maximum] = PLASMA_RECALIBRATION_BALANCE.qualityRanges[quality];
  const normalizedPower = Math.max(0, Math.min(1, minimum + (maximum - minimum) * Math.max(0, Math.min(1, random()))));
  return { ok: true, message: `${quality.toUpperCase()} CALIBRATION GENERATED`, candidate: { stat, mode: range.mode, quality, normalizedPower } };
};

const contributionAtPower = (range: RecalibrationRange, normalizedPower: number): number => {
  const power = Math.max(0, Math.min(1, normalizedPower));
  if (power <= .55) return range.minimum + (range.baseline - range.minimum) * power / .55;
  return range.baseline + (range.high - range.baseline) * (power - .55) / .45;
};

const nativeContribution = (modifier: ModStatModifier): number => {
  const value = modifier.values[3];
  if (modifier.mode === 'add') return Math.max(0, value);
  return LOWER_IS_BETTER_MOD_STATS.has(modifier.stat) ? Math.max(0, 1 - value) : Math.max(0, value - 1);
};

const nativeCeilingCache = new Map<ModStat, number>();

/** The top of a stat's roll range follows the actual Mod registry. This keeps
 * future Mods in the recalibration economy automatically and gives only the
 * highest part of an Optimal roll a chance to beat the best standard native
 * version of that stat. Corrupted tradeoffs do not raise this ceiling. */
export const getRecalibrationStatRange = (stat: ModStat): RecalibrationRange | null => {
  const configured = PLASMA_RECALIBRATION_STAT_RANGES[stat];
  if (!configured) return null;
  let nativeCeiling = nativeCeilingCache.get(stat);
  if (nativeCeiling === undefined) {
    nativeCeiling = 0;
    for (const definition of MOD_BY_ID.values()) {
      if (definition.variant === 'corrupted' || definition.rarity === 'supreme') continue;
      for (const modifier of definition.modifiers ?? []) {
        if (modifier.stat !== stat || modifier.mode !== configured.mode) continue;
        nativeCeiling = Math.max(nativeCeiling, nativeContribution(modifier));
      }
    }
    nativeCeilingCache.set(stat, nativeCeiling);
  }
  return {
    ...configured,
    high: Math.max(configured.high, nativeCeiling * PLASMA_RECALIBRATION_BALANCE.nativeOverclockCeiling)
  };
};

export const resolveCalibrationModifier = (calibration: Pick<ModStatCalibration, 'stat' | 'mode' | 'normalizedPower'>): ModStatModifier | null => {
  const range = getRecalibrationStatRange(calibration.stat);
  if (!range || range.mode !== calibration.mode) return null;
  const values = {} as Record<ModRank, number>;
  for (const rank of [0, 1, 2, 3] as const) {
    const benefit = contributionAtPower(range, calibration.normalizedPower) * PLASMA_RECALIBRATION_BALANCE.rankPower[rank];
    values[rank] = calibration.mode === 'add'
      ? benefit
      : LOWER_IS_BETTER_MOD_STATS.has(calibration.stat) ? Math.max(.05, 1 - benefit) : 1 + benefit;
  }
  return { stat: calibration.stat, mode: calibration.mode, values };
};

export const getEffectiveModModifiers = (definition: ModDefinition, card?: CalibrationCarrier): ModStatModifier[] => {
  const output: ModStatModifier[] = [];
  (definition.modifiers ?? []).forEach((native, slotIndex) => {
    const calibration = getActiveCalibration(card, slotIndex);
    output.push(calibration ? resolveCalibrationModifier(calibration) ?? native : native);
  });
  if (SPECIAL_SLOT_IDS.has(definition.id)) {
    const calibration = getActiveCalibration(card, 0);
    const resolved = calibration ? resolveCalibrationModifier(calibration) : null;
    if (resolved) output.push(resolved);
  }
  return output;
};

export const isNativeModSlotActive = (card: CalibrationCarrier | undefined, slotIndex: number): boolean => !getActiveCalibration(card, slotIndex);

export const describeRecalibrationSlot = (definition: ModDefinition, card: ModCardInstance, slot: RecalibrationSlot, rank: ModRank): string => {
  const calibration = getActiveCalibration(card, slot.slotIndex);
  if (calibration) {
    const modifier = resolveCalibrationModifier(calibration);
    return modifier ? `${formatCalibrationModifier(modifier, rank)} ${statLabel(modifier.stat)} // PLASMA CALIBRATED` : 'CALIBRATION DATA INVALID';
  }
  if (definition.id === 'split-current') {
    return `${Math.round(MOD_BALANCE.splitCurrent.damageShare[rank] * 100)}% ARC DAMAGE // ${MOD_BALANCE.splitCurrent.radius[rank]} RANGE`;
  }
  const modifier = definition.modifiers?.[slot.slotIndex];
  return modifier ? `${formatCalibrationModifier(modifier, rank)} ${statLabel(modifier.stat)} // NATIVE` : slot.label;
};

export const formatCalibrationModifier = (modifier: ModStatModifier, rank: ModRank): string => {
  const value = modifier.values[rank];
  if (modifier.mode === 'add') return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1).replace(/\.0$/, '')} PTS`;
  const percent = (value - 1) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1).replace(/\.0$/, '')}%`;
};

export const applyPlasmaRecalibration = (
  card: ModCardInstance,
  definition: ModDefinition,
  slotIndex: number,
  candidate: PlasmaRecalibrationCandidate,
  calibratedAt = new Date().toISOString()
): { ok: boolean; message: string } => {
  const slot = getRecalibrationSlots(definition).find((entry) => entry.slotIndex === slotIndex && !entry.protected);
  if (!slot) return { ok: false, message: 'SELECTED STAT SLOT IS PROTECTED' };
  if (!getRecalibrationCandidatePool(definition, card).includes(candidate.stat)) return { ok: false, message: 'CALIBRATION ATTRIBUTE CONFLICT' };
  if (!getApplicableRecalibrationSlots(definition, card, candidate.stat).some((entry) => entry.slotIndex === slotIndex)) {
    return { ok: false, message: 'STAT ALREADY ACTIVE // SELECT ITS CURRENT SLOT' };
  }
  const range = PLASMA_RECALIBRATION_STAT_RANGES[candidate.stat];
  if (!range || range.mode !== candidate.mode) return { ok: false, message: 'CALIBRATION ATTRIBUTE INVALID' };
  const replacement: ModStatCalibration = {
    slotIndex,
    stat: candidate.stat,
    mode: candidate.mode,
    quality: candidate.quality,
    normalizedPower: Math.max(0, Math.min(1, candidate.normalizedPower)),
    calibratedAt
  };
  card.calibrations = [...(card.calibrations ?? []).filter((entry) => entry.slotIndex !== slotIndex), replacement]
    .sort((a, b) => a.slotIndex - b.slotIndex);
  return { ok: true, message: `STAT ${slotIndex + 1} REPLACED // ${statLabel(candidate.stat)}` };
};

export const findRecalibrationCard = (cards: readonly ModCardInstance[], instanceId: string): { card: ModCardInstance; definition: ModDefinition } | null => {
  const card = cards.find((entry) => entry.instanceId === instanceId);
  const definition = card ? MOD_BY_ID.get(card.modId) : undefined;
  return card && definition ? { card, definition } : null;
};
