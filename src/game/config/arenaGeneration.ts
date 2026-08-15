import { ENEMY_BALANCE } from './balance/index.ts';
import type { ArenaTemplate } from '../types.ts';

const ENEMY_NAVIGATION_BODY_SCALE = 0.86;
const ENEMY_NAVIGATION_PADDING = 22;
const LARGEST_ENEMY_BODY_DIAMETER = Math.max(
  ...Object.values(ENEMY_BALANCE).map((enemy) => enemy.size * ENEMY_NAVIGATION_BODY_SCALE)
);
const GROUP_MOVEMENT_LANES = 2;
const GROUP_MOVEMENT_SPACING = 20;
const NAVIGATION_CELL_SIZE = 32;
const MINIMUM_IMPORTANT_PASSAGE_WIDTH = Math.ceil(
  LARGEST_ENEMY_BODY_DIAMETER * GROUP_MOVEMENT_LANES
  + ENEMY_NAVIGATION_PADDING * 2
  + GROUP_MOVEMENT_SPACING
);

export const ARENA_ARCHETYPES: ArenaTemplate[] = [
  'open-field', 'islands', 'fortress', 'ring', 'split', 'hub-spoke',
  'canyon', 'maze', 'chambers', 'asymmetric-clusters', 'crossroads', 'perimeter'
];

export const ARENA_GENERATION_CONFIG = {
  minWidth: 1600,
  maxWidth: 2340,
  minHeight: 1040,
  maxHeight: 1540,
  boundaryThickness: 30,
  navigationCellSize: NAVIGATION_CELL_SIZE,
  enemyNavigationPadding: ENEMY_NAVIGATION_PADDING,
  fingerprintGridSize: 12,
  recentFingerprintCount: 5,
  archetypeCooldownRounds: 5,
  similarityThreshold: 0.82,
  maximumAttemptsPerArchetype: 14,
  largestEnemyBodyDiameter: LARGEST_ENEMY_BODY_DIAMETER,
  groupMovementLanes: GROUP_MOVEMENT_LANES,
  minimumCorridorWidth: MINIMUM_IMPORTANT_PASSAGE_WIDTH,
  objectiveClearance: 92,
  spawnClearance: 54
} as const;
