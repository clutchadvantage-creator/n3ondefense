import type Phaser from 'phaser';
import type { RectSpec } from '../types.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';

export type EnvironmentIdentity = 'arena' | 'heist';
export type EnvironmentDecalFinish = 'paint' | 'stencil' | 'warning' | 'emissive';

export interface EnvironmentDecalSpec {
  x: number;
  y: number;
  rotation: number;
  text: string;
  color: number;
  alpha: number;
  fontSize: number;
  finish: EnvironmentDecalFinish;
  surfaceIndex: number;
}

export interface EnvironmentDecalPlan {
  identity: EnvironmentIdentity;
  maximumDecals: number;
  decals: EnvironmentDecalSpec[];
}

const ARENA_TAGS = [
  'N3ON', 'VOID//7', 'GRID GHOST', 'RUN//FREE', 'BYTE ME', 'NO GODS // ONLY CIRCUITS',
  'SECTOR 09', 'STAY LOUD', 'FLUX KIDS', 'LIVE//WIRE'
] as const;

const HEIST_TAGS = [
  'KEEP OUT', 'NULL MATTER', 'SEAL//07', 'NO SIGNAL', 'UNIT 13', 'WATCHERS LIE',
  'CONTAIN', 'AUTHORIZED ONLY', 'DO NOT OPEN', 'COLD VAULT'
] as const;

const PAINT_COLORS = [0x6eb6bd, 0xa9749b, 0xb7a479, 0x5d8d78, 0x8591a3] as const;
const EMISSIVE_COLORS = [0x4deeff, 0xff51c8, 0x8cff9b, 0xffc857] as const;

/**
 * Deterministic, presentation-only decal placement. Only long structural
 * surfaces are considered and the fixed maximum keeps both scenes bounded.
 */
export const createEnvironmentDecalPlan = (
  identity: EnvironmentIdentity,
  seed: number,
  surfaces: readonly RectSpec[],
  maximumDecals: number
): EnvironmentDecalPlan => {
  const random = new SeededRandom((seed ^ (identity === 'arena' ? 0x4e334f4e : 0x48333135)) >>> 0);
  const candidates = random.shuffle(surfaces.map((surface, index) => ({ surface, index })))
    .filter(({ surface }) => Math.max(surface.w, surface.h) >= 100 && Math.min(surface.w, surface.h) >= 18);
  const tags = identity === 'arena' ? ARENA_TAGS : HEIST_TAGS;
  const decals: EnvironmentDecalSpec[] = [];
  const limit = Math.min(Math.max(0, maximumDecals), candidates.length);
  for (let decalIndex = 0; decalIndex < limit; decalIndex += 1) {
    const { surface, index: surfaceIndex } = candidates[decalIndex];
    const horizontal = surface.w >= surface.h;
    const finish: EnvironmentDecalFinish = decalIndex % 6 === 0
      ? 'emissive'
      : decalIndex % 4 === 0 ? 'warning' : decalIndex % 3 === 0 ? 'stencil' : 'paint';
    const text = random.pick(tags);
    const longSide = Math.max(surface.w, surface.h);
    const fontSize = Math.max(8, Math.min(15, Math.floor(longSide / Math.max(10, text.length * 0.82))));
    decals.push({
      x: surface.x + surface.w * 0.5,
      y: surface.y + surface.h * 0.5,
      rotation: horizontal ? random.float(-0.035, 0.035) : Math.PI * 0.5 + random.float(-0.025, 0.025),
      text,
      color: finish === 'emissive' ? random.pick(EMISSIVE_COLORS) : random.pick(PAINT_COLORS),
      alpha: finish === 'emissive' ? 0.64 : finish === 'warning' ? 0.52 : random.float(0.3, 0.48),
      fontSize,
      finish,
      surfaceIndex
    });
  }
  return { identity, maximumDecals, decals };
};

export const createEnvironmentDecalText = (
  scene: Phaser.Scene,
  spec: EnvironmentDecalSpec
): Phaser.GameObjects.Text => scene.make.text({
  x: spec.x,
  y: spec.y,
  text: spec.text,
  style: {
    fontFamily: spec.finish === 'stencil' || spec.finish === 'warning'
      ? 'Rajdhani, sans-serif' : 'Orbitron, sans-serif',
    fontSize: `${spec.fontSize}px`,
    fontStyle: spec.finish === 'warning' ? 'bold' : 'normal',
    color: `#${spec.color.toString(16).padStart(6, '0')}`,
    stroke: spec.finish === 'emissive' ? '#02050b' : '#071018',
    strokeThickness: spec.finish === 'emissive' ? 3 : 1,
    letterSpacing: spec.finish === 'stencil' ? 2 : 1
  }
}, false).setOrigin(0.5).setRotation(spec.rotation).setAlpha(spec.alpha);
