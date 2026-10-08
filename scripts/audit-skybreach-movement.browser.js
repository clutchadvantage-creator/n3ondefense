// Run after audit-skybreach.browser.js with __skyPreview=true in an isolated browser.
(() => {
 const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],errors:[]};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
 report.promise=(async()=>{try{
  const sky=globalThis.__sky;
  check(sky?.sys.isActive(),'live SkyBreach fixture');
  sky.updateMission=()=>{};sky.retireFlights();sky.clearThreats();
  for(const e of sky.enemies)e.destroy();sky.enemies.length=0;
  sky.hull?.setVisible(false);for(const h of sky.hardpoints){h.wreck.setVisible(false);h.smoke.setVisible(false);}
  for(const door of sky.coreDoors)door.setVisible(false);
  sky.inputController.held=()=>false;sky.player.invulnUntil=Infinity;
  const roles=['interceptor','strike','zeppelin','tank','aa'];
  const actors=roles.map((role,i)=>sky.spawnAircraft(role,240+i*230,role==='tank'?660:240,1,1,'crossing'));
  const drones=Array.from({length:6},()=>sky.spawnAircraft('drone',720,420));
  for(const e of [...actors,...drones])e.hp=e.stats.hp=1e9;
  const tank=actors[3],aa=actors[4];
  check(tank.depth<sky.world.layers[1].depth&&aa.depth>sky.world.layers[2].depth,'tank below cloud decks; AA above on existing platform');
  check(sky.flights.get(aa).decorations[0].texture.key.startsWith('sky-city-aa-')&&sky.flights.get(tank).decorations.length===0,'AA sits on an extruded tower; tanks remain on the street');
  const started=sky.missionTime;
  await wait(4500);
  let minDistance=Infinity;
  for(let i=0;i<drones.length;i++)for(let j=i+1;j<drones.length;j++)minDistance=Math.min(minDistance,Math.hypot(drones[i].x-drones[j].x,drones[i].y-drones[j].y));
  check(minDistance>35,'six initially overlapping drones separate');
  check(Math.abs(tank.x-sky.world.groundLaneX(sky.flights.get(tank).lane))<2,'tank tracks existing ground road');
  await wait(34000);
  check(sky.missionTime-started>34000,'fixture covers old 34-second retirement');
  for(const e of actors.slice(0,3))check(e.active&&sky.flights.has(e),'surviving '+e.name+' stays in combat');
  for(const e of actors.slice(0,2))check(sky.flights.get(e).steering.passes>=2,e.name+' completes repeated attack/return passes');
  const statsBefore=sky.mechanicalDestruction.stats();
  const sounds=[];const original=sky.coreAudio.playSfx.bind(sky.coreAudio);
  sky.coreAudio.playSfx=name=>{sounds.push(name);original(name);};
  try{
   const targets=['drone','interceptor','strike','tank','aa','zeppelin'].map((r,i)=>sky.spawnAircraft(r,280+i*170,500));
   sky.damageEnemy(targets[0],1);check(sounds.includes('hit'),'existing hit sound used');
   for(const e of targets)sky.damageEnemy(e,1e9);
   await wait(120);
   check(targets.every(e=>!e.active&&!sky.flights.has(e)),'all role deaths removed once');
   const effects=sky.mechanicalDestruction.stats();
   check(effects.activeFragments>statsBefore.activeFragments&&effects.activeBursts>0,'arena debris and burst pool emits on deaths');
   check(effects.fragmentCapacity<=168&&effects.activeBursts<=96,'established destruction caps respected');
   check(sounds.filter(s=>s==='enemyDeath').length===6,'one shared death audio request per kill');
   sky.retireFlights();sky.clearThreats();await wait(3000);
   check(sky.mechanicalDestruction.stats().activeFragments===0&&sky.mechanicalDestruction.stats().activeBursts===0,'all destruction effects expire');
  }finally{sky.coreAudio.playSfx=original;}
  sky.returnToArena(false,'player-dead');await wait(600);
  check(sky.mechanicalDestruction.stats().activeFragments===0,'shutdown drops pooled effect references');
  check(n3onGame.scene.isActive('arena'),'Arena restored after movement fixture');
  report.cases.push({passed:true,minDroneDistance:minDistance});
 }catch(e){report.errors.push(String(e.stack??e));}finally{report.running=false;}})();
 return {started:true};
})();
