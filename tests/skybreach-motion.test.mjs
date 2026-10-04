import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlightSteering,steerFlight,droneSeparation} from '../src/game/anomalies/skybreach/SkyBreachMotion.ts';

test('every aircraft formation returns repeatedly and remains bounded over a long fight',()=>{
 for(const role of ['interceptor','strike'])for(const pattern of ['line','v','staggered','dual-column','split','crossing','diagonal']){
  for(const start of [{x:35,y:320},{x:1300,y:-100},{x:720,y:780}]){
   const s=createFlightSteering(2.4,1);let {x,y}=start;let upward=0,peak=0;
   for(let i=0;i<7200;i++){
    const v=steerFlight(s,role,pattern,1/60,x,y,720,680,1440,900,100);
    x+=v.x/60;y+=v.y/60;upward+=v.y<-80?1:0;peak=Math.max(peak,Math.hypot(v.x,v.y));
    assert.ok(Number.isFinite(x+y));
    assert.ok(x>-100&&x<1540&&y>-150&&y<1020,`${role}/${pattern}: escaped to ${x},${y}`);
   }
   assert.ok(s.passes>=4,`${role}/${pattern}: never completed returns (${s.passes})`);
   assert.ok(upward>100);assert.ok(peak>(role==='interceptor'?300:160));
  }
 }
});

test('drones separate from exact overlap and remain independently active in the combat view',()=>{
 const drones=Array.from({length:6},(_,i)=>({x:720,y:450,s:createFlightSteering((i+1)*2.4,0)}));
 for(let frame=0;frame<2400;frame++){
  const velocities=drones.map((d,i)=>{
   let sx=0,sy=0;
   for(let j=0;j<drones.length;j++)if(i!==j){const n=drones[j],v=droneSeparation(d.x,d.y,n.x,n.y,i-j);sx+=v.x;sy+=v.y;}
   return steerFlight(d.s,'drone','split',1/60,d.x,d.y,720,680,1440,900,140,sx,sy);
  });
  drones.forEach((d,i)=>{d.x+=velocities[i].x/60;d.y+=velocities[i].y/60;});
 }
 for(let i=0;i<drones.length;i++){
  const d=drones[i];assert.ok(d.x>100&&d.x<1340&&d.y>120&&d.y<850);
  for(let j=i+1;j<drones.length;j++)assert.ok(Math.hypot(d.x-drones[j].x,d.y-drones[j].y)>45);
 }
});

test('paused movement preserves steering, and ground/AA retain distinct scroll layers',()=>{
 const s=createFlightSteering(1,1);
 steerFlight(s,'interceptor','line',.1,720,200,720,680,1440,900,100);
 const before=structuredClone(s);
 steerFlight(s,'interceptor','line',0,720,200,720,680,1440,900,100);
 assert.deepEqual(s,before);
 assert.equal(steerFlight(s,'tank','line',.1,200,600,720,680,1440,900,100).y,14);
 assert.equal(steerFlight(s,'aa','line',.1,200,600,720,680,1440,900,100).y,49);
});
