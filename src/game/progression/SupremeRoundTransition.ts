import { RUN_PROTOCOLS } from '../mods/modBalance.ts';
import type { RunProtocolId } from '../mods/types.ts';

export const REGULAR_OVERDRIVE_TERMINAL_ROUND = 50;
export const FIRST_SUPREME_PROTOCOL: RunProtocolId = 'supreme-leo';

export type SupremeMilestoneKind =
  | 'first-supreme'
  | 'overdrive-unlocked'
  | 'overdrive-unlocked-first-supreme';

export interface SupremePostRoundRequest {
  protocol: RunProtocolId;
  completedRound: number;
  firstSupremeAwarded: boolean;
  firstSupremeTutorialSeen: boolean;
  regularOverdriveCompleted: boolean;
}

export interface SupremePostRoundPlan {
  completesRegularOverdrive: boolean;
  newlyUnlocksSupremeOverdrive: boolean;
  nextProtocol: RunProtocolId;
  milestone: SupremeMilestoneKind | null;
}

export const isRegularOverdriveTerminalCompletion = (
  protocol: RunProtocolId,
  completedRound: number
): boolean => RUN_PROTOCOLS[protocol].family === 'overdrive'
  && completedRound === REGULAR_OVERDRIVE_TERMINAL_ROUND;

/**
 * Pure decision point for the R48-50 bridge. Reward ownership and progression
 * are committed before this plan is presented; UI dismissal never owns data.
 */
export const resolveSupremePostRoundPlan = (
  request: SupremePostRoundRequest
): SupremePostRoundPlan => {
  const completesRegularOverdrive = isRegularOverdriveTerminalCompletion(
    request.protocol,
    request.completedRound
  );
  const newlyUnlocksSupremeOverdrive = completesRegularOverdrive
    && !request.regularOverdriveCompleted;
  const needsFirstSupremeInformation = request.firstSupremeAwarded
    && !request.firstSupremeTutorialSeen;

  let milestone: SupremeMilestoneKind | null = null;
  if (newlyUnlocksSupremeOverdrive && needsFirstSupremeInformation) {
    milestone = 'overdrive-unlocked-first-supreme';
  } else if (newlyUnlocksSupremeOverdrive) {
    milestone = 'overdrive-unlocked';
  } else if (needsFirstSupremeInformation) {
    milestone = 'first-supreme';
  }

  return {
    completesRegularOverdrive,
    newlyUnlocksSupremeOverdrive,
    nextProtocol: completesRegularOverdrive ? FIRST_SUPREME_PROTOCOL : request.protocol,
    milestone
  };
};
