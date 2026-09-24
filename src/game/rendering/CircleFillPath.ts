type Point = { x: number; y: number };

// Phaser 3 GraphicsWebGLRenderer samples ARC at 0.01 increments, including
// explicit start/end points. A changed Phaser tessellation safely falls back.
const unitCircle: readonly Point[] = (() => {
  const points = [{ x: 1, y: 0 }];
  for (let t = 0.01; t < 1; t += 0.01) points.push({ x: Math.cos(Math.PI * 2 * t), y: Math.sin(Math.PI * 2 * t) });
  points.push({ x: Math.cos(Math.PI * 2), y: Math.sin(Math.PI * 2) });
  return points;
})();

/** Only recognize the existing complete filled circle, never arbitrary polygons,
 * partial arcs, ellipses, self-intersections, or changed engine sampling rules.
 */
export function isDefaultCircleFillPath(path: readonly Point[]): boolean {
  if (path.length !== unitCircle.length) return false;
  const radius = (path[0].x - path[50].x) * 0.5;
  if (!Number.isFinite(radius) || radius <= 0) return false;
  const x = path[0].x - radius, y = path[0].y, tolerance = (radius + 1) * 1e-7;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  for (let i = 0; i < path.length; i++) {
    if (!(Math.abs(path[i].x - (x + unitCircle[i].x * radius)) <= tolerance)
      || !(Math.abs(path[i].y - (y + unitCircle[i].y * radius)) <= tolerance)) return false;
  }
  return true;
}
