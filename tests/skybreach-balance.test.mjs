import test from 'node:test';
import assert from 'node:assert/strict';
import { combatPower, loadoutDifficulty, dreadnoughtHealthBudget, LOADOUT_DIFFICULTY } from '../src/game/config/CombatPower.ts';
import { PLAYER_BALANCE, WEAPON_BALANCE, ABILITY_BALANCE, getDifficultyCurve } from '../src/game/config/balance/index.ts';
import { skyBreachDifficulty } from '../src/game/anomalies/skybreach/SkyBreachDifficulty.ts';
import { arenaEnemyScaling } from '../src/game/config/ArenaCombatScaling.ts';
import { getCampaignProtocol } from '../src/game/progression/CampaignProgression.ts';
import { DreadnoughtCrossfire, DREADNOUGHT_WEAPONS } from '../src/game/anomalies/skybreach/SkyBreachDirector.ts';
import { SkyBreachSupplies } from '../src/game/anomalies/skybreach/SkyBreachSupplies.ts';

const starter = () => ({stats:{maxHealth:PLAYER_BALANCE.maxHealth},
  energyStats:{max:110,regenPerSecond:1},weapon:{...WEAPON_BALANCE},abilities:structuredClone(ABILITY_BALANCE)});

test('beginner difficulty is unchanged; permanent power response is monotonic and bounded in every mode',()=>{
  for (const mode of ['normal','overdrive','supreme']) {
    assert.deepEqual(['health','damage','pressure'].map(k=>loadoutDifficulty(mode,starter())[k]),[1,1,1]);
    let previous=loadoutDifficulty(mode,starter());
    for (const factor of [2,4,8,16,64,1024]) {
      const build=starter();build.weapon.damage*=factor;build.stats.maxHealth*=factor;
      build.energyStats.max*=factor;build.energyStats.regenPerSecond*=factor;
      const current=loadoutDifficulty(mode,build);
      for(const k of ['health','damage','pressure'])assert.ok(current[k]>=previous[k]);
      assert.ok(current.health<=LOADOUT_DIFFICULTY[mode].healthCap);
      assert.ok(current.damage<=1.08&&current.pressure<=LOADOUT_DIFFICULTY[mode].pressureCap);
      assert.ok(dreadnoughtHealthBudget(10000,current)<=60000);
      assert.ok(dreadnoughtHealthBudget(10000,current)>=dreadnoughtHealthBudget(10000,previous));previous=current;
    }
  }
});

test('heat, cooling, critical force and deployable builds count; temporary state and extra capped fire rate do not',()=>{
  const build=starter(),base=combatPower(build);
  build.hp=1;build.energy=0;build.buffs={damageBoostUntil:Infinity};
  assert.deepEqual(combatPower(build),base);
  build.weapon.fireRate=100;assert.equal(combatPower(build).weaponDps,base.weaponDps);
  build.weapon.cooldownRate*=2;assert.ok(combatPower(build).weaponDps>base.weaponDps);
  build.criticalMultiplier=5;assert.ok(combatPower(build).weaponDps>base.weaponDps*2);
  const engineer=starter();engineer.abilities.turret.damage*=50;
  assert.ok(loadoutDifficulty('overdrive',engineer).health>1);
  const defense=starter();defense.stats.maxHealth*=50;
  assert.equal(loadoutDifficulty('normal',defense).health,1);
  assert.ok(loadoutDifficulty('normal',defense).damage>1);
});

test('Arena and SkyBreach apply the captured loadout exactly once; ship budget splits across seven weapons and core',()=>{
  for(const mode of ['normal','overdrive','supreme'])for(const round of [1,5,15,30]) {
    const player=starter();player.weapon.damage*=50;
    const loadout=loadoutDifficulty(mode,player),protocol=getCampaignProtocol(mode,round);
    const curve={...getDifficultyCurve(round),defensePhase:true,loadout,activeCount:15,contractHealthMultiplier:1.3,rewardMultiplier:1};
    const sky=skyBreachDifficulty({round,protocol,player,difficulty:curve});
    assert.equal(sky.health,arenaEnemyScaling(curve,protocol,true,1.3,loadout).health);
    assert.equal(sky.damage,arenaEnemyScaling(curve,protocol,true,1.3,loadout).damage);
    assert.equal(sky.hardpointHealth*7+sky.coreHealth,sky.bossTotalHealth);
    assert.ok(sky.coreHealth/sky.bossTotalHealth>=.3&&sky.coreHealth/sky.bossTotalHealth<.302);
    assert.ok(sky.bossTotalHealth<=sky.bossHealth*6);
    player.hp=1;player.buffs={damageBoostUntil:Infinity};player.weapon.damage*=2;
    assert.deepEqual(skyBreachDifficulty({round,protocol,player,difficulty:curve}),sky,'entry snapshot is stable');
  }
});

test('faster dreadnought crossfire retains recovery gaps and at most two families',()=>{
  for(const pressure of [1,1.12,1.3]) {
    const director=new DreadnoughtCrossfire(),alive=new Set(DREADNOUGHT_WEAPONS);let casts=0;
    for(let now=0;now<30000;now+=10){const cues=director.next(now,alive,pressure);if(cues.length)casts++;assert.ok(cues.length<=2);}
    assert.ok(casts>=8&&casts<=11);
  }
});

const empty={health:0,energy:0,missingHealth:.5,missingEnergy:.5};
test('flight supplies vary by seed, avoid immediate replacements, and cannot flood under rapid kills',()=>{
  const sequences=new Set();
  for(let seed=0;seed<100;seed++) {
    const supply=new SkyBreachSupplies(seed),events=[];
    for(let now=0;now<240000;now+=100){const kind=supply.next(now,empty);if(kind)events.push([now,kind]);}
    assert.ok(events.length>=13&&events.length<=20,`moderate supply count ${events.length}`);
    for(let i=1;i<events.length;i++)assert.ok(events[i][0]-events[i-1][0]>=10500&&events[i][0]-events[i-1][0]<=20000);
    sequences.add(JSON.stringify(events));
  }
  assert.equal(sequences.size,100);
  const supply=new SkyBreachSupplies(5);
  assert.equal(supply.acceptEnemyDrop('health',0,empty),true);
  assert.equal(supply.next(0,empty),null,'collection is not a refill trigger');
  for(let now=1;now<8000;now+=20)assert.equal(supply.acceptEnemyDrop('energy',now,empty),false);
  assert.equal(supply.acceptEnemyDrop('health',10000,{...empty,health:1}),false);
  for(let now=10000;now<120000;now+=100)assert.equal(supply.next(now,{...empty,health:1,energy:1}),null);
  assert.ok(supply.next(122000,empty),'resources can return after uncollected drops leave the screen');
});

test('supply preference responds to need without forcing health or energy every time; pause holds the clock',()=>{
  const supply=new SkyBreachSupplies(42);let health=0,energy=0;
  for(let now=0;now<3600000;now+=100) {
    const kind=supply.next(now,{...empty,missingHealth:1,missingEnergy:0});
    if(kind==='health')health++;if(kind==='energy')energy++;
  }
  assert.ok(health>energy*2&&energy>15);
  const paused=new SkyBreachSupplies(1);
  for(let frame=0;frame<10000;frame++)assert.equal(paused.next(0,empty),null);
  assert.ok(paused.next(13000,empty));
});
