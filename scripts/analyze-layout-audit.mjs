import {readFile,writeFile} from 'node:fs/promises';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const before=await read(process.argv[2]??'artifacts/layout-before.json');
const after=await read(process.argv[3]??'artifacts/layout-after.json');
const authored=await read('artifacts/layout-before-authored.json');
const baseline=new Map([...before.cases,...authored.cases].map(c=>[c.label,c]));
const failures=[];
const check=(ok,message)=>{if(!ok)failures.push(message);};
const round=v=>Math.round(v*1000)/1000;
const mean=values=>values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
const range=values=>({min:round(Math.min(...values)),max:round(Math.max(...values))});
const comparisons=[];
check(!after.running&&Boolean(after.finishedAt)&&!after.errors.length,'Audit incomplete or browser errors');
check(after.cases.length===baseline.size,'Missing layout/view comparisons');
for(const current of after.cases){
  const previous=baseline.get(current.label);
  check(Boolean(previous),`No baseline: ${current.label}`);if(!previous)continue;
  check(JSON.stringify(previous.layout)===JSON.stringify(current.layout),`Layout changed: ${current.label}`);
  if(current.kind.startsWith('arena')){
    check(current.render.mean<=previous.render.mean*.65+.15,`Static render regression: ${current.label}`);
    check(current.resources.renderTextures.reduce((sum,t)=>sum+t.width*t.height,0)<=2*2400*1600+1048576,
      `Small-art textures exceed 4 MiB RGBA budget: ${current.label}`);
    check(current.retired.objects===0&&current.retired.canvasOwners===0,`Visual owner retained: ${current.label}`);
  }else check(current.render.mean<=previous.render.mean*1.3+.4,`Non-Arena render regression: ${current.label}`);
  check(current.raw.mean<=previous.raw.mean*1.2+1,`Frame interval regression: ${current.label}`);
  comparisons.push({label:current.label,kind:current.kind,template:current.template,
    beforeRenderMs:round(previous.render.mean),afterRenderMs:round(current.render.mean),
    improvementPercent:round((1-current.render.mean/previous.render.mean)*100),
    rawFrameMs:round(current.raw.mean),rawP95Ms:round(current.raw.p95),rawMaxMs:round(current.raw.max),
    setupMs:round(current.setupMs),generationMs:current.generationMs===undefined?undefined:round(current.generationMs),
    texturePixels:current.resources.renderTextures.reduce((sum,t)=>sum+t.width*t.height,0),
    resources:current.resources,retired:current.retired});
}
const arena=comparisons.filter(c=>c.kind==='arena');
const families=[...new Set(comparisons.filter(c=>c.kind.startsWith('arena')).map(c=>c.template))];
check(families.length===12,'Not all 12 Arena visual families covered');
const result={passed:failures.length===0,failures,environment:after.environment,options:after.options,
  startedAt:after.startedAt,finishedAt:after.finishedAt,cases:comparisons.length,families,
  ordinaryArena:{cases:arena.length,beforeRenderMs:round(mean(arena.map(c=>c.beforeRenderMs))),
    afterRenderMs:round(mean(arena.map(c=>c.afterRenderMs))),afterRenderRange:range(arena.map(c=>c.afterRenderMs)),
    rawFrameRange:range(arena.map(c=>c.rawFrameMs)),setupRange:range(arena.map(c=>c.setupMs)),
    generationRange:range(arena.map(c=>c.generationMs)),maxExtraTexturePixels:Math.max(...arena.map(c=>c.texturePixels-2*2400*1600))},
  comparisons};
await writeFile('docs/layout-cost-measurements.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,comparisons:undefined},null,2));
if(failures.length)process.exitCode=1;
