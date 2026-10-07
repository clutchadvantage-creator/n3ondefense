import {readFile,writeFile} from 'node:fs/promises';
import {arenaBossBenchmark} from '../src/game/config/ArenaCombatScaling.ts';
const cases=[['normal',6],['normal',8],['normal',11],['normal',14],['overdrive',8],['overdrive',14],['supreme',24],['supreme',29]];
const benchmarks=cases.map(([mode,entryRound])=>{
  const benchmark=arenaBossBenchmark(mode,entryRound);
  return {mode,entryRound,benchmarkRound:benchmark.round,benchmarkProtocol:benchmark.protocol,
    difficultyPosition:benchmark.difficultyPosition,arenaBossHealth:benchmark.health,hardpointHealth:benchmark.health,coreHealth:benchmark.health*2};
});
const inputs=['sky-parity-integration','sky-polish-supreme-combat','sky-polish-retirement'];
const reports=[];
for(const name of inputs){
  const report=JSON.parse(await readFile(`artifacts/${name}.json`,'utf8'));
  if(report.running||report.errors.length||report.checks.some(c=>!c.ok))throw Error(`Incomplete or failed ${name}`);
  reports.push({fixture:name,checks:report.checks.length,assertions:report.checks.map(c=>c.label),
    samples:report.samples,texturePixels:report.texturePixels});
}
const log=async path=>{const data=await readFile(path);return data.toString(data[0]===0xff&&data[1]===0xfe?'utf16le':'utf8');};
const tests=await log('artifacts/sky-parity-tests.log');
const build=await log('artifacts/sky-parity-build.log');
if(!/fail 0/.test(tests)||!/built in/.test(build))throw Error('Successful test/build logs required');
const result={scope:'SkyBreach difficulty parity and combat polish',date:'2026-10-05',
  tests:Number(tests.match(/tests (\d+)/)?.[1]),productionBuildPassed:true,
  browserChecks:reports.reduce((n,r)=>n+r.checks,0),benchmarks,reports,
  limits:['Assisted, isolated DEV profiles; not unassisted clears.',
    'Performance samples are 3–6 seconds on this machine; no low-end GPU or full-run soak claim.',
    'Hardpoints/core are accelerated through real damage handlers for lifecycle checks.']};
await writeFile('docs/skybreach-polish-validation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({tests:result.tests,browserChecks:result.browserChecks,benchmarks},null,2));
