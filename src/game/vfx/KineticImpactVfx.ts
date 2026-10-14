import Phaser from 'phaser';
import { KINETIC as C } from '../config/kinetic.ts';
import type { KineticImpact } from '../physics/KineticMotion.ts';
import { AudioManager } from '../systems/AudioManager.ts';

interface Pulse {at:number;active:boolean;x:number;y:number;nx:number;ny:number;strength:number;ghost:Phaser.GameObjects.Image}
/** Fixed impact slots and one batched layer; deformation is a cosmetic afterimage
 * so Arcade's real circle, equipped texture and floor presentation never resize. */
export class KineticImpactVfx {
  private readonly graphics:Phaser.GameObjects.Graphics;
  private readonly pulses:Pulse[];
  private nextSound=0;
  constructor(scene:Phaser.Scene,private particles:boolean){
    this.graphics=scene.add.graphics().setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
    this.pulses=Array.from({length:C.presentation.slots},()=>({at:0,active:false,x:0,y:0,nx:0,ny:0,strength:0,
      ghost:scene.add.image(0,0,'pixel').setDepth(8.5).setVisible(false).setBlendMode(Phaser.BlendModes.ADD)}));
  }
  setParticles(enabled:boolean):void {
    this.particles=enabled;
    if(!enabled)for(const pulse of this.pulses)pulse.ghost.setVisible(false);
  }
  emit(actor:Phaser.Physics.Arcade.Sprite,impact:KineticImpact,now:number):void {
    if(impact.speed<C.presentation.minimumSpeed)return;
    const p=this.pulses.find(p=>!p.active)??this.pulses.reduce((a,b)=>a.at<b.at?a:b);
    p.active=true;p.at=now;p.x=impact.x;p.y=impact.y;p.nx=impact.nx;p.ny=impact.ny;
    p.strength=Math.min(1,impact.speed/C.presentation.fullSpeed);
    p.ghost.setTexture(actor.texture.key,actor.frame.name).setPosition(actor.x,actor.y).setRotation(actor.rotation)
      .setOrigin(actor.originX,actor.originY).setDisplaySize(actor.displayWidth*(1+C.presentation.stretch*p.strength),
        actor.displayHeight*(1-C.presentation.squash*p.strength)).setVisible(this.particles).setAlpha(.45);
    if(C.impactSound&&impact.speed>=C.presentation.audioThreshold&&now>=this.nextSound){
      AudioManager.get().playSfx(C.impactSound);this.nextSound=now+C.presentation.audioCooldownMs;
    }
  }
  update(now:number):void {
    const g=this.graphics;g.clear();
    for(const p of this.pulses){
      if(!p.active)continue;const t=Math.max(0,(now-p.at)/C.presentation.durationMs);
      if(t>=1){p.active=false;p.ghost.setVisible(false);continue;}
      const fade=1-t,size=6+p.strength*15;
      g.lineStyle(2,0x70f5ff,fade*.8);g.strokeEllipse(p.x,p.y,size*(1+t*4),size*(.6+t*2));
      g.fillStyle(0xe5fdff,Math.max(0,1-t*4));g.fillCircle(p.x,p.y,4+size*.2);
      if(this.particles){
        for(let i=-2;i<=2;i++){
          const spread=i*.35,dx=p.nx-p.ny*spread,dy=p.ny+p.nx*spread;
          const travel=(10+t*60)*(1+p.strength),length=(4+size)*fade;
          g.lineStyle(i%2===0?2:1,i%2===0?0xffc967:0x76ecff,fade*.8);
          g.lineBetween(p.x+dx*travel,p.y+dy*travel,p.x+dx*(travel+length),p.y+dy*(travel+length));
        }
        p.ghost.setAlpha(fade*fade*.4);
      }
    }
  }
  reset():void {if(this.graphics.scene)this.graphics.clear();for(const p of this.pulses){p.active=false;if(p.ghost.scene)p.ghost.setVisible(false);}}
  destroy():void {this.reset();if(this.graphics.scene)this.graphics.destroy();for(const p of this.pulses)if(p.ghost.scene)p.ghost.destroy();this.pulses.length=0;}
}
