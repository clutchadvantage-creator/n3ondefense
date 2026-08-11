import { performance } from 'node:perf_hooks';
import { UniformSpatialGrid } from '../src/game/performance/UniformSpatialGrid.ts';

interface Contact {
  x: number;
  y: number;
  radius: number;
  index: number;
}

const makeRandom = (seed: number) => (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
};

const random = makeRandom(0x30f3e);
const enemies: Contact[] = Array.from({ length: 26 }, (_, index) => ({
  x: random() * 2400,
  y: random() * 1600,
  radius: 22 + random() * 18,
  index
}));
const projectileSamples = Array.from({ length: 4466 }, (_, index) => {
  const anchor = enemies[index % enemies.length];
  const nearContact = index % 4 === 0;
  return {
    x: nearContact ? anchor.x + (random() - 0.5) * anchor.radius : random() * 2400,
    y: nearContact ? anchor.y + (random() - 0.5) * anchor.radius : random() * 1600
  };
});

const iterations = 60;
let naiveChecks = 0;
let naiveHits = 0;
const naiveStart = performance.now();
for (let iteration = 0; iteration < iterations; iteration += 1) {
  for (const projectile of projectileSamples) {
    for (const enemy of enemies) {
      naiveChecks += 1;
      const dx = enemy.x - projectile.x;
      const dy = enemy.y - projectile.y;
      if (Math.sqrt(dx * dx + dy * dy) < enemy.radius) {
        naiveHits += enemy.index + 1;
        break;
      }
    }
  }
}
const naiveMs = performance.now() - naiveStart;

let squaredChecks = 0;
let squaredHits = 0;
const squaredStart = performance.now();
for (let iteration = 0; iteration < iterations; iteration += 1) {
  for (const projectile of projectileSamples) {
    for (const enemy of enemies) {
      squaredChecks += 1;
      const dx = enemy.x - projectile.x;
      const dy = enemy.y - projectile.y;
      if (dx * dx + dy * dy < enemy.radius * enemy.radius) {
        squaredHits += enemy.index + 1;
        break;
      }
    }
  }
}
const squaredMs = performance.now() - squaredStart;

const grid = new UniformSpatialGrid<Contact>(96);
grid.rebuild(enemies);
let gridChecks = 0;
let gridHits = 0;
let queryX = 0;
let queryY = 0;
let selected: Contact | null = null;
const inspect = (enemy: Contact): void => {
  gridChecks += 1;
  const dx = enemy.x - queryX;
  const dy = enemy.y - queryY;
  if (dx * dx + dy * dy >= enemy.radius * enemy.radius) return;
  if (!selected || enemy.index < selected.index) selected = enemy;
};
const gridStart = performance.now();
for (let iteration = 0; iteration < iterations; iteration += 1) {
  for (const projectile of projectileSamples) {
    queryX = projectile.x;
    queryY = projectile.y;
    selected = null;
    grid.forEachNearby(queryX, queryY, 64, inspect);
    if (selected) gridHits += selected.index + 1;
  }
}
const gridMs = performance.now() - gridStart;

if (squaredHits !== naiveHits || gridHits !== naiveHits) {
  throw new Error(`Collision result mismatch: original=${naiveHits}, squared=${squaredHits}, grid=${gridHits}`);
}

console.log('N3ONDefense late-game collision-query benchmark');
console.log(`Workload: ${projectileSamples.length} projectile samples x ${iterations} iterations, ${enemies.length} concurrent enemies`);
console.log(`Original sqrt scan: ${naiveMs.toFixed(2)}ms, ${naiveChecks.toLocaleString()} distance checks`);
console.log(`Selected squared scan: ${squaredMs.toFixed(2)}ms, ${squaredChecks.toLocaleString()} distance checks`);
console.log(`Squared-scan speedup: ${(naiveMs / squaredMs).toFixed(2)}x`);
console.log(`Spatial-grid candidate: ${gridMs.toFixed(2)}ms, ${gridChecks.toLocaleString()} distance checks`);
console.log(`Check reduction: ${(100 * (1 - gridChecks / naiveChecks)).toFixed(1)}%`);
console.log(`Spatial-grid speedup: ${(naiveMs / gridMs).toFixed(2)}x (reported but not selected when below 1.0x)`);
