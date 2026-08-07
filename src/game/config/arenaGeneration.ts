import type { ArenaTemplate } from '../types.ts';

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
  navigationCellSize: 40,
  fingerprintGridSize: 12,
  recentFingerprintCount: 5,
  archetypeCooldownRounds: 5,
  similarityThreshold: 0.82,
  maximumAttemptsPerArchetype: 14,
  minimumCorridorWidth: 110,
  objectiveClearance: 92,
  spawnClearance: 54
} as const;
