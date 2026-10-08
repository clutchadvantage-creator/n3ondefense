import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as balance from '../src/game/config/bossBalance.ts';
import { SeededRandom } from '../src/game/systems/SeededRandom.ts';

// Run the real encounter logic with only rendering/physics replaced.
// Fluent Phaser display methods need to return the proxy itself.
function display() { let p; p = new Proxy({ active: true, visible: true, width: 800 }, {
  get: (o, k) => k in o ? o[k] : () => { if(k === 'destroy') o.active = false; return p; }
}); return p; }
class FakeBoss {
  constructor(_s,x,y,_a,_r,_hit,_dead,_mode,options) {
    Object.assign(this,{x,y,faction:options.faction??'enemy',alpha:1,hazardRadius:34,hp:1000,maxHp:1000,healthRatio:1,isDefeated:false,shielded:false});
  }
  setVelocity(){return this;} setRotation(){return this;} setPosition(x,y){this.x=x;this.y=y;return this;}
  setAlpha(a){this.alpha=a;return this;} updatePresentation(){} playAction(){} destroy(){}
}
class FakeShield { destroyed=false; update(){} destroy(){this.destroyed=true;} }
const Phaser = { Math: { Angle: { Between:(x,y,xx,yy)=>Math.atan2(yy-y,xx-x) },
  Distance:{Between:(x,y,xx,yy)=>Math.hypot(xx-x,yy-y)},Clamp:(v,a,b)=>Math.max(a,Math.min(b,v)) } };
const dependencies={
  phaser:{__esModule:true,default:Phaser},'../config/bossBalance':balance,
  '../systems/SeededRandom':{SeededRandom},'./Boss':{Boss:FakeBoss},
  '../vfx/OperativeShieldEffect.ts':{OperativeShieldEffect:FakeShield},
  '../vfx/BossCombatVfx.ts':{BossCombatVfx:class {update(){} emit(){} emitArrival(){} reset(){} destroy(){}}},
  './ArtilleryMarker.ts':{createArtilleryMarker:()=>Object.fromEntries(['marker','targetRing','timingRing','reticle','payload'].map(k=>[k,display()]))}
};
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/game/bosses/BossEncounter.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{exports,require:id=>dependencies[id]??{}});
const {BossEncounter}=exports;
function fixture(archetype,controlled=true){
  const shots=[],areas=[],casts=[],stats={damage:173,fireRate:12,critical:true};
  const encounter=new BossEncounter({scale:{width:1600},add:{rectangle:display,text:display},tweens:{killTweensOf(){}}},20,123,
    archetype,{x:500,y:500},{x:0,y:0,w:1500,h:1000},()=>false,{
      fireProjectile:s=>shots.push(s),damageArea:(x,y,r,damage,attack)=>areas.push({x,y,r,damage,attack}),
      dropCredit(){},onDamaged(){},onAttackCast:a=>casts.push(a),onDefeated(){}
    },'overdrive',{faction:controlled?'player':'enemy',damageMultiplier:4,enemyShield:true,
      controlledWeapon:{fireRate:()=>stats.fireRate*.75,rollDamage:()=>({damage:stats.damage,critical:stats.critical})}});
  const input={move:{x:0,y:0},aim:{x:550,y:500},primary:true,secondary:false};
  return {encounter,shots,areas,casts,stats,input};
}
for(const [archetype,primary] of [['artillery','artillery-basic'],['storm-mage','storm-basic'],['void-brawler','brawler-contact']]){
  test(`${archetype} uses live operative damage and three-quarter primary rate`,()=>{
    const f=fixture(archetype),e=f.encounter;
    for(let i=0;i<1000;i++)e.updateControlled(4,f.input);
    const firstCount=f.casts.filter(a=>a===primary).length;
    assert.ok(firstCount>=35&&firstCount<=37,`${firstCount} casts vs 36 expected in four seconds`);
    const attacks=[...f.shots,...f.areas];assert.ok(attacks.length);assert.ok(attacks.every(a=>a.damage===173));
    assert.ok(f.shots.every(s=>s.critical));assert.equal(e.boss.shielded,false,'owned bosses never auto-shield');
    f.stats.damage=319;f.stats.fireRate=24;f.stats.critical=false;f.shots.length=f.areas.length=0;f.casts.length=0;
    for(let i=0;i<1000;i++)e.updateControlled(4,f.input);
    const count=f.casts.filter(a=>a===primary).length;
    assert.ok(count>=70&&count<=74,`${count} casts vs 72 after live rate change`);
    assert.ok([...f.shots,...f.areas].every(a=>a.damage===319));assert.ok(f.shots.every(s=>!s.critical));
    e.cancelCombat();f.shots.length=f.areas.length=0;e.updateControlled(1000,f.input);
    assert.equal(f.shots.length+f.areas.length,0,'cancel retires all controlled attacks');
  });
}
test('hostile damage and cadence remain native even if controlled weapon stats are supplied',()=>{
  const f=fixture('artillery',false),e=f.encounter;
  for(let i=0;i<1000;i++)e.update(4,{x:900,y:500});
  assert.equal(f.casts.filter(a=>a==='artillery-basic').length,5);
  assert.equal(f.shots[0].damage,balance.BOSS_BALANCE.artillery.projectileDamage*balance.getBossDamageMultiplier(20,'overdrive')*4);
});
test('enemy shield opens combat, expires, respects long cooldown and releases on cancellation',()=>{
  const {encounter:e}=fixture('artillery',false);
  assert.equal(e.boss.shielded,false,'no shield before entrance');e.playEntrance();
  assert.equal(e.boss.shielded,true);const first=e.shield;
  e.elapsedMs=2499;e.updateEnemyShield();assert.equal(e.boss.shielded,true);
  e.elapsedMs=2500;e.updateEnemyShield();assert.equal(e.boss.shielded,false);assert.ok(first.destroyed);
  e.elapsedMs=37499;e.updateEnemyShield();assert.equal(e.boss.shielded,false);
  e.elapsedMs=37500;e.updateEnemyShield();assert.equal(e.boss.shielded,true);const second=e.shield;
  e.cancelCombat();assert.equal(e.boss.shielded,false);assert.ok(second.destroyed);
});
