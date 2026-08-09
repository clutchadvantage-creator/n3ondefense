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

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Keeps the five gameplay HUD clusters attached to the viewport perimeter.
 * This helper deliberately has no Phaser dependency so its responsive
 * guarantees can be exercised in the normal Node test suite.
 */
export function calculateHudLayout(width: number, height: number): HudScreenLayout {
  const safeArea = Math.round(clamp(Math.min(width, height) * 0.022, 12, 24));
  const scale = clamp(Math.min(width / 1366, height / 768), 0.72, 1.18);
  const topGap = Math.round(clamp(width * 0.008, 8, 14));
  const objectiveWidth = Math.round(clamp(width * 0.25, 220, 340));
  const objectiveHeight = Math.round(90 * scale);
  const sideSpace = Math.max(120, (width - objectiveWidth) / 2 - safeArea - topGap);
  const vitalsWidth = Math.round(Math.min(292 * scale, sideSpace));
  const statsWidth = Math.round(Math.min(280 * scale, sideSpace));
  const vitalsHeight = Math.round(82 * scale);
  const statsHeight = Math.round(44 * scale);
  const radarDiameter = Math.round(clamp(Math.min(width, height) * 0.17, 120, 150));
  const abilityWidth = Math.round(clamp(width * 0.275, 246, 300) * Math.min(1, scale / 0.9));
  const abilityHeight = Math.round(80 * scale);

  return {
    safeArea,
    scale,
    vitals: {
      x: safeArea,
      y: safeArea,
      width: vitalsWidth,
      height: vitalsHeight
    },
    objective: {
      x: Math.round((width - objectiveWidth) / 2),
      y: safeArea,
      width: objectiveWidth,
      height: objectiveHeight
    },
    stats: {
      x: width - safeArea - statsWidth,
      y: safeArea,
      width: statsWidth,
      height: statsHeight
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
