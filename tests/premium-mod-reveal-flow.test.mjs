import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolvePremiumModRevealReturn,
  shouldRequestPremiumRevealPointerLock
} from '../src/game/mods/PremiumModRevealFlow.ts';

const arenaSource = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const presenterSource = readFileSync(new URL('../src/game/mods/ModAcquisitionPresenter.ts', import.meta.url), 'utf8');
const revealSource = readFileSync(new URL('../src/game/scenes/LegendaryModRevealScene.ts', import.meta.url), 'utf8');

const liveMouse = {
  requiresAcknowledgement: true,
  pointerWasLocked: true,
  pointerIsLocked: false,
  mouseInput: true,
  roundMustRemainPaused: false,
  bossCollection: false
};

test('Supreme acknowledgement releases its pointer and reuses the trusted Continue activation', () => {
  assert.equal(shouldRequestPremiumRevealPointerLock(liveMouse), true);
  assert.match(arenaSource, /this\.setMenuCursorMode\(\);\s*this\.pointerLock\?\.hidePrompt\(\);\s*this\.pointerLock\?\.release\(\);/);
  assert.match(revealSource, /PREMIUM_MOD_REVEAL_ACKNOWLEDGE_EVENT, this\.token/);
  assert.match(presenterSource, /token !== this\.legendaryToken/);
  assert.match(presenterSource, /this\.hooks\.onLegendaryAcknowledge\(this\.active\)/);
});

test('live gameplay resumes directly when capture succeeds and safely gates when it fails', () => {
  assert.equal(resolvePremiumModRevealReturn({ ...liveMouse, pointerIsLocked: true }), 'resume-gameplay');
  assert.equal(resolvePremiumModRevealReturn(liveMouse), 'await-pointer-lock');
  assert.match(arenaSource, /showResume\('CLICK TO RESUME OPERATION'\)/);
});

test('completed, failed, and already-paused rounds keep a visible menu pointer for their handoff', () => {
  const paused = { ...liveMouse, roundMustRemainPaused: true };
  assert.equal(shouldRequestPremiumRevealPointerLock(paused), false);
  assert.equal(resolvePremiumModRevealReturn(paused), 'remain-paused');
  assert.match(arenaSource, /returnMode === 'remain-paused'[\s\S]*?this\.setMenuCursorMode\(\)/);
  assert.match(arenaSource, /transitionAfterModReveals\([\s\S]*?modAcquisitionPresenter\.whenIdle/);
});

test('boss-loot collection retains its pointer and gamepad does not request browser capture', () => {
  const collection = { ...liveMouse, bossCollection: true };
  const gamepad = { ...liveMouse, mouseInput: false };
  assert.equal(shouldRequestPremiumRevealPointerLock(collection), false);
  assert.equal(resolvePremiumModRevealReturn(collection), 'boss-collection');
  assert.equal(shouldRequestPremiumRevealPointerLock(gamepad), false);
  assert.equal(resolvePremiumModRevealReturn(gamepad), 'resume-gameplay');
});
