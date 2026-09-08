import {readFile,writeFile} from 'node:fs/promises';

const status=process.argv.includes('--status');
const name=process.argv.slice(2).find(value=>!value.startsWith('--'))??'endgame';
const path=`artifacts/progression-${name}${status?'.partial':''}.json`;
const report=JSON.parse(await readFile(path,'utf8'));
const round=value=>Math.round(value*1000)/1000;
const range=values=>({min:round(Math.min(...values)),max:round(Math.max(...values))});
const dirty=report.boundaries.flatMap(boundary=>['staleEncounterOwners','cleanupFailures','renderTextures']
  .filter(key=>boundary.after[key]!==0).map(key=>({generation:boundary.generation,key,value:boundary.after[key]})));
const brief={completed:report.encounters.at(-1)?.round,rounds:report.encounters.length,
  errors:report.errors,checks:report.gameplayChecks.length,boundaries:report.boundaries.length,
  frames:range(report.encounters.map(e=>e.frames.mean)),updates:range(report.encounters.map(e=>e.update.mean)),
  recent:report.encounters.slice(-4).map(e=>({round:e.round,frameMs:round(e.frames.mean),updateMs:round(e.update.mean)})),
  presentation:report.probe.checkpoints.filter(c=>c.label==='first-window-end').filter((c,i,all)=>i===0||i===all.length-1)
    .map(c=>({phase:c.phase,textures:c.textures,domNodes:c.domNodes,heapMB:round(c.heap/1048576),cards:c.cards})),
  sustained:report.sustained,dirty,coverage:report.coverage};
console.log(JSON.stringify(brief,null,2));
if(!status) {
  const analysis=JSON.parse(await readFile(`artifacts/progression-${name}.summary.json`,'utf8'));
  const result={options:report.options,startedAt:report.startedAt,finishedAt:report.finishedAt,
    passed:analysis.passed,failures:analysis.failures,durationSeconds:analysis.durationSeconds,
    interruptions:report.interruptions??[],resourceFindings:report.resourceFindings??[],...brief,rounds:analysis.rounds,
    quiescent:analysis.quiescent,boundaryRanges:analysis.boundaryRanges,
    earlyPerformance:analysis.earlyPerformance,latePerformance:analysis.latePerformance,
    milestones:report.gameplayChecks.filter(c=>c.label.includes('unlock boundary')),
    layouts:analysis.layouts,phaseCosts:analysis.phaseCosts,finale:report.finale,
    longTasks:report.probe.longTasks,network:report.probe.network};
  await writeFile(`docs/${name}-measurements.json`,JSON.stringify(result,null,2)+'\n');
  if(!analysis.passed)process.exitCode=1;
}
