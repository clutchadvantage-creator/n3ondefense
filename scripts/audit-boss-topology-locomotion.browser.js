(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],current:'accepted topology gait'};
  report.promise=(async()=>{
    let ArenaGenerator;
    try {
      ({ArenaGenerator}=await import('/src/game/systems/ArenaGenerator.ts'));
      const {ARENA_ARCHETYPES}=await import('/src/game/config/arenaGeneration.ts');
      const {getRoundSiteCount}=await import('/src/game/config/gameplay.ts');
      const {GridPathfinder}=await import('/src/game/systems/GridPathfinder.ts');
      const {BossLegLocomotion,legSegmentClear}=await import('/src/game/bosses/BossLegLocomotion.ts');
      const assert=(v,m)=>{if(!v)throw Error(m)};
      for(const requested of ARENA_ARCHETYPES)for(let seed=1;seed<=1;seed++){
        report.current=`${requested}/${seed}`;
        ArenaGenerator.resetHistory();ArenaGenerator.forceArenaType(requested);
        const round=[1,14,29][ARENA_ARCHETYPES.indexOf(requested)%3],layout=ArenaGenerator.generate(seed,requested,round,getRoundSiteCount(round));
        // Arena's obstacle coordinates are centers; wall rectangles use corners.
        // Match createWalls exactly, including every authored obstacle collider.
        const blockers=[...layout.walls,...layout.obstacles.map(o=>({x:o.x-o.w*.5,y:o.y-o.h*.5,w:o.w,h:o.h}))];
        const pathfinder=new GridPathfinder(2400,1600,24,blockers,36);
        const start=pathfinder.findNearestWalkableWorld(layout.playerSpawn.x,layout.playerSpawn.y);
        assert(start,'no safe starting point');
        const gait=new BossLegLocomotion(6,blockers),streaks=new Uint16Array(6);
        const row={requested,accepted:layout.template,seed,round,frames:0,routes:0,unreachable:0,rejected:0,maxHeldFrames:0,skate:0,footIntersections:0,maxFootStep:0};
        let x=start.x,y=start.y,now=0;
        for(const target of [...layout.bombSites,start]){
          const path=pathfinder.findPath(x,y,target.x,target.y);
          if(!path.length){row.unreachable++;continue;}row.routes++;
          for(const point of path){
            let remaining=Math.hypot(point.x-x,point.y-y);const angle=Math.atan2(point.y-y,point.x-x);
            while(remaining>1){
              const amount=Math.min(148/60,remaining);remaining-=amount;x+=Math.cos(angle)*amount;y+=Math.sin(angle)*amount;now+=1000/60;
              const before=gait.feet.map(f=>({x:f.x,y:f.y,stepping:f.stepping}));
              gait.update(x,y,angle,now,0);
              assert(gait.feet.some(f=>!f.stepping),'no support feet');
              for(let i=0;i<6;i++){
                const f=gait.feet[i];if(!f.valid)row.rejected++;
                streaks[i]=f.valid?0:streaks[i]+1;row.maxHeldFrames=Math.max(row.maxHeldFrames,streaks[i]);
                if(!legSegmentClear(f.x,f.y,f.x,f.y,blockers))row.footIntersections++;
                if(row.frames){const step=Math.hypot(f.x-before[i].x,f.y-before[i].y);row.maxFootStep=Math.max(row.maxFootStep,step);if(!before[i].stepping&&!f.stepping)row.skate=Math.max(row.skate,step);}
              }
              row.frames++;
            }
          }
        }
        report.cases.push(row);
        assert(row.skate===0&&row.footIntersections===0&&row.maxFootStep<=13.334,'foot-contact regression');
        if(seed%5===0)await new Promise(r=>setTimeout(r,10));
      }
      const frames=report.cases.reduce((sum,c)=>sum+c.frames,0),rejected=report.cases.reduce((sum,c)=>sum+c.rejected,0);
      assert(report.cases.every(c=>c.frames>0&&c.unreachable===0),'accepted layout route coverage');
      assert(rejected/(frames*6)<.001,'corner pose rejection exceeds 0.1%');
      assert(report.cases.every(c=>c.maxHeldFrames<=18),'corner pose hold exceeds 300ms');
    }catch(e){report.errors.push(e.stack??String(e));}
    finally{ArenaGenerator?.forceArenaType(null);ArenaGenerator?.resetHistory();report.running=false;}
  })();return 'Accepted procedural layout gait sweep started';
})();