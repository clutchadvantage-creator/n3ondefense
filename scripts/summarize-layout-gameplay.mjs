import {readFile,writeFile} from 'node:fs/promises';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const results={};
for(const name of ['normal','late']){
  const raw=await read(`artifacts/layout-mixed-${name}.json`);
  const summary=await read(`artifacts/layout-mixed-${name}.summary.json`);
  if(!summary.passed||raw.running||raw.excludedReason)throw new Error(`Incomplete or failed ${name} validation`);
  results[name]={options:raw.options,startedAt:raw.startedAt,finishedAt:raw.finishedAt,passed:summary.passed,
    failures:summary.failures,durationSeconds:summary.durationSeconds,gameplayChecks:summary.gameplayChecks,
    boundaries:summary.boundaries,coverage:summary.coverage,quiescent:summary.quiescent,
    earlyPerformance:summary.earlyPerformance,latePerformance:summary.latePerformance,
    rounds:summary.rounds,sustained:summary.sustained,continuousFrames:summary.continuousFrames,
    layouts:summary.layouts.map(({diagnostic,...layout})=>layout),
    finale:raw.finale?{checks:raw.finale.checks,samples:raw.finale.samples.map(({diagnostic,...sample})=>sample),
      highestRound:raw.finale.afterProgress.supremeHighestRound,completed:raw.finale.afterProgress.supremeOverdriveCompleted,
      debriefActions:raw.finale.debriefActions}:undefined};
}
const saveReloadVerification=await read('artifacts/layout-save-reload.json');
if(!saveReloadVerification.reloaded||saveReloadVerification.highest!==148||!saveReloadVerification.completed)
  throw new Error('Missing completion verification after reload');
await writeFile('docs/layout-gameplay-measurements.json',JSON.stringify({...results,saveReloadVerification},null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([name,r])=>[name,{
  passed:r.passed,rounds:r.rounds.length,gameplayChecks:r.gameplayChecks,boundaries:r.boundaries,durationSeconds:r.durationSeconds,
  finaleChecks:r.finale?.checks.length}])),null,2));
