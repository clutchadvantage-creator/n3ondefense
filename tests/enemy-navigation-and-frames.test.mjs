import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENEMY_ROBOT_FRAMES } from '../src/game/enemies/EnemyRobotFrames.ts';

test('every enemy role owns a distinct robot chassis while retaining its established texture key', () => {
  const types = ['grunt', 'shooter', 'defuser', 'tank', 'disruptor', 'star'];
  assert.deepEqual(Object.keys(ENEMY_ROBOT_FRAMES).sort(), [...types].sort());
  assert.equal(new Set(types.map((type) => ENEMY_ROBOT_FRAMES[type].chassis)).size, types.length);
  assert.equal(new Set(types.map((type) => ENEMY_ROBOT_FRAMES[type].textureKey)).size, types.length);
  for (const type of types) assert.equal(ENEMY_ROBOT_FRAMES[type].textureKey, `enemy-${type}`);
});

test('robot frames are generated once in Boot and runtime combat colors remain authoritative tints', () => {
  const bootSource = readFileSync(new URL('../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
  const enemySource = readFileSync(new URL('../src/game/enemies/Enemy.ts', import.meta.url), 'utf8');
  for (const type of Object.keys(ENEMY_ROBOT_FRAMES)) {
    assert.match(bootSource, new RegExp(`createEnemyRobot\\('${type}'`));
  }
  assert.match(enemySource, /this\.setTint\(stats\.color\)/);
  assert.match(enemySource, /this\.body\?\.setSize\(stats\.size \* bodyScale/);
  assert.match(enemySource, /ENEMY_VISUAL_SIZE_BONUS = 2/);
  assert.match(enemySource, /setDisplaySize\(stats\.size \+ ENEMY_VISUAL_SIZE_BONUS/);
});

test('pathfinding resolves padded start and goal cells instead of falling back through walls', () => {
  const source = readFileSync(new URL('../src/game/systems/GridPathfinder.ts', import.meta.url), 'utf8');
  const findPath = source.slice(source.indexOf('findPath('), source.indexOf('smoothWorldPath('));

  assert.match(source, /private findNearestWalkableCell\(/);
  assert.match(findPath, /this\.findNearestWalkableCell\(fromX, fromY, 1, 8\)/);
  assert.match(findPath, /this\.findNearestWalkableCell\(toX, toY, 1, 8\)/);
  assert.match(source, /hasLineOfSightWorld\(/);
  assert.match(source, /Prevent corner cutting through walls/);
});

test('enemy navigation retains tactical focus and never uses random wall-bounce movement', () => {
  const source = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const navigation = source.slice(
    source.indexOf('private enemyPrefersObjective'),
    source.indexOf('private applyEnemySeparation')
  );

  assert.match(navigation, /nextFocusDecisionAt = now \+ Phaser\.Math\.Between\(900, 1400\)/);
  assert.match(navigation, /hasLineOfSightWorld\(enemy\.x, enemy\.y, targetX, targetY\)/);
  assert.doesNotMatch(navigation, /FloatBetween/);
  assert.doesNotMatch(navigation, /Math\.random\(\) < 0\.42 \? site\.x/);
});
