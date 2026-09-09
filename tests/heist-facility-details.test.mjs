import test from 'node:test';
import assert from 'node:assert/strict';
import { generateHeistFacilityLayout } from '../src/game/anomalies/heist/HeistFacilityLayout.ts';
import { createHeistRoomPlan, findHeistWallMount } from '../src/game/anomalies/heist/HeistRoomPlan.ts';

test('wall nozzles retain the full hazard budget and an unobstructed damage lane across 100 seeds', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const layout = generateHeistFacilityLayout(seed);
    for (const type of ['fire', 'spike', 'snag']) assert.equal(layout.trapPlacements.filter(t => t.type === type).length, 5);
    for (const trap of layout.trapPlacements.filter(t => t.type === 'fire')) {
      const node = layout.nodes.find(n => n.id === trap.nodeId);
      const mount = findHeistWallMount(layout, node);
      assert.equal(trap.x, mount.x);
      assert.equal(trap.y, mount.y);
      for (let d = 62; d <= 250; d += 4) for (const lateral of [-62, 0, 62]) {
        const x = trap.x + Math.cos(trap.rotation) * d - Math.sin(trap.rotation) * lateral;
        const y = trap.y + Math.sin(trap.rotation) * d + Math.cos(trap.rotation) * lateral;
        assert.ok(!layout.wallRects.some(w => x > w.x + 1 && x < w.x + w.w - 1 && y > w.y + 1 && y < w.y + w.h - 1));
      }
    }
  }
});

test('facility room identities are deterministic, avoid objectives and traps, and fit fixtures inside solid walls', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const layout = generateHeistFacilityLayout(seed), original = JSON.stringify(layout);
    const rooms = createHeistRoomPlan(layout);
    assert.equal(rooms.length, 24);
    assert.equal(new Set(rooms.map(r => r.role.id)).size, 5);
    assert.deepEqual(rooms, createHeistRoomPlan(layout));
    const excluded = new Set([layout.entryNodeId, layout.extractionNodeId, ...layout.trapPlacements.map(t => t.nodeId), ...layout.vaultDoors.map(d => d.approachNodeId)]);
    for (const room of rooms) {
      assert.ok(!excluded.has(room.nodeId));
      const wall = layout.wallRects[room.mount.wallIndex], angle = room.mount.rotation;
      const x = room.mount.x - Math.cos(angle) * 24, y = room.mount.y - Math.sin(angle) * 24;
      const halfW = Math.abs(Math.sin(angle)) * 58 + Math.abs(Math.cos(angle)) * 24;
      const halfH = Math.abs(Math.cos(angle)) * 58 + Math.abs(Math.sin(angle)) * 24;
      assert.ok(x - halfW >= wall.x - 1e-6 && x + halfW <= wall.x + wall.w + 1e-6);
      assert.ok(y - halfH >= wall.y - 1e-6 && y + halfH <= wall.y + wall.h + 1e-6);
    }
    assert.equal(JSON.stringify(layout), original);
  }
});
