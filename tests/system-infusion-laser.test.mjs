import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { LASER_HAZARD_BALANCE as balance } from '../src/game/config/laserHazards.ts';
import * as scaling from '../src/game/config/hazardScaling.ts';

// Run the real hazard update/collision code with only Phaser presentation stubbed.
test('hijacked lasers keep enemy damage, restore player damage at expiry and respect suppression', () => {
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
    '../config/hazardScaling': scaling
  };
  const source = ts.transpileModule(readFileSync(new URL('../src/game/systems/LaserSecuritySystem.ts',import.meta.url),'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: id => {
    assert.ok(dependencies[id], `Unexpected dependency: ${id}`);
    return dependencies[id];
  }});
  const laser = new exports.LaserSecuritySystem({ time: { now: 0 }, add: { graphics: () => graphics } },1,{
    primary:0x55ffff,secondary:0xff55dd,accent:0xffffff
  });
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
