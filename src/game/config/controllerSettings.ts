export interface ControllerSettings {
  leftStickDeadZone: number;
  rightStickDeadZone: number;
  aimSensitivity: number;
}

export const DEFAULT_CONTROLLER_SETTINGS: Readonly<ControllerSettings> = {
  leftStickDeadZone: 0.18,
  rightStickDeadZone: 0.2,
  aimSensitivity: 1
};

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export function normalizeControllerSettings(value: unknown): ControllerSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    leftStickDeadZone: clamp(finite(source.leftStickDeadZone, DEFAULT_CONTROLLER_SETTINGS.leftStickDeadZone), 0.05, 0.45),
    rightStickDeadZone: clamp(finite(source.rightStickDeadZone, DEFAULT_CONTROLLER_SETTINGS.rightStickDeadZone), 0.05, 0.45),
    aimSensitivity: clamp(finite(source.aimSensitivity, DEFAULT_CONTROLLER_SETTINGS.aimSensitivity), 0.5, 2)
  };
}
