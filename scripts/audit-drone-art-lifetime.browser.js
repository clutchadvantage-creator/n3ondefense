(() => {
 const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
 const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],screenshots:[]};
 const check=(ok,label,detail)=>{report.cases.push({ok:!!ok,label,detail});if(!ok)throw new Error(label);};
 report.promise=(async()=>{
  let scene;
  try{
   const {FlyingDrone}=await import('/src/game/enemies/drone/FlyingDrone.ts');
   const {baseEnemyStats}=await import('/src/game/enemies/Enemy.ts');
   const {RedlineVisualController}=await import('/src/game/arcade/visuals/RedlineVisualController.ts');
   const {RedlineMomentum}=await import('/src/game/arcade/events/RedlineMomentum.ts');
   for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
   scene=new Phaser.Scene({key:'drone-art-reuse'});game.scene.add('drone-art-reuse',scene,true);await wait(100);
   const width=scene.scale.width,height=scene.scale.height;
   scene.add.rectangle(width/2,height/2,width,height,0x07101d);
   scene.add.text(width/2,70,'STRAFE DRONE / SHARED CHASSIS',{fontFamily:'Orbitron, sans-serif',fontSize:'24px',color:'#83e9f3'}).setOrigin(.5);
   scene.add.text(width/2,110,'STANDARD     /     REDLINE REINFORCEMENT     /     PRIORITY TARGET',{fontFamily:'Rajdhani, sans-serif',fontSize:'19px',color:'#d6e5ed'}).setOrigin(.5);
   const drones=[];
   // The same enemy body/health/art/weapon accepts a second scene and an injected movement strategy.
   const movement={update:s=>{s.vx=0;s.vy=0;}};
   for(const [i,variant] of ['standard','redline','target'].entries())for(const [row,size] of [64,128].entries()){
    const drone=new FlyingDrone(scene,width*(.25+i*.25),260+row*260,{...baseEnemyStats.drone},i,variant,movement);
    drone.setDisplaySize(size,size);if(drone.marker)drone.marker.setScale(size/64);
    drones.push(drone);
    scene.add.text(drone.x,drone.y+size/2+24,variant.toUpperCase()+' / '+(row?'2x ART DETAIL':'GAMEPLAY SIZE'),{fontFamily:'Rajdhani, sans-serif',fontSize:'17px',color:variant==='target'?'#ff7d92':'#b8d8e9'}).setOrigin(.5);
   }
   const bounds={x:0,y:0,w:width,h:height};
   const animate=(_time,delta)=>{for(const d of drones)if(d.active){d.updateMechanicalPresentation(scene.time.now);d.updateFlight(scene.time.now,delta/1000,d.x,d.y-100,bounds,2300,()=>{});}};
   scene.events.on('update',animate);await wait(1100);
   report.screenshots.push({label:'drone-variants',png:await new Promise(r=>game.renderer.snapshot(img=>r(img.src)))});
   check(drones.every(d=>d.texture.key.startsWith('enemy-drone')&&d.texture.has('3')),'All variants use four cached poses of the shared chassis');
   const actor=drones[0],before=actor.hp;actor.takeDamage(3,'weapon');
   check(actor.hp===before-3&&actor.body.velocity.x===0&&actor.body.velocity.y===0,'Injected second-scene movement preserves normal health and physics');
   scene.events.off('update',animate);game.scene.stop(scene.scene.key);await wait(100);
   check(Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e.parent?.scene===scene).length===0,'Art scene releases Text canvases');
   game.scene.start(scene.scene.key);await wait(100);
   for(let cycle=0;cycle<18;cycle++){
    const v=new RedlineVisualController(scene),m=new RedlineMomentum();for(let i=0;i<9;i++)m.kill();v.update(scene.time.now,m,20000);
    const target=new FlyingDrone(scene,200,200,{...baseEnemyStats.drone},cycle,'target');
    const handles=[];const visit=o=>{if(o.type==='RenderTexture')handles.push(o.texture.getWebGLTexture().webGLTexture);if(o.type==='Container')o.list.forEach(visit);};scene.children.list.forEach(visit);
    check(handles.length===1&&handles.every(h=>game.renderer.gl.isTexture(h)),'Private gauge cache is live '+cycle);
    if(cycle%2){game.scene.stop(scene.scene.key);}else{v.destroy();target.destroy();}
    await wait(50);
    check(handles.every(h=>!game.renderer.gl.isTexture(h))&&scene.children.length===0&&Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e.parent?.scene===scene).length===0,'Gauge texture, target marker and text retire '+cycle);
    if(!scene.sys.isActive()){game.scene.start(scene.scene.key);await wait(50);}
    check(scene.physics.world.bodies.size===0,'Drone physics bodies retire '+cycle);
   }
  }catch(e){report.errors.push(String(e.stack??e));}
  finally{if(scene?.scene){game.scene.stop(scene.scene.key);game.scene.remove(scene.scene.key);}report.running=false;}
 })();return 'Drone art, reuse and lifetime audit started';
})();
