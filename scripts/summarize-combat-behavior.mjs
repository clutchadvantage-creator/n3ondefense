import { readFile, writeFile } from 'node:fs/promises';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const paths={browser:'artifacts/combat-behavior-browser.json',normal:'artifacts/combat-behavior-normal.json',
  normalAnalysis:'artifacts/combat-behavior-normal.summary.json',late:'artifacts/combat-behavior-late.json',
  lateAnalysis:'artifacts/combat-behavior-late.summary.json',reload:'artifacts/combat-behavior-ending-reload.json',
  build:'artifacts/combat-behavior-build.txt',tests:'artifacts/combat-behavior-tests.txt'};
const browser=await read(paths.browser),reload=await read(paths.reload);
const log=async path=>{const bytes=await readFile(path);return bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8');};
const testLog=await log(paths.tests),buildLog=await log(paths.build);
const testCount=Number(testLog.match(/ℹ tests (\d+)/)?.[1]);
if(!testCount||!testLog.includes(`ℹ pass ${testCount}`)||!testLog.includes('ℹ fail 0')
  ||!buildLog.includes('built in')||/error TS\d+/.test(buildLog))throw Error('Passing build and test logs required');
if(browser.running||browser.errors.length||browser.cases.some(c=>!c.ok)||!reload.passed)throw Error('Incomplete focused browser/reload evidence');
const compact=async (runPath,analysisPath)=>{
  const run=await read(runPath),analysis=await read(analysisPath);
  if(run.running||run.errors.length||!analysis.passed)throw Error('Incomplete gameplay evidence: '+runPath);
  const {phaseCosts,layouts,...measurements}=analysis;
  return {options:run.options,startedAt:run.startedAt,finishedAt:run.finishedAt,analysis:measurements};
};
const normal=await compact(paths.normal,paths.normalAnalysis),late=await compact(paths.late,paths.lateAnalysis);
await writeFile('docs/combat-behavior-measurements.json',JSON.stringify({generatedAt:new Date().toISOString(),paths,
  browser:{checks:browser.cases,errors:browser.errors,screenshots:browser.screenshots.map(s=>s.label)},normal,late,reload,
  validation:{testCount,buildPassed:true,testsPassed:true}},null,2)+'\n');
console.log('Saved compact combat behavior measurements');
