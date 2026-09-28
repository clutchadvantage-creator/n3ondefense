import {readFile,writeFile} from 'node:fs/promises';
const raw=JSON.parse(await readFile('artifacts/skybreach-runtime-final.json','utf8'));
if(raw.running||raw.errors.length||raw.checks.some(c=>!c.ok))throw Error('SkyBreach integration fixture has not passed');
const result={
  recordedAt:raw.finishedAt,
  fixture:'scripts/audit-skybreach.browser.js',
  browserChecks:raw.checks.length,
  passed:raw.checks.every(c=>c.ok),
  controls:['isolated DEV profile','invulnerability','supplied energy','simulated controller','accelerated module boundaries',
    'accelerated boss damage','allied fire isolated for independent hardpoint checks','45/sec requested cadence constrained by existing 22/sec maximum'],
  limitations:['short assisted samples, not unassisted full-length clears','no physical controller or audible-output verification',
    'frame intervals from performance.now at game steps; not GPU timer queries','not an exhaustive loadout or slower-device performance claim'],
  modes:raw.samples,
  checks:raw.checks,
  errors:raw.errors
};
await writeFile('docs/skybreach-validation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({checks:result.browserChecks,passed:result.passed,samples:raw.samples.map(({mode,frames,mean,p95})=>({mode,frames,mean,p95}))},null,2));
