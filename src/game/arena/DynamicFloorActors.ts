import { DYNAMIC_FLOOR as C } from '../config/dynamicFloor.ts';
import { DynamicFloorModel, lavaDamage, type FloorPoint } from './DynamicFloorModel.ts';
export type FloorActorKind='player'|'enemy'|'object';
/** A driver wraps an existing actor, never owns its health, collisions, or destruction. */
export interface FloorActorDriver {
  readonly x:number; readonly y:number; readonly radius:number; readonly active:boolean; readonly maxHp:number;
  readonly kind:FloorActorKind; readonly airborne:boolean; readonly crossing:boolean;
  readonly forcedMovement?:boolean;
  move(x:number,y:number):void;
  halt(falling:boolean):void;
  present(scale:number,alpha:number,descent:number):void;
  impact(damage:number):void;
}
interface Rider {
  x:number;y:number;crossing:boolean; stage:'ground'|'fall'|'eject';at:number;protectedUntil:number;
  originX:number;originY:number;landing:FloorPoint|null;seen:number;
}
export interface FloorActorPorts {
  validGround(x:number,y:number,radius:number):boolean;
  clearMotion(x:number,y:number,toX:number,toY:number,radius:number):boolean;
  impact?(x:number,y:number,kind:FloorActorKind):void;
  eject?(x:number,y:number,kind:FloorActorKind):void;
}

/** Deterministic support/fall/recovery, independent of rendering and tested with real model geometry. */
export class DynamicFloorActors {
  private readonly riders=new Map<FloorActorDriver,Rider>();
  private frame=0;
  readonly floor:DynamicFloorModel;
  private readonly ports:FloorActorPorts;
  constructor(floor:DynamicFloorModel,ports:FloorActorPorts){this.floor=floor;this.ports=ports;}
  beginFrame():void{this.frame++;}
  isFalling(actor:FloorActorDriver):boolean {return this.riders.get(actor)?.stage!=='ground'&&this.riders.has(actor);}
  relocated(actor:FloorActorDriver):void {const state=this.riders.get(actor);if(state){state.x=actor.x;state.y=actor.y;state.crossing=true;}}
  private safe(x:number,y:number,r:number):boolean{return this.floor.isSupported(x,y,r,true)&&this.ports.validGround(x,y,r);}
  private landing(x:number,y:number,r:number):FloorPoint|null {
    // Small deterministic local search. Called once per impact, never a map-wide teleport.
    for(let distance=C.recoveryStep;distance<=C.recoveryRadius;distance+=C.recoveryStep){
      for(let i=0;i<16;i++){
        const angle=i*Math.PI/8,px=x+Math.cos(angle)*distance,py=y+Math.sin(angle)*distance;
        if(!this.safe(px,py,r)||!this.ports.clearMotion(x,y,px,py,r))continue;
        let occupied=false;
        for(const [other,state] of this.riders)if(other.active&&state.stage==='ground'&&Math.hypot(other.x-px,other.y-py)<other.radius+r+4){occupied=true;break;}
        if(!occupied)return {x:px,y:py};
      }
    }
    return null;
  }
  update(actor:FloorActorDriver):void {
    if(!actor.active){actor.present(1,1,0);actor.halt(false);this.riders.delete(actor);return;}
    const now=this.floor.elapsed,r=actor.radius;
    let state=this.riders.get(actor);
    if(!state){state={x:actor.x,y:actor.y,crossing:actor.crossing,stage:'ground',at:now,protectedUntil:0,originX:actor.x,originY:actor.y,landing:null,seen:this.frame};this.riders.set(actor,state);}
    state.seen=this.frame;
    if(actor.airborne){state.x=actor.x;state.y=actor.y;return;}
    if(state.stage==='fall'){
      actor.halt(true);
      const t=Math.min(1,(now-state.at)/C.fallMs);actor.present(1-t*.65,1-t*.7,t*30);
      if(t>=1){
        actor.impact(actor.kind==='object'?Infinity:now>=state.protectedUntil?lavaDamage(actor.kind,actor.maxHp):0);
        state.protectedUntil=now+C.environmentalProtectionMs;
        this.ports.impact?.(state.originX,state.originY,actor.kind);
        if(!actor.active){actor.present(1,1,0);actor.halt(false);this.riders.delete(actor);return;}
        state.stage='eject';state.at=now;state.landing=this.landing(state.originX,state.originY,r);
        if(!state.landing)this.floor.restore();
        else this.ports.eject?.(actor.x,actor.y,actor.kind);
      }
      return;
    }
    if(state.stage==='eject'){
      actor.halt(true);
      if(!state.landing||!this.safe(state.landing.x,state.landing.y,r)){
        state.landing=this.landing(state.originX,state.originY,r);state.at=now;
        if(!state.landing){this.floor.restore();return;}
        this.ports.eject?.(actor.x,actor.y,actor.kind);
      }
      const t=Math.min(1,(now-state.at)/C.ejectionMs),ease=t*t*(3-2*t);
      actor.move(state.originX+(state.landing.x-state.originX)*ease,state.originY+(state.landing.y-state.originY)*ease);
      actor.present(.35+.65*t,.3+.7*t,-Math.sin(t*Math.PI)*C.ejectionHeight);
      if(t>=1){actor.present(1,1,0);actor.halt(false);state.stage='ground';state.x=actor.x;state.y=actor.y;state.crossing=false;}
      return;
    }
    if(!actor.crossing&&!state.crossing){
      // The receiver is stationary floor over a recessed storage channel. Riders step onto it;
      // they never get dragged through a wall or continue moving after leaving the deck.
      for(const panel of this.floor.panels){
        const delta=panel.offset-panel.previousOffset;if(delta===0)continue;
        const d=panel.previousDeck;
        if(state.x-r<d.x||state.x+r>d.x+d.w||state.y-r<d.y||state.y+r>d.y+d.h)continue;
        if(state.x+r<panel.x||state.x-r>panel.x+panel.w)continue;
        if(this.ports.clearMotion(actor.x,actor.y,actor.x+delta,actor.y,r)){
          actor.move(actor.x+delta,actor.y);state.x+=delta;
        }
        break;
      }
    }
    if(actor.crossing){state.x=actor.x;state.y=actor.y;state.crossing=true;return;}
    const supported=this.floor.isSupported(actor.x,actor.y,r);
    const sweep=state.crossing?1:this.floor.sweep(state.x,state.y,actor.x,actor.y,r);
    if(!supported||sweep<1){
      // Walking enemies avoid a new edge; removal under their feet or a push from
      // unsupported ground still makes them fall. Players intentionally step off.
      if(actor.kind==='enemy'&&!actor.forcedMovement&&this.floor.isSupported(state.x,state.y,r)&&sweep<1){
        const t=Math.max(0,sweep-.02);actor.move(state.x+(actor.x-state.x)*t,state.y+(actor.y-state.y)*t);actor.halt(false);
      }else{
        if(sweep<1&&supported){const t=Math.min(1,sweep+.03);actor.move(state.x+(actor.x-state.x)*t,state.y+(actor.y-state.y)*t);}
        state.originX=actor.x;state.originY=actor.y;state.at=now;state.stage='fall';actor.halt(true);
      }
    }
    state.x=actor.x;state.y=actor.y;state.crossing=false;
  }
  endFrame():void {for(const [actor,state] of this.riders)if(!actor.active||state.seen!==this.frame){actor.present(1,1,0);actor.halt(false);this.riders.delete(actor);}}
  reset():void {for(const [actor,state] of this.riders)if(actor.active&&state.stage!=='ground'){actor.present(1,1,0);actor.halt(false);}this.riders.clear();}
}
