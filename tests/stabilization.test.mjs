import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysicalLootPlan } from '../src/game/loot/PhysicalLootService.ts';
import { generateHeistFacilityLayout, validateHeistFacilityLayout } from '../src/game/anomalies/heist/HeistFacilityLayout.ts';
import { normalizeHeistWallJunctions, exposedHeistWallEdges } from '../src/game/anomalies/heist/HeistWallRuntime.ts';

test('every currency denomination preserves exact integer reward totals with bounded presentation', () => {
  for (const kind of ['credits','core-tokens','plasma-chips','flux-cores']) {
    for (const amount of [0,1,2,3,7,13,500,999,10001,1000000]) {
      const plan = createPhysicalLootPlan([{kind,amount}], {maximumCreditBundles:4,maximumStackableBundles:4});
      assert.ok(plan.length <= 4);
      assert.equal(plan.reduce((total,entry)=>total+entry.amount,0), amount, `${kind}/${amount}`);
      assert.ok(plan.every(entry=>Number.isInteger(entry.amount)&&entry.amount>0));
    }
  }
  const mods = createPhysicalLootPlan([{kind:'mod',amount:9}],{maximumStackableBundles:4});
  assert.equal(mods.length,9);
  assert.ok(mods.every(entry=>entry.amount===1));
});

test('timed ammo powerups retain every individual activation', () => {
  for (const kind of ['grenade-rounds', 'scattershot-rounds']) {
    const plan = createPhysicalLootPlan([{kind, amount:13}], {maximumStackableBundles:4});
    assert.equal(plan.length, 13);
    assert.ok(plan.every(entry => entry.amount === 1 && entry.pickupType !== null));
  }
});

const overlaps = (a,b) => Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)
  && Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y);
const contains = (walls,x,y) => walls.some(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);

test('wall junctions are disjoint and only exposed edges receive facades', () => {
  for (const rects of [
    [{x:0,y:80,w:200,h:20},{x:90,y:0,w:20,h:180}],
    [{x:0,y:80,w:200,h:20},{x:90,y:0,w:20,h:90}],
    [{x:0,y:80,w:110,h:20},{x:90,y:0,w:20,h:90}]
  ]) {
    const walls = normalizeHeistWallJunctions(rects);
    for (let i=0;i<walls.length;i++) for(let j=i+1;j<walls.length;j++) assert.equal(overlaps(walls[i],walls[j]),false);
    for(let y=-1;y<201;y+=3) for(let x=-1;x<201;x+=3) assert.equal(contains(walls,x,y),contains(rects,x,y));
    for (const wall of walls) for (const edge of exposedHeistWallEdges(wall,walls)) {
      const horizontal = edge.side==='north'||edge.side==='south';
      const dx = edge.side==='east' ? .01 : edge.side==='west' ? -.01 : 0;
      const dy = edge.side==='south' ? .01 : edge.side==='north' ? -.01 : 0;
      assert.equal(contains(walls,edge.x+(horizontal?edge.length/2:0)+dx,edge.y+(horizontal?0:edge.length/2)+dy),false);
    }
  }
});

test('normalization preserves generated facility routes, doors and occupied wall union', () => {
  for(let seed=1;seed<=24;seed++) {
    const layout = generateHeistFacilityLayout(seed*98273);
    const walls = normalizeHeistWallJunctions(layout.wallRects);
    for(let i=0;i<walls.length;i++) for(let j=i+1;j<walls.length;j++) assert.equal(overlaps(walls[i],walls[j]),false);
    for(let y=0;y<=layout.world.height;y+=37) for(let x=0;x<=layout.world.width;x+=43)
      assert.equal(contains(walls,x,y),contains(layout.wallRects,x,y));
    assert.equal(validateHeistFacilityLayout({...layout,wallRects:walls}).valid,true);
  }
});
