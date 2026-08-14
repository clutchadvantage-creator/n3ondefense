import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const boost = readFileSync(new URL('../src/game/systems/BoostVisualSystem.ts', import.meta.url), 'utf8');

test('dash boost uses a continuous layered flame and paired smoke-vortex presentation', () => {
  assert.match(arena, /new BoostVisualSystem\(/);
  assert.match(arena, /this\.boostVisual\.start\(this\.player, angle, now, this\.player\.dashUntil\)/);
  assert.match(arena, /this\.boostVisual\.update\(this\.player, now\)/);
  assert.doesNotMatch(arena, /for \(let i = 0; i < 9; i \+= 1\)/);
  assert.match(boost, /drawFlameCone/);
  assert.match(boost, /fillTriangle/);
  assert.match(boost, /emitSmokeVortex/);
  assert.match(boost, /Math\.sin\(progress \* Math\.PI \* 3\.2/);
  assert.match(boost, /side: -1 \| 1/);
});

test('boost visuals reuse the combat FX pool and cap temporary particle pressure', () => {
  assert.match(arena, /obtain: \(state\) => this\.obtainFxCircle\(state\)/);
  assert.match(arena, /this\.retireFxCircle\(circle\)/);
  assert.match(boost, /maximumTrackedParticles: 72/);
  assert.match(boost, /this\.particles\.size >= BOOST_VISUAL_CONFIG\.maximumTrackedParticles/);
  assert.match(boost, /this\.scene\.tweens\.killTweensOf\(particle\)/);
  assert.match(arena, /this\.boostVisual\?\.reset\(\)/);
  assert.match(arena, /this\.boostVisual\?\.destroy\(\)/);
});

test('boost upgrade remains presentation-only and preserves authoritative dash behavior', () => {
  assert.match(arena, /this\.player\.spendEnergy\(PLAYER_BALANCE\.dashEnergyCost\)/);
  assert.match(arena, /this\.player\.dashTowardPoint\(aim\.x, aim\.y, now\)/);
  assert.match(boost, /never changes movement, timing, energy, or physics/);
  assert.doesNotMatch(boost, /setVelocity|dashUntil\s*=|spendEnergy|takeDamage/);
});
