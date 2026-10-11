import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as progress from '../src/game/tutorial/TutorialProgress.ts';
import * as registry from '../src/game/tutorial/TutorialRegistry.ts';
import * as rules from '../src/game/tutorial/TutorialStepRules.ts';
import { TutorialEventBus } from '../src/game/tutorial/TutorialEventBus.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

function fixture(scene='arena'){
  TutorialEventBus.clearForTests();
  let save=createDefaultLocalSave('director-a','A'),writes=0,id=0,present=true;
  const timers=new Map(),keys=new Set(),modes=[];
  const SaveSystem={
    getActiveProfileSummary:()=>({id:save.profile.id}),get:()=>save,getTutorialProgress:()=>save.tutorials,
    recordTutorialEvent:(type,payload)=>{if(progress.recordTutorialEvent(save.tutorials,type,payload))writes++;},
    updateTutorialProgress:fn=>{fn(save.tutorials);writes++;}
  };
  class Overlay {
    hidden=true;shows=[];destroyed=false;
    show(step,_index,_total,_target,manual){this.hidden=false;this.step=step;this.manual=manual;this.shows.push(step.id);}
    hide(){this.hidden=true;} destroy(){this.destroyed=true;} confirm(){} updatePromptText(){}
  }
  const dependencies={
    '../systems/SaveSystem.ts':{SaveSystem},'./TutorialRegistry.ts':registry,'./TutorialProgress.ts':progress,
    './TutorialEventBus.ts':{TutorialEventBus},'./TutorialOverlay.ts':{TutorialOverlay:Overlay},
    './TutorialCopy.ts':{resolveTutorialCopy:step=>step},'./TutorialStepRules.ts':rules,
    '../input/UiNavigationController.ts':{getUiInputPresentation:()=>({device:'keyboardMouse',family:'generic'}),subscribeUiInputPresentation:()=>()=>{}},
    '../lyra/LyraComms.ts':{LyraComms:{get:()=>({training(){},endTraining(){}})}}
  };
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/game/tutorial/TutorialDirector.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText,{exports,require:key=>dependencies[key],window:{
    setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key),
    addEventListener:(_event,fn)=>keys.add(fn),removeEventListener:(_event,fn)=>keys.delete(fn)
  }});
  const make=()=>new exports.TutorialDirector({scene,resolveTarget:()=>null,setMode:m=>modes.push(m),canPresent:()=>present,isEventActionAvailable:()=>false});
  return {make,emit:TutorialEventBus.emit.bind(TutorialEventBus),get save(){return save;},get writes(){return writes;},
    reload(){save=normalizeLocalSave(JSON.parse(JSON.stringify(save)));},switchProfile(){save=createDefaultLocalSave('director-b','B');},
    tick(){const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();},
    block(){present=false;},keys,modes,timers};
}

test('real Director persists an off-prompt action and skips it after interrupted navigation/reload',()=>{
  const f=fixture(),d=f.make();d.startEligible();assert.equal(d.overlay.step.id,'welcome');
  f.emit('combat.playerMoved');assert.equal(progress.hasTutorialObjective(f.save.tutorials,'onboarding.basic-controls.move'),true);
  d.overlay.manual();d.destroy();f.tick();f.reload();
  const resumed=f.make();resumed.startEligible();
  assert.equal(resumed.overlay.step.id,'aim');assert.deepEqual(resumed.overlay.shows,['aim']);
  resumed.destroy();
});

test('action completion during the transition delay is committed and skips the next stale prompt',()=>{
  const f=fixture(),d=f.make();d.startEligible();d.overlay.manual();
  f.emit('combat.playerMoved');f.emit('combat.aimChanged');f.tick();
  assert.equal(d.overlay.step.id,'fire');
  d.destroy();
});

test('fallback Continue records delivery without a purchase and returning never replays the explanation',()=>{
  const f=fixture('upgrades'),d=f.make();d.startEligible();
  for(let i=0;i<4;i++){d.overlay.manual();f.tick();}
  assert.equal(progress.hasTutorialMessage(f.save.tutorials,'onboarding.store','purchase'),true);
  assert.equal(progress.hasTutorialObjective(f.save.tutorials,'onboarding.store.purchase'),false);
  d.destroy();f.reload();const resumed=f.make();resumed.startEligible();
  assert.equal(resumed.overlay.step.id,'action','the exchange explanation was already delivered before exit');
  f.emit('economy.upgradePurchased');assert.equal(progress.hasTutorialObjective(f.save.tutorials,'onboarding.store.purchase'),true);
  resumed.destroy();
});

test('pause/scene exit cancels transition timers and releases tutorial mode',()=>{
  const f=fixture(),d=f.make();d.startEligible();d.overlay.manual();
  assert.equal(f.timers.size,1);f.block();d.suspend();f.tick();
  assert.equal(f.timers.size,0);assert.equal(d.overlay.hidden,true);assert.equal(f.modes.at(-1),'live');
  d.destroy();assert.equal(f.keys.size,0);
});

test('old profile timer, key and event callbacks cannot write into a newly selected profile',()=>{
  const f=fixture(),d=f.make();d.startEligible();d.overlay.manual();
  f.switchProfile();const original=structuredClone(f.save.tutorials),writes=f.writes;
  f.emit('combat.playerMoved');f.tick();d.overlay.manual();
  assert.deepEqual(f.save.tutorials,original);assert.equal(f.writes,writes);assert.equal(d.overlay.hidden,true);
  d.destroy();
});

test('Escape dismisses teaching without swallowing the normal scene Back/Pause action',()=>{
  const f=fixture('upgrades'),d=f.make();d.startEligible();let prevented=false;
  for(const key of f.keys)key({code:'Escape',preventDefault:()=>prevented=true,stopImmediatePropagation:()=>prevented=true});
  assert.equal(prevented,false);assert.equal(d.overlay.hidden,true);
  assert.equal(progress.hasTutorialMessage(f.save.tutorials,'onboarding.store','credits'),true);
  d.destroy();
});

test('repeated action events do not create duplicate writes or repeat completed steps',()=>{
  const f=fixture(),d=f.make();d.startEligible();f.emit('combat.weaponFired');const writes=f.writes;
  for(let i=0;i<30;i++)f.emit('combat.weaponFired');
  assert.equal(f.writes,writes);assert.deepEqual(d.overlay.shows,['welcome']);d.destroy();
});

test('a pending action completed after returning unlocks the next eligible lesson immediately',()=>{
  const f=fixture(),d=f.make();d.startEligible();
  const basic=registry.TUTORIAL_SEQUENCE_BY_ID.get('onboarding.basic-controls');
  for(const step of basic.steps)progress.introduceTutorialStep(f.save.tutorials,basic.id,step.id);
  f.emit('combat.playerMoved');f.emit('combat.weaponFired');d.suspend();
  assert.equal(d.isActive(),false);
  f.emit('combat.aimChanged');
  assert.equal(d.active.id,'onboarding.hud');d.destroy();
});

test('contextual setting suppresses early workstation lessons while retaining formal training',()=>{
  const f=fixture('upgrades');f.save.settings.contextualTutorials=false;
  const d=f.make();d.startEligible();assert.equal(d.isActive(),false);
  for(const round of [1,2,3])progress.completeFirstRunTeachingRound(f.save.tutorials,round);
  d.startEligible();assert.equal(d.active.id,'onboarding.store');d.destroy();
});
