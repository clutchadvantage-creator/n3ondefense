import { readFile, writeFile } from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const readLog = async path => { const b=await readFile(path);return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,''); };
const report = { generatedAt:new Date().toISOString() };
for(const [key,file] of Object.entries({interactions:'combat-polish-browser',artAndLifetime:'combat-polish-art-lifetime',destructionArt:'combat-polish-vfx-art',checkpoints:'combat-polish-checkpoints'})){
  const raw=await read(`artifacts/${file}.json`),checks=raw.cases.filter(c=>typeof c.ok==='boolean');
  if(raw.running||raw.errors.length||checks.some(c=>!c.ok))throw new Error(`${file} failed`);
  report[key]={path:`artifacts/${file}.json`,passed:true,checkCount:checks.length,checks,frames:raw.frames,options:raw.options,screenshots:raw.screenshots?.map(s=>s.label)};
}
const raw=await read('artifacts/combat-polish-mixed-late.json'),summary=await read('artifacts/combat-polish-mixed-late.summary.json');
if(!summary.passed||raw.running||raw.errors.length)throw new Error('Late progression failed');
report.late={options:raw.options,passed:summary.passed,failures:summary.failures,durationSeconds:summary.durationSeconds,startedAt:raw.startedAt,finishedAt:raw.finishedAt,
  gameplayChecks:summary.gameplayChecks,coverage:summary.coverage,boundaries:summary.boundaries,quiescent:summary.quiescent,boundaryRanges:summary.boundaryRanges,
  earlyPerformance:summary.earlyPerformance,latePerformance:summary.latePerformance,rounds:summary.rounds,sustained:summary.sustained,continuousFrames:summary.continuousFrames,
  finale:{checks:raw.finale.checks,samples:raw.finale.samples.map(({diagnostic,...sample})=>sample),completed:raw.finale.afterProgress.supremeOverdriveCompleted,highestRound:raw.finale.afterProgress.supremeHighestRound}};
report.reload=await read('artifacts/combat-polish-save-reload.json');
if(!report.reload.reloaded||!report.reload.completed||report.reload.highest!==148)throw new Error('Ending reload failed');
report.recordingAnalysis=JSON.parse(await readLog('artifacts/combat-polish-audio-analysis.txt')).result.result.value;
report.decodedAudio=JSON.parse(await readLog('artifacts/combat-polish-buffer.json.txt')).result.result.value;
const tests=await readLog('artifacts/combat-polish-tests.txt'),build=await readLog('artifacts/combat-polish-build.txt');
if(!/^# pass 674$/m.test(tests)||!/^# fail 0$/m.test(tests)||!build.includes('built in'))throw new Error('Build/test evidence missing');
report.automated={tests:674,passed:674,failed:0,build:'passed'};
report.focusedBrowserChecks=report.interactions.checkCount+report.artAndLifetime.checkCount+report.destructionArt.checkCount+report.checkpoints.checkCount;
await writeFile('docs/combat-polish-measurements.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({focusedBrowserChecks:report.focusedBrowserChecks,gameplayChecks:report.late.gameplayChecks,finaleChecks:report.late.finale.checks.length,retirements:report.late.boundaries,reload:report.reload.completed},null,2));
