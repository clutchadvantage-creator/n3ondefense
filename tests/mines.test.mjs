import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMineRackEnergyCost, getMineRackPatternOffsets } from '../src/game/abilities/MineRackSalvo.ts';
import { addModDrop, createDefaultModCollection, equipMod } from '../src/game/mods/ModInventoryService.ts';
import { MOD_BY_ID } from '../src/game/mods/definitions.ts';
import { ModRuntime } from '../src/game/mods/ModRuntime.ts';

const runtimeAtRank = (rank) => {
  const mods = createDefaultModCollection();
  addModDrop(mods, 'full-rack-salvo');
  mods.cards[0].upgradeLevel = rank;
  equipMod(mods, 'defense', 'full-rack-salvo', mods.cards[0].instanceId);
  return new ModRuntime(mods);
};

test('mine rack formations preserve requested capacity and use the five-pip layout', () => {
  for (let count = 1; count <= 9; count += 1) {
    const points = getMineRackPatternOffsets(count, 72, Math.PI / 7);
    assert.equal(points.length, count);
    assert.equal(new Set(points.map(({ x, y }) => `${x.toFixed(3)},${y.toFixed(3)}`)).size, count);
  }
  const five = getMineRackPatternOffsets(5, 72);
  assert.deepEqual(five[0], { x: 0, y: 0 });
  assert.equal(five.filter(({ x, y }) => x !== 0 && y !== 0).length, 4);
});

test('full rack energy cost scales by mines actually deployed and rank efficiency', () => {
  assert.equal(getMineRackEnergyCost(10, 5, 1), 50);
  assert.equal(getMineRackEnergyCost(10, 5, 0.75), 37.5);
  const configs = [0, 1, 2, 3].map((rank) => runtimeAtRank(rank).fullRackSalvo());
  assert.deepEqual(configs.map((entry) => entry.energyCostMultiplier), [1, 0.92, 0.84, 0.75]);
  assert.deepEqual(configs.map((entry) => entry.flightMs), [460, 410, 355, 300]);
});

test('Full Rack Salvo is a ranked Epic defense Mod with no hidden stat replacement', () => {
  const definition = MOD_BY_ID.get('full-rack-salvo');
  assert.equal(definition.rarity, 'epic');
  assert.equal(definition.category, 'defense');
  assert.equal(definition.maxRank, 3);
  assert.equal(Object.keys(definition.rankDescriptions).length, 4);
  assert.ok(definition.tags.includes('mine'));
  assert.equal(definition.modifiers, undefined);
});

test('operative mines render as reusable spiked devices with animated arming state', () => {
  const source = readFileSync(new URL('../src/game/abilities/Mine.ts', import.meta.url), 'utf8');
  assert.match(source, /scene\.add\.container\(startX, startY/);
  assert.match(source, /index < 12/);
  assert.match(source, /scene\.add\.triangle/);
  assert.match(source, /this\.shell\.setFillStyle/);
  assert.match(source, /this\.spikeRing\.setRotation/);
  assert.doesNotMatch(source, /repeat:\s*-1/);
});

test('mine salvo placement is all-or-nothing, geometry safe, and preserves capacity and per-mine energy', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /availableMines = Math\.max\(0, cfg\.maxActive - this\.mines\.length\)/);
  assert.match(arena, /getMineRackEnergyCost\(cfg\.energyCost, availableMines, salvo\.energyCostMultiplier\)/);
  assert.match(arena, /if \(!points\) \{[\s\S]*?recordAbilityDenied\('mine', 'invalid-placement'\)/);
  assert.match(arena, /points\.forEach\(\(point, index\) => \{/);
  assert.match(arena, /intersectsWallGeometry\(x, y, 18, 18\)/);
  assert.match(arena, /durationMs: salvo\.flightMs/);
});

test('player mine explosions use the shared explosion audio and dedicated red-orange plasma FX', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /this\.audio\.playSfx\('mine'\)/);
  assert.match(arena, /this\.playMineExplosion\(mine\.sprite\.x, mine\.sprite\.y, mine\.radius\)/);
  assert.match(arena, /private playMineExplosion/);
  assert.match(arena, /const layers = \[[\s\S]*?0xffa340[\s\S]*?0xff4e27[\s\S]*?0xff174f/);
  assert.match(arena, /const arcStorm = this\.add\.graphics/);
  assert.match(arena, /const rayCount = this\.particlesEnabled \? 24 : 12/);
  assert.match(arena, /this\.cameras\.main\.shake\(380, 0\.013, false\)/);
});
