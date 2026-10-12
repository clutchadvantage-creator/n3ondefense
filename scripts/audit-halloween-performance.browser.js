// Run after audit-halloween.browser.js. Isolates celebration cost over its paused Arena.
(() => {
  if(globalThis.__n3onLayoutAudit?.running)throw Error('Another audit is active');
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],samples:[],errors:[]};
  const game=n3onGame,arena=globalThis.__halloweenArena,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  const stats=values=>{const sorted=values.slice().sort((a,b)=>a-b);return {mean:values.reduce((a,b)=>a+b,0)/Math.max(1,values.length),p95:sorted[Math.floor(sorted.length*.95)]??0,max:sorted.at(-1)??0,n:values.length};};
  report.promise=(async()=>{
    try{
      check(!!arena&&game.scene.isPaused('arena'),'prepared paused Arena');
      const vfx=arena.bombExplosionCosmeticVfx,renderer=game.renderer,original=renderer.render;
      const objectCount=()=>{let count=0;const visit=object=>{count++;if(object.type==='Container')object.list.forEach(visit);};arena.children.list.forEach(visit);return count;};
      const initial=objectCount(),x=arena.cameras.main.worldView.centerX,y=arena.cameras.main.worldView.centerY+70;
      for(const effects of [[],['witch-signal'],['neon-bats'],['pumpkin-reactor'],['witch-signal','neon-bats','pumpkin-reactor','witch-signal','neon-bats','pumpkin-reactor']]){
        const label=effects.length>1?'six overlapping signatures':effects[0]??'baseline';report.current=label;
        vfx.reset();for(const effect of effects)vfx.emit(effect,x,y,520,0);vfx.update(0);
        const raw=[],render=[],update=[];let previous;
        renderer.render=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{render.push(performance.now()-start);}};
        const started=performance.now();
        const step=()=>{const now=performance.now();if(previous!==undefined)raw.push(now-previous);previous=now;const start=performance.now();vfx.update(now-started);update.push(performance.now()-start);};
        game.events.on('step',step);
        try{await wait(4300);}finally{game.events.off('step',step);renderer.render=original;}
        check(vfx.activeEffectCount===0,label+': expires');
        check(objectCount()===initial,label+': no display-object growth after warmup');
        report.cases.push({label,raw:stats(raw),render:stats(render),update:stats(update),objects:objectCount()});
      }
      vfx.reset();vfx.emit('neon-bats',x,y,520,0);vfx.update(1400);
    }catch(error){report.errors.push(error.stack??String(error));}
    finally{report.running=false;report.current='complete';}
  })();return 'Halloween performance audit started';
})()
