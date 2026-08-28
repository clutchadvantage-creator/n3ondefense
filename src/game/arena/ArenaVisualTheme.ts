import type { ArenaLayout, ArenaTemplate } from '../types.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';

export type NeonCityDistrictId = 'data-grid' | 'power-sector' | 'night-market' | 'transit-core';

export interface ArenaArchetypeVisualProfile {
  floorMotif: 'open-grid' | 'island-cells' | 'fortress-bays' | 'concentric' | 'split-lanes' | 'radial' | 'transit-lanes' | 'circuit-maze' | 'room-nodes' | 'cluster-zones' | 'cross-junction' | 'containment';
  wallDensity: number;
  warningDensity: number;
  landmark: string;
}

export interface ArenaVisualTheme {
  id: 'neon-city';
  displayName: 'NEON CITY';
  palette: {
    void: number;
    floor: number;
    floorPanel: number;
    floorSeam: number;
    wall: number;
    wallInset: number;
    shadow: number;
    cyan: number;
    magenta: number;
    warning: number;
    text: number;
  };
  maximumAnimatedNodes: number;
  maximumSigns: number;
  maximumLandmarks: number;
  maximumPalmTrees: number;
  maximumVenueBanners: number;
  maximumVenueScreens: number;
  maximumSpectatorLights: number;
  maximumAnimatedVenueLights: number;
  maximumEnvironmentDecals: number;
  maximumAmbientBatches: number;
}

export interface ArenaDressingPlan {
  themeId: ArenaVisualTheme['id'];
  district: NeonCityDistrictId;
  districtLabel: string;
  profile: ArenaArchetypeVisualProfile;
  panelWidth: number;
  panelHeight: number;
  circuitStride: number;
  wallPanelStride: number;
  animatedNodeIndices: number[];
  signWallIndices: number[];
  venueSeed: number;
  landmarkSeed: number;
  decalSeed: number;
  palmTreeCount: number;
  venueBannerCount: number;
  venueScreenCount: number;
  spectatorLightCount: number;
  animatedVenueLightCount: number;
  environmentDecalCount: number;
}

export const NEON_CITY_VISUAL_THEME: ArenaVisualTheme = {
  id: 'neon-city',
  displayName: 'NEON CITY',
  palette: {
    void: 0x02050b,
    floor: 0x070c14,
    floorPanel: 0x0a1320,
    floorSeam: 0x172b3c,
    wall: 0x090f18,
    wallInset: 0x111c2a,
    shadow: 0x010207,
    cyan: 0x48efff,
    magenta: 0xff4fcf,
    warning: 0xffc857,
    text: 0xd9fbff
  },
  maximumAnimatedNodes: 10,
  maximumSigns: 5,
  maximumLandmarks: 6,
  maximumPalmTrees: 10,
  maximumVenueBanners: 14,
  maximumVenueScreens: 8,
  maximumSpectatorLights: 156,
  maximumAnimatedVenueLights: 6,
  maximumEnvironmentDecals: 9,
  maximumAmbientBatches: 3
};

export const NEON_CITY_ARCHETYPE_PROFILES: Record<ArenaTemplate, ArenaArchetypeVisualProfile> = {
  'open-field': { floorMotif: 'open-grid', wallDensity: 0.45, warningDensity: 0.25, landmark: 'EXCHANGE PLAZA' },
  islands: { floorMotif: 'island-cells', wallDensity: 0.64, warningDensity: 0.35, landmark: 'ARCHIPELAGO GRID' },
  fortress: { floorMotif: 'fortress-bays', wallDensity: 0.92, warningDensity: 0.72, landmark: 'BASTION DISTRICT' },
  ring: { floorMotif: 'concentric', wallDensity: 0.74, warningDensity: 0.42, landmark: 'ORBITAL INTERCHANGE' },
  split: { floorMotif: 'split-lanes', wallDensity: 0.7, warningDensity: 0.62, landmark: 'DIVIDE TERMINAL' },
  'hub-spoke': { floorMotif: 'radial', wallDensity: 0.68, warningDensity: 0.38, landmark: 'CENTRAL NEXUS' },
  canyon: { floorMotif: 'transit-lanes', wallDensity: 0.78, warningDensity: 0.56, landmark: 'NIGHT TRANSIT' },
  maze: { floorMotif: 'circuit-maze', wallDensity: 0.9, warningDensity: 0.46, landmark: 'DATA LABYRINTH' },
  chambers: { floorMotif: 'room-nodes', wallDensity: 0.86, warningDensity: 0.48, landmark: 'VAULT COMPLEX' },
  'asymmetric-clusters': { floorMotif: 'cluster-zones', wallDensity: 0.72, warningDensity: 0.34, landmark: 'FRINGE BLOCKS' },
  crossroads: { floorMotif: 'cross-junction', wallDensity: 0.62, warningDensity: 0.7, landmark: 'CROSSLINE 09' },
  perimeter: { floorMotif: 'containment', wallDensity: 0.82, warningDensity: 0.66, landmark: 'CONTAINMENT RING' }
};

const DISTRICTS: ReadonlyArray<{ id: NeonCityDistrictId; label: string }> = [
  { id: 'data-grid', label: 'DATA GRID' },
  { id: 'power-sector', label: 'POWER SECTOR' },
  { id: 'night-market', label: 'NIGHT MARKET' },
  { id: 'transit-core', label: 'TRANSIT CORE' }
];

const mixSeed = (value: number): number => {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
};

/**
 * Produces presentation-only choices from the accepted arena seed. The plan never
 * adds blockers or mutates the generated layout, keeping gameplay topology and
 * replayable seeds independent from the current visual theme.
 */
export function createArenaDressingPlan(layout: Pick<ArenaLayout, 'seed' | 'template' | 'walls'>): ArenaDressingPlan {
  const random = new SeededRandom(mixSeed(layout.seed ^ 0x4e334f4e ^ Math.imul(layout.walls.length + 1, 0x45d9f3b)));
  const district = random.pick(DISTRICTS);
  const nodeCount = Math.min(NEON_CITY_VISUAL_THEME.maximumAnimatedNodes, Math.max(4, Math.round(layout.walls.length * 0.14)));
  const signCount = Math.min(NEON_CITY_VISUAL_THEME.maximumSigns, Math.max(2, Math.round(layout.walls.length * 0.06)));
  const wallIndices = random.shuffle(Array.from({ length: layout.walls.length }, (_, index) => index));

  return {
    themeId: NEON_CITY_VISUAL_THEME.id,
    district: district.id,
    districtLabel: district.label,
    profile: NEON_CITY_ARCHETYPE_PROFILES[layout.template],
    panelWidth: random.int(142, 188),
    panelHeight: random.int(104, 142),
    circuitStride: random.int(3, 5),
    wallPanelStride: random.int(74, 112),
    animatedNodeIndices: wallIndices.slice(0, nodeCount),
    signWallIndices: wallIndices.slice(nodeCount, nodeCount + signCount),
    venueSeed: random.int(1, 0x7fffffff),
    landmarkSeed: random.int(1, 0x7fffffff),
    decalSeed: random.int(1, 0x7fffffff),
    palmTreeCount: random.int(8, NEON_CITY_VISUAL_THEME.maximumPalmTrees),
    venueBannerCount: random.int(10, NEON_CITY_VISUAL_THEME.maximumVenueBanners),
    venueScreenCount: random.int(6, NEON_CITY_VISUAL_THEME.maximumVenueScreens),
    spectatorLightCount: random.int(124, NEON_CITY_VISUAL_THEME.maximumSpectatorLights),
    animatedVenueLightCount: NEON_CITY_VISUAL_THEME.maximumAnimatedVenueLights,
    environmentDecalCount: random.int(6, NEON_CITY_VISUAL_THEME.maximumEnvironmentDecals)
  };
}
