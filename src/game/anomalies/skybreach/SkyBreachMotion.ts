import type { Formation, SkyRole } from './SkyBreachDirector.ts';

/** Forward fire banks gently with lateral movement; no pointer/stick aim input. */
export const skyForwardAim = (x: number, y: number, lateral: number) => ({
  x: x + Math.max(-1, Math.min(1, lateral)) * 45, y: y - 180
});

export const SKY_DURABILITY: Record<SkyRole, number> = {
  drone: 1, interceptor: 1, strike: 1, tank: 1, zeppelin: 7, aa: 1
};

export interface FlightSteering {
  phase: number; side: number; stage: 'attack' | 'bank' | 'climb'; stageAge: number;
  age: number; targetX: number; targetY: number; velocityX: number; velocityY: number; passes: number;
  group: number; slot: number; bank: number; heading: number;
}
const clamp = (v:number,lo:number,hi:number) => Math.max(lo,Math.min(hi,v));
export const createFlightSteering = (phase:number,direction:number):FlightSteering => ({
  phase,side:Math.sign(direction)|| (Math.sin(phase)>0?1:-1),stage:'attack',stageAge:0,
  age:0,targetX:0,targetY:0,velocityX:0,velocityY:0,passes:0,group:Math.sign(direction)||1,slot:0,bank:0,heading:Math.PI/2
});

/** Bounded acceleration towards a steering velocity; never teleports a physics body. */
function accelerate(s:FlightSteering,x:number,y:number,rate:number,dt:number) {
  const dx=x-s.velocityX,dy=y-s.velocityY,length=Math.hypot(dx,dy);
  const amount=length>0?Math.min(1,rate*dt/length):0;
  s.velocityX+=dx*amount;s.velocityY+=dy*amount;
  return {x:s.velocityX,y:s.velocityY};
}

/** Local avoidance also resolves exact overlaps with opposite deterministic impulses. */
export function droneSeparation(x:number,y:number,otherX:number,otherY:number,order:number) {
  const dx=x-otherX,dy=y-otherY,d=Math.hypot(dx,dy);
  if(d>=108)return {x:0,y:0};
  if(d<.001)return {x:order<0?-100:100,y:order<0?-45:45};
  const strength=(1-d/108)*150;
  return {x:dx/d*strength,y:dy/d*strength};
}

/** Active-time steering. Aircraft commit to a pass, bank, climb, then reacquire.
 * Recovery modules explicitly retire the encounter; ordinary flights never age out. */
export function steerFlight(s:FlightSteering,role:SkyRole,pattern:Formation,dt:number,
  x:number,y:number,playerX:number,playerY:number,width:number,height:number,speed:number,
  separationX=0,separationY=0) {
  dt=clamp(dt,0,.1);s.age+=dt;
  if(role==='tank')return {x:0,y:14}; // Same scroll as the lowest industrial layer.
  if(role==='aa')return {x:0,y:49};
  if(role==='zeppelin')return accelerate(s,Math.sin(s.age*.45+s.phase)*24,(245-y)*.45,75,dt);
  if(role==='drone') {
    s.stageAge+=dt;
    if(s.stageAge>(s.stage==='attack'?3.4:s.stage==='bank'?1.5:2.2)) {
      s.stage=s.stage==='attack'?'bank':s.stage==='bank'?'climb':'attack';s.stageAge=0;
      if(s.stage==='attack'){s.passes++;s.side*=-1;}
    }
    const orbit=s.age*(.28+(s.phase%1)*.13)+s.phase;
    const radius=s.stage==='attack'?145:s.stage==='bank'?300:235;
    const tx=clamp(playerX+Math.cos(orbit)*(radius+Math.sin(s.phase)*55),110,width-110);
    const ty=clamp(playerY-(s.stage==='attack'?145:260)+Math.sin(orbit)*95,180,height-150);
    let vx=(tx-x)*.7+Math.sin(s.age*2.7+s.phase)*30+Math.sin(s.age*5.1+s.phase)*9+separationX;
    let vy=(ty-y)*.7+Math.sin(s.age*3.3+s.phase*2)*25+separationY;
    const limit=speed*1.1,length=Math.hypot(vx,vy);
    if(length>limit){vx*=limit/length;vy*=limit/length;}
    return accelerate(s,vx,vy,speed*2.4,dt);
  }
  if(pattern==='corkscrew'&&s.age<18) {
    // Opposed groups trace intertwined helices while progressing down the corridor.
    const t=Math.max(0,s.age-2),phase=t*.85+(s.group<0?Math.PI:0)+s.slot*.24;
    const tx=width/2+Math.cos(phase)*width*.29;
    const ty=clamp(160+t*height*.035+Math.sin(phase)*100-s.slot*48,115,height-110);
    const dx=tx-x,dy=ty-y,limit=speed*3.5,d=Math.max(1,Math.hypot(dx,dy));
    return accelerate(s,dx/d*Math.min(limit,d*2),dy/d*Math.min(limit,d*2),limit*2.2,dt);
  }
  const heavy=role==='strike';
  // Select targets only at the beginning of a maneuver, rather than homing each frame.
  if(s.stageAge===0){
    if(s.stage==='attack'){
      const flank=pattern==='crossing'||pattern==='scissors'?260:pattern==='diagonal'||pattern==='pincer'?180:70;
      s.targetX=clamp(playerX+s.side*flank,100,width-100);
      s.targetY=clamp(playerY+(pattern==='banked-dive'?190:120),height*.62,height-100);
    }else if(s.stage==='bank'){
      s.targetX=s.side>0?width-95:95;s.targetY=clamp(y+100,200,height-75);
    }else {s.targetX=s.side>0?width*.7:width*.3;s.targetY=160+Math.sin(s.phase)*35;}
  }
  s.stageAge+=dt;
  const dx=s.targetX-x,dy=s.targetY-y,distance=Math.hypot(dx,dy);
  if(distance<90||s.stageAge>(heavy?6:4.5)){
    s.stage=s.stage==='attack'?'bank':s.stage==='bank'?'climb':'attack';s.stageAge=0;
    if(s.stage==='attack'){s.passes++;s.side*=-1;}
  }
  const runSpeed=speed*(heavy?1.8:3.5);
  const targetSpeed=runSpeed*(s.stage==='attack'?(pattern==='banked-dive'?1.15:1):s.stage==='bank'?.72:.9);
  // Perpendicular S-turns give formations different trajectories without replacing their entry slots.
  const curl=Math.sin(s.age*(pattern==='spiral'?1.4:pattern==='split'?3.8:2.2)+s.phase)
    *targetSpeed*(heavy?.09:pattern==='spiral'?.5:pattern==='escort-break'?.32:.2);
  let vx=distance>1?(dx*targetSpeed-dy*curl)/distance:0;
  let vy=distance>1?(dy*targetSpeed+dx*curl)/distance:0;
  // Strong recovery steering handles knockback or a pass which overshoots the view.
  if(x<60||x>width-60||y<80||y>height-45){
    const rx=clamp(x,120,width-120)-x,ry=clamp(y,160,height-120)-y,r=Math.hypot(rx,ry);
    if(r>0){vx=rx/r*targetSpeed;vy=ry/r*targetSpeed;}
  }
  return accelerate(s,vx,vy,runSpeed*(heavy?1.4:2.8),dt);
}

/** Smooth pseudo-roll changes wing perspective independently from world heading. */
export function flightBank(s:FlightSteering,pattern:Formation,dt:number):number {
  if(dt<=0)return s.bank;
  const heading=Math.atan2(s.velocityY,s.velocityX);
  const turn=Math.atan2(Math.sin(heading-s.heading),Math.cos(heading-s.heading));
  const roll=pattern==='corkscrew'&&s.age<18?Math.sin((s.age-2)*.85+(s.group<0?Math.PI:0))* .85
    :pattern==='rolling-entry'&&s.age<4?Math.sin(s.age*1.7):clamp(turn/Math.max(dt,.001)*.55,-1,1);
  s.bank+=(roll-s.bank)*(1-Math.exp(-dt*5));s.heading=heading;
  return s.bank;
}

export function dreadnoughtPosition(elapsedMs:number,width:number) {
  const t=elapsedMs/1000,extent=135+Math.sin(t*.055)*35;
  return { x:width/2+Math.sin(t*.19)*extent, y:245+Math.sin(t*.11)*18 };
}
