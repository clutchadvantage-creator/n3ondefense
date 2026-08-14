export const PAUSE_MENU_BASE_WIDTH = 780;
export const PAUSE_MENU_BASE_HEIGHT = 620;

export interface PauseMenuLayout {
  centerX: number;
  centerY: number;
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));

/**
 * Keeps the complete pause console inside a small safe area while allowing it
 * to feel appropriately substantial on 1080p and 1440p displays.
 */
export const calculatePauseMenuLayout = (viewportWidth: number, viewportHeight: number): PauseMenuLayout => {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const horizontalFit = Math.max(0.1, (width - 24) / PAUSE_MENU_BASE_WIDTH);
  const verticalFit = Math.max(0.1, (height - 20) / PAUSE_MENU_BASE_HEIGHT);
  const preferredScale = clamp(Math.min(width / 1280, height / 760), 0.86, 1.15);
  const scale = Math.min(horizontalFit, verticalFit, preferredScale);

  return {
    centerX: width * 0.5,
    centerY: height * 0.5,
    scale,
    renderedWidth: PAUSE_MENU_BASE_WIDTH * scale,
    renderedHeight: PAUSE_MENU_BASE_HEIGHT * scale
  };
};
