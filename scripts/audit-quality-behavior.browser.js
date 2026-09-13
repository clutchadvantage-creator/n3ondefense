(() => {
  const game = n3onGame, wait = ms => new Promise(r => setTimeout(r, ms));
  const report = globalThis.__n3onLayoutAudit = { running: true, cases: [], errors: [], startedAt: new Date().toISOString() };
  const check = (ok, label, detail) => { report.cases.push({ ok: !!ok, label, detail }); if (!ok) throw new Error(label); };
  report.promise = (async () => {
    let scene, facility, traps, sites;
    try {
      const { createHeistFacility } = await import('/src/game/anomalies/heist/HeistFacility.ts');
      const { createHeistRoomPlan } = await import('/src/game/anomalies/heist/HeistRoomPlan.ts');
      const { HeistTrapSystem } = await import('/src/game/anomalies/heist/HeistTrapSystem.ts');
      const { Enemy, baseEnemyStats } = await import('/src/game/enemies/Enemy.ts');
      const { ENEMY_ROBOT_FRAMES } = await import('/src/game/enemies/EnemyRobotFrames.ts');
      const { BombSiteManager } = await import('/src/game/systems/BombSiteManager.ts');
      for (const s of game.scene.getScenes(false)) {
        if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
      }
      await wait(100);
      scene = new Phaser.Scene({ key: 'quality-behavior' }); game.scene.add('quality-behavior', scene, true); await wait(100);
      scene.cameras.main.setBackgroundColor('#02050b');
      const capture = async label => {
        await wait(100); const png = await new Promise(r => game.renderer.snapshot(img => r(img.src)));
        report.cases.push({ label, png });
      };
      facility = createHeistFacility(scene, 550055);
      const caps = scene.children.list.filter(o => /^heist-runtime-wall-[hv]-/.test(o.texture?.key));
      check(caps.length > facility.wallRects.length && caps.every(o => o.type === 'Image' && o.isCropped),
        'wall caps repeat shared images without private tile textures', { panels: caps.length, walls: facility.wallRects.length });
      const capArea = caps.reduce((sum,o) => sum + o._crop.width * o._crop.height, 0);
      const wallArea = facility.wallRects.reduce((sum,r) => sum + r.w * r.h, 0);
      check(capArea === wallArea && caps.every(o => facility.wallRects.some(r =>
        o.x >= r.x-14 && o.y >= r.y-58 && o.x+o._crop.width <= r.x-14+r.w && o.y+o._crop.height <= r.y-58+r.h)),
        'cropped wall panels cover the projected wall area without overhang', { capArea, wallArea });
      let now = 0;
      for (const role of ['coolant','relay','security','freight','service']) {
        const room = createHeistRoomPlan(facility.layout).find(r => r.role.id === role);
        scene.cameras.main.setZoom(.9).centerOn(room.x,room.y);
        for(let i=0;i<30;i++) facility.update(now+=100,room.x,room.y);
        await capture(`room-${role}`);
      }
      for (const type of ['spike','snag','fire']) {
        const placement = facility.trapPlacements.find(t => t.type === type);
        const x = placement.x + (type === 'fire' ? Math.cos(placement.rotation)*140 : 0);
        const y = placement.y + (type === 'fire' ? Math.sin(placement.rotation)*140 : 0);
        scene.cameras.main.setZoom(.9).centerOn(x,y);
        for(let i=0;i<30;i++) facility.update(now+=100,x,y);
        let damage=0, snare=0;
        traps = new HeistTrapSystem(scene,[placement],{round:68,protocol:'normal'},
          {damagePlayer:n=>damage+=n,snarePlayer:n=>snare=n,playSfx(){}},true);
        traps.update(0,-1000,-1000,1);
        const runtime = type === 'fire' ? traps.fireSystem.nozzles[0] : traps.traps[0];
        // The test uses a synthetic clock; nozzles normally start from scene.time.now.
        runtime.nextReadyAt=0;
        if(type === 'spike') check(runtime.dynamic.commandBuffer.length <= 2,'idle spikes have no exposed blade paths',runtime.dynamic.commandBuffer.length);
        const jawCenters=()=>[runtime.leftJaw,runtime.rightJaw].map(j=>{
          const xs=j.geom.points.map(p=>p.x),ys=j.geom.points.map(p=>p.y);
          return j.getLocalTransformMatrix().transformPoint((Math.min(...xs)+Math.max(...xs))/2-j.displayOriginX,
            (Math.min(...ys)+Math.max(...ys))/2-j.displayOriginY);
        });
        if(type==='snag') {
          const [left,right]=jawCenters();
          check(Math.abs(left.x+right.x)<1&&Math.abs(left.y)+Math.abs(right.y)<1,'idle catch jaws align symmetrically with the plate',{left,right});
        }
        await capture(`${type}-idle`);
        traps.update(10000,x,y,1);
        check(runtime.state === 'telegraph' && damage === 0 && snare === 0,`${type} begins with a harmless warning`);
        const warning = type === 'spike' ? 620 : type === 'snag' ? 320 : 980;
        traps.update(10000+warning-50,x,y,1);
        check(runtime.state === 'telegraph' && damage === 0 && snare === 0,`${type} retains its full warning window`);
        await capture(`${type}-warning`);
        traps.update(10000+warning,x,y,1);
        if(type==='fire') traps.update(10000+warning+140,x,y,1);
        check(runtime.state === 'active',`${type} becomes active on schedule`);
        if(type==='spike') check(damage === 11,'spikes retain 11 damage');
        if(type==='snag') check(snare===11320 && traps.isMovementSnared(11319) && !traps.isMovementSnared(11320),'catch trap retains one-second restraint');
        if(type==='snag') {
          const [left,right]=jawCenters();
          check(Math.abs(left.x+right.x)<1&&Math.abs(left.y-right.y)<1&&Math.abs(left.y)<3,'active catch jaws close around the trap center',{left,right});
        }
        if(type==='fire') {traps.update(11200,x,y,1);check(damage>0,'wall flame damages within its lane');}
        await capture(`${type}-active`);
        const damageBefore=damage;
        traps.update(11400,x,y,1);
        if(type==='spike') check(damage===damageBefore,'spikes apply damage once per activation');
        traps.update(14000,-1000,-1000,1);
        check(runtime.state==='cooldown',`${type} retires active effects into cooldown`);
        traps.destroy();traps=null;
      }
      facility.destroy();facility=null;
      scene.cameras.main.setZoom(1).setScroll(0,0);
      const enemyRows=[];
      for (const [type,stats] of Object.entries(baseEnemyStats)) {
        const enemy=new Enemy(scene,300,300,ENEMY_ROBOT_FRAMES[type].textureKey,stats);
        enemy.body.moves=false;
        const body=enemy.body, geometry=()=>JSON.stringify([body.width,body.height,body.offset.x,body.offset.y,enemy.displayWidth,enemy.displayHeight]);
        const before=geometry(),frames=new Set();
        const originalDeltaX=body.deltaX,originalDeltaY=body.deltaY;
        body.deltaX=()=>6;body.deltaY=()=>0;
        for(let i=1;i<=8;i++){enemy.updateMechanicalPresentation(i*20);frames.add(enemy.frame.name);check(geometry()===before,`${type} frame ${i} preserves body and display dimensions`);}
        check(frames.size===4,`${type} traverses all four mechanical frames`);
        body.deltaX=()=>0;body.deltaY=()=>0;
        const stopped=enemy.frame.name;
        for(let i=1;i<=8;i++)enemy.updateMechanicalPresentation(1000+i*220);
        if(type==='tank') check(enemy.frame.name===stopped,'stationary tank tracks stop');
        const framePixels=[];
        for(let frame=0;frame<4;frame++) {
          const texture=enemy.texture, f=texture.get(frame);
          const canvas=document.createElement('canvas');canvas.width=72;canvas.height=72;
          canvas.getContext('2d').drawImage(texture.getSourceImage(),f.cutX,f.cutY,72,72,0,0,72,72);
          framePixels.push(canvas.toDataURL());
        }
        check(new Set(framePixels).size===4,`${type} atlas contains four distinct drawings`);
        enemyRows.push({type,frames:[...frames],geometry:JSON.parse(before)});
        body.deltaX=originalDeltaX;body.deltaY=originalDeltaY;enemy.destroy();
      }
      report.enemies=enemyRows;
      // Alternate explicit encounter retirement and ordinary scene shutdown.
      let texturePlateau;
      for(let cycle=0;cycle<6;cycle++) {
        if(!scene.sys.isActive()){game.scene.start(scene.scene.key);await wait(100);}
        facility=createHeistFacility(scene,550055+cycle);
        traps=new HeistTrapSystem(scene,facility.trapPlacements,{round:148,protocol:'supreme'},{damagePlayer(){},snarePlayer(){},playSfx(){}});
        sites=new BombSiteManager('open',3);
        sites.initialize(scene,[new Phaser.Math.Vector2(1000,800),new Phaser.Math.Vector2(1400,800)],{primary:0x45efff,secondary:0xff4fcf});
        await wait(100);
        const handles=new Set(),texturePixels={RenderTexture:0,TileSprite:0};
        const visit=o=>{
          const wrapper=o.type==='RenderTexture'?o.texture.getWebGLTexture():o.type==='TileSprite'?o.fillPattern:null;
          if(wrapper?.webGLTexture){handles.add(wrapper.webGLTexture);texturePixels[o.type]+=wrapper.width*wrapper.height;}
          if(o.type==='Container')o.list.forEach(visit);
        };scene.children.list.forEach(visit);
        const live=[...handles].filter(h=>game.renderer.gl.isTexture(h));
        check(live.length>200,`cycle ${cycle} private resources are live`,live.length);
        if(cycle%2)game.scene.stop(scene.scene.key);else {traps.destroy();sites.destroy();facility.destroy();}
        traps=null;sites=null;facility=null;await wait(100);
        const retained=live.filter(h=>game.renderer.gl.isTexture(h)).length;
        const owners=Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e.parent?.scene===scene).length;
        const textures=Object.keys(game.textures.list).length;
        texturePlateau??=textures;
        check(!retained&&!owners&&!scene.children.length&&textures===texturePlateau,`cycle ${cycle} releases private textures, canvases and roots`,{retained,owners,roots:scene.children.length,textures,texturePixels,privateTextures:live.length,mode:cycle%2?'shutdown':'destroy'});
      }
    } catch(e){report.errors.push(String(e.stack??e));}
    finally{traps?.destroy();sites?.destroy();facility?.destroy();if(scene){game.scene.stop(scene.scene.key);game.scene.remove(scene.scene.key);}report.running=false;report.finishedAt=new Date().toISOString();}
  })();return {started:true};
})();
