import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BOSS_BALANCE } from '../src/game/config/bossBalance.ts';
import { SFX_DEFINITIONS } from '../src/game/config/audio.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const boss = source('../src/game/bosses/BossEncounter.ts');
const bossVfx = source('../src/game/vfx/BossCombatVfx.ts');
const arena = source('../src/game/scenes/ArenaScene.ts');
const miniBoss = source('../src/game/arcade/events/MiniBossEvent.ts');
const audio = source('../src/game/systems/AudioManager.ts');
const totem = source('../src/game/vfx/BombsiteTotemVfx.ts');
const bombsiteMods = source('../src/game/mods/BombsiteModSystem.ts');

test('boss presentation uses one bounded, reusable two-layer renderer', () => {
  assert.match(bossVfx, /const MAX_ACTIVE_FULL = 28/);
  assert.match(bossVfx, /const MAX_ACTIVE_REDUCED = 16/);
  assert.equal((bossVfx.match(/scene\.add\.graphics\(\)/g) ?? []).length, 2);
  assert.match(bossVfx, /if \(!candidate\.active\)/);
  assert.match(bossVfx, /candidate\.startedAt < oldestAt/);
  assert.match(bossVfx, /reset\(\): void/);
  assert.match(bossVfx, /destroy\(\): void/);
  assert.doesNotMatch(bossVfx, /tweens\.add|delayedCall|physics\.add/);
  assert.match(boss, /this\.vfx\.destroy\(\)/);
});

test('Sentry artillery, missiles, and cannon fire have distinct telegraphs and projectiles', () => {
  assert.match(boss, /projectile-missile/);
  assert.match(boss, /timingRing/);
  assert.match(boss, /muzzle-heavy/);
  assert.match(boss, /muzzle-light/);
  assert.match(boss, /artillery-impact/);
  assert.match(arena, /'projectile-boss-cannon'/);
  assert.match(arena, /'projectile-boss-arcane'/);
  assert.match(arena, /'projectile-missile'/);
  assert.match(arena, /spawnBossProjectileImpact/);
  assert.match(arena, /mineExplosionVfx\.emitColors/);
});

test('Mage and Brawler presentation follows anticipation, action, impact, and relocation events', () => {
  assert.match(boss, /'mage-cast'/);
  assert.match(boss, /'mage-volley'/);
  assert.match(bossVfx, /private drawMageCast/);
  assert.match(bossVfx, /private drawTeleport/);
  assert.match(boss, /'brawler-windup'/);
  assert.match(boss, /'brawler-launch'/);
  assert.match(boss, /'brawler-trail'/);
  assert.match(boss, /'brawler-impact'/);
  assert.match(boss, /'brawler-depart'/);
  assert.match(boss, /'brawler-arrive'/);
});

test('boss support waves are periodic, archetype-capped, shooter-only, and reward-neutral', () => {
  assert.ok(BOSS_BALANCE.supportEnemyFirstDelayMs >= 10_000);
  assert.ok(BOSS_BALANCE.supportEnemyMinimumIntervalMs >= 20_000);
  assert.ok(BOSS_BALANCE.supportEnemyMaximumIntervalMs > BOSS_BALANCE.supportEnemyMinimumIntervalMs);
  assert.deepEqual(BOSS_BALANCE.supportEnemyMaximumActive, {
    artillery: 4,
    'storm-mage': 4,
    'void-brawler': 2
  });
  assert.match(arena, /private updateBossSupportWave/);
  assert.match(arena, /this\.spawnEnemy\('shooter'/);
  assert.match(arena, /private updateBossSupportEnemies/);
  assert.match(arena, /private clearBossSupportEnemies/);
  const supportKill = arena.slice(arena.indexOf('private killBossSupportEnemy'), arena.indexOf('private clearBossSupportEnemies'));
  assert.match(supportKill, /credits: 0/);
  assert.match(supportKill, /coreTokens: 0/);
  assert.doesNotMatch(
    supportKill,
    /awardCredits|tryAwardMod|dropPickup|awardCoreTokens/
  );
});

test('Totem entrance and gameplay pulses trigger their sounds from authoritative events', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/totementrance.mp3', import.meta.url)));
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/totempulsesound.mp3', import.meta.url)));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'totemEntrance'));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'totemPulse'));
  assert.match(totem, /this\.callbacks\.onEntrance\?\.\(siteId\)/);
  assert.match(totem, /this\.callbacks\.onPulse\?\.\(slot\.siteId, slot\.pulseKind\)/);
  assert.match(totem, /pulseSoundPlayed/);
  assert.match(bombsiteMods, /playTotemCue\?\(cue: 'entrance' \| 'pulse'\)/);
  assert.match(arena, /cue === 'entrance' \? 'totemEntrance' : 'totemPulse'/);
  assert.doesNotMatch(totem, /tweens\.add|delayedCall|\.on\(/);
});

test('Mini-Boss entrance sound and visuals occur only after a successful encounter spawn', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/minibossspawn.mp3', import.meta.url)));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'miniBossSpawn'));
  const failedSpawn = miniBoss.indexOf('if (!point) return false');
  const encounterCreated = miniBoss.indexOf('this.encounter = new BossEncounter');
  const presentation = miniBoss.indexOf('this.context.presentMiniBossSpawn');
  assert.ok(failedSpawn >= 0 && encounterCreated > failedSpawn && presentation > encounterCreated);
  assert.equal((miniBoss.match(/presentMiniBossSpawn/g) ?? []).length, 1);
  assert.match(arena, /presentMiniBossSpawn: \(x, y, color\) =>/);
  assert.match(arena, /this\.audio\.playSfx\('miniBossSpawn'\)/);
  assert.match(audio, /miniBossSpawn: 'soundeffects\/minibossspawn\.mp3'/);
});
