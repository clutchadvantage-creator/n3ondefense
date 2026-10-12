import { DYNAMIC_FLOOR as C } from '../config/dynamicFloor.ts';
export interface FloorPoint { x:number; y:number }
export interface FloorRect extends FloorPoint { w:number; h:number }
export type FloorPhase='stable'|'warning'|'unlock'|'retracting'|'open'|'restore-warning'|'restoring'|'locking';
export type FloorMode=keyof typeof C.modes;
export interface FloorPanel extends FloorRect {
  id:number; direction:1|-1; phase:FloorPhase; phaseAt:number; offset:number; previousOffset:number;
  gap:FloorRect; deck:FloorRect; previousDeck:FloorRect; openFor:number; navKey:string; returnOffset:number;
}
export interface FloorLayout {
  seed:number; bounds:FloorRect; walls:readonly FloorRect[]; protected:readonly (FloorPoint & {radius:number})[];
}
export const overlaps=(a:FloorRect,b:FloorRect,padding=0):boolean=>a.x<b.x+b.w+padding&&a.x+a.w>b.x-padding&&a.y<b.y+b.h+padding&&a.y+a.h>b.y-padding;
export const circleTouches=(x:number,y:number,r:number,rect:FloorRect):boolean=>rect.w>0&&rect.h>0
  && Math.max(rect.x-x,0,x-rect.x-rect.w)**2+Math.max(rect.y-y,0,y-rect.y-rect.h)**2<r*r+0.00001;
export function sweepRect(x:number,y:number,toX:number,toY:number,r:number,rect:FloorRect):number {
  if(rect.w<=0||rect.h<=0)return 1;
  let enter=0,exit=1;
  const dx=toX-x,dy=toY-y;
  for(let axis=0;axis<2;axis++){
    const p=axis?y:x,d=axis?dy:dx,lo=(axis?rect.y:rect.x)-r,hi=(axis?rect.y+rect.h:rect.x+rect.w)+r;
    if(Math.abs(d)<1e-8){if(p<=lo||p>=hi)return 1;continue;}
    let a=(lo-p)/d,b=(hi-p)/d;if(a>b){const temp=a;a=b;b=temp;}
    enter=Math.max(enter,a);exit=Math.min(exit,b);if(enter>exit)return 1;
  }
  return enter<1&&exit>0?Math.max(0,enter):1;
}
const smooth=(v:number)=>v*v*(3-2*v);
export function floorEnabled(round:number,boss=false):boolean{return C.enabled&&round>C.trainingRounds&&(!boss||C.bossesEnabled);}
export function lavaDamage(kind:'player'|'enemy',maxHp:number):number {
  return kind==='player'?maxHp*C.playerDamageFraction:C.enemyDamageBase+maxHp*C.enemyDamageFraction;
}

/** Geometry and scheduling only. Openings are subsets of their hatch for every intermediate position.
 * Validating the fully open set therefore validates the entire translation, not just endpoints. */
export class DynamicFloorModel {
  readonly panels:FloorPanel[]=[];
  elapsed=0; revision=0; navigationUpdates=0; events=0;
  private nextEventAt:number;
  private sequence:number;
  private readonly cells=new Set<number>();
  private readonly proposed:FloorPanel[]=[];
  readonly layout:FloorLayout;
  readonly mode:FloorMode;
  private readonly validate:(panels:readonly FloorPanel[])=>boolean;
  private readonly cue:(phase:FloorPhase)=>void;
  constructor(layout:FloorLayout,mode:FloorMode,
    validate:(panels:readonly FloorPanel[])=>boolean=()=>true,
    cue:(phase:FloorPhase)=>void=()=>{}) {
    this.layout=layout;this.mode=mode;this.validate=validate;this.cue=cue;
    this.nextEventAt=C.modes[mode].firstDelayMs; this.sequence=layout.seed>>>0;
    const {bounds}=layout, candidates:FloorPanel[]=[];
    for(let row=0,y=bounds.y+100;y+C.panelHeight+90<bounds.y+bounds.h;y+=C.panelHeight+64,row++) {
      for(let col=0,x=bounds.x+100;x+C.panelWidth*2+90<bounds.x+bounds.w;x+=C.panelWidth*2+56,col++) {
        const direction=((row+col)%2?1:-1) as 1|-1;
        const cassette={x,y,w:C.panelWidth*2,h:C.panelHeight};
        if(layout.walls.some(w=>overlaps(cassette,w,C.cassetteMargin)))continue;
        if(layout.protected.some(p=>circleTouches(p.x,p.y,p.radius,cassette)))continue;
        const px=x+(direction===-1?C.panelWidth:0),rect={x:px,y,w:C.panelWidth,h:C.panelHeight};
        candidates.push({...rect,id:candidates.length,direction,phase:'stable',phaseAt:0,offset:0,previousOffset:0,
          gap:{...rect,w:0},deck:{...rect},previousDeck:{...rect},openFor:C.openMs,navKey:'',returnOffset:0});
      }
    }
    // Seeded shuffle, distributed cassettes without overlap. No random work in the update loop.
    for(let i=candidates.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    this.panels.push(...candidates.slice(0,C.maximumCassettes));
  }
  private random():number {this.sequence=(Math.imul(this.sequence,1664525)+1013904223)>>>0;return this.sequence/4294967296;}
  get intensity():number{return Math.min(1,Math.max(0,(this.elapsed-C.modes[this.mode].firstDelayMs)/C.intensityRampMs));}
  get activeCount():number{let n=0;for(const p of this.panels)if(p.phase!=='stable')n++;return n;}
  readonly cellBlocked=(cx:number,cy:number):boolean=>this.cells.has(cy*4096+cx);
  isSupported(x:number,y:number,radius=0,pending=false):boolean {
    for(const p of this.panels){if(pending&&p.phase!=='stable'){if(circleTouches(x,y,radius,p))return false;}
      else if(circleTouches(x,y,radius,p.gap))return false;}
    return true;
  }
  sweep(x:number,y:number,toX:number,toY:number,radius=0,pending=false):number {
    let t=1;for(const p of this.panels)t=Math.min(t,sweepRect(x,y,toX,toY,radius,pending&&p.phase!=='stable'?p:p.gap));return t;
  }
  /** Used only while selecting an event; no mutation until connectivity and rigid anchors pass. */
  startEvent(ids?:readonly number[]):boolean {
    if(this.activeCount)return false;
    this.proposed.length=0;
    const tuning=C.modes[this.mode],count=ids?.length??Math.min(tuning.maximumPanels,1+Math.floor(this.intensity*tuning.maximumPanels));
    const offset=Math.floor(this.random()*Math.max(1,this.panels.length));
    const pattern=this.events%Math.min(tuning.maximumComplexity,1+Math.floor(this.intensity*tuning.maximumComplexity));
    // Late events alternate between a nearby row/cluster and separated openings.
    const ordered=this.panels.slice();
    if(pattern===1&&ordered[offset]){const origin=ordered[offset];ordered.sort((a,b)=>Math.hypot(a.x-origin.x,(a.y-origin.y)*2)-Math.hypot(b.x-origin.x,(b.y-origin.y)*2));}
    for(let i=0;i<ordered.length&&this.proposed.length<count;i++){
      const panel=ordered[(i+(pattern===1?0:offset))%ordered.length];
      if(ids&&!ids.includes(panel.id))continue;
      this.proposed.push(panel);
      const area=this.proposed.length*C.panelWidth*C.panelHeight;
      if(area>this.layout.bounds.w*this.layout.bounds.h*(1-C.minimumSolidFraction)||!this.validate(this.proposed))this.proposed.pop();
    }
    if(!this.proposed.length)return false;
    for(const p of this.proposed){p.openFor=C.openMs+C.extraOpenMs*this.intensity;this.setPhase(p,'warning');}
    this.events++;this.rebuildNavigation();return true;
  }
  private setPhase(p:FloorPanel,phase:FloorPhase):void{if(phase==='restoring')p.returnOffset=p.offset;p.phase=phase;p.phaseAt=this.elapsed;this.cue(phase);}
  /** The caller supplies active gameplay delta only. Zero/pause freezes every phase. */
  update(delta:number,allowEvents=true):void {
    if(delta<=0)return;
    this.elapsed+=Math.min(delta,100); // background-tab resumes never skip warnings or a fall animation
    if(allowEvents&&!this.activeCount&&this.elapsed>=this.nextEventAt){this.startEvent();const t=C.modes[this.mode];this.nextEventAt=this.elapsed+t.intervalMs+(t.minimumIntervalMs-t.intervalMs)*this.intensity;}
    let dirty=false;
    for(const p of this.panels){
      p.previousOffset=p.offset;Object.assign(p.previousDeck,p.deck);
      const age=this.elapsed-p.phaseAt;
      switch(p.phase){
        case 'warning':if(age>=C.warningMs)this.setPhase(p,'unlock');break;
        case 'unlock':if(age>=C.unlockMs)this.setPhase(p,'retracting');break;
        case 'retracting':p.offset=p.direction*p.w*smooth(Math.min(1,age/C.moveMs));if(age>=C.moveMs)this.setPhase(p,'open');break;
        case 'open':if(age>=p.openFor)this.setPhase(p,'restore-warning');break;
        case 'restore-warning':if(age>=C.restoreWarningMs)this.setPhase(p,'restoring');break;
        case 'restoring':p.offset=p.returnOffset*(1-smooth(Math.min(1,age/C.moveMs)));if(age>=C.moveMs){p.offset=0;this.setPhase(p,'locking');}break;
        case 'locking':if(age>=C.lockMs)this.setPhase(p,'stable');break;
      }
      p.deck.x=p.x+p.offset;p.gap.w=Math.abs(p.offset);p.gap.x=p.direction===1?p.x:p.x+p.w-p.gap.w;
      const key=p.phase+':'+Math.ceil(p.gap.w/C.navigationQuantum);
      if(key!==p.navKey){p.navKey=key;dirty=true;}
    }
    if(dirty)this.rebuildNavigation();
  }
  private rebuildNavigation():void {
    this.cells.clear();
    for(const p of this.panels){
      const pending=p.phase==='warning'||p.phase==='unlock';
      const gap=pending?p:p.gap;if(gap.w<=0)continue;
      const pad=C.navigationPadding+C.navigationQuantum,cell=C.navigationCellSize;
      for(let cy=Math.floor((gap.y-pad)/cell);cy<=Math.floor((gap.y+gap.h+pad)/cell);cy++)
        for(let cx=Math.floor((gap.x-pad)/cell);cx<=Math.floor((gap.x+gap.w+pad)/cell);cx++)this.cells.add(cy*4096+cx);
    }
    this.navigationUpdates++;this.revision++;
  }
  /** Unexpected obstruction: warning then return from the current physical offset, never snap. */
  restore():void {
    for(const p of this.panels){if(p.phase==='stable'||p.phase==='locking')continue;
      if(p.offset===0)this.setPhase(p,'locking');else if(p.phase!=='restoring'&&p.phase!=='restore-warning')this.setPhase(p,'restore-warning');}
  }
  reset():void {
    for(const p of this.panels){p.phase='stable';p.offset=p.previousOffset=p.gap.w=0;p.deck.x=p.previousDeck.x=p.x;p.navKey='';}
    this.cells.clear();this.proposed.length=0;this.elapsed=0;this.events=0;this.navigationUpdates=0;
    this.sequence=this.layout.seed>>>0;this.nextEventAt=C.modes[this.mode].firstDelayMs;this.revision++;
  }
}
