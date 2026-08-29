import type Phaser from 'phaser';
import type { RectSpec } from '../types.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';

export type EnvironmentIdentity = 'arena' | 'heist';
export type EnvironmentDecalFinish = 'paint' | 'stencil' | 'warning' | 'emissive';
export type EnvironmentGraffitiMotif = 'tag' | 'warning-eye' | 'glitch-face' | 'bolt' | 'arrow';

export interface EnvironmentDecalSpec {
  x: number;
  y: number;
  rotation: number;
  text: string;
  color: number;
  alpha: number;
  fontSize: number;
  finish: EnvironmentDecalFinish;
  motif: EnvironmentGraffitiMotif;
  dripCount: number;
  surfaceIndex: number;
}

export interface EnvironmentDecalPlan {
  identity: EnvironmentIdentity;
  maximumDecals: number;
  decals: EnvironmentDecalSpec[];
}

const ARENA_TAGS = [
  'FIELD OPS', 'VOID CREW', 'NO SAFE RUNS', 'GRID GHOST', 'RUN//FREE',
  'BYTE ME', 'STAY LOUD', 'FLUX KIDS', 'LIVE//WIRE'
] as const;

const HEIST_TAGS = [
  'KEEP OUT', 'NULL MATTER', 'SEAL//07', 'NO SIGNAL', 'UNIT 13', 'WATCHERS LIE',
  'CONTAIN', 'AUTHORIZED ONLY', 'DO NOT OPEN', 'COLD VAULT'
] as const;

const PAINT_COLORS = [0x6eb6bd, 0xa9749b, 0xb7a479, 0x5d8d78, 0x8591a3] as const;
const EMISSIVE_COLORS = [0x4deeff, 0xff51c8, 0x8cff9b, 0xffc857] as const;
const GRAFFITI_MOTIFS: readonly EnvironmentGraffitiMotif[] = ['tag', 'warning-eye', 'glitch-face', 'bolt', 'arrow'];

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
    .filter(({ surface }) => Math.max(surface.w, surface.h) >= 100 && Math.min(surface.w, surface.h) >= 24);
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
    const shortSide = Math.min(surface.w, surface.h);
    const fontSize = Math.max(10, Math.min(20, Math.floor(shortSide * 0.56), Math.floor(longSide / Math.max(9, text.length * 0.74))));
    decals.push({
      x: surface.x + surface.w * 0.5,
      y: surface.y + surface.h * 0.5,
      rotation: horizontal ? random.float(-0.035, 0.035) : Math.PI * 0.5 + random.float(-0.025, 0.025),
      text,
      color: finish === 'emissive' ? random.pick(EMISSIVE_COLORS) : random.pick(PAINT_COLORS),
      alpha: finish === 'emissive' ? 0.64 : finish === 'warning' ? 0.52 : random.float(0.3, 0.48),
      fontSize,
      finish,
      motif: random.pick(GRAFFITI_MOTIFS),
      dripCount: random.int(1, 4),
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

/**
 * Bounded, setup-time street art: sprayed underpaint, hand-drawn motif,
 * marker tag, paint breaks, and drips share one container. The typography is
 * deliberately only one layer of the illustration instead of masquerading as
 * the entire graffiti treatment.
 */
export const createEnvironmentGraffitiArt = (
  scene: Phaser.Scene,
  spec: EnvironmentDecalSpec
): Phaser.GameObjects.Container => {
  const width = Math.max(70, Math.min(210, spec.text.length * spec.fontSize * 0.66 + 42));
  const height = Math.max(27, spec.fontSize * 1.72);
  const root = scene.make.container({ x: spec.x, y: spec.y }, false)
    .setRotation(spec.rotation)
    .setAlpha(Math.min(0.88, spec.alpha + 0.16));
  const paint = scene.make.graphics({ x: 0, y: 0 }, false);
  const dark = spec.finish === 'emissive' ? 0x04030b : 0x071018;

  // Irregular sprayed backing and overspray dots keep the mark organic.
  paint.lineStyle(Math.max(5, spec.fontSize * 0.56), dark, 0.56);
  paint.beginPath();
  paint.moveTo(-width * 0.48, 2);
  paint.lineTo(-width * 0.18, -height * 0.25);
  paint.lineTo(width * 0.12, height * 0.13);
  paint.lineTo(width * 0.48, -3);
  paint.strokePath();
  paint.lineStyle(Math.max(2.5, spec.fontSize * 0.24), spec.color, 0.62);
  paint.beginPath();
  paint.moveTo(-width * 0.5, height * 0.18);
  paint.lineTo(-width * 0.23, -height * 0.34);
  paint.lineTo(width * 0.05, height * 0.22);
  paint.lineTo(width * 0.5, -height * 0.18);
  paint.strokePath();

  const iconX = -width * 0.42;
  const motifScale = Math.min(1.34, Math.max(0.8, spec.fontSize / 15));
  paint.lineStyle(2.4 * motifScale, spec.color, 0.9);
  if (spec.motif === 'warning-eye') {
    paint.strokePoints([
      { x: iconX - 10 * motifScale, y: 0 }, { x: iconX, y: -7 * motifScale }, { x: iconX + 10 * motifScale, y: 0 }, { x: iconX, y: 7 * motifScale }
    ], true);
    paint.fillStyle(spec.color, 0.82).fillCircle(iconX, 0, 3 * motifScale);
  } else if (spec.motif === 'glitch-face') {
    paint.strokeCircle(iconX, 0, 10);
    paint.lineBetween(iconX - 6, -3, iconX - 2, -1);
    paint.lineBetween(iconX + 2, -1, iconX + 6, -4);
    paint.lineBetween(iconX - 6, 5, iconX + 5, 3);
  } else if (spec.motif === 'bolt') {
    paint.strokePoints([
      { x: iconX + 2, y: -12 }, { x: iconX - 7, y: 1 }, { x: iconX, y: 1 },
      { x: iconX - 3, y: 13 }, { x: iconX + 9, y: -3 }, { x: iconX + 2, y: -3 }
    ], false);
  } else if (spec.motif === 'arrow') {
    paint.lineBetween(iconX - 11, 7, iconX + 8, -7);
    paint.lineBetween(iconX + 8, -7, iconX + 2, -7);
    paint.lineBetween(iconX + 8, -7, iconX + 6, -1);
  } else {
    paint.strokeCircle(iconX, 0, 8);
    paint.lineBetween(iconX - 10, 10, iconX + 11, -11);
    paint.fillStyle(spec.color, 0.75).fillCircle(iconX + 9, 8, 2);
  }

  // Paint drips and imperfect overspray are deterministic from the plan.
  for (let drip = 0; drip < spec.dripCount; drip += 1) {
    const fraction = (drip + 1) / (spec.dripCount + 1);
    const dripX = -width * 0.42 + width * 0.84 * fraction;
    const dripLength = 4 + ((spec.surfaceIndex + drip * 3) % 8);
    paint.lineStyle(1.3, spec.color, 0.58).lineBetween(dripX, height * 0.24, dripX - 1, height * 0.24 + dripLength);
    paint.fillStyle(spec.color, 0.5).fillCircle(dripX - 1, height * 0.24 + dripLength + 1, 1.2);
  }
  for (let speck = 0; speck < 6; speck += 1) {
    const sx = -width * 0.48 + ((spec.surfaceIndex * 17 + speck * 29) % Math.max(1, Math.floor(width)));
    const sy = -height * 0.44 + ((spec.surfaceIndex * 11 + speck * 13) % Math.max(1, Math.floor(height * 0.88)));
    paint.fillStyle(spec.color, speck % 2 ? 0.3 : 0.48).fillCircle(sx, sy, speck % 3 === 0 ? 1.5 : 0.8);
  }

  const tag = scene.make.text({
    x: 7,
    y: -1,
    text: spec.text,
    style: {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: `${Math.max(9, spec.fontSize)}px`,
      fontStyle: 'bold italic',
      color: `#${spec.color.toString(16).padStart(6, '0')}`,
      stroke: `#${dark.toString(16).padStart(6, '0')}`,
      strokeThickness: spec.finish === 'emissive' ? 4 : 3,
      letterSpacing: 0
    }
  }, false).setOrigin(0.5).setAngle(((spec.surfaceIndex % 3) - 1) * 2);
  root.add([paint, tag]);
  return root;
};
