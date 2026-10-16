import test from 'node:test';
import assert from 'node:assert/strict';
import { generateHeistFacilityLayout, findHeistNodePath } from '../src/game/anomalies/heist/HeistFacilityLayout.ts';
import { createHeistSmashablePlacements } from '../src/game/anomalies/heist/HeistSmashablePlacement.ts';
import { createHeistSentryPlan, HeistSentryState, HEIST_SENTRY_DEPLOY_MS, insideSentryRoom } from '../src/game/anomalies/heist/HeistSentryPlan.ts';
import { safeHeistHostilePosition, validHeistHostilePosition } from '../src/game/anomalies/heist/HeistHostileGeometry.ts';
import { heistEnemyStats, heistSentryStats } from '../src/game/anomalies/heist/HeistEnemyStats.ts';

test('500 facility seeds retain three accessible sentry rooms with smashables and clear entrances', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const layout = generateHeistFacilityLayout(seed), props = createHeistSmashablePlacements(layout, seed % 30 + 1);
    const rooms = createHeistSentryPlan(layout, props);
    assert.equal(rooms.length, 3, `seed ${seed}`);
    assert.deepEqual(rooms, createHeistSentryPlan(layout, props));
    assert.equal(new Set(rooms.map(r => r.nodeId)).size, 3);
    for (const room of rooms) {
      const node = layout.nodes.find(n => n.id === room.nodeId), prop = props.find(p => p.id === room.propId);
      assert.ok(findHeistNodePath(layout, layout.entryNodeId, node.id).length > 1);
      assert.ok(insideSentryRoom(room, prop.x, prop.y));
      assert.ok(validHeistHostilePosition(layout, room.sentry.x, room.sentry.y, 28));
      assert.ok(Math.abs(room.sentry.x - node.x) - 28 >= 92, '184px central passage remains clear');
      assert.ok(!layout.trapPlacements.some(t => t.nodeId === node.id));
    }
  }
});

test('each room requires damage, completes deployment on active time, and cannot trigger or reward twice', () => {
  const states = [new HeistSentryState(), new HeistSentryState(), new HeistSentryState()];
  for (const s of states) { s.advance(10000); assert.equal(s.phase, 'dormant'); }
  assert.equal(states[0].trigger(), true);
  assert.equal(states[0].trigger(), false);
  assert.equal(states[0].advance(HEIST_SENTRY_DEPLOY_MS - 1), false);
  assert.equal(states[0].advance(0), false);
  assert.equal(states[0].advance(1), true);
  assert.equal(states[0].destroy(), true);
  assert.equal(states[0].destroy(), false);
  assert.equal(states[0].trigger(), false);
  assert.equal(states[1].phase, 'dormant');
  assert.equal(states[2].phase, 'dormant');
});

test('hostile spawn recovery excludes the whole vault and wall footprint for normal and elite sizes', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const layout = generateHeistFacilityLayout(seed), v = layout.vaultBounds;
    for (const radius of [12, 24, 34, 53, 80]) for (const p of [
      { x: v.x + v.w / 2, y: v.y + v.h / 2 }, { x: v.x - radius + 1, y: v.y + v.h / 2 },
      ...layout.vaultDoors, ...layout.ambushPoints
    ]) {
      const safe = safeHeistHostilePosition(layout, p.x, p.y, radius);
      assert.ok(safe && validHeistHostilePosition(layout, safe.x, safe.y, radius));
    }
  }
});

test('sentry health is exactly half the current mini-boss, with loadout and mode scaling once', () => {
  for (const protocol of ['normal', 'overdrive-phoenix', 'supreme-leo']) for (const round of [1, 9, 26, 30]) {
    for (const loadout of [{ health: 1, damage: 1 }, { health: 3.5, damage: 1.8 }]) {
      const mini = heistEnemyStats('tank', round, protocol, true, loadout);
      const shooter = heistEnemyStats('shooter', round, protocol, false, loadout);
      const sentry = heistSentryStats(round, protocol, loadout);
      assert.equal(sentry.hp, mini.hp / 2); assert.equal(sentry.damage, shooter.damage);
      assert.equal(sentry.speed, 0);
    }
  }
});
