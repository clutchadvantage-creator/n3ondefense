import type { ArenaTemplate, RectSpec } from '../types.ts';
import { ARENA_GENERATION_CONFIG as CONFIG } from '../config/arenaGeneration.ts';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants.ts';
import { SeededRandom } from './SeededRandom.ts';
import { ArenaStructureGrammar } from './ArenaStructureGrammar.ts';

export interface PointSpec { x: number; y: number }
export interface ArenaTopologyDraft {
  archetype: ArenaTemplate;
  bounds: RectSpec;
  walls: RectSpec[];
  objectiveCandidates: PointSpec[];
  playerCandidates: PointSpec[];
  enemySpawns: PointSpec[];
  majorStructureCount: number;
  chokePointCount: number;
  connectedRegionCount: number;
  orientationBias: { horizontal: number; vertical: number; diagonal: number };
}

type Generator = (random: SeededRandom, bounds: RectSpec) => ArenaTopologyDraft;
const point = (bounds: RectSpec, nx: number, ny: number): PointSpec => ({ x: bounds.x + bounds.w * nx, y: bounds.y + bounds.h * ny });
const wall = (bounds: RectSpec, nx: number, ny: number, nw: number, nh: number): RectSpec => ({ x: bounds.x + bounds.w * nx, y: bounds.y + bounds.h * ny, w: bounds.w * nw, h: bounds.h * nh });
const hWall = (b: RectSpec, x: number, y: number, w: number, t = 0.018): RectSpec => wall(b, x, y, w, t);
const vWall = (b: RectSpec, x: number, y: number, h: number, t = 0.014): RectSpec => wall(b, x, y, t, h);
const border = (b: RectSpec): RectSpec[] => {
  const t = CONFIG.boundaryThickness;
  return [
    { x: b.x, y: b.y, w: b.w, h: t }, { x: b.x, y: b.y + b.h - t, w: b.w, h: t },
    { x: b.x, y: b.y, w: t, h: b.h }, { x: b.x + b.w - t, y: b.y, w: t, h: b.h }
  ];
};
const ringWalls = (b: RectSpec, x: number, y: number, w: number, h: number): RectSpec[] => ArenaStructureGrammar.ring(b.x+b.w*x,b.y+b.h*y,b.w*w,b.h*h,Math.max(20,b.h*.018));
const steppedDiagonal = (b: RectSpec, x: number, y: number, length: number, rising: boolean): RectSpec[] =>
  ArenaStructureGrammar.diagonalWall(b.x+b.w*x,b.y+b.h*y,b.w*length,b.h*.022,rising);
const base = (archetype: ArenaTemplate, bounds: RectSpec, walls: RectSpec[], objectives: PointSpec[], players: PointSpec[], enemies: PointSpec[], major: number, chokes: number, regions: number, bias: ArenaTopologyDraft['orientationBias']): ArenaTopologyDraft => ({
  archetype, bounds, walls: [...border(bounds), ...walls], objectiveCandidates: objectives, playerCandidates: players, enemySpawns: enemies, majorStructureCount: major, chokePointCount: chokes, connectedRegionCount: regions, orientationBias: bias
});
const edges = (b: RectSpec): PointSpec[] => [point(b, .05, .12), point(b, .95, .18), point(b, .94, .82), point(b, .08, .9), point(b, .5, .055), point(b, .5, .945)];

const openField: Generator = (r, b) => {
  const walls: RectSpec[] = [];
  const clusters = r.int(3, 5);
  for (let i = 0; i < clusters; i += 1) {
    const x = r.float(.18, .78), y = r.float(.18, .78);
    walls.push(hWall(b, x, y, r.float(.07, .14)), vWall(b, x + .025, y - .025, r.float(.05, .1)));
  }
  return base('open-field', b, walls, [point(b,.2,.24),point(b,.76,.28),point(b,.62,.76),point(b,.27,.72),point(b,.5,.1)], [point(b,.5,.5)], edges(b), clusters, 0, 1, { horizontal:.4, vertical:.35, diagonal:.25 });
};
const islands: Generator = (r, b) => {
  const centers = [[.22,.25],[.68,.2],[.3,.68],[.76,.7]] as const;
  const placements=centers.map(([x,y])=>({x:x+r.float(-.02,.02),y:y+r.float(-.02,.02),w:.18,h:.22}));
  const walls = placements.flatMap((entry)=>ringWalls(b,entry.x,entry.y,entry.w,entry.h));
  return base('islands', b, walls, [...placements.map((entry)=>point(b,entry.x+entry.w/2,entry.y+entry.h/2)),point(b,.5,.48)], [point(b,.5,.48)], [point(b,.5,.08),point(b,.94,.5),point(b,.5,.92),point(b,.06,.5)], 4, 4, 4, { horizontal:.45, vertical:.45, diagonal:.1 });
};
const fortress: Generator = (r, b) => {
  const ox = r.float(-.1,.08), oy = r.float(-.07,.07);
  const walls = ringWalls(b,.27+ox,.2+oy,.48,.56);
  walls.push(hWall(b,.36+ox,.39+oy,.28),vWall(b,.49+ox,.29+oy,.22));
  return base('fortress', b, walls, [point(b,.39+ox,.31+oy),point(b,.62+ox,.64+oy),point(b,.15,.72),point(b,.86,.27),point(b,.16,.25)], [point(b,.14,.5)], [point(b,.93,.12),point(b,.93,.5),point(b,.86,.9),point(b,.5,.92)], 1, 4, 2, { horizontal:.5, vertical:.45, diagonal:.05 });
};
const ring: Generator = (_r, b) => {
  const walls = ringWalls(b,.2,.16,.6,.67);
  return base('ring', b, walls, [point(b,.5,.5),point(b,.12,.5),point(b,.88,.5),point(b,.5,.1),point(b,.5,.9)], [point(b,.5,.5)], [point(b,.05,.2),point(b,.95,.2),point(b,.95,.8),point(b,.05,.8)], 1, 4, 2, { horizontal:.48, vertical:.48, diagonal:.04 });
};
const split: Generator = (r, b) => {
  const vertical = r.bool();
  const walls: RectSpec[] = vertical
    ? [vWall(b,.49,.02,.29,.026),vWall(b,.49,.42,.22,.026),vWall(b,.49,.76,.22,.026)]
    : [hWall(b,.02,.49,.3,.026),hWall(b,.43,.49,.2,.026),hWall(b,.75,.49,.23,.026)];
  const objectives = vertical ? [point(b,.23,.3),point(b,.76,.68),point(b,.23,.75),point(b,.76,.28),point(b,.72,.86)] : [point(b,.25,.23),point(b,.72,.76),point(b,.75,.24),point(b,.23,.73),point(b,.88,.86)];
  const players = vertical ? [point(b,.2,.5)] : [point(b,.5,.2)];
  return base('split', b, walls, objectives, players, [point(b,.07,.1),point(b,.93,.12),point(b,.91,.88),point(b,.08,.9)], 1, 2, 2, vertical ? {horizontal:.05,vertical:.9,diagonal:.05}:{horizontal:.9,vertical:.05,diagonal:.05});
};
const hubSpoke: Generator = (r, b) => {
  const walls = ringWalls(b,.4,.38,.2,.22);
  const spokes = r.bool() ? [hWall(b,.05,.29,.3),hWall(b,.65,.67,.3),vWall(b,.3,.05,.27),vWall(b,.7,.68,.27)] : [...steppedDiagonal(b,.05,.12,.3,true),...steppedDiagonal(b,.66,.55,.3,false)];
  return base('hub-spoke', b, [...walls,...spokes], [point(b,.5,.5),point(b,.12,.18),point(b,.88,.82),point(b,.72,.13),point(b,.24,.87)], [point(b,.5,.5)], edges(b), 5, 4, 5, {horizontal:.35,vertical:.3,diagonal:.35});
};
const canyon: Generator = (r, b) => {
  const flip=r.bool();
  const heights=(flip?[.27,.18,.24,.12,.18,.12]:[.12,.18,.12,.24,.18,.27]);
  const walls:RectSpec[]=[];
  const routes:PointSpec[]=[];
  heights.forEach((upperY,index)=>{const x=.04+index*.155;walls.push(hWall(b,x,upperY,.14,.022),hWall(b,x,upperY+.3,.14,.022));routes.push(point(b,x+.07,upperY+.16));});
  return base('canyon', b, walls, [routes[0],routes[1],routes[3],routes[4],routes[5]], [routes[0]], [routes[5],point(b,.08,.08),point(b,.92,.92)], 2, 5, 1, {horizontal:.25,vertical:.05,diagonal:.7});
};
const maze: Generator = (r, b) => {
  const walls: RectSpec[] = [];
  for (let row=0;row<4;row+=1) {
    const fromLeft = (row + (r.bool()?1:0)) % 2 === 0;
    walls.push(hWall(b,fromLeft?.05:.28,.2+row*.2,.67,.018));
  }
  walls.push(vWall(b,.22,.25,.15),vWall(b,.78,.61,.14));
  return base('maze', b, walls, [point(b,.15,.1),point(b,.85,.1),point(b,.15,.9),point(b,.85,.9),point(b,.5,.5)], [point(b,.5,.1)], [point(b,.3,.1),point(b,.7,.9),point(b,.9,.5)], 6, 6, 4, {horizontal:.75,vertical:.2,diagonal:.05});
};
const chambers: Generator = (r, b) => {
  const chambers = [[.06,.08,.3,.32],[.56,.08,.37,.26],[.1,.58,.35,.32],[.62,.52,.28,.39]] as const;
  const walls = chambers.flatMap(([x,y,w,h])=>ringWalls(b,x+r.float(-.015,.015),y,w,h));
  return base('chambers', b, walls, [...chambers.map(([x,y,w,h])=>point(b,x+w/2,y+h/2)),point(b,.52,.46)], [point(b,.5,.46)], [point(b,.5,.05),point(b,.95,.45),point(b,.5,.95),point(b,.05,.48)], 4, 6, 4, {horizontal:.48,vertical:.48,diagonal:.04});
};
const asymmetricClusters: Generator = (r,b) => {
  const walls: RectSpec[] = [];
  for (let i=0;i<8;i+=1) {
    const dense = i < 6;
    const x = dense ? r.float(.12,.4) : r.float(.46,.56), y=r.float(.12,.76);
    walls.push(...ringWalls(b,x,y,r.float(.08,.19),r.float(.07,.18)));
  }
  return base('asymmetric-clusters',b,walls,[point(b,.72,.18),point(b,.82,.48),point(b,.68,.83),point(b,.9,.72),point(b,.9,.25)],[point(b,.86,.9)],[point(b,.5,.05),point(b,.95,.12),point(b,.95,.88),point(b,.5,.95)],8,3,3,{horizontal:.42,vertical:.38,diagonal:.2});
};
const crossroads: Generator = (r,b) => {
  const offset=r.float(-.08,.08);
  const walls=[hWall(b,.03,.34+offset,.34),hWall(b,.63,.34+offset,.34),hWall(b,.03,.64+offset,.34),hWall(b,.63,.64+offset,.34),vWall(b,.37,.03,.25),vWall(b,.37,.72,.25),vWall(b,.62,.03,.25),vWall(b,.62,.72,.25)];
  return base('crossroads',b,walls,[point(b,.5,.5+offset),point(b,.16,.5+offset),point(b,.84,.5+offset),point(b,.5,.15),point(b,.5,.86)],[point(b,.5,.5+offset)],edges(b),4,5,5,{horizontal:.5,vertical:.5,diagonal:0});
};
const perimeter: Generator = (r,b) => {
  const ox=r.float(-.12,.1),oy=r.float(-.1,.1);
  const walls=ringWalls(b,.25+ox,.2+oy,.5,.58);
  walls.push(hWall(b,.33+ox,.34+oy,.34),hWall(b,.33+ox,.6+oy,.34));
  return base('perimeter',b,walls,[point(b,.1,.2),point(b,.9,.22),point(b,.88,.8),point(b,.12,.82),point(b,.5,.1)],[point(b,.1,.5)],edges(b),1,4,1,{horizontal:.55,vertical:.4,diagonal:.05});
};

export const ARENA_TOPOLOGY_GENERATORS: Record<ArenaTemplate, Generator> = {
  'open-field': openField, islands, fortress, ring, split, 'hub-spoke': hubSpoke, canyon, maze, chambers,
  'asymmetric-clusters': asymmetricClusters, crossroads, perimeter
};

export const chooseArenaBounds = (random: SeededRandom, archetype: ArenaTemplate): RectSpec => {
  let width = random.int(CONFIG.minWidth, CONFIG.maxWidth);
  let height = random.int(CONFIG.minHeight, CONFIG.maxHeight);
  if (['canyon','hub-spoke'].includes(archetype) && random.bool(.55)) width = random.int(2050, CONFIG.maxWidth);
  if (['maze','chambers'].includes(archetype) && random.bool(.45)) { width = random.int(1650,1950); height = random.int(1320,CONFIG.maxHeight); }
  if (archetype === 'split' && random.bool()) { width = random.int(1650,1900); height = random.int(1350,CONFIG.maxHeight); }
  return { x: Math.round((WORLD_WIDTH-width)/2), y: Math.round((WORLD_HEIGHT-height)/2), w: width, h: height };
};

export const generateArenaTopology = (archetype: ArenaTemplate, seed: number): ArenaTopologyDraft => {
  const random = new SeededRandom(seed);
  const bounds = chooseArenaBounds(random, archetype);
  return ARENA_TOPOLOGY_GENERATORS[archetype](random, bounds);
};
