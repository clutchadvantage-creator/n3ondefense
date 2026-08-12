import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('operative-only hit-damage audio is pooled, throttled, and excluded from every enemy target', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/punch impact.mp3', import.meta.url)));
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../src/game/entities/Player.ts', import.meta.url), 'utf8');
  const enemy = readFileSync(new URL('../src/game/enemies/Enemy.ts', import.meta.url), 'utf8');
  const boss = readFileSync(new URL('../src/game/bosses/Boss.ts', import.meta.url), 'utf8');
  const turret = readFileSync(new URL('../src/game/abilities/Turret.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');

  assert.match(audio, /HIT_DAMAGE_SFX_POOL_SIZE = 6/);
  assert.match(audio, /HIT_DAMAGE_SFX_MIN_INTERVAL_MS = 55/);
  assert.match(audio, /audioAssetUrl\('soundeffects\/punch impact\.mp3'\)/);
  assert.doesNotMatch(audio, /soundeffects\/hitdamage\.mp3/);
  assert.match(audio, /now - this\.lastHitDamageSfxAt < HIT_DAMAGE_SFX_MIN_INTERVAL_MS/);
  assert.match(audio, /case 'hit':[\s\S]*?this\.beep\('sfx', 180, 50, 0\.06, name\)/);
  assert.match(audio, /case 'playerDamage':[\s\S]*?this\.playHitDamageSfx\(\)/);
  assert.match(player, /if \(this\.hp < previousHp\) AudioManager\.get\(\)\.playSfx\('playerDamage'\)/);
  assert.doesNotMatch(enemy, /AudioManager|playSfx/);
  assert.doesNotMatch(boss, /AudioManager|playSfx/);
  assert.doesNotMatch(turret, /AudioManager|playSfx/);
  assert.doesNotMatch(arena, /playSfx\('hit'\)|playSfx\('playerDamage'\)/);
});

test('boost activation preload and pooled fallback use the dedicated boost recording', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/boostsound.mp3', import.meta.url)));
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const boot = readFileSync(new URL('../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
  assert.match(boot, /assets\/audio\/soundeffects\/boostsound\.mp3/);
  assert.match(audio, /audioAssetUrl\('soundeffects\/boostsound\.mp3'\)/);
  assert.doesNotMatch(`${boot}\n${audio}`, /soundeffects\/boost\.mp3/);
});

test('shield activation uses its dedicated reusable recording', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/shieldactivate.mp3', import.meta.url)));
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  assert.match(audio, /audioAssetUrl\('soundeffects\/shieldactivate\.mp3'\)/);
  assert.match(audio, /this\.shieldActivationSfx\.pause\(\)/);
  assert.match(audio, /this\.shieldActivationSfx\.currentTime = 0/);
  assert.doesNotMatch(audio, /soundeffects\/shieldon\.mp3/);
});

test('operative shield is a reusable layered energy field with bounded crackle geometry', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /interface OperativeShieldVisual/);
  assert.match(arena, /rearGlow[\s\S]*?innerField[\s\S]*?shell[\s\S]*?lensGlow[\s\S]*?orbitArcs[\s\S]*?crackleA[\s\S]*?crackleB/);
  assert.match(arena, /if \(!this\.shieldVisual\) this\.createShieldVisual\(\)/);
  assert.match(arena, /for \(let index = 0; index < 7; index \+= 1\)/);
  assert.match(arena, /shield\.root\.setPosition\(this\.player\.x, this\.player\.y\)/);
  assert.match(arena, /this\.shieldVisual\?\.root\.destroy\(true\)/);
  assert.doesNotMatch(arena, /private shieldOrb: Phaser\.GameObjects\.Arc/);
});
