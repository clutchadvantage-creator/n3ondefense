import type { ArenaGenerationMetadata, ArenaTemplate, RectSpec } from '../types.ts';
import { ARENA_GENERATION_CONFIG as CONFIG } from '../config/arenaGeneration.ts';

export type ArenaStructureClass = 'open' | 'structured' | 'dense';

export interface ArenaFingerprint extends ArenaGenerationMetadata {
  archetype: ArenaTemplate;
  hash: string;
  structureClass: ArenaStructureClass;
  bombDistribution: number[];
  spawnDistribution: number[];
  obstacleDensity: number;
  largeStructureCount: number;
  smallStructureCount: number;
}

export interface ArenaSimilarityAssessment {
  reject: boolean;
  exact: boolean;
  exactPrevious: boolean;
  openRepeat: boolean;
  score: number;
  previousScore: number;
  closestHistoryAge: number;
  threshold: number;
}

interface PointLike { x: number; y: number }

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const intersectionArea = (a: RectSpec, b: RectSpec): number => {
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return width * height;
};

const distribution = (points: PointLike[], bounds: RectSpec): number[] => {
  const size = 4;
  const result = new Array<number>(size * size).fill(0);
  for (const point of points) {
    const x = Math.max(0, Math.min(size - 1, Math.floor((point.x - bounds.x) / bounds.w * size)));
    const y = Math.max(0, Math.min(size - 1, Math.floor((point.y - bounds.y) / bounds.h * size)));
    result[y * size + x] += 1;
  }
  return result;
};

const normalizedVectorSimilarity = (a: number[], b: number[]): number => {
  const totalA = a.reduce((sum, value) => sum + value, 0) || 1;
  const totalB = b.reduce((sum, value) => sum + value, 0) || 1;
  let difference = 0;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference += Math.abs((a[index] ?? 0) / totalA - (b[index] ?? 0) / totalB);
  }
  return clamp01(1 - difference / 2);
};

const cosineSimilarity = (a: number[], b: number[]): number => {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    dot += a[index] * b[index];
    aa += a[index] * a[index];
    bb += b[index] * b[index];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
};

const occupancySimilarity = (a: number[], b: number[]): number => {
  let intersection = 0;
  let union = 0;
  let difference = 0;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    intersection += Math.min(av, bv);
    union += Math.max(av, bv);
    difference += Math.abs(av - bv);
  }
  const jaccard = union > 0 ? intersection / union : 1;
  const averageDifference = 1 - difference / Math.max(1, a.length);
  return clamp01(jaccard * 0.68 + averageDifference * 0.32);
};

const countSimilarity = (a: number, b: number, scale: number): number =>
  1 - Math.min(1, Math.abs(a - b) / scale);

const hashText = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const structuralHash = (
  bounds: RectSpec,
  occupancy: number[],
  bombs: number[],
  spawns: number[],
  major: number,
  chokes: number,
  regions: number
): string => hashText([
  Math.round(bounds.w / 40), Math.round(bounds.h / 40),
  ...occupancy.map((value) => Math.round(value * 7)),
  ...bombs, ...spawns, major, chokes, regions
].join(','));

export const createArenaFingerprint = (input: {
  archetype: ArenaTemplate;
  bounds: RectSpec;
  blockers: RectSpec[];
  bombSites: PointLike[];
  enemySpawns: PointLike[];
  attempt: number;
  majorStructureCount: number;
  chokePointCount: number;
  connectedRegionCount: number;
  orientationBias: ArenaFingerprint['orientationBias'];
  validation: string[];
}): ArenaFingerprint => {
  const size = CONFIG.fingerprintGridSize;
  const occupancy: number[] = [];
  for (let gridY = 0; gridY < size; gridY += 1) {
    for (let gridX = 0; gridX < size; gridX += 1) {
      const cell = {
        x: input.bounds.x + gridX * input.bounds.w / size,
        y: input.bounds.y + gridY * input.bounds.h / size,
        w: input.bounds.w / size,
        h: input.bounds.h / size
      };
      const blockedArea = input.blockers.reduce((sum, blocker) => sum + intersectionArea(cell, blocker), 0);
      occupancy.push(Math.min(1, blockedArea / (cell.w * cell.h)));
    }
  }

  const blocked = occupancy.reduce((sum, value) => sum + value, 0) / occupancy.length;
  let mirrorDifference = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < Math.floor(size / 2); x += 1) {
      mirrorDifference += Math.abs(occupancy[y * size + x] - occupancy[y * size + size - 1 - x]);
    }
  }
  const symmetryScore = 1 - mirrorDifference / (size * Math.floor(size / 2));
  const largeStructureCount = input.blockers.filter((rect) => rect.w * rect.h > 12_000).length;
  const smallStructureCount = input.blockers.length - largeStructureCount;
  const openSpacePercentage = Math.round((1 - blocked) * 1000) / 10;
  const bombDistribution = distribution(input.bombSites, input.bounds);
  const spawnDistribution = distribution(input.enemySpawns, input.bounds);
  const structureClass: ArenaStructureClass = openSpacePercentage >= 89.2
    && input.chokePointCount <= 1
    && input.connectedRegionCount <= 1
    ? 'open'
    : openSpacePercentage < 87.5 || input.chokePointCount >= 5 || input.connectedRegionCount >= 4
      ? 'dense'
      : 'structured';
  const hash = structuralHash(
    input.bounds,
    occupancy,
    bombDistribution,
    spawnDistribution,
    input.majorStructureCount,
    input.chokePointCount,
    input.connectedRegionCount
  );

  return {
    archetype: input.archetype,
    hash,
    fingerprintHash: hash,
    structureClass,
    attempt: input.attempt,
    bounds: input.bounds,
    occupancy,
    openSpacePercentage,
    obstacleDensity: blocked,
    majorStructureCount: input.majorStructureCount,
    largeStructureCount,
    smallStructureCount,
    chokePointCount: input.chokePointCount,
    connectedRegionCount: input.connectedRegionCount,
    bombDistribution,
    spawnDistribution,
    symmetryScore: clamp01(symmetryScore),
    orientationBias: input.orientationBias,
    similarityScore: 0,
    validation: input.validation
  };
};

export const compareArenaFingerprints = (a: ArenaFingerprint, b: ArenaFingerprint): number => {
  const occupancy = occupancySimilarity(a.occupancy, b.occupancy);
  const dimensions = 1 - Math.min(1, (
    Math.abs(a.bounds.w / b.bounds.w - 1) + Math.abs(a.bounds.h / b.bounds.h - 1)
  ) / 1.2);
  const density = 1 - Math.min(1, Math.abs(a.obstacleDensity - b.obstacleDensity) * 6);
  const bombs = normalizedVectorSimilarity(a.bombDistribution, b.bombDistribution);
  const spawns = normalizedVectorSimilarity(a.spawnDistribution, b.spawnDistribution);
  const topology = (
    countSimilarity(a.chokePointCount, b.chokePointCount, 7)
    + countSimilarity(a.connectedRegionCount, b.connectedRegionCount, 5)
  ) / 2;
  const structures = (
    countSimilarity(a.majorStructureCount, b.majorStructureCount, 8)
    + countSimilarity(a.largeStructureCount, b.largeStructureCount, 14)
    + countSimilarity(a.smallStructureCount, b.smallStructureCount, 24)
  ) / 3;
  const orientation = cosineSimilarity(
    [a.orientationBias.horizontal, a.orientationBias.vertical, a.orientationBias.diagonal],
    [b.orientationBias.horizontal, b.orientationBias.vertical, b.orientationBias.diagonal]
  );
  const symmetry = 1 - Math.min(1, Math.abs(a.symmetryScore - b.symmetryScore));
  const sameArchetype = a.archetype === b.archetype ? 1 : 0;
  return clamp01(
    occupancy * 0.4
    + dimensions * 0.06
    + density * 0.07
    + bombs * 0.12
    + spawns * 0.04
    + topology * 0.09
    + structures * 0.08
    + orientation * 0.05
    + symmetry * 0.03
    + sameArchetype * 0.06
  );
};

const deterministicJitter = (seed: number, archetype: ArenaTemplate): number => {
  let hash = seed ^ 0x9e3779b9;
  for (let index = 0; index < archetype.length; index += 1) hash = Math.imul(hash ^ archetype.charCodeAt(index), 0x45d9f3b);
  return (hash >>> 0) / 0x1_0000_0000 * 0.08;
};

export class ArenaHistory {
  private readonly fingerprints: ArenaFingerprint[] = [];

  recent(): readonly ArenaFingerprint[] { return this.fingerprints; }

  add(fingerprint: ArenaFingerprint): void {
    this.fingerprints.push(fingerprint);
    if (this.fingerprints.length > CONFIG.recentFingerprintCount) this.fingerprints.shift();
  }

  highestSimilarity(fingerprint: ArenaFingerprint): number {
    return this.fingerprints.reduce(
      (maximum, recent) => Math.max(maximum, compareArenaFingerprints(fingerprint, recent)),
      0
    );
  }

  assess(fingerprint: ArenaFingerprint, relaxation = 0): ArenaSimilarityAssessment {
    let anyRejected = false;
    let anyExact = false;
    let exactPrevious = false;
    let rejectedOpenRepeat = false;
    let result: ArenaSimilarityAssessment = {
      reject: false,
      exact: false,
      exactPrevious: false,
      openRepeat: false,
      score: 0,
      previousScore: 0,
      closestHistoryAge: -1,
      threshold: 1
    };
    for (let age = 0; age < this.fingerprints.length; age += 1) {
      const recent = this.fingerprints[this.fingerprints.length - 1 - age];
      const score = compareArenaFingerprints(fingerprint, recent);
      const exact = fingerprint.hash === recent.hash;
      const openRepeat = age === 0 && fingerprint.structureClass === 'open' && recent.structureClass === 'open';
      const baseThreshold = CONFIG.similarityThresholdByAge[Math.min(age, CONFIG.similarityThresholdByAge.length - 1)];
      const sameArchetypePenalty = fingerprint.archetype === recent.archetype ? Math.max(0, 0.05 - age * 0.008) : 0;
      const threshold = Math.min(0.995, openRepeat
        ? CONFIG.extremeOpenRepeatThreshold + Math.min(relaxation, 0.03)
        : baseThreshold - sameArchetypePenalty + relaxation);
      const rejected = exact || score >= threshold;
      anyRejected ||= rejected;
      anyExact ||= exact;
      exactPrevious ||= exact && age === 0;
      rejectedOpenRepeat ||= openRepeat && rejected;
      if (score > result.score) {
        result = {
          reject: rejected,
          exact,
          exactPrevious: exact && age === 0,
          openRepeat,
          score,
          previousScore: age === 0 ? score : result.previousScore,
          closestHistoryAge: age,
          threshold
        };
      } else {
        if (age === 0) result.previousScore = score;
      }
    }
    result.reject = anyRejected;
    result.exact = anyExact;
    result.exactPrevious = exactPrevious;
    result.openRepeat = rejectedOpenRepeat;
    return result;
  }

  orderArchetypes(preferred: ArenaTemplate, candidates: readonly ArenaTemplate[], seed: number): ArenaTemplate[] {
    const newestFirst = [...this.fingerprints].reverse();
    const previousWasOpen = newestFirst[0]?.structureClass === 'open';
    const score = (archetype: ArenaTemplate): number => {
      let recency = 0;
      newestFirst.forEach((entry, age) => {
        if (entry.archetype === archetype) recency += Math.max(0.08, 1 - age * 0.17);
      });
      const preferredBias = archetype === preferred ? -0.42 : 0;
      const openRhythmPenalty = previousWasOpen && archetype === 'open-field' ? 0.72 : 0;
      return recency + preferredBias + openRhythmPenalty + deterministicJitter(seed, archetype);
    };
    return [...candidates].sort((a, b) => score(a) - score(b));
  }

  recentArchetypes(): ArenaTemplate[] {
    return this.fingerprints.slice(-CONFIG.archetypeCooldownRounds).map((entry) => entry.archetype);
  }

  clear(): void { this.fingerprints.length = 0; }
}
