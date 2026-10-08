import { SeededRandom } from '../../systems/SeededRandom.ts';

type Context = CanvasRenderingContext2D;
type Point = { x: number; y: number };
type Face = readonly Point[];
export interface CityBuilding {
  width: number; length: number; height: number;
  accent: string; sign: string; style: 'tower' | 'spire' | 'factory' | 'terraced' | 'aa';
}
export const CITY_BUILDINGS: readonly CityBuilding[] = [
  { width: 188, length: 124, height: 340, accent: '#49c9de', sign: 'N3ON', style: 'tower' },
  { width: 122, length: 106, height: 490, accent: '#9c8bed', sign: 'AXIOM', style: 'spire' },
  { width: 232, length: 148, height: 225, accent: '#de9b57', sign: 'REACTOR 09', style: 'factory' },
  { width: 212, length: 132, height: 385, accent: '#69cdbd', sign: 'NEXUS', style: 'terraced' },
  { width: 150, length: 112, height: 425, accent: '#cf6da9', sign: 'KAI', style: 'tower' },
  { width: 196, length: 102, height: 295, accent: '#68a6de', sign: 'ORBITAL', style: 'tower' }
];
export const CITY_AA_BUILDING: CityBuilding = {
  width: 154, length: 118, height: 235, accent: '#d6a267', sign: 'AA // 07', style: 'aa'
};
export const CITY_TEXTURE_WIDTH = 400;
export const CITY_ROOF_ANCHOR = { x: 200, y: 140 };
export const cityTextureHeight = (building: CityBuilding): number => building.height + 290;

function path(c: Context, face: Face): void {
  c.beginPath(); c.moveTo(face[0].x, face[0].y);
  for (let i = 1; i < face.length; i++) c.lineTo(face[i].x, face[i].y);
  c.closePath();
}
function fill(c: Context, face: Face, color: string | CanvasGradient, edge?: string): void {
  path(c, face); c.fillStyle = color; c.fill();
  if (edge) { c.strokeStyle = edge; c.lineWidth = 1; c.stroke(); }
}
function line(c: Context, points: Face, color: string, width = 1, glow = 0): void {
  c.beginPath(); c.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
  c.strokeStyle = color; c.lineWidth = width; c.shadowColor = color; c.shadowBlur = glow;
  c.stroke(); c.shadowBlur = 0;
}
function lerp(a: Point, b: Point, t: number): Point { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
const lower = (p: Point, height: number): Point => ({ x: p.x, y: p.y + height });

/** Fixed oblique projection: roof coordinates are horizontal, wall height is vertical on screen. */
function roofPoint(building: CityBuilding, u: number, v: number, elevation = 0): Point {
  return { x: CITY_ROOF_ANCHOR.x + (u - .5) * building.width - (v - .5) * building.length * .65,
    y: CITY_ROOF_ANCHOR.y + (u - .5) * building.width * .23 + (v - .5) * building.length * .48 - elevation };
}
function roofRect(building: CityBuilding, u: number, v: number, w: number, d: number, elevation = 0): Point[] {
  return [roofPoint(building,u,v,elevation),roofPoint(building,u+w,v,elevation),
    roofPoint(building,u+w,v+d,elevation),roofPoint(building,u,v+d,elevation)];
}
function box(c: Context, top: Face, height: number, roof = '#344c61'): void {
  fill(c,[top[3],top[2],lower(top[2],height),lower(top[3],height)],'#152536','#456074');
  fill(c,[top[1],top[2],lower(top[2],height),lower(top[1],height)],'#0b1c2c','#324c61');
  fill(c,top,roof,'#668697');
}

function facade(c: Context, a: Point, b: Point, height: number, accent: string, random: SeededRandom, dark: boolean): void {
  const gradient = c.createLinearGradient(0,a.y,0,a.y+height);
  gradient.addColorStop(0,dark?'#1b3147':'#294354');
  gradient.addColorStop(.55,dark?'#122237':'#1a3041');
  gradient.addColorStop(1,'#07131f');
  const wall=[a,b,lower(b,height),lower(a,height)];fill(c,wall,gradient,'#415a6b');
  c.save(); path(c,wall);c.clip();
  const columns=Math.max(3,Math.floor(Math.hypot(b.x-a.x,b.y-a.y)/15));
  // Floors live on the vertical faces, never on the roof plane.
  for(let y=16,floor=0;y<height-15;y+=18,floor++) {
    line(c,[lower(a,y+10),lower(b,y+10)],dark?'#223349':'#314555',.7);
    for(let column=0;column<columns;column++) {
      const p=lower(lerp(a,b,(column+.17)/columns),y),q=lower(lerp(a,b,(column+.73)/columns),y);
      const lit=random.next();
      fill(c,[p,q,lower(q,6),lower(p,6)],lit<.32?'#0a1928':lit<.62?'#456675':lit<.91?accent:'#d8bb81');
      if(lit>.62)line(c,[p,q],'#b7d6db',.5);
    }
    if(floor%5===3) {
      fill(c,[lower(a,y+11),lower(b,y+11),lower(b,y+15),lower(a,y+15)],'#061321');
      line(c,[lower(a,y+11),lower(b,y+11)],'#4a6170',1.3);
    }
  }
  for(let column=0;column<=columns;column+=3) {
    const p=lerp(a,b,column/columns);line(c,[p,lower(p,height)],'#0a1725',3);
    line(c,[{x:p.x+1,y:p.y},lower({x:p.x+1,y:p.y},height)],'#3e5667',.8);
  }
  c.restore();
  line(c,[a,lower(a,height)],'#567286',2);
  line(c,[b,lower(b,height*.86)],accent,1.5,4);
}

function machinery(c: Context, building: CityBuilding): void {
  const plant=building.style==='factory';
  const top=roofRect(building,.12,.17,plant ? .36 : .3,.28,13);
  box(c,top,13);
  for(let row=0;row<6;row++)line(c,[roofPoint(building,.15,.19+row*.04,13),roofPoint(building,plant ? .45 : .39,.19+row*.04,13)],'#07131e',2);
  const condenser=roofRect(building,.61,.19,.24,.3,9);box(c,condenser,9,'#40596a');
  const fan=roofPoint(building,.73,.34,10);
  c.save();c.translate(fan.x,fan.y);c.scale(1,.58);c.fillStyle='#101f2d';c.beginPath();c.arc(0,0,12,0,Math.PI*2);c.fill();
  for(let i=0;i<6;i++) {c.rotate(Math.PI/3);line(c,[{x:2,y:0},{x:10,y:3}],'#7a94a3',2);}
  c.restore();
  for(const [u,v] of [[.17,.76],[.84,.7]]) {
    const p=roofPoint(building,u,v),tip={x:p.x,y:p.y-(plant?42:56)};
    line(c,[{x:p.x+12,y:p.y+5},p],'#030b14',4);
    line(c,[p,tip],'#6e8a9c',2);
    line(c,[{x:tip.x-8,y:tip.y+13},{x:tip.x+8,y:tip.y+13}],'#90a7b1',1.5);
    c.fillStyle='#ee9c89';c.shadowColor='#ff785e';c.shadowBlur=6;c.fillRect(tip.x-1.5,tip.y-2,3,3);c.shadowBlur=0;
  }
  if(plant) {
    for(const u of [.54,.72,.88]) {
      const p=roofPoint(building,u,.7,35);
      box(c,roofRect(building,u-.04,.65,.075,.1,35),35,'#61747b');
      line(c,[{x:p.x-3,y:p.y},{x:p.x+5,y:p.y+1}],'#c79465',3);
    }
  }
}

/** Baked per silhouette; not a map tile. Both facades span the complete roof-to-street height. */
export function drawCityBuilding(c: Context, building: CityBuilding, variant: number, mirrored = false): void {
  const random=new SeededRandom(0xc17a+variant*8191),roof=roofRect(building,0,0,1,1);
  // A street-level plinth and narrow buttresses anchor the walls to the lower city.
  box(c,roof.map(p=>lower(p,building.height-12)),12,'#263b49');
  facade(c,roof[3],roof[2],building.height,building.accent,random,false);
  facade(c,roof[1],roof[2],building.height,building.accent,random,true);
  for(const t of [.06,.94]) {
    const p=lerp(roof[3],roof[2],t);
    line(c,[lower(p,24),lower(p,building.height-12)],'#4b6574',3);
    line(c,[lower(p,24),lower(p,building.height*.64)],building.accent,1.5,3);
  }
  // Roof parapet: a shallow extrusion above the much taller occupied floors.
  box(c,roof,8,'#3b5364');
  fill(c,roofRect(building,.035,.035,.93,.93),'#253e50','#76919e');
  fill(c,roofRect(building,.085,.085,.83,.83),'#203344','#102437');
  line(c,[...roof,roof[0]],building.accent,2,5);
  line(c,[roof[3],roof[2],roof[1]],'#b0c8cd',.7);
  for(const t of [.31,.61])line(c,[roofPoint(building,t,.09),roofPoint(building,t,.91)],'#456071',1);

  if(building.style==='aa') {
    const pad=roofRect(building,.2,.18,.6,.63);
    fill(c,pad,'#172c3b',building.accent);
    c.save();const p=roofPoint(building,.5,.5);c.translate(p.x,p.y);c.scale(1,.65);
    c.strokeStyle='#ba9d6c';c.lineWidth=2;c.setLineDash([7,5]);c.beginPath();c.arc(0,0,37,0,Math.PI*2);c.stroke();c.restore();
    box(c,roofRect(building,.06,.08,.16,.18,9),9);
  } else if(building.style==='terraced'||building.style==='spire') {
    const height=building.style==='spire'?62:38;
    box(c,roofRect(building,.24,.25,.52,.47,height),height,'#3f596b');
    line(c,[roofPoint(building,.24,.72,height),roofPoint(building,.76,.72,height)],building.accent,2,5);
    const mast=roofPoint(building,.5,.48,height);
    line(c,[mast,{x:mast.x,y:mast.y-53}],'#acc2ca',2);
    c.fillStyle=building.accent;c.fillRect(mast.x-2,mast.y-55,4,4);
    box(c,roofRect(building,.07,.16,.13,.3,10),10);
  } else machinery(c,building);

  // A sign is attached to the front wall, with the same oblique baseline as its floors.
  const sign=lerp(roof[3],roof[2],.18),signWidth=building.width*.63;
  c.save();c.transform(1,.23,0,1,sign.x,sign.y+building.height*.23);
  c.fillStyle='#07121eef';c.fillRect(-5,-19,signWidth+10,32);
  c.strokeStyle='#516e82';c.strokeRect(-5,-19,signWidth+10,32);
  c.font=`bold ${building.style==='factory'?12:17}px monospace`;c.textAlign='center';
  c.fillStyle=building.accent;c.shadowBlur=5;c.shadowColor=building.accent;
  c.translate(signWidth/2,0);if(mirrored)c.scale(-1,1);c.fillText(building.sign,0,3);c.restore();
}

export function drawCityShadow(c: Context, building: CityBuilding): void {
  const roof=roofRect(building,0,0,1,1).map(p=>({x:p.x,y:p.y-70}));
  const dx=70+building.height*.12,dy=35+building.height*.16;
  const gradient=c.createLinearGradient(200,70,200+dx,70+dy);
  gradient.addColorStop(0,'#010710c9');gradient.addColorStop(1,'#01071000');
  fill(c,[roof[0],roof[1],{x:roof[1].x+dx,y:roof[1].y+dy},
    {x:roof[2].x+dx,y:roof[2].y+dy},{x:roof[3].x+dx,y:roof[3].y+dy},roof[3]],gradient);
}
