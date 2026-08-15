export interface HudRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HudScreenLayout {
  safeArea: number;
  scale: number;
  vitals: HudRect;
  objective: HudRect;
  stats: HudRect;
  radar: { centerX: number; centerY: number; diameter: number };
  abilities: HudRect;
}

export interface HudLayoutOptions {
  scale?: number;
  /** 0 = relaxed inward inset, 1 = closest safe position to the viewport edge. */
  edgePosition?: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Keeps the five gameplay HUD clusters attached to the viewport perimeter.
 * This helper deliberately has no Phaser dependency so its responsive
 * guarantees can be exercised in the normal Node test suite.
 */
export function calculateHudLayout(width: number, height: number, options: HudLayoutOptions = {}): HudScreenLayout {
  const preferenceScale = clamp(options.scale ?? 1, 0.75, 1.4);
  const edgePosition = clamp(options.edgePosition ?? 1, 0, 1);
  const viewportMinimum = Math.min(width, height);
  // Keep a small responsive safe area at 100%, then let the player relax all
  // five clusters inward with one normalized preference. Anchoring still uses
  // each cluster's natural viewport edge; only the inset changes.
  const outerSafeArea = clamp(viewportMinimum * 0.006, 4, 10);
  const inwardTravel = clamp(viewportMinimum * 0.04, 28, 44);
  const safeArea = Math.round(outerSafeArea + (1 - edgePosition) * inwardTravel);
  const scale = clamp(Math.min(width / 1366, height / 768), 0.76, 1.18) * preferenceScale;
  const topGap = Math.round(clamp(width * 0.008, 8, 14));
  const objectiveWidth = Math.round(clamp(width * 0.29 * preferenceScale, 210, 560));
  const topModuleHeight = Math.round(clamp(96 * scale, 68, 154));
  const sideSpace = Math.max(120, (width - objectiveWidth) / 2 - safeArea - topGap);
  const vitalsWidth = Math.round(Math.min(326 * scale, sideSpace));
  const statsWidth = Math.round(Math.min(390 * scale, sideSpace));
  const radarDiameter = Math.round(clamp(
    Math.min(width, height) * 0.17 * preferenceScale,
    120 * preferenceScale,
    150 * preferenceScale
  ));
  const abilityWidth = Math.round(clamp(width * 0.36 * preferenceScale, 290, Math.min(700, width - safeArea * 2)));
  const abilityHeight = Math.round(clamp(112 * scale, 76, 172));

  return {
    safeArea,
    scale,
    vitals: {
      x: safeArea,
      y: safeArea,
      width: vitalsWidth,
      height: topModuleHeight
    },
    objective: {
      x: Math.round((width - objectiveWidth) / 2),
      y: safeArea,
      width: objectiveWidth,
      height: topModuleHeight
    },
    stats: {
      x: width - safeArea - statsWidth,
      y: safeArea,
      width: statsWidth,
      height: topModuleHeight
    },
    radar: {
      centerX: safeArea + radarDiameter / 2,
      centerY: height - safeArea - radarDiameter / 2,
      diameter: radarDiameter
    },
    abilities: {
      x: width - safeArea - abilityWidth,
      y: height - safeArea - abilityHeight,
      width: abilityWidth,
      height: abilityHeight
    }
  };
}

export function formatHudCountdown(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '';
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
