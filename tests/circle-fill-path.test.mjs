import test from 'node:test';
import assert from 'node:assert/strict';
import { isDefaultCircleFillPath } from '../src/game/rendering/CircleFillPath.ts';
const circle = (x, y, radius) => {
  const points = [{ x: x + radius, y }];
  for (let t = .01; t < 1; t += .01) points.push({ x: x + Math.cos(Math.PI * 2 * t) * radius, y: y + Math.sin(Math.PI * 2 * t) * radius });
  points.push({ x: x + Math.cos(Math.PI * 2) * radius, y: y + Math.sin(Math.PI * 2) * radius });
  return points;
};
test('circle fast path accepts the actual Phaser sampling at different positions and radii', () => {
  for (const x of [-2400, 0, 413.2]) for (const y of [-1600, 0, 800.65]) for (const radius of [.01, 5, 90, 320, 800])
    assert.equal(isDefaultCircleFillPath(circle(x, y, radius)), true);
});
test('noncircles, different sampling, partial arcs and invalid coordinates use the regular pipeline', () => {
  const original = circle(500, 400, 70);
  for (const path of [[], original.slice(1), original.filter((_, i) => i % 2 === 0), original.slice().reverse(),
    original.map(p => ({ x: p.x * 2, y: p.y })), circle(0, 0, 0)]) assert.equal(isDefaultCircleFillPath(path), false);
  for (const change of [10, NaN, Infinity]) {
    const warped = original.map(p => ({ ...p })); warped[12].x += change;
    assert.equal(isDefaultCircleFillPath(warped), false);
  }
});
