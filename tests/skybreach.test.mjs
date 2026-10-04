import test from 'node:test';
import assert from 'node:assert/strict';
import { SkyBreachDirector, SKY_FLIGHT, formationSlots, DreadnoughtScheduler, DREADNOUGHT_WEAPONS,
  attackWeapons, coreExposed } from '../src/game/anomalies/skybreach/SkyBreachDirector.ts';
import { skyBreachDifficulty } from '../src/game/anomalies/skybreach/SkyBreachDifficulty.ts';
import { getCampaignProtocol } from '../src/game/progression/CampaignProgression.ts';
import { getProtocolModeBalance } from '../src/game/config/modeBalance.ts';

test('SkyBreach director visits every authored module once, with recovery and a finite final approach',()=>{
  const director=new SkyBreachDirector(),entered=[],waves=[];
  for(let i=0;i<3000;i++)director.update(.1,(m,n)=>entered.push(n),m=>waves.push(m));
  assert.deepEqual(entered,SKY_FLIGHT.map((_,i)=>i));
  assert.ok(director.complete);
  assert.ok(waves.length>=40&&waves.length<=60);
  assert.ok(waves.every(m=>!m.recovery));
  assert.ok(waves.filter(m=>m.role==='zeppelin').length>1,'heavy encounter keeps sending escorts');
  const length=waves.length;director.update(.1,()=>assert.fail('reentered finished flight'),m=>waves.push(m));
  assert.equal(waves.length,length);
  assert.ok(SKY_FLIGHT.reduce((s,m)=>s+m.duration,0)>=220);
});

test('Paused flight does not advance modules or spawn catch-up waves',()=>{
  const director=new SkyBreachDirector();let waves=0;
  const tick=dt=>director.update(dt,()=>{},()=>waves++);
  tick(.1);for(let i=0;i<600;i++)tick(0);
  assert.equal(director.elapsed,.1);assert.equal(waves,0);
  tick(1000);assert.ok(director.elapsed<1);assert.equal(waves,0);
});

test('All seven formation types have bounded, distinct, mirrorable entry coordinates',()=>{
  const signatures=new Set();
  for(const pattern of ['line','v','staggered','dual-column','split','crossing','diagonal']){
    const slots=formationSlots(pattern,7,1200,800),mirror=formationSlots(pattern,7,1200,800,true);
    assert.equal(slots.length,7);
    slots.forEach((s,i)=>{
      assert.ok(s.x>=0&&s.x<=1200&&s.y>-300&&s.y<800);
      assert.equal(s.x+mirror[i].x,1200);assert.equal(s.vx,-mirror[i].vx);
      assert.ok(Number.isFinite(s.vx+s.vy));
    });
    signatures.add(JSON.stringify(slots));
  }
  assert.equal(signatures.size,7);
});

test('Every destroyed-weapon combination remains schedulable without firing a destroyed family',()=>{
  for(let mask=0;mask<128;mask++){
    const alive=new Set(DREADNOUGHT_WEAPONS.filter((_,i)=>mask&(1<<i))),scheduler=new DreadnoughtScheduler();
    assert.equal(coreExposed(alive),mask===0);
    const seen=new Set();
    for(let time=0;time<90000;time+=100){
      const attack=scheduler.next(time,alive,1.3);if(!attack)continue;
      assert.ok(attack==='escorts'||attackWeapons(attack,alive).length>0);
      assert.equal(scheduler.next(time,alive,1.3),null,'no simultaneous families');seen.add(attack);
    }
    assert.ok(seen.has('escorts'));
    for(const id of alive)assert.ok(seen.has(id.split('-')[0]));
  }
});

test('SkyBreach difficulty inherits the entering contract/curve while rewards retain the 1–90 axis',()=>{
  const states=[['normal',4],['overdrive',16],['supreme',26]].map(([mode,round])=>skyBreachDifficulty({round,protocol:getCampaignProtocol(mode,round)}));
  assert.deepEqual(states.map(s=>s.rewardPosition),[4,46,86]);
  assert.deepEqual(states.map(s=>s.difficultyPosition),[4,46,136]);
  for(let i=1;i<states.length;i++){
    assert.ok(states[i].health>states[i-1].health);assert.ok(states[i].damage>states[i-1].damage);
    assert.ok(states[i].activeCap>=states[i-1].activeCap);assert.ok(states[i].formationCount>=states[i-1].formationCount);
  }
  const session={round:4,protocol:'normal',difficulty:{healthMultiplier:1.7,damageMultiplier:1.4,speedMultiplier:1.2,
    activeCount:11,rewardMultiplier:1.6,contractHealthMultiplier:1.5}};
  const inherited=skyBreachDifficulty(session);
  const mode=getProtocolModeBalance('normal');
  assert.ok(Math.abs(inherited.health-2.55*mode.enemyHealthMultiplier)<1e-9);
  assert.equal(inherited.damage,1.4*mode.enemyDamageMultiplier);
  assert.equal(inherited.rewardMultiplier,1.6);assert.equal(inherited.activeCap,14);
});
