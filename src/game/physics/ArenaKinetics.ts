import Phaser from 'phaser';
import { KINETIC as C } from '../config/kinetic.ts';
import type { Enemy } from '../enemies/Enemy.ts';
import type { UniformSpatialGrid } from '../performance/UniformSpatialGrid.ts';
import { SweptPlayerBody } from './SweptPlayerBody.ts';
import { sweepKineticTarget, type KineticHit, type KineticImpact, type KineticTarget } from './KineticMotion.ts';

type Actor=Phaser.Physics.Arcade.Sprite;
interface Ports {
  player():Actor; bosses():readonly Actor[]; blocked():boolean;
  contact(enemy:Enemy):void; impact(actor:Actor,impact:KineticImpact):void;
  travel(actor:Actor,x:number,y:number,toX:number,toY:number):void;
  relocated(actor:Actor):void;
}
/** Dynamic-contact adapter only. Arcade's existing bodies integrate all motion;
 * the existing navigation grid supplies a bounded broad phase, never all-pairs. */
export class ArenaKinetics {
  private readonly bodies=new Set<SweptPlayerBody>();
  private readonly targets=new WeakMap<Actor,KineticTarget>();
  private subject:Actor|null=null;
  private x=0;private y=0;private dx=0;private dy=0;private radius=0;private dt=0;
  private nearest:KineticHit|null=null;
  private visits=0;private contacts=0;
  peakVisits=0;peakContacts=0;
  constructor(private readonly scene:Phaser.Scene,private readonly grid:UniformSpatialGrid<Enemy>,private readonly ports:Ports){
    scene.events.on(Phaser.Scenes.Events.PRE_UPDATE,this.beginFrame,this);
  }
  private beginFrame():void {
    this.peakVisits=Math.max(this.peakVisits,this.visits);this.peakContacts=Math.max(this.peakContacts,this.contacts);
    this.visits=this.contacts=0;
    for(const body of this.bodies)if(!body.gameObject?.active){this.release(body);this.bodies.delete(body);}
  }
  attach(actor:Actor):void {
    const body=actor.body;if(!(body instanceof SweptPlayerBody))return;
    this.bodies.add(body);
    body.findKineticTarget=(x,y,dx,dy,r,dt)=>this.find(actor,x,y,dx,dy,r,dt);
    body.impact=impact=>this.ports.impact(actor,impact);
    body.traceTravel=(x,y,toX,toY)=>this.ports.travel(actor,x,y,toX,toY);
    body.relocated=()=>this.ports.relocated(actor);
  }
  private target(actor:Actor):KineticTarget {
    let target=this.targets.get(actor);if(target)return target;
    const body=actor.body as Phaser.Physics.Arcade.Body;
    target={get x(){return body.center.x;},get y(){return body.center.y;},
      get vx(){return body.velocity.x;},get vy(){return body.velocity.y;},
      get radius(){return Math.max(body.halfWidth,body.halfHeight);},
      get mass(){return body instanceof SweptPlayerBody?body.kinetic?.mass??1:Infinity;},
      receive:(vx,vy)=>{
        if(body instanceof SweptPlayerBody){body.externalVelocity(vx,vy);actor.setData('floorForcedUntil',this.scene.time.now+C.enemyMomentumSeconds*1000);}
      },
      contact:()=>{
        this.contacts++;
        if(this.subject===this.ports.player()&&'stats' in actor&&!(actor as Enemy).airborne)this.ports.contact(actor as Enemy);
        else if(actor===this.ports.player()&&this.subject&&'stats' in this.subject)this.ports.contact(this.subject as Enemy);
      }};
    this.targets.set(actor,target);return target;
  }
  private readonly visit=(actor:Actor):void=>{
    if(actor===this.subject||!actor.active||!actor.body?.enable||actor.getData('floorFalling'))return;
    if('hp' in actor&&(actor as Enemy).hp<=0)return;
    if('airborne' in actor&&(actor as Enemy).airborne)return;
    const target=this.target(actor),hit=sweepKineticTarget(this.x,this.y,this.dx,this.dy,this.radius,this.dt,target);
    if(hit&&-((this.dx/this.dt-target.vx)*hit.normalX+(this.dy/this.dt-target.vy)*hit.normalY)<C.threshold)return;
    if(hit&&(!this.nearest||hit.time<this.nearest.time))this.nearest={...hit,target};
  };
  private find(actor:Actor,x:number,y:number,dx:number,dy:number,r:number,dt:number):KineticHit|null {
    if(this.ports.blocked()||this.contacts>=C.contactsPerFrame)return null;
    const player=this.ports.player(),isPlayer=actor===player;
    const allowance=Math.min(isPlayer?C.playerNeighborVisitsPerStep:C.enemyNeighborVisitsPerStep,C.neighborVisitsPerFrame-this.visits);
    if(allowance<=0)return null;
    this.subject=actor;this.x=x;this.y=y;this.dx=dx;this.dy=dy;this.radius=r;this.dt=dt;this.nearest=null;
    this.visits+=this.grid.forEachNearby(x+dx*.5,y+dy*.5,Math.hypot(dx,dy)*.5+r+C.dynamicPadding,this.visit,allowance);
    if(isPlayer)for(const boss of this.ports.bosses())this.visit(boss);
    else if(player.active&&player.body?.enable)this.visit(player);
    return this.nearest;
  }
  private release(body:SweptPlayerBody):void {
    body.findKineticTarget=undefined;body.impact=undefined;body.traceTravel=undefined;body.relocated=undefined;body.resetMomentum();
  }
  destroy():void {
    this.scene.events.off(Phaser.Scenes.Events.PRE_UPDATE,this.beginFrame,this);
    for(const body of this.bodies)this.release(body);
    this.bodies.clear();this.subject=null;this.nearest=null;
  }
}
