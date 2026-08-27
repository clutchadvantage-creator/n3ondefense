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

test('robot frames are generated once in Boot with authored multi-color palettes and visual-only scale', () => {
  const bootSource = readFileSync(new URL('../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
  const enemySource = readFileSync(new URL('../src/game/enemies/Enemy.ts', import.meta.url), 'utf8');
  const artSource = readFileSync(new URL('../src/game/enemies/EnemyArtTextures.ts', import.meta.url), 'utf8');
  for (const type of Object.keys(ENEMY_ROBOT_FRAMES)) {
    assert.match(bootSource, new RegExp(`createEnemyRobot\\('${type}'`));
  }
  assert.match(enemySource, /restoreVisualPalette\(\)/);
  assert.match(enemySource, /this\.clearTint\(\)/);
  assert.match(enemySource, /this\.body\?\.setSize\(stats\.size \* bodyScale/);
  assert.match(enemySource, /ENEMY_VISUAL_SCALE = 1\.9/);
  assert.match(enemySource, /ENEMY_VISUAL_SIZE_BONUS = 2/);
  assert.match(enemySource, /const visualSize = stats\.size \* ENEMY_VISUAL_SCALE \+ ENEMY_VISUAL_SIZE_BONUS/);
  assert.match(enemySource, /setDisplaySize\(visualSize, visualSize\)/);
  assert.match(bootSource, /createDetailedEnemyRobotTextures\(g\)/);
  assert.match(artSource, /const SIZE = 72/);
  assert.match(artSource, /Baked shadow keeps depth inexpensive/);
  assert.match(artSource, /drawGrunt/);
  assert.match(artSource, /drawShooter/);
  assert.match(artSource, /drawDefuser/);
  assert.match(artSource, /drawTank/);
  assert.match(artSource, /drawDisruptor/);
  assert.match(artSource, /drawStar/);
  assert.match(artSource, /ENEMY_ART_PALETTES/);
  for (const type of Object.keys(ENEMY_ROBOT_FRAMES)) {
    assert.match(artSource, new RegExp(`${type}: \\{ primary: 0x[0-9a-f]+, secondary: 0x[0-9a-f]+, accent: 0x[0-9a-f]+, sensor: 0x[0-9a-f]+ \\}`));
  }
  assert.equal((artSource.match(/generateTexture\(/g) ?? []).length, 1, 'shared cache path generates each registered chassis');
  assert.doesNotMatch(enemySource, /scene\.add\.graphics|scene\.add\.container/);
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

test('crowd recovery is staggered, lateral-first, and spatially bounded', () => {
  const source = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(source, /new UniformSpatialGrid<Enemy>\(48\)/);
  assert.match(source, /nav\.recoveryUntil = now \+ 520/);
  assert.match(source, /nav\.stuckTicks >= 14/);
  assert.match(source, /private setEnemyNavigationVelocity/);
  assert.match(source, /approachAngle/);
  const separation = source.slice(source.indexOf('private applyEnemySeparation'), source.indexOf('private updateProjectiles'));
  assert.match(separation, /enemySeparationGrid\.rebuild/);
  assert.doesNotMatch(separation, /for \(let j = i \+ 1/);
});
