import { ARENA_GENERATION_CONFIG as CONFIG } from '../config/arenaGeneration.ts';
import type { ArenaTemplate, RectSpec } from '../types.ts';
import { SeededRandom } from './SeededRandom.ts';
import type { PointSpec } from './ArenaTopology.ts';

export interface SafeArenaFallbackDraft {
  id: string;
  archetype: ArenaTemplate;
  bounds: RectSpec;
  walls: RectSpec[];
  bombSites: PointSpec[];
  playerSpawn: PointSpec;
  enemySpawns: PointSpec[];
  majorStructureCount: number;
  chokePointCount: number;
  connectedRegionCount: number;
  orientationBias: { horizontal: number; vertical: number; diagonal: number };
}

interface VariantGeometry {
  archetype: ArenaTemplate;
  walls: RectSpec[];
  major: number;
  chokes: number;
  regions: number;
  orientation: SafeArenaFallbackDraft['orientationBias'];
}

const boundary = (bounds: RectSpec): RectSpec[] => {
  const thickness = CONFIG.boundaryThickness;
  return [
    { x: bounds.x, y: bounds.y, w: bounds.w, h: thickness },
    { x: bounds.x, y: bounds.y + bounds.h - thickness, w: bounds.w, h: thickness },
    { x: bounds.x, y: bounds.y, w: thickness, h: bounds.h },
    { x: bounds.x + bounds.w - thickness, y: bounds.y, w: thickness, h: bounds.h }
  ];
};

const rect = (bounds: RectSpec, x: number, y: number, width: number, height: number): RectSpec => ({
  x: bounds.x + bounds.w * x,
  y: bounds.y + bounds.h * y,
  w: bounds.w * width,
  h: bounds.h * height
});

const point = (bounds: RectSpec, x: number, y: number): PointSpec => ({
  x: bounds.x + bounds.w * x,
  y: bounds.y + bounds.h * y
});

const openVariant = (bounds: RectSpec): VariantGeometry => ({
  archetype: 'open-field',
  walls: [
    rect(bounds, 0.31, 0.27, 0.09, CONFIG.interiorHorizontalThicknessRatio), rect(bounds, 0.31, 0.27, CONFIG.interiorVerticalThicknessRatio, 0.09),
    rect(bounds, 0.61, 0.28, 0.09, CONFIG.interiorHorizontalThicknessRatio), rect(bounds, 0.688, 0.28, CONFIG.interiorVerticalThicknessRatio, 0.09),
    rect(bounds, 0.3, 0.69, 0.09, CONFIG.interiorHorizontalThicknessRatio), rect(bounds, 0.3, 0.618, CONFIG.interiorVerticalThicknessRatio, 0.09),
    rect(bounds, 0.62, 0.68, 0.09, CONFIG.interiorHorizontalThicknessRatio), rect(bounds, 0.698, 0.61, CONFIG.interiorVerticalThicknessRatio, 0.09)
  ],
  major: 4,
  chokes: 0,
  regions: 1,
  orientation: { horizontal: 0.5, vertical: 0.42, diagonal: 0.08 }
});

const splitVariant = (bounds: RectSpec, vertical: boolean): VariantGeometry => ({
  archetype: 'split',
  walls: vertical
    ? [rect(bounds, 0.493, 0.055, CONFIG.interiorVerticalThicknessRatio, 0.3), rect(bounds, 0.493, 0.645, CONFIG.interiorVerticalThicknessRatio, 0.3)]
    : [rect(bounds, 0.055, 0.493, 0.3, CONFIG.interiorHorizontalThicknessRatio), rect(bounds, 0.645, 0.493, 0.3, CONFIG.interiorHorizontalThicknessRatio)],
  major: 2,
  chokes: 2,
  regions: 2,
  orientation: vertical
    ? { horizontal: 0.05, vertical: 0.9, diagonal: 0.05 }
    : { horizontal: 0.9, vertical: 0.05, diagonal: 0.05 }
});

const crossroadsVariant = (bounds: RectSpec): VariantGeometry => ({
  archetype: 'crossroads',
  walls: [
    rect(bounds, 0.06, 0.33, 0.17, CONFIG.interiorHorizontalThicknessRatio), rect(bounds, 0.77, 0.33, 0.17, CONFIG.interiorHorizontalThicknessRatio),
    rect(bounds, 0.06, 0.67, 0.17, CONFIG.interiorHorizontalThicknessRatio), rect(bounds, 0.77, 0.67, 0.17, CONFIG.interiorHorizontalThicknessRatio),
    rect(bounds, 0.33, 0.05, CONFIG.interiorVerticalThicknessRatio, 0.14), rect(bounds, 0.33, 0.81, CONFIG.interiorVerticalThicknessRatio, 0.14),
    rect(bounds, 0.656, 0.05, CONFIG.interiorVerticalThicknessRatio, 0.14), rect(bounds, 0.656, 0.81, CONFIG.interiorVerticalThicknessRatio, 0.14)
  ],
  major: 4,
  chokes: 4,
  regions: 5,
  orientation: { horizontal: 0.5, vertical: 0.5, diagonal: 0 }
});

const chamberRing = (bounds: RectSpec, x: number, y: number): RectSpec[] => [
  rect(bounds, x, y, 0.065, CONFIG.interiorHorizontalThicknessRatio), rect(bounds, x + 0.155, y, 0.065, CONFIG.interiorHorizontalThicknessRatio),
  rect(bounds, x, y + 0.25, 0.22, CONFIG.interiorHorizontalThicknessRatio),
  rect(bounds, x, y, CONFIG.interiorVerticalThicknessRatio, 0.085), rect(bounds, x, y + 0.165, CONFIG.interiorVerticalThicknessRatio, 0.103),
  rect(bounds, x + 0.208, y, CONFIG.interiorVerticalThicknessRatio, 0.085), rect(bounds, x + 0.208, y + 0.165, CONFIG.interiorVerticalThicknessRatio, 0.103)
];

const chambersVariant = (bounds: RectSpec): VariantGeometry => ({
  archetype: 'chambers',
  walls: [...chamberRing(bounds, 0.19, 0.36), ...chamberRing(bounds, 0.59, 0.36)],
  major: 2,
  chokes: 4,
  regions: 3,
  orientation: { horizontal: 0.49, vertical: 0.48, diagonal: 0.03 }
});

const islandsVariant = (bounds: RectSpec): VariantGeometry => ({
  archetype: 'islands',
  walls: [
    rect(bounds, 0.3, 0.29, 0.1, 0.09), rect(bounds, 0.6, 0.27, 0.1, 0.11),
    rect(bounds, 0.28, 0.63, 0.11, 0.1), rect(bounds, 0.62, 0.64, 0.09, 0.09)
  ],
  major: 4,
  chokes: 3,
  regions: 4,
  orientation: { horizontal: 0.42, vertical: 0.42, diagonal: 0.16 }
});

/**
 * Produces several deliberately simple but topologically distinct emergency
 * layouts. They are only used after bounded normal generation fails; every
 * candidate still passes the normal ArenaValidator before acceptance.
 */
export const createSafeArenaFallbacks = (seed: number, round: number, siteCount: number): SafeArenaFallbackDraft[] => {
  const random = new SeededRandom((seed ^ Math.imul(round + 17, 0x71f4a7c1)) >>> 0);
  const bounds = {
    x: 0,
    y: 0,
    w: random.int(1940, 2160),
    h: random.int(1200, 1400)
  };
  bounds.x = Math.round((2400 - bounds.w) / 2);
  bounds.y = Math.round((1600 - bounds.h) / 2);
  const variants = [
    openVariant(bounds),
    splitVariant(bounds, random.bool()),
    crossroadsVariant(bounds),
    chambersVariant(bounds),
    islandsVariant(bounds)
  ];
  const start = random.int(0, variants.length - 1);
  const sites = [
    point(bounds, 0.18, 0.18), point(bounds, 0.82, 0.18),
    point(bounds, 0.18, 0.82), point(bounds, 0.82, 0.82),
    point(bounds, 0.5, 0.5)
  ].slice(0, Math.max(1, Math.min(5, siteCount)));
  const enemySpawns = [
    point(bounds, 0.045, 0.12), point(bounds, 0.955, 0.14),
    point(bounds, 0.955, 0.88), point(bounds, 0.045, 0.86)
  ];

  return Array.from({ length: Math.min(CONFIG.fallbackVariantCount, variants.length) }, (_, index) => {
    const variant = variants[(start + index) % variants.length];
    return {
      id: `safe-${variant.archetype}-${(start + index) % variants.length}`,
      archetype: variant.archetype,
      bounds: { ...bounds },
      walls: [...boundary(bounds), ...variant.walls.map((wall) => ({ ...wall }))],
      bombSites: sites.map((site) => ({ ...site })),
      // Keep the emergency spawn in the shared central circulation lane. A
      // top-center spawn can land directly on the vertical split variant.
      playerSpawn: point(bounds, 0.5, 0.42),
      enemySpawns: enemySpawns.map((spawn) => ({ ...spawn })),
      majorStructureCount: variant.major,
      chokePointCount: variant.chokes,
      connectedRegionCount: variant.regions,
      orientationBias: variant.orientation
    };
  });
};
