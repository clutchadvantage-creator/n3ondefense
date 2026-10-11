import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import {
  acknowledgeTutorialMessage, completeFirstRunTeachingRound, completeTutorialSequence, createTutorialProgress,
  hasTutorialMessage, hasTutorialObjective, introduceTutorialStep, isTutorialSequenceComplete,
  isTutorialSequenceEligible, needsTutorialStep, recordTutorialEvent, reconcileTutorialEvidence,
  requestTutorialReplay, resetTutorialSequence, setFirstRunTeachingStage, skipTutorialSequence
} from '../src/game/tutorial/TutorialProgress.ts';
import { TUTORIAL_SEQUENCES, TUTORIAL_SEQUENCE_BY_ID as registry } from '../src/game/tutorial/TutorialRegistry.ts';
import { prepareCampaignRewardPackages } from '../src/game/progression/CampaignRewardPackages.ts';
import { resolveTutorialAdvancePolicy } from '../src/game/tutorial/TutorialStepRules.ts';
import { projectTutorialBoundsToViewport, projectViewportBoundsToTutorialMount, resolveTutorialCalloutPlacement, unionTutorialBounds } from '../src/game/tutorial/TutorialTargeting.ts';

const reload=state=>{
  const save=createDefaultLocalSave('tutorial-profile','Training');save.tutorials=state;
  return normalizeLocalSave(JSON.parse(JSON.stringify(save))).tutorials;
};
const explain=(state,id)=>{
  for(const step of registry.get(id).steps){introduceTutorialStep(state,id,step.id);acknowledgeTutorialMessage(state,id,step);}
  completeTutorialSequence(state,id);
};
const graduate=state=>[1,2,3].forEach(round=>completeFirstRunTeachingRound(state,round));

test('new profile starts the existing introduction and acknowledges it only once',()=>{
  const s=createTutorialProgress(),welcome=registry.get('onboarding.menu-welcome');
  assert.equal(isTutorialSequenceEligible(s,welcome,'menu'),true);
  introduceTutorialStep(s,welcome.id,'welcome');
  assert.equal(s.learning.messages[`${welcome.id}.welcome`],'delivered');
  const restored=reload(s);
  assert.equal(needsTutorialStep(restored,welcome.id,welcome.steps[0]),false);
  assert.equal(needsTutorialStep(restored,welcome.id,welcome.steps[1]),true);
  assert.equal(restored.firstRunStage,'waiting-for-start-local');
});

for(const boundary of ['death','run-failed','try-again','main-menu','pause','quit','screen-exit','browser-refresh']){
  test(`interrupted action persists across ${boundary} before the next explanation`,()=>{
    let s=createTutorialProgress();recordTutorialEvent(s,'screen.entered','arena');
    introduceTutorialStep(s,'onboarding.basic-controls','move');
    assert.equal(recordTutorialEvent(s,'combat.playerMoved'),true);
    recordTutorialEvent(s,boundary);
    s=reload(s);
    assert.equal(hasTutorialObjective(s,'onboarding.basic-controls.move'),true);
    assert.equal(hasTutorialMessage(s,'onboarding.basic-controls','move'),true);
    assert.equal(needsTutorialStep(s,'onboarding.basic-controls',registry.get('onboarding.basic-controls').steps[2]),true);
    assert.equal(s.trainingRoundsCompleted,0);
    assert.equal(s.firstRunStage,'arena-teaching');
    assert.equal(isTutorialSequenceEligible(s,registry.get('onboarding.menu-welcome'),'menu'),false);
  });
}

for(const wins of [[],[1],[1,2]])test(`death after ${wins.length} training wins never unlocks Garage clearance`,()=>{
  let s=createTutorialProgress();recordTutorialEvent(s,'screen.entered','arena');
  wins.forEach(r=>completeFirstRunTeachingRound(s,r));
  recordTutorialEvent(s,'round.entered',{round:wins.length+1});
  recordTutorialEvent(s,'player.died');s=reload(s);
  assert.equal(s.trainingRoundsCompleted,wins.length);
  assert.equal(hasTutorialObjective(s,'training.rounds'),false);
  assert.equal(isTutorialSequenceEligible(s,registry.get('onboarding.menu-garage'),'menu'),false);
  const notice=registry.get('onboarding.menu-resume-training');
  assert.equal(isTutorialSequenceEligible(s,notice,'menu'),true);
  assert.equal(notice.steps[0].completion.type,'manual');assert.equal(notice.steps[0].target,undefined);
  explain(s,notice.id);s=reload(s);
  assert.equal(isTutorialSequenceEligible(s,notice,'menu'),false);
});

test('completed round identities, not attempts or counts, determine the three-round milestone',()=>{
  const s=createTutorialProgress();
  for(let i=0;i<12;i++)assert.equal(completeFirstRunTeachingRound(s,1),false);
  assert.equal(s.trainingRoundsCompleted,1);
  completeFirstRunTeachingRound(s,3);assert.equal(hasTutorialObjective(s,'training.rounds'),false);
  assert.equal(completeFirstRunTeachingRound(s,2),true);
  assert.deepEqual(s.learning.trainingRounds,[1,2,3]);
  assert.equal(s.firstRunStage,'waiting-for-garage');
  assert.equal(completeFirstRunTeachingRound(s,3),false);
  assert.equal(completeFirstRunTeachingRound(s,undefined),false);
  assert.equal(hasTutorialObjective(s,'onboarding.tactics.turret'),false,'graduation cannot invent an ability use');
});

test('third-round eligibility and exactly three Common rewards survive repeated saves and claims',()=>{
  let save=createDefaultLocalSave('reward-once','Rewards');graduate(save.tutorials);
  save=normalizeLocalSave(save);
  assert.equal(save.progress.campaign.packages.training.eligible,true);
  const prepared=prepareCampaignRewardPackages(save.progress.campaign,save.mods,123,'2026-10-09T12:00:00Z');
  assert.equal(prepared.mods.cards.length-save.mods.cards.length,3);
  assert.equal(prepared.grants.length,1);assert.equal(prepared.grants[0].packageId,'training');
  save.mods=prepared.mods;save.progress.campaign=prepared.progress;
  for(let i=0;i<3;i++){
    save=normalizeLocalSave(JSON.parse(JSON.stringify(save)));
    completeFirstRunTeachingRound(save.tutorials,3);
    assert.deepEqual(prepareCampaignRewardPackages(save.progress.campaign,save.mods,999,'2026-10-10T12:00:00Z').grants,[]);
    assert.equal(save.mods.cards.length,3);
  }
});

test('early Store introduction remains known while a dismissed purchase stays incomplete',()=>{
  let s=createTutorialProgress();recordTutorialEvent(s,'screen.entered','arena');completeFirstRunTeachingRound(s,1);
  recordTutorialEvent(s,'screen.entered','upgrades');
  assert.equal(isTutorialSequenceEligible(s,registry.get('onboarding.store'),'upgrades'),true);
  explain(s,'onboarding.store');recordTutorialEvent(s,'economy.upgradePurchaseAttempted',{ok:false});s=reload(s);
  assert.equal(s.firstRunStage,'arena-teaching');
  assert.equal(s.learning.objectives['onboarding.store.purchase'],'IN_PROGRESS');
  assert.equal(hasTutorialMessage(s,'onboarding.store','purchase'),true);
  assert.equal(isTutorialSequenceEligible(s,registry.get('onboarding.store'),'upgrades'),false,'no repeated explanation');
  recordTutorialEvent(s,'economy.upgradePurchased',{id:'damage'});
  assert.equal(isTutorialSequenceComplete(s,'onboarding.store'),true);
  assert.equal(isTutorialSequenceComplete(s,'progression.upgrades'),true);
  graduate(s);explain(s,'onboarding.mod-collection');recordTutorialEvent(s,'mods.equipped');
  assert.equal(s.firstRunStage,'complete','early Store teaching is skipped in the formal path');
});

test('early Garage and Collection visits cannot grant training or fake equipment',()=>{
  const s=createTutorialProgress();
  recordTutorialEvent(s,'screen.entered','garage');explain(s,'onboarding.garage');
  recordTutorialEvent(s,'screen.entered','mods');explain(s,'onboarding.mod-collection');
  assert.equal(hasTutorialObjective(s,'training.rounds'),false);
  assert.equal(hasTutorialObjective(s,'onboarding.mod-collection.equip'),false);
  assert.equal(isTutorialSequenceComplete(s,'onboarding.mod-collection'),false);
  recordTutorialEvent(s,'mods.equipped');
  assert.equal(isTutorialSequenceComplete(s,'onboarding.mod-collection'),true);
  assert.notEqual(s.firstRunStage,'complete');
});

test('normal graduation retains Garage/equipment then Store order without making navigation mandatory',()=>{
  const s=createTutorialProgress();graduate(s);
  assert.equal(s.firstRunStage,'waiting-for-garage');
  explain(s,'onboarding.garage');explain(s,'onboarding.mod-collection');
  assert.equal(s.firstRunStage,'waiting-for-garage');
  recordTutorialEvent(s,'mods.equipped');assert.equal(s.firstRunStage,'waiting-for-store');
  explain(s,'onboarding.store');assert.equal(s.firstRunStage,'waiting-for-store');
  recordTutorialEvent(s,'economy.upgradePurchased');assert.equal(s.firstRunStage,'complete');
});

test('real existing equipment and upgrades satisfy objectives without an unequip/re-equip cycle',()=>{
  const s=createTutorialProgress();reconcileTutorialEvidence(s,true,true);
  const equip=registry.get('onboarding.mod-collection').steps.find(s=>s.id==='equip');
  assert.equal(needsTutorialStep(s,'onboarding.mod-collection',equip),false);
  assert.equal(hasTutorialObjective(s,'onboarding.store.purchase'),true);
  assert.equal(hasTutorialMessage(s,'onboarding.store','credits'),false,'equipment proves no unrelated explanations');
});

test('unusual order and duplicate events are monotonic and idempotent',()=>{
  const s=createTutorialProgress();
  for(const event of ['combat.ability.turret','objective.bombArmed','combat.weaponFired','combat.aimChanged','combat.playerMoved'])assert.equal(recordTutorialEvent(s,event),true);
  const before=structuredClone(s);
  for(const event of ['combat.ability.turret','objective.bombArmed','combat.weaponFired','combat.aimChanged','combat.playerMoved'])assert.equal(recordTutorialEvent(s,event),false);
  assert.deepEqual(s,before);
});

test('skip and explicit replay never erase actions or grant milestone credit',()=>{
  const s=createTutorialProgress();recordTutorialEvent(s,'combat.playerMoved');
  skipTutorialSequence(s,'onboarding.basic-controls');assert.equal(s.firstRunStage,'complete');
  requestTutorialReplay(s,'onboarding.basic-controls');resetTutorialSequence(s,'onboarding.hud');
  assert.equal(hasTutorialObjective(s,'onboarding.basic-controls.move'),true);
  assert.equal(hasTutorialObjective(s,'training.rounds'),false);
  assert.equal(s.replaySequenceId,'onboarding.basic-controls');
  completeTutorialSequence(s,'onboarding.basic-controls');assert.equal(s.replaySequenceId,'onboarding.hud');
});

test('old completed profiles, skipped profiles and saves without tutorials never become new players',()=>{
  for(const variant of ['completed','skipped','absent']){
    const save=createDefaultLocalSave('legacy-'+variant,'Legacy');delete save.tutorials.learning;
    if(variant==='absent')delete save.tutorials;
    else if(variant==='completed')save.tutorials.firstRunStage='complete';
    else save.tutorials.skippedSequences=['onboarding.basic-controls'];
    const migrated=normalizeLocalSave(save);
    assert.equal(migrated.tutorials.firstRunStage,'complete');
    assert.equal(isTutorialSequenceEligible(migrated.tutorials,registry.get('onboarding.menu-welcome'),'menu'),false);
    assert.deepEqual(migrated.wallet,save.wallet);assert.deepEqual(migrated.mods,save.mods);
    assert.deepEqual(normalizeLocalSave(migrated),migrated);
  }
});

test('legacy highest entered round and certification dialogue do not prove the third win',()=>{
  const save=createDefaultLocalSave('entered-three','Entered Three');delete save.tutorials.learning;
  save.tutorials.firstRunStage='arena-teaching';save.tutorials.trainingRoundsCompleted=2;
  save.tutorials.completedSequences=['onboarding.certification'];
  save.progress.highestRound=3;save.progress.normalHighestRound=3;save.progress.roundsCompleted=99;
  let migrated=normalizeLocalSave(save);
  assert.equal(migrated.tutorials.trainingRoundsCompleted,2);
  assert.equal(migrated.progress.campaign.packages.training.eligible,false);
  save.progress.campaign.modes.normal.highestCompletedRound=3;migrated=normalizeLocalSave(save);
  assert.equal(migrated.tutorials.trainingRoundsCompleted,3);
  assert.equal(migrated.tutorials.firstRunStage,'waiting-for-garage');
});

test('legacy one-round workstation clearance is preserved without inventing three completed rounds',()=>{
  const save=createDefaultLocalSave('old-workstation','Old Workstation');delete save.tutorials.learning;
  delete save.tutorials.lyraCurriculum;save.tutorials.firstRunStage='garage-teaching';
  const s=normalizeLocalSave(save).tutorials;
  assert.equal(s.firstRunStage,'waiting-for-garage');
  assert.equal(hasTutorialObjective(s,'training.rounds'),false);
});

test('legacy partial action steps migrate separately from messages and v2 welcome resumes safely',()=>{
  const save=createDefaultLocalSave('partial','Partial');
  save.tutorials={version:2,firstRunWelcomePending:true,completedSequences:[],skippedSequences:[],
    completedSteps:{'onboarding.menu-welcome':['welcome'],'onboarding.mod-collection':['equip'],'onboarding.basic-controls':['move']},replaySequenceId:null};
  const s=normalizeLocalSave(save).tutorials;
  assert.equal(s.firstRunStage,'waiting-for-start-local');
  assert.equal(hasTutorialMessage(s,'onboarding.mod-collection','equip'),true);
  assert.equal(hasTutorialObjective(s,'onboarding.mod-collection.equip'),false);
  assert.equal(hasTutorialObjective(s,'onboarding.basic-controls.move'),true);
});

test('profile records are independent and malformed fields normalize deterministically',()=>{
  const a=createDefaultLocalSave('profile-a','A'),b=createDefaultLocalSave('profile-b','B');
  recordTutorialEvent(a.tutorials,'combat.playerMoved');
  a.tutorials.learning.trainingRounds=[1,1,99,'2'];a.tutorials.learning.messages.bad=37;
  const restored=normalizeLocalSave(a);assert.deepEqual(restored.tutorials.learning.trainingRounds,[1]);
  assert.equal(restored.tutorials.learning.messages.bad,undefined);
  assert.equal(hasTutorialObjective(normalizeLocalSave(b).tutorials,'onboarding.basic-controls.move'),false);
});

test('registry uses unique stable IDs, successful action gates and existing contextual content',()=>{
  assert.equal(new Set(TUTORIAL_SEQUENCES.map(s=>s.id)).size,TUTORIAL_SEQUENCES.length);
  for(const sequence of TUTORIAL_SEQUENCES)assert.equal(new Set(sequence.steps.map(s=>s.id)).size,sequence.steps.length);
  assert.equal(registry.get('onboarding.store').steps.find(s=>s.id==='purchase').completion.event,'economy.upgradePurchased');
  assert.equal(registry.get('progression.mod-collection').steps.find(s=>s.id==='equip').completion.event,'mods.equipped');
  assert.match(registry.get('context.first-defuse').steps[0].body,/Eliminate or interrupt every defuser/);
});

test('advance policies distinguish acknowledgement, unavailable actions, and timers',()=>{
  assert.deepEqual(resolveTutorialAdvancePolicy({type:'manual'}),{type:'manual',label:'GOT IT',reason:'acknowledgement'});
  assert.deepEqual(resolveTutorialAdvancePolicy({type:'event',event:'mods.equipped'},false),{type:'manual',label:'CONTINUE',reason:'action-unavailable'});
  assert.deepEqual(resolveTutorialAdvancePolicy({type:'auto',delayMs:1200}),{type:'auto',delayMs:1200});
});

test('tutorial target projection and full-height placement preserve existing viewport behavior',()=>{
  const viewport=projectTutorialBoundsToViewport({x:200,y:100,width:400,height:200},{x:100,y:50,width:800,height:450},1600,900);
  assert.deepEqual(viewport,{x:200,y:100,width:200,height:100});
  assert.deepEqual(projectViewportBoundsToTutorialMount(viewport,{x:80,y:30,width:1000,height:500},2000,1000),{x:240,y:140,width:400,height:200});
  assert.deepEqual(unionTutorialBounds([{x:200,y:300,width:180,height:44},{x:200,y:360,width:180,height:44}]),{x:200,y:300,width:180,height:104});
  assert.deepEqual(resolveTutorialCalloutPlacement(1280,720,{x:20,y:130,width:900,height:570},440,230),{x:640,y:360,position:'center'});
});

test('real scenes record accomplishments independently of visible prompts and retain exits',async()=>{
  const read=path=>readFile(new URL('../src/game/'+path,import.meta.url),'utf8');
  const arena=await read('scenes/ArenaScene.ts'),menu=await read('scenes/MainMenuScene.ts'),store=await read('state/PlayerProfileStore.ts');
  assert.doesNotMatch(arena,/awaits\('combat\./);
  assert.match(store,/completeFirstRunTeachingRound\(save.tutorials, round\)/);
  assert.doesNotMatch(menu,/profile.highestRound >= 3|TEACHING LINK ACTIVE/);
  for(const file of ['UpgradeStoreScene.ts','OperatorGarageScene.ts','ModCollectionScene.ts']){
    const source=await read('scenes/'+file);
    assert.doesNotMatch(source,/isActiveSequence\('onboarding\.[^']+'\)\) return/);
    assert.match(source,/this.time.delayedCall/);
  }
});
