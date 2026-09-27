import test from 'node:test';
import assert from 'node:assert/strict';
import {BossLegLocomotion,legSegmentClear} from '../src/game/bosses/BossLegLocomotion.ts';

test('open spider stance is wider than the collider and remains planted when idle',()=>{
  const gait=new BossLegLocomotion(6);gait.update(500,500,0,0,0);
  const feet=gait.feet.map(f=>({x:f.x,y:f.y}));
  assert.equal(Math.max(...feet.map(f=>f.y))-Math.min(...feet.map(f=>f.y)),180);
  for(let t=16;t<2000;t+=16)gait.update(500,500,0,t,0);
  assert.deepEqual(gait.feet.map(f=>({x:f.x,y:f.y})),feet);
  assert.ok(gait.feet.every(f=>!f.stepping&&f.valid));
});

test('planted feet stay anchored through movement, 90-degree turns and reversals in a 140px corridor',()=>{
  const blockers=[{x:0,y:0,w:3000,h:430},{x:0,y:570,w:3000,h:100}];
  const gait=new BossLegLocomotion(6,blockers);
  for(let i=0;i<1200;i++){
    const previous=gait.feet.map(f=>({x:f.x,y:f.y,stepping:f.stepping}));
    gait.update(200+i*68/60,500,i<300?0:i<450?Math.PI/2:i<700?Math.PI:0,i*1000/60,0);
    assert.ok(gait.feet.some(f=>!f.stepping),'retain support feet');
    for(let j=0;j<6;j++){
      const f=gait.feet[j];assert.ok(f.valid,`clear pose ${i}/${j}`);
      assert.ok(legSegmentClear(f.hipX,f.hipY,f.kneeX,f.kneeY,blockers));
      assert.ok(legSegmentClear(f.kneeX,f.kneeY,f.x,f.y,blockers));
      if(i&&!previous[j].stepping&&!f.stepping)assert.deepEqual({x:f.x,y:f.y},{x:previous[j].x,y:previous[j].y});
      if(i)assert.ok(Math.hypot(f.x-previous[j].x,f.y-previous[j].y)<=1000/60*.8+.001,'bounded swing speed');
    }
  }
});

test('pounce releases support deliberately and resumes grounded steps without changing body inputs',()=>{
  const gait=new BossLegLocomotion(6);gait.update(500,500,0,0,0);
  for(let i=1;i<=40;i++)gait.update(500+i*525/60,500,0,i*1000/60,0);
  assert.ok(gait.airborne&&gait.feet.every(f=>f.lift===1&&f.valid));
  gait.update(500+40*525/60,500,0,41*1000/60,0);
  assert.equal(gait.airborne,false);
  assert.ok(gait.feet.some(f=>!f.stepping));
});

test('relocation resets old world anchors rather than dragging legs across the arena',()=>{
  const gait=new BossLegLocomotion(6);gait.update(300,300,0,0,0);
  gait.update(1400,900,Math.PI,16,0);
  assert.ok(gait.feet.every(f=>Math.hypot(f.x-1400,f.y-900)<120&&f.valid));
});

test('leg capsule clearance includes walls and rounded corners',()=>{
  const blockers=[{x:100,y:100,w:100,h:100}];
  assert.equal(legSegmentClear(50,150,250,150,blockers),false);
  assert.equal(legSegmentClear(50,92,250,92,blockers),true);
  assert.equal(legSegmentClear(96,96,96,96,blockers,5),true);
  assert.equal(legSegmentClear(96,96,96,96,blockers,6),false);
});
