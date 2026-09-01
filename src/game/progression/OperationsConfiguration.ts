import type { RunModeFamily } from '../config/modeBalance.ts';
import { RUN_PROTOCOL_IDS, RUN_PROTOCOLS, isRunProtocolUnlocked } from '../mods/modBalance.ts';
import type { ProtocolPreference, RunProtocolId } from '../mods/types.ts';
import type { SupremeProgressSnapshot } from './SupremeProgression.ts';

export const NORMAL_CHECKPOINT_INTERVAL = 5;

export interface OperationsProgressSnapshot extends SupremeProgressSnapshot {
  normalHighestRound: number;
}

export interface ResolvedOperationsConfiguration {
  mode: RunModeFamily;
  protocol: RunProtocolId;
  startingRound: number;
}

export interface OperationsModeStatus {
  mode: RunModeFamily;
  label: string;
  unlocked: boolean;
  unlockRequirement: string | null;
}

export interface OperationsCheckpointOption {
  mode: RunModeFamily;
  protocol: RunProtocolId;
  startingRound: number;
  label: string;
  unlocked: boolean;
  selected: boolean;
  unlockRequirement: string | null;
}

export interface OperationsSelectionResult {
  ok: boolean;
  message: string;
  preference?: ProtocolPreference;
}

const integer = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;

export const getHighestUnlockedNormalCheckpoint = (normalHighestRound: number): number => {
  const highest = integer(normalHighestRound);
  return highest < NORMAL_CHECKPOINT_INTERVAL
    ? 1
    : Math.floor(highest / NORMAL_CHECKPOINT_INTERVAL) * NORMAL_CHECKPOINT_INTERVAL;
};

/** The start a pre-Operations save would have used before five-round replay
 * checkpoints were introduced. Used only as a lossless migration default. */
export const getLegacyNormalStartRound = (normalHighestRound: number): number => {
  const highest = integer(normalHighestRound);
  return highest < 10 ? 1 : Math.floor(highest / 10) * 10;
};

export const getUnlockedNormalStartRounds = (normalHighestRound: number): number[] => {
  const highestCheckpoint = getHighestUnlockedNormalCheckpoint(normalHighestRound);
  if (highestCheckpoint === 1) return [1];
  const checkpoints = [1];
  for (let round = NORMAL_CHECKPOINT_INTERVAL; round <= highestCheckpoint; round += NORMAL_CHECKPOINT_INTERVAL) {
    checkpoints.push(round);
  }
  return checkpoints;
};

export const isNormalStartRoundUnlocked = (startingRound: number, normalHighestRound: number): boolean =>
  getUnlockedNormalStartRounds(normalHighestRound).includes(integer(startingRound));

export const normalizeSelectedNormalStartRound = (
  selected: unknown,
  normalHighestRound: number,
  fallback = getHighestUnlockedNormalCheckpoint(normalHighestRound)
): number => {
  const available = getUnlockedNormalStartRounds(normalHighestRound);
  const requested = integer(selected, fallback);
  if (available.includes(requested)) return requested;
  const lower = available.filter((round) => round <= requested).at(-1);
  return lower ?? available[0] ?? 1;
};

export const formatOperationsMode = (mode: RunModeFamily): string =>
  mode === 'normal' ? 'NORMAL' : mode === 'overdrive' ? 'OVERDRIVE' : 'SUPREME OVERDRIVE';

const firstProtocolForMode = (mode: RunModeFamily): RunProtocolId =>
  mode === 'normal'
    ? 'normal'
    : RUN_PROTOCOL_IDS.find((id) => RUN_PROTOCOLS[id].family === mode) ?? 'normal';

const modeUnlockRequirement = (mode: RunModeFamily): string | null => {
  if (mode === 'normal') return null;
  const first = RUN_PROTOCOLS[firstProtocolForMode(mode)];
  return mode === 'supreme'
    ? 'CLEAR ROUND 50 IN REGULAR OVERDRIVE'
    : `REACH ROUND ${first.unlockHighestRound}`;
};

export const getOperationsModeStatuses = (progress: OperationsProgressSnapshot): OperationsModeStatus[] =>
  (['normal', 'overdrive', 'supreme'] as const).map((mode) => {
    const unlocked = mode === 'normal' || isRunProtocolUnlocked(firstProtocolForMode(mode), progress);
    return {
      mode,
      label: formatOperationsMode(mode),
      unlocked,
      unlockRequirement: unlocked ? null : modeUnlockRequirement(mode)
    };
  });

export const resolveOperationsConfiguration = (
  preference: ProtocolPreference,
  progress: OperationsProgressSnapshot
): ResolvedOperationsConfiguration => {
  const requested = RUN_PROTOCOLS[preference.preferred];
  const protocol = requested && isRunProtocolUnlocked(requested.id, progress) ? requested.id : 'normal';
  const definition = RUN_PROTOCOLS[protocol];
  return {
    mode: definition.family,
    protocol,
    startingRound: protocol === 'normal'
      ? normalizeSelectedNormalStartRound(preference.selectedNormalStartRound, progress.normalHighestRound)
      : definition.startingRound
  };
};

const checkpointUnlockRequirement = (protocol: RunProtocolId): string => {
  const definition = RUN_PROTOCOLS[protocol];
  if (definition.family === 'supreme') {
    return protocol === firstProtocolForMode('supreme')
      ? 'CLEAR ROUND 50 IN REGULAR OVERDRIVE'
      : `REACH SUPREME ROUND ${definition.unlockHighestRound}`;
  }
  return `REACH ROUND ${definition.unlockHighestRound}`;
};

export const getOperationsCheckpointOptions = (
  mode: RunModeFamily,
  preference: ProtocolPreference,
  progress: OperationsProgressSnapshot
): OperationsCheckpointOption[] => {
  const resolved = resolveOperationsConfiguration(preference, progress);
  if (mode === 'normal') {
    return getUnlockedNormalStartRounds(progress.normalHighestRound).map((startingRound) => ({
      mode,
      protocol: 'normal',
      startingRound,
      label: startingRound === 1 ? 'INITIAL DEPLOYMENT' : `CHECKPOINT ${startingRound}`,
      unlocked: true,
      selected: resolved.protocol === 'normal' && resolved.startingRound === startingRound,
      unlockRequirement: null
    }));
  }
  return RUN_PROTOCOL_IDS
    .map((protocol) => RUN_PROTOCOLS[protocol])
    .filter((definition) => definition.family === mode)
    .map((definition) => {
      const unlocked = isRunProtocolUnlocked(definition.id, progress);
      return {
        mode,
        protocol: definition.id,
        startingRound: definition.startingRound,
        label: definition.label.replace(/^OVERDRIVE |^SUPREME /, ''),
        unlocked,
        selected: resolved.protocol === definition.id,
        unlockRequirement: unlocked ? null : checkpointUnlockRequirement(definition.id)
      };
    });
};

export const selectOperationsCheckpoint = (
  current: ProtocolPreference,
  progress: OperationsProgressSnapshot,
  protocol: RunProtocolId,
  normalStartingRound?: number
): OperationsSelectionResult => {
  if (protocol === 'normal') {
    const requested = integer(normalStartingRound, 1);
    if (!isNormalStartRoundUnlocked(requested, progress.normalHighestRound)) {
      return { ok: false, message: `NORMAL CHECKPOINT ${requested} IS NOT UNLOCKED` };
    }
    return {
      ok: true,
      message: `NORMAL // START ROUND ${requested} SELECTED`,
      preference: { ...current, preferred: 'normal', selectedNormalStartRound: requested }
    };
  }
  const definition = RUN_PROTOCOLS[protocol];
  if (!definition || !isRunProtocolUnlocked(protocol, progress)) {
    return { ok: false, message: definition ? checkpointUnlockRequirement(protocol) : 'UNKNOWN OPERATIONS CHECKPOINT' };
  }
  return {
    ok: true,
    message: `${formatOperationsMode(definition.family)} // START ROUND ${definition.startingRound} SELECTED`,
    preference: { ...current, preferred: protocol }
  };
};
