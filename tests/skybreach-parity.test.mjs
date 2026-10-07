import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaBossBenchmark, arenaBossStageScaling, arenaEnemyScaling, scaleArenaEnemyStats } from '../src/game/config/ArenaCombatScaling.ts';
import { getBossHealth, getBossDamageMultiplier } from '../src/game/config/bossBalance.ts';
import { getDifficultyCurve, ENEMY_BALANCE } from '../src/game/config/balance/index.ts';
import { getProtocolModeBalance } from '../src/game/config/modeBalance.ts';
import { getCampaignProtocol } from '../src/game/progression/CampaignProgression.ts';
import { getCampaignCombatPosition } from '../src/game/progression/CampaignDifficulty.ts';
import { skyBreachDifficulty } from '../src/game/anomalies/skybreach/SkyBreachDifficulty.ts';
import { SKY_DURABILITY, createFlightSteering, steerFlight, flightBank, dreadnoughtPosition } from '../src/game/anomalies/skybreach/SkyBreachMotion.ts';
import { DreadnoughtCrossfire, DREADNOUGHT_WEAPONS, attackWeapons, SKY_PATTERNS, skyFlightPlan, skyReinforcementPlan } from '../src/game/anomalies/skybreach/SkyBreachDirector.ts';

const required=[['normal',6,5],['normal',8,10],['normal',11,10],['normal',14,15],
  ['overdrive',8,10],['overdrive',14,15],['supreme',24,25],['supreme',29,30]];
for(const [mode,round,benchmark] of required)test(`${mode} ${round} benchmarks same-mode Boss ${benchmark}, including its Supreme stage`,()=>{
  const session={round,protocol:getCampaignProtocol(mode,round)},result=skyBreachDifficulty(session);
  const bossProtocol=getCampaignProtocol(mode,benchmark),position=getCampaignCombatPosition(mode,benchmark);
  const delta=getProtocolModeBalance(bossProtocol).bossHealthMultiplier/getProtocolModeBalance(mode).bossHealthMultiplier;
  const actualArenaHp=Math.max(1,Math.round(getBossHealth(position,mode)*delta));
  assert.equal(result.bossBenchmark.round,benchmark);assert.equal(result.bossBenchmark.mode,mode);
  assert.equal(result.bossBenchmark.protocol,bossProtocol);assert.equal(result.bossHealth,actualArenaHp);
  const actualDamage=getBossDamageMultiplier(getCampaignCombatPosition(mode,round),mode)
    *getProtocolModeBalance(session.protocol).bossDamageMultiplier/getProtocolModeBalance(mode).bossDamageMultiplier;
  assert.ok(Math.abs(result.bossDamage-actualDamage)<1e-10);
});

test('nearest benchmark stays within scheduled rounds in all three modes',()=>{
  for(const mode of ['normal','overdrive','supreme'])for(let round=1;round<=30;round++){
    const result=arenaBossBenchmark(mode,round),scheduled=[5,10,15,20,25,30];
    assert.equal(Math.abs(result.round-round),Math.min(...scheduled.map(r=>Math.abs(r-round))));
    assert.equal(result.mode,mode);
  }
  assert.throws(()=>arenaBossBenchmark('normal',31),RangeError);
});

test('shared Arena calculation preserves existing stats across modes, rounds, phases and Contracts',()=>{
  for(const mode of ['normal','overdrive','supreme'])for(let round=1;round<=30;round++)
    for(const defensePhase of [false,true])for(const contract of [1,1.2,1.5])for(const destroyed of [0,1,2,3]){
      const protocol=getCampaignProtocol(mode,round),modeBalance=getProtocolModeBalance(protocol);
      const curve=getDifficultyCurve(getCampaignCombatPosition(mode,round),destroyed),phase=defensePhase?1:.9;
      const session={round,protocol,difficulty:{...curve,defensePhase,contractHealthMultiplier:contract,activeCount:18,rewardMultiplier:1}};
      const sky=skyBreachDifficulty(session),arena=arenaEnemyScaling(curve,protocol,defensePhase,contract);
      assert.equal(sky.health,arena.health);assert.equal(sky.damage,arena.damage);assert.equal(sky.speed,arena.speed);
      for(const role of ['tank','drone','interceptor','strike','aa','zeppelin']) {
        const base=ENEMY_BALANCE[role==='drone'?'drone':['tank','aa','zeppelin'].includes(role)?'tank':'shooter'];
        const actual=scaleArenaEnemyStats(base,sky,SKY_DURABILITY[role]);
        assert.equal(actual.hp,Math.round(base.hp*(1+(curve.healthMultiplier-1)*phase)*contract*modeBalance.enemyHealthMultiplier*(role==='zeppelin'?7:1)),role);
        assert.equal(actual.damage,Math.round(base.damage*(1+(curve.damageMultiplier-1)*phase)*modeBalance.enemyDamageMultiplier),role);
        assert.equal(actual.speed,Math.round(base.speed*curve.speedMultiplier*modeBalance.enemySpeedMultiplier),role);
      }
    }
});

test('Contract changes ordinary durability without inventing an Arena boss Contract multiplier',()=>{
  const session={round:8,protocol:'overdrive',difficulty:{...getDifficultyCurve(38),activeCount:12,rewardMultiplier:1,contractHealthMultiplier:2}};
  assert.equal(skyBreachDifficulty(session).bossHealth,arenaBossBenchmark('overdrive',8).health);
  assert.equal(arenaBossStageScaling('overdrive','overdrive').healthMultiplier,1);
});

test('crossfire is bounded, opens with both forward cannons, and skips every destroyed family combination',()=>{
  for(let mask=0;mask<128;mask++){
    const alive=new Set(DREADNOUGHT_WEAPONS.filter((_,i)=>mask&(1<<i))),scheduler=new DreadnoughtCrossfire(),seen=new Set();
    for(let now=0;now<90000;now+=100){
      const cues=scheduler.next(now,alive,1.3);assert.ok(cues.length<=2);
      for(const cue of cues){assert.ok(cue.family==='escorts'||attackWeapons(cue.family,alive).length>0);seen.add(cue.family);}
      assert.equal(scheduler.next(now,alive,1.3).length,0);
    }
    for(const id of alive)assert.ok(seen.has(id.split('-')[0]));
  }
  const first=new DreadnoughtCrossfire().next(0,new Set(DREADNOUGHT_WEAPONS),1);
  assert.equal(first[0].family,'cannon');assert.ok(first[1].delayMs>0);
});

test('seeded encounters retain authored structure, corkscrew, varied airships and bounded reinforcement types',()=>{
  const variants=new Set();
  for(let seed=1;seed<=30;seed++){
    const plan=skyFlightPlan(seed);assert.deepEqual(plan,skyFlightPlan(seed));variants.add(JSON.stringify(plan));
    assert.equal(plan.length,11);assert.ok(plan[0].role);assert.ok(plan.at(-1).recovery);
    assert.ok(plan.some(m=>m.formation==='corkscrew'));assert.equal(plan.filter(m=>m.airship).length,2);
    assert.ok(plan.some(m=>m.role==='zeppelin'));assert.ok(plan.reduce((n,m)=>n+m.duration,0)>=220);
    const reinforcements=skyReinforcementPlan(seed);assert.equal(new Set(reinforcements).size,3);assert.equal(reinforcements[0],'drone');
  }
  assert.ok(variants.size>20);
});

test('all flight patterns stay bounded, bank, level out and return; corkscrew groups cross the lane',()=>{
  for(const pattern of SKY_PATTERNS){
    const state=createFlightSteering(1.2,1);let x=35,y=250,maxBank=0,leastX=x,mostX=x;
    for(let i=0;i<3600;i++){
      const velocity=steerFlight(state,'interceptor',pattern,1/60,x,y,720,680,1440,900,110);
      x+=velocity.x/60;y+=velocity.y/60;maxBank=Math.max(maxBank,Math.abs(flightBank(state,pattern,1/60)));
      leastX=Math.min(leastX,x);mostX=Math.max(mostX,x);
      assert.ok(x>-120&&x<1560&&y>-150&&y<1040,`${pattern} escaped: ${x},${y}`);
    }
    assert.ok(state.passes>=2,pattern);assert.ok(maxBank>.25,pattern);
    if(pattern==='corkscrew')assert.ok(leastX<400&&mostX>1000);
  }
});

test('Dreadnought drift reverses slowly and remains within the corridor',()=>{
  let last=dreadnoughtPosition(0,1440),min=last.x,max=last.x,reversals=0,sign=1;
  for(let now=100;now<=120000;now+=100){const p=dreadnoughtPosition(now,1440),dx=p.x-last.x;
    assert.ok(Math.abs(dx)<4);assert.ok(p.x-355>30&&p.x+355<1410);
    if(Math.sign(dx)!==sign){reversals++;sign=Math.sign(dx);}min=Math.min(min,p.x);max=Math.max(max,p.x);last=p;
  }
  assert.ok(reversals>=5);assert.ok(max-min>260);
});
