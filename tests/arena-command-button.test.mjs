import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ArenaCommandButton, calculateArenaCommandLayout } from '../src/game/ui/ArenaCommandButton.ts';

const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('Arena command layout converts logical canvas coordinates without using the world camera', () => {
  assert.deepEqual(
    calculateArenaCommandLayout(
      { left: 110, top: 70, width: 1500, height: 1000 },
      { left: 10, top: 20, width: 1800, height: 1100 },
      1000,
      500,
      500,
      250,
      200,
      40
    ),
    { left: 850, top: 550, width: 300, height: 80 }
  );
});

test('Arena command is clickable at its rendered DOM position and invokes its action once', () => {
  const priorDocument = globalThis.document;
  const listeners = new Map();
  const element = {
    style: {},
    disabled: false,
    type: '',
    className: '',
    textContent: '',
    removed: false,
    setAttribute() {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    remove() { this.removed = true; },
    click() { listeners.get('click')?.(); }
  };
  const overlay = {
    appended: null,
    append(child) { this.appended = child; },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 1800, height: 1100 })
  };
  globalThis.document = {
    querySelector: () => overlay,
    createElement: () => element
  };

  try {
    let activations = 0;
    const scene = {
      game: { canvas: { getBoundingClientRect: () => ({ left: 110, top: 70, width: 1500, height: 1000 }) } },
      scale: { width: 1000, height: 500 }
    };
    const command = new ArenaCommandButton(scene, 'READY // ENGAGE', () => { activations += 1; });
    command.setGamePosition(500, 250, 200, 40);

    assert.equal(overlay.appended, element);
    assert.equal(element.style.left, '850px');
    assert.equal(element.style.top, '550px');
    assert.equal(element.style.width, '300px');
    assert.equal(element.style.height, '80px');
    element.click();
    element.click();
    assert.equal(activations, 1);

    command.destroy();
    assert.equal(element.removed, true);
    assert.equal(listeners.has('click'), false);
  } finally {
    globalThis.document = priorDocument;
  }
});

test('Arena commands explicitly restore pointer input above the pointer-transparent UI root', () => {
  assert.match(styles, /#game-ui-root \{[\s\S]*?pointer-events: none/);
  assert.match(styles, /\.arena-command-button \{[\s\S]*?pointer-events: auto/);
  assert.match(styles, /\.arena-command-button \{[\s\S]*?transform: translate\(-50%, -50%\)/);
});
