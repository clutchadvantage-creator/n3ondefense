import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { LASER_HAZARD_BALANCE as balance } from '../src/game/config/laserHazards.ts';
import * as scaling from '../src/game/config/hazardScaling.ts';
import * as geometry from '../src/game/systems/LaserGeometry.ts';

// Run the real hazard update/collision code with only Phaser presentation stubbed.
function createLaser(bounds) {
  const graphics = {};
  for (const method of ['setDepth', 'setBlendMode', 'clear', 'lineStyle', 'strokeCircle', 'lineBetween', 'fillStyle', 'fillCircle', 'destroy']) {
    graphics[method] = () => graphics;
  }
  const warning = { text: '', setText(value) { this.text = value; return this; }, setAlpha() { return this; }, destroy() {} };
  const dependencies = {
    phaser: { BlendModes: { ADD: 1 }, Math: { Clamp: (v,min,max) => Math.max(min,Math.min(max,v)), Linear: (a,b,t) => a+(b-a)*t } },
    '../ui/HudInformationSystem.ts': { HudInformationSystem: { forScene: () => ({ createTacticalText: () => warning }) } },
    '../config/constants': { WORLD_WIDTH: 1200, WORLD_HEIGHT: 800 },
    '../config/laserHazards': { LASER_HAZARD_BALANCE: balance },
    '../config/hazardScaling': scaling,
    './LaserGeometry.ts': geometry
  };
  const source = ts.transpileModule(readFileSync(new URL('../src/game/systems/LaserSecuritySystem.ts',import.meta.url),'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: id => {
    assert.ok(dependencies[id], `Unexpected dependency: ${id}`);
    return dependencies[id];
  }});
  return new exports.LaserSecuritySystem({ time: { now: 0 }, add: { graphics: () => graphics } },1,{
    primary:0x55ffff,secondary:0xff55dd,accent:0xffffff
  },undefined,undefined,1,bounds);
}

test('hijacked lasers keep enemy damage, restore player damage at expiry and respect suppression', () => {
  const laser=createLaser();
  let hits = 0, enemyDamage = 0;
  const player = { x:600,y:400,takeDamage:()=>{hits++;return true;} };
  const enemy = { x:600,y:400,active:true,hazardRadius:14,takeDamage:d=>{enemyDamage+=d;} };
  const now = balance.initialDelayMs + balance.telegraphMs + balance.activeMs/2;
  laser.update(now,.1,player,[enemy]);
  assert.equal(hits,1);assert.ok(enemyDamage>0);
  assert.ok(laser.hijackTarget(600,400));
  laser.setHijackedUntil(now+5000);
  const damageBefore = enemyDamage;
  laser.update(now+1,.1,player,[enemy]);
  assert.equal(hits,1);assert.ok(enemyDamage>damageBefore);
  assert.equal(laser.isDangerousAt(600,400,now+1),false);
  // Advance to expiry during an active beam window, without changing damage logic.
  laser.createdAt=5000;
  laser.update(now+5000,.1,player,[enemy]);
  assert.equal(hits,2);
  assert.equal(laser.isDangerousAt(600,400,now+5000),true);
  laser.update(now+5001,.1,player,[enemy],false,true);
  assert.equal(hits,2);assert.equal(laser.hijackTarget(600,400),null);
  assert.equal(laser.isDangerousAt(600,400,now+5001),false);
  laser.destroy();
});

test('every laser pattern clips angled beams and glow inside offset arena walls; no damage outside',()=>{
  for(const bounds of [{x:260,y:170,w:1600,h:1000},{x:400,y:350,w:1200,h:700}]) {
    const laser=createLaser(bounds),storage=[...laser.segments];
    for(let pattern=0;pattern<9;pattern++)for(let frame=0;frame<=100;frame++) {
      const count=laser.buildSegments(pattern,frame/100);
      assert.ok(count<=12);
      for(const beam of laser.segments.slice(0,count))for(const [x,y] of [[beam.x1,beam.y1],[beam.x2,beam.y2]]) {
        assert.ok(x>=bounds.x+13-1e-8&&x<=bounds.x+bounds.w-13+1e-8,`${pattern}: ${x}`);
        assert.ok(y>=bounds.y+13-1e-8&&y<=bounds.y+bounds.h-13+1e-8,`${pattern}: ${y}`);
      }
      laser.liveSegmentCount=count;
      for(const [x,y] of [[bounds.x-1,bounds.y+300],[bounds.x+bounds.w+1,bounds.y+300],
        [bounds.x+300,bounds.y-1],[bounds.x+300,bounds.y+bounds.h+1]]) {
        assert.equal(laser.touchesAnySegment(x,y,10000,count),false);
      }
    }
    assert.ok(storage.every((s,i)=>s===laser.segments[i]),'fixed segment pool retained');
    const count=laser.buildSegments(2,.15),beam=laser.segments[0];
    assert.equal(laser.touchesAnySegment((beam.x1+beam.x2)/2,(beam.y1+beam.y2)/2,1,count),true);
    laser.destroy();
  }
});

test('beam clipping preserves diagonal angle, rejects a miss, and handles reversed and parallel lines',()=>{
  const bounds={x:10,y:20,w:100,h:80};
  const beam={x1:-100,y1:-100,x2:200,y2:200};
  assert.equal(geometry.clipLaserSegment(beam,bounds),true);
  assert.deepEqual(beam,{x1:20,y1:20,x2:100,y2:100});
  for(const segment of [{x1:0,y1:0,x2:0,y2:200},{x1:0,y1:0,x2:200,y2:0}])assert.equal(geometry.clipLaserSegment(segment,bounds),false);
  const reversed={x1:150,y1:50,x2:-50,y2:50};geometry.clipLaserSegment(reversed,bounds);
  assert.deepEqual(reversed,{x1:110,y1:50,x2:10,y2:50});
});
