import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEnvironmentDecalPlan, createArenaFloorDecalPlan } from '../src/game/rendering/EnvironmentDecalLibrary.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const surfaces = Array.from({ length: 24 }, (_, index) => ({
  x: 80 + index * 34,
  y: 120 + (index % 5) * 80,
  w: index % 2 ? 180 : 32,
  h: index % 2 ? 32 : 180
}));

test('environment graffiti plans are deterministic, bounded, and identity-specific', () => {
  const arenaA = createEnvironmentDecalPlan('arena', 912_441, surfaces, 9);
  const arenaB = createEnvironmentDecalPlan('arena', 912_441, surfaces, 9);
  const heist = createEnvironmentDecalPlan('heist', 912_441, surfaces, 12);
  assert.deepEqual(arenaA, arenaB);
  assert.ok(arenaA.decals.length <= 9);
  assert.ok(heist.decals.length <= 12);
  assert.equal(new Set(arenaA.decals.map((decal) => decal.surfaceIndex)).size, arenaA.decals.length);
  assert.equal(arenaA.identity, 'arena');
  assert.equal(heist.identity, 'heist');
  assert.ok(arenaA.decals.every((decal) => decal.fontSize >= 10));
  assert.ok(arenaA.decals.some((decal) => decal.fontSize >= 16), 'wider wall faces should support larger readable graffiti');
  assert.notDeepEqual(arenaA.decals.map((decal) => decal.text), heist.decals.map((decal) => decal.text));
});

test('beach stadium bakes floor, water, sand, screens, and venue structure into its static layer', () => {
  const arena = source('../src/game/arena/ArenaVisualRenderer.ts');
  assert.match(arena, /drawCoastalApron\(graphics/);
  assert.match(arena, /drawStadiumStructure\(graphics/);
  assert.match(arena, /drawFloorSurface\(graphics\)/);
  assert.match(arena, /drawVenueScreens\(graphics/);
  assert.match(arena, /cachedLayer\.draw\(\[stamp, \.\.\.labels\]\)/);
  assert.match(arena, /createEnvironmentDecalPlan\([\s\S]*?'arena'/);
  assert.match(arena, /drawBeveledTechPlate/);
  assert.match(arena, /drawPanelBolts/);
  assert.match(arena, /drawVentSlats/);
  assert.doesNotMatch(arena, /physics\.(?:add|world)/);
});

test('arena ambience is capped into shared batches and one animation loop', () => {
  const arena = source('../src/game/arena/ArenaVisualRenderer.ts');
  const theme = source('../src/game/arena/ArenaVisualTheme.ts');
  assert.match(arena, /createAmbientEnvironmentBatches/);
  assert.match(arena, /beginAmbientPulse/);
  assert.match(arena, /targets: this\.ambientPulseTargets/);
  assert.match(arena, /independentAnimationLoops: 1/);
  assert.match(theme, /maximumAmbientBatches: 3/);
  assert.match(theme, /maximumEnvironmentDecals: 9/);
});

test('bombsites retain objective behavior while using a layered metallic landing-pad presentation', () => {
  const bombsites = source('../src/game/systems/BombSiteManager.ts');
  assert.match(bombsites, /undersidePoints/);
  assert.match(bombsites, /insetPoints/);
  assert.match(bombsites, /drawMechanicalRivets/);
  assert.match(bombsites, /effect\.rotor\.setScale/);
  assert.match(bombsites, /effect\.bomb\.setY/);
  assert.doesNotMatch(bombsites, /physics\.(?:add|world)/);
});

test('HEIST keeps a separate industrial identity and bounded facility presentation', () => {
  const facility = source('../src/game/anomalies/heist/HeistFacility.ts');
  assert.match(facility, /identity: 'heist-maze-facility'/);
  assert.match(facility, /createEnvironmentDecalPlan\('heist'/);
  assert.match(facility, /createHeistRoomDetails/);
  assert.match(facility, /createHeistRoomPlan/);
  assert.match(facility, /drawBeveledTechPlate/);
  assert.match(facility, /drawHazardStripes/);
  assert.match(facility, /staticGraphicsBatches: 2/);
  assert.match(facility, /liveAmbientBatches: 1/);
  assert.doesNotMatch(facility, /beach|stadium|palm|ocean/i);
});

test('Arcade and anomaly environment props share the layered world presentation without new gameplay bodies', () => {
  const primitives = source('../src/game/arcade/visuals/ArcadeVisualPrimitives.ts');
  const redline = source('../src/game/arcade/visuals/RedlineVisualController.ts');
  const hotPackage = source('../src/game/arcade/visuals/HotPackageVisualController.ts');
  const portal = source('../src/game/anomalies/AnomalyPortalVisual.ts');
  assert.match(primitives, /drawLayeredArcadeSocket/);
  assert.match(redline, /HudInformationSystem/);
  assert.match(hotPackage, /drawLayeredArcadeSocket/);
  assert.match(portal, /this\.anchor/);
  assert.match(portal, /drawMechanicalRivets/);
  for (const content of [primitives, redline, hotPackage, portal]) assert.doesNotMatch(content, /physics\.(?:add|world)/);
});


test('floor graffiti selects complete separated panels outside objective and structure clearances', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const layout = { seed, generation: { bounds: { x: 100, y: 100, w: 2100, h: 1400 } },
      walls: [{ x: 700, y: 100, w: 40, h: 820 }], obstacles: [{ x: 1450, y: 500, w: 140, h: 170 }],
      smashables: [{ x: 950, y: 1100, width: 110, height: 60, rotation: Math.PI / 4 }],
      playerSpawn: { x: 380, y: 310 }, enemySpawns: [{ x: 1800, y: 1250 }], bombSites: [{ x: 1200, y: 780 }] };
    const copy = structuredClone(layout);
    const decals = createArenaFloorDecalPlan(layout, 160, 120);
    assert.deepEqual(layout, copy, 'presentation cannot mutate the gameplay layout');
    assert.deepEqual(decals, createArenaFloorDecalPlan(layout, 160, 120));
    assert.equal(decals.length, 2, 'open safe panels should receive the requested art');
    for (const d of decals) {
      assert.equal(d.placement, 'floor');
      assert.equal((d.x - 180) % 160, 0);
      assert.equal((d.y - 160) % 120, 0);
      assert.equal(d.dripCount, 0);
      for (const p of [layout.playerSpawn, ...layout.bombSites, ...layout.enemySpawns]) assert.ok(Math.hypot(d.x - p.x, d.y - p.y) >= 230);
      assert.ok(d.x + 80 <= 680 || d.x - 80 >= 760 || d.y - 60 >= 940, 'whole tile clears the wall');
    }
    assert.ok(Math.hypot(decals[0].x - decals[1].x, decals[0].y - decals[1].y) >= 480);
    assert.deepEqual(createArenaFloorDecalPlan(layout, 160, 120, 0), []);
    const blocked = { ...layout, walls: [layout.generation.bounds] };
    assert.deepEqual(createArenaFloorDecalPlan(blocked, 160, 120), [], 'no decoration is forced into occupied space');
  }
});
