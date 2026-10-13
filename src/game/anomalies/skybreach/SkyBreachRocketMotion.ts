export interface RocketTarget { x:number; y:number; active:boolean; hp:number; stats:{size:number} }
export interface RocketMotion<T extends RocketTarget = RocketTarget> {
  x:number; y:number; angle:number; launchAt:number; armAt:number; expiresAt:number;
  nextTargetAt:number; target:T|null;
}
export function createRocketMotion<T extends RocketTarget>(x:number,y:number,angle:number,now:number,armMs:number,delay=0): RocketMotion<T> {
  return {x,y,angle,launchAt:now+delay,armAt:now+delay+armMs,expiresAt:now+delay+armMs+8000,nextTargetAt:0,target:null};
}
/** Bounded turn rate and swept contact avoid tunnelling at low frame rates. */
export function advanceRocket<T extends RocketTarget>(r:RocketMotion<T>,now:number,dt:number,targets:readonly T[],valid:(target:T)=>boolean): 'flying'|'impact'|'expired' {
  if(now>=r.expiresAt)return 'expired';
  if(now<r.launchAt)return 'flying';
  if(now>=r.nextTargetAt || !r.target || !r.target.active || r.target.hp<=0 || !valid(r.target)) {
    r.nextTargetAt=now+120;r.target=null;let best=Infinity;
    for(const target of targets)if(target.active&&target.hp>0&&valid(target)) {
      const distance=(target.x-r.x)**2+(target.y-r.y)**2;
      if(distance<best){best=distance;r.target=target;}
    }
  }
  const step=Math.max(0,Math.min(.05,dt));
  if(r.target){
    const angle=Math.atan2(r.target.y-r.y,r.target.x-r.x);
    const turn=Math.atan2(Math.sin(angle-r.angle),Math.cos(angle-r.angle));
    r.angle+=Math.max(-step*7,Math.min(step*7,turn));
  }
  // Brake on approach so a close target cannot trap the rocket in a perpetual
  // turn-radius orbit, especially while its inherited mine fuse is still arming.
  const speed=r.target?Math.min(410,Math.max(110,Math.hypot(r.target.x-r.x,r.target.y-r.y)*3)):410;
  const dx=Math.cos(r.angle)*speed*step,dy=Math.sin(r.angle)*speed*step;
  if(r.target&&now>=r.armAt){
    const target=r.target,den=dx*dx+dy*dy;
    const t=den>0?Math.max(0,Math.min(1,((target.x-r.x)*dx+(target.y-r.y)*dy)/den)):0;
    const x=r.x+dx*t,y=r.y+dy*t,radius=12+Math.min(45,target.stats.size*.45);
    if((target.x-x)**2+(target.y-y)**2<=radius*radius){
      r.x=x;r.y=y;return 'impact';
    }
  }
  r.x+=dx;r.y+=dy;
  return 'flying';
}
