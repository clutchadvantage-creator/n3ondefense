import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('mine-dropping star enemy keeps detailed opaque art and its Mine-on-death behavior', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const spawn = arena.slice(arena.indexOf("if (type === 'star')"), arena.indexOf('const wallCollider', arena.indexOf("if (type === 'star')")));
  assert.match(spawn, /setTexture\('enemy-star'\)/);
  assert.match(spawn, /setBlendMode\(Phaser\.BlendModes\.NORMAL\)/);
  assert.doesNotMatch(spawn, /BlendModes\.ADD/);
  const killStart = arena.indexOf('private killEnemy');
  const starDeath = arena.indexOf("if (enemy.stats.type === 'star')", killStart);
  const death = arena.slice(starDeath, arena.indexOf('this.destroyEnemyColliders', starDeath));
  assert.match(death, /new Mine\(/);
  assert.match(death, /STAR_DEATH_MINE_VISUAL_THEME/);
});
