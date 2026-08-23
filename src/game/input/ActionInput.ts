import type { ControllerSettings } from '../config/controllerSettings.ts';

export type InputDevice = 'keyboardMouse' | 'gamepad';
export type InputContext = 'gameplay' | 'paused' | 'menu' | 'modal' | 'tutorial';
export type GamepadFamily = 'xbox' | 'playstation' | 'generic';

export const INPUT_ACTIONS = [
  'fire', 'interact', 'fence', 'turret', 'mine', 'dash', 'shield',
  'selectFence', 'selectTurret', 'selectMine', 'pause',
  'confirm', 'cancel', 'navigateUp', 'navigateDown', 'navigateLeft', 'navigateRight',
  'pageLeft', 'pageRight', 'tabLeft', 'tabRight'
] as const;
export type InputAction = typeof INPUT_ACTIONS[number];

const ACTION_INDEX = Object.fromEntries(INPUT_ACTIONS.map((action, index) => [action, index])) as Record<InputAction, number>;
const GAMEPLAY_ACTIONS = new Set<InputAction>([
  'fire', 'interact', 'fence', 'turret', 'mine', 'dash', 'shield',
  'selectFence', 'selectTurret', 'selectMine', 'pause'
]);
const UI_ACTIONS = new Set<InputAction>([
  'pause', 'confirm', 'cancel', 'navigateUp', 'navigateDown', 'navigateLeft',
  'navigateRight', 'pageLeft', 'pageRight', 'tabLeft', 'tabRight'
]);

export class ActionStateBuffer {
  private readonly rawCurrent = new Uint8Array(INPUT_ACTIONS.length);
  private readonly rawPrevious = new Uint8Array(INPUT_ACTIONS.length);
  private readonly visibleCurrent = new Uint8Array(INPUT_ACTIONS.length);
  private readonly visiblePrevious = new Uint8Array(INPUT_ACTIONS.length);

  beginFrame(): void {
    this.rawPrevious.set(this.rawCurrent);
    this.visiblePrevious.set(this.visibleCurrent);
    this.rawCurrent.fill(0);
    this.visibleCurrent.fill(0);
  }

  setHeld(action: InputAction, held: boolean): void {
    if (held) this.rawCurrent[ACTION_INDEX[action]] = 1;
  }

  finishFrame(context: InputContext): void {
    const allowed = context === 'gameplay' ? GAMEPLAY_ACTIONS : UI_ACTIONS;
    for (const action of INPUT_ACTIONS) {
      const index = ACTION_INDEX[action];
      this.visibleCurrent[index] = allowed.has(action) ? this.rawCurrent[index] : 0;
    }
  }

  held(action: InputAction): boolean { return this.visibleCurrent[ACTION_INDEX[action]] === 1; }
  pressed(action: InputAction): boolean {
    const index = ACTION_INDEX[action];
    // Raw edges prevent a held gameplay button from firing when a modal closes.
    return this.visibleCurrent[index] === 1 && this.rawPrevious[index] === 0;
  }
  released(action: InputAction): boolean {
    const index = ACTION_INDEX[action];
    return this.visiblePrevious[index] === 1 && this.rawCurrent[index] === 0;
  }

  clear(): void {
    // Preserve the raw held snapshot so clearing gameplay during a pause does
    // not turn the same still-held button into a second press next frame.
    this.rawPrevious.set(this.rawCurrent);
    this.visibleCurrent.fill(0);
    this.visiblePrevious.fill(0);
  }
}

export interface MutableStick { x: number; y: number; magnitude: number }

/** Applies a radial dead zone while preserving direction and full-scale output. */
export function applyRadialDeadZoneInto(
  x: number,
  y: number,
  deadZone: number,
  responseExponent: number,
  output: MutableStick
): MutableStick {
  const lengthSquared = x * x + y * y;
  if (lengthSquared <= deadZone * deadZone) {
    output.x = 0;
    output.y = 0;
    output.magnitude = 0;
    return output;
  }
  const length = Math.min(1, Math.sqrt(lengthSquared));
  const normalized = Math.min(1, (length - deadZone) / Math.max(0.0001, 1 - deadZone));
  const magnitude = Math.pow(normalized, responseExponent);
  const scale = magnitude / Math.max(0.0001, Math.sqrt(lengthSquared));
  output.x = x * scale;
  output.y = y * scale;
  output.magnitude = magnitude;
  return output;
}

export interface BrowserGamepadLike {
  index: number;
  id: string;
  connected: boolean;
  mapping: string;
  axes: readonly number[];
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
}

export const STANDARD_GAMEPAD_BUTTON = {
  south: 0, east: 1, west: 2, north: 3,
  leftBumper: 4, rightBumper: 5, leftTrigger: 6, rightTrigger: 7,
  back: 8, start: 9, leftStick: 10, rightStick: 11,
  dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15
} as const;

const buttonDown = (pad: BrowserGamepadLike, index: number, threshold = 0.5): boolean => {
  const button = pad.buttons[index];
  return Boolean(button && (button.pressed || button.value >= threshold));
};

export function classifyGamepad(id: string): GamepadFamily {
  const normalized = id.toLowerCase();
  if (/playstation|dualshock|dualsense|sony|054c/.test(normalized)) return 'playstation';
  if (/xbox|xinput|microsoft|045e/.test(normalized)) return 'xbox';
  return 'generic';
}

export interface GamepadPollResult {
  connected: boolean;
  supported: boolean;
  index: number | null;
  id: string;
  family: GamepadFamily;
  meaningful: boolean;
  freshActivity: boolean;
  move: MutableStick;
  aim: MutableStick;
  held: (action: InputAction) => boolean;
}

/** Allocation-stable standard-mapping reader used by the Phaser adapter and tests. */
export class StandardGamepadReader {
  private activeIndex: number | null = null;
  private readonly priorInputs = new Map<number, Float32Array>();
  private readonly move = { x: 0, y: 0, magnitude: 0 };
  private readonly aim = { x: 0, y: 0, magnitude: 0 };
  private readonly heldActions = new Uint8Array(INPUT_ACTIONS.length);
  private connected = false;
  private supported = false;
  private id = '';
  private family: GamepadFamily = 'generic';
  private meaningful = false;
  private freshActivity = false;
  private readonly result: GamepadPollResult;

  constructor() {
    this.result = {
      connected: false,
      supported: false,
      index: null,
      id: '',
      family: 'generic',
      meaningful: false,
      freshActivity: false,
      move: this.move,
      aim: this.aim,
      held: (action) => this.heldActions[ACTION_INDEX[action]] === 1
    };
  }

  poll(gamepads: readonly (BrowserGamepadLike | null)[], settings: ControllerSettings): GamepadPollResult {
    let pad = this.activeIndex === null ? null : gamepads.find((candidate) => candidate?.index === this.activeIndex) ?? null;
    let freshIndex: number | null = null;
    // A meaningful standard pad becomes authoritative. This also supports hot
    // switching between multiple connected controllers without scene reloads.
    for (const candidate of gamepads) {
      if (!candidate?.connected) continue;
      if (!pad || (pad.mapping !== 'standard' && candidate.mapping === 'standard')) pad = candidate;
      if (candidate.mapping === 'standard' && this.hasFreshActivity(candidate, settings)) {
        pad = candidate;
        freshIndex = candidate.index;
      }
    }
    if (!pad?.connected) {
      this.activeIndex = null;
      this.clearResult();
      return this.syncResult();
    }

    this.activeIndex = pad.index;
    this.connected = true;
    this.supported = pad.mapping === 'standard';
    this.id = pad.id;
    this.family = classifyGamepad(pad.id);
    this.freshActivity = freshIndex === pad.index;
    this.heldActions.fill(0);
    if (!this.supported) {
      this.move.x = this.move.y = this.move.magnitude = 0;
      this.aim.x = this.aim.y = this.aim.magnitude = 0;
      this.meaningful = false;
      this.freshActivity = false;
      return this.syncResult();
    }

    applyRadialDeadZoneInto(pad.axes[0] ?? 0, pad.axes[1] ?? 0, settings.leftStickDeadZone, 1, this.move);
    applyRadialDeadZoneInto(pad.axes[2] ?? 0, pad.axes[3] ?? 0, settings.rightStickDeadZone, 1.35, this.aim);
    const sensitivityScale = Math.min(1, this.aim.magnitude * settings.aimSensitivity) / Math.max(0.0001, this.aim.magnitude);
    if (this.aim.magnitude > 0) {
      this.aim.x *= sensitivityScale;
      this.aim.y *= sensitivityScale;
      this.aim.magnitude = Math.min(1, this.aim.magnitude * settings.aimSensitivity);
    }
    const set = (action: InputAction, down: boolean): void => { if (down) this.heldActions[ACTION_INDEX[action]] = 1; };
    set('interact', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.south));
    set('mine', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.east));
    set('fence', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.west));
    set('turret', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.north));
    set('dash', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.leftBumper));
    set('shield', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.rightBumper));
    set('fire', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.rightTrigger, 0.25));
    set('pause', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.start));
    set('confirm', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.south));
    set('cancel', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.east));
    set('navigateUp', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.dpadUp) || this.move.y < -0.72);
    set('navigateDown', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.dpadDown) || this.move.y > 0.72);
    set('navigateLeft', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.dpadLeft) || this.move.x < -0.72);
    set('navigateRight', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.dpadRight) || this.move.x > 0.72);
    set('pageLeft', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.leftTrigger, 0.55));
    set('pageRight', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.rightTrigger, 0.55));
    set('tabLeft', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.leftBumper));
    set('tabRight', buttonDown(pad, STANDARD_GAMEPAD_BUTTON.rightBumper));
    this.meaningful = this.move.magnitude > 0 || this.aim.magnitude > 0 || this.heldActions.some((value) => value === 1);
    return this.syncResult();
  }

  private isMeaningful(pad: BrowserGamepadLike, settings: ControllerSettings): boolean {
    const left = Math.hypot(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const right = Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    return left > settings.leftStickDeadZone + 0.04
      || right > settings.rightStickDeadZone + 0.04
      || pad.buttons.some((button) => button.pressed || button.value >= 0.25);
  }

  private hasFreshActivity(pad: BrowserGamepadLike, settings: ControllerSettings): boolean {
    const previous = this.priorInputs.get(pad.index) ?? new Float32Array(5);
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    let buttonMask = 0;
    for (let index = 0; index < Math.min(24, pad.buttons.length); index += 1) {
      if (pad.buttons[index].pressed || pad.buttons[index].value >= 0.25) buttonMask |= 1 << index;
    }
    const meaningful = this.isMeaningful(pad, settings);
    const fresh = meaningful && (
      Math.abs(lx - previous[0]) > 0.06
      || Math.abs(ly - previous[1]) > 0.06
      || Math.abs(rx - previous[2]) > 0.06
      || Math.abs(ry - previous[3]) > 0.06
      || buttonMask !== previous[4]
    );
    previous[0] = lx;
    previous[1] = ly;
    previous[2] = rx;
    previous[3] = ry;
    previous[4] = buttonMask;
    this.priorInputs.set(pad.index, previous);
    return fresh;
  }

  private clearResult(): void {
    this.connected = false;
    this.supported = false;
    this.id = '';
    this.family = 'generic';
    this.meaningful = false;
    this.freshActivity = false;
    this.move.x = this.move.y = this.move.magnitude = 0;
    this.aim.x = this.aim.y = this.aim.magnitude = 0;
    this.heldActions.fill(0);
    this.priorInputs.clear();
  }

  private syncResult(): GamepadPollResult {
    this.result.connected = this.connected;
    this.result.supported = this.supported;
    this.result.index = this.activeIndex;
    this.result.id = this.id;
    this.result.family = this.family;
    this.result.meaningful = this.meaningful;
    this.result.freshActivity = this.freshActivity;
    return this.result;
  }
}

const GAMEPAD_GLYPHS: Record<GamepadFamily, Partial<Record<InputAction, string>>> = {
  xbox: { interact: 'A', confirm: 'A', cancel: 'B', mine: 'B', fence: 'X', turret: 'Y', dash: 'LB', shield: 'RB', fire: 'RT', pause: 'MENU' },
  playstation: { interact: 'CROSS', confirm: 'CROSS', cancel: 'CIRCLE', mine: 'CIRCLE', fence: 'SQUARE', turret: 'TRIANGLE', dash: 'L1', shield: 'R1', fire: 'R2', pause: 'OPTIONS' },
  generic: { interact: 'SOUTH', confirm: 'SOUTH', cancel: 'EAST', mine: 'EAST', fence: 'WEST', turret: 'NORTH', dash: 'L1', shield: 'R1', fire: 'R2', pause: 'START' }
};

export function resolveActionPrompt(
  action: InputAction,
  device: InputDevice,
  family: GamepadFamily,
  keyboardFallback: string
): string {
  return device === 'gamepad' ? GAMEPAD_GLYPHS[family][action] ?? keyboardFallback : keyboardFallback;
}
