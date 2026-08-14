import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLUX_CORE_BALANCE, getFluxCoreCapacity, getFluxCoreHealth } from '../src/game/config/fluxCores.ts';

test('Flux Core population scales from three early cores to a hard cap of six', () => {
  assert.equal(getFluxCoreCapacity(1), 3);
  assert.equal(getFluxCoreCapacity(7), 3);
  assert.equal(getFluxCoreCapacity(8), 4);
  assert.equal(getFluxCoreCapacity(15), 5);
  assert.equal(getFluxCoreCapacity(22), 6);
  assert.equal(getFluxCoreCapacity(999), FLUX_CORE_BALANCE.absoluteMaximum);
});

test('Flux Core durability scales without becoming unbounded', () => {
  assert.equal(getFluxCoreHealth(1), FLUX_CORE_BALANCE.baseHealth);
  assert.ok(getFluxCoreHealth(15) > getFluxCoreHealth(1));
  assert.equal(getFluxCoreHealth(999), FLUX_CORE_BALANCE.maximumHealth);
  assert.ok(FLUX_CORE_BALANCE.laserShutdownMs > FLUX_CORE_BALANCE.recoveryAlarmLeadMs);
  assert.ok(FLUX_CORE_BALANCE.floorRiseMs >= 1000);
  assert.ok(FLUX_CORE_BALANCE.windowOpenMs > 0);
});

test('Flux Core deployments are staggered and wait for a continuous laser-online recovery window', () => {
  assert.ok(FLUX_CORE_BALANCE.perCoreSpawnMinMs > 0);
  assert.ok(FLUX_CORE_BALANCE.perCoreSpawnMaxMs > FLUX_CORE_BALANCE.perCoreSpawnMinMs);
  assert.ok(FLUX_CORE_BALANCE.laserOnlineGraceMs >= 15_000);
  assert.ok(FLUX_CORE_BALANCE.nextCycleVarianceMinMs > 0);

  const source = readFileSync(new URL('../src/game/systems/FluxCoreSystem.ts', import.meta.url), 'utf8');
  assert.match(source, /this\.plannedCoreCount = this\.random\.int\(1, this\.capacity\)/);
  assert.match(source, /this\.spawnedCoreCount >= this\.plannedCoreCount/);
  assert.match(source, /FLUX_CORE_BALANCE\.perCoreSpawnMinMs/);
  assert.match(source, /externalLaserSuppressed[\s\S]*?this\.nextSpawnAt = Number\.POSITIVE_INFINITY/);
  assert.match(source, /FLUX_CORE_BALANCE\.laserOnlineGraceMs/);
  assert.doesNotMatch(source, /spawnWave\(/);
});

test('Flux Core shutdown requires the complete planned deployment to be destroyed', () => {
  const source = readFileSync(new URL('../src/game/systems/FluxCoreSystem.ts', import.meta.url), 'utf8');
  assert.match(source, /this\.cyclePhase = 'engaged'/);
  assert.match(source, /if \(this\.cyclePhase === 'engaged' && this\.cores\.length === 0\) \{/);
  assert.match(source, /this\.cyclePhase = 'shutdown'/);
  assert.match(source, /this\.laserSuppressedUntil = now \+ FLUX_CORE_BALANCE\.laserShutdownMs/);
});

test('Flux Core locations reserve full geometry and avoid recent deployment positions', () => {
  const source = readFileSync(new URL('../src/game/systems/FluxCoreSystem.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(source, /this\.isBlocked\(x, y, FLUX_CORE_BALANCE\.geometryHalfWidth, FLUX_CORE_BALANCE\.geometryHalfHeight\)/);
  assert.match(source, /this\.isReserved\(x, y, FLUX_CORE_BALANCE\.geometryHalfWidth, FLUX_CORE_BALANCE\.geometryHalfHeight\)/);
  assert.match(source, /for \(const previous of this\.recentSpawnLocations\)/);
  assert.match(arena, /intersectsWallGeometry\(x, y, halfWidth, halfHeight\)/);
  assert.match(arena, /x \+ halfWidth >= wall\.x[\s\S]*?y - halfHeight <= wall\.y \+ wall\.h/);
  assert.match(arena, /private intersectsBombSiteGeometry\(/);
  assert.match(arena, /FLUX_CORE_BALANCE\.bombSiteExclusionRadius/);
  assert.match(arena, /const closestX = Phaser\.Math\.Clamp\(site\.x, x - halfWidth, x \+ halfWidth\)/);
});

test('destroyed Flux Cores use bounded neon bounce debris and can drop their exact colored core orb', () => {
  const source = readFileSync(new URL('../src/game/systems/FluxCoreSystem.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.ok(FLUX_CORE_BALANCE.collectibleDropChance > 0 && FLUX_CORE_BALANCE.collectibleDropChance < 1);
  assert.ok(FLUX_CORE_BALANCE.destructionParticleCount > 0 && FLUX_CORE_BALANCE.destructionParticleCount <= 24);
  assert.match(source, /droppedCore: this\.random\.float\(0, 1\) < FLUX_CORE_BALANCE\.collectibleDropChance/);
  assert.match(source, /const bounceProgress = firstFlight/);
  assert.match(source, /this\.effectTweens/);
  assert.match(arena, /if \(event\.droppedCore\) this\.dropFluxCorePickup\(event\.x, event\.y, event\.color\)/);
  assert.match(arena, /const glow = this\.add\.circle\(0, -1, 10, color, 0\.23\)/);
  assert.match(arena, /const orb = this\.add\.circle\(0, -1, 5, color, 0\.95\)/);
  assert.match(arena, /SaveSystem\.addFluxCores\(rewardFluxCores\)/);
  assert.match(arena, /this\.audio\.playSfx\('bomblet'\)/);
});

test('Flux Cores use capped manual collision, proximity-only pulses, and deterministic cleanup', () => {
  const source = readFileSync(new URL('../src/game/systems/FluxCoreSystem.ts', import.meta.url), 'utf8');
  assert.match(source, /private readonly cores: FluxCoreVisual\[\] = \[\]/);
  assert.match(source, /damagePoint\(/);
  assert.match(source, /damageArea\(/);
  assert.match(source, /damageAlongSegment\(/);
  assert.doesNotMatch(source, /physics\.add\.overlap|physics\.add\.collider/);
  assert.match(source, /closestDistanceSquared > radius \* radius/);
  assert.match(source, /this\.onProximityChanged\?\.\(strength\)/);
  assert.match(source, /this\.onRecoveryAlarm\?\.\(\)/);
  assert.match(source, /for \(const core of this\.cores\) this\.destroyCoreVisual\(core\)/);
});

test('Flux Core deployment rises from a floor hatch before opening its window shutters', () => {
  const source = readFileSync(new URL('../src/game/systems/FluxCoreSystem.ts', import.meta.url), 'utf8');
  assert.match(source, /floorHatch/);
  assert.match(source, /hatchLip/);
  assert.match(source, /floorRiseDistance/);
  assert.match(source, /upperWindowShutter/);
  assert.match(source, /lowerWindowShutter/);
  assert.match(source, /easedWindow/);
  assert.doesNotMatch(source, /delayedCall\([^)]*window|setTimeout\([^)]*window/);
});

test('Arena integrates Flux Cores with shared laser suppression and major damage sources', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /new FluxCoreSystem\(/);
  assert.match(arena, /securityLasersSuppressed = gasSuppressesLasers \|\| fluxSuppressesLasers/);
  assert.match(arena, /fluxCores\?\.update\(now, this\.player, gasSuppressesLasers\)/);
  assert.match(arena, /damagePoint\(p\.sprite\.x, p\.sprite\.y, 7, p\.damage, fluxSource\)/);
  assert.match(arena, /damageArea\(mine\.sprite\.x, mine\.sprite\.y, mine\.radius, mine\.damage, 'mine'\)/);
  assert.match(arena, /damageAlongSegment\(fence\.x1, fence\.y1, fence\.x2, fence\.y2, 11, fence\.dps \* dt\)/);
  assert.match(arena, /damageArea\(x, y, blastRadius, 9999, 'bomblet'\)/);
  assert.match(arena, /damageArea\(site\.x, site\.y, 360, 9999, 'bomb'\)/);
  assert.match(arena, /this\.fluxCores\?\.destroy\(\)/);
});

test('Flux Core electrical energy uses one proximity-faded reusable loop', () => {
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  assert.match(audio, /audioAssetUrl\('soundeffects\/electricalenergy\.mp3'\)/);
  assert.match(audio, /this\.fluxCoreAudio\.loop = true/);
  assert.match(audio, /setFluxCoreProximity\(strength: number\)/);
  assert.match(audio, /audio\.volume \+ \(targetVolume - audio\.volume\) \* smoothing/);
  assert.match(audio, /stopFluxCoreLoop\(\)/);
});
