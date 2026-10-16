import test from 'node:test';
import assert from 'node:assert/strict';
import { SkyBreachSupplies, flightSupplyPosition } from '../src/game/anomalies/skybreach/SkyBreachSupplies.ts';
import { SkyBreachAmmoSupplies } from '../src/game/anomalies/skybreach/SkyBreachAmmoSupplies.ts';
import { createFlightSteering, steerFlight, SKY_GROUND_SCROLL } from '../src/game/anomalies/skybreach/SkyBreachMotion.ts';

test('critical energy drought has an independent bounded relief clock despite frequent health kills',()=>{
  for(const cadence of [1,.75,.6])for(let seed=1;seed<=100;seed++){
    const supplies=new SkyBreachSupplies(seed,cadence),state={health:0,energy:0,missingHealth:.9,missingEnergy:.9};
    let first=-1,energies=0,health=0;
    for(let now=0;now<120000;now+=100){
      if(supplies.healthFromEnemy(now,state))health++;
      const kind=supplies.next(now,state);
      if(kind==='health')health++;
      if(kind==='energy'){energies++;if(first<0)first=now;}
    }
    assert.ok(first>=4000&&first<=11000,`${seed}/${cadence}: ${first}`);
    assert.ok(energies>=9&&energies<=Math.ceil(120000/(8000/supplies.tempo))+1,`energy ${energies}`);
    assert.ok(health<=40,'health remains paced even with unrealistic kill pressure');
    assert.equal(supplies.next(200000,{...state,health:1,energy:1}),null);
  }
});

test('flight supply positioning keeps offscreen kills reachable with actual operative travel speed',()=>{
  for(const px of [30,720,1410])for(const py of [110,450,865])for(const x of [-900,200,2200])for(const y of [-1000,1800]){
    const p=flightSupplyPosition(x,y,px,py,265,1440,900);
    assert.ok(p.x>=80&&p.x<=1360&&p.y>=150&&p.y<=800);
    assert.ok(Math.abs(p.x-px)<=265*.65);
    assert.ok(py<=250||p.y<=py-100,'supply arrives ahead instead of behind');
  }
});

test('ammo drought supplies alternate both types with bounded offers and no early buff stacking',()=>{
  for(const tempo of [1,1.4])for(let seed=1;seed<=40;seed++){
    const supply=new SkyBreachAmmoSupplies(seed,tempo),drops=[];
    for(let now=0;now<240000;now+=100){const kind=supply.next(now,{onScreen:0,activeRemainingMs:0});if(kind)drops.push([now,kind]);}
    assert.ok(drops.length>=4&&drops.length<=6);
    for(let i=1;i<drops.length;i++){assert.notEqual(drops[i][1],drops[i-1][1]);assert.ok(drops[i][0]-drops[i-1][0]>=40000);}
    assert.equal(supply.next(999999,{onScreen:1,activeRemainingMs:0}),null);
    assert.equal(supply.next(999999,{onScreen:0,activeRemainingMs:45000},true,100),null);
  }
});

test('ground tanks follow roads and leave the view instead of lingering at the bottom',()=>{
  let y=850;const steering=createFlightSteering(1,1);
  for(let i=0;i<240;i++)y+=steerFlight(steering,'tank','line',1/60,200,y,720,680,1440,900,100).y/60;
  assert.equal(SKY_GROUND_SCROLL,49);
  assert.ok(y>900+110);
});

test('long-duration Mods can switch ammo without repeatedly stacking the current type',()=>{
  const s=new SkyBreachAmmoSupplies(81,1.4);
  const state={onScreen:0,activeRemainingMs:198000,activeKind:'grenadeRounds'};
  assert.equal(s.accept('grenadeRounds',30000,state),false);
  assert.equal(s.next(60000,state),'scattershot');
  assert.equal(s.next(60001,{...state,activeKind:'scattershot'}),null,'switch respects same supply cooldown');
  assert.equal(s.next(120000,{...state,activeKind:'scattershot'}),'grenadeRounds');
  assert.equal(s.next(200000,{...state,onScreen:1}),null);
});
