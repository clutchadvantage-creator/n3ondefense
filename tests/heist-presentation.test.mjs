import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateHeistFacilityLayout } from '../src/game/anomalies/heist/HeistFacilityLayout.ts';
import {
  HEIST_ZONE_ALPHA,
  HeistZoneVisibility,
  heistVisibilityZoneRect
} from '../src/game/anomalies/heist/HeistZoneVisibility.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('HEIST graph visibility reveals the current and connected zones without exposing the sealed vault', () => {
  const layout = generateHeistFacilityLayout(83_117);
  const visibility = new HeistZoneVisibility(layout);
  const indexById = new Map(layout.nodes.map((node, index) => [node.id, index]));
  const vaultIndex = indexById.get(layout.vaultNodeId);
  const vaultEdge = layout.edges.find(([first, second]) => first === layout.vaultNodeId || second === layout.vaultNodeId);
  assert.ok(vaultIndex !== undefined && vaultEdge);
  const approachId = vaultEdge[0] === layout.vaultNodeId ? vaultEdge[1] : vaultEdge[0];
  const approach = layout.nodes[indexById.get(approachId)];

  visibility.revealAt(approach.x, approach.y, false);
  assert.ok(Math.abs(visibility.targetAlpha[indexById.get(approachId)] - HEIST_ZONE_ALPHA.current) < 0.0001);
  assert.ok(Math.abs(visibility.targetAlpha[vaultIndex] - HEIST_ZONE_ALPHA.hidden) < 0.0001);

  visibility.revealAt(approach.x, approach.y, true);
  assert.ok(Math.abs(visibility.targetAlpha[vaultIndex] - HEIST_ZONE_ALPHA.adjacent) < 0.0001);
});

test('HEIST visibility reuses its alpha buffer and vault zone matches the generated room', () => {
  const layout = generateHeistFacilityLayout(194_911);
  const visibility = new HeistZoneVisibility(layout);
  const targetBuffer = visibility.targetAlpha;
  visibility.revealAt(layout.entryPoint.x, layout.entryPoint.y, false);
  visibility.revealAt(layout.extractionPoint.x, layout.extractionPoint.y, false);
  assert.equal(visibility.targetAlpha, targetBuffer);
  const vaultNode = layout.nodes.find((node) => node.id === layout.vaultNodeId);
  assert.deepEqual(heistVisibilityZoneRect(layout, vaultNode), layout.vaultBounds);
});

test('HEIST chase camera is isolated and synchronizes transforms before world-space aiming', () => {
  const camera = source('../src/game/anomalies/heist/HeistCameraPresentation.ts');
  const scene = source('../src/game/anomalies/heist/HeistScene.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  assert.match(camera, /camera\.stopFollow\(\)/);
  assert.match(camera, /camera\.setScroll/);
  assert.match(camera, /camera\.preRender\(\)/);
  assert.match(scene, /cameraPresentation\?\.update\(delta/);
  assert.ok(scene.indexOf('cameraPresentation?.update(delta') < scene.indexOf('this.updateCrosshair()'));
  assert.match(scene, /positionToCamera\(this\.cameras\.main\)/);
  assert.doesNotMatch(arena, /HeistCameraPresentation/);
});

test('HEIST 2.5D presentation keeps cached walls and bounded graph occlusion', () => {
  const facility = source('../src/game/anomalies/heist/HeistFacility.ts');
  assert.match(facility, /HEIST_WALL_PROJECTION_Y/);
  assert.match(facility, /HEIST_WALL_FACADE_TEXTURES/);
  assert.match(facility, /scene\.add\.tileSprite\(rect\.x - HEIST_WALL_PROJECTION_X/);
  assert.match(facility, /new HeistZoneVisibility\(layout\)/);
  assert.match(facility, /visibilityLayers = layout\.nodes\.map/);
  assert.match(facility, /foreground \? 0\.34 : 1/);
  assert.doesNotMatch(facility, /raycast|Raycaster|createGeometryMask/);
});
