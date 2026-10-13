import Phaser from 'phaser';
import type { FloorActorDriver } from './DynamicFloorActors.ts';

interface RecoveryFlare {
  actor:FloorActorDriver|null; descent:number; until:number; nextPuff:number; landed:boolean;
  flame:Phaser.GameObjects.Image; halo:Phaser.GameObjects.Image;
}
interface Cinder {
  image:Phaser.GameObjects.Image; born:number; life:number; x:number;y:number;vx:number;vy:number;size:number;smoke:boolean;
}
interface Shock {image:Phaser.GameObjects.Image;born:number;size:number;}

/** Prewarmed sprite pools and the floor's active clock. No live tessellation,
 * physics, texture generation, timers, or per-launch display objects. */
export class LavaRecoveryVfx {
  private readonly flares:RecoveryFlare[]=[];
  private readonly cinders:Cinder[]=[];
  private readonly shocks:Shock[]=[];
  private cursor=0;private shockCursor=0;
  constructor(scene:Phaser.Scene,private readonly particles:boolean){
    for(let i=0;i<(particles?6:3);i++)this.flares.push({actor:null,descent:0,until:0,nextPuff:0,landed:false,
      flame:scene.add.image(0,0,'floor-flame').setDepth(12.6).setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
      halo:scene.add.image(0,0,'floor-flame').setDepth(7.6).setBlendMode(Phaser.BlendModes.ADD).setVisible(false)});
    for(let i=0;i<(particles?72:24);i++)this.cinders.push({image:scene.add.image(0,0,'floor-ember').setDepth(12.5).setVisible(false),
      born:-Infinity,life:1,x:0,y:0,vx:0,vy:0,size:1,smoke:false});
    for(let i=0;i<4;i++)this.shocks.push({image:scene.add.image(0,0,'floor-shock').setDepth(7.4).setBlendMode(Phaser.BlendModes.ADD).setVisible(false),born:-Infinity,size:1});
  }
  launch(actor:FloorActorDriver,now:number):void {
    let slot=this.flares.find(s=>s.actor===actor)??this.flares.find(s=>!s.actor);
    if(!slot){slot=this.flares.filter(s=>s.actor?.kind!=='player').sort((a,b)=>a.until-b.until)[0];}
    if(!slot)return;
    slot.actor=actor;slot.descent=0;slot.until=now+1600;slot.nextPuff=now;slot.landed=false;
    this.burst(actor.x,actor.y,actor.radius,now,true);
  }
  flight(actor:FloorActorDriver,descent:number):void {
    const slot=this.flares.find(s=>s.actor===actor);if(slot)slot.descent=descent;
  }
  land(actor:FloorActorDriver,now:number):void {
    const slot=this.flares.find(s=>s.actor===actor);if(slot){slot.descent=0;slot.landed=true;slot.until=now+460;}
    this.burst(actor.x,actor.y,actor.radius*.7,now,false);
  }
  private particle(x:number,y:number,vx:number,vy:number,size:number,now:number,smoke:boolean):void {
    const p=this.cinders[this.cursor++%this.cinders.length];
    p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.size=size;p.born=now;p.life=smoke?720:520;p.smoke=smoke;
    p.image.setTexture(smoke?'floor-smoke':'floor-ember').setBlendMode(smoke?Phaser.BlendModes.NORMAL:Phaser.BlendModes.ADD).setVisible(true);
  }
  private burst(x:number,y:number,radius:number,now:number,launch:boolean):void {
    const ring=this.shocks[this.shockCursor++%this.shocks.length];ring.born=now;ring.size=60+radius*1.8;ring.image.setPosition(x,y).setVisible(true);
    const n=this.particles?14:6;
    for(let i=0;i<n;i++){
      const angle=i/n*Math.PI*2,speed=45+(i%3)*25;
      this.particle(x,y,Math.cos(angle)*speed,Math.sin(angle)*speed-(launch?105:25),2+i%3,now,false);
    }
  }
  update(now:number):void {
    for(const s of this.flares){
      const actor=s.actor;
      if(!actor?.active||now>=s.until){s.actor=null;s.flame.setVisible(false);s.halo.setVisible(false);continue;}
      const fade=Math.min(1,(s.until-now)/460),size=38+actor.radius*1.8;
      const pulse=1+Math.sin(now*.035)*.12,x=actor.x,y=actor.y+s.descent;
      s.flame.setVisible(true).setPosition(x,y-8).setDisplaySize(size*pulse,size*1.4).setAlpha(fade*(s.landed?.42:.65)).setRotation(Math.sin(now*.018)*.15);
      s.halo.setVisible(true).setPosition(x,y+4).setDisplaySize(size*1.35,size*.7).setAlpha(fade*.24).setRotation(Math.PI);
      if(now>=s.nextPuff){
        s.nextPuff=now+(this.particles?45:100);
        this.particle(x,y,Math.sin(now*.017)*22,-42,size*.55,now,true);
        if(this.particles)this.particle(x,y,Math.cos(now*.021)*45,-75,3,now,false);
      }
    }
    for(const p of this.cinders){
      const t=(now-p.born)/p.life;if(t<0||t>=1){p.image.setVisible(false);continue;}
      const seconds=t*p.life/1000,size=p.size*(p.smoke?1+t*1.3:1-t*.5);
      p.image.setPosition(p.x+p.vx*seconds,p.y+p.vy*seconds+(p.smoke?0:90*seconds*seconds))
        .setDisplaySize(size,size).setAlpha((1-t)*(p.smoke?.72:1)).setRotation(p.smoke?t*.5:t*5);
    }
    for(const s of this.shocks){
      const t=(now-s.born)/380;if(t<0||t>=1){s.image.setVisible(false);continue;}
      s.image.setDisplaySize(s.size*(.3+t*1.6),s.size*(.15+t*.8)).setAlpha((1-t)**2);
    }
  }
  destroy():void {
    for(const s of this.flares){s.actor=null;s.flame.destroy();s.halo.destroy();}
    for(const p of this.cinders)p.image.destroy();for(const s of this.shocks)s.image.destroy();
  }
  get displayObjectCount():number{return this.flares.length*2+this.cinders.length+this.shocks.length;}
}
