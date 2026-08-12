import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AIR_DROP_PATTERN_NAMES, createAirDropPattern } from '../src/game/systems/AirDropPatterns.ts';
import { SeededRandom } from '../src/game/systems/SeededRandom.ts';
import { GAS_HAZARD_BALANCE, getGasExposureDamage } from '../src/game/config/gasHazards.ts';

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
  assert.match(gas, /GAS_SKULL_TEXTURE/);
  assert.match(gas, /updateGasAnimation\(now, dissipateProgress\)/);
  assert.match(gas, /Three batched bubbles per cloud; no sprites, tweens, physics, or allocations/);
  assert.match(gas, /this\.drawGasBubbles\(target, index, now, time\)/);
  assert.match(gas, /Persistent logical footprint: tunneling never removes gas exposure/);
  assert.match(gas, /this\.tunnelMask\[row \* this\.densityColumns \+ column\] = 255/);
  assert.doesNotMatch(gas, /this\.density\[row \* this\.densityColumns \+ column\] = 0/);
  assert.match(gas, /if \(playerEnteredGas && now >= this\.nextGasDamageAt\)/);
  assert.match(gas, /return this\.active \|\| now < this\.recoveryUntil/);
  assert.match(arena, /isDangerWindow\(now, gasSuppressesLasers\)/);
  assert.match(arena, /bombletHazard\?\.update\(now, this\.player, hazardTargets, laserDangerWindow\)/);
  assert.match(arena, /recordPlayerDamage\('gas', damage\)/);
});

test('gas exposure starts light and scales substantially but safely with round progression', () => {
  const unlockDamage = getGasExposureDamage(GAS_HAZARD_BALANCE.unlockRound);
  const roundTenDamage = getGasExposureDamage(10);
  const roundThirtyDamage = getGasExposureDamage(30);
  const extremeRoundDamage = getGasExposureDamage(999);
  assert.equal(unlockDamage, GAS_HAZARD_BALANCE.playerDamageAtUnlock);
  assert.ok(roundTenDamage > unlockDamage);
  assert.ok(roundThirtyDamage > roundTenDamage * 1.5);
  assert.equal(extremeRoundDamage, GAS_HAZARD_BALANCE.maximumPlayerDamage);
  assert.ok(extremeRoundDamage < 100);
});
