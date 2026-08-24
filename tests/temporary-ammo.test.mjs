import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ABILITY_BALANCE, PICKUP_BALANCE, WEAPON_BALANCE } from '../src/game/config/balance/index.ts';
import { BOMBLET_HAZARD_BALANCE } from '../src/game/config/bombletHazards.ts';
import { SFX_DEFINITIONS } from '../src/game/config/audio.ts';
import {
  SCATTERSHOT_ANGLE_OFFSETS,
  TEMPORARY_AMMO_BALANCE,
  TemporaryAmmoModeController
} from '../src/game/player/TemporaryAmmoMode.ts';
import {
  ENEMY_PICKUP_TOTAL_WEIGHT,
  ENEMY_PICKUP_WEIGHTS,
  selectEnemyPickup
} from '../src/game/player/PickupDropTable.ts';

const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');

test('temporary ammo modes refresh in Normal, extend only duration in Overdrive, replace each other, and expire', () => {
  const controller = new TemporaryAmmoModeController();
  assert.equal(controller.activeMode(0), 'normal');

  const first = controller.activate('grenade', 1_000, false);
  assert.equal(first.activeUntil, 46_000);
  assert.equal(controller.activeMode(20_000), 'grenade');
  const refreshed = controller.activate('grenade', 20_000, false);
  assert.equal(refreshed.activeUntil, 65_000);
  assert.equal(refreshed.extended, false);

  const replaced = controller.activate('scattershot', 25_000, false);
  assert.equal(replaced.replacedMode, 'grenade');
  assert.equal(replaced.activeUntil, 70_000);
  assert.equal(controller.activeMode(70_000), 'normal');

  controller.activate('scattershot', 100_000, true);
  const extended = controller.activate('scattershot', 110_000, true);
  assert.equal(extended.extended, true);
  assert.equal(extended.activeUntil, 190_000);
  const capped = controller.activate('scattershot', 115_000, true);
  assert.equal(capped.activeUntil, 205_000);
  assert.equal(controller.remainingMs(205_000), 0);
});

test('ammo pickup weights are normalized by one shared enemy table and stay uncommon without being ultra-rare', () => {
  assert.equal(ENEMY_PICKUP_TOTAL_WEIGHT, 1.08);
  const grenade = ENEMY_PICKUP_WEIGHTS.find((entry) => entry.type === 'grenadeRounds');
  const scattershot = ENEMY_PICKUP_WEIGHTS.find((entry) => entry.type === 'scattershot');
  assert.equal(grenade?.weight, PICKUP_BALANCE.grenadeRoundsShare);
  assert.equal(scattershot?.weight, PICKUP_BALANCE.scattershotShare);
  assert.ok((grenade?.weight ?? 0) < PICKUP_BALANCE.ricochetShare);
  assert.ok((grenade?.weight ?? 0) > 0.02);
  const selected = new Set(Array.from({ length: 10_000 }, (_, index) => selectEnemyPickup(index / 10_000)));
  assert.ok(selected.has('grenadeRounds'));
  assert.ok(selected.has('scattershot'));
});

test('grenade rounds use restrained direct-plus-splash behavior and the shared allocation-conscious explosion renderer', () => {
  assert.ok(TEMPORARY_AMMO_BALANCE.grenade.splashRadius < BOMBLET_HAZARD_BALANCE.blastRadius);
  assert.ok(TEMPORARY_AMMO_BALANCE.grenade.splashRadius < ABILITY_BALANCE.mine.radius);
  assert.ok(TEMPORARY_AMMO_BALANCE.grenade.splashDamageMultiplier < 0.5);
  const baseSplashDamage = WEAPON_BALANCE.damage * TEMPORARY_AMMO_BALANCE.grenade.splashDamageMultiplier;
  assert.ok(baseSplashDamage < BOMBLET_HAZARD_BALANCE.enemyDamageBase);
  assert.ok(baseSplashDamage < ABILITY_BALANCE.mine.damage);
  assert.match(arena, /this\.grenadeSplashExcludedEnemy = directlyHitEnemy/);
  assert.match(arena, /enemy === this\.grenadeSplashExcludedEnemy/);
  assert.match(arena, /this\.enemySeparationGrid\.forEachNearby\(x, y, radius, this\.applyGrenadeSplashNeighbor\)/);
  assert.match(arena, /this\.mineExplosionVfx\.emitColors\(/);
  assert.match(arena, /'ammo-grenade-round'/);
  assert.match(arena, /primaryColor,\s*this\.time\.now,\s*false\s*\);/);
});

test('scattershot is a symmetric pooled seven-pellet fan with one firing cost and bounded aggregate damage', () => {
  assert.equal(SCATTERSHOT_ANGLE_OFFSETS.length, TEMPORARY_AMMO_BALANCE.scattershot.pelletCount);
  for (let index = 0; index < SCATTERSHOT_ANGLE_OFFSETS.length; index += 1) {
    const opposite = SCATTERSHOT_ANGLE_OFFSETS[SCATTERSHOT_ANGLE_OFFSETS.length - 1 - index];
    assert.ok(Math.abs(SCATTERSHOT_ANGLE_OFFSETS[index] + opposite) < 0.000_001);
  }
  assert.ok(TEMPORARY_AMMO_BALANCE.scattershot.pelletDamageMultiplier
    * TEMPORARY_AMMO_BALANCE.scattershot.pelletCount < 2.25);
  const shooting = arena.slice(arena.indexOf('private updatePlayerShooting'), arena.indexOf('private updatePlanting'));
  assert.equal((shooting.match(/this\.player\.spendEnergy\(/g) ?? []).length, 1);
  assert.equal((shooting.match(/this\.player\.heat \+=/g) ?? []).length, 1);
  assert.match(shooting, /SCATTERSHOT_ANGLE_OFFSETS/);
  assert.match(shooting, /this\.projectiles\.push\(this\.obtainProjectile\(/);
  assert.match(arena, /'ammo-scatter-pellet'/);
  assert.match(arena, /ammoMode: projectile\.ammoMode/);
  assert.match(arena, /findSpecialAmmoHitEnemy/);
});

test('special ammo pickups use dedicated audio, shared pickup visuals, HUD timers, telemetry, and round cleanup', () => {
  const pickupPresentation = readFileSync(new URL('../src/game/loot/GameplayPickupPresentation.ts', import.meta.url), 'utf8');
  for (const [key, file] of [
    ['grenadeRoundsPickup', 'grenadeshotpickup.mp3'],
    ['scattershotPickup', 'scattershotpickup.mp3']
  ]) {
    assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === key));
    assert.ok(existsSync(new URL(`../public/assets/audio/soundeffects/${file}`, import.meta.url)));
    assert.ok(audio.includes(`${key}: 'soundeffects/${file}'`));
  }
  assert.match(pickupPresentation, /grenadeRounds: 'grenadeRoundsPickup'/);
  assert.match(pickupPresentation, /scattershot: 'scattershotPickup'/);
  assert.match(arena, /this\.temporaryAmmo\.activate\('grenade'/);
  assert.match(arena, /this\.temporaryAmmo\.activate\('scattershot'/);
  assert.match(arena, /'GRENADE ROUNDS' : 'SCATTERSHOT'/);
  assert.match(arena, /this\.temporaryAmmo\.reset\(\)/);
  assert.match(arena, /grenadeRounds: false/);
  assert.match(arena, /scattershot: false/);
});
