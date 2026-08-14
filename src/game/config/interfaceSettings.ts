export type HudGlowLevel = 'off' | 'low' | 'normal' | 'high';
export type HudAnimationLevel = 'off' | 'reduced' | 'full';
export type ReticleStyle = 'original' | 'split-cross' | 'triad' | 'cyber-ring';
export type ReticleColor = 'cyan' | 'magenta' | 'green' | 'gold' | 'white' | 'red';

export interface HudSettings {
  scale: number;
  panelOpacity: number;
  backgroundOpacity: number;
  glow: HudGlowLevel;
  animation: HudAnimationLevel;
  edgeMargin: number;
  textScale: number;
}

export interface ReticleSettings {
  style: ReticleStyle;
  size: number;
  color: ReticleColor;
  opacity: number;
  glow: HudGlowLevel;
}

export interface AimSettings {
  mouseSensitivity: number;
  reticle: ReticleSettings;
}

export const DEFAULT_HUD_SETTINGS: Readonly<HudSettings> = {
  scale: 1,
  panelOpacity: 1,
  backgroundOpacity: 1,
  glow: 'normal',
  animation: 'full',
  edgeMargin: 0,
  textScale: 1
};

export const DEFAULT_RETICLE_SETTINGS: Readonly<ReticleSettings> = {
  style: 'original',
  size: 1,
  color: 'cyan',
  opacity: 0.95,
  glow: 'normal'
};

export const DEFAULT_AIM_SETTINGS: Readonly<AimSettings> = {
  mouseSensitivity: 1,
  reticle: DEFAULT_RETICLE_SETTINGS
};

export const RETICLE_COLORS: Readonly<Record<ReticleColor, number>> = {
  cyan: 0x6ff6ff,
  magenta: 0xff61cf,
  green: 0x72ffac,
  gold: 0xffd768,
  white: 0xf4fdff,
  red: 0xff5f79
};

export const HUD_GLOW_LEVELS: readonly HudGlowLevel[] = ['off', 'low', 'normal', 'high'];
export const HUD_ANIMATION_LEVELS: readonly HudAnimationLevel[] = ['off', 'reduced', 'full'];
export const RETICLE_STYLES: readonly ReticleStyle[] = ['original', 'split-cross', 'triad', 'cyber-ring'];
export const RETICLE_COLOR_IDS: readonly ReticleColor[] = ['cyan', 'magenta', 'green', 'gold', 'white', 'red'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const enumValue = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  typeof value === 'string' && values.includes(value as T) ? value as T : fallback;

export function normalizeHudSettings(value: unknown): HudSettings {
  const source = isRecord(value) ? value : {};
  return {
    scale: clamp(finite(source.scale, DEFAULT_HUD_SETTINGS.scale), 0.75, 1.4),
    panelOpacity: clamp(finite(source.panelOpacity, DEFAULT_HUD_SETTINGS.panelOpacity), 0.2, 1),
    backgroundOpacity: clamp(finite(source.backgroundOpacity, DEFAULT_HUD_SETTINGS.backgroundOpacity), 0.2, 1),
    glow: enumValue(source.glow, HUD_GLOW_LEVELS, DEFAULT_HUD_SETTINGS.glow),
    animation: enumValue(source.animation, HUD_ANIMATION_LEVELS, DEFAULT_HUD_SETTINGS.animation),
    edgeMargin: clamp(finite(source.edgeMargin, DEFAULT_HUD_SETTINGS.edgeMargin), 0, 36),
    textScale: clamp(finite(source.textScale, DEFAULT_HUD_SETTINGS.textScale), 0.85, 1.25)
  };
}

export function normalizeReticleSettings(value: unknown): ReticleSettings {
  const source = isRecord(value) ? value : {};
  return {
    style: enumValue(source.style, RETICLE_STYLES, DEFAULT_RETICLE_SETTINGS.style),
    size: clamp(finite(source.size, DEFAULT_RETICLE_SETTINGS.size), 0.6, 1.8),
    color: enumValue(source.color, RETICLE_COLOR_IDS, DEFAULT_RETICLE_SETTINGS.color),
    opacity: clamp(finite(source.opacity, DEFAULT_RETICLE_SETTINGS.opacity), 0.3, 1),
    glow: enumValue(source.glow, HUD_GLOW_LEVELS, DEFAULT_RETICLE_SETTINGS.glow)
  };
}

export function normalizeAimSettings(value: unknown): AimSettings {
  const source = isRecord(value) ? value : {};
  return {
    mouseSensitivity: clamp(finite(source.mouseSensitivity, DEFAULT_AIM_SETTINGS.mouseSensitivity), 0.35, 2),
    reticle: normalizeReticleSettings(source.reticle)
  };
}

export function glowMultiplier(level: HudGlowLevel): number {
  if (level === 'off') return 0;
  if (level === 'low') return 0.45;
  if (level === 'high') return 1.45;
  return 1;
}
