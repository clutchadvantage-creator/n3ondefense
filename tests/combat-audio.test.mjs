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

test('ability placement and unavailable actions use dedicated non-interrupting recordings', () => {
  for (const filename of ['placeturret.mp3', 'electricfence.mp3', 'placemine.mp3', 'unavailable.mp3']) {
    assert.ok(existsSync(new URL(`../public/assets/audio/soundeffects/${filename}`, import.meta.url)), filename);
  }
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../src/game/config/audio.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  for (const key of ['placeTurret', 'electricFence', 'placeMine', 'unavailable']) {
    assert.match(config, new RegExp(`key: '${key}'`));
    assert.match(audio, new RegExp(`case '${key}':`));
  }
  assert.match(audio, /soundeffects\/placeturret\.mp3/);
  assert.match(audio, /soundeffects\/electricfence\.mp3/);
  assert.match(audio, /soundeffects\/placemine\.mp3/);
  assert.match(audio, /soundeffects\/unavailable\.mp3/);
  const feedbackPlayback = audio.match(/private playAbilityFeedbackSfx[\s\S]*?\n  \}\n\n  private playRunStartSfx/)?.[0] ?? '';
  assert.match(feedbackPlayback, /candidate\.paused \|\| candidate\.ended/);
  assert.match(feedbackPlayback, /if \(availableIndex < 0\) return/);
  assert.doesNotMatch(feedbackPlayback, /audio\.pause\(\)/);
  assert.match(arena, /type === 'turret' \? 'placeTurret' : type === 'fence' \? 'electricFence' : 'placeMine'/);
  assert.match(arena, /delayedCall\(salvo\.flightMs \+ index \* salvo\.staggerMs, \(\) => this\.audio\.playSfx\('placeMine'\)\)/);
  assert.match(arena, /recordAbilityDenied\('dash', 'cooldown'\);\s*this\.audio\.playSfx\('unavailable'\)/);
  assert.match(arena, /recordAbilityDenied\('shield', 'cooldown'\);\s*this\.audio\.playSfx\('unavailable'\)/);
  assert.match(arena, /recordAbilityDenied\('turret', 'active-limit'\);\s*this\.audio\.playSfx\('unavailable'\)/);
  assert.match(arena, /recordAbilityDenied\('fence', 'active-limit'\);\s*this\.audio\.playSfx\('unavailable'\)/);
});

test('shield activation uses its dedicated reusable recording', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/shieldactivate.mp3', import.meta.url)));
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  assert.match(audio, /audioAssetUrl\('soundeffects\/shieldactivate\.mp3'\)/);
  assert.match(audio, /this\.shieldActivationSfx\.pause\(\)/);
  assert.match(audio, /this\.shieldActivationSfx\.currentTime = 0/);
  assert.doesNotMatch(audio, /soundeffects\/shieldon\.mp3/);
});

test('shield deactivation audio follows the final runtime shield expiry', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/shielddown.mp3', import.meta.url)));
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(audio, /audioAssetUrl\('soundeffects\/shielddown\.mp3'\)/);
  assert.match(audio, /case 'shieldOff':[\s\S]*?this\.playShieldOffSfx\(\)/);
  assert.match(arena, /this\.shieldActiveUntil = now \+ durationMs/);
  assert.match(arena, /getShieldDurationMs\(\)[\s\S]*?getUpgradeEffect\(this\.runUpgrades, 'player\.shieldDuration'\)[\s\S]*?this\.modRuntime\.multiplier\('shieldDuration'\)/);
  assert.match(arena, /if \(now >= this\.shieldActiveUntil\) \{[\s\S]*?playSfx\('shieldOff'\)[\s\S]*?destroyShieldOrb\(\)/);
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

test('enemy death audio caps concurrent voices without interrupting active clips', () => {
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  assert.match(audio, /ENEMY_DEATH_SFX_MAX_CONCURRENT = 4/);
  assert.match(audio, /ENEMY_DEATH_SFX_MIN_INTERVAL_MS = 45/);
  assert.match(audio, /for \(let i = 0; i < ENEMY_DEATH_SFX_MAX_CONCURRENT; i \+= 1\)/);
  assert.match(audio, /now - this\.lastEnemyDeathSfxAt < ENEMY_DEATH_SFX_MIN_INTERVAL_MS/);
  assert.match(audio, /candidate\.paused \|\| candidate\.ended/);
  assert.match(audio, /if \(availableIndex < 0\) return/);

  const enemyPlayback = audio.match(/private playEnemyDeathSfx\(\): void \{[\s\S]*?\n  \}\n\n  private playPlayerDeathSfx/)?.[0] ?? '';
  assert.doesNotMatch(enemyPlayback, /\.pause\(\)/);
  assert.match(enemyPlayback, /this\.enemyDeathSfxCursor = \(availableIndex \+ 1\)/);
});

test('enemy resource pickups use the dedicated recording and never share Mod reveal audio', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/pickupsound.mp3', import.meta.url)));
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(audio, /PICKUP_SFX_POOL_SIZE = 4/);
  assert.match(audio, /audioAssetUrl\('soundeffects\/pickupsound\.mp3'\)/);
  assert.match(audio, /case 'pickup':[\s\S]*?this\.playPickupSfx\(\)/);
  assert.match(arena, /if \(source === 'enemy'\) this\.audio\.playSfx\('pickup'\)/);
  assert.doesNotMatch(arena, /tryAwardMod[\s\S]{0,500}playSfx\('pickup'\)/);
  assert.match(audio, /case 'modCollection':[\s\S]*?this\.playModRevealSfx\(name\)/);
});
