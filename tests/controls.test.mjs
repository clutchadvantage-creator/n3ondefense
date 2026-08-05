import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ABILITY_BINDINGS, bindingLabel, normalizeAbilityBindings } from '../src/game/config/controls.ts';

test('missing controls migrate to unique defaults', () => {
  assert.deepEqual(normalizeAbilityBindings(undefined), DEFAULT_ABILITY_BINDINGS);
});

test('reserved primary fire and duplicate ability bindings are normalized', () => {
  const normalized = normalizeAbilityBindings({ fence: 'Mouse:0', turret: 'Keyboard:KeyZ', mine: 'Keyboard:KeyZ' });
  assert.notEqual(normalized.fence, 'Mouse:0');
  assert.equal(new Set(Object.values(normalized)).size, Object.values(normalized).length);
  assert.equal(normalized.turret, 'Keyboard:KeyZ');
});

test('mouse binding labels are player readable', () => {
  assert.equal(bindingLabel('Mouse:1'), 'MIDDLE MOUSE');
  assert.equal(bindingLabel('Keyboard:Space'), 'SPACE');
});
