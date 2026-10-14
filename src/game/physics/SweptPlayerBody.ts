import Phaser from 'phaser';
import type { RectSpec } from '../types.ts';
import { resolveSweptCircleMotion } from './SweptCircleCollision.ts';
import { KINETIC } from '../config/kinetic.ts';
import { kineticState, resetKinetic, resolveKineticMotion, steerKinetic,
  type KineticState, type KineticRect, type KineticImpact, type FindKineticTarget, type TraceKineticTravel } from './KineticMotion.ts';

/** Arcade's player body integration with a sweep before committing displacement.
 * World.step calls this for EVERY physics substep, before overlaps/colliders and
 * before postUpdate synchronizes the Sprite. Both worlds share this contract. */
export class SweptPlayerBody extends Phaser.Physics.Arcade.Body {
  // Phaser uses these step deltas for separation and postUpdate, but omits them
  // from its public declarations. They are initialized by the Body constructor.
  declare _dx: number;
  declare _dy: number;
  private readonly blockers: RectSpec[] = [];
  private readonly rectReserve: RectSpec[] = [];
  kinetic: KineticState | null = null;
  impact?: (impact: KineticImpact) => void;
  findKineticTarget?: FindKineticTarget;
  traceTravel?: TraceKineticTravel;
  relocated?: () => void;
  private preserveMomentumOnReset = false;
  private resolvedX = NaN;
  private resolvedY = NaN;
  sweepOnlyWithMomentum = false;

  enableKinetics(mass:number=KINETIC.mass.operative,heavy=false):void {
    this.kinetic=kineticState(mass,heavy);this.mass=mass;this.resolvedX=this.resolvedY=NaN;
  }
  resetMomentum():void {if(this.kinetic)resetKinetic(this.kinetic);}
  override reset(x:number,y:number):void {
    if(!this.preserveMomentumOnReset)this.resetMomentum();
    this.resolvedX=this.resolvedY=NaN;
    super.reset(x,y);
    if(!this.preserveMomentumOnReset)this.relocated?.();
  }
  /** Floor translation is genuine support motion, not a teleport. */
  moveWithSupport(x:number,y:number):void {
    const vx=this.velocity.x,vy=this.velocity.y;this.preserveMomentumOnReset=true;
    try{this.reset(x,y);this.setVelocity(vx,vy);}finally{this.preserveMomentumOnReset=false;}
  }
  externalVelocity(vx:number,vy:number):void {
    this.setVelocity(vx,vy);
    if(this.kinetic)this.kinetic.remaining=this.kinetic.mass===KINETIC.mass.operative?KINETIC.momentumSeconds:KINETIC.enemyMomentumSeconds;
  }
  steer(vx:number,vy:number,dt:number):void {
    const v=this.kinetic?steerKinetic(this.velocity.x,this.velocity.y,vx,vy,dt,this.kinetic):{x:vx,y:vy};
    this.setVelocity(v.x,v.y);
  }

  override update(delta: number): void {
    if (!this.moves || this.directControl || delta <= 0) { super.update(delta); return; }
    const momentum=this.kinetic;
    if(momentum){momentum.clock+=delta;momentum.remaining=Math.max(0,momentum.remaining-delta);}
    if(this.sweepOnlyWithMomentum&&!(momentum?.remaining)){
      this.resolvedX=this.resolvedY=NaN;super.update(delta);return;
    }
    this.prev.copy(this.position);
    if(momentum&&momentum.remaining>0){
      const x=this.drag.x,y=this.drag.y,damping=this.useDamping;
      this.drag.set(Math.exp(-KINETIC.impulseDecayPerSecond));this.useDamping=true;
      this.world.updateMotion(this,delta);this.drag.set(x,y);this.useDamping=damping;
    }else this.world.updateMotion(this, delta);
    let startX = this.position.x + this.halfWidth;
    let startY = this.position.y + this.halfHeight;
    const dx = this.velocity.x * delta;
    const dy = this.velocity.y * delta;
    this.blockers.length = 0;
    const append = (x: number, y: number, w: number, h: number, surface:KineticRect['surface']='inner'): void => {
      const index = this.blockers.length;
      const rect = this.rectReserve[index] ?? (this.rectReserve[index] = { x, y, w, h });
      rect.x = x; rect.y = y; rect.w = w; rect.h = h;
      (rect as KineticRect).surface=surface;
      this.blockers.push(rect);
    };
    if (dx !== 0 || dy !== 0 || (momentum && Number.isFinite(this.resolvedX))) {
      for (const body of this.world.staticBodies.entries) {
        if (body.enable && !body.checkCollision.none) append(body.x, body.y, body.width, body.height,
          body.gameObject?.getData('kineticSurface')??'inner');
      }
      if (this.collideWorldBounds) {
        const b = this.world.bounds;
        append(b.x - 1, b.y - 1, b.width + 2, 1,'outer');
        append(b.x - 1, b.bottom, b.width + 2, 1,'outer');
        append(b.x - 1, b.y - 1, 1, b.height + 2,'outer');
        append(b.right, b.y - 1, 1, b.height + 2,'outer');
      }
    }
    const radius=this.isCircle?this.halfWidth:Math.max(this.halfWidth,this.halfHeight);
    // Arcade separates overlapping dynamic bodies after our sweep. Prevent that
    // correction from pushing the next step through an adjacent solid wall.
    // Explicit resets/teleports and translated floor support clear this anchor.
    if(momentum&&Number.isFinite(this.resolvedX)
      &&Math.hypot(startX-this.resolvedX,startY-this.resolvedY)>KINETIC.cornerEpsilon){
      const corrected=resolveSweptCircleMotion(this.resolvedX,this.resolvedY,startX,startY,radius,this.blockers);
      startX=corrected.x;startY=corrected.y;
    }
    const bounced=momentum?resolveKineticMotion(startX,startY,this.velocity.x,this.velocity.y,radius,delta,this.blockers,
      momentum,this.impact,this.findKineticTarget,this.traceTravel):null;
    const result = bounced?{...bounced,normalX:0,normalY:0,tangentX:undefined,tangentY:undefined}
      :resolveSweptCircleMotion(startX, startY, startX + dx, startY + dy,radius,this.blockers);
    this.position.set(result.x - this.halfWidth, result.y - this.halfHeight);
    this.newVelocity.set(this.position.x - this.prev.x, this.position.y - this.prev.y);
    this._dx = this.newVelocity.x;
    this._dy = this.newVelocity.y;
    if(bounced)this.velocity.set(bounced.vx,bounced.vy);
    else if (result.tangentX !== undefined && result.tangentY !== undefined) {
      this.velocity.set(result.tangentX / delta, result.tangentY / delta);
    } else {
      if (result.normalX && this.velocity.x * result.normalX < 0) this.velocity.x = 0;
      if (result.normalY && this.velocity.y * result.normalY < 0) this.velocity.y = 0;
    }
    this.updateCenter();
    this.angle = Math.atan2(this.velocity.y, this.velocity.x);
    this.speed = this.velocity.length();
    if (this.collideWorldBounds && this.checkWorldBounds() && this.onWorldBounds) {
      const b = this.blocked;
      this.world.emit(Phaser.Physics.Arcade.Events.WORLD_BOUNDS, this, b.up, b.down, b.left, b.right);
    }
    if(momentum){this.resolvedX=this.center.x;this.resolvedY=this.center.y;}
  }
}
