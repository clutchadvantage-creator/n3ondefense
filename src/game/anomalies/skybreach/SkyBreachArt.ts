import Phaser from 'phaser';
import { SeededRandom } from '../../systems/SeededRandom.ts';

type Context = CanvasRenderingContext2D;
const palette = { edge: '#627e91', recess: '#050d18', light: '#c5e4eb' };
function polygon(c: Context, points: number[], fill: string | CanvasGradient, stroke = palette.edge) {
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = 1.3; c.stroke();
}
function metal(c: Context, x: number, w: number, light = '#506577') {
  const g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#0c1726'); g.addColorStop(.35, light); g.addColorStop(.5, '#718390');
  g.addColorStop(.54, '#263b4c'); g.addColorStop(1, '#101e30'); return g;
}
function lamp(c: Context, x: number, y: number, w: number, h: number, color: string) {
  c.shadowBlur = 10; c.shadowColor = color; c.fillStyle = color; c.fillRect(x,y,w,h); c.shadowBlur = 0;
  c.fillStyle = '#d8fcff'; c.fillRect(x + 1,y,w - 2,1);
}
function vent(c: Context, x: number, y: number, w: number, rows: number) {
  c.fillStyle = '#040a12'; c.fillRect(x - 2,y - 2,w + 4,rows * 4 + 3);
  for(let i=0;i<rows;i++) { c.fillStyle = '#607080'; c.fillRect(x,y + i*4,w,1); }
}
function aircraft(c: Context, type: 'player'|'interceptor'|'strike'|'escort') {
  const wide = type === 'strike', friendly = type === 'player' || type === 'escort';
  const color = friendly ? '#43eeff' : wide ? '#ffaa43' : '#ff4d94';
  c.translate(80,80);
  for(const side of [-1,1]) {
    c.save(); c.scale(side,1);
    polygon(c,[13,-32,29,-29,66,24,66,37,26,19,12,33],metal(c,12,54));
    polygon(c,[29,-20,55,22,33,11,23,-6], '#203345');
    polygon(c,[15,24,44,53,44,62,12,45],metal(c,12,32));
    polygon(c,[17,-14,29,-14,33,40,28,51,17,51,14,38],metal(c,14,19));
    lamp(c,18,43,10,9,color); vent(c,18,12,9,6);
    polygon(c,[43,12,49,16,49,38,43,35], '#0a1421');
    lamp(c,44,16,3,16,color);
    c.strokeStyle = '#8d9aa0'; c.beginPath();c.moveTo(34,0);c.lineTo(54,29);c.stroke();
    for(let i=0;i<3;i++){ c.fillStyle=palette.light;c.fillRect(29+i*6,18+i*3,2,2); }
    if(wide){polygon(c,[31,-20,42,-8,53,35,34,27],metal(c,31,22));vent(c,36,3,7,5);}
    c.restore();
  }
  polygon(c,[0,-69,12,-43,16,17,8,45,-8,45,-16,17,-12,-43],metal(c,-16,32,friendly?'#64858d':'#765164'));
  polygon(c,[0,-45,7,-26,6,-5,0,4,-6,-5,-7,-26], '#07101e',color);
  lamp(c,-2,-29,4,19,color); vent(c,-5,14,10,5);
  c.strokeStyle='#acbac1'; c.beginPath(); c.moveTo(0,-66);c.lineTo(0,-48);c.stroke();
  c.fillStyle='#b5dae3';c.font='bold 7px sans-serif';c.textAlign='center';c.fillText(friendly?'RWG':'S-9',0,40);
}
function zeppelin(c: Context) {
  c.translate(180,125);
  for(const side of [-1,1]) {
    c.save();c.scale(side,1);
    polygon(c,[31,-66,66,-48,91,34,70,70,33,65],metal(c,30,65));
    for(const y of [-45,35]) {
      polygon(c,[58,y,83,y-8,95,y,95,y+36,82,y+46,58,y+36],metal(c,58,38));
      lamp(c,64,y+32,25,5,'#ffaa4f');vent(c,68,y+2,17,6);
      c.strokeStyle='#b4a27d';c.beginPath();c.ellipse(78,y+15,21,7,0,0,Math.PI*2);c.stroke();
    }
    c.restore();
  }
  c.fillStyle=metal(c,-50,100,'#797465');c.beginPath();c.ellipse(0,-4,52,110,0,0,Math.PI*2);c.fill();
  c.strokeStyle='#9b9d8c';c.lineWidth=2;c.stroke();
  for(let y=-82;y<90;y+=24) {
    const w= Math.sqrt(1-(y/112)**2)*48;
    polygon(c,[-w,y-4,0,y-12,w,y-4,w,y+9,0,y+3,-w,y+9],metal(c,-w,w*2,'#59666a'));
    lamp(c,-3,y-4,6,6,'#ffad4f');
  }
  polygon(c,[-18,-76,18,-76,22,70,0,91,-22,70],metal(c,-22,44));
  vent(c,-9,-59,18,8);lamp(c,-5,23,10,24,'#ff576b');
}
function dreadnought(c: Context) {
  c.translate(450,205);
  for(const s of [-1,1]) {
    c.save();c.scale(s,1);
    polygon(c,[18,-131,154,-146,271,-106,398,-30,382,68,260,103,159,82,40,135],metal(c,18,380,'#53616d'));
    polygon(c,[90,-116,191,-116,268,-69,342,-21,320,46,209,60,96,41], '#1b2a3b');
    polygon(c,[99,-107,188,-105,253,-67,185,-50,104,-65],metal(c,90,173));
    polygon(c,[213,-39,327,-13,307,36,211,50,177,25],metal(c,177,160));
    for(const x of [90,155,285,345]) {
      polygon(c,[x,-54,x+25,-47,x+28,79,x+18,113,x-1,108,x-7,70],metal(c,x-7,36));
      lamp(c,x,90,19,9,'#ff7945');vent(c,x,-12,16,12);
    }
    for(let x=66;x<350;x+=36) {lamp(c,x,-73+(x>230?25:0),16,3,'#ef487f');c.fillStyle='#acbdc6';c.fillRect(x,47,3,3);}
    c.strokeStyle='#7c8991';c.lineWidth=2;c.beginPath();c.moveTo(51,-123);c.lineTo(146,-137);c.lineTo(385,-22);c.stroke();
    c.restore();
  }
  polygon(c,[-53,-171,53,-171,75,-96,55,126,0,166,-55,126,-75,-96],metal(c,-75,150));
  polygon(c,[-29,-148,29,-148,37,-82,-37,-82], '#020d1b','#51b2d0');
  for(let i=-2;i<=2;i++)lamp(c,i*11-3,-139,6,43,'#6cdbed');
  vent(c,-31,68,62,13);
  c.strokeStyle='#e8aa50';c.lineWidth=2;c.strokeRect(-67,-47,134,94);
  c.fillStyle='#adbdc8';c.font='bold 13px monospace';c.textAlign='center';c.fillText('D R E A D N O U G H T',0,185);
}
function hardpoint(c: Context, type: string) {
  c.translate(64,64);
  polygon(c,[-37,-30,-22,-43,25,-43,40,-27,40,29,24,42,-25,42,-39,27],metal(c,-40,80));
  c.strokeStyle='#df657d';c.lineWidth=2;c.strokeRect(-28,-28,56,56);
  if(type==='core') {
    for(const r of [29,23,15]){c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.strokeStyle=r===15?'#d3ffff':'#59d6e5';c.lineWidth=4;c.stroke();}
    lamp(c,-7,-7,14,14,'#66faff');
  } else if(type==='missile') {
    for(const x of [-17,7])for(const y of [-20,-3,14]) {c.fillStyle='#010812';c.fillRect(x,y,12,12);lamp(c,x+4,y+3,4,6,'#ffac51');}
  } else {
    c.fillStyle=metal(c,-19,38);c.beginPath();c.arc(0,0,22,0,Math.PI*2);c.fill();c.strokeStyle='#b9ced7';c.stroke();
    for(const x of [-12,5]) {polygon(c,[x,-11,x+7,-11,x+7,53,x,53],metal(c,x,7));lamp(c,x,41,7,5,'#ff7448');}
  }
  for(const x of [-29,29])for(const y of [-27,27]){c.fillStyle='#cadbe0';c.fillRect(x-2,y-2,4,4);}
}

/** Finite shared source textures; all moving objects remain scene-owned. */
export function ensureSkyArt(scene: Phaser.Scene): void {
  const bake = (key: string, w: number, h: number, draw: (c:Context)=>void) => {
    if(scene.textures.exists(key))return;
    const texture=scene.textures.createCanvas(key,w,h)!;
    draw(texture.context);texture.refresh();
  };
  for(const type of ['player','interceptor','strike','escort'] as const) bake(`sky-${type}`,160,160,c=>aircraft(c,type));
  bake('sky-zeppelin',360,250,zeppelin);
  bake('sky-dreadnought',900,420,dreadnought);
  for(const type of ['cannon','missile','core'])bake(`sky-${type}`,128,128,c=>hardpoint(c,type));
  bake('sky-rotor',64,64,c=>{
    c.translate(32,32);c.strokeStyle='#91a6b3';c.lineWidth=2;c.beginPath();c.arc(0,0,29,0,Math.PI*2);c.stroke();
    for(let i=0;i<4;i++){c.rotate(Math.PI/2);polygon(c,[-3,-3,2,-26,8,-23,6,3],metal(c,-3,12));}
    c.fillStyle='#ffb56c';c.beginPath();c.arc(0,0,4,0,Math.PI*2);c.fill();
  });
  bake('sky-smoke',96,96,c=>{
    const g=c.createRadialGradient(48,48,4,48,48,46);
    g.addColorStop(0,'#d0a08780');g.addColorStop(.4,'#44465390');g.addColorStop(1,'#171c2600');
    c.fillStyle=g;c.fillRect(0,0,96,96);
  });
  bake('sky-exhaust',48,128,c=>{
    const g=c.createRadialGradient(24,12,1,24,40,64);g.addColorStop(0,'#efffff');g.addColorStop(.2,'#71ecff');g.addColorStop(.6,'#257dc755');g.addColorStop(1,'#16458200');
    c.fillStyle=g;c.fillRect(0,0,48,128);
  });
  bake('sky-clouds',1024,1024,c=>{
    const rng=new SeededRandom(0x51abc);
    for(let i=0;i<85;i++){
      const x=rng.next()*1024,y=rng.next()*1024,r=40+rng.next()*135;
      for(const dx of [-1024,0,1024])for(const dy of [-1024,0,1024]){
        const g=c.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,r);
        g.addColorStop(0,'#54788a40');g.addColorStop(.45,'#304e6730');g.addColorStop(1,'#13283f00');
        c.fillStyle=g;c.fillRect(x+dx-r,y+dy-r,r*2,r*2);
      }
    }
  });
  bake('sky-industrial',512,1024,c=>{
    c.fillStyle='#081320';c.fillRect(0,0,512,1024);
    const rng=new SeededRandom(5129);
    for(let i=0;i<40;i++){
      const x=24+rng.next()*410,y=rng.next()*1024,w=22+rng.next()*54,h=40+rng.next()*140;
      c.fillStyle='#030c17';c.fillRect(x+8,y+10,w,h);c.fillStyle='#142839';c.fillRect(x,y,w,h);
      c.strokeStyle='#263b49';c.strokeRect(x,y,w,h);vent(c,x+5,y+8,w-10,Math.min(9,Math.floor(h/7)));
      if(i%3===0)lamp(c,x+4,y+h-9,w-8,2,i%2?'#bc7941':'#387887');
    }
    c.strokeStyle='#284957';c.setLineDash([12,25]);c.beginPath();c.moveTo(256,0);c.lineTo(256,1024);c.stroke();
  });
  bake('sky-platform',280,380,c=>{
    polygon(c,[30,12,247,12,268,38,268,334,240,369,37,369,12,340,12,39],metal(c,10,260));
    polygon(c,[41,34,235,34,244,326,224,345,50,345,32,325], '#101d2d');
    for(const x of [47,212])for(let y=60;y<330;y+=50)lamp(c,x,y,5,16,'#b2824f');
    c.strokeStyle='#486272';c.lineWidth=2;c.strokeRect(77,68,121,229);
    vent(c,90,90,95,16);vent(c,90,225,95,12);
  });
}

export class SkyBreachWorld {
  private readonly layers: Phaser.GameObjects.TileSprite[];
  private readonly platforms: Phaser.GameObjects.Image[];
  private scroll = 0;
  constructor(scene:Phaser.Scene, width:number,height:number) {
    ensureSkyArt(scene);
    this.layers=[
      scene.add.tileSprite(width/2,height/2,width,height,'sky-industrial').setDepth(-20).setAlpha(.48),
      scene.add.tileSprite(width/2,height/2,width,height,'sky-clouds').setDepth(-18).setAlpha(.8),
      scene.add.tileSprite(width/2,height/2,width,height,'sky-clouds').setDepth(-12).setAlpha(.4).setTileScale(1.7)
    ];
    this.platforms=[.13,.86,.32].map((x,i)=>scene.add.image(width*x,-i*height*.48,'sky-platform')
      .setDisplaySize(100,136).setAlpha(.45).setDepth(-16));
  }
  update(dt:number,height:number):void {
    this.scroll+=dt;
    this.layers.forEach((layer,i)=>{layer.tilePositionY-=dt*(12+i*17);layer.tilePositionX=Math.sin(this.scroll/30+i)*30;});
    this.platforms.forEach(p=>{p.y+=dt*42;if(p.y>height+160)p.y=-200;});
  }
}
