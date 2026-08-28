import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ABILITY_BALANCE, PICKUP_BALANCE, WEAPON_BALANCE } from '../src/game/config/balance/index.ts';
import { BOMBLET_HAZARD_BALANCE } from '../src/game/config/bombletHazards.ts';
import { SFX_DEFINITIONS } from '../src/game/config/audio.ts';
import {
  SCATTERSHOT_ANGLE_OFFSETS,
  TEMPORARY_AMMO_BALANCE,
  TemporaryAmmoModeController,
  grenadeArcHeight,
  grenadeBounceCountForSequence,
  grenadeFireIntervalMs
} from '../src/game/player/TemporaryAmmoMode.ts';
import {
  TEMPORARY_OFFENSIVE_EFFECTS,
  TURRET_WEAPON_SYNC_DURATION_SCALE,
  TurretWeaponSyncController
} from '../src/game/player/TemporaryOffensiveEffects.ts';
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
  assert.equal(ENEMY_PICKUP_TOTAL_WEIGHT, 1.064);
  const grenade = ENEMY_PICKUP_WEIGHTS.find((entry) => entry.type === 'grenadeRounds');
  const scattershot = ENEMY_PICKUP_WEIGHTS.find((entry) => entry.type === 'scattershot');
  assert.equal(grenade?.weight, PICKUP_BALANCE.grenadeRoundsShare);
  assert.equal(scattershot?.weight, PICKUP_BALANCE.scattershotShare);
  assert.equal(grenade?.weight, 0.032);
  assert.equal(scattershot?.weight, 0.032);
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
  assert.match(arena, /this\.grenadeSplashExcludedEnemy = primaryEnemy/);
  assert.match(arena, /enemy === this\.grenadeSplashExcludedEnemy/);
  assert.match(arena, /this\.enemySeparationGrid\.forEachNearby\(x, y, radius, this\.applyGrenadeSplashNeighbor\)/);
  assert.match(arena, /this\.mineExplosionVfx\.emitColors\(/);
  assert.match(arena, /'ammo-grenade-round'/);
  assert.match(arena, /primaryColor,\s*this\.time\.now,\s*false\s*\);/);
});

test('grenade rounds use a bounded permanent-progression cadence and deterministic two-to-three bounce arcs', () => {
  assert.equal(grenadeFireIntervalMs(9), TEMPORARY_AMMO_BALANCE.grenade.baseFireIntervalMs);
  assert.equal(grenadeFireIntervalMs(99), TEMPORARY_AMMO_BALANCE.grenade.minimumFireIntervalMs);
  assert.equal(grenadeFireIntervalMs(0), TEMPORARY_AMMO_BALANCE.grenade.maximumFireIntervalMs);
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => grenadeBounceCountForSequence(index)), [2, 3, 2, 3, 2, 3]);
  assert.equal(grenadeArcHeight(0, 0, 100, 40), 0);
  assert.ok(Math.abs(grenadeArcHeight(50, 0, 100, 40) - 40) < 0.000_001);
  assert.ok(Math.abs(grenadeArcHeight(100, 0, 100, 40)) < 0.000_001);
  assert.ok(TEMPORARY_AMMO_BALANCE.grenade.fuseMs < TEMPORARY_AMMO_BALANCE.grenade.projectileLifetimeMs);
  const shooting = arena.slice(arena.indexOf('private updatePlayerShooting'), arena.indexOf('private updatePlanting'));
  assert.match(shooting, /grenadeFireIntervalMs\(this\.player\.weapon\.fireRate\)/);
  assert.match(arena, /this\.consumeGrenadeBounce\(projectile, now\)/);
  assert.match(arena, /this\.bounceGrenadeFromWall\(p, now\)/);
});

test('Legendary Weapon Sync shares only registered offensive effects for eighty percent of player duration', () => {
  assert.equal(TURRET_WEAPON_SYNC_DURATION_SCALE, 0.8);
  assert.deepEqual(Object.keys(TEMPORARY_OFFENSIVE_EFFECTS).sort(), ['damageBoost', 'grenadeRounds', 'scattershot']);
  for (const effect of Object.values(TEMPORARY_OFFENSIVE_EFFECTS)) {
    assert.equal(effect.affectsPlayerWeapon, true);
    assert.equal(effect.turretShareEligible, true);
    assert.equal(effect.turretDurationScale, 0.8);
  }

  const sync = new TurretWeaponSyncController();
  assert.equal(sync.inherit('grenadeRounds', 1_000, 41_000, true), 33_000);
  assert.equal(sync.activeAmmoMode(32_999, 'grenade', true), 'grenade');
  assert.equal(sync.activeAmmoMode(33_000, 'grenade', true), null);
  assert.equal(sync.inherit('scattershot', 5_000, 45_000, false), 0);
  assert.equal(sync.activeAmmoMode(5_001, 'scattershot', false), null);

  assert.equal(sync.inherit('damageBoost', 10_000, 50_000, true), 42_000);
  assert.equal(sync.damageBoostActive(41_999, 50_000, true), true);
  assert.equal(sync.damageBoostActive(42_000, 50_000, true), false);
  sync.reset();
  assert.equal(sync.activeAmmoUntil(10_000), 0);
  assert.equal(sync.activeDamageUntil(10_000), 0);

  assert.match(arena, /this\.modRuntime\.turretWeaponSyncEnabled\(\)/);
  assert.match(arena, /TEMPORARY_AMMO_BALANCE\.grenade\.turretFireIntervalMs/);
  assert.match(arena, /this\.turretWeaponSync\.reset\(\)/);
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
