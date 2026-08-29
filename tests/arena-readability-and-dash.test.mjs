import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveSweptCircleMotion } from '../src/game/physics/SweptCircleCollision.ts';

const wall = { x: 100, y: 0, w: 20, h: 200 };

test('dash sweep stops a circular player before a thin interior wall', () => {
  const result = resolveSweptCircleMotion(50, 100, 180, 100, 12, [wall]);
  assert.equal(result.hit, true);
  assert.ok(result.x < 88);
  assert.equal(result.y, 100);
  assert.equal(result.normalX, -1);
});

test('diagonal dash keeps its tangent and slides along a wall', () => {
  const result = resolveSweptCircleMotion(50, 40, 150, 140, 12, [wall]);
  assert.equal(result.hit, true);
  assert.ok(result.x < 88);
  assert.ok(result.y > 130);
  assert.equal(result.normalX, -1);
  assert.equal(result.normalY, 0);
});

test('dash sweep resolves a joined corner without crossing either wall', () => {
  const result = resolveSweptCircleMotion(50, 50, 160, 160, 12, [
    wall,
    { x: 0, y: 100, w: 200, h: 20 }
  ]);
  assert.equal(result.hit, true);
  assert.ok(result.x < 88);
  assert.ok(result.y < 88);
  assert.equal(result.normalX, -1);
  assert.equal(result.normalY, -1);
});

test('dash sweep treats the outer arena boundary as solid', () => {
  const result = resolveSweptCircleMotion(100, 100, -50, 100, 12, [
    { x: 0, y: 0, w: 30, h: 200 }
  ]);
  assert.equal(result.hit, true);
  assert.ok(result.x > 42);
  assert.equal(result.normalX, 1);
});

test('dash sweep catches a small collision obstacle and leaves clear routes unchanged', () => {
  const obstacle = { x: 100, y: 80, w: 30, h: 40 };
  const blocked = resolveSweptCircleMotion(50, 100, 160, 100, 12, [obstacle]);
  const clear = resolveSweptCircleMotion(50, 30, 160, 30, 12, [obstacle]);
  assert.equal(blocked.hit, true);
  assert.ok(blocked.x < 88);
  assert.deepEqual(clear, { hit: false, x: 160, y: 30, normalX: 0, normalY: 0 });
});

test('arena presentation uses illustrated graffiti, dimensional walls, hazard blockers, sand bands, and baked crowds', () => {
  const renderer = readFileSync(new URL('../src/game/arena/ArenaVisualRenderer.ts', import.meta.url), 'utf8');
  const decals = readFileSync(new URL('../src/game/rendering/EnvironmentDecalLibrary.ts', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('../src/game/arena/ArenaVisualTheme.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');

  assert.match(renderer, /createEnvironmentGraffitiArt/);
  assert.doesNotMatch(renderer, /createEnvironmentDecalText/);
  assert.match(decals, /EnvironmentGraffitiMotif/);
  assert.match(decals, /dripCount/);
  assert.match(decals, /overspray/i);
  assert.match(renderer, /wallDepth/);
  assert.match(renderer, /grounded plinth/i);
  assert.match(renderer, /drawHazardStripes/);
  assert.match(renderer, /Wide contact shadow/i);
  assert.match(renderer, /leftPromenadeWidth/);
  assert.match(renderer, /sand/i);
  assert.match(theme, /maximumSpectatorLights: 320/);
  assert.match(theme, /random\.int\(260, NEON_CITY_VISUAL_THEME\.maximumSpectatorLights\)/);
  assert.match(arena, /resolvePlayerDashWallCollision/);
  assert.match(arena, /body\.prev/);
  assert.match(arena, /this\.wallRects/);
  assert.match(arena, /body\.updateFromGameObject\(\)/);
});
