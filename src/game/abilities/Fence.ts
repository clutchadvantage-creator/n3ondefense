import Phaser from 'phaser';
import { fenceTexture, resolveFenceAppearance, type FenceAppearance } from '../cosmetics/FenceCosmetics.ts';

/** A rigid combat segment. Art never changes its endpoints, obstruction or health. */
export class Fence {
  readonly sprite: Phaser.GameObjects.Container;
  readonly width: number;
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
  readonly appearance: FenceAppearance;
  hp: number; dps: number; slowFactor: number; expiresAt: number;
  private readonly born: number;
  private readonly maximumHp: number;
  private previousHp: number;
  private shockUntil = 0;
  private damageUntil = 0;
  private color: number;
  private readonly beams: Phaser.GameObjects.Rectangle[] = [];
  private readonly pips: Phaser.GameObjects.Image[] = [];
  private readonly pylons: Phaser.GameObjects.Image[] = [];
  private readonly glow: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, angle: number, color: number, width: number,
    durationMs: number, hp: number, dps: number, slowFactor: number, appearance = resolveFenceAppearance()) {
    this.width = width; this.appearance = appearance; this.color = color;
    const ox = Math.cos(angle) * width / 2, oy = Math.sin(angle) * width / 2;
    this.x1=x-ox; this.y1=y-oy; this.x2=x+ox; this.y2=y+oy;
    this.hp=hp; this.previousHp=hp; this.maximumHp=hp; this.dps=dps; this.slowFactor=slowFactor;
    this.born=scene.time.now; this.expiresAt=this.born+durationMs;
    this.sprite=scene.add.container(x,y).setRotation(angle).setDepth(4);
    this.glow=scene.add.rectangle(0,-10,width,22,color,.08).setBlendMode(Phaser.BlendModes.ADD);
    this.sprite.add(this.glow);
    const texture=fenceTexture(appearance.id);
    for(const px of [-width/2,width/2]) {
      const pylon=scene.add.image(px,3,scene.textures.exists(texture)?texture:'circle').setOrigin(.5,.93).setDisplaySize(25,42);
      this.pylons.push(pylon); this.sprite.add(pylon);
    }
    // Fixed sprites, scene-clock animation: no perpetual tweens or per-frame Graphics tessellation.
    for(let i=0;i<4;i++) {
      const beam=scene.add.rectangle(-width/2+6,-5-i*7,width-12,i%2?1:2,color,.8).setOrigin(0,.5).setBlendMode(Phaser.BlendModes.ADD);
      this.beams.push(beam); this.sprite.add(beam);
      const pip=scene.add.image(0,beam.y,'circle').setTint(appearance.accent).setDisplaySize(4,3).setBlendMode(Phaser.BlendModes.ADD);
      this.pips.push(pip); this.sprite.add(pip);
    }
    this.updateCosmetic(this.born);
  }

  markShock(now: number): void { this.shockUntil=now+140; }
  updateCosmetic(now: number, rail = false): void {
    if(!this.sprite.active)return;
    if(this.hp<this.previousHp)this.damageUntil=now+170;
    this.previousHp=this.hp;
    const age=now-this.born, activation=Math.min(1,age/450);
    const health=Math.max(0,this.hp/Math.max(1,this.maximumHp));
    const shutdown=Math.min(1,Math.max(0,(this.expiresAt-now)/600));
    const shock=now<this.shockUntil||rail, damaged=now<this.damageUntil;
    this.sprite.setAlpha(shutdown*(damaged?.7:1));
    for(const pylon of this.pylons) {
      pylon.setDisplaySize(25,42*(.05+.95*activation));
      if(damaged)pylon.setTint(0xff6548); else pylon.clearTint();
    }
    this.glow.setFillStyle(shock?this.appearance.accent:this.color,shock?.24:.08);
    const motif=this.appearance.motif;
    const speed=motif==='industrial'?.0005:motif==='void'?.0003:.0008;
    for(let i=0;i<this.beams.length;i++) {
      const pulse=.64+Math.sin(now*.009+i*1.7)*.22;
      this.beams[i].setScale(activation,1).setAlpha(shock?1:pulse*(.65+health*.35));
      const phase=(age*speed+i*.23)%1;
      this.pips[i].setX((-this.width/2+6)+(this.width-12)*(i%2?1-phase:phase)).setAlpha(activation);
      this.pips[i].setScale((shock?1.4:1)*(motif==='fire'?1+Math.sin(age*.02+i)*.2:1)*4/this.pips[i].width);
    }
  }
  isExpired(now: number): boolean { return now>=this.expiresAt||this.hp<=0; }
  setColor(color: number): void { this.color=color; for(const beam of this.beams)beam.setFillStyle(color, .85); }
  destroy(): void { this.sprite.destroy(true); }
}
