import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMineRackEnergyCost, getMineRackPatternOffsets } from '../src/game/abilities/MineRackSalvo.ts';
import { MINE_DEPLOYMENT_DELAY_MS, MineChargeRack } from '../src/game/abilities/MineChargeRack.ts';
import { FULL_RACK_SALVO_HOLD_MS, MineSalvoInput } from '../src/game/input/MineSalvoInput.ts';
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

test('Bombsite recharge acceleration advances the same authoritative Mine charge rack', () => {
  const rack = new MineChargeRack();
  rack.reset(3);
  assert.equal(rack.spend(0, 4000), true);
  rack.accelerateRechargeBy(800);
  assert.equal(rack.snapshot(3199, 4000).currentCharges, 2);
  assert.equal(rack.snapshot(3200, 4000).currentCharges, 3);
});

test('Full Rack Salvo input resolves a tap or hold exactly once', () => {
  const input = new MineSalvoInput();
  assert.equal(input.press('Keyboard:KeyR', 1000), true);
  assert.equal(input.update(1000 + FULL_RACK_SALVO_HOLD_MS - 1), null);
  assert.equal(input.release('Keyboard:KeyR', 1000 + FULL_RACK_SALVO_HOLD_MS - 1), 'tap');

  assert.equal(input.press('Keyboard:KeyR', 2000), true);
  assert.equal(input.update(2000 + FULL_RACK_SALVO_HOLD_MS), 'salvo');
  assert.equal(input.update(9999), null);
  assert.equal(input.release('Keyboard:KeyR', 9999), null);

  assert.equal(input.press('Mouse:2', 3000), true);
  assert.equal(input.release('Mouse:1', 4000), null);
  assert.equal(input.release('Mouse:2', 3000 + FULL_RACK_SALVO_HOLD_MS), 'salvo');
});

test('Full Rack Salvo consumes full and partial racks through the shared charge state', () => {
  const rack = new MineChargeRack();
  rack.reset(5);
  assert.equal(rack.spendMany(0, 4200, 5), true);
  assert.equal(rack.snapshot(0, 4200).currentCharges, 0);
  assert.equal(rack.spendMany(150, 4200, 1), false);
  assert.equal(rack.snapshot(4200, 4200).currentCharges, 1);
  assert.equal(rack.spendMany(4200, 4200, 1), true);
  assert.equal(rack.snapshot(4200, 4200).currentCharges, 0);

  rack.reset(5);
  assert.equal(rack.spend(0, 4200), true);
  assert.equal(rack.snapshot(150, 4200).currentCharges, 4);
  assert.equal(rack.spendMany(150, 4200, 4), true);
  assert.equal(rack.snapshot(150, 4200).currentCharges, 0);
  assert.equal(rack.snapshot(4200, 4200).currentCharges, 1);
});

test('cancelling held Salvo input prevents stuck or delayed actions', () => {
  const input = new MineSalvoInput();
  input.press('Keyboard:KeyR', 0);
  input.cancel();
  assert.equal(input.update(10_000), null);
  assert.equal(input.release('Keyboard:KeyR', 10_000), null);
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

test('mine salvo placement atomically consumes current charges and preserves geometry, energy, and flight FX', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /const rack = this\.mineChargeRack\.snapshot\(now, cfg\.cooldownMs\)/);
  assert.match(arena, /const availableMines = rack\.currentCharges/);
  assert.match(arena, /getMineRackEnergyCost\(cfg\.energyCost, availableMines, salvo\.energyCostMultiplier\)/);
  assert.match(arena, /if \(!points\) \{[\s\S]*?recordAbilityDenied\('mine', 'invalid-placement'\)/);
  assert.match(arena, /mineChargeRack\.spendMany\(now, cfg\.cooldownMs, availableMines\)/);
  assert.match(arena, /points\.forEach\(\(point, index\) => \{/);
  assert.match(arena, /intersectsWallGeometry\(x, y, 18, 18\)/);
  assert.match(arena, /durationMs: salvo\.flightMs/);
});

test('Arena wires Salvo tap-hold input without delaying an unmodded mine press', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /action === 'mine' && this\.modRuntime\.has\('full-rack-salvo'\)/);
  assert.match(arena, /this\.mineSalvoInput\.press\(binding, this\.time\.now\);[\s\S]*?return;[\s\S]*?this\.pressedAbilityActions\.add\(action\)/);
  assert.match(arena, /window\.addEventListener\('keyup', this\.onAbilityKeyUp\)/);
  assert.match(arena, /window\.removeEventListener\('keyup', this\.onAbilityKeyUp\)/);
  assert.match(arena, /this\.mineSalvoInput\.cancel\(\);[\s\S]*?this\.pendingMineSalvo = false/);
});

test('player mine explosions use the shared explosion audio and dedicated red-orange plasma FX', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const mine = readFileSync(new URL('../src/game/abilities/Mine.ts', import.meta.url), 'utf8');
  const vfx = readFileSync(new URL('../src/game/vfx/MineExplosionVfx.ts', import.meta.url), 'utf8');
  assert.match(arena, /this\.audio\.playSfx\('mine'\)/);
  assert.match(arena, /this\.playMineExplosion\(mine\.sprite\.x, mine\.sprite\.y, mine\.radius, mine\)/);
  assert.match(arena, /private playMineExplosion/);
  assert.match(mine, /explosionPalette: \[0xffffff, 0xffa340, 0xff4e27, 0xff174f\]/);
  assert.match(mine, /get explosionPalette\(\): MineExplosionPalette/);
  assert.match(vfx, /private drawExplosion/);
  assert.match(vfx, /white-hot core/);
  assert.match(vfx, /Two thin wave fronts/);
  assert.match(vfx, /Sharp radial energy spikes/);
  assert.match(vfx, /Jagged rotating plasma arcs/);
  assert.match(vfx, /rolling energy nebula/);
  assert.match(vfx, /multi-segment bolts crackle through the nebula/);
  assert.match(vfx, /private drawSmokeNebula/);
  assert.match(vfx, /Short, narrow crack traces/);
  assert.match(vfx, /compact plasma afterglow/i);
  assert.match(vfx, /cameras\.main\.shake\(260, 0\.008, false\)/);
});

test('star death mine explosion reuses every player-mine FX layer with pink-cyan colors', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const mine = readFileSync(new URL('../src/game/abilities/Mine.ts', import.meta.url), 'utf8');
  assert.match(mine, /STAR_DEATH_MINE_VISUAL_THEME:[\s\S]*?explosionPalette: \[0xf4ffff, 0xff4ed3, 0x39eeff, 0xff24d4\]/);
  assert.match(arena, /STAR_DEATH_MINE_VISUAL_THEME/);
  assert.match(arena, /this\.playMineExplosion\(mine\.sprite\.x, mine\.sprite\.y, mine\.radius, mine\)/);
  assert.match(arena, /mine\.explosionPalette\[1\][\s\S]*?mine\.explosionPalette\[2\]/);
});

test('mine explosion chains share one bounded renderer without particle objects or per-fragment tweens', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const vfx = readFileSync(new URL('../src/game/vfx/MineExplosionVfx.ts', import.meta.url), 'utf8');
  assert.match(arena, /this\.mineExplosionVfx = new MineExplosionVfx\(this, this\.particlesEnabled\)/);
  assert.match(arena, /this\.mineExplosionVfx\.update\(now\)/);
  assert.match(arena, /this\.mineExplosionVfx\.reset\(\)/);
  assert.match(vfx, /MAX_ACTIVE_EXPLOSIONS = 18/);
  assert.match(vfx, /this\.graphics = scene\.add\.graphics\(\)/);
  assert.match(vfx, /this\.smokeGraphics = scene\.add\.graphics\(\)/);
  assert.match(vfx, /new Float32Array\(FULL_RAY_COUNT\)/);
  assert.match(vfx, /new Float32Array\(FULL_FRAGMENT_COUNT\)/);
  assert.match(vfx, /new Float32Array\(FULL_NEBULA_LOBE_COUNT\)/);
  assert.doesNotMatch(vfx, /scene\.add\.circle|scene\.tweens\.add|physics\./);
});
