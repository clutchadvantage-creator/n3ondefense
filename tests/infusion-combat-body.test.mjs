import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {BOSS_BALANCE} from '../src/game/config/bossBalance.ts';

function load(path,dependencies){
 const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(source,{exports,require:id=>{
  if(id==='phaser')return {__esModule:true,default:{Physics:{Arcade:{Sprite:class{}}},Math:{Clamp:(n,a,b)=>Math.max(a,Math.min(b,n))}}};
  return dependencies[id]??{};
 }});return exports;
}
const {Player}=load('../src/game/entities/Player.ts',{'../systems/AudioManager.ts':{AudioManager:{get:()=>({playSfx(){}})}}});
const {Boss}=load('../src/game/bosses/Boss.ts',{'../config/bossBalance':{BOSS_BALANCE}});
function player(){return Object.assign(Object.create(Player.prototype),{hp:100,invulnUntil:0,damageRevision:0,railInvulnerable:false,combatBody:null,scene:{time:{now:1000}},stats:{invulnMs:200},appearanceController:{beginDamageFlash(){}}});}
function boss(faction){const b=Object.assign(Object.create(Boss.prototype),{hp:200,hazardRadius:34,faction,defeated:false,onDamaged(){},onDefeated(){},weapons:[],visualRoot:{setAlpha(){}},legRig:{defeat(){}},presentationNow:1000,setVelocity(){},setTint(){}});return b;}

test('rail immunity rejects every central damage call without leaking into hit invulnerability timers',()=>{
 const p=player();p.railInvulnerable=true;
 for(const damage of [1,15,50,999])assert.equal(p.takeDamage(damage),false);
 assert.equal(p.hp,100);assert.equal(p.invulnUntil,0);assert.equal(p.damageRevision,0);
 p.railInvulnerable=false;assert.equal(p.takeDamage(10),true);assert.equal(p.hp,90);assert.equal(p.invulnUntil,1200);
});
test('the actual player routes damage to its own boss chassis and keeps health and identity intact',()=>{
 const p=player(),b=boss('player');p.combatBody=b;p.invulnUntil=5000;
 assert.equal(p.takeDamage(40),true);assert.equal(b.hp,160);assert.equal(p.hp,100);assert.equal(p.combatRadius,34);
 p.combatBody=null;assert.equal(p.combatRadius,12);assert.equal(p.takeDamage(10),false,'ordinary hit protection remains independent');
 p.scene.time.now=5001;assert.equal(p.takeDamage(10),true);assert.equal(p.hp,90);
});
test('controlled bosses receive full physical hazard damage without changing hostile boss resistance',()=>{
 const hostile=boss('enemy'),controlled=boss('player');
 assert.equal(hostile.takeDamage(100,'hazard'),100*BOSS_BALANCE.hazardDamageMultiplier);
 assert.equal(controlled.takeDamage(100,'hazard'),100);
 let defeats=0;controlled.onDefeated=()=>defeats++;
 controlled.takeDamage(1000);controlled.takeDamage(1000);assert.equal(defeats,1);assert.equal(controlled.hp,0);
});

test('operative ability shield protects the possessed chassis and expires without changing its HP or hit iframes',()=>{
 const p=player(),b=boss('player');p.combatBody=b;p.shieldUntil=1500;
 assert.equal(p.takeDamage(40),false);assert.equal(b.hp,200);assert.equal(p.hp,100);
 p.scene.time.now=1500;
 assert.equal(p.takeDamage(40),true);assert.equal(b.hp,160);assert.equal(p.invulnUntil,0);
 p.combatBody=null;p.shieldUntil=2000;
 assert.equal(p.takeDamage(40),false,'shield survives ejection');assert.equal(p.hp,100);
});

test('enemy boss shield rejects every damage owner, then normal damage resumes',()=>{
 const b=boss('enemy');b.shielded=true;
 for(const source of ['weapon','turret','mine','fence','hazard'])assert.equal(b.takeDamage(40,source),0);
 assert.equal(b.hp,200);b.shielded=false;assert.equal(b.takeDamage(40),40);assert.equal(b.hp,160);
});
