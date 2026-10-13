import Phaser from 'phaser';
import type { MechanicalDestructionVfx } from '../../vfx/MechanicalDestructionVfx.ts';

interface WeaponBurst {
  active: boolean; at: number; stage: number; size: number; x: number; y: number;
  anchor: {x:number;y:number} | null;
  ring: Phaser.GameObjects.Image; flash: Phaser.GameObjects.Image;
  fire: Phaser.GameObjects.Image; barrel: Phaser.GameObjects.Image;
  smoke: Phaser.GameObjects.Image[];
}

/** Eight fixed celebrations, cached textures, scene clock, no timers or physics. */
export class SkyBreachDestruction {
  private readonly slots: WeaponBurst[];
  constructor(scene: Phaser.Scene, private readonly debris: MechanicalDestructionVfx, particles: boolean) {
    const image = (texture: string, depth = 13) => scene.add.image(-1000,-1000,texture).setDepth(depth).setVisible(false);
    this.slots = Array.from({length:8}, () => ({active:false,at:0,stage:0,size:1,x:0,y:0,anchor:null,
      ring:image('sky-shock-ring').setBlendMode(Phaser.BlendModes.ADD),
      flash:image('sky-exhaust').setBlendMode(Phaser.BlendModes.ADD),
      fire:image('sky-exhaust').setTint(0xff973c).setBlendMode(Phaser.BlendModes.ADD),
      barrel:image('sky-cannon'), smoke:Array.from({length:particles?3:1},()=>image('sky-smoke',14))}));
  }
  emit(anchor: {x:number;y:number}, now: number, boss: boolean): void {
    const slot=this.slots.find(s=>!s.active) ?? this.slots.reduce((a,b)=>a.at<b.at?a:b);
    slot.active=true;slot.at=now;slot.stage=0;slot.size=boss?1.35:1;slot.anchor=anchor;
    slot.x=anchor.x;slot.y=anchor.y;
    this.debris.emitBossStage('artillery',anchor.x,anchor.y,0xffae66,now,false);
    this.updateSlot(slot,now);
  }
  update(now: number): void { for(const slot of this.slots)if(slot.active)this.updateSlot(slot,now); }
  private updateSlot(s: WeaponBurst, now: number): void {
    const age=now-s.at, life=age/1550, x=s.anchor?.x??s.x,y=s.anchor?.y??s.y,k=s.size;
    if(life>=1){
      s.active=false;s.anchor=null;
      for(const image of [s.ring,s.flash,s.fire,s.barrel,...s.smoke])image.setVisible(false);
      return;
    }
    if(age>=140&&s.stage===0){
      s.stage=1;this.debris.emitBossStage('artillery',x+14*k,y-8*k,0x80eaff,now,false);
    }
    const wave=Math.min(1,age/600);
    s.ring.setVisible(age<600).setPosition(x,y).setDisplaySize((18+wave*192)*k,(12+wave*115)*k).setAlpha((1-wave)*.95);
    s.flash.setVisible(age<180).setPosition(x,y).setDisplaySize((80+wave*160)*k,110*k).setAlpha(Math.max(0,1-age/180));
    const flame=Math.max(0,1-age/720);
    s.fire.setVisible(flame>0).setPosition(x,y-22*k).setDisplaySize((34+flame*38)*k,(65+flame*95)*k)
      .setRotation(Math.PI).setAlpha(flame*.8);
    // A recognizable cannon assembly tears free, tumbles, then sinks through smoke.
    const t=age/1000,side=s.x%2<1?-1:1;
    s.barrel.setVisible(age<950).setPosition(s.x+side*t*92*k,s.y-160*t+185*t*t)
      .setRotation(t*side*7).setDisplaySize(40*k,40*k).setTint(0x718b9a).setAlpha(Math.max(0,1-t));
    s.smoke.forEach((image,i)=>{
      const p=Math.max(0,(age-i*90)/1550);
      image.setVisible(age>i*90).setPosition(x+(i-1)*18*k+Math.sin(p*3+i)*12,y-20-72*p-i*10)
        .setDisplaySize((32+92*p)*k,(42+104*p)*k).setAlpha(Math.sin(Math.min(1,p)*Math.PI)*.75);
    });
  }
  discardReferences(): void { for(const slot of this.slots)slot.anchor=null;this.slots.length=0; }
}
