import Phaser from 'phaser';
import type { DynamicFloorModel, FloorPanel } from './DynamicFloorModel.ts';
interface PanelVisual { panel:FloorPanel;root:Phaser.GameObjects.Container;deck:Phaser.GameObjects.Image;lava:Phaser.GameObjects.Image;lights:Phaser.GameObjects.Rectangle[];embers:Phaser.GameObjects.Image[] }
/** Cached local textures; receiver cover occludes the translating deck in a real storage bay. */
export class DynamicFloorVisual {
  private readonly views:PanelVisual[]=[];
  constructor(scene:Phaser.Scene,private readonly model:DynamicFloorModel,private readonly particles:boolean){
    for(const panel of model.panels){
      const root=scene.add.container(panel.x,panel.y).setDepth(-.3);
      const lava=scene.add.image(panel.w/2,panel.h/2,'floor-lava').setDisplaySize(panel.w,panel.h);
      const embers=Array.from({length:particles?4:0},()=>scene.add.image(0,0,'floor-ember').setDisplaySize(3,3).setBlendMode(Phaser.BlendModes.ADD));
      const deck=scene.add.image(panel.w/2,panel.h/2,'floor-deck').setDisplaySize(panel.w,panel.h).setFlipX(panel.direction<0);
      const receiver=scene.add.image(panel.w/2+panel.direction*panel.w,panel.h/2,'floor-receiver').setDisplaySize(panel.w,panel.h);
      const lights=[scene.add.rectangle(4,10,3,14,0x55a99f),scene.add.rectangle(panel.w-4,10,3,14,0x55a99f),scene.add.rectangle(4,panel.h-10,3,14,0x55a99f),scene.add.rectangle(panel.w-4,panel.h-10,3,14,0x55a99f)];
      root.add([lava,...embers,deck,receiver,...lights]);this.views.push({panel,root,deck,lava,lights,embers});
    }
  }
  update():void {
    const now=this.model.elapsed;
    for(const view of this.views){
      const p=view.panel,warning=p.phase==='warning'||p.phase==='unlock'||p.phase==='restore-warning';
      view.deck.setX(p.w/2+p.offset);
      view.lava.setTint(Phaser.Display.Color.GetColor(255,190+Math.round(Math.sin(now*.003+p.id)*40),180));
      for(const light of view.lights)light.setFillStyle(warning?(p.phase==='restore-warning'?0x59ffc5:0xffb43b):p.gap.w>0?0xff5731:0x55a99f,warning?.45+Math.sin(now*.015)*.45:.7);
      for(let i=0;i<view.embers.length;i++){
        const t=(now*.0003+i*.23+p.id*.07)%1;
        view.embers[i].setPosition(12+(i*29)%Math.max(1,p.w-24),p.h-12-t*(p.h-24)).setAlpha(Math.sin(t*Math.PI)*.8);
      }
    }
  }
  destroy():void{for(const v of this.views)v.root.destroy(true);this.views.length=0;}
  get displayObjectCount():number{return this.views.length*(8+(this.particles?4:0));}
}
