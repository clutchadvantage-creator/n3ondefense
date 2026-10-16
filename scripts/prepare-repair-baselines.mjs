// Read-only historical sources for the repair comparison browser fixtures.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const revision=process.argv[2]??'b602e62';
mkdirSync('artifacts',{recursive:true});
for(const [source,output] of [
  ['src/game/systems/ArenaTopology.ts','repair-before-topology.ts'],
  ['src/game/systems/ArenaGenerator.ts','repair-before-generator.ts'],
  ['src/game/anomalies/skybreach/SkyBreachSupplies.ts','repair-before-supplies.ts']
]) {
  let s=execFileSync('git',['show',revision+':'+source],{encoding:'utf8'});
  s=s.replace(/(from\s*['"])(\.[^'"]+)(['"])/g,(_,a,p,b)=>a+path.posix.resolve('/'+path.posix.dirname(source),p)+b);
  if(output==='repair-before-generator.ts')s=s.replace('/src/game/systems/ArenaTopology.ts','/artifacts/repair-before-topology.ts');
  writeFileSync('artifacts/'+output,s);
}
