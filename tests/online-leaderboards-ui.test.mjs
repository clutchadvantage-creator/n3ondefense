import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/game/scenes/OnlineLeaderboardsScene.ts', import.meta.url), 'utf8');

test('Online Leaderboards uses the established cyber-console menu language', () => {
  assert.match(source, /createConsoleShell\(width, height, layout\)/);
  assert.match(source, /chamferedPoints\(shellWidth, shellHeight/);
  assert.match(source, /ONLINE LEADERBOARDS/);
  assert.match(source, /N3ON NETWORK \/\/ VERIFIED DEPLOYMENT ARCHIVE/);
  assert.match(source, /createModCollectionButton/);
  assert.match(source, /VIEW \/\/ GLOBAL/);
  assert.match(source, /BACK TO MAIN MENU/);
  assert.match(source, /VERIFIED FEED \/\/ 0/);
});

test('visual refactor preserves all online leaderboard data routes and controls', () => {
  assert.match(source, /LeaderboardClient\.aroundPlayer\(profile\.id, key\)/);
  assert.match(source, /LeaderboardClient\.leaderboard\(key\)/);
  assert.match(source, /OnlineRunManager\.flushQueue\(\)/);
  assert.match(source, /OnlineRunManager\.pendingCount\(\)/);
  assert.match(source, /SceneKeys\.Leaderboards/);
  assert.match(source, /SceneKeys\.MainMenu/);
  for (const category of ['highest_round', 'enemies_destroyed', 'bomb_sites_destroyed']) {
    assert.match(source, new RegExp(`key: '${category}'`));
  }
});

test('Online Leaderboards remains responsive and ignores stale network responses', () => {
  assert.match(source, /const compact = width < 1100 \|\| height < 760/);
  assert.match(source, /Phaser\.Math\.Clamp\(width \* 0\.011/);
  assert.match(source, /this\.scale\.on\('resize', this\.handleResize, this\)/);
  assert.match(source, /this\.scale\.off\('resize', this\.handleResize, this\)/);
  assert.match(source, /generation !== this\.requestGeneration/);
  assert.doesNotMatch(source, /â€¢/);
});
