import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModOperationStatus,
  MOD_OPERATION_STATUS_DURATION_MS
} from '../src/game/mods/ModOperationStatus.ts';

const wallet = { credits: 625, coreTokens: 7, plasmaChips: 2, fluxCores: 1 };

test('successful Mod operations use the success presentation', () => {
  assert.deepEqual(buildModOperationStatus({ ok: true, message: 'Upgrade complete.' }, wallet), {
    message: 'UPGRADE COMPLETE.',
    tone: 'success'
  });
  assert.ok(MOD_OPERATION_STATUS_DURATION_MS >= 3_000 && MOD_OPERATION_STATUS_DURATION_MS <= 4_000);
});

test('currency failures include the currently available balance and use error color semantics', () => {
  assert.deepEqual(buildModOperationStatus({ ok: false, message: 'Requires 5 Plasma Chips.' }, wallet), {
    message: 'REQUIRES 5 PLASMA CHIPS. // 2 AVAILABLE',
    tone: 'error'
  });
  assert.deepEqual(buildModOperationStatus({ ok: false, message: 'Requires 900 Credits.' }, wallet), {
    message: 'REQUIRES 900 CREDITS. // 625 AVAILABLE',
    tone: 'error'
  });
});

test('equip limits and maximum-rank feedback use the warning presentation', () => {
  assert.equal(buildModOperationStatus({ ok: false, message: 'Only one Legendary Mod may be equipped.' }, wallet).tone, 'warning');
  assert.equal(buildModOperationStatus({ ok: false, message: 'Mod card is already at maximum level.' }, wallet).tone, 'warning');
});
