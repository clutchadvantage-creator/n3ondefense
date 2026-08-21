import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PICKUP_BALANCE } from '../src/game/config/balance/index.ts';
import { SFX_DEFINITIONS } from '../src/game/config/audio.ts';
import { RICOCHET_MAX_WALL_BOUNCES, reflectRicochetVelocity } from '../src/game/player/RicochetRules.ts';

const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');

test('Every pickup type uses the same compact neon shell with a distinct center icon', () => {
  assert.match(arena, /const visualColor = type === 'credits' \? 0xf5ff58 : color/);
  assert.match(arena, /const visual = this\.createPickupVisualShell\(container, visualColor, x, y, type\)/);
  assert.match(arena, /const haloRadius = 18/);
  assert.match(arena, /const scanRing = this\.add\.circle\(0, 0, 15/);
  assert.match(arena, /const orbitPath = this\.add\.circle\(0, 0, 20/);
  for (const type of ['health', 'energy', 'damageBoost', 'speedBoost', 'rapidFire', 'ricochet', 'grenadeRounds', 'scattershot', 'credits', 'coreToken']) {
    assert.match(arena, new RegExp(`type === '${type}'`));
  }
  assert.match(arena, /this\.add\.text\(0, -1, '\\u00a2'/);
  assert.doesNotMatch(arena, /this\.add\.circle\(0, 0, 22/);
});

test('Ricochet Rounds use a distinct pickup, preserve projectile speed, and have bounded wall bounces', () => {
  assert.equal(RICOCHET_MAX_WALL_BOUNCES, 2);
  assert.deepEqual(reflectRicochetVelocity(300, 120, true, false), { x: -300, y: 120 });
  assert.deepEqual(reflectRicochetVelocity(300, 120, false, true), { x: 300, y: -120 });
  assert.deepEqual(reflectRicochetVelocity(300, 120, true, true), { x: -300, y: -120 });
  assert.equal(Math.hypot(...Object.values(reflectRicochetVelocity(300, 120, true, false))), Math.hypot(300, 120));
  assert.ok(SFX_DEFINITIONS.some((sound) => sound.key === 'ricochetPickup'));
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/ricochetpickup.mp3', import.meta.url)));
  assert.equal(
    PICKUP_BALANCE.healthShare + PICKUP_BALANCE.energyShare + PICKUP_BALANCE.damageBoostShare
      + PICKUP_BALANCE.speedBoostShare + PICKUP_BALANCE.rapidFireShare + PICKUP_BALANCE.ricochetShare
      + PICKUP_BALANCE.grenadeRoundsShare + PICKUP_BALANCE.scattershotShare
      + PICKUP_BALANCE.creditsShare + PICKUP_BALANCE.coreTokenShare,
    1.08
  );
  assert.match(arena, /const ricochetsRemaining = now < this\.player\.buffs\.ricochetUntil \? RICOCHET_MAX_WALL_BOUNCES : 0/);
  assert.match(arena, /if \(p\.from === 'player' && \(p\.ricochetsRemaining \?\? 0\) > 0/);
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
  assert.match(arena, /const PICKUP_FLOAT_DRIFT_MIN = 12\.5/);
  assert.match(arena, /const PICKUP_FLOAT_MAX_SPEED = 20/);
  assert.match(arena, /const driftSpeed = PICKUP_FLOAT_DRIFT_MIN \+ motionSeed % PICKUP_FLOAT_DRIFT_RANGE/);
  assert.match(arena, /-PICKUP_FLOAT_MAX_SPEED, PICKUP_FLOAT_MAX_SPEED/);
  assert.match(arena, /setY\(Math\.sin\(now \* 0\.003 \+ visual\.phase\) \* 2\.2\)/);
  assert.match(arena, /motion\.velocityX = Phaser\.Math\.Clamp/);
  assert.match(arena, /for \(const wall of this\.wallRects\)/);
  assert.match(arena, /const separationDistance = 35/);
  assert.match(arena, /const PICKUP_SEPARATION_PUSH = 0\.2/);
  assert.match(arena, /const PICKUP_BOUNCE_TRANSFER = 0\.5/);
  assert.match(arena, /const PICKUP_BOUNCE_KICK = 2/);
  assert.match(arena, /const impulse = \(secondNormalSpeed - firstNormalSpeed\) \* PICKUP_BOUNCE_TRANSFER/);
  const motionUpdater = arena.match(/private updateFloatingPickupMotion\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(motionUpdater, /physics\.add|add\.overlap|add\.collider/);
});

test('Pickup rewards and telemetry remain unchanged while pickup audio is type-specific', () => {
  assert.match(arena, /this\.audio\.playSfx\(PICKUP_SFX_BY_TYPE\[type\]\)/);
  assert.match(arena, /if \(type === 'credits'\) \{[\s\S]*?this\.roundCredits \+= credits;[\s\S]*?this\.totalCreditsCollected \+= credits;/);
  assert.match(arena, /GameplayTelemetryRecorder\.recordPickupCollected\(type, source, requestedRestoration, appliedRestoration\)/);
  assert.match(arena, /this\.pickups\.push\(\{ type, sprite: p, expiresAt:[\s\S]*?source: 'enemy' \}\)/);
});
