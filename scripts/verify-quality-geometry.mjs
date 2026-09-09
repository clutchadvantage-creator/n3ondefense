import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateHeistFacilityLayout } from '../src/game/anomalies/heist/HeistFacilityLayout.ts';
const source=await readFile('artifacts/quality-baseline/src/game/anomalies/heist/HeistFacilityLayout.ts','utf8');
const prepared=source.replace(/from '(\.[^']+)'/g,(_,path)=>`from '${pathToFileURL(resolve('src/game/anomalies/heist',path)).href}'`);
await writeFile('artifacts/quality-baseline/HeistFacilityLayout.node.ts',prepared);
const {generateHeistFacilityLayout:before}=await import('../artifacts/quality-baseline/HeistFacilityLayout.node.ts');
const rows=[];
for(let seed=1;seed<=100;seed++) {
  const old=before(seed),current=generateHeistFacilityLayout(seed);
  const fields=['seed','world','nodes','edges','wallRects','vaultDoors','entryPoint','extractionPoint','entryNodeId','extractionNodeId','vaultRect'];
  const changed=fields.filter(key=>JSON.stringify(old[key])!==JSON.stringify(current[key]));
  const trapCounts=l=>Object.fromEntries(['spike','snag','fire'].map(type=>[type,l.trapPlacements.filter(t=>t.type===type).length]));
  rows.push({seed,acceptedSeed:current.seed,changed,beforeTraps:trapCounts(old),traps:trapCounts(current)});
}
const report={passed:rows.every(r=>!r.changed.length&&JSON.stringify(r.beforeTraps)===JSON.stringify(r.traps)),cases:rows};
await writeFile('artifacts/quality-heist-geometry.json',JSON.stringify(report,null,2)+'\n');
console.log({passed:report.passed,cases:rows.length,changed:rows.filter(r=>r.changed.length)});
if(!report.passed)process.exitCode=1;
