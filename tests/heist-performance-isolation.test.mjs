import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateHeistFacilityLayout } from '../src/game/anomalies/heist/HeistFacilityLayout.ts';
import { HeistWallPointIndex, mergeAxisAlignedHeistWalls } from '../src/game/anomalies/heist/HeistWallRuntime.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const contains = (rects, x, y) => rects.some((rect) =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);

test('HEIST runtime wall merging preserves the exact occupied collision union', () => {
  let sourceCount = 0;
  let runtimeCount = 0;
  for (let seed = 1; seed <= 24; seed += 1) {
    const layout = generateHeistFacilityLayout(seed * 98_273);
    const merged = mergeAxisAlignedHeistWalls(layout.wallRects);
    const index = new HeistWallPointIndex(merged);
    sourceCount += layout.wallRects.length;
    runtimeCount += merged.length;

    for (let y = 0; y <= layout.world.height; y += 37) {
      for (let x = 0; x <= layout.world.width; x += 43) {
        const expected = contains(layout.wallRects, x, y);
        assert.equal(contains(merged, x, y), expected, `merged union mismatch at seed ${seed}, ${x},${y}`);
        assert.equal(index.contains(x, y), expected, `indexed query mismatch at seed ${seed}, ${x},${y}`);
      }
    }
    for (const rect of layout.wallRects) {
      const points = [
        [rect.x, rect.y], [rect.x + rect.w, rect.y],
        [rect.x, rect.y + rect.h], [rect.x + rect.w, rect.y + rect.h],
        [rect.x + rect.w * 0.5, rect.y + rect.h * 0.5]
      ];
      for (const [x, y] of points) {
        assert.equal(index.contains(x, y), contains(layout.wallRects, x, y));
      }
    }
  }
  assert.ok(runtimeCount < sourceCount * 0.7,
    `expected exact merging to remove at least 30% of bodies (${sourceCount} -> ${runtimeCount})`);
});

test('HEIST projectile and enemy hot paths use indexed walls and allocation-free navigation/separation', () => {
  const scene = source('../src/game/anomalies/heist/HeistScene.ts');
  const facility = source('../src/game/anomalies/heist/HeistFacility.ts');
  assert.match(scene, /this\.facility\.containsWallPoint\(x, y\)/);
  assert.doesNotMatch(scene, /this\.facility\.wallRects\.some/);
  assert.match(scene, /this\.navigationTargetScratch/);
  assert.match(scene, /this\.enemySpatialGrid\.forEachNearby\(enemy\.x, enemy\.y, 34/);
  assert.match(facility, /const nodeById = new Map/);
  assert.match(facility, /prepareNavigationTarget\(targetX: number, targetY: number\)/);
  assert.match(facility, /if \(targetNodeId !== cachedTargetNodeId\) rebuildNavigationMap/);
  assert.match(scene, /this\.facility\.prepareNavigationTarget\(this\.player\.x, this\.player\.y\)/);
});

test('HEIST preserves Arena by sleeping it and exposes DEV-only isolation diagnostics', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const scene = source('../src/game/anomalies/heist/HeistScene.ts');
  assert.match(arena, /this\.scene\.launch\(SceneKeys\.Heist, session\)[\s\S]*?this\.scene\.sleep\(\)/);
  assert.match(scene, /simulationAndRenderingInert: arena\.sys\.isSleeping\(\)/);
  assert.match(scene, /debug\.n3onHeistPerf = \(\) => this\.createDevPerformanceSnapshot\(\)/);
  assert.match(scene, /keydown-F6/);
  assert.match(scene, /performance-listeners/);
});

test('HEIST static facility presentation uses cached textures instead of replaying one world-sized command buffer', () => {
  const facility = source('../src/game/anomalies/heist/HeistFacility.ts');
  assert.match(facility, /ensureFacilityTextures\(scene\)/);
  assert.match(facility, /scene\.add\.tileSprite/);
  assert.match(facility, /scene\.add\.image\(rect\.x, rect\.y, texture\)/);
  assert.doesNotMatch(facility, /staticGraphics\.fillStyle/);
  assert.match(facility, /runtimeWallRects: runtimeWallRects\.length/);
});
