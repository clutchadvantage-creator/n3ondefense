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
});

test('Flux Cores use capped manual collision, proximity-only pulses, and deterministic cleanup', () => {
  const source = readFileSync(new URL('../src/game/systems/FluxCoreSystem.ts', import.meta.url), 'utf8');
  assert.match(source, /private readonly cores: FluxCoreVisual\[\] = \[\]/);
  assert.match(source, /damagePoint\(/);
  assert.match(source, /damageArea\(/);
  assert.match(source, /damageAlongSegment\(/);
  assert.doesNotMatch(source, /physics\.add\.overlap|physics\.add\.collider/);
  assert.match(source, /closestDistanceSquared > radius \* radius/);
  assert.match(source, /this\.onProximityPulse\?\.\(strength\)/);
  assert.match(source, /this\.onRecoveryAlarm\?\.\(\)/);
  assert.match(source, /for \(const core of this\.cores\) core\.root\.destroy\(\)/);
});

test('Arena integrates Flux Cores with shared laser suppression and major damage sources', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /new FluxCoreSystem\(/);
  assert.match(arena, /securityLasersSuppressed = gasSuppressesLasers \|\| fluxSuppressesLasers/);
  assert.match(arena, /damagePoint\(p\.sprite\.x, p\.sprite\.y, 7, p\.damage, fluxSource\)/);
  assert.match(arena, /damageArea\(mine\.sprite\.x, mine\.sprite\.y, mine\.radius, mine\.damage, 'mine'\)/);
  assert.match(arena, /damageAlongSegment\(fence\.x1, fence\.y1, fence\.x2, fence\.y2, 11, fence\.dps \* dt\)/);
  assert.match(arena, /damageArea\(x, y, blastRadius, 9999, 'bomblet'\)/);
  assert.match(arena, /damageArea\(site\.x, site\.y, 360, 9999, 'bomb'\)/);
  assert.match(arena, /this\.fluxCores\?\.destroy\(\)/);
});

test('Flux Core electrical pulses are synthesized on demand rather than looped globally', () => {
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  assert.match(audio, /playFluxCorePulse\(strength: number\)/);
  assert.match(audio, /this\.beep\('sfx', 145 \+ proximity \* 95/);
  assert.doesNotMatch(audio, /fluxCoreAudio.*loop = true/);
});
