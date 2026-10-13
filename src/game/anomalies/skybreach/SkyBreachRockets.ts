import Phaser from 'phaser';
import type { Enemy } from '../../enemies/Enemy.ts';
import { advanceRocket, createRocketMotion, type RocketMotion } from './SkyBreachRocketMotion.ts';

interface RocketSlot {
  motion:RocketMotion<Enemy>|null; damage:number; radius:number; magneticDelay:number; detonateAt:number;
  sprite:Phaser.GameObjects.Image; exhaust:Phaser.GameObjects.Image;
}
export class SkyBreachRockets {
  private readonly slots:RocketSlot[];
  constructor(scene:Phaser.Scene) {
    this.slots=Array.from({length:32},()=>({motion:null,damage:0,radius:0,magneticDelay:0,detonateAt:0,
      sprite:scene.add.image(-1000,-1000,'sky-player-rocket').setDisplaySize(18,39).setDepth(9).setVisible(false),
      exhaust:scene.add.image(-1000,-1000,'sky-exhaust').setDisplaySize(12,42).setDepth(8).setVisible(false)
        .setTint(0xffc478).setBlendMode(Phaser.BlendModes.ADD)}));
  }
  get available():number { let n=0;for(const s of this.slots)if(!s.motion)n++;return n; }
  launch(x:number,y:number,angle:number,now:number,armMs:number,damage:number,radius:number,magneticDelay:number,delay=0):void {
    const slot=this.slots.find(s=>!s.motion);
    if(!slot)throw new Error('Rocket capacity must be checked before spending a charge');
    slot.motion=createRocketMotion<Enemy>(x,y,angle,now,armMs,delay);
    slot.damage=damage;slot.radius=radius;slot.magneticDelay=magneticDelay;slot.detonateAt=0;
  }
  update(now:number,dt:number,targets:readonly Enemy[],valid:(e:Enemy)=>boolean,
    explode:(x:number,y:number,radius:number,damage:number)=>void,pull:(x:number,y:number)=>void):void {
    for(const slot of this.slots){
      const r=slot.motion;if(!r)continue;
      if(slot.detonateAt>0){
        if(now>=slot.detonateAt){explode(r.x,r.y,slot.radius,slot.damage);this.retire(slot);continue;}
        pull(r.x,r.y);
      }else{
        const result=advanceRocket(r,now,dt,targets,valid);
        if(result==='expired'){this.retire(slot);continue;}
        if(result==='impact'){
          if(slot.magneticDelay>0)slot.detonateAt=now+slot.magneticDelay;
          else {explode(r.x,r.y,slot.radius,slot.damage);this.retire(slot);continue;}
        }
      }
      const visible=now>=r.launchAt;
      slot.sprite.setVisible(visible).setPosition(r.x,r.y).setRotation(r.angle+Math.PI/2);
      slot.exhaust.setVisible(visible).setPosition(r.x-Math.cos(r.angle)*29,r.y-Math.sin(r.angle)*29)
        .setRotation(r.angle+Math.PI/2).setAlpha(slot.detonateAt>0?.35+.25*Math.sin(now*.035):.85);
    }
  }
  private retire(slot:RocketSlot):void {slot.motion=null;slot.sprite.setVisible(false);slot.exhaust.setVisible(false);}
  discardReferences():void {for(const slot of this.slots)slot.motion=null;this.slots.length=0;}
}
