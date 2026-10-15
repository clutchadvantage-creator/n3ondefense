import test from 'node:test';
import assert from 'node:assert/strict';
import { OperativeRebound } from '../src/game/physics/OperativeRebound.ts';
import { kineticState, resolveKineticMotion, resetKinetic } from '../src/game/physics/KineticMotion.ts';
import { KINETIC as C } from '../src/game/config/kinetic.ts';

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6, `${a} ~= ${b}`);
const wall = { x:100, y:-500, w:10, h:1000, surface:'outer' };
const state = () => { const s=kineticState();s.operative=new OperativeRebound();return s; };
function tick(s,x,y,vx,vy,dt,rects=[wall]) {
  const r=s.operative;r.input(vx,vy);r.separate(x,y,12);
  return resolveKineticMotion(x,y,r.remaining?r.velocityX:vx,r.remaining?r.velocityY:vy,12,dt,rects,s);
}

test('operative commands never inherit old momentum or require an acceleration ramp',()=>{
  const s=state();let x=0,y=0;
  for(const [vx,vy] of [[265,0],[0,0],[-265,0],[0,265],[265/Math.SQRT2,-265/Math.SQRT2],[344.5,0],[900,0],[0,0]]){
    const r=tick(s,x,y,vx,vy,1/60,[]);
    near(r.vx,vx);near(r.vy,vy);near(r.x,x+vx/60);near(r.y,y+vy/60);
    assert.equal(s.remaining,0);assert.equal(s.operative.remaining,0);({x,y}=r);
  }
});

test('only a new collision can activate the bounded response; release and changed inputs cancel immediately',()=>{
  for(const [vx,vy] of [[0,0],[-265,0],[0,265],[187,-187],[344.5,0]]){
    const s=state();s.operative.input(265,0);
    const hit=tick(s,86,0,265,0,1/60);
    assert.ok(hit.vx<0&&s.operative.remaining>0);assert.equal(s.remaining,0);
    const next=tick(s,hit.x,hit.y,vx,vy,1/60,[]);
    near(next.vx,vx);near(next.vy,vy);near(next.x,hit.x+vx/60);near(next.y,hit.y+vy/60);
    assert.equal(s.operative.remaining,0);
  }
});

test('holding normal or boosted input into the same wall creates one bounce then stable contact',()=>{
  for(const dt of [1/30,1/60,1/144,.09])for(const speed of [265,900]){
    const s=state();let x=84,y=0,minimum=Infinity;
    for(let i=0;i<500;i++){
      const r=tick(s,x,y,speed,0,dt);({x,y}=r);minimum=Math.min(minimum,x);
      assert.ok(x<=88.00001);assert.ok(Math.abs(r.vx)<=Math.max(speed,C.operativeReboundSpeedMax));
    }
    assert.equal(s.impacts,1,`dt=${dt}, speed=${speed}`);
    assert.equal(s.operative.remaining,0);assert.equal(s.remaining,0);
    assert.ok(minimum<80,'visible separation');assert.ok(minimum>=88-C.operativeReboundSpeedMax*C.operativeReboundSeconds-1,'bounded excursion');
    assert.ok(x>87,'held contact settles at skin');
  }
});

test('uncommanded collision ends exactly without residual drift at variable step sizes',()=>{
  for(const dt of [1/30,1/60,1/144,.09,.2]){
    const s=state();let r=resolveKineticMotion(87,0,4000,0,12,dt,[wall],s);
    for(let i=0;i<30;i++)r=resolveKineticMotion(r.x,r.y,s.operative.remaining?s.operative.velocityX:r.vx,
      s.operative.remaining?s.operative.velocityY:r.vy,12,dt,[],s);
    near(r.vx,0);near(r.vy,0);assert.equal(s.operative.remaining,0);
    assert.ok(r.x>=88-C.operativeReboundSpeedMax*C.operativeReboundSeconds-1);
    const still=resolveKineticMotion(r.x,r.y,r.vx,r.vy,12,1,[],s);near(still.x,r.x);near(still.y,r.y);
  }
});

test('held diagonal input settles against a wall or inside corner without repeated impulses',()=>{
  for(const rects of [[wall],[wall,{x:-500,y:100,w:1000,h:10,surface:'inner'}]]){
    const s=state();let x=84,y=84;
    for(let i=0;i<100;i++){
      const r=tick(s,x,y,265/Math.SQRT2,265/Math.SQRT2,1/60,rects);({x,y}=r);
      assert.ok(x<=88.00001);if(rects.length===2)assert.ok(y<=88.00001);
    }
    assert.ok(s.impacts>=1&&s.impacts<=rects.length);
    assert.equal(s.operative.remaining,0);
    const out=tick(s,x,y,-265/Math.SQRT2,-265/Math.SQRT2,1/60,rects);
    assert.ok(out.x<x&&out.y<y,'immediate corner escape');
  }
});

test('intentional retreat rearms a later impact while different contacts never wait for a global cooldown',()=>{
  const s=state();let r=tick(s,86,0,265,0,1/60);
  for(let i=0;i<5;i++)r=tick(s,r.x,r.y,-265,0,1/60);
  for(let i=0;i<12&&s.impacts<2;i++)r=tick(s,r.x,r.y,265,0,1/60);
  assert.equal(s.impacts,2);
  const response=new OperativeRebound(),a={},b={};
  assert.ok(response.collide(a,-1,0,900,88,0));
  assert.ok(response.collide(b,0,-1,900,70,70));
  assert.equal(response.collide(a,-1,0,900,88,0),false);
});

test('blocked zero-time contacts cannot freeze the response lifetime in a tight corridor',()=>{
  const s=state(),walls=[{x:0,y:-500,w:10,h:1000},{x:35,y:-500,w:10,h:1000}];let x=22.5,y=0;
  for(let i=0;i<30;i++){const r=tick(s,x,y,265,0,1/60,walls);({x,y}=r);assert.ok(x>=22&&x<=23);}
  assert.equal(s.operative.remaining,0);assert.ok(s.impacts<=2);
});

test('ground-body hits use short outward response while target momentum and contact rules stay separate',()=>{
  const s=state();let received=0,contacts=0;
  const target={x:120,y:0,vx:0,vy:0,radius:12,mass:.65,receive:(vx)=>{received=vx;},contact:()=>contacts++};
  const find=(x,y,dx,dy)=>x<96&&x+dx>=96?{time:(96-x)/dx,normalX:-1,normalY:0,target}:null;
  const r=resolveKineticMotion(94,0,900,0,12,1/60,[],s,undefined,find);
  assert.ok(r.vx<0&&received>0);assert.equal(contacts,1);assert.equal(s.impacts,1);assert.equal(s.remaining,0);
});

test('high-speed thin walls and corners remain contained with bounded response speed and work',()=>{
  const box=[{x:100,y:-100,w:2,h:202,surface:'outer'},{x:-100,y:100,w:202,h:2,surface:'obstacle'}];
  for(const speed of [265,1620,8000,1e8]){
    const s=state(),r=resolveKineticMotion(85,85,speed,speed,12,.05,box,s);
    assert.ok(r.x<=88&&r.y<=88);assert.ok(Number.isFinite(r.x+r.y+r.vx+r.vy));
    assert.ok(Math.hypot(r.vx,r.vy)<=C.operativeReboundSpeedMax+1e-6);assert.ok(s.iterations<=C.maxIterations);
  }
});

test('relocation clears both response and contact locks without carrying a previous input command',()=>{
  const s=state();tick(s,86,0,265,0,1/60);resetKinetic(s);
  assert.equal(s.operative.remaining,0);assert.equal(s.operative.inputX,0);
  tick(s,86,0,265,0,1/60);assert.equal(s.impacts,2);
});
