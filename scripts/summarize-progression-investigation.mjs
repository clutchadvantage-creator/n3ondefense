import { readFile, writeFile } from 'node:fs/promises';

const names=process.argv.slice(2);
const summary={runs:[],cpuProfiles:[]};
const rounded=value=>Math.round(value*1000)/1000;
for(const name of names) {
  const report=JSON.parse(await readFile(`artifacts/progression-${name}.json`,'utf8'));
  const analysis=JSON.parse(await readFile(`artifacts/progression-${name}.summary.json`,'utf8'));
  summary.runs.push({name,options:report.options,startedAt:report.startedAt,finishedAt:report.finishedAt,
    passed:analysis.passed,failures:analysis.failures,interruptions:report.interruptions??[],coverage:report.coverage,durationSeconds:analysis.durationSeconds,
    quiescent:analysis.quiescent,boundaries:analysis.boundaries,boundaryRanges:analysis.boundaryRanges,
    rounds:analysis.rounds,sustained:report.sustained,gameplayChecks:report.gameplayChecks,
    heistSamples:report.checkpoints.filter(c=>c.label==='heist-physical-loot'||c.label==='heist-enemies-retired').map(c=>({
      index:c.round,label:c.label,profiler:c.heist?.profiler,resources:c.heist?.heist,loot:c.loot})),
    layouts:report.probe.checkpoints.filter(c=>c.label==='first-window-end').map(c=>({phase:c.phase,...c.layout,
      cards:c.cards,heapBytes:c.heap,domNodes:c.domNodes,textures:c.textures,diagnostic:c.diagnostic})),
    boundaryCosts:Object.fromEntries(Object.entries(analysis.phaseCosts).filter(([phase])=>/round-(66|67|68|69)\//.test(phase))),
    network:report.probe.network,longTaskCount:report.probe.longTasks.length,
    maximumLongTaskMs:Math.max(0,...report.probe.longTasks.map(t=>t.ms))});
}
for(const when of ['before','after'])for(const round of [67,68]) {
  const profile=JSON.parse(await readFile(`artifacts/round-${round}-${when}-cpu.json`,'utf8'));
  const nodes=new Map(profile.nodes.map(n=>[n.id,n]));
  const durations=new Map();
  for(let i=0;i<profile.samples.length;i++) {
    const name=nodes.get(profile.samples[i]).callFrame.functionName||'(anonymous)';
    durations.set(name,(durations.get(name)??0)+(profile.timeDeltas[i]??0));
  }
  summary.cpuProfiles.push({when,round,durationMs:rounded((profile.endTime-profile.startTime)/1000),
    topSelfMs:[...durations].sort((a,b)=>b[1]-a[1]).slice(0,16).map(([name,us])=>({name,ms:rounded(us/1000)}))});
}
await writeFile('docs/round-68-measurements.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary.runs.map(r=>({name:r.name,passed:r.passed,seconds:r.durationSeconds,
  coverage:r.coverage,rounds:r.rounds,sustained:r.sustained})),null,2));
