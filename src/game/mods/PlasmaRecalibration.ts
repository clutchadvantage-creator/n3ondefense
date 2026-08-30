import { MOD_BY_ID } from './definitions.ts';
import { MOD_BALANCE } from './modBalance.ts';
import { LOWER_IS_BETTER_MOD_STATS, type ModCardInstance, type ModDefinition, type ModRank, type ModStat, type ModStatCalibration, type ModStatModifier, type PlasmaRecalibrationQuality } from './types.ts';

export const PLASMA_RECALIBRATION_BALANCE = {
  rollCost: 125,
  revealDurationMs: 1050,
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

interface RecalibrationRange {
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
  fenceCooldown: { mode: 'multiply', minimum: .04, baseline: .16, high: .31 },
  fenceEnergyCost: { mode: 'multiply', minimum: .03, baseline: .14, high: .28 },
  turretDamage: { mode: 'multiply', minimum: .06, baseline: .24, high: .50 },
  turretHealth: { mode: 'multiply', minimum: .07, baseline: .29, high: .60 },
  turretFireRate: { mode: 'multiply', minimum: .05, baseline: .20, high: .40 },
  turretRange: { mode: 'multiply', minimum: .05, baseline: .19, high: .38 },
  turretCooldown: { mode: 'multiply', minimum: .04, baseline: .16, high: .31 },
  turretEnergyCost: { mode: 'multiply', minimum: .03, baseline: .14, high: .28 },
  mineDamage: { mode: 'multiply', minimum: .07, baseline: .29, high: .62 },
  mineRadius: { mode: 'multiply', minimum: .05, baseline: .20, high: .42 },
  mineArmTime: { mode: 'multiply', minimum: .05, baseline: .20, high: .38 },
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

const STAT_POOLS = {
  weapon: ['weaponDamage', 'weaponFireRate', 'weaponProjectileSpeed', 'weaponCritChance', 'weaponCritDamage', 'weaponHeatPerShot', 'weaponMaxHeat', 'weaponCooling', 'weaponEnergyCost'],
  player: ['playerMaxHealth', 'playerEnergyMax', 'playerEnergyRegen', 'playerMoveSpeed', 'playerDashCooldown', 'playerDashDistance', 'playerPickupRadius', 'playerInvulnerability', 'gasDamageTaken'],
  fence: ['fenceDamage', 'fenceHealth', 'fenceDuration', 'fenceCooldown', 'fenceEnergyCost'],
  turret: ['turretDamage', 'turretHealth', 'turretFireRate', 'turretRange', 'turretCooldown', 'turretEnergyCost'],
  mine: ['mineDamage', 'mineRadius', 'mineArmTime', 'mineCooldown', 'mineEnergyCost'],
  shield: ['shieldDuration', 'shieldCooldown', 'shieldEnergyCost'],
  pickup: ['healthPickupValue', 'energyPickupValue', 'buffDuration', 'playerPickupRadius', 'enemyPickupChance', 'creditValue'],
  bomb: ['bombDuration']
} satisfies Record<string, readonly ModStat[]>;

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

const poolForStat = (stat: ModStat): readonly ModStat[] => {
  if (stat.startsWith('weapon')) return STAT_POOLS.weapon;
  if (stat.startsWith('player') || stat === 'gasDamageTaken') return STAT_POOLS.player;
  if (stat.startsWith('fence')) return STAT_POOLS.fence;
  if (stat.startsWith('turret')) return STAT_POOLS.turret;
  if (stat.startsWith('mine')) return STAT_POOLS.mine;
  if (stat.startsWith('shield')) return STAT_POOLS.shield;
  if (stat === 'bombDuration') return STAT_POOLS.bomb;
  return STAT_POOLS.pickup;
};

export const getRecalibrationCandidatePool = (definition: ModDefinition, card?: CalibrationCarrier): ModStat[] => {
  const slots = getRecalibrationSlots(definition).filter((slot) => !slot.protected);
  if (!slots.length) return [];
  const candidates = new Set<ModStat>();
  if (definition.id === 'split-current') for (const stat of STAT_POOLS.weapon) candidates.add(stat);
  for (const slot of slots) {
    const current = getActiveCalibration(card, slot.slotIndex)?.stat ?? slot.nativeStat;
    if (current) for (const stat of poolForStat(current)) candidates.add(stat);
  }
  const active = new Set<ModStat>();
  (definition.modifiers ?? []).forEach((modifier, slotIndex) => active.add(getActiveCalibration(card, slotIndex)?.stat ?? modifier.stat));
  if (definition.id === 'split-current') {
    const calibrated = getActiveCalibration(card, 0)?.stat;
    if (calibrated) active.add(calibrated);
  }
  return [...candidates].filter((stat) => PLASMA_RECALIBRATION_STAT_RANGES[stat] && !active.has(stat));
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

export const resolveCalibrationModifier = (calibration: Pick<ModStatCalibration, 'stat' | 'mode' | 'normalizedPower'>): ModStatModifier | null => {
  const range = PLASMA_RECALIBRATION_STAT_RANGES[calibration.stat];
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
