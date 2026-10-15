import test from 'node:test';
import assert from 'node:assert/strict';
import {KINETIC as C} from '../src/game/config/kinetic.ts';
import {kineticState,resetKinetic,reflectKinetic,exchangeMomentum,resolveKineticMotion,steerKinetic,sweepKineticTarget} from '../src/game/physics/KineticMotion.ts';
import {UniformSpatialGrid} from '../src/game/performance/UniformSpatialGrid.ts';
import {ARENA_ARCHETYPES} from '../src/game/config/arenaGeneration.ts';
import {generateArenaTopology} from '../src/game/systems/ArenaTopology.ts';
import {DynamicFloorActors} from '../src/game/arena/DynamicFloorActors.ts';
import {DynamicFloorModel,circleTouches} from '../src/game/arena/DynamicFloorModel.ts';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} ~= ${b}`);
const box=[{x:-20,y:-20,w:1040,h:20,surface:'outer'},{x:-20,y:700,w:1040,h:20,surface:'outer'},
 {x:-20,y:0,w:20,h:700,surface:'outer'},{x:1000,y:0,w:20,h:700,surface:'outer'}];
test('precision contact slides below threshold, moderate/high impact rebounds continuously',()=>{
  near(reflectKinetic(60,25,-1,0,'outer').vx,0);near(reflectKinetic(60,25,-1,0,'outer').vy,25);
  const moderate=reflectKinetic(220,0,-1,0,'outer'),high=reflectKinetic(1500,0,-1,0,'outer');
  assert.ok(moderate.vx< -100);near(high.vx,-1500);
  assert.ok(Math.abs(reflectKinetic(91,0,-1,0,'outer').vx)<1);
});
test('diagonal glancing contact reflects only inward normal and retains tangential momentum',()=>{
  const v=reflectKinetic(1000,300,-1,0,'inner');near(v.vx,-960);near(v.vy,297);
  const out=reflectKinetic(-1000,300,-1,0,'inner');near(out.vx,-1000);near(out.vy,300);
});
test('moving solid surfaces use relative velocity without changing stationary world tuning',()=>{
  const v=reflectKinetic(800,0,-1,0,'outer',false,false,-50,0);near(v.vx,-900);
});
test('dash and boosted slingshot speeds sweep thin walls and continue remaining travel',()=>{
  for(const speed of [500,1620,1170,8000,10000]){
    const state=kineticState(),r=resolveKineticMotion(75,100,speed,0,12,.05,[{x:100,y:0,w:2,h:300,surface:'outer'}],state);
    assert.ok(r.x<=88&&r.vx<0);near(Math.abs(r.vx),speed);assert.equal(state.impacts,1);
  }
});
test('wall-free motion preserves original velocity and displacement exactly at every launch speed',()=>{
  for(const [vx,vy] of [[0,0],[84,0],[240,0],[312,0],[1620,0],[1170,0],[170,170]]){
    const s=kineticState(),r=resolveKineticMotion(300,300,vx,vy,12,1/60,[],s);
    near(r.x,300+vx/60);near(r.y,300+vy/60);near(r.vx,vx);near(r.vy,vy);assert.equal(s.remaining,0);
  }
});
test('multiple real ricochets conserve or dissipate energy and stay contained',()=>{
  let x=400,y=300,vx=9000,vy=7300;const s=kineticState();let max=0;
  for(let i=0;i<500;i++){
    s.clock+=1/60;const r=resolveKineticMotion(x,y,vx,vy,12,1/60,box,s);
    x=r.x;y=r.y;vx=r.vx;vy=r.vy;max=Math.max(max,Math.hypot(vx,vy));
    assert.ok(x>=12&&x<=988&&y>=12&&y<=688);
  }
  assert.ok(s.impacts>20);assert.ok(max<=Math.hypot(9000,7300)+1e-6);
});
test('corners and absurd displacement exhaust bounded work without tunneling or capping velocity',()=>{
  const s=kineticState(),r=resolveKineticMotion(500,350,1e8,1e8,12,1,box,s);
  assert.ok(Number.isFinite(r.x+r.y+r.vx+r.vy));assert.ok(r.x>=12&&r.x<=988&&r.y>=12&&r.y<=688);
  assert.ok(s.iterations<=C.maxIterations);assert.ok(s.exhausted>0);assert.ok(Math.hypot(r.vx,r.vy)>1e7);
});
test('repeated same-contact corrections cannot pump energy; real departure remains free',()=>{
  const first=reflectKinetic(1000,0,-1,0,'outer'),repeat=reflectKinetic(1000,0,-1,0,'outer',false,true);
  assert.ok(Math.abs(repeat.vx)<Math.abs(first.vx));near(reflectKinetic(-500,0,-1,0,'outer').vx,-500);
});
test('ground enemy steering retains its separate knockback response',()=>{
  const s=kineticState(C.mass.grunt);s.remaining=C.enemyMomentumSeconds;
  const v=steerKinetic(-1400,0,265,265,1/60,s);assert.ok(v.x< -1300&&v.y>0);
  resetKinetic(s);assert.deepEqual(steerKinetic(-1400,0,265,0,1/60,s),{x:265,y:0});
});
test('small units scatter, heavy units resist, AI bosses remain fixed',()=>{
  const small=exchangeMomentum(900,0,0,0,-1,0,1,.65),heavy=exchangeMomentum(900,0,0,0,-1,0,1,4.5);
  assert.ok(small.bvx>heavy.bvx*2);assert.ok(heavy.avx<0);
  const boss=exchangeMomentum(900,0,0,0,-1,0,1,Infinity);near(boss.bvx,0);assert.ok(boss.avx< -600);
  const controlled=exchangeMomentum(400,0,0,0,-1,0,9,.65);assert.ok(controlled.avx>300&&controlled.bvx>400);
});
test('mass exchange does not add energy, duplicate separating contact adds no impulse',()=>{
  const r=exchangeMomentum(900,100,-100,20,-1,0,1,4.5);
  assert.ok(r.avx**2+r.avy**2+4.5*(r.bvx**2+r.bvy**2)<=900**2+100**2+4.5*(100**2+20**2));
  const separating=exchangeMomentum(-500,0,100,0,-1,0,1,1);near(separating.avx,-500);near(separating.bvx,100);
});
test('launched enemy transfers physical momentum to another and continues safely',()=>{
  let received=0,contacts=0;
  const target={x:150,y:100,vx:0,vy:0,radius:12,mass:.65,receive:(vx,vy)=>{received=vx;target.vx=vx;target.vy=vy;},contact:()=>contacts++};
  const find=(x,y,dx,dy,r,dt)=>{const hit=sweepKineticTarget(x,y,dx,dy,r,dt,target);return hit?{...hit,target}:null;};
  const state=kineticState(.65),out=resolveKineticMotion(100,100,900,0,12,.05,[],state,undefined,find);
  assert.ok(received>600&&out.vx<200);assert.equal(contacts,1);assert.ok(out.x<150);
});
test('heavy controlled frames have a subdued wall response while operative remains elastic',()=>{
  const heavy=reflectKinetic(600,0,-1,0,'outer',true);near(heavy.vx,-252);
  near(reflectKinetic(600,0,-1,0,'outer').vx,-600);
});
test('open gaps and friendly deployables are absent from solid sweeps',()=>{
  const r=resolveKineticMotion(300,350,1200,0,12,.1,box,kineticState());near(r.x,420);near(r.vx,1200);
});
test('existing spatial broad phase can enforce a hard crowded-cell visit budget',()=>{
  const grid=new UniformSpatialGrid(100),items=Array.from({length:1000},()=>({x:10,y:10}));grid.rebuild(items);
  let calls=0;assert.equal(grid.forEachNearby(10,10,100,()=>calls++,24),24);assert.equal(calls,24);
  calls=0;grid.forEachNearby(10,10,100,()=>calls++);assert.equal(calls,1000);
});
test('every generated arena contains extreme ricochets without embedding at stepped corners',()=>{
  for(const archetype of ARENA_ARCHETYPES)for(const seed of [17,918273]){
    const d=generateArenaTopology(archetype,seed),b=d.bounds;
    const clear=(x,y)=>!d.walls.some(w=>circleTouches(x,y,12-.001,w));
    const start=d.playerCandidates.find(p=>clear(p.x,p.y));assert.ok(start,archetype);
    for(const direction of [.13,.73,1.4,2.55,3.7,5.6]){
      let {x,y}=start,vx=Math.cos(direction)*9500,vy=Math.sin(direction)*9500;const s=kineticState();
      for(let i=0;i<160;i++){
        s.clock+=1/60;const r=resolveKineticMotion(x,y,vx,vy,12,1/60,d.walls,s);({x,y,vx,vy}=r);
        assert.ok(x>b.x&&x<b.x+b.w&&y>b.y&&y<b.y+b.h,archetype+' bounds');
        assert.ok(clear(x,y),archetype+' penetration');
        assert.ok(Math.hypot(vx,vy)<=9500.001,archetype+' energy');
      }
    }
  }
});
function floorFixture(kind='player'){
  const f=new DynamicFloorModel({seed:17,bounds:{x:0,y:0,w:1800,h:1200},walls:[],protected:[]},'normal');
  const p=f.panels[0];f.startEvent([p.id]);for(let i=0;i<275;i++)f.update(20);
  const a={x:p.x-45,y:p.y+p.h/2,radius:12,active:true,maxHp:500,kind,airborne:false,crossing:false,forcedMovement:kind==='enemy',
    damage:0,move(x,y){this.x=x;this.y=y;},halt(){},present(){},impact(d){this.damage+=d;}};
  const actors=new DynamicFloorActors(f,{validGround:()=>true,clearMotion:()=>true});actors.update(a);
  return {f,p,a,actors};
}
test('actual outgoing and returning ricochet segments trigger lava even with safe identical endpoints',()=>{
  for(const kind of ['player','enemy']){
    const {f,p,a,actors}=floorFixture(kind),s=kineticState(),wall={x:p.x+p.w+40,y:p.y-30,w:20,h:p.h+60};
    const out=resolveKineticMotion(a.x,a.y,6000,0,12,.075,[wall],s,undefined,undefined,(...path)=>actors.trace(a,...path));
    a.x=out.x;a.y=out.y;assert.ok(f.isSupported(a.x,a.y,12),'endpoint is supported');
    actors.update(a);assert.ok(actors.isFalling(a));assert.ok(a.x<p.x+p.w,'fall occurs on traveled lava path');
    for(let i=0;i<75;i++){f.update(20);actors.update(a);}
    assert.ok(!actors.isFalling(a));assert.ok(f.isSupported(a.x,a.y,12,true));assert.ok(a.damage>0);
  }
});
test('banking around a gap does not fall through the untraveled frame chord',()=>{
  const {f,p,a,actors}=floorFixture();const y=p.y-30;
  actors.trace(a,a.x,a.y,a.x,y);actors.trace(a,a.x,y,p.x+p.w+35,y);actors.trace(a,p.x+p.w+35,y,p.x+p.w+35,a.y);
  assert.ok(f.sweep(a.x,a.y,p.x+p.w+35,a.y,12)<1);
  a.x=p.x+p.w+35;actors.update(a);assert.ok(!actors.isFalling(a));
});
test('Dash crossing and explicit relocation discard traced gaps, but unsupported landings still fall',()=>{
  const {p,a,actors}=floorFixture();actors.trace(a,a.x,a.y,p.x+40,a.y);
  a.x=p.x+p.w+45;actors.relocated(a);actors.update(a);assert.ok(!actors.isFalling(a));
  a.crossing=true;actors.trace(a,a.x,a.y,p.x+40,a.y);a.x=p.x+40;actors.update(a);assert.ok(!actors.isFalling(a));
  a.crossing=false;actors.update(a);assert.ok(actors.isFalling(a));
});
