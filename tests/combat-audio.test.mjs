import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('universal hit-damage audio is pooled, throttled, and owned by damage receivers', () => {
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
  assert.match(player, /AudioManager\.get\(\)\.playSfx\('playerDamage'\)/);
  assert.match(enemy, /AudioManager\.get\(\)\.playSfx\('hit'\)/);
  assert.match(boss, /AudioManager\.get\(\)\.playSfx\('hit'\)/);
  assert.match(turret, /if \(applied > 0\) AudioManager\.get\(\)\.playSfx\('hit'\)/);
  assert.match(arena, /hitMissile[\s\S]*?this\.audio\.playSfx\('hit'\)/);
  assert.doesNotMatch(arena, /playSfx\('playerDamage'\)/);
});

test('boost activation preload and pooled fallback use the dedicated boost recording', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/boostsound.mp3', import.meta.url)));
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const boot = readFileSync(new URL('../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
  assert.match(boot, /assets\/audio\/soundeffects\/boostsound\.mp3/);
  assert.match(audio, /audioAssetUrl\('soundeffects\/boostsound\.mp3'\)/);
  assert.doesNotMatch(`${boot}\n${audio}`, /soundeffects\/boost\.mp3/);
});
