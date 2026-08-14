import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMineRackEnergyCost, getMineRackPatternOffsets } from '../src/game/abilities/MineRackSalvo.ts';
import { MINE_DEPLOYMENT_DELAY_MS, MineChargeRack } from '../src/game/abilities/MineChargeRack.ts';
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

test('base mine rack spends charges rapidly and recharges them sequentially', () => {
  const rack = new MineChargeRack();
  rack.reset(3);

  assert.equal(rack.spend(0, 4200), true);
  assert.equal(rack.spend(MINE_DEPLOYMENT_DELAY_MS - 1, 4200), false);
  assert.equal(rack.spend(MINE_DEPLOYMENT_DELAY_MS, 4200), true);
  assert.equal(rack.spend(MINE_DEPLOYMENT_DELAY_MS * 2, 4200), true);
  assert.equal(rack.spend(MINE_DEPLOYMENT_DELAY_MS * 3, 4200), false);
  assert.deepEqual(rack.snapshot(4199, 4200), {
    currentCharges: 0,
    maxCharges: 3,
    nextChargeRemainingMs: 1,
    rechargeDurationMs: 4200
  });
  assert.equal(rack.snapshot(4200, 4200).currentCharges, 1);
  assert.equal(rack.snapshot(8400, 4200).currentCharges, 2);
  assert.equal(rack.snapshot(12600, 4200).currentCharges, 3);
});

test('spending a partial mine charge does not reset existing recharge progress', () => {
  const rack = new MineChargeRack();
  rack.reset(3);
  assert.equal(rack.spend(0, 4200), true);
  assert.equal(rack.spend(150, 4200), true);
  assert.equal(rack.spend(300, 4200), true);

  assert.equal(rack.snapshot(4200, 4200).currentCharges, 1);
  assert.equal(rack.spend(4200, 4200), true);
  assert.equal(rack.snapshot(8399, 4200).currentCharges, 0);
  assert.equal(rack.snapshot(8400, 4200).currentCharges, 1);
});

test('single and upgraded mine capacities clamp correctly and honor recharge modifiers', () => {
  const single = new MineChargeRack();
  single.reset(1);
  assert.equal(single.spend(0, 4200), true);
  assert.equal(single.snapshot(4199, 4200).currentCharges, 0);
  assert.equal(single.snapshot(4200, 4200).currentCharges, 1);
  assert.equal(single.snapshot(99_999, 4200).currentCharges, 1);

  const upgraded = new MineChargeRack();
  upgraded.reset(5);
  assert.equal(upgraded.snapshot(0, 2100).maxCharges, 5);
  assert.equal(upgraded.snapshot(0, 2100).currentCharges, 5);
  assert.equal(upgraded.spend(0, 2100), true);
  assert.equal(upgraded.snapshot(2099, 2100).currentCharges, 4);
  assert.equal(upgraded.snapshot(2100, 2100).currentCharges, 5);
});

test('base mine placement validates energy and geometry before consuming a charge', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const energyCheck = arena.indexOf('if (!this.player.canSpendEnergy(cfg.energyCost))');
  const placementCheck = arena.indexOf('if (!this.isValidPlacement(x, y))');
  const chargeSpend = arena.indexOf('if (!this.mineChargeRack.spend(now, cfg.cooldownMs))');
  assert.ok(energyCheck >= 0 && placementCheck > energyCheck && chargeSpend > placementCheck);
  assert.doesNotMatch(arena, /if \(this\.mines\.length >= cfg\.maxActive\)[\s\S]{0,180}recordAbilityDenied\('mine'/);
  const basePlacement = arena.slice(arena.indexOf('private placeAbility('), arena.indexOf('private placeFullRackSalvo('));
  assert.equal([...basePlacement.matchAll(/this\.player\.spendEnergy\(cfg\.energyCost\)/g)].length, 1);
  assert.match(arena, /private readonly pressedAbilityActions = new Set<AbilityAction>\(\)/);
  assert.match(arena, /this\.pressedAbilityActions\.delete\(action\)/);
});

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

test('star death mines reuse the operative mine model with a hostile pink-cyan theme', () => {
  const mineSource = readFileSync(new URL('../src/game/abilities/Mine.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(mineSource, /STAR_DEATH_MINE_VISUAL_THEME:[\s\S]*?secondaryColor: 0x39eeff/);
  assert.match(mineSource, /armedShellStrokeColor: 0xff4ed3/);
  assert.match(mineSource, /armedInnerStrokeColor: 0x39eeff/);
  assert.match(arena, /const hostileMine = new Mine\([\s\S]*?COLORS\.pink,[\s\S]*?62,[\s\S]*?170,[\s\S]*?STAR_DEATH_MINE_VISUAL_THEME/);
  assert.match(arena, /hostileMine\.beginDetonation\(this\.time\.now, 1000\)/);
  assert.match(arena, /this\.deathMines\.push\(\{ mine: hostileMine \}\)/);
  assert.match(arena, /const mine = deathMine\.mine;[\s\S]*?mine\.update\(now\)/);
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
  assert.match(arena, /PLAYER_MINE_EXPLOSION_PALETTE:[\s\S]*?0xffffff, 0xffa340, 0xff4e27, 0xff174f/);
  assert.match(arena, /const layers = \[[\s\S]*?palette\[0\][\s\S]*?palette\[1\][\s\S]*?palette\[2\][\s\S]*?palette\[3\]/);
  assert.match(arena, /const arcStorm = this\.add\.graphics/);
  assert.match(arena, /const rayCount = this\.particlesEnabled \? 24 : 12/);
  assert.match(arena, /this\.cameras\.main\.shake\(380, 0\.013, false\)/);
});

test('star death mine explosion reuses every player-mine FX layer with pink-cyan colors', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /STAR_MINE_EXPLOSION_PALETTE:[\s\S]*?0xf4ffff, COLORS\.pink, COLORS\.cyan, 0xff24d4/);
  assert.match(arena, /this\.playMineExplosion\(mine\.sprite\.x, mine\.sprite\.y, mine\.radius, STAR_MINE_EXPLOSION_PALETTE\)/);
  assert.match(arena, /const color = index % 3 === 0 \? palette\[0\] : index % 2 === 0 \? palette\[1\] : palette\[2\]/);
  assert.match(arena, /arcStorm\.lineStyle\([\s\S]*?palette\[2\][\s\S]*?palette\[1\]/);
});
