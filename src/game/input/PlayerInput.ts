import Phaser from 'phaser';
import type { AbilityAction, AbilityBindings, InputBinding } from '../config/controls.ts';
import type { ControllerSettings } from '../config/controllerSettings.ts';
import {
  ActionStateBuffer,
  StandardGamepadReader,
  resolveActionPrompt,
  type GamepadFamily,
  type BrowserGamepadLike,
  type InputAction,
  type InputContext,
  type InputDevice
} from './ActionInput.ts';

const ABILITY_ACTIONS: readonly AbilityAction[] = ['fence', 'turret', 'mine', 'dash', 'shield'];

export class PlayerInput {
  readonly move = { x: 0, y: 0 };
  readonly controllerAim = { x: 1, y: 0, magnitude: 0 };
  private readonly states = new ActionStateBuffer();
  private readonly gamepadReader = new StandardGamepadReader();
  private readonly pointerButtons = new Uint8Array(5);
  private readonly gamepadBuffer: (BrowserGamepadLike | null)[] = [];
  private readonly fixedKeys: Record<'up' | 'left' | 'down' | 'right' | 'interact' | 'pause' | 'one' | 'two' | 'three', Phaser.Input.Keyboard.Key>;
  private readonly abilityKeys = new Map<AbilityAction, Phaser.Input.Keyboard.Key>();
  private readonly pendingPulses = new Set<InputAction>();
  private bindings: AbilityBindings;
  private settings: ControllerSettings;
  private device: InputDevice = 'keyboardMouse';
  private family: GamepadFamily = 'generic';
  private gamepadId = '';
  private gamepadIndex: number | null = null;
  private keyboardActivityAt = 0;
  private gamepadActivityAt = 0;
  private meaningfulGamepad = false;
  private deviceChanged = false;
  private disposed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    bindings: AbilityBindings,
    settings: ControllerSettings
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input unavailable.');
    this.bindings = { ...bindings };
    this.settings = { ...settings };
    this.fixedKeys = {
      up: keyboard.addKey('W'), left: keyboard.addKey('A'), down: keyboard.addKey('S'), right: keyboard.addKey('D'),
      interact: keyboard.addKey('E'), pause: keyboard.addKey('ESC'), one: keyboard.addKey('ONE'),
      two: keyboard.addKey('TWO'), three: keyboard.addKey('THREE')
    };
    this.rebuildAbilityKeys();
    scene.input.on('pointerdown', this.onPointerDown);
    scene.input.on('pointerup', this.onPointerUp);
    scene.input.on('pointermove', this.onPointerMove);
    window.addEventListener('keydown', this.onKeyActivity);
  }

  update(context: InputContext, now = performance.now()): boolean {
    this.deviceChanged = false;
    this.states.beginFrame();
    const keyboardMoveX = Number(this.fixedKeys.right.isDown) - Number(this.fixedKeys.left.isDown);
    const keyboardMoveY = Number(this.fixedKeys.down.isDown) - Number(this.fixedKeys.up.isDown);
    this.gamepadBuffer.length = 0;
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      for (let index = 0; index < pads.length; index += 1) this.gamepadBuffer[index] = pads[index];
    }
    const gamepad = this.gamepadReader.poll(this.gamepadBuffer, this.settings);
    this.meaningfulGamepad = gamepad.meaningful;
    if (gamepad.freshActivity) this.gamepadActivityAt = now;
    if (this.keyboardActivityAt > this.gamepadActivityAt && this.device !== 'keyboardMouse') this.setDevice('keyboardMouse');
    else if (this.gamepadActivityAt >= this.keyboardActivityAt && gamepad.meaningful && this.device !== 'gamepad') this.setDevice('gamepad');
    if (this.device === 'gamepad' && !gamepad.connected) this.setDevice('keyboardMouse');

    this.family = gamepad.family;
    this.gamepadId = gamepad.id;
    this.gamepadIndex = gamepad.index;
    const useGamepadMove = this.device === 'gamepad' && gamepad.move.magnitude > 0;
    this.move.x = useGamepadMove ? gamepad.move.x : keyboardMoveX;
    this.move.y = useGamepadMove ? gamepad.move.y : keyboardMoveY;
    if (gamepad.aim.magnitude > 0) {
      this.controllerAim.x = gamepad.aim.x / gamepad.aim.magnitude;
      this.controllerAim.y = gamepad.aim.y / gamepad.aim.magnitude;
      this.controllerAim.magnitude = gamepad.aim.magnitude;
    } else {
      this.controllerAim.magnitude = 0;
    }

    this.states.setHeld('fire', this.pointerButtons[0] === 1 || gamepad.held('fire') || this.pendingPulses.has('fire'));
    this.states.setHeld('interact', this.fixedKeys.interact.isDown || gamepad.held('interact') || this.pendingPulses.has('interact'));
    this.states.setHeld('pause', this.fixedKeys.pause.isDown || gamepad.held('pause') || this.pendingPulses.has('pause'));
    this.states.setHeld('selectFence', this.fixedKeys.one.isDown || this.pendingPulses.has('selectFence'));
    this.states.setHeld('selectTurret', this.fixedKeys.two.isDown || this.pendingPulses.has('selectTurret'));
    this.states.setHeld('selectMine', this.fixedKeys.three.isDown || this.pendingPulses.has('selectMine'));
    for (const action of ABILITY_ACTIONS) {
      this.states.setHeld(action, this.bindingHeld(this.bindings[action], action) || gamepad.held(action) || this.pendingPulses.has(action));
    }
    for (const action of ['confirm', 'cancel', 'navigateUp', 'navigateDown', 'navigateLeft', 'navigateRight', 'pageLeft', 'pageRight', 'tabLeft', 'tabRight'] as const) {
      this.states.setHeld(action, gamepad.held(action));
    }
    this.states.finishFrame(context);
    this.pendingPulses.clear();
    return this.deviceChanged;
  }

  held(action: InputAction): boolean { return this.states.held(action); }
  pressed(action: InputAction): boolean { return this.states.pressed(action); }
  released(action: InputAction): boolean { return this.states.released(action); }
  get activeDevice(): InputDevice { return this.device; }
  get activeGamepadFamily(): GamepadFamily { return this.family; }
  get meaningfulGamepadInput(): boolean { return this.meaningfulGamepad; }

  prompt(action: InputAction, keyboardFallback: string): string {
    return resolveActionPrompt(action, this.device, this.family, keyboardFallback);
  }

  refresh(bindings: AbilityBindings, settings: ControllerSettings): void {
    this.bindings = { ...bindings };
    this.settings = { ...settings };
    this.rebuildAbilityKeys();
  }

  clear(): void {
    this.states.clear();
    this.pointerButtons.fill(0);
    this.pendingPulses.clear();
    this.move.x = this.move.y = 0;
  }

  debugSnapshot(): Record<string, unknown> {
    return {
      device: this.device,
      gamepad: { index: this.gamepadIndex, id: this.gamepadId, family: this.family },
      move: { ...this.move },
      aim: { ...this.controllerAim },
      settings: { ...this.settings }
    };
  }

  /** Optional foundation for restrained future feedback; unsupported browsers simply no-op. */
  pulseHaptics(strength = 0.2, durationMs = 60): void {
    if (this.device !== 'gamepad' || this.gamepadIndex === null || typeof navigator.getGamepads !== 'function') return;
    const pad = navigator.getGamepads()[this.gamepadIndex] as Gamepad & {
      vibrationActuator?: { playEffect?: (type: string, parameters: Record<string, number>) => Promise<unknown> };
    };
    const result = pad?.vibrationActuator?.playEffect?.('dual-rumble', {
      duration: Math.max(0, durationMs),
      strongMagnitude: Math.max(0, Math.min(1, strength)),
      weakMagnitude: Math.max(0, Math.min(1, strength * 0.65))
    });
    void result?.catch(() => undefined);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.scene.input.off('pointerdown', this.onPointerDown);
    this.scene.input.off('pointerup', this.onPointerUp);
    this.scene.input.off('pointermove', this.onPointerMove);
    window.removeEventListener('keydown', this.onKeyActivity);
  }

  private bindingHeld(binding: InputBinding, action: AbilityAction): boolean {
    if (binding.startsWith('Mouse:')) return this.pointerButtons[Number(binding.slice(6))] === 1;
    return this.abilityKeys.get(action)?.isDown ?? false;
  }

  private rebuildAbilityKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    this.abilityKeys.clear();
    for (const action of ABILITY_ACTIONS) {
      const binding = this.bindings[action];
      if (binding.startsWith('Keyboard:')) this.abilityKeys.set(action, keyboard.addKey(binding.slice(9)));
    }
  }

  private setDevice(device: InputDevice): void {
    this.device = device;
    this.deviceChanged = true;
  }

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.button >= 0 && pointer.button < this.pointerButtons.length) this.pointerButtons[pointer.button] = 1;
    if (pointer.button === 0) this.pendingPulses.add('fire');
    for (const action of ABILITY_ACTIONS) {
      if (this.bindings[action] === `Mouse:${pointer.button}`) this.pendingPulses.add(action);
    }
    this.keyboardActivityAt = performance.now();
  };
  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.button >= 0 && pointer.button < this.pointerButtons.length) this.pointerButtons[pointer.button] = 0;
  };
  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (Math.abs(pointer.velocity.x) + Math.abs(pointer.velocity.y) > 0.5) this.keyboardActivityAt = performance.now();
  };
  private readonly onKeyActivity = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    this.keyboardActivityAt = performance.now();
    if (event.code === 'KeyE') this.pendingPulses.add('interact');
    if (event.code === 'Escape') this.pendingPulses.add('pause');
    if (event.code === 'Digit1') this.pendingPulses.add('selectFence');
    if (event.code === 'Digit2') this.pendingPulses.add('selectTurret');
    if (event.code === 'Digit3') this.pendingPulses.add('selectMine');
    for (const action of ABILITY_ACTIONS) {
      if (this.bindings[action] === `Keyboard:${event.code}`) this.pendingPulses.add(action);
    }
  };
}
