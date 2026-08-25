import type { ModeBalanceDefinition } from '../config/modeBalance.ts';
import type { RunProtocolId } from '../mods/types.ts';

export interface ConstellationPoint {
  x: number;
  y: number;
  major?: boolean;
}

export interface ConstellationDefinition {
  key: string;
  points: readonly ConstellationPoint[];
  connections: readonly (readonly [number, number])[];
}

export interface SupremeStageDefinition {
  protocolId: Extract<RunProtocolId, `supreme-${string}`>;
  level: number;
  constellation: string;
  constellationKey: string;
  /** First tier requires the regular Overdrive clear; later tiers use Supreme progress. */
  unlockSource: 'regular-overdrive' | 'supreme';
  unlockRound: number;
  difficulty: ModeBalanceDefinition;
  rewardMultiplier: number;
  supremeModWeightMultiplier: number;
  terminalEncounter?: boolean;
}

const line = (points: readonly ConstellationPoint[]): readonly (readonly [number, number])[] =>
  points.slice(1).map((_, index) => [index, index + 1] as const);

// Normalized, deliberately low-detail floor projections. Each is constructed
// once per arena; animation only changes alpha and one traveling light.
export const SUPREME_CONSTELLATIONS: Readonly<Record<string, ConstellationDefinition>> = Object.freeze({
  leo: { key: 'leo', points: [{ x: .1, y: .55, major: true }, { x: .23, y: .34 }, { x: .4, y: .25, major: true }, { x: .54, y: .4 }, { x: .7, y: .35 }, { x: .86, y: .52, major: true }, { x: .67, y: .68 }, { x: .43, y: .64 }], connections: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,3]] },
  gemini: { key: 'gemini', points: [{ x: .25, y: .16, major: true }, { x: .25, y: .4 }, { x: .18, y: .68 }, { x: .42, y: .82 }, { x: .7, y: .16, major: true }, { x: .67, y: .42 }, { x: .79, y: .7 }, { x: .55, y: .82 }], connections: [[0,1],[1,2],[1,3],[4,5],[5,6],[5,7],[1,5]] },
  cassiopeia: { key: 'cassiopeia', points: [{ x: .1, y: .4, major: true }, { x: .3, y: .65 }, { x: .5, y: .3, major: true }, { x: .7, y: .67 }, { x: .9, y: .38, major: true }], connections: [[0,1],[1,2],[2,3],[3,4]] },
  aquila: { key: 'aquila', points: [{ x: .5, y: .08, major: true }, { x: .5, y: .32 }, { x: .15, y: .48 }, { x: .5, y: .5, major: true }, { x: .86, y: .44 }, { x: .5, y: .72 }, { x: .38, y: .9 }, { x: .62, y: .9 }], connections: [[0,1],[1,2],[1,3],[1,4],[3,5],[5,6],[5,7]] },
  'ursa-major': { key: 'ursa-major', points: [{ x: .08, y: .32 }, { x: .25, y: .46 }, { x: .42, y: .42 }, { x: .55, y: .57, major: true }, { x: .72, y: .52 }, { x: .88, y: .62 }, { x: .78, y: .82 }], connections: line([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}]) },
  scorpius: { key: 'scorpius', points: [{ x: .18, y: .18 }, { x: .3, y: .3 }, { x: .42, y: .43, major: true }, { x: .5, y: .62 }, { x: .64, y: .76 }, { x: .8, y: .65 }, { x: .86, y: .48 }, { x: .75, y: .4 }], connections: line([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}]) },
  taurus: { key: 'taurus', points: [{ x: .12, y: .25 }, { x: .4, y: .47, major: true }, { x: .5, y: .66 }, { x: .61, y: .47, major: true }, { x: .88, y: .22 }, { x: .5, y: .82 }], connections: [[0,1],[1,2],[2,3],[3,4],[2,5]] },
  virgo: { key: 'virgo', points: [{ x: .08, y: .3 }, { x: .27, y: .45 }, { x: .45, y: .38 }, { x: .58, y: .58, major: true }, { x: .76, y: .48 }, { x: .9, y: .65 }, { x: .57, y: .84 }], connections: [[0,1],[1,2],[2,3],[3,4],[4,5],[3,6]] },
  capricornus: { key: 'capricornus', points: [{ x: .14, y: .38 }, { x: .34, y: .22 }, { x: .66, y: .26, major: true }, { x: .86, y: .5 }, { x: .62, y: .76 }, { x: .32, y: .7 }], connections: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[2,5]] },
  delphinus: { key: 'delphinus', points: [{ x: .5, y: .12, major: true }, { x: .28, y: .38 }, { x: .47, y: .58 }, { x: .7, y: .4 }, { x: .5, y: .12 }, { x: .52, y: .84, major: true }], connections: line([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}]) },
  centaurus: { key: 'centaurus', points: [{ x: .12, y: .22 }, { x: .3, y: .38 }, { x: .5, y: .34, major: true }, { x: .67, y: .18 }, { x: .61, y: .58 }, { x: .82, y: .74, major: true }, { x: .42, y: .82 }, { x: .22, y: .68 }], connections: [[0,1],[1,2],[2,3],[2,4],[4,5],[4,6],[6,7],[7,1]] }
});

const makeDifficulty = (index: number): ModeBalanceDefinition => ({
  enemyHealthMultiplier: 1.35 + index * 0.08,
  enemyDamageMultiplier: 1.22 + index * 0.046,
  enemySpeedMultiplier: 1.04 + index * 0.01,
  hazardDamageMultiplier: 1.25 + index * 0.05,
  enemyDefuseTimeMultiplier: 0.90 - index * 0.018,
  spawnCadenceMultiplier: 0.90 - index * 0.018,
  // Deliberately modest: cadence and elite weighting create most of the
  // pressure while this bounded cap increase preserves late-game performance.
  activePressureMultiplier: 1.06 + index * 0.02,
  elitePressureMultiplier: 1.15 + index * 0.06,
  bossHealthMultiplier: 1.40 + index * 0.095,
  bossDamageMultiplier: 1.22 + index * 0.05,
  pickupStackLimit: 2,
  resourcePickupCapMultiplier: 2,
  overhealthEnabled: true,
  overchargeEnabled: true,
  modDropChanceMultiplier: 1.48 + index * 0.052,
  highRarityWeightMultiplier: 1.2 + index * 0.035,
  legendaryWeightMultiplier: 1.9 + index * 0.11,
  scoreMultiplier: 1.55 + index * 0.075,
  usesUnlockedStartingRounds: true
});

const stageData = [
  ['supreme-leo', 51, 'LEO', 50],
  ['supreme-gemini', 55, 'GEMINI', 58],
  ['supreme-cassiopeia', 60, 'CASSIOPEIA', 68],
  ['supreme-aquila', 65, 'AQUILA', 78],
  ['supreme-ursa-major', 70, 'URSA MAJOR', 88],
  ['supreme-scorpius', 75, 'SCORPIUS', 98],
  ['supreme-taurus', 80, 'TAURUS', 108],
  ['supreme-virgo', 85, 'VIRGO', 118],
  ['supreme-capricornus', 90, 'CAPRICORNUS', 128],
  ['supreme-delphinus', 95, 'DELPHINUS', 138],
  ['supreme-centaurus', 100, 'CENTAURUS', 148]
] as const;

export const SUPREME_STAGE_DEFINITIONS: readonly SupremeStageDefinition[] = Object.freeze(stageData.map(
  ([protocolId, level, constellation, unlockRound], index) => ({
    protocolId,
    level,
    constellation,
    constellationKey: protocolId.slice('supreme-'.length),
    unlockSource: index === 0 ? 'global' as const : 'supreme' as const,
    unlockRound,
    difficulty: makeDifficulty(index),
    rewardMultiplier: 1.35 + index * 0.075,
    supremeModWeightMultiplier: 0.22 + index * 0.178,
    terminalEncounter: level === 100
  })
));

export const SUPREME_STAGE_BY_PROTOCOL = new Map(SUPREME_STAGE_DEFINITIONS.map((stage) => [stage.protocolId, stage]));
export const SUPREME_PROTOCOL_IDS = SUPREME_STAGE_DEFINITIONS.map((stage) => stage.protocolId);

export interface SupremeProgressSnapshot {
  highestRound: number;
  supremeHighestRound: number;
  regularOverdriveCompleted?: boolean;
  supremeOverdriveCompleted?: boolean;
}

export const isSupremeProtocol = (protocol: RunProtocolId | string | undefined): protocol is SupremeStageDefinition['protocolId'] =>
  typeof protocol === 'string' && SUPREME_STAGE_BY_PROTOCOL.has(protocol as SupremeStageDefinition['protocolId']);

export const getSupremeStage = (protocol: RunProtocolId | string | undefined): SupremeStageDefinition | null =>
  isSupremeProtocol(protocol) ? SUPREME_STAGE_BY_PROTOCOL.get(protocol) ?? null : null;

export const isSupremeStageUnlocked = (stage: SupremeStageDefinition, progress: SupremeProgressSnapshot): boolean =>
  stage.unlockSource === 'regular-overdrive'
    ? progress.regularOverdriveCompleted === true
    : progress.supremeHighestRound >= stage.unlockRound;

export const isSupremeTerminalRound = (protocol: RunProtocolId, completedRound: number): boolean =>
  getSupremeStage(protocol)?.terminalEncounter === true && completedRound === 100;
