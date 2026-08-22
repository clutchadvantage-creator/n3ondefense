import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPhysicalLootPlan } from '../src/game/loot/PhysicalLootService.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('physical loot planning preserves reward value while bounding large Credit bursts', () => {
  const plan = createPhysicalLootPlan([
    { kind: 'credits', amount: 1_875 },
    { kind: 'core-tokens', amount: 2 },
    { kind: 'flux-cores', amount: 1 },
    { kind: 'plasma-chips', amount: 3 },
    { kind: 'mod', amount: 1 },
    { kind: 'grenade-rounds', amount: 1 },
    { kind: 'scattershot-rounds', amount: 1 }
  ], { maximumCreditBundles: 6, minimumCreditBundles: 2, seed: 42 });

  const credits = plan.filter((entry) => entry.kind === 'credits');
  assert.equal(credits.length, 6);
  assert.equal(credits.reduce((sum, entry) => sum + entry.amount, 0), 1_875);
  assert.equal(plan.filter((entry) => entry.kind === 'core-tokens').length, 2);
  assert.equal(plan.filter((entry) => entry.kind === 'plasma-chips').length, 3);
  assert.equal(plan.filter((entry) => entry.kind === 'mod').length, 1);
  assert.ok(plan.every((entry) => Number.isFinite(entry.angle) && entry.distance >= 74));
  assert.ok(plan.every((entry) => entry.total === plan.length));
});

test('physical loot planning is deterministic and never mutates a wallet or inventory', () => {
  const rewards = [{ kind: 'credits', amount: 800 }, { kind: 'mod', amount: 1 }];
  const first = createPhysicalLootPlan(rewards, { seed: 99 });
  const second = createPhysicalLootPlan(rewards, { seed: 99 });
  assert.deepEqual(first, second);
  assert.deepEqual(rewards, [{ kind: 'credits', amount: 800 }, { kind: 'mod', amount: 1 }]);

  const service = source('../src/game/loot/PhysicalLootService.ts');
  assert.doesNotMatch(service, /SaveSystem|addMod|roundCredits|coreTokens\s*[+]=|plasmaChips\s*[+]=|fluxCores\s*[+]=/);
});

test('Arena grants physical resources and exact rolled Mods only on collision', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const spawn = arena.slice(arena.indexOf('private spawnPhysicalLootBurst'), arena.indexOf('private animatePhysicalLootLaunch'));
  const pickupCollection = arena.slice(arena.indexOf('private updatePickups'), arena.indexOf('private updateFloatingPickupMotion'));
  const modCollection = arena.slice(arena.indexOf('private updateModPickups'), arena.indexOf('private awardResolvedMod'));

  assert.match(spawn, /createPhysicalLootPlan/);
  assert.match(spawn, /this\.pickups\.push\(pickup\)/);
  assert.doesNotMatch(spawn, /this\.roundCredits\s*\+=|SaveSystem\.addMod/);
  assert.match(pickupCollection, /this\.collectPickup\(p\.type, p\.source, p\.amount\)/);
  assert.match(modCollection, /awardResolvedMod\(pickup\.definition, pickup\.source/);
  assert.match(modCollection, /pickup\.expiresAt/);
  assert.doesNotMatch(modCollection, /rollModDrop/);
});

test('ordinary enemy value remains an automatic kill reward while random pickups keep their chance gate', () => {
  const arena = source('../src/game/scenes/ArenaScene.ts');
  const enemyKill = arena.slice(arena.indexOf('private killEnemy'), arena.indexOf('private isOverdriveProtocol'));

  assert.match(enemyKill, /this\.roundCredits \+= enemyCredits/);
  assert.match(enemyKill, /this\.roundCoreTokens \+= enemyCoreTokens/);
  assert.match(enemyKill, /Math\.random\(\) < pickupChance/);
  assert.match(enemyKill, /this\.dropPickup\(enemy\.x, enemy\.y\)/);
  assert.doesNotMatch(enemyKill, /this\.spawnPhysicalLootBurst\(/);
});
