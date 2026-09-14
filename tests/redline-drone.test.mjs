import assert from 'node:assert/strict';
import test from 'node:test';
import { RedlineMomentum, REDLINE_REWARD_TIERS } from '../src/game/arcade/events/RedlineMomentum.ts';
import { ArenaDroneStrafe, DroneBurstWeapon } from '../src/game/enemies/drone/DroneFlight.ts';
import { getSpawnProfile, ENEMY_BALANCE } from '../src/game/config/balance/index.ts';

test('Redline rewards active combat, recovers from damage and drains at rest',()=>{
 const m=new RedlineMomentum();
 for(let i=0;i<80;i++)m.update(250,1,false,false);
 assert.ok(m.rpm>20&&m.rpm<40);const moving=m.rpm;
 m.update(250,1,true,false);assert.ok(m.rpm>moving+5);
 for(let i=0;i<8;i++)m.kill();assert.equal(m.stage,3);
 const before=m.rpm;m.update(250,1,false,true);assert.ok(m.rpm>=before-8&&m.rpm<before);
 m.kill(true);assert.equal(m.targetKills,1);assert.equal(m.stage,3);
 for(let i=0;i<100;i++)m.update(250,0,false,false);
 assert.equal(m.rpm,0);assert.equal(m.chain,0);assert.equal(m.result().longestChain,9);
});
test('Redline sustained mastery reaches S; low activity stays D and earns fewer rewards',()=>{
 const strong=new RedlineMomentum(),idle=new RedlineMomentum();
 for(let i=0;i<208;i++){strong.update(250,1,i%12===0,false);idle.update(250,0,false,false);if(i%5===0)strong.kill(i%25===0);}
 assert.equal(strong.result().rank,'S');assert.equal(idle.result().rank,'D');assert.ok(strong.criticalMs>4000);
 const tiers=Object.values(REDLINE_REWARD_TIERS);
 for(let i=1;i<tiers.length;i++){assert.ok(tiers[i].rolls>=tiers[i-1].rolls);assert.ok(tiers[i].amountMultiplier>tiers[i-1].amountMultiplier);}
});
test('Redline chains expire and priority kills extend the window without extra kill counts',()=>{
 const m=new RedlineMomentum();m.kill(true);
 for(let i=0;i<18;i++)m.update(250,1,false,false);
 m.kill();assert.equal(m.chain,2);assert.equal(m.kills,2);
 for(let i=0;i<14;i++)m.update(250,1,false,false);
 m.kill();assert.equal(m.chain,1);assert.equal(m.longestChain,2);
});
test('Natural drone composition excludes all Normal rounds, advances gradually, and preserves pressure caps',()=>{
 for(let r=1;r<=148;r++){
  const n=getSpawnProfile(r),o=getSpawnProfile(r,0,'overdrive'),s=getSpawnProfile(r,0,'supreme');
  assert.equal(n.composition.drone,0);assert.equal(n.droneCountCap,0);
  assert.ok(o.composition.drone>0&&s.composition.drone>o.composition.drone);
  assert.ok(o.droneCountCap<=3&&s.droneCountCap<=4);
  assert.equal(o.activeCountCap,n.activeCountCap);assert.equal(s.activeWeightCap,n.activeWeightCap);
  for(const p of [n,o,s])assert.ok(Math.abs(Object.values(p.composition).reduce((a,b)=>a+b,0)-1)<1e-12);
 }
 assert.ok(getSpawnProfile(1,0,'overdrive').composition.drone<getSpawnProfile(25,0,'overdrive').composition.drone);
 assert.ok(ENEMY_BALANCE.drone.credits<ENEMY_BALANCE.tank.credits);
});
test('Flight steering remains bounded, finite, smooth and independent of ground navigation',()=>{
 const b={x:0,y:0,w:2400,h:1600};
 for(let seed=0;seed<32;seed++){
  const flight=new ArenaDroneStrafe(seed),s={x:seed%2?2390:10,y:10+seed*45,vx:0,vy:0};
  for(let i=0;i<3600;i++){
   const vx=s.vx,vy=s.vy;
   flight.update(s,1200+Math.sin(i/130)*1000,800+Math.cos(i/190)*650,185,b,1/60);
   assert.ok(Number.isFinite(s.vx)&&Math.hypot(s.vx,s.vy)<=185.001);
   assert.ok(Math.hypot(s.vx-vx,s.vy-vy)<50);
   assert.ok(s.x>=24&&s.x<=2376&&s.y>=24&&s.y<=1576);
   s.x+=s.vx/60;s.y+=s.vy/60;
  }
 }
});
test('Drone weapon emits dodgeable spaced three-shot bursts with no stalled-frame backlog',()=>{
 const weapon=new DroneBurstWeapon(),shots=[];let time=0;
 const fire=angle=>shots.push({time,angle});
 for(time=0;time<=1000;time+=50)weapon.update(time,.2,true,2300,fire);
 assert.equal(shots.length,1);
 for(time=1050;time<=1600;time+=50)weapon.update(time,2,true,2300,fire);
 assert.equal(shots.length,3);assert.ok(shots[2].angle<.4,'burst commits aim rather than tracking every shot');
 time=20000;weapon.update(time,1,true,2300,fire);assert.equal(shots.length,4);
});
