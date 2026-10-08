// Isolated DEV profile. Includes a real Arena -> SkyBreach handoff, then assisted artwork review.
(() => {
  (async()=>{
    globalThis.__skyPreview=true;
    const {default:source}=await import('/scripts/audit-skybreach.browser.js?raw');(0,eval)(source);
    const report=globalThis.__n3onLayoutAudit;await report.promise;delete globalThis.__skyPreview;
    if(report.errors.length)return;report.running=true;report.screenshots=[];
    const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    try {
      const sky=globalThis.__sky,game=globalThis.n3onGame;
      sky.scene.pause();sky.physics.pause();sky.retireFlights();sky.clearThreats();
      const world=sky.world,structures=world.structures,roots=structures.flatMap(s=>[s.image,s.shadow]);
      const objectCount=sky.children.length,textureCount=game.textures.getTextureKeys().length;
      const camera={zoom:sky.cameras.main.zoom,x:sky.cameras.main.scrollX,y:sky.cameras.main.scrollY};
      const bounds=JSON.stringify(sky.physics.world.bounds),body=sky.player.body,radius=body.radius*sky.player.scaleX;
      check(structures.length>=40&&structures.length<=70,'dense, finite skyline on both sides');
      check(structures.every(s=>!s.image.body&&!s.shadow.body),'city artwork adds no collision bodies');
      check(structures.every(s=>s.image.alpha===1),'opaque walls occlude buildings behind them');
      check(!sky.children.list.some(o=>['sky-platform','sky-superstructure','sky-aa-platform'].includes(o.texture?.key)),'flat platform artwork retired');
      const positions=structures.map(s=>s.image.y);world.update(0,sky.pickupBounds.h);
      check(structures.every((s,i)=>s.image.y===positions[i]),'paused city does not move');
      let minimumPerSide=Infinity;
      const started=performance.now();
      for(let frame=0;frame<7200;frame++) {
        world.update(1/60,sky.pickupBounds.h);
        if(frame%120===0)for(const side of [-1,1]) {
          const visible=structures.filter(s=>(s.x<720?-1:1)===side&&s.image.y<sky.pickupBounds.h&&s.baseY>100);
          minimumPerSide=Math.min(minimumPerSide,visible.length);
        }
      }
      report.samples.push({cityUpdateMs:(performance.now()-started)/7200,minimumPerSide});
      check(minimumPerSide>=8,'both city walls remain populated through two minutes of parallax');
      check(sky.children.length===objectCount&&game.textures.getTextureKeys().length===textureCount,'scrolling recycles existing images without new objects or textures');
      check(JSON.stringify(sky.physics.world.bounds)===bounds&&sky.player.body===body&&radius===12,'player collision radius and world collision bounds preserved');
      check(sky.cameras.main.zoom===camera.zoom&&sky.cameras.main.scrollX===camera.x&&sky.cameras.main.scrollY===camera.y,'city scrolling never changes the gameplay camera');
      check(Math.max(...structures.map(s=>s.speed))-Math.min(...structures.map(s=>s.speed))>20,'taller foreground structures have stronger parallax');
      const aa=sky.spawnAircraft('aa',185,430),state=sky.flights.get(aa),aaBody=aa.body;
      check(state.decorations.length===2&&state.decorations[0].texture.key==='sky-city-aa-left','live AA has an extruded tower and a ground shadow');
      aa.body.reset(195,445);sky.updateEnemies(sky.time.now,.016);
      check(state.decorations[0].x===aa.x&&state.decorations[0].y===aa.y&&aa.body===aaBody,'tower roof stays anchored to unchanged AA combat position');
      check(state.decorations[1].y>aa.y+150,'AA shadow remains at the street-level base');
      const decorations=[...state.decorations];sky.damageEnemy(aa,1e9);sky.updateEnemies(sky.time.now,.016);
      check(decorations.every(d=>!d.active)&&!sky.flights.has(aa),'AA defeat retires its tower and shadow');
      const capture=async label=>{
        await wait(100);
        const png=await new Promise(resolve=>game.renderer.snapshot(img=>resolve(img.src)));
        report.screenshots.push({label,png});
      };
      await capture('boss-canyon');
      // Art composition: hide the boss locally to inspect facades, roads and roof attachment.
      for(const enemy of sky.enemies)enemy.setVisible(false);sky.hull?.setVisible(false);
      for(const h of sky.hardpoints){h.wreck.setVisible(false);h.smoke.setVisible(false);h.power.setVisible(false);}
      for(const door of sky.coreDoors)door.setVisible(false);sky.healthBars.clear();
      sky.player.body.reset(720,670);sky.spawnAircraft('aa',185,430);sky.spawnAircraft('aa',1255,320);
      sky.spawnAircraft('interceptor',600,340);sky.spawnAircraft('strike',850,220);sky.spawnAircraft('tank',200,620);
      const {width,height}=game.scale;
      check(sky.cameras.main.zoom===Math.min(width/sky.pickupBounds.w,height/sky.pickupBounds.h),`${width}x${height}: existing camera zoom rule`);
      await capture(`city-${width}x${height}`);
      sky.returnToArena(false,'player-dead');await wait(700);
      check(game.scene.isActive('arena')&&roots.every(root=>!root.active),'return to Arena destroys all city render objects');
      report.cases.push({name:'city canyon geometry, parallax, AA roof anchoring, viewports and teardown'});
    }catch(e){report.errors.push(String(e.stack??e));}finally{report.running=false;}
  })();return {started:true};
})();
