(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],samples:[],checks:[]};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  report.promise=(async()=>{
    try {
      const {ArenaGenerator:After}=await import('/src/game/systems/ArenaGenerator.ts');
      const {ArenaGenerator:Before}=await import('/artifacts/repair-before-generator.ts');
      const {ArenaValidator}=await import('/src/game/systems/ArenaValidator.ts');
      const {ARENA_ARCHETYPES}=await import('/src/game/config/arenaGeneration.ts');
      const {getRoundSiteCount}=await import('/src/game/config/gameplay.ts');
      const stats=a=>{a.sort((a,b)=>a-b);return{mean:a.reduce((s,x)=>s+x,0)/a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1)}};
      const original=console.info;console.info=()=>{};const saved=[];
      try {
        for(const type of ARENA_ARCHETYPES) {
          const rows=[];
          for(const [label,G] of [['before',Before],['after',After]]) {
            const times=[],layouts=[];
            for(let seed=1;seed<=20;seed++) {
              G.resetHistory();G.forceArenaType(type);const start=performance.now();
              const l=G.generate(seed*7919,type,seed%2?9:26,getRoundSiteCount(seed%2?9:26));times.push(performance.now()-start);
              const valid=ArenaValidator.validateDetailed(l,2400,1600);
              if(!valid.valid)throw Error(type+'/'+seed+' inaccessible');
              layouts.push({seed,actual:l.template,walls:l.walls.length,obstacles:l.obstacles.length,fallback:!!l.generation.fallbackUsed,
                smallSegments:l.walls.filter(w=>Math.max(w.w,w.h)<100).length,hash:l.generation.fingerprintHash});
              if(label==='after'&&!saved.some(s=>s.template===type)&&l.template===type)saved.push(l);
              if(seed%5===0)await wait(0);
            }
            rows.push({label,generationMs:stats(times),layouts});
          }
          report.cases.push({type,rows});
        }
        After.resetHistory();After.forceArenaType(null);const sequence=[],timings=[];
        for(let i=0;i<300;i++) {
          const start=performance.now(),l=After.generate(550055+i*3571,ARENA_ARCHETYPES[i%12],i%30+1,getRoundSiteCount(i%30+1));timings.push(performance.now()-start);
          if(sequence.at(-1)?.hash===l.generation.fingerprintHash)throw Error('consecutive exact layout');
          sequence.push({type:l.template,hash:l.generation.fingerprintHash,fallback:!!l.generation.fallbackUsed});
          if(i%10===0)await wait(0);
        }
        report.samples.push({name:'300-round sequential variety',timings:stats(timings),sequence});
      } finally {console.info=original;After.resetHistory();After.forceArenaType(null);Before.resetHistory();Before.forceArenaType(null);}
      const game=globalThis.n3onGame;for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);await wait(100);
      const scene=new Phaser.Scene({key:'repair-atlas'});game.scene.add('repair-atlas',scene,true);await wait(100);
      globalThis.__repairArenaLayouts=saved;globalThis.__repairAtlasScene=scene;
      const W=game.scale.width/4,H=game.scale.height/3;
      for(let i=0;i<saved.length;i++) {
        const l=saved[i],x=i%4*W,y=Math.floor(i/4)*H,scale=Math.min((W-20)/2400,(H-40)/1600);
        scene.add.text(x+10,y+5,l.template,{fontSize:'16px',color:'#b9ffff'});
        const g=scene.add.graphics().setPosition(x+8,y+32).setScale(scale);
        g.fillStyle(0x061823).fillRect(0,0,2400,1600);
        g.fillStyle(0x3adceb);for(const w of l.walls)g.fillRect(w.x,w.y,w.w,w.h);
        g.fillStyle(0xaf70ef);for(const o of l.obstacles)g.fillRect(o.x-o.w/2,o.y-o.h/2,o.w,o.h);
        g.fillStyle(0xffc95a);for(const p of l.bombSites)g.fillCircle(p.x,p.y,32);
        g.fillStyle(0x6bff9a).fillCircle(l.playerSpawn.x,l.playerSpawn.y,35);
      }
      report.checks.push({ok:true,label:'480 actual generated layouts validated; 300 sequential layouts preserve recent-history rejection'});
    }catch(e){report.errors.push(String(e.stack??e));}finally{report.running=false;}
  })();return{started:true};
})();
