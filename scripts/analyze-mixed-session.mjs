import { readFile, writeFile } from 'node:fs/promises';

const input=process.argv[2]??'artifacts/mixed-soak-after.json';
const raw=JSON.parse((await readFile(input,'utf8')).replace(/^\uFEFF/,''));
const report=raw.result?.result?.value??raw;
const progression=process.argv.includes('--progression');
const quiescent=report.checkpoints.filter(s=>s.label==='quiescent');
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
const range=values=>({min:Math.min(...values),max:Math.max(...values)});
const mean=values=>values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
const rounded=x=>Math.round(x*1000)/1000;
const countListeners=s=>Object.values(s??{}).reduce((sum,n)=>sum+n,0);
const retiredScenes=['arena','anomaly-heist','loading','legendary-mod-reveal','options'];
check(!report.running&&report.errors.length===0,'The browser reported an error or an unfinished run');
const requiredRounds=progression?report.options.rounds:30;
check(report.coverage.ordinaryRound>=requiredRounds&&report.boundaries.length>=requiredRounds,'Incomplete rounds/boundaries');
const requiredCoverage=['arcadeEvent','boss','bossLoot','modReveal','roundFinished','loading'];
if(!progression||report.options.heists)requiredCoverage.push('heistEntry','physicalHeistLoot','heistReturn','heistOptionsResize');
for(const key of requiredCoverage)
  check(report.coverage[key]>0,`Missing coverage: ${key}`);
const first=quiescent[0];
for(const q of quiescent){
  check(q.resizeListeners===first.resizeListeners,`Resize listeners drifted at round ${q.round}`);
  check(q.gameListeners===first.gameListeners,`Game listeners drifted at round ${q.round}`);
  check(JSON.stringify(q.globals)===JSON.stringify(first.globals),`Global listeners drifted at round ${q.round}`);
  for(const s of q.scenes.filter(s=>retiredScenes.includes(s.key))) {
    check(!s.active,`${s.key} still active at quiescent round ${q.round}`);
    check(s.display===0&&s.update===0&&s.updatePending===0,`${s.key} retained display/update work at ${q.round}`);
    check(s.bodies===0&&s.staticBodies===0&&s.pendingBodies===0,`${s.key} retained physics work at ${q.round}`);
    check(s.tweens===0&&s.timers===0&&s.delayed===0&&s.colliders===0&&s.colliderPending===0,`${s.key} retained deferred work at ${q.round}`);
    check(s.input===0&&s.keyboard===0,`${s.key} retained gameplay input listeners at ${q.round}`);
    if(s.canvasOwners!==undefined)check(s.canvasOwners===0,`${s.key} retained canvas/text owners at ${q.round}`);
    for(const [key,size] of Object.entries(s.retained)) {
      // These are saved Mod IDs and bounded DEV records, never live objects.
      if(['roundBoundaryHistory','encounterCheckpointHistory','modsEarned'].includes(key)) continue;
      // HEIST's cached payload holds at most five strings, not HUD objects.
      if(s.key==='anomaly-heist'&&key==='hudBuffs') {
        check(size<=5,`HEIST buff label data grew beyond its fixed slots at ${q.round}`);
        continue;
      }
      check(size===0,`${s.key}.${key} retained encounter entries at ${q.round}`);
    }
  }
  check(q.ownership.stale===0&&q.diagnostic.cleanupFailures===0,`Ownership retirement failed at ${q.round}`);
}
for(const s of report.checkpoints){
  if(s.label==='round-active') {
    check(s.scenes.filter(s=>s.active).every(s=>s.key==='arena'),`Other scenes active in Arena at ${s.round}`);
    check(s.scenes.filter(s=>s.visible&&s.display>0).every(s=>s.key==='arena'),`Other scenes render behind Arena at ${s.round}`);
  }
  if(s.label==='heist-active') {
    const arena=s.scenes.find(s=>s.key==='arena');
    check(arena.sleeping&&!arena.active&&!arena.visible,`Arena not isolated during HEIST at ${s.round}`);
    check(!s.scenes.find(s=>s.key==='anomaly-heist').physicsPaused,`HEIST input left physics paused at ${s.round}`);
  }
  if(s.label==='heist-enemies-retired') {
    const heist=s.scenes.find(s=>s.key==='anomaly-heist');
    // A projectile already fired by a defeated enemy keeps its normal lifetime.
    // Count its live body; the defeated enemies and their collider pairs must go.
    const liveProjectiles=s.heist?.heist?.projectiles??heist.retained.projectiles??0;
    check(heist.retained.enemies===0&&heist.bodies===1+liveProjectiles&&heist.colliders===2&&heist.colliderPending===0,`Dead HEIST enemies retained physics at ${s.round}`);
  }
  if(s.loot){
    check(s.loot.count<=64,`HEIST loose loot exceeded budget at ${s.round}`);
    const normalize=loot=>({...loot,modIds:[...loot.modIds].sort()});
    check(JSON.stringify(normalize(s.loot.expected))===JSON.stringify(normalize(s.loot.collected)),`Physical reward mismatch at ${s.round}`);
  }
}
// Match the repeating eight-round presentation/resize cycle, excluding startup.
const early=progression?report.encounters.slice(0,Math.ceil(requiredRounds/3)):report.encounters.filter(s=>s.index>=9&&s.index<=16);
const late=progression?report.encounters.slice(-Math.ceil(requiredRounds/3)):report.encounters.filter(s=>s.index>=25&&s.index<=32);
const performanceFor=samples=>({samples:samples.length,
  meanFrameMs:rounded(mean(samples.map(s=>s.frames.mean))),
  meanUpdateMs:rounded(mean(samples.map(s=>s.update.mean))),
  meanP95FrameMs:rounded(mean(samples.map(s=>s.frames.p95))),
  meanP95UpdateMs:rounded(mean(samples.map(s=>s.update.p95)))});
const earlyPerformance=performanceFor(early),latePerformance=performanceFor(late);
check(latePerformance.meanFrameMs<=earlyPerformance.meanFrameMs*1.3+2,'Equivalent late frames degraded beyond the warmup/variance allowance');
check(latePerformance.meanUpdateMs<=earlyPerformance.meanUpdateMs*1.3+.5,'Equivalent late scene updates degraded');
const resourceKeys=['displayObjects','updateListObjects','renderTextures','particleEmitters','dynamicBodies','activeDynamicBodies','staticBodies','pendingPhysicsBodies',
  'colliderCapacity','timers','tweens','projectilePoolCapacity','fxPoolCapacity','trailCapacity',
  'activeMechanicalFragments','activeMechanicalBursts','hudInstances','staleEncounterOwners','roundAudioVoices',
  'bossControllers','hazardControllers','arcadeControllers','anomalyControllers','bossHudObjects','premiumRevealScenes',
  'roundAudioLoops','roundAudioTones','pooledAudioVoices','sceneEventListeners','gameEventListeners'];
const boundaryRanges=Object.fromEntries(resourceKeys.map(key=>[key,range(report.boundaries.map(b=>b.after[key]))]));
  for(const boundary of report.boundaries) {
  for(const key of ['enemies','bossControllers','bossSupportEnemies','projectiles','activeProjectilePool','activeFxPool',
    'activeTrails','activeMechanicalFragments','activeMechanicalBursts','pickups','deployables','smashableProps',
    'hazardControllers','hazardSlots','arcadeControllers','anomalyControllers','timers','tweens','colliders','colliderCapacity',
    'staticBodies','pendingPhysicsBodies','infusionEffects','bossHudObjects','queuedSpawns','roundAudioLoops','roundAudioVoices',
    'roundAudioTones','hudInstances','premiumRevealScenes','staleEncounterOwners','cleanupFailures'])
    check(boundary.after[key]===0,`Generation ${boundary.generation} retained ${key}`);
  check(boundary.after.dynamicBodies===1,`Generation ${boundary.generation} kept dormant bodies in the physics world`);
  if(boundary.after.renderTextures!==undefined)check(boundary.after.renderTextures===0,`Generation ${boundary.generation} retained cached textures`);
}
for(const key of progression?[]:['projectilePoolCapacity','fxPoolCapacity','trailCapacity']) {
  const earlyCapacity=Math.max(...early.map(s=>s.diagnostic[key]));
  const lateCapacity=Math.max(...late.map(s=>s.diagnostic[key]));
  check(lateCapacity<=earlyCapacity,`${key} grew across equivalent encounter cycles`);
}
const summaries={
  input,passed:failures.length===0,failures,coverage:report.coverage,boundaries:report.boundaries.length,
  durationSeconds:rounded((Date.parse(report.finishedAt)-Date.parse(report.startedAt))/1000),
  quiescent:{count:quiescent.length,resize:range(quiescent.map(s=>s.resizeListeners)),game:range(quiescent.map(s=>s.gameListeners)),
    window:range(quiescent.map(s=>countListeners(s.globals?.window))),document:range(quiescent.map(s=>countListeners(s.globals?.document)))},
  heistLooseLoot:range(report.checkpoints.filter(s=>s.loot).map(s=>s.loot.count)),
  boundaryRanges,earlyPerformance,latePerformance,
  matchedRounds:[54,55,56,57].map(round=>({round,early:performanceFor(early.filter(s=>s.round===round)),late:performanceFor(late.filter(s=>s.round===round))}))
};
if(progression) {
  summaries.interruptions=report.interruptions??[];
  for(const [index,encounter] of report.encounters.entries())check(encounter.round===report.options.startRound+index,'Nonconsecutive progression');
  for(const result of report.gameplayChecks??[])check(result.ok,`Gameplay check: ${result.label}`);
  for(const id of report.options.arcadeIds??[])check(report.coverage[`arcade/${id}`]>0,`Missing Arcade coverage: ${id}`);
  if(report.continuousFrames){
    summaries.continuousFrames={
      phases:Object.entries(report.continuousFrames.buckets).map(([phase,bucket])=>{
        let cumulative=0,p95Ms=0;
        for(const [bin,count] of Object.entries(bucket.histogram).sort((a,b)=>Number(a[0])-Number(b[0]))){
          cumulative+=count;if(cumulative>=bucket.count*.95){p95Ms=Number(bin);break;}
        }
        return {phase,frames:bucket.count,meanMs:rounded(bucket.totalMs/bucket.count),p95Ms,maxMs:rounded(bucket.maxMs)};
      }),
      transitions:report.continuousFrames.transitions.map(t=>({...t,ms:rounded(t.ms)}))
    };
    for(const phase of summaries.continuousFrames.phases.filter(p=>p.frames>=120&&(p.phase.startsWith('arcade/')||p.phase.startsWith('arena/active/')||p.phase==='arena/boss/combat')))
      check(phase.meanMs<=20&&phase.p95Ms<=34,`Continuous gameplay frame budget exceeded: ${phase.phase}`);
  }
  for(const finding of report.resourceFindings??[])check(finding.retainedOffDisplayTexts===0,`${finding.scene} retained ${finding.retainedOffDisplayTexts} off-display texts after ${finding.heistVisits} visits`);
  const warm=report.encounters.filter(e=>e.round>=60&&e.round<=67).map(e=>e.frames.mean).sort((a,b)=>a-b);
  const round68=report.sustained?.find(e=>e.round===68);
  if(warm.length>=4&&round68) {
    const reference=warm[Math.floor(warm.length/2)];
    check(round68.lateFrameMs<=reference*1.3+2,'Sustained round 68 diverged from the warm 60-67 median');
  }
  summaries.rounds=report.encounters.map(e=>({round:e.round,frameMs:rounded(e.frames.mean),p95Ms:rounded(e.frames.p95),updateMs:rounded(e.update.mean)}));
  summaries.sustained=report.sustained;
  summaries.gameplayChecks=report.gameplayChecks?.length??0;
  summaries.phaseCosts=Object.fromEntries(Object.entries(report.probe.phases).map(([phase,costs])=>[phase,
    Object.fromEntries(Object.entries(costs).map(([method,s])=>[method,{calls:s.calls,totalMs:rounded(s.totalMs),meanMs:rounded(s.totalMs/s.calls),maxMs:rounded(s.maxMs),chars:s.bytes}]))]));
  summaries.layouts=report.probe.checkpoints.filter(c=>c.label==='first-window-end').map(c=>({phase:c.phase,...c.layout,cards:c.cards,heapBytes:c.heap,domNodes:c.domNodes,textures:c.textures,diagnostic:c.diagnostic}));
  if(report.options.finishCampaign) {
    check(report.encounters.length===requiredRounds,'Every endgame round must have one combat sample');
    for(const encounter of report.encounters) {
      const expectedMs=report.options.sampleMs+((report.options.sustainedRounds??[]).includes(encounter.round)?report.options.sustainedMs:0);
      check(encounter.frames.n*encounter.frames.mean>=expectedMs*.9,`Round ${encounter.round} lost its active combat sample to a pause`);
    }
    check(report.coverage.diskProgressionVerified===requiredRounds+1,'Every round and the finale must verify disk persistence');
    const reference=report.sustained?.find(e=>e.round===report.options.startRound)?.lateFrameMs;
    check(Number.isFinite(reference),'Missing sustained endgame starting-round reference');
    for(const round of report.options.sustainedRounds??[]) {
      const sample=report.sustained?.find(e=>e.round===round);
      check(Boolean(sample),`Missing sustained milestone ${round}`);
      if(sample)check(sample.lateFrameMs<=reference*1.3+2,`Sustained milestone ${round} regressed against round ${report.options.startRound}`);
    }
    check(Boolean(report.finale?.finishedAt),'Official finale did not finish');
    for(const key of ['terminalBoss','victoryCredits','terminalDebrief','terminalGarageReturn'])check(report.coverage[key]===1,`Missing ending coverage: ${key}`);
    for(const result of report.finale?.checks??[])check(result.ok,`Finale: ${result.label}`);
    const samples=report.finale?.samples??[];
    check(samples.length===6,'Missing sustained final-protocol/boss windows');
    const bosses=samples.filter(s=>s.label.startsWith('three-boss-'));
    check(bosses.length===3&&bosses.every(s=>s.remainingBosses===3),'Three simultaneous bosses were not sampled for 60 seconds');
    if(bosses.length===3)check(bosses[2].frames.mean<=bosses[0].frames.mean*1.3+2,'Sustained three-boss frames degraded');
    summaries.finale=report.finale;
  }
  summaries.passed=failures.length===0;
}
const output=input.replace(/\.json$/,'.summary.json');
await writeFile(output,JSON.stringify(summaries,null,2));
console.log(JSON.stringify(summaries,null,2));
if(failures.length)process.exitCode=1;
