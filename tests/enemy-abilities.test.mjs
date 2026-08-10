import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENEMY_BALANCE,
  PLAYER_BALANCE,
  TANK_HOMING_MISSILE_BALANCE,
  WEAPON_BALANCE
} from '../src/game/config/balance/index.ts';
import {
  getTankHomingMissileSpeed,
  steerTankHomingMissile
} from '../src/game/enemies/HomingMissile.ts';

const angularDistance = (from, to) => Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));

test('tank missiles are threatening, interceptable, and cannot pursue forever', () => {
  assert.ok(TANK_HOMING_MISSILE_BALANCE.cooldownMs > TANK_HOMING_MISSILE_BALANCE.lifetimeMs);
  assert.ok(TANK_HOMING_MISSILE_BALANCE.lifetimeMs <= 6500);
  assert.ok(TANK_HOMING_MISSILE_BALANCE.damage >= ENEMY_BALANCE.shooter.damage * 2);
  assert.ok(TANK_HOMING_MISSILE_BALANCE.damage < PLAYER_BALANCE.maxHealth * 0.25);
  assert.ok(TANK_HOMING_MISSILE_BALANCE.health > WEAPON_BALANCE.damage);
  assert.ok(TANK_HOMING_MISSILE_BALANCE.health <= WEAPON_BALANCE.damage * 2);
});

test('tank missile speed stays slightly below the operative current speed', () => {
  for (const playerSpeed of [PLAYER_BALANCE.moveSpeed, 320, 420]) {
    const missileSpeed = getTankHomingMissileSpeed(playerSpeed);
    assert.equal(missileSpeed, playerSpeed * TANK_HOMING_MISSILE_BALANCE.speedMultiplier);
    assert.ok(missileSpeed < playerSpeed);
    assert.ok(missileSpeed >= playerSpeed * 0.8);
  }
});

test('tank missile steering takes the shortest bounded turn across angle wraparound', () => {
  const currentAngle = Math.PI - 0.04;
  const targetAngle = -Math.PI + 0.04;
  const nextAngle = steerTankHomingMissile(currentAngle, targetAngle, 16);
  const maximumTurn = TANK_HOMING_MISSILE_BALANCE.turnRateRadiansPerSecond * 0.016;

  assert.ok(Math.abs(nextAngle - currentAngle) <= maximumTurn + Number.EPSILON);
  assert.ok(angularDistance(nextAngle, targetAngle) < angularDistance(currentAngle, targetAngle));
});
