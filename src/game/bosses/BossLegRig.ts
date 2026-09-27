import Phaser from 'phaser';
import type { RectSpec } from '../types.ts';
import type { BossArchetype } from '../config/bossBalance.ts';
import { BossLegLocomotion, legSegmentClear } from './BossLegLocomotion.ts';

/** Renderer for the source model's shoulder/knee/foot parts; no new simulation owner. */
export class BossLegRig {
  readonly locomotion: BossLegLocomotion;
  readonly root: Phaser.GameObjects.Container;
  private readonly parts: Array<{upper:Phaser.GameObjects.Image;lower:Phaser.GameObjects.Image;foot:Phaser.GameObjects.Image;shadow:Phaser.GameObjects.Image;hip:Phaser.GameObjects.Image;knee:Phaser.GameObjects.Image;hasPose:boolean}>;
  constructor(scene: Phaser.Scene, archetype: BossArchetype, blockers: readonly RectSpec[]) {
    this.locomotion=new BossLegLocomotion(archetype==='storm-mage'?4:6,blockers);
    this.root=scene.add.container(0,0).setDepth(8.9);
    this.parts=this.locomotion.feet.map(()=>{
      const upper=scene.add.image(0,0,`rwg-${archetype}-leg-upper`).setOrigin(.5-.26/1.2,.5);
      const lower=scene.add.image(0,0,`rwg-${archetype}-leg-lower`).setOrigin(.5-.22/1.2,.5);
      const foot=scene.add.image(0,0,`rwg-${archetype}-leg-foot`).setDisplaySize(24,24);
      const hip=scene.add.image(0,0,`rwg-${archetype}-leg-joint`).setDisplaySize(24,24);
      const knee=scene.add.image(0,0,`rwg-${archetype}-leg-joint`).setDisplaySize(24,24);
      const shadow=scene.add.image(0,0,'circle').setTint(0x000000).setDisplaySize(15,7).setAlpha(.3);
      this.root.add([shadow,upper,lower,hip,knee,foot]);return {upper,lower,foot,shadow,hip,knee,hasPose:false};
    });
  }
  update(x:number,y:number,aim:number,now:number,brace:number,alpha:number):number {
    this.locomotion.update(x,y,aim,now,brace);
    this.root.setAlpha(alpha);
    for(let i=0;i<this.parts.length;i++){
      const f=this.locomotion.feet[i],p=this.parts[i];
      // Retain the last clear world-space pose during brief corner constraints.
      // Blinking an entire leg off for a rejected intermediate pose is worse.
      if(!f.valid){
        if(!p.hasPose){p.upper.setVisible(false);p.lower.setVisible(false);p.foot.setVisible(false);p.shadow.setVisible(false);p.hip.setVisible(false);p.knee.setVisible(false);}
        continue;
      }
      p.hasPose=true;
      let lift=f.lift*7;
      if(!legSegmentClear(f.hipX,f.hipY,f.kneeX,f.kneeY-lift*.45,this.locomotion.blockers,6)
        ||!legSegmentClear(f.kneeX,f.kneeY-lift*.45,f.x,f.y-lift,this.locomotion.blockers,6))lift=0;
      // Screen-space elevation separates the foot from its ground-contact shadow.
      const ky=f.kneeY-lift*.45,fy=f.y-lift;
      const ua=Math.atan2(ky-f.hipY,f.kneeX-f.hipX),la=Math.atan2(fy-ky,f.x-f.kneeX);
      const ul=Math.hypot(f.kneeX-f.hipX,ky-f.hipY),ll=Math.hypot(f.x-f.kneeX,fy-ky);
      p.upper.setPosition(f.hipX,f.hipY).setRotation(ua).setDisplaySize(ul*1.2/Math.hypot(.54,.13),30).setVisible(true);
      p.lower.setPosition(f.kneeX,ky).setRotation(la).setDisplaySize(ll*1.2/Math.hypot(.41,.18),30).setVisible(true);
      p.hip.setPosition(f.hipX,f.hipY).setVisible(true);
      p.knee.setPosition(f.kneeX,ky).setVisible(true);
      p.foot.setPosition(f.x,fy).setRotation(la).setVisible(f.valid);
      p.shadow.setPosition(f.x+2,f.y+3).setAlpha(.3-f.lift*.14).setVisible(f.valid);
    }
    return this.locomotion.heading;
  }
  setVisible(visible:boolean):void {this.root.setVisible(visible);}
  defeat():void {for(const p of this.parts){p.upper.setTint(0x8c8c9a);p.lower.setTint(0x8c8c9a);p.foot.setTint(0x8c8c9a);p.hip.setTint(0x8c8c9a);p.knee.setTint(0x8c8c9a);}}
  destroy():void {this.root.destroy(true);}
}
