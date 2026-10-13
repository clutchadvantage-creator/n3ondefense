(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,checks:[],cases:[],errors:[]};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  report.promise=(async()=>{try{
    const {ProjectileTrailBatch}=await import('/src/game/performance/ProjectileTrailBatch.ts');
    const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(const scene of game.scene.getScenes(false))if(scene.sys.isActive()||scene.sys.isPaused()||scene.sys.isSleeping())game.scene.stop(scene.scene.key);
    await wait(100);
    const scene=new Phaser.Scene('trail-render-review');game.scene.add('trail-render-review',scene,true);await wait(100);
    scene.cameras.main.setBackgroundColor('#000000');
    const batch=new ProjectileTrailBatch(scene);batch.prewarm(20);
    const reference=scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    scene.add.text(100,40,'REFERENCE VECTOR / BATCHED CIRCLE TEXTURE',{fontSize:'20px',color:'#ffffff'});
    const colors=[0xff8030,0x30ff80,0x8030ff,0xffffff],radii=[1,2,3,2.25];
    // Enlarged samples reveal transform, palette and coverage errors clearly.
    for(let i=0;i<4;i++){
      reference.fillStyle(colors[i],.62);reference.fillCircle(150+i*160,180,24);
      batch.emitAccent(150+i*160,300,colors[i],0);batch.active.at(-1).radius=24;
      reference.fillStyle(colors[i],.31);reference.fillCircle(150+i*160,430,radii[i]*.65);
      batch.emitAccent(150+i*160,480,colors[i],-38);batch.active.at(-1).radius=radii[i];
    }
    batch.render(0);await wait(100);
    const pixel=(x,y)=>new Promise(resolve=>game.renderer.snapshotPixel(x,y,resolve));
    for(let i=0;i<4;i++){
      const old=await pixel(150+i*160,180),current=await pixel(150+i*160,300);
      check(Math.abs(old.red-current.red)<=1&&Math.abs(old.green-current.green)<=1&&Math.abs(old.blue-current.blue)<=1,'exact interior palette and alpha '+colors[i].toString(16));
    }
    const referenceEdge=await pixel(150-26,180),newEdge=await pixel(150-26,300);
    check(referenceEdge.red===0&&newEdge.red===0,'same authored circle diameter');
    // Camera/container transformation follows Phaser's shared matrix path.
    const container=scene.add.container(45,30,[batch.graphics]).setScale(1.25);
    await wait(50);const transformed=await pixel(Math.round(45+150*1.25),Math.round(30+300*1.25));
    check(transformed.red>transformed.green&&transformed.green>transformed.blue,'parent container transform retains location and color');
    container.remove(batch.graphics);container.destroy();batch.graphics.setPosition(0,0);
    batch.beginFrame(1000);batch.render(1000);await wait(40);const expired=await pixel(150,300);check(expired.red===0&&expired.green===0&&expired.blue===0,'expired trail leaves no stale pixels');
    report.cases.push({name:'Actual WebGL texture-batch visual parity',renderer:game.renderer.type});
    if(globalThis.__n3onLayoutAuditOptions?.benchmark){
      // Same six thousand retained dots, palette, lifetime and positions. Only
      // the old vector draw path vs the new texture batching path changes.
      reference.clear();batch.prewarm(6000);
      for(let i=0;i<6000;i++){
        const x=40+i%100*14,y=40+Math.floor(i/100)*12,r=1+i%3,color=colors[i%4];
        reference.fillStyle(color,.62);reference.fillCircle(x,y,r);
        batch.emitAccent(x,y,color,0);batch.active.at(-1).radius=r;
      }
      batch.render(0);
      for(const legacy of [true,false]){
        reference.setVisible(legacy);batch.graphics.setVisible(!legacy);await wait(150);
        const times=[],render=game.renderer.render;
        game.renderer.render=function(...args){const start=performance.now();try{return render.apply(this,args);}finally{times.push(performance.now()-start);}};
        try{await wait(1500);}finally{game.renderer.render=render;}
        const sorted=times.slice().sort((a,b)=>a-b);
        report.cases.push({name:legacy?'6000 trails / previous vector renderer':'6000 trails / texture batch',samples:times.length,
          meanRenderMs:times.reduce((a,b)=>a+b,0)/times.length,p95RenderMs:sorted[Math.floor(sorted.length*.95)],maxRenderMs:sorted.at(-1)});
      }
    }
    batch.destroy();reference.destroy();
    game.scene.stop(scene.scene.key);game.scene.remove(scene.scene.key);
  }catch(e){report.errors.push(e.stack??String(e));}finally{report.running=false;}})();return 'Trail rendering parity audit started';
})()
