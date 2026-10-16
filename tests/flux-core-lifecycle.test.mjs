import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as config from '../src/game/config/fluxCores.ts';
import { SeededRandom } from '../src/game/systems/SeededRandom.ts';

const B = config.FLUX_CORE_BALANCE, deploymentMs = B.floorRiseMs + B.windowOpenMs;
const compiled = ts.transpileModule(readFileSync(new URL('../src/game/systems/FluxCoreSystem.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
function fixture(count, seed = 42) {
  const warning = { text: '', setText(s) { this.text = s; return this; }, setAlpha() { return this; }, destroy() {} };
  const dependencies = {
    phaser: { Math: { Clamp: (v,a,b) => Math.max(a,Math.min(b,v)) } },
    '../config/fluxCores': config, './SeededRandom': { SeededRandom },
    '../ui/HudInformationSystem.ts': { HudInformationSystem: { forScene: () => ({ createTacticalText: () => warning, notify() {} }) } }
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: id => { assert.ok(dependencies[id], id); return dependencies[id]; } });
  const scene = { time: { now: 0 }, tweens: { killTweensOf() {} } }, events = [];
  const core = new exports.FluxCoreSystem(scene, 26, seed, {}, { x: 0, y: 0, w: 1200, h: 800 }, () => false, () => false, false,
    event => events.push(event), undefined, undefined, () => events.push('shutdown'));
  if (count) core.random.int = (a,b) => a === 1 && b === core.capacity ? count : a;
  core.findSpawnPoint = () => ({ x: core.nextCoreId * 200, y: 100 });
  core.createCore = (x,y,id,now) => ({ x,y,id,spawnedAt:now,hp:10,maximumHp:10,healthFill:{width:38},
    coreOrb:{setFillStyle(){}},root:{destroy(){}},floorHatch:{destroy(){}},hatchGlow:{destroy(){}},hatchLip:{destroy(){}} });
  core.updateVisual = () => {}; core.playDestroyedEffect = () => {};
  const advance = (now,gas=false) => { scene.time.now = now; core.update(now,{x:0,y:0},gas); };
  const hit = target => core.damageCombatTarget(target,20,'weapon');
  return { core, advance, hit, events, scene };
}

for (const count of [1,3,6]) test(`${count} cores: staggered full deployment gates lasers through three complete cycles`, () => {
  const f = fixture(count), c = f.core;
  assert.equal(c.isLaserSuppressed(0), true);
  for(let cycle=0;cycle<3;cycle++) {
    f.advance(c.nextSpawnAt);
    while(c.spawnedCoreCount < count) {
      assert.equal(c.isLaserSuppressed(f.scene.time.now), true);
      f.advance(c.nextSpawnAt);
    }
    const last = Math.max(...c.cores.map(x=>x.spawnedAt));
    f.advance(last+deploymentMs-1);
    assert.equal(c.isLaserSuppressed(f.scene.time.now), true, 'last open window still incomplete');
    f.advance(last+deploymentMs);
    assert.equal(c.isLaserSuppressed(f.scene.time.now), false);
    while(c.cores.length>1) { f.hit(c.cores[0]); assert.equal(c.isLaserSuppressed(f.scene.time.now), false); }
    const victim=c.cores[0];f.hit(victim);
    assert.equal(c.isLaserSuppressed(f.scene.time.now),true);
    const until=c.laserSuppressedUntil;
    assert.equal(until-f.scene.time.now,B.laserShutdownMs);
    assert.equal(f.hit(victim),false); assert.equal(c.laserSuppressedUntil,until);
    f.advance(until-1);assert.equal(c.activeCount,0);
    f.advance(until);assert.equal(c.isLaserSuppressed(until),true,'timer expiry cannot turn lasers on');
    assert.equal(c.nextSpawnAt,until+B.laserOnlineGraceMs+B.nextCycleVarianceMinMs,'existing recovery/spawn timing retained');
  }
  assert.equal(f.events.filter(e=>e==='shutdown').length,3);
});

test('destroyed rising cores count toward the selected group without premature shutdown or deadlock', () => {
  const f=fixture(3),c=f.core;f.advance(c.nextSpawnAt);f.hit(c.cores[0]);
  assert.equal(c.cyclePhase,'spawning');assert.equal(c.spawnedCoreCount,1);assert.equal(c.isLaserSuppressed(f.scene.time.now),true);
  f.advance(c.nextSpawnAt);f.hit(c.cores[0]);f.advance(c.nextSpawnAt);f.hit(c.cores[0]);
  assert.equal(c.cyclePhase,'shutdown');assert.equal(f.events.filter(e=>e==='shutdown').length,1);
});

test('lost floor support retires without credit, replaces its selected slot, and gates the entire replacement rise', () => {
  const f=fixture(3),c=f.core;f.advance(c.nextSpawnAt);f.advance(c.nextSpawnAt);f.advance(c.nextSpawnAt);
  f.advance(c.cores.at(-1).spawnedAt+deploymentMs);assert.equal(c.isLaserSuppressed(f.scene.time.now),false);
  const lost=c.cores[1];c.updateFloorSupport({panels:[],isRectSupported:x=>x!==lost.x},f.scene.time.now);
  assert.equal(c.spawnedCoreCount,2);assert.equal(c.cores.length,2);assert.equal(c.isLaserSuppressed(f.scene.time.now),true);
  assert.equal(f.events.filter(e=>typeof e==='object').length,0,'unsupported retirement awards no loot');
  f.advance(c.nextSpawnAt);f.advance(c.cores.at(-1).spawnedAt+deploymentMs-1);assert.equal(c.isLaserSuppressed(f.scene.time.now),true);
  f.advance(f.scene.time.now+1);assert.equal(c.isLaserSuppressed(f.scene.time.now),false);
});

test('gas veto, unavailable placement retries, and cleanup cannot release the core gate', () => {
  const f=fixture(1),c=f.core;f.advance(c.nextSpawnAt,true);assert.equal(c.activeCount,0);
  assert.equal(c.isLaserSuppressed(f.scene.time.now),true);f.advance(f.scene.time.now+1);
  const find=c.findSpawnPoint;c.findSpawnPoint=()=>null;f.advance(c.nextSpawnAt);assert.equal(c.activeCount,0);
  assert.equal(c.isLaserSuppressed(f.scene.time.now),true);c.findSpawnPoint=find;f.advance(c.nextSpawnAt);
  assert.equal(c.activeCount,1);c.destroy();c.destroy();f.advance(f.scene.time.now+100000);
  assert.equal(c.activeCount,0);assert.equal(c.isLaserSuppressed(f.scene.time.now),true);assert.equal(f.events.length,0);
});

test('seeded selection still varies across the original one-to-six capacity', () => {
  const counts=new Set();for(let seed=1;seed<=80;seed++){const f=fixture(undefined,seed);f.advance(f.core.nextSpawnAt);counts.add(f.core.plannedCoreCount);}
  assert.deepEqual([...counts].sort(),[1,2,3,4,5,6]);
});
