import Phaser from 'phaser';
import { legacyBombTexture, type LegacyBombTheme } from './LegacyBombArt.ts';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const out=(n:number)=>1-(1-clamp(n))**3;
/** Bounded celebration, shared by combat and Garage. No physics, timers or allocation during update. */
export class LegacyBombVisual {
  readonly root: Phaser.GameObjects.Container;
  private readonly halo: Phaser.GameObjects.Image;
  private readonly rings: Phaser.GameObjects.Image[];
  private readonly hero: Phaser.GameObjects.Image;
  private readonly fragments: Phaser.GameObjects.Image[];
  private theme: LegacyBombTheme|null=null;
  constructor(scene: Phaser.Scene) {
    const img=(part:'hero'|'ring'|'fragment'|'halo')=>scene.add.image(0,0,legacyBombTexture('death-signal',part));
    this.halo=img('halo').setBlendMode(Phaser.BlendModes.ADD);
    this.rings=[img('ring'),img('ring')];
    this.hero=img('hero');
    this.fragments=Array.from({length:18},()=>img('fragment'));
    this.root=scene.add.container(0,0,[this.halo,...this.rings,this.hero,...this.fragments]).setDepth(18).setVisible(false);
  }
  update(theme: LegacyBombTheme,x:number,y:number,radius:number,age:number,reduced:boolean):void {
    if(this.theme!==theme){
      this.theme=theme; this.halo.setTexture(legacyBombTexture(theme,'halo')); this.hero.setTexture(legacyBombTexture(theme,'hero'));
      for(const ring of this.rings)ring.setTexture(legacyBombTexture(theme,'ring'));
      for(const fragment of this.fragments)fragment.setTexture(legacyBombTexture(theme,'fragment'));
    }
    const end=theme==='neon-bloom'?2750:2700;
    const fade=1-clamp((age-1900)/(end-1900)), ignition=1-clamp(age/320), release=out((age-200)/1000);
    this.root.setVisible(age>=0&&age<end).setPosition(x,y).setScale(Math.min(radius,300)/128).setAlpha(fade);
    this.halo.setScale(.7+out(age/700)*1.3).setAlpha(.45+ignition*.5);
    const heroScale=.12+out(age/450)*.92;
    // Hero textures are rasterized at 2x; all animation math uses the authored 256px canvas.
    this.hero.setDisplaySize(256*heroScale,256*heroScale).setY(-22-out(age/1800)*22).setAlpha(clamp(age/130));
    this.hero.setRotation(theme==='neon-bloom'?age*.00016:theme==='death-signal'?Math.sin(age*.04)*.015:age*.0003);
    for(let i=0;i<2;i++){
      const t=clamp((age-i*150)/1100);
      this.rings[i].setScale(.15+out(t)*1.55,(.15+out(t)*1.55)*.55).setY(24).setRotation(i?-age*.00025:age*.0002).setAlpha((1-t)*.9+.08*fade);
    }
    for(let i=0;i<this.fragments.length;i++){
      const f=this.fragments[i]; f.setVisible(!reduced||i<8); if(!f.visible)continue;
      const angle=i*2.39996,travel=(42+(i%5)*18)*release;
      f.setPosition(Math.cos(angle)*travel,Math.sin(angle)*travel*.6-70*Math.sin(release*Math.PI)+24);
      f.setScale((theme==='neon-bloom'?.16:.07)+(i%3)*.02).setRotation(angle+age*.001*(i%2?1:-1)).setAlpha(clamp((age-160)/120)*(1-clamp((age-1600)/900)));
    }
  }
  hide():void{this.root.setVisible(false);}
  destroy():void{this.root.destroy(true);}
}
