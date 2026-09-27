import type { RectSpec } from '../types.ts';
import { resolveSweptCircleMotion } from '../physics/SweptCircleCollision.ts';

const UPPER = 44;
const LOWER = 48;
const FOOT_OFFSETS = [0, -.18, .18, -.36, .36, -.7, .7, -1.05, 1.05, -1.3, 1.3] as const;
const REACHES = [72, 60, 48, 36, 24, 12] as const;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export interface MechanicalFoot {
  hipX: number; hipY: number; kneeX: number; kneeY: number;
  x: number; y: number; fromX: number; fromY: number; toX: number; toY: number;
  progress: number; lift: number; group: number; side: number; row: number;
  stepping: boolean; valid: boolean; reach: number;
  centerX: number; centerY: number; arc: boolean;
  routeX: Float64Array; routeY: Float64Array; routeLength: Float64Array; routeCount: number;
}

/** Segment against expanded wall rectangles; no physics objects or allocations. */
export function legSegmentClear(ax: number, ay: number, bx: number, by: number, blockers: readonly RectSpec[], pad = 6): boolean {
  for (const b of blockers) {
    if (Math.max(ax, bx) < b.x-pad || Math.min(ax, bx) > b.x+b.w+pad
      || Math.max(ay, by) < b.y-pad || Math.min(ay, by) > b.y+b.h+pad) continue;
    let lo = 0, hi = 1;
    const dx = bx-ax, dy = by-ay;
    if (Math.abs(dx) < .0001) { if (ax < b.x || ax > b.x+b.w) hi=-1; }
    else { const a=(b.x-ax)/dx, c=(b.x+b.w-ax)/dx; lo=Math.max(lo,Math.min(a,c)); hi=Math.min(hi,Math.max(a,c)); }
    if (Math.abs(dy) < .0001) { if (ay < b.y || ay > b.y+b.h) hi=-1; }
    else { const a=(b.y-ay)/dy, c=(b.y+b.h-ay)/dy; lo=Math.max(lo,Math.min(a,c)); hi=Math.min(hi,Math.max(a,c)); }
    if (lo <= hi) return false;
    // Rounded capsule clearance agrees with the shared swept-circle helper;
    // an expanded square falsely rejects valid contacts around wall corners.
    for(let end=0;end<2;end++){
      const x=end?bx:ax,y=end?by:ay;
      const ex=Math.max(b.x-x,0,x-b.x-b.w),ey=Math.max(b.y-y,0,y-b.y-b.h);
      if(ex*ex+ey*ey<pad*pad)return false;
    }
    const length=dx*dx+dy*dy;
    for(let corner=0;corner<4;corner++){
      const cx=b.x+(corner%2)*b.w,cy=b.y+Math.floor(corner/2)*b.h;
      const t=length>0?Math.max(0,Math.min(1,((cx-ax)*dx+(cy-ay)*dy)/length)):0;
      const ex=cx-ax-dx*t,ey=cy-ay-dy*t;
      if(ex*ex+ey*ey<pad*pad)return false;
    }
  }
  return true;
}

/** Small two-link solver and alternating support groups. Feet remain in WORLD
 * space while planted, including through chassis turns. This is presentation
 * only: it never changes velocity, collision, AI targets or attack state. */
export class BossLegLocomotion {
  readonly feet: MechanicalFoot[];
  readonly blockers: readonly RectSpec[];
  heading = 0;
  airborne = false;
  private initialized = false;
  private previousX = 0;
  private previousY = 0;
  private previousNow = 0;
  private group = 0;
  private groupSince = 0;
  private candidateX = 0;
  private candidateY = 0;
  private candidateKneeX = 0;
  private candidateKneeY = 0;
  private leadX = 0;
  private leadY = 0;
  private readonly swingX = new Float64Array(32);
  private readonly swingY = new Float64Array(32);
  private readonly swingCost = new Float64Array(32);
  constructor(count: number, blockers: readonly RectSpec[] = []) {
    this.blockers = blockers;
    this.feet = Array.from({length:count}, (_,i)=>({hipX:0,hipY:0,kneeX:0,kneeY:0,x:0,y:0,
      fromX:0,fromY:0,toX:0,toY:0,progress:1,lift:0,group:(Math.floor(i/2)+i%2)%2,
      side:i%2?1:-1,row:(count/2-1)/2-Math.floor(i/2),stepping:false,valid:true,reach:72,centerX:0,centerY:0,arc:false,
      routeX:new Float64Array(9),routeY:new Float64Array(9),routeLength:new Float64Array(9),routeCount:0}));
  }

  update(x: number, y: number, facing: number, now: number, brace: number): void {
    const dt = this.initialized ? Math.min(50, Math.max(0, now-this.previousNow)) : 0;
    const dx = x-this.previousX, dy = y-this.previousY;
    const relocated = !this.initialized || dx*dx+dy*dy > 150*150;
    if (relocated) this.heading=facing;
    else this.heading += Math.max(-dt*.0015,Math.min(dt*.0015,wrap(facing-this.heading)));
    const cosine=Math.cos(this.heading), sine=Math.sin(this.heading);
    const speed = dt > 0 && !relocated ? Math.hypot(dx,dy)*1000/dt : 0;
    const landing=this.airborne&&speed<=300;
    this.airborne=speed>300;
    const duration = Math.max(90, Math.min(220, 20000/Math.max(90,speed)));
    this.leadX = !relocated && dt > 0 ? Math.max(-28,Math.min(28,dx/dt*duration)) : 0;
    this.leadY = !relocated && dt > 0 ? Math.max(-28,Math.min(28,dy/dt*duration)) : 0;
    let stepping = 0;
    for(const foot of this.feet) if(foot.stepping) stepping++;
    if (!this.feet.some(f=>f.stepping) && now-this.groupSince > 100) { this.group=1-this.group;this.groupSince=now; }
    for (const foot of this.feet) {
      // Keep attachment joints inside the existing 34px collision circle even
      // at 45-degree turns; the previous rectangular hip offsets exceeded it.
      foot.hipX=x+cosine*foot.row*20-sine*foot.side*18;
      foot.hipY=y+sine*foot.row*20+cosine*foot.side*18;
      const direction=this.heading+foot.side*(Math.PI/2-foot.row*.72);
      if(this.airborne){
        this.leadX=this.leadY=0;
        this.chooseFoot(foot,direction);
        foot.x=foot.toX=this.candidateX;foot.y=foot.toY=this.candidateY;
        foot.stepping=true;foot.progress=.5;foot.lift=1;
        foot.valid=this.solve(foot,foot.x,foot.y);
        if(foot.valid){foot.kneeX=this.candidateKneeX;foot.kneeY=this.candidateKneeY;}
        foot.reach=Math.hypot(foot.x-foot.hipX,foot.y-foot.hipY);
        continue;
      }
      if(landing){foot.stepping=false;foot.progress=1;}
      if (relocated) {
        this.chooseFoot(foot,direction);
        foot.x=foot.toX=this.candidateX;foot.y=foot.toY=this.candidateY;
        foot.stepping=false;foot.progress=1;
      }
      const distance=Math.hypot(foot.x-foot.hipX,foot.y-foot.hipY);
      const unsafe=!this.solve(foot,foot.x,foot.y);
      let approachingWall=false;
      if(!relocated&&!foot.stepping&&dt>0){
        const hx=foot.hipX,hy=foot.hipY;
        foot.hipX+=dx/dt*90;foot.hipY+=dy/dt*90;
        approachingWall=!this.solve(foot,foot.x,foot.y);
        foot.hipX=hx;foot.hipY=hy;
      }
      const idealX=foot.hipX+Math.cos(direction)*72, idealY=foot.hipY+Math.sin(direction)*72;
      const displaced=Math.hypot(foot.x-idealX,foot.y-idealY);
      const urgent=distance>80 || distance<35 || unsafe || approachingWall;
      if (!foot.stepping && (stepping < Math.ceil(this.feet.length / 2)
        || unsafe && stepping < Math.min(this.feet.length-1, Math.ceil(this.feet.length / 2)+1))
        && (urgent || (foot.group===this.group && displaced>(brace>.6?32:21)))) {
        this.chooseFoot(foot,direction);
        if (Math.hypot(foot.x-this.candidateX,foot.y-this.candidateY)>4) {
          foot.fromX=foot.x;foot.fromY=foot.y;foot.toX=this.candidateX;foot.toY=this.candidateY;
          foot.centerX=x;foot.centerY=y;
          const sx=foot.toX-foot.fromX,sy=foot.toY-foot.fromY;
          const t=Math.max(0,Math.min(1,((x-foot.fromX)*sx+(y-foot.fromY)*sy)/(sx*sx+sy*sy)));
          foot.arc=Math.hypot(foot.fromX+sx*t-x,foot.fromY+sy*t-y)<45;
          this.planSwing(foot);
          foot.progress=0;foot.stepping=true;
          stepping++;
        }
      }
      if (foot.stepping) {
        const previousX=foot.x,previousY=foot.y;
        foot.progress=Math.min(1,foot.progress+dt/duration);
        const t=foot.progress*foot.progress*(3-2*foot.progress);
        const distance=t*foot.routeLength[foot.routeCount-1];
        let segment=1;
        while(segment<foot.routeCount-1&&foot.routeLength[segment]<distance)segment++;
        const start=foot.routeLength[segment-1];
        const fraction=(distance-start)/Math.max(.001,foot.routeLength[segment]-start);
        foot.x=foot.routeX[segment-1]+(foot.routeX[segment]-foot.routeX[segment-1])*fraction;
        foot.y=foot.routeY[segment-1]+(foot.routeY[segment]-foot.routeY[segment-1])*fraction;
        const movement=Math.hypot(foot.x-previousX,foot.y-previousY),limit=dt*.8;
        if(movement>limit&&movement>0){foot.x=previousX+(foot.x-previousX)*limit/movement;foot.y=previousY+(foot.y-previousY)*limit/movement;}
        if(!legSegmentClear(previousX,previousY,foot.x,foot.y,this.blockers)){
          const safe=resolveSweptCircleMotion(previousX,previousY,foot.x,foot.y,6.5,this.blockers);
          foot.x=safe.x;foot.y=safe.y;
        }
        if(!legSegmentClear(foot.x,foot.y,foot.x,foot.y,this.blockers)){
          foot.x=previousX;foot.y=previousY;
        }
        if(foot.progress===1) { foot.stepping=false; stepping--; }
      }
      foot.lift=foot.stepping?Math.sin(foot.progress*Math.PI):0;
      foot.valid=this.solve(foot,foot.x,foot.y);
      if(foot.valid){
        let kx=this.candidateKneeX,ky=this.candidateKneeY;
        if(this.initialized&&!relocated){
          const distance=Math.hypot(kx-foot.kneeX,ky-foot.kneeY),limit=dt*.4;
          if(distance>limit){
            const sx=foot.kneeX+(kx-foot.kneeX)*limit/distance,sy=foot.kneeY+(ky-foot.kneeY)*limit/distance;
            if(legSegmentClear(foot.hipX,foot.hipY,sx,sy,this.blockers)&&legSegmentClear(sx,sy,foot.x,foot.y,this.blockers)){kx=sx;ky=sy;}
          }
        }
        foot.kneeX=kx;foot.kneeY=ky;
      }
      foot.reach=Math.hypot(foot.x-foot.hipX,foot.y-foot.hipY);
    }
    this.initialized=true;this.previousNow=now;this.previousX=x;this.previousY=y;
  }

  private chooseFoot(foot: MechanicalFoot, direction: number): void {
    for(let lead=1;lead>=0;lead--) for (const reach of REACHES) for (const offset of FOOT_OFFSETS) {
      if(this.airborne&&reach>48)continue;
      if (Math.sin(direction+offset-this.heading)*foot.side < .15) continue;
      const x=foot.hipX+Math.cos(direction+offset)*reach+this.leadX*lead;
      const y=foot.hipY+Math.sin(direction+offset)*reach+this.leadY*lead;
      if(this.solve(foot,x,y)){this.candidateX=x;this.candidateY=y;return;}
    }
    // A chassis already intersecting geometry can leave no valid visual mount.
    // Keep the foot tucked; the view suppresses intersecting segments instead
    // of drawing through a wall or modifying the gameplay collision body.
    this.candidateX=foot.hipX+Math.cos(direction)*20;
    this.candidateY=foot.hipY+Math.sin(direction)*20;
  }

  private planSwing(foot: MechanicalFoot): void {
    foot.routeX[0]=foot.fromX;foot.routeY[0]=foot.fromY;foot.routeLength[0]=0;foot.routeCount=1;
    // A free stride is direct. Around a corner, fold through the already
    // validated knee/shoulder chain before extending along the new chain.
    // This avoids straight-line interpolation through the intervening wall.
    if(!foot.arc&&legSegmentClear(foot.fromX,foot.fromY,foot.toX,foot.toY,this.blockers)){
      foot.routeX[1]=foot.toX;foot.routeY[1]=foot.toY;
      foot.routeLength[1]=Math.hypot(foot.toX-foot.fromX,foot.toY-foot.fromY);foot.routeCount=2;return;
    }
    // Short visibility routes around nearby wall corners. A fixed 32-point
    // scratch buffer avoids a navigation grid or per-foot physics owner.
    let count=0;
    const offer=(x:number,y:number):void=>{
      if(Math.hypot(x-foot.centerX,y-foot.centerY)>140||!legSegmentClear(x,y,x,y,this.blockers))return;
      const cost=Math.hypot(x-foot.fromX,y-foot.fromY)+Math.hypot(x-foot.toX,y-foot.toY);
      let slot=count;
      if(count===32){slot=0;for(let i=1;i<count;i++)if(this.swingCost[i]>this.swingCost[slot])slot=i;if(cost>=this.swingCost[slot])return;}
      else count++;
      this.swingX[slot]=x;this.swingY[slot]=y;this.swingCost[slot]=cost;
    };
    for(let i=0;i<8;i++)offer(foot.centerX+Math.cos(i*Math.PI/4)*36,foot.centerY+Math.sin(i*Math.PI/4)*36);
    for(const b of this.blockers){
      offer(b.x-7,b.y-7);offer(b.x+b.w+7,b.y-7);offer(b.x-7,b.y+b.h+7);offer(b.x+b.w+7,b.y+b.h+7);
    }
    const clear=(ax:number,ay:number,bx:number,by:number):boolean=>{
      const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
      const t=len?Math.max(0,Math.min(1,((foot.centerX-ax)*dx+(foot.centerY-ay)*dy)/len)):0;
      return Math.hypot(ax+dx*t-foot.centerX,ay+dy*t-foot.centerY)>=25
        &&legSegmentClear(ax,ay,bx,by,this.blockers);
    };
    let first=-1,second=-1,best=Infinity;
    for(let i=0;i<count;i++){
      const x=this.swingX[i],y=this.swingY[i];
      if(!clear(foot.fromX,foot.fromY,x,y))continue;
      if(this.swingCost[i]<best&&clear(x,y,foot.toX,foot.toY)){best=this.swingCost[i];first=i;second=-1;}
      for(let j=0;j<count;j++){
        if(i===j)continue;
        const nx=this.swingX[j],ny=this.swingY[j];
        const cost=Math.hypot(x-foot.fromX,y-foot.fromY)+Math.hypot(nx-x,ny-y)+Math.hypot(foot.toX-nx,foot.toY-ny);
        if(cost>=best||!clear(x,y,nx,ny)||!clear(nx,ny,foot.toX,foot.toY))continue;
        best=cost;first=i;second=j;
      }
    }
    if(first>=0){
      foot.routeX[1]=this.swingX[first];foot.routeY[1]=this.swingY[first];
      if(second>=0){foot.routeX[2]=this.swingX[second];foot.routeY[2]=this.swingY[second];}
      const end=second>=0?3:2;foot.routeX[end]=foot.toX;foot.routeY[end]=foot.toY;foot.routeCount=end+1;
      for(let i=1;i<foot.routeCount;i++)foot.routeLength[i]=foot.routeLength[i-1]+Math.hypot(foot.routeX[i]-foot.routeX[i-1],foot.routeY[i]-foot.routeY[i-1]);
      return;
    }
    const targetKneeX=this.candidateKneeX,targetKneeY=this.candidateKneeY;
    foot.routeX[1]=foot.kneeX;foot.routeY[1]=foot.kneeY;
    foot.routeX[2]=foot.hipX;foot.routeY[2]=foot.hipY;
    foot.routeX[3]=targetKneeX;foot.routeY[3]=targetKneeY;
    foot.routeX[4]=foot.toX;foot.routeY[4]=foot.toY;
    for(let i=1;i<5;i++)foot.routeLength[i]=foot.routeLength[i-1]+Math.hypot(foot.routeX[i]-foot.routeX[i-1],foot.routeY[i]-foot.routeY[i-1]);
    foot.routeCount=5;
  }

  private solve(foot: MechanicalFoot, x: number, y: number): boolean {
    const dx=x-foot.hipX,dy=y-foot.hipY,d=Math.hypot(dx,dy);
    if(d<.1||d>108) return false;
    // Short hydraulic reserve avoids popping a planted foot during a reversal.
    // Ordinary gait uses the nominal lengths; this never changes the collider.
    const reserve=Math.max(1,d/88);
    const upper=Math.min(UPPER*reserve,d*.65+12),lower=Math.min(LOWER*reserve,d*.65+12);
    const along=(upper*upper-lower*lower+d*d)/(2*d);
    const height=Math.sqrt(Math.max(0,upper*upper-along*along));
    const preferred=foot.side*(foot.row<0?1:-1);
    for(let branch=0;branch<2;branch++) {
      for(let fold=0;fold<5;fold++) {
        const bend=(branch===0?preferred:-preferred)*(1-fold*.25);
        const kx=foot.hipX+dx/d*along-dy/d*height*bend;
        const ky=foot.hipY+dy/d*along+dx/d*height*bend;
        if(legSegmentClear(foot.hipX,foot.hipY,kx,ky,this.blockers)
          &&legSegmentClear(kx,ky,x,y,this.blockers)){
          this.candidateKneeX=kx;this.candidateKneeY=ky;return true;
        }
      }
    }
    return false;
  }
}
