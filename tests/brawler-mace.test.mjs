import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAWLER_MACE as tuning, BrawlerMaceMotion, macePathIntersects } from '../src/game/bosses/BrawlerMaceMotion.ts';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('three complete swings extend, hold briefly, then retract before counting the next three',()=>{
  const m=new BrawlerMaceMotion(),windup=tuning.enemyRotationMs*tuning.swingsBeforeExtension;
  m.update(windup-1,true);assert.equal(m.extension,0);
  m.update(1,true);close(m.extension,0);
  m.update(tuning.extendMs/2,true);close(m.extension,.5);
  m.update(tuning.extendMs/2,true);assert.equal(m.extension,1);
  m.update(tuning.holdMs,true);assert.equal(m.extension,1);
  m.update(tuning.retractMs/2,true);close(m.extension,.5);
  m.update(tuning.retractMs/2,true);assert.equal(m.extension,0);
  m.update(windup-1,true);assert.equal(m.extension,0);
  m.update(tuning.extendMs+1,true);assert.equal(m.extension,1);
});

test('rotation and extension are frame-rate independent across multiple cycles',()=>{
  for(const rotation of [tuning.enemyRotationMs,tuning.controlledRotationMs]){
    const single=new BrawlerMaceMotion(),stepped=new BrawlerMaceMotion();
    single.update(16573,true,rotation);
    let left=16573;
    while(left>0){const delta=Math.min(left,17);stepped.update(delta,true,rotation);left-=delta;}
    close(single.angle,stepped.angle);close(single.extension,stepped.extension);
    close(single.reach,stepped.reach);
  }
});

test('release smoothly retracts, stops counting rotations, and reset retires all state',()=>{
  const m=new BrawlerMaceMotion();
  m.update(tuning.enemyRotationMs*3+tuning.extendMs,true);
  assert.equal(m.extension,1);
  m.update(100,false);assert.ok(m.extension>0&&m.extension<1);
  m.update(1000,false);assert.equal(m.reach,tuning.reach);close(m.angle,0);
  m.update(tuning.enemyRotationMs*2,true);assert.equal(m.extension,0);
  m.reset();assert.equal(m.angle,0);assert.equal(m.extension,0);assert.equal(m.swinging,false);
  m.update(NaN,false);m.update(-100,true);assert.ok(Number.isFinite(m.angle));
});

test('head coordinates use the same arm pivot and chain length in every facing direction',()=>{
  const m=new BrawlerMaceMotion();
  for(const extension of [0,.5,1])for(const angle of [0,Math.PI/2,Math.PI]){
    m.extension=extension;m.angle=angle;
    const p=m.head(0,0,0),turned=m.head(100,200,Math.PI/2);
    close(Math.hypot(p.x-tuning.pivotX,p.y-tuning.pivotY),m.reach);
    close(turned.x,100-p.y);close(turned.y,200+p.x);
  }
});

test('swept collision catches targets between samples once without filling the entire swing circle',()=>{
  const path=[{x:60,y:0},{x:43,y:43},{x:0,y:60}];
  assert.equal(macePathIntersects(path,53,20,8),true);
  assert.equal(macePathIntersects(path,0,0,10),false);
  assert.equal(macePathIntersects(path,-60,0,10),false);
  assert.equal(macePathIntersects([{x:10,y:20}],10,20,0),true);
  assert.equal(macePathIntersects([],10,20,5),false);
});
