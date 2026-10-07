// Bounded CPU cost of the added systems using real Arena entities; not an FPS benchmark.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],samples:[],errors:[]};
  const {a,Fence,anchor}=globalThis.__infusionFixture;
  const created=[];
  try{
    for(let i=0;i<120;i++){
      const enemy=a.spawnEnemy('grunt',false,{x:anchor.x+(i%12)*36,y:anchor.y+Math.floor(i/12)*38});
      if(enemy)created.push(enemy);
    }
    const sample=()=>{
      const measurements=[];
      for(let i=0;i<300;i++){
        const start=performance.now();a.updateSystemInfusions(a.time.now,.016);a.updateFenceObstruction(a.time.now);
        measurements.push(performance.now()-start);
      }
      measurements.sort((a,b)=>a-b);
      return {meanMs:measurements.reduce((a,b)=>a+b,0)/measurements.length,p95Ms:measurements[Math.floor(measurements.length*.95)]};
    };
    a.updateFenceObstruction(a.time.now);const baseline=sample();
    for(let i=0;i<8;i++)a.fences.push(new Fence(a,anchor.x+70+(i%4)*100,anchor.y+50+Math.floor(i/4)*150,Math.PI/2,0x70ffdf,90,60000,500,25,.6));
    a.updateSystemInfusions(a.time.now,.016);a.updateFenceObstruction(a.time.now);
    const revision=a.fenceObstruction.revision,linked=sample();
    const cached=a.fenceObstruction.revision===revision;
    report.checks.push({ok:cached,label:'300 updates reuse unchanged obstruction mask'});
    if(!cached)throw Error('Fence mask rebuilt without topology changes');
    report.samples.push({enemies:created.length,baseFences:a.fences.length,generatedLinks:a.systemInfusions.generatedLinks.length,baseline,linked});
    report.cases.push({name:'bounded Infusion update cost'});
  }catch(error){report.errors.push(String(error.stack??error));}
  finally{
    for(const enemy of created){a.destroyEnemyColliders(enemy);enemy.destroy();}
    a.enemies=a.enemies.filter(e=>!created.includes(e));a.clearRoundInfusionEffects();
    a.fences.forEach(f=>f.destroy());a.fences=[];report.running=false;
  }
  return {started:true};
})();
