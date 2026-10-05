import Phaser from 'phaser';
import { TUG_STEAM_TEXTURE, TUG_WHISTLE_TEXTURE, TUG_WHISTLE_BURST_MS, TUG_WHISTLE_LIFETIME_MS } from './TugLifeWhistleArt.ts';

/** Fixed sprite budget; no per-frame allocations, physics bodies or new tweens. */
export class TugLifeWhistleVisual {
  readonly root: Phaser.GameObjects.Container;
  private readonly whistle: Phaser.GameObjects.Image;
  private readonly steam: Phaser.GameObjects.Image[];
  constructor(scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(18).setVisible(false);
    this.whistle = scene.add.image(0, 0, TUG_WHISTLE_TEXTURE).setOrigin(.5, .94);
    this.steam = Array.from({length:14}, () => scene.add.image(0, 0, TUG_STEAM_TEXTURE).setVisible(false));
    this.root.add([this.whistle, ...this.steam]);
  }
  update(x: number, y: number, radius: number, elapsed: number, reduced: boolean): void {
    const clamp = Phaser.Math.Clamp;
    const pressure = clamp(elapsed / TUG_WHISTLE_BURST_MS, 0, 1);
    const fade = 1 - clamp((elapsed - 2350) / (TUG_WHISTLE_LIFETIME_MS - 2350), 0, 1);
    const scale = radius / 240;
    this.root.setPosition(x,y).setVisible(elapsed < TUG_WHISTLE_LIFETIME_MS).setAlpha(fade);
    this.whistle.setScale(scale*.5*(.72+pressure*.28),scale*.5*(.35+pressure*.65))
      .setAngle(Math.sin(elapsed*.055)*Math.sin(pressure*Math.PI)*2).setAlpha(clamp(elapsed/120,0,1));
    const count = reduced ? 8 : this.steam.length;
    for (let i=0;i<this.steam.length;i++) {
      const age = elapsed - TUG_WHISTLE_BURST_MS - i*78;
      const puff = this.steam[i];
      if(i>=count || age<0 || age>1900){puff.setVisible(false);continue;}
      const t=age/1900, side=i%2?1:-1;
      puff.setVisible(true).setPosition(side*radius*(.12+t*(.6+(i%3)*.13)), -radius*(.67+t*(.7+(i%4)*.13)))
        .setScale(scale*(.16+t*1.5),scale*(.18+t*1.3))
        .setAngle(side*(t*22+i*3)).setAlpha(Math.min(1,age/80)*(1-t)*.85);
    }
  }
  hide(): void { this.root.setVisible(false); }
  destroy(): void { this.root.destroy(); }
}
