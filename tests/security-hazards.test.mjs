import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { AIR_DROP_PATTERN_NAMES, createAirDropPattern } from '../src/game/systems/AirDropPatterns.ts';
import { SeededRandom } from '../src/game/systems/SeededRandom.ts';
import { GAS_HAZARD_BALANCE, getGasExposureDamage } from '../src/game/config/gasHazards.ts';
import { BOMBLET_HAZARD_BALANCE } from '../src/game/config/bombletHazards.ts';
import { SFX_DEFINITIONS } from '../src/game/config/audio.ts';

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
  assert.match(gas, /this\.tunnelMask\[densityIndex\] = 255/);
  assert.match(gas, /this\.eraseGasAt\(x, y, radius, false\)/);
  assert.match(gas, /if \(removeHazard\) this\.density\[densityIndex\] = 0/);
  assert.match(gas, /if \(playerEnteredGas && now >= this\.nextGasDamageAt\)/);
  assert.match(gas, /return this\.active \|\| now < this\.recoveryUntil/);
  assert.match(arena, /securityLasersSuppressed = gasSuppressesLasers \|\| fluxSuppressesLasers/);
  assert.match(arena, /isDangerWindow\(now, securityLasersSuppressed\)/);
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

test('gas release audio is reused and fires once after the complete canister pattern lands', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/gassound.mp3', import.meta.url)));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'gas'));
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const gas = readFileSync(new URL('../src/game/systems/GasHazardSystem.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(audio, /audioAssetUrl\('soundeffects\/gassound\.mp3'\)/);
  assert.match(audio, /private gasSfx: HTMLAudioElement \| null = null/);
  assert.match(gas, /this\.releasedCanisterCount === this\.canisters\.length/);
  assert.match(gas, /this\.onGasReleased\?\.\(\)/);
  assert.match(arena, /\(\) => this\.audio\.playSfx\('gas'\)/);
});

test('security laser and per-bomblet audio use active-state and pooled playback', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/lasersound.mp3', import.meta.url)));
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/bomblets.mp3', import.meta.url)));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'securityLaser'));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'bomblet'));
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const lasers = readFileSync(new URL('../src/game/systems/LaserSecuritySystem.ts', import.meta.url), 'utf8');
  const bomblets = readFileSync(new URL('../src/game/systems/BombletHazardSystem.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(audio, /audioAssetUrl\('soundeffects\/lasersound\.mp3'\)/);
  assert.match(audio, /audioAssetUrl\('soundeffects\/bomblets\.mp3'\)/);
  assert.match(audio, /BOMBLET_SFX_POOL_SIZE = 8/);
  assert.match(audio, /this\.securityLaserAudio\.loop = true/);
  assert.match(lasers, /this\.setAudioActive\(true\)/);
  assert.match(lasers, /this\.setAudioActive\(false\)/);
  assert.match(bomblets, /const shouldPlaySound = this\.strikeDetonationCount % 2 === 0/);
  assert.match(bomblets, /this\.onBombletExploded\?\.\(target\.x, target\.y, config\.blastRadius, shouldPlaySound\)/);
  assert.match(arena, /startSecurityLaserLoop\(\).*stopSecurityLaserLoop\(\)/);
  assert.match(arena, /\(x, y, blastRadius, shouldPlaySound\) => \{[\s\S]*?if \(shouldPlaySound\) this\.audio\.playSfx\('bomblet'\)/);
  assert.match(arena, /laserSecurity\?\.silence\(\)/);
});

test('every gameplay explosion shares the bomblet recording while volleys sound once per pair', () => {
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const bomblets = readFileSync(new URL('../src/game/systems/BombletHazardSystem.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(audio, /soundeffects\/explosion\.mp3|playExplosionSfx|explosionSfxPool/);
  assert.match(audio, /case 'bomblet':[\s\S]*?case 'mine':[\s\S]*?case 'bomb':[\s\S]*?this\.playBombletSfx\(name\)/);
  assert.match(bomblets, /this\.strikeDetonationCount = 0/);
  assert.match(bomblets, /this\.strikeDetonationCount \+= 1/);
  assert.match(arena, /this\.audio\.playSfx\('bomblet'\)/);
  assert.match(arena, /this\.audio\.playSfx\('mine'\)/);
  assert.match(arena, /this\.audio\.playSfx\('bomb'\)/);
  assert.match(arena, /this\.audio\.playSfx\('enemyDeath'\)/);
});

test('moving entities tunnel gas visually while mine ignition consumes the damaging footprint', () => {
  const gas = readFileSync(new URL('../src/game/systems/GasHazardSystem.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const lasers = readFileSync(new URL('../src/game/systems/LaserSecuritySystem.ts', import.meta.url), 'utf8');
  assert.equal(GAS_HAZARD_BALANCE.mineIgnitionRadiusMultiplier, 3);
  assert.match(gas, /carveVisualTunnel\(x: number, y: number, radius: number\)/);
  assert.match(gas, /if \(!this\.gasLayer\.visible \|\| !this\.hasVisibleGasAt\(x, y\)\) return false/);
  assert.match(gas, /const ignitionRadius = mineRadius \* GAS_HAZARD_BALANCE\.mineIgnitionRadiusMultiplier/);
  assert.match(gas, /this\.eraseGasAt\(x, y, ignitionRadius, true\)/);
  assert.match(gas, /this\.playIgnitionEffect\(x, y, ignitionRadius\)/);
  assert.match(arena, /gasHazard\?\.carveVisualTunnel\(/);
  assert.match(arena, /this\.gasHazard\?\.carveVisualBlast\(/);
  assert.match(arena, /this\.gasHazard\?\.igniteFromMine\(mine\.sprite\.x, mine\.sprite\.y, mine\.radius\)/);
  assert.doesNotMatch(lasers, /carveVisualTunnel|carveVisualBlast|igniteFromMine/);
});

test('bomblet detonations apply a restrained non-restarting camera shake', () => {
  const bomblets = readFileSync(new URL('../src/game/systems/BombletHazardSystem.ts', import.meta.url), 'utf8');
  assert.ok(BOMBLET_HAZARD_BALANCE.cameraShakeDurationMs > 0);
  assert.ok(BOMBLET_HAZARD_BALANCE.cameraShakeIntensity > 0);
  assert.ok(BOMBLET_HAZARD_BALANCE.cameraShakeIntensity < 0.01);
  assert.match(bomblets, /cameras\.main\.shake\(config\.cameraShakeDurationMs, config\.cameraShakeIntensity, false\)/);
});
