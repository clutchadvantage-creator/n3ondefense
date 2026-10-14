import {readFile,writeFile} from 'node:fs/promises';
const read=async name=>JSON.parse(await readFile(`artifacts/${name}.json`,'utf8'));
const names=['kinetic-slingshot-before','kinetic-slingshot-after','kinetic-browser','kinetic-floor-browser','kinetic-abilities','kinetic-reduced','kinetic-lava-recovery','kinetic-performance-on','kinetic-performance-off','kinetic-visual'];
const reports=Object.fromEntries(await Promise.all(names.map(async name=>[name,await read(name)])));
for(const [name,r] of Object.entries(reports))if(r.running||r.errors.length||r.checks.some(c=>!c.ok))throw Error('Unverified report: '+name);
const before=reports['kinetic-slingshot-before'],after=reports['kinetic-slingshot-after'];
const comparison=before.samples.map((b,i)=>{
  const a=after.samples[i];
  if(b.name!==a.name||b.multipleArmed!==a.multipleArmed)throw Error('Mismatched baseline cases');
  if(Math.abs(b.maximumEffectiveSpeed-a.maximumEffectiveSpeed)>1e-6||JSON.stringify(b.before)!==JSON.stringify(a.before)||JSON.stringify(b.after)!==JSON.stringify(a.after))throw Error('Launch regression: '+b.name);
  return {name:b.name,multipleArmed:b.multipleArmed,peakBefore:b.maximumEffectiveSpeed,peakAfter:a.maximumEffectiveSpeed,
    displacement850msBefore:b.displacement850ms,displacement850msAfter:a.displacement850ms,
    path1500msBefore:b.pathDistance1500ms,path1500msAfter:a.pathDistance1500ms};
});
const performanceReport=name=>{
  const r=reports[name];return {options:r.options,environment:r.environment,loadout:r.loadout,deployables:r.stagedDeployables,
    cases:r.cases.map(c=>({label:c.label,syntheticForces:c.syntheticForces??false,frames:c.raw,updateCPU:c.update,renderCPU:c.render,
      physicsCPU:c.costs.find(v=>v.name==='physicsWorld'),peakProjectiles:c.peakProjectiles,peakEnemies:c.peakEnemies,kineticBudget:c.kineticBudget}))};
};
const log=async name=>{const bytes=await readFile(`artifacts/${name}.log`);return bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8');};
const tests=await log('kinetic-tests'),build=await log('kinetic-build');
if(!/fail 0/.test(tests)||!/built in/.test(build))throw Error('Tests/build have not passed');
const output={date:'2026-10-13',baselineCommit:'10a2af5',scope:'Arena kinetic contact responses; existing bombsite clock/launch unchanged',
  tests:{count:Number(tests.match(/tests (\d+)/)?.[1]),failed:0,productionBuild:'pass'},
  renderer:after.renderer,
  visualReview:{screenshot:'artifacts/kinetic-impact.png',reviewed:true,notes:'Hardware-rendered boundary contact: cyan pulse, amber directional streaks, equipped operative and cosmetic afterimage; unchanged real footprint.'},
  fixtures:Object.fromEntries(Object.entries(reports).map(([name,r])=>[name,{checks:r.checks.length,passed:r.checks.filter(c=>c.ok).length,errors:r.errors,labels:r.checks.map(c=>c.label)}])),
  slingshot:{fixedHz:60,origin:before.origin,explanation:after.explanation,comparison,before:before.samples,after:after.samples},
  collisionResponses:reports['kinetic-browser'].samples,
  renderedMovement:reports['kinetic-abilities'].samples,
  performance:{enabled:performanceReport('kinetic-performance-on'),disabledControl:performanceReport('kinetic-performance-off')},
  limitations:['Hardware samples are RTX 5070 / Edge ANGLE at 1600x1000, not low-end hardware.',
    'Enabled and disabled live combat are separate runs, not identical event replays; disabled control retains runtime scaffolding.',
    'Synthetic bursts intentionally apply forces to up to 24 existing enemies; native enemy pressure caps are unchanged.',
    'Human movement feel can still require tuning. Dedicated impact audio awaits an asset.',
    'Extra contact queries and sweep iterations are bounded; exhausted displacement waits until the next step without a new velocity cap.']};
// Keep exact trajectory numbers while making numeric vectors readable on one line.
const serialized=JSON.stringify(output,null,2).replace(/\[\n\s+(-?\d[\d.eE+,\s-]*)\n\s*\]/g,(_,values)=>'['+values.replace(/\s+/g,' ').trim()+']');
await writeFile('docs/kinetic-rebound-validation.json',serialized+'\n');
console.log(JSON.stringify({tests:output.tests,checks:Object.values(output.fixtures).reduce((n,r)=>n+r.passed,0),scenarios:comparison.length}));
