import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UI_NAVIGATION_REPEAT,
  UiAxisHysteresis,
  UiFocusManager,
  UiInputRepeater
} from '../src/game/input/UiFocusManager.ts';
import { INPUT_ACTIONS, StandardGamepadReader } from '../src/game/input/ActionInput.ts';
import { DEFAULT_CONTROLLER_SETTINGS } from '../src/game/config/controllerSettings.ts';

const rect = (x, y, width = 40, height = 24) => ({ x, y, width, height });
const control = (id, bounds, options = {}) => ({
  id,
  getRect: () => bounds,
  activate: options.activate ?? (() => undefined),
  setFocused: options.setFocused ?? (() => undefined),
  isVisible: options.isVisible,
  isDisabled: options.isDisabled,
  isLocked: options.isLocked,
  modalDepth: options.modalDepth,
  defaultPriority: options.defaultPriority,
  destructive: options.destructive,
  adjust: options.adjust,
  scroll: options.scroll,
  neighbors: options.neighbors
});

test('focus chooses the safest high-priority default and never defaults destructive', () => {
  const manager = new UiFocusManager();
  manager.register(control('delete', rect(0, 0), { defaultPriority: 100, destructive: true }));
  manager.register(control('continue', rect(0, 50), { defaultPriority: 20 }));
  manager.register(control('secondary', rect(0, 100)));
  assert.equal(manager.currentId, 'continue');
});

test('geometric navigation follows visible rows and columns and honors explicit neighbors', () => {
  const manager = new UiFocusManager();
  manager.register(control('a', rect(0, 0), { neighbors: { right: 'd' } }));
  manager.register(control('b', rect(100, 0)));
  manager.register(control('c', rect(0, 70)));
  manager.register(control('d', rect(180, 70)));
  manager.focus('a');
  assert.equal(manager.move('right'), true);
  assert.equal(manager.currentId, 'd');
  manager.focus('a');
  assert.equal(manager.move('down'), true);
  assert.equal(manager.currentId, 'c');
});

test('disabled controls are skipped while locked controls remain inspectable but cannot activate', () => {
  let lockedActivated = 0;
  const manager = new UiFocusManager();
  manager.register(control('start', rect(0, 0)));
  manager.register(control('disabled', rect(70, 0), { isDisabled: () => true }));
  manager.register(control('locked', rect(140, 0), { isLocked: () => true, activate: () => { lockedActivated += 1; } }));
  manager.focus('start');
  manager.move('right');
  assert.equal(manager.currentId, 'locked');
  assert.equal(manager.activate(), 'blocked');
  assert.equal(lockedActivated, 0);
});

test('modal focus is trapped, safe by default, and restores prior focus after close', () => {
  const manager = new UiFocusManager();
  manager.register(control('base-a', rect(0, 0)));
  manager.register(control('base-b', rect(100, 0)));
  manager.focus('base-b');
  const removeDanger = manager.register(control('modal-confirm-delete', rect(50, 50), { modalDepth: 10, destructive: true, defaultPriority: 90 }));
  const removeCancel = manager.register(control('modal-cancel', rect(50, 90), { modalDepth: 10, defaultPriority: 20 }));
  assert.equal(manager.currentId, 'modal-cancel');
  assert.equal(manager.focus('base-a'), false, 'underlying controls remain trapped while modal controls exist');
  removeCancel();
  removeDanger();
  assert.equal(manager.currentId, 'base-b');
});

test('focus invalidation repairs filtered/destroyed selections and preserves scroll/adjust callbacks', () => {
  let visible = true;
  let adjusted = 0;
  let scrolled = 0;
  const manager = new UiFocusManager();
  manager.register(control('filtered', rect(0, 0), { isVisible: () => visible }));
  manager.register(control('document', rect(100, 0), {
    adjust: (direction) => { adjusted += direction; },
    scroll: (amount) => { scrolled += amount; }
  }));
  manager.focus('filtered');
  visible = false;
  manager.invalidate();
  assert.equal(manager.currentId, 'document');
  assert.equal(manager.adjust(1), true);
  assert.equal(manager.scroll(24), true);
  assert.equal(adjusted, 1);
  assert.equal(scrolled, 24);
});

test('stable focus ids survive dynamic card replacement and stale cleanup', () => {
  const manager = new UiFocusManager();
  const removeOld = manager.register(control('card:one', rect(0, 0)));
  manager.register(control('card:one', rect(80, 0)));
  removeOld();
  assert.equal(manager.currentId, 'card:one');
  assert.equal(manager.size, 1);
});

test('navigation repeat and analog hysteresis produce deliberate menu movement', () => {
  const repeat = new UiInputRepeater();
  assert.equal(repeat.update('right', 0, UI_NAVIGATION_REPEAT), true);
  assert.equal(repeat.update('right', 100, UI_NAVIGATION_REPEAT), false);
  assert.equal(repeat.update('right', 330, UI_NAVIGATION_REPEAT), true);
  repeat.reset();
  assert.equal(repeat.update('right', 331, UI_NAVIGATION_REPEAT), true);

  const axis = new UiAxisHysteresis();
  assert.equal(axis.update(0.5), 0);
  assert.equal(axis.update(0.8), 1);
  assert.equal(axis.update(0.6), 1);
  assert.equal(axis.update(0.4), 0);
  assert.equal(axis.update(-0.8), -1);
});

const pad = (axes) => ({
  index: 0,
  id: 'Standard Controller',
  mapping: 'standard',
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
});

test('UI thresholds stay independent of configurable gameplay dead zones and right-stick scrolling is exposed', () => {
  const reader = new StandardGamepadReader();
  const settings = { ...DEFAULT_CONTROLLER_SETTINGS, leftStickDeadZone: 0.05, rightStickDeadZone: 0.45 };
  const belowUiThreshold = reader.poll([pad([0.5, 0, 0, 0.27])], settings);
  assert.equal(belowUiThreshold.held('navigateRight'), false);
  assert.equal(belowUiThreshold.uiScrollY, 0);
  const deliberate = reader.poll([pad([0.82, 0, 0, 0.7])], settings);
  assert.equal(deliberate.held('navigateRight'), true);
  assert.equal(deliberate.uiScrollY, 0.7);
});

test('production controller action vocabulary exposes no developer or debug actions', () => {
  assert.equal(INPUT_ACTIONS.some((action) => /debug|dev|telemetry|cheat|spawn|unlock|grant|skipRound/i.test(action)), false);
});
