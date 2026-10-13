import test from 'node:test';
import assert from 'node:assert/strict';
import { SkyBreachSupplies } from '../src/game/anomalies/skybreach/SkyBreachSupplies.ts';
import { createRocketMotion, advanceRocket } from '../src/game/anomalies/skybreach/SkyBreachRocketMotion.ts';

const empty = { health:0, energy:0, missingHealth:0, missingEnergy:0 };
const target = (x,y) => ({x,y,active:true,hp:100,stats:{size:32}});
test('critical health improves enemy-drop odds without rewarding every kill or exceeding one health pickup', () => {
  let critical=0,healthy=0;
  for(let seed=1;seed<=1000;seed++) {
    critical+=Number(new SkyBreachSupplies(seed).healthFromEnemy(0,{...empty,missingHealth:.8}));
    healthy+=Number(new SkyBreachSupplies(seed).healthFromEnemy(0,{...empty,missingHealth:.25}));
  }
  assert.ok(critical>healthy*3&&critical>350&&critical<650);
  const supplies=new SkyBreachSupplies(71),need={...empty,missingHealth:.8};
  assert.equal(supplies.acceptEnemyDrop('health',0,need),true);
  for(let now=1;now<4500;now+=100)assert.equal(supplies.healthFromEnemy(now,need),false);
  for(let now=5000;now<60000;now+=100) {
    assert.equal(supplies.healthFromEnemy(now,{...need,health:1}),false);
    assert.notEqual(supplies.next(now,{...need,health:1}), 'health');
  }
});
test('critical no-kill drought gets help within six active seconds even after an energy drop', () => {
  for(let seed=1;seed<=100;seed++) {
    const supplies=new SkyBreachSupplies(seed),need={...empty,missingHealth:.85};
    assert.equal(supplies.acceptEnemyDrop('energy',0,need),true);
    let first=-1;
    for(let now=0;now<=6100;now+=100)if(supplies.next(now,{...need,energy:1})==='health'){first=now;break;}
    assert.ok(first>=4000&&first<=6000,`${seed}: ${first}`);
  }
  const supply=new SkyBreachSupplies(7);
  for(let frame=0;frame<20000;frame++)assert.equal(supply.next(0,{...empty,missingHealth:.9}),null);
});
test('critical rapid kills retain energy opportunities and hard on-screen resource caps', () => {
  const supplies=new SkyBreachSupplies(23);let health=0,energy=0;
  const state={...empty,missingHealth:.9,missingEnergy:.9};
  for(let now=0;now<180000;now+=100) {
    if(supplies.healthFromEnemy(now,state))health++;
    const kind=supplies.next(now,state);if(kind==='health')health++;if(kind==='energy')energy++;
  }
  assert.ok(health>=15&&health<=40&&energy>=2,{health,energy});
  for(let now=180000;now<240000;now+=100) {
    assert.equal(supplies.next(now,{...state,health:1,energy:1}),null);
    assert.equal(supplies.healthFromEnemy(now,{...state,health:1,energy:1}),false);
  }
});
test('rockets acquire closest living eligible target and reacquire after it dies', () => {
  const core=target(0,-1),dead=target(0,-2),near=target(100,-150),far=target(0,-400);dead.hp=0;
  const r=createRocketMotion(0,0,-Math.PI/2,0,1000),targets=[core,dead,far,near];
  advanceRocket(r,0,.016,targets,t=>t!==core);assert.equal(r.target,near);
  near.hp=0;advanceRocket(r,16,.016,targets,t=>t!==core);assert.equal(r.target,far);
  core.active=false;far.active=false;advanceRocket(r,32,.016,targets,()=>true);assert.equal(r.target,null);
});
test('seeking rockets respect arm delay, turn toward lateral targets and detonate on swept contact', () => {
  const r=createRocketMotion(0,0,-Math.PI/2,0,350),enemy=target(180,-160);
  let impact=-1;
  for(let now=0;now<5000;now+=50) {
    const result=advanceRocket(r,now,.05,[enemy],()=>true);
    if(now<350)assert.notEqual(result,'impact');
    if(result==='impact'){impact=now;break;}
    assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y));
  }
  assert.ok(impact>=350&&impact<5000,`${impact}`);
  const fast=createRocketMotion(0,0,0,0,0),tiny=target(17,0);tiny.stats.size=1;
  assert.equal(advanceRocket(fast,1,.05,[tiny],()=>true),'impact');
});
test('salvo launch delays hold position; empty sky rockets expire with bounded lifetime', () => {
  const r=createRocketMotion(10,20,-Math.PI/2,0,1000,250);
  assert.equal(advanceRocket(r,200,.05,[],()=>true),'flying');
  assert.deepEqual([r.x,r.y],[10,20]);
  advanceRocket(r,250,.05,[],()=>true);assert.ok(r.y<20);
  assert.equal(advanceRocket(r,9250,.05,[],()=>true),'expired');
});
test('long mine fuses do not leave close targets in a perpetual homing orbit', () => {
  for(const armMs of [1000,1750,3000]) {
    const r=createRocketMotion(720,676,-Math.PI/2,0,armMs),enemy=target(870,520);
    let impact=-1;
    for(let now=0;now<armMs+5000;now+=16)if(advanceRocket(r,now,.016,[enemy],()=>true)==='impact'){impact=now;break;}
    assert.ok(impact>=armMs&&impact<armMs+4000,`${armMs}: ${impact}`);
  }
});
