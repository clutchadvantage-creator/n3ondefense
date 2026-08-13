import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');

test('Credits use an explicit upright neon currency emblem instead of the old square-like diamond', () => {
  assert.match(arena, /const neonYellow = 0xf5ff58/);
  assert.match(arena, /const glyphGlow = this\.add\.text\(0, 0, '¢'/);
  assert.match(arena, /const glyph = this\.add\.text\(0, -1, '¢'/);
  assert.match(arena, /fontStyle: 'bold'/);
  assert.doesNotMatch(arena, /const diamond = this\.add\.polygon/);
});

test('Credit pickup accents use bounded shared-frame animation rather than extra permanent tweens', () => {
  assert.match(arena, /private readonly creditPickupVisuals = new WeakMap/);
  assert.match(arena, /const satellites:[\s\S]*?\[0, 1, 2\]\.map/);
  assert.match(arena, /private updateCreditPickupVisual\(/);
  assert.match(arena, /visual\.orbitRig\.setRotation\(now \* 0\.0034\)/);
  assert.match(arena, /visual\.glyph\.setRotation\(-container\.rotation\)/);
  const updater = arena.match(/private updateCreditPickupVisual\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(updater, /tweens\.add|time\.addEvent|new /);
});

test('Credit pickup rewards and collection behavior remain unchanged', () => {
  assert.match(arena, /credits: 0xf2ff72/);
  assert.match(arena, /if \(type === 'credits'\) \{[\s\S]*?this\.roundCredits \+= credits;[\s\S]*?this\.totalCreditsCollected \+= credits;/);
  assert.match(arena, /this\.pickups\.push\(\{ type, sprite: p, expiresAt:[\s\S]*?source: 'enemy' \}\)/);
});
