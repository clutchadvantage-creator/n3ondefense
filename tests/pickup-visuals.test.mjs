import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');

test('Every pickup type uses the same compact neon shell with a distinct center icon', () => {
  assert.match(arena, /const visualColor = type === 'credits' \? 0xf5ff58 : color/);
  assert.match(arena, /const visual = this\.createPickupVisualShell\(container, visualColor, x, y, type\)/);
  assert.match(arena, /const haloRadius = 18/);
  assert.match(arena, /const scanRing = this\.add\.circle\(0, 0, 15/);
  assert.match(arena, /const orbitPath = this\.add\.circle\(0, 0, 20/);
  for (const type of ['health', 'energy', 'damageBoost', 'speedBoost', 'rapidFire', 'credits', 'coreToken']) {
    assert.match(arena, new RegExp(`type === '${type}'`));
  }
  assert.match(arena, /this\.add\.text\(0, -1, '\\u00a2'/);
  assert.doesNotMatch(arena, /this\.add\.circle\(0, 0, 22/);
});

test('Pickup accents use bounded shared-frame animation and preserve Loot Satellites', () => {
  assert.match(arena, /private readonly pickupVisuals = new WeakMap/);
  assert.match(arena, /const satellites:[\s\S]*?\[0, 1, 2\]\.map/);
  assert.match(arena, /hasInfusion\('pickup-orbit'\)/);
  assert.match(arena, /visual\.infusionOrbit\?\.setRotation/);
  assert.match(arena, /private updatePickupVisual\(/);
  assert.match(arena, /visual\.iconRig\.setRotation\(-container\.rotation\)/);
  const updater = arena.match(/private updatePickupVisual\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(updater, /tweens\.add|time\.addEvent|new /);
});

test('Pickups drift, respect arena geometry, and softly separate without physics bodies', () => {
  assert.match(arena, /private readonly pickupMotion = new WeakMap/);
  assert.match(arena, /this\.updateFloatingPickupMotion\(now, dt\)/);
  assert.match(arena, /this\.separateFloatingPickups\(\)/);
  assert.match(arena, /const driftSpeed = 10\.5 \+ motionSeed % 4\.5/);
  assert.match(arena, /Math\.pow\(0\.994, dt \* 60\), -18, 18/);
  assert.match(arena, /setY\(Math\.sin\(now \* 0\.003 \+ visual\.phase\) \* 2\.2\)/);
  assert.match(arena, /motion\.velocityX = Phaser\.Math\.Clamp/);
  assert.match(arena, /for \(const wall of this\.wallRects\)/);
  assert.match(arena, /const separationDistance = 35/);
  assert.match(arena, /const impulse = \(secondNormalSpeed - firstNormalSpeed\) \* 0\.42/);
  const motionUpdater = arena.match(/private updateFloatingPickupMotion\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(motionUpdater, /physics\.add|add\.overlap|add\.collider/);
});

test('Pickup rewards, telemetry, and the existing enemy-drop sound remain unchanged', () => {
  assert.match(arena, /if \(source === 'enemy'\) this\.audio\.playSfx\('pickup'\)/);
  assert.match(arena, /if \(type === 'credits'\) \{[\s\S]*?this\.roundCredits \+= credits;[\s\S]*?this\.totalCreditsCollected \+= credits;/);
  assert.match(arena, /GameplayTelemetryRecorder\.recordPickupCollected\(type, source, requestedRestoration, appliedRestoration\)/);
  assert.match(arena, /this\.pickups\.push\(\{ type, sprite: p, expiresAt:[\s\S]*?source: 'enemy' \}\)/);
});
