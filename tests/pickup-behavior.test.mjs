import test from 'node:test';
import assert from 'node:assert/strict';
import { GameplayPickupMotion, collectOrAttractPickup, energyPickupBlocked, findGameplayPickupLanding } from '../src/game/loot/GameplayPickupMotion.ts';

const sprite = (x, y) => ({ x, y, setPosition(x, y) { this.x = x; this.y = y; return this; } });

test('energy pickups preserve Normal missing-energy threshold and later-mode double-cap', () => {
  assert.equal(energyPickupBlocked(100, 100, false), true);
  assert.equal(energyPickupBlocked(81, 100, false), true);
  assert.equal(energyPickupBlocked(80, 100, false), false);
  assert.equal(energyPickupBlocked(100, 100, true), false);
  assert.equal(energyPickupBlocked(199, 100, true), false);
  assert.equal(energyPickupBlocked(200, 100, true), true);
});

test('unavailable pickups neither collect nor attract; magnetic pull cannot overshoot the player', () => {
  const p = sprite(100, 0);
  assert.equal(collectOrAttractPickup(p, 0, 0, 20, 200, 500, 1, false), false);
  assert.equal(p.x, 100);
  assert.equal(collectOrAttractPickup(p, 0, 0, 20, 200, 500, 1, true), false);
  assert.equal(p.x, 14);
  assert.equal(collectOrAttractPickup(p, 0, 0, 20, 200, 500, 1, true), true);
});

test('crowded drifting pickups remain inside the world and outside walls without physics bodies', () => {
  const motion = new GameplayPickupMotion(), roots = [sprite(198, 150), sprite(198, 150), sprite(24, 24)];
  const walls = [{ x: 200, y: 100, w: 80, h: 100 }], bounds = { x: 0, y: 0, w: 400, h: 300 };
  for (const p of roots) motion.register(p, 'credits');
  for (let frame = 0; frame < 300; frame++) {
    motion.update(roots, p => p, bounds, walls, frame * 1000 / 60, 1 / 60);
    motion.separate(roots, p => p, bounds, walls);
    for (const p of roots) {
      assert.ok(p.x >= 24 && p.x <= 376 && p.y >= 24 && p.y <= 276);
      assert.ok(!(p.x > 176 && p.x < 304 && p.y > 76 && p.y < 224));
    }
  }
  assert.ok(Math.hypot(roots[0].x - roots[1].x, roots[0].y - roots[1].y) > 25);
});

test('physical launch searches alternate landing angles and retains origin if none are clear', () => {
  const bounds = { x: 0, y: 0, w: 600, h: 400 };
  const point = findGameplayPickupLanding(300, 200, 0, 100, bounds, (x, y) => y < 230);
  assert.ok(point.y >= 230);
  assert.deepEqual(findGameplayPickupLanding(300, 200, 0, 100, bounds, () => true), { x: 300, y: 200 });
});
