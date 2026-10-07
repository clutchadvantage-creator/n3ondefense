import { SYSTEM_INFUSION_TUNING as T } from '../mods/SystemInfusions.ts';

export interface FenceBarrier { x1:number; y1:number; x2:number; y2:number; hp:number; expiresAt:number; sprite:{active:boolean} }
export const liveFence=(f:FenceBarrier,now:number):boolean=>f.sprite.active&&f.hp>0&&now<f.expiresAt;
export function fenceDistance(x:number,y:number,f:FenceBarrier):number {
  const dx=f.x2-f.x1,dy=f.y2-f.y1,t=Math.max(0,Math.min(1,((x-f.x1)*dx+(y-f.y1)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x-f.x1-t*dx,y-f.y1-t*dy);
}
interface Hit { x:number; y:number; nx:number; ny:number; t:number }
/** Swept circle/capsule test catches fast enemies and pushes from either side. */
export function sweepFence(ax:number,ay:number,bx:number,by:number,radius:number,f:FenceBarrier):Hit|null {
  const dx=f.x2-f.x1,dy=f.y2-f.y1,length=Math.hypot(dx,dy);if(length<.001)return null;
  const ux=dx/length,uy=dy/length,nx=-uy,ny=ux,vx=bx-ax,vy=by-ay;
  const along=(ax-f.x1)*ux+(ay-f.y1)*uy,normal=(ax-f.x1)*nx+(ay-f.y1)*ny;
  const vn=vx*nx+vy*ny;
  let best:Hit|null=null;
  const offer=(t:number,hx:number,hy:number,hnx:number,hny:number)=>{
    if(t>=0&&t<=1&&(!best||t<best.t))best={x:hx+hnx*.2,y:hy+hny*.2,nx:hnx,ny:hny,t};
  };
  if(along>=0&&along<=length&&Math.abs(normal)<radius){
    const side=normal<0?-1:normal>0?1:vn>0?-1:1;
    // Moving away from an existing overlap must be allowed.
    if(vn*side<=0)offer(0,ax+nx*(side*radius-normal),ay+ny*(side*radius-normal),nx*side,ny*side);
  }
  if(Math.abs(vn)>.00001)for(const side of [-1,1]){
    if(vn*side>=0)continue;
    const t=(side*radius-normal)/vn,projection=along+(vx*ux+vy*uy)*t;
    if(projection>=0&&projection<=length)offer(t,ax+vx*t,ay+vy*t,nx*side,ny*side);
  }
  const speedSquared=vx*vx+vy*vy;
  for(const [cx,cy] of [[f.x1,f.y1],[f.x2,f.y2]]){
    const px=ax-cx,py=ay-cy,b=2*(px*vx+py*vy),c=px*px+py*py-radius*radius;
    if(c<0){const d=Math.hypot(px,py)||1;if(px*vx+py*vy<=0)offer(0,cx+px/d*radius,cy+py/d*radius,px/d,py/d);continue;}
    const discriminant=b*b-4*speedSquared*c;
    if(speedSquared>0&&discriminant>=0){const t=(-b-Math.sqrt(discriminant))/(2*speedSquared),x=ax+vx*t,y=ay+vy*t;
      offer(t,x,y,(x-cx)/radius,(y-cy)/radius);}
  }
  return best;
}

/** Cached sparse grid, rebuilt only when living fence identities change. */
export class FenceObstruction {
  private fences:readonly FenceBarrier[]=[];
  private readonly blocked=new Set<number>();
  revision=0;
  private readonly cellSize:number;
  constructor(cellSize:number) { this.cellSize=cellSize; }
  refresh(fences:readonly FenceBarrier[],now:number):boolean {
    const live=fences.filter(f=>liveFence(f,now));
    if(live.length===this.fences.length&&live.every((f,i)=>f===this.fences[i]))return false;
    this.fences=live;this.blocked.clear();this.revision++;
    const pad=T.fence.navigationClearance+this.cellSize*.71;
    for(const f of live)for(let y=Math.floor((Math.min(f.y1,f.y2)-pad)/this.cellSize);y<=Math.ceil((Math.max(f.y1,f.y2)+pad)/this.cellSize);y++)
      for(let x=Math.floor((Math.min(f.x1,f.x2)-pad)/this.cellSize);x<=Math.ceil((Math.max(f.x1,f.x2)+pad)/this.cellSize);x++)
        if(fenceDistance((x+.5)*this.cellSize,(y+.5)*this.cellSize,f)<=pad)this.blocked.add(x+y*65536);
    return true;
  }
  readonly cellBlocked=(x:number,y:number):boolean=>this.blocked.has(x+y*65536);
  firstHit(ax:number,ay:number,bx:number,by:number,radius:number,now:number): (Hit & {fence:FenceBarrier})|null {
    let best:(Hit&{fence:FenceBarrier})|null=null;
    for(const f of this.fences){
      if(!liveFence(f,now)||Math.max(ax,bx)+radius<Math.min(f.x1,f.x2)||Math.min(ax,bx)-radius>Math.max(f.x1,f.x2)
        ||Math.max(ay,by)+radius<Math.min(f.y1,f.y2)||Math.min(ay,by)-radius>Math.max(f.y1,f.y2))continue;
      const hit=sweepFence(ax,ay,bx,by,radius+T.fence.thickness,f);if(hit&&(!best||hit.t<best.t))best={...hit,fence:f};
    }
    return best;
  }
  clear():void { this.fences=[];this.blocked.clear();this.revision++; }
}
