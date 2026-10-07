import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemInfusionRuntime } from '../src/game/mods/SystemInfusionRuntime.ts';
import { SYSTEM_INFUSIONS, SYSTEM_INFUSION_TUNING as T } from '../src/game/mods/SystemInfusions.ts';
import { ModRuntime } from '../src/game/mods/ModRuntime.ts';
import { MOD_DEFINITIONS } from '../src/game/mods/definitions.ts';
import { NORMAL_MOD_SLOTS } from '../src/game/mods/types.ts';
import { createDefaultModCollection, addModDrop, equipMod, unequipMod, infuseModCard, rankUpMod, getRecyclableUnupgradedDuplicates } from '../src/game/mods/ModInventoryService.ts';
import { normalizeModCollection } from '../src/game/mods/ModSaveNormalizer.ts';

function collection() {
 const mods=createDefaultModCollection();mods.plasmaChips=10000;
 for(const [i,slot] of NORMAL_MOD_SLOTS.entries()){
  const definition=MOD_DEFINITIONS.find(d=>d.category===(slot==='wildcard'?'utility':slot)&&d.rarity!=='legendary'&&d.rarity!=='supreme');
  addModDrop(mods,definition.id);const card=mods.cards.at(-1);
  assert.equal(equipMod(mods,slot,definition.id,card.instanceId).ok,true);
  assert.equal(infuseModCard(mods,card.instanceId,SYSTEM_INFUSIONS[i].id).ok,true);
 }
 return mods;
}
function fixture(ids=SYSTEM_INFUSIONS.map(d=>d.id)){
 const state={turrets:[],mines:[],fences:[],boost:false,energy:100,landing:true,mineValid:true,clear:true,hijackedUntil:0,ally:null,feedback:[],enemy:null,teleports:[]};
 const player={x:0,y:0};
 const fence=(x,y,width=100)=>({sprite:{x,y,active:true},x1:x,y1:y,x2:x+width,y2:y,hp:100,dps:25,slowFactor:.5,expiresAt:100000,destroy(){this.sprite.active=false;}});
 const ports={has:id=>ids.includes(id),player,turrets:()=>state.turrets,mines:()=>state.mines,fences:()=>state.fences,
  targetAt:()=>state.enemy,validLanding:()=>state.landing,validMine:()=>state.mineValid,clearSegment:()=>state.clear,
  teleport:p=>{state.teleports.push(p);Object.assign(player,p);},moveMine:(mine,p)=>Object.assign(mine.sprite,p),armMine:m=>{m.armed=true;},
  createLink:(a,b)=>({...fence(a.x,a.y,b.x-a.x),y2:b.y}),
  ascend:(turrets,p,until)=>{state.ally={turrets:[...turrets],p,until};return true;},
  boostActive:()=>state.boost,drainBoost:amount=>{if(state.energy<amount)return false;state.energy-=amount;return true;},
  hazardAt:point=>state.hazard?point:null,hijack:until=>state.hijackedUntil=until,feedback:(...args)=>state.feedback.push(args)};
 const runtime=new SystemInfusionRuntime(ports);
 const turret=(x=100,y=0)=>{const t={sprite:{x,y,active:true},hp:100,range:500};state.turrets.push(t);return t;};
 const mine=(x=100,y=0)=>{const m={sprite:{x,y,active:true},armed:false,armAt:1000,landedAt:0,detonateAt:0,beginDetonation(now,delay){if(!this.detonateAt)this.detonateAt=now+delay;}};state.mines.push(m);return m;};
 const input=(now,point={x:9999,y:9999},pressed=false,held=false,released=false,blocked=false)=>runtime.update(now,.1,point,{pressed,held,released,prompt:'E'},blocked);
 return {state,ports,runtime,turret,mine,fence,input,player};
}

test('ten registered systems have distinct IDs, behavior hooks and centralized settings',()=>{
 assert.equal(SYSTEM_INFUSIONS.length,10);assert.equal(new Set(SYSTEM_INFUSIONS.map(d=>d.id)).size,10);
 for(const d of SYSTEM_INFUSIONS){assert.equal(d.cosmeticOnly,false);assert.ok(d.requirements.length);assert.ok(d.hooks.length);assert.ok(d.plasmaCost>0);}
 assert.equal(T.ascension.turrets,3);assert.equal(T.power.maxDevices,4);
});
test('five normal slots are authoritative; an extra Legendary slot cannot activate a sixth infusion',()=>{
 const mods=collection();const extra=MOD_DEFINITIONS.find(d=>d.rarity==='legendary');addModDrop(mods,extra.id);
 const card=mods.cards.at(-1);card.infusionId='cascade';mods.loadouts[0].slots.legendary=extra.id;mods.loadouts[0].cardSlots.legendary=card.instanceId;
 const runtime=new ModRuntime(mods);assert.equal(runtime.getActiveInfusions().length,5);assert.equal(runtime.hasActiveInfusion('cascade'),false);
 const resumed=new ModRuntime(mods,[...runtime.snapshot(),{id:extra.id,rank:0,infusionId:'cascade',slot:'legendary'}]);
 assert.equal(resumed.getActiveInfusions().length,5);assert.equal(resumed.hasActiveInfusion('cascade'),false);
});
test('unequipping disables a system and re-equipping that same card restores it',()=>{
 const mods=collection(),card=mods.cards[0];unequipMod(mods,'weapon');
 assert.equal(new ModRuntime(mods).hasActiveInfusion('relay-jump'),false);
 assert.equal(equipMod(mods,'weapon',card.modId,card.instanceId).ok,true);
 assert.equal(new ModRuntime(mods).hasActiveInfusion('relay-jump'),true);
});
test('owned but unequipped cards never activate systems',()=>{
 const mods=collection();for(const slot of NORMAL_MOD_SLOTS)unequipMod(mods,slot);
 assert.equal(new ModRuntime(mods).getActiveInfusions().length,0);
});
test('card infusion, rank and recalibration survive JSON/save normalization and normal progression',()=>{
 const mods=collection(),card=mods.cards[0];card.upgradeLevel=2;
 card.calibrations=[{slotIndex:0,stat:'turretDamage',mode:'multiply',quality:'optimal',normalizedPower:.85,calibratedAt:'2026-10-05T00:00:00.000Z'}];
 const normalized=normalizeModCollection(JSON.parse(JSON.stringify(mods)));
 assert.equal(normalized.cards[0].infusionId,card.infusionId);assert.equal(normalized.cards[0].upgradeLevel,2);
 assert.equal(rankUpMod(normalized,card.modId,999999,999999,card.instanceId).ok,true);
 assert.equal(normalized.cards[0].infusionId,card.infusionId);assert.equal(normalized.cards[0].upgradeLevel,3);
 assert.deepEqual(normalized.cards[0].calibrations,card.calibrations);
 assert.equal(normalized.cards[0].rarity,card.rarity);
 assert.deepEqual(new ModRuntime(normalized).snapshot()[0].calibrations,card.calibrations);
 assert.equal(new ModRuntime(normalized).getActiveInfusions().length,5);
 const legacy=createDefaultModCollection();addModDrop(legacy,card.modId);assert.equal(normalizeModCollection(legacy).cards[0].infusionId,undefined);
});
test('duplicate installations/equips are rejected; corrupt duplicates activate once',()=>{
 const mods=collection();const balance=mods.plasmaChips;
 assert.equal(infuseModCard(mods,mods.cards[1].instanceId,'relay-jump').ok,false);assert.equal(mods.plasmaChips,balance);
 mods.cards[1].infusionId='relay-jump';
 assert.equal(new ModRuntime(mods).getActiveInfusions().filter(id=>id==='relay-jump').length,1);
 unequipMod(mods,'player');assert.equal(equipMod(mods,'player',mods.cards[1].modId,mods.cards[1].instanceId).ok,false);
});
test('System Infusions are protected from bulk recycling even on rank-zero duplicate cards',()=>{
 const mods=collection();addModDrop(mods,mods.cards[0].modId);mods.cards.at(-1).infusionId='cascade';
 assert.equal(getRecyclableUnupgradedDuplicates(mods).some(c=>c.infusionId==='cascade'),false);
});
test('Relay Jump rejects dead, foreign and blocked turrets but reaches across the arena',()=>{
 const f=fixture(),t=f.turret();t.hp=0;assert.equal(f.runtime.relay(t,100),false);t.hp=100;
 f.state.landing=false;assert.equal(f.runtime.relay(t,100),false);assert.equal(f.state.teleports.length,0);
 f.state.landing=true;t.sprite.x=9000;
 assert.equal(f.runtime.relay({...t},100),false);assert.equal(f.runtime.relay(t,100),true);
 assert.equal(f.runtime.relay(t,101),false);assert.equal(f.state.teleports.length,1);
});
test('Gridlink builds bounded unique links, propagates connectivity and removes dead source links',()=>{
 const f=fixture();f.state.fences=[f.fence(0,100),f.fence(500,100),f.fence(1000,100)];
 f.runtime.refreshNetwork(1);assert.equal(f.runtime.generatedLinks.length,2);
 const links=[...f.runtime.generatedLinks];f.runtime.refreshNetwork(2);assert.deepEqual(f.runtime.generatedLinks,links);
 assert.equal(f.runtime.reachable(f.runtime.nodes[0]).size,6);
 f.runtime.rail(f.runtime.nodes[0],3);assert.equal(f.runtime.railActive,true);assert.equal(f.runtime.railRoute.length,5);
 f.state.fences[1].hp=0;f.runtime.refreshNetwork(4);assert.equal(f.runtime.generatedLinks.length,0);assert.ok(links.every(l=>!l.fence.sprite.active));
});
test('destroyed connections stay broken when another connection is destroyed',()=>{
 const f=fixture(['gridlink']);f.state.fences=[f.fence(0,0),f.fence(300,0),f.fence(600,0)];
 f.runtime.refreshNetwork(1);assert.ok(f.runtime.generatedLinks.length>=2);
 const broken=f.runtime.generatedLinks[0];broken.fence.hp=0;f.runtime.refreshNetwork(2);
 f.runtime.generatedLinks[0].fence.hp=0;f.runtime.refreshNetwork(3);
 assert.ok(!f.runtime.generatedLinks.some(l=>l.a===broken.a&&l.b===broken.b));
 f.runtime.reset();assert.equal(f.runtime.brokenLinks.size,0);
});

test('Gridlink rejects blocked edges and caps dense grids',()=>{
 const f=fixture();f.state.fences=Array.from({length:30},(_,i)=>f.fence(i*4,100));
 f.state.clear=false;f.runtime.refreshNetwork(1);assert.equal(f.runtime.generatedLinks.length,0);
 f.state.clear=true;f.state.fences.push(f.fence(55,110));f.runtime.refreshNetwork(2);assert.ok(f.runtime.generatedLinks.length<=T.grid.maxLinks);
});
test('Target Designator respects target life, duration, turret range and obstacles, including bosses',()=>{
 const f=fixture(),t=f.turret(),enemy={x:200,y:0,active:true,isDefeated:false};
 assert.equal(f.runtime.designate(enemy,100),true);assert.equal(f.runtime.priorityTarget(t,101),enemy);
 f.state.clear=false;assert.equal(f.runtime.priorityTarget(t,102),null);f.state.clear=true;
 enemy.x=1000;assert.equal(f.runtime.priorityTarget(t,103),null);enemy.x=200;
 enemy.isDefeated=true;assert.equal(f.runtime.priorityTarget(t,104),null);
 enemy.isDefeated=false;assert.equal(f.runtime.designate(enemy,9000),true);assert.equal(f.runtime.priorityTarget(t,13000),null);
});
test('Ascension consumes exactly three valid turrets and activates the timed chassis port once',()=>{
 const f=fixture(),t=f.turret();f.turret(200);assert.equal(f.runtime.ascend(t,10),false);
 f.turret(300);f.turret(400);assert.equal(f.runtime.ascend(t,100),true);
 assert.equal(f.state.turrets.filter(t=>t.hp===0).length,3);assert.equal(f.state.ally.turrets.length,3);
 assert.equal(f.state.ally.until,20100);assert.equal(f.runtime.ascend(t,200),false);
});
test('Detonator Link uses a single scheduled detonation and does not touch airborne/foreign mines',()=>{
 const f=fixture(),m=f.mine();m.landedAt=1000;assert.equal(f.runtime.detonate(m,100),false);m.landedAt=0;
 assert.equal(f.runtime.detonate({...m},100),false);assert.equal(f.runtime.detonate(m,100),true);
 assert.equal(f.runtime.detonate(m,101),false);assert.equal(m.detonateAt,100);assert.equal(m.armed,true);
});
test('Cascade sequences branches and outward chains without re-triggering visited mines',()=>{
 const f=fixture(),a=f.mine(0),b=f.mine(300),c=f.mine(600),d=f.mine(100);
 f.runtime.onMineDetonated(a,100);a.sprite.active=false;
 assert.equal(b.detonateAt,240);assert.equal(d.detonateAt,380);assert.equal(c.detonateAt,0);
 f.runtime.onMineDetonated(b,240);b.sprite.active=false;assert.equal(c.detonateAt,520);
 f.runtime.onMineDetonated(b,240);assert.equal(c.detonateAt,520);assert.equal(d.detonateAt,380);
});
test('Cascade ignores dead mines and bounds a crowded minefield',()=>{
 const f=fixture(),a=f.mine(0);for(let i=0;i<100;i++)f.mine(i);f.state.mines[1].sprite.active=false;
 f.runtime.onMineDetonated(a,100);assert.equal(f.state.mines[1].detonateAt,0);
 assert.equal(f.state.mines.filter(m=>m.detonateAt>0).length,T.cascade.maxMines);
});
test('Magnetic Redeploy moves the same mine, preserves limits/state, rejects bad placement and enforces cooldown',()=>{
 const f=fixture(),m=f.mine();assert.equal(f.runtime.selectMine(m,100),true);
 f.state.mineValid=false;assert.equal(f.runtime.relocate({x:300,y:0},101),false);assert.equal(m.sprite.x,100);
 f.state.mineValid=true;assert.equal(f.runtime.relocate({x:800,y:0},102),false);
 assert.equal(f.runtime.relocate({x:400,y:0},103),true);assert.equal(f.state.mines[0],m);assert.equal(f.state.mines.length,1);
 assert.equal(f.runtime.selectMine(m,104),false);assert.equal(f.runtime.selectMine(m,4200),true);
});
test('Power Bus caps devices, charges per connection, arms mines and stops immediately with Boost',()=>{
 const f=fixture();for(let i=0;i<8;i++)f.mine(50+i);f.state.boost=true;f.input(100);
 assert.equal(f.runtime.poweredDevices.size,4);assert.ok(Math.abs(f.state.energy-(100-4*6*.1))<.0001);
 assert.equal(f.state.mines.filter(m=>m.armed).length,4);f.state.boost=false;f.input(101);assert.equal(f.runtime.poweredDevices.size,0);
 f.state.boost=true;f.state.energy=0;f.input(102);assert.equal(f.runtime.poweredDevices.size,0);
});
test('Hazard Hijack requires a supported source, applies a finite lease and clears on reset',()=>{
 const f=fixture(['hazard-hijack']);f.input(100,{x:0,y:0},true,true);assert.equal(f.state.hijackedUntil,0);
 f.state.hazard=true;f.input(200,{x:0,y:0},true,true);assert.equal(f.state.hijackedUntil,5200);
 f.input(300,{x:0,y:0},true,true);assert.equal(f.state.hijackedUntil,5200);
 f.runtime.reset();assert.equal(f.state.hijackedUntil,0);
});
test('Fence Rail starts in one press, rejects unsafe geometry and cancels a destroyed route',()=>{
 const f=fixture(['fence-rail']);f.state.fences=[f.fence(0,100)];f.runtime.refreshNetwork(1);
 const [a]=f.runtime.nodes;f.state.clear=false;assert.equal(f.runtime.rail(a,10),false);
 f.state.clear=true;f.state.landing=false;assert.equal(f.runtime.rail(a,20),false);assert.equal(f.state.teleports.length,0);
 f.state.landing=true;assert.equal(f.runtime.rail(a,30),true);assert.equal(f.state.teleports.length,1);
 f.state.fences[0].hp=0;f.input(60);assert.equal(f.state.teleports.length,1);assert.equal(f.runtime.railActive,false);
});

test('persistent selection survives aim drift, switches once, consumes and clears invalid ownership',()=>{
 const ids=['relay-jump'],f=fixture(ids),a=f.turret(100),b=f.turret(2500);
 f.input(100,a.sprite);assert.equal(f.runtime.selection.target,a);
 f.input(220,{x:-999,y:400});assert.equal(f.runtime.selection.target,a);
 f.input(340,b.sprite);assert.equal(f.runtime.selection.target,b);
 f.input(460,{x:-999,y:400},true,true);assert.equal(f.runtime.selection,null);assert.ok(f.player.x>2400);
 f.input(560,b.sprite);assert.equal(f.runtime.selection,null);
 f.input(6000,a.sprite);assert.equal(f.runtime.selection.target,a);
 ids.length=0;f.input(6001);assert.equal(f.runtime.selection,null);
});

test('all interaction Infusions retain and validate their object, including hold with aim drift',()=>{
 for(const id of ['detonator-link','magnetic-redeploy','target-designator','hazard-hijack','ascension-protocol','fence-rail']){
  const f=fixture([id]);let point={x:100,y:0};
  if(id.includes('redeploy')||id==='detonator-link')f.mine();
  if(id==='target-designator'){f.state.enemy={...point,active:true};f.ports.targetAt=p=>Math.hypot(p.x-100,p.y)<54?f.state.enemy:null;}
  if(id==='hazard-hijack'){f.state.hazard=true;f.ports.hazardAt=p=>Math.hypot(p.x-100,p.y)<54?point:null;}
  if(id==='ascension-protocol'){f.turret();f.turret(200);f.turret(300);}
  if(id==='fence-rail'){f.state.fences=[f.fence(100,0)];}
  f.input(100,point);const target=f.runtime.selection?.target;assert.ok(target,id);
  f.input(220,{x:9000,y:9000});assert.equal(f.runtime.selection?.target,target,id);
  f.input(300,{x:9000,y:9000},true,true);if(id==='ascension-protocol')f.input(1200,{x:9000,y:9000},false,true);
  assert.ok(f.runtime.activation,id);f.runtime.reset();assert.equal(f.runtime.selection,null);
 }
});

test('controller direction selects distant turrets and neutral stick retains the lock',()=>{
 const f=fixture(['relay-jump']),a=f.turret(2800,0),b=f.turret(0,2400);
 const step=(now,direction)=>f.runtime.update(now,.016,{x:410,y:0},{pressed:false,held:false,released:false,prompt:'A',aimDirection:direction});
 step(100,{x:1,y:0});assert.equal(f.runtime.selection.target,a);
 step(250,null);assert.equal(f.runtime.selection.target,a);
 step(400,{x:0,y:1});assert.equal(f.runtime.selection.target,b);
 b.sprite.active=false;step(401,null);step(550,null);assert.equal(f.runtime.selection.target,a);
 a.hp=0;step(700,null);assert.equal(f.runtime.selection,null);
});

test('rail traverses every turn at configured speed in both directions with exact immunity lifetime',()=>{
 for(const reverse of [false,true]){
  const f=fixture(['fence-rail']),a=f.fence(0,100,100),b=f.fence(100,100,0),c=f.fence(100,300,100);
  b.y2=300;f.state.fences=[a,b,c];f.runtime.refreshNetwork(1);
  const changes=[];f.ports.railState=active=>changes.push(active);
  const node=reverse?f.runtime.nodes.at(-1):f.runtime.nodes[0];Object.assign(f.player,node);
  assert.equal(f.runtime.rail(node,100),true);assert.deepEqual(changes,[true]);
  const positions=[];for(let t=110;t<=500&&f.runtime.railActive;t+=10){f.runtime.update(t,.01,{x:999,y:999},{pressed:true,held:true,released:false,prompt:'E'});positions.push({...f.player});}
  assert.ok(positions.some(p=>p.x===100&&p.y>110&&p.y<290));
  assert.equal(f.runtime.railActive,false);assert.deepEqual(changes,[true,false]);
 }
});

test('destroying an upcoming link stops at its preceding node without crossing the gap',()=>{
 const f=fixture(['fence-rail','gridlink']);f.state.fences=[f.fence(0,0,100),f.fence(500,0,100)];f.runtime.refreshNetwork(1);
 const link=f.runtime.generatedLinks[0].fence;assert.equal(f.runtime.rail(f.runtime.nodes[0],10),true);link.hp=0;
 f.runtime.update(20,1,{x:0,y:0},{pressed:false,held:false,released:false,prompt:'E'});
 assert.equal(f.player.x,100);assert.equal(f.runtime.railActive,false);assert.equal(f.runtime.generatedLinks.length,0);
 f.runtime.reset();assert.equal(f.runtime.railActive,false);
});
test('shared interaction hold consumes Ascension without also jumping; shooting never activates a system',()=>{
 const f=fixture(['relay-jump','ascension-protocol']);const t=f.turret();f.turret(200);f.turret(300);
 f.input(100,t.sprite,false,false);assert.equal(f.state.ally,null);assert.equal(f.state.teleports.length,0);
 f.input(200,t.sprite,true,true);assert.equal(f.state.ally,null);
 f.input(1100,t.sprite,false,true);f.input(1110,t.sprite,false,false,true);
 assert.ok(f.state.ally);assert.equal(f.state.teleports.length,0);
});
test('encounter reset removes generated links, selection, commands and powered state',()=>{
 const f=fixture();f.state.fences=[f.fence(0,100),f.fence(300,100)];f.input(100);const links=[...f.runtime.generatedLinks];
 f.runtime.reset();assert.equal(f.runtime.fences.length,0);assert.equal(f.runtime.designatedTarget,null);assert.ok(links.every(l=>!l.fence.sprite.active));
});
