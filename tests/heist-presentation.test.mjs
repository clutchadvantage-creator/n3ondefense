import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { followGameplayPlayer, GAMEPLAY_CAMERA_ZOOM } from '../src/game/systems/GameplayCamera.ts';
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

test('Arena and HEIST share stable native gameplay follow without movement or room zoom', () => {
  const scene = source('../src/game/anomalies/heist/HeistScene.ts');
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const calls = [];
  const camera = { setZoom: (...args) => calls.push(['zoom', ...args]), startFollow: (...args) => calls.push(['follow', ...args]) };
  const player = { x: 0, y: 0 };
  followGameplayPlayer(camera, player);
  assert.deepEqual(calls, [['zoom', GAMEPLAY_CAMERA_ZOOM], ['follow', player, true, 0.08, 0.08]]);
  assert.equal(GAMEPLAY_CAMERA_ZOOM, 0.9);
  assert.match(scene, /followGameplayPlayer\(this.cameras.main, this.player\)/);
  assert.match(arena, /followGameplayPlayer\(this.cameras.main, this.player\)/);
  assert.doesNotMatch(scene, /cameraPresentation|setZoom|zoomTo/);
  assert.match(scene, /positionToCamera\(this\.cameras\.main\)/);
});

test('HEIST 2.5D presentation keeps cached walls and bounded graph occlusion', () => {
  const facility = source('../src/game/anomalies/heist/HeistFacility.ts');
  assert.match(facility, /HEIST_WALL_PROJECTION_Y/);
  assert.match(facility, /HEIST_WALL_FACADE_TEXTURES/);
  assert.match(facility, /scene\.add\.tileSprite\(edge\.x - HEIST_WALL_PROJECTION_X/);
  assert.match(facility, /exposedHeistWallEdges\(rect, runtimeWallRects\)/);
  assert.match(facility, /new HeistZoneVisibility\(layout\)/);
  assert.match(facility, /visibilityLayers = layout\.nodes\.map/);
  assert.match(facility, /foreground \? 0\.34 : 1/);
  assert.doesNotMatch(facility, /raycast|Raycaster|createGeometryMask/);
});
