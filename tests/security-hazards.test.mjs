import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AIR_DROP_PATTERN_NAMES, createAirDropPattern } from '../src/game/systems/AirDropPatterns.ts';
import { SeededRandom } from '../src/game/systems/SeededRandom.ts';
import { GAS_HAZARD_BALANCE } from '../src/game/config/gasHazards.ts';

test('shared air-drop patterns provide deterministic bomblet and gas-canister layouts', () => {
  const bounds = { x: 100, y: 80, w: 1200, h: 800 };
  for (let pattern = 0; pattern < AIR_DROP_PATTERN_NAMES.length; pattern += 1) {
    const create = () => createAirDropPattern({
      pattern,
      count: 8,
      bounds,
      safeEdgeInset: 72,
      minimumSpacing: 58,
      random: new SeededRandom(42),
      isBlocked: () => false
    });
    const first = create();
    assert.deepEqual(create(), first);
    assert.equal(first.length, 8);
    for (const point of first) {
      assert.ok(point.x >= bounds.x + 72 && point.x <= bounds.x + bounds.w - 72);
      assert.ok(point.y >= bounds.y + 72 && point.y <= bounds.y + bounds.h - 72);
    }
  }
});

test('expanded lasers use fixed reusable segment storage and include escape-route patterns', () => {
  const source = readFileSync(new URL('../src/game/systems/LaserSecuritySystem.ts', import.meta.url), 'utf8');
  assert.match(source, /'PINWHEEL FRACTURE'/);
  assert.match(source, /'BREACH SWEEP'/);
  assert.match(source, /'REVERSAL CASCADE'/);
  assert.match(source, /MAX_LASER_SEGMENTS = 12/);
  assert.match(source, /if \(suppressed\) \{[\s\S]*?this\.graphics\.clear\(\)/);
  assert.doesNotMatch(source, /new Phaser\.GameObjects.*Laser/);
});

test('gas phases remain occasional, suppress lasers, permit bomblets, and carve a density-matched path', () => {
  assert.ok(GAS_HAZARD_BALANCE.baseCooldownMs >= 60_000);
  assert.ok(GAS_HAZARD_BALANCE.activeMs < GAS_HAZARD_BALANCE.baseCooldownMs);
  assert.ok(GAS_HAZARD_BALANCE.maximumPlayerDamage < 100);
  const gas = readFileSync(new URL('../src/game/systems/GasHazardSystem.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(gas, /createAirDropPattern/);
  assert.match(gas, /Uint8Array/);
  assert.match(gas, /gasLayer\.erase\(this\.tunnelBrush\)/);
  assert.match(gas, /this\.density\[row \* this\.densityColumns \+ column\] = 0/);
  assert.match(gas, /return this\.active \|\| now < this\.recoveryUntil/);
  assert.match(arena, /isDangerWindow\(now, gasSuppressesLasers\)/);
  assert.match(arena, /bombletHazard\?\.update\(now, this\.player, hazardTargets, laserDangerWindow\)/);
  assert.match(arena, /recordPlayerDamage\('gas', damage\)/);
});
