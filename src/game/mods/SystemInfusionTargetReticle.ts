import Phaser from 'phaser';
import type { InfusionSelection, SystemInfusionRuntime } from './SystemInfusionRuntime.ts';
import { SYSTEM_INFUSION_TUNING as T } from './SystemInfusions.ts';

/** One reusable floor graphic. Selection belongs to gameplay, never pointer hover. */
export class SystemInfusionTargetReticle {
  private readonly graphic: Phaser.GameObjects.Graphics;
  private target: object | null = null;
  private acquiredAt = 0;
  private last: InfusionSelection | null = null;
  private releasedAt = -Infinity;
  constructor(scene: Phaser.Scene) { this.graphic=scene.add.graphics().setDepth(3.8); }

  update(now:number,runtime:SystemInfusionRuntime):void {
    const selected=runtime.selection, activation=runtime.activation;
    if(selected?.target!==this.target){
      if(selected){this.acquiredAt=now;this.last=selected;}else this.releasedAt=now;
      this.target=selected?.target??null;
    }
    const consumed=activation&&now-activation.at<T.targeting.consumptionMs?activation:null;
    const selection=consumed?.selection??selected??this.last;
    const fade=selected||consumed?1:Math.max(0,1-(now-this.releasedAt)/100);
    this.graphic.clear().setVisible(!!selection&&fade>0);
    if(!selection||fade<=0)return;
    const {x,y}=selection.point;
    const acquire=Math.max(0,1-(now-this.acquiredAt)/T.targeting.acquisitionMs);
    const use=consumed?Math.min(1,(now-consumed.at)/T.targeting.consumptionMs):0;
    const r=selection.radius*(1+.025*Math.sin(now*.004)+acquire*.25-use*.38);
    const alpha=fade*(.64+.12*Math.sin(now*.003))*(consumed?1-use:1);
    const g=this.graphic,color=runtime.placementValid?0x70ffdf:0xff5677;
    g.setPosition(x,y).setAlpha(alpha);
    g.lineStyle(6,color,.12).strokeCircle(0,0,r);
    g.lineStyle(1.4,color,.8).strokeCircle(0,0,r*.76);
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2+now*.00028;
      g.lineStyle(2.5,color,1).beginPath().arc(0,0,r,a+.13,a+1.1).strokePath();
      const angle=i*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),inner=r*.56-acquire*5;
      g.lineStyle(2,0xcafff2,.95).lineBetween(c*inner,s*inner,c*(r+9),s*(r+9));
      g.lineBetween(c*(r+9)-s*9,s*(r+9)+c*9,c*(r+9)+s*9,s*(r+9)-c*9);
    }
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8-now*.00018,outer=r*.91,c=Math.cos(a),s=Math.sin(a);
      g.lineStyle(1,color,.6).lineBetween(c*outer,s*outer,c*(outer-3),s*(outer-3));
    }
    if(acquire>0||consumed)g.lineStyle(3,0xffffff,Math.max(acquire,use)*.7).strokeCircle(0,0,r*(1+use*.6));
    const placement=runtime.placementPoint;
    if(placement){const px=placement.x-x,py=placement.y-y;g.lineStyle(1.5,color,.8).strokeRect(px-12,py-12,24,24);}
  }
  destroy():void { this.graphic.destroy();this.last=null;this.target=null; }
}
