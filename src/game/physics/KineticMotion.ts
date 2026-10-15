import { KINETIC as C, type KineticSurface } from '../config/kinetic.ts';
import { segmentCircleRectHit, type SegmentHit } from './SweptCircleCollision.ts';
import type { RectSpec } from '../types.ts';
import type { OperativeRebound } from './OperativeRebound.ts';

export interface KineticRect extends RectSpec { surface?: KineticSurface; velocityX?:number; velocityY?:number; contactKey?: object }
export interface KineticImpact { x:number;y:number;nx:number;ny:number;speed:number;surface:KineticSurface }
export interface KineticTarget { x:number;y:number;vx:number;vy:number;radius:number;mass:number; receive(vx:number,vy:number,nx:number,ny:number,speed:number):void; contact():void }
export interface KineticHit extends SegmentHit { target:KineticTarget }
export interface KineticState {
  mass:number; heavy:boolean; remaining:number; clock:number; lastAt:number; lastNX:number;lastNY:number;
  impacts:number; iterations:number; exhausted:number;
  operative?: OperativeRebound;
}
export function kineticState(mass=1,heavy=false):KineticState {
  return {mass,heavy,remaining:0,clock:0,lastAt:-100,lastNX:0,lastNY:0,impacts:0,iterations:0,exhausted:0};
}
export function resetKinetic(s:KineticState):void {s.remaining=0;s.lastAt=-100;s.lastNX=s.lastNY=0;s.operative?.reset();}
export function responseCurve(speed:number):number {
  const t=Math.max(0,Math.min(1,(speed-C.threshold)/(C.fullResponseSpeed-C.threshold)));
  return t*t*(3-2*t);
}
export function reflectKinetic(vx:number,vy:number,nx:number,ny:number,surface:KineticSurface,heavy=false,repeated=false,sx=0,sy=0) {
  const length=Math.hypot(nx,ny)||1;nx/=length;ny/=length;
  const rx=vx-sx,ry=vy-sy,into=rx*nx+ry*ny;
  if(into>=0)return {vx,vy,speed:0};
  const speed=-into,curve=responseCurve(speed);
  const restitution=Math.max(0,C.restitution[surface]-C.highSpeedAmplification*(1-curve))*curve
    *(heavy?C.controlledRestitution:1)*(repeated?C.repeatedImpactDamping:1);
  const tangent=curve>0?C.tangentRetention:1;
  return {vx:sx+(rx-into*nx)*tangent-into*nx*restitution,
    vy:sy+(ry-into*ny)*tangent-into*ny*restitution,speed};
}
/** Standard finite-mass impulse; infinite mass is reserved for AI bosses. */
export function exchangeMomentum(avx:number,avy:number,bvx:number,bvy:number,nx:number,ny:number,ma:number,mb:number) {
  const length=Math.hypot(nx,ny)||1;nx/=length;ny/=length;
  const into=(avx-bvx)*nx+(avy-bvy)*ny;
  const ia=Number.isFinite(ma)?1/ma:0,ib=Number.isFinite(mb)?1/mb:0;
  const impulse=into<0&&ia+ib>0?-(1+C.restitution.body*responseCurve(-into))*into/(ia+ib):0;
  return {avx:avx+impulse*ia*nx,avy:avy+impulse*ia*ny,bvx:bvx-impulse*ib*nx,bvy:bvy-impulse*ib*ny,speed:Math.max(0,-into)};
}
/** Moving-circle contact along a swept relative segment. Existing overlaps are
 * positional correction, never a fresh energetic impact. */
export function sweepKineticTarget(x:number,y:number,dx:number,dy:number,radius:number,dt:number,target:KineticTarget):SegmentHit|null {
  const px=x-target.x,py=y-target.y,r=radius+target.radius;
  if(px*px+py*py<r*r-C.cornerEpsilon)return null;
  const vx=dx-target.vx*dt,vy=dy-target.vy*dt,den=vx*vx+vy*vy,dot=px*vx+py*vy;
  if(den<C.cornerEpsilon||dot>=0)return null;
  const disc=dot*dot-den*(px*px+py*py-r*r);if(disc<0)return null;
  const t=(-dot-Math.sqrt(disc))/den;if(t<0||t>1)return null;
  return {time:t,normalX:(px+vx*t)/r,normalY:(py+vy*t)/r};
}
export type FindKineticTarget=(x:number,y:number,dx:number,dy:number,r:number,dt:number)=>KineticHit|null;
export type TraceKineticTravel=(x:number,y:number,toX:number,toY:number)=>void;
/** Continuous collision resolution inside the existing Arcade body integration.
 * Sweeps remaining travel after each bounce; no added physics world or timers. */
export function resolveKineticMotion(x:number,y:number,vx:number,vy:number,radius:number,dt:number,
  rects:readonly KineticRect[],state:KineticState,onImpact?:(impact:KineticImpact)=>void,findTarget?:FindKineticTarget,
  trace?:TraceKineticTravel) {
  let remaining=dt;state.iterations=0;
  for(let i=0;i<C.maxIterations&&remaining>C.cornerEpsilon;i++){
    state.iterations++;
    const operative=state.operative;
    const travel=Math.hypot(vx,vy)*remaining;
    let step=remaining*Math.min(1,C.maxSweepDisplacement/Math.max(1,travel));
    if(operative?.remaining)step=Math.min(step,operative.remaining);
    const dx=vx*step,dy=vy*step;
    let nearest:SegmentHit|null=null,wall:KineticRect|undefined;
    for(const rect of rects){
      const hit=segmentCircleRectHit(x,y,dx-(rect.velocityX??0)*step,dy-(rect.velocityY??0)*step,radius,rect);
      if(hit&&(!nearest||hit.time<nearest.time)){nearest=hit;wall=rect;}
    }
    const dynamic=findTarget?.(x,y,dx,dy,radius,step),target=dynamic&&(!nearest||dynamic.time<nearest.time)?dynamic.target:null;
    if(target)nearest=dynamic!;
    if(!nearest){
      trace?.(x,y,x+dx,y+dy);x+=dx;y+=dy;remaining-=step;
      if(operative?.advance(step)){vx=operative.inputX;vy=operative.inputY;}
      continue;
    }
    const n=Math.hypot(nearest.normalX,nearest.normalY)||1,nx=nearest.normalX/n,ny=nearest.normalY/n;
    const t=Math.max(0,nearest.time-C.contactSkin/Math.max(C.contactSkin,Math.hypot(dx,dy)));
    trace?.(x,y,x+dx*t,y+dy*t);x+=dx*t;y+=dy*t;remaining-=step*nearest.time;
    operative?.advance(step*nearest.time);
    const surface=target?'body':wall?.surface??'inner';
    let speed=0;
    let fresh=true;
    if(operative){
      const sx=target?.vx??wall?.velocityX??0,sy=target?.vy??wall?.velocityY??0;
      const into=(vx-sx)*nx+(vy-sy)*ny;speed=Math.max(0,-into);
      fresh=operative.collide(target??wall!.contactKey??wall!,nx,ny,speed,x,y,target);
      if(target){
        if(fresh){const response=exchangeMomentum(vx,vy,target.vx,target.vy,nx,ny,state.mass,target.mass);
          target.receive(response.bvx,response.bvy,-nx,-ny,speed);}
        target.contact();
      }
      if(fresh){vx=operative.velocityX;vy=operative.velocityY;}
      else if(into<0){vx-=into*nx;vy-=into*ny;}
    }else if(target){
      const response=exchangeMomentum(vx,vy,target.vx,target.vy,nx,ny,state.mass,target.mass);
      vx=response.avx;vy=response.avy;speed=response.speed;
      target.receive(response.bvx,response.bvy,-nx,-ny,speed);target.contact();
    }else{
      const repeated=state.clock-state.lastAt<C.repeatedImpactSeconds&&nx*state.lastNX+ny*state.lastNY>.98;
      const response=reflectKinetic(vx,vy,nx,ny,surface,state.heavy,repeated,wall?.velocityX,wall?.velocityY);
      vx=response.vx;vy=response.vy;speed=response.speed;
    }
    if(speed>C.threshold&&fresh){
      if(!operative)state.remaining=Math.max(state.remaining,C.enemyMomentumSeconds);
      state.impacts++;state.lastAt=state.clock;state.lastNX=nx;state.lastNY=ny;
      onImpact?.({x:x-nx*radius,y:y-ny*radius,nx,ny,speed,surface});
    }
    // A skin offset separates contacts without injecting velocity.
    x+=nx*C.cornerEpsilon*10;y+=ny*C.cornerEpsilon*10;
    if(nearest.time<C.cornerEpsilon&&Math.hypot(vx,vy)<C.cornerEpsilon)break;
  }
  if(remaining>C.cornerEpsilon){
    state.exhausted++;
    // Blocked travel still consumes response time. A corner may not preserve
    // an impulse indefinitely by resolving a zero-time contact every substep.
    if(state.operative?.advance(remaining)){vx=state.operative.inputX;vy=state.operative.inputY;}
  }
  return {x,y,vx,vy};
}
export function steerKinetic(vx:number,vy:number,desiredX:number,desiredY:number,dt:number,state:KineticState) {
  if(state.remaining<=0)return {x:desiredX,y:desiredY};
  if(state.operative)return {x:desiredX,y:desiredY};
  const rate=C.enemySteeringPerSecond;
  const alpha=1-Math.exp(-rate*Math.max(0,Math.min(.05,dt)));
  return {x:vx+(desiredX-vx)*alpha,y:vy+(desiredY-vy)*alpha};
}
