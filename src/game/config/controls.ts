export type AbilityAction = 'fence' | 'turret' | 'mine' | 'dash' | 'shield';
export type InputBinding = `Keyboard:${string}` | `Mouse:${number}`;
export type AbilityBindings = Record<AbilityAction, InputBinding>;

/** Authoritative fixed combat bindings used by both gameplay and teaching UI. */
export const MOVEMENT_BINDINGS = ['Keyboard:KeyW', 'Keyboard:KeyA', 'Keyboard:KeyS', 'Keyboard:KeyD'] as const;
export const PRIMARY_FIRE_BINDING: InputBinding = 'Mouse:0';
export const INTERACT_BINDING: InputBinding = 'Keyboard:KeyE';

export const ABILITY_ACTIONS: ReadonlyArray<{ action: AbilityAction; label: string }> = [
  { action: 'fence', label: 'Fence' },
  { action: 'turret', label: 'Turret' },
  { action: 'mine', label: 'Mine' },
  { action: 'dash', label: 'Dash' },
  { action: 'shield', label: 'Shield' }
];

export const DEFAULT_ABILITY_BINDINGS: AbilityBindings = {
  fence: 'Keyboard:KeyQ',
  turret: 'Keyboard:KeyF',
  mine: 'Keyboard:KeyR',
  dash: 'Keyboard:Space',
  shield: 'Mouse:1'
};

export const RESERVED_ABILITY_BINDINGS = new Set<InputBinding>([
  'Keyboard:Escape', 'Keyboard:KeyW', 'Keyboard:KeyA', 'Keyboard:KeyS', 'Keyboard:KeyD',
  'Keyboard:KeyE', 'Keyboard:F8', 'Mouse:0'
]);

export const normalizeAbilityBindings = (value: unknown): AbilityBindings => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_ABILITY_BINDINGS };
  const claimed = new Set<InputBinding>();
  for (const { action } of ABILITY_ACTIONS) {
    const candidate = source[action];
    const validCandidate = typeof candidate === 'string' && isInputBinding(candidate) && !RESERVED_ABILITY_BINDINGS.has(candidate) && !claimed.has(candidate)
      ? candidate
      : null;
    const fallback = [DEFAULT_ABILITY_BINDINGS[action], ...Object.values(DEFAULT_ABILITY_BINDINGS)]
      .find((binding) => !claimed.has(binding));
    result[action] = validCandidate ?? fallback ?? DEFAULT_ABILITY_BINDINGS[action];
    claimed.add(result[action]);
  }
  return result;
};

export const isInputBinding = (value: string): value is InputBinding =>
  /^Keyboard:[A-Za-z0-9]+$/.test(value) || /^Mouse:[0-4]$/.test(value);

export const bindingLabel = (binding: InputBinding): string => {
  if (binding.startsWith('Mouse:')) {
    const button = Number(binding.slice(6));
    return ['MOUSE 1 (FIRE)', 'MIDDLE MOUSE', 'RIGHT MOUSE', 'MOUSE BACK', 'MOUSE FORWARD'][button] ?? `MOUSE ${button + 1}`;
  }
  return binding.slice(9)
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/Left$|Right$/, '')
    .replace('Space', 'SPACE')
    .toUpperCase();
};

export const compactBindingLabel = (binding: InputBinding): string => {
  if (!binding.startsWith('Mouse:')) return bindingLabel(binding);
  return ['LMB', 'MMB', 'RMB', 'M4', 'M5'][Number(binding.slice(6))] ?? bindingLabel(binding);
};

export const bindingForKeyboardEvent = (event: KeyboardEvent): InputBinding => `Keyboard:${event.code}`;
export const bindingForMouseButton = (button: number): InputBinding | null =>
  button >= 0 && button <= 4 ? `Mouse:${button}` : null;
