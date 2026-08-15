import type { RectSpec } from '../types.ts';

export const ArenaStructureGrammar = {
  wall:(x:number,y:number,w:number,h:number):RectSpec=>({x,y,w,h}),
  longWall:(x:number,y:number,length:number,thickness:number,vertical=false):RectSpec[]=>[{x,y,w:vertical?thickness:length,h:vertical?length:thickness}],
  shortWall:(x:number,y:number,length:number,thickness:number,vertical=false):RectSpec[]=>[{x,y,w:vertical?thickness:length,h:vertical?length:thickness}],
  lShape:(x:number,y:number,w:number,h:number,t:number):RectSpec[]=>[{x,y,w,h:t},{x,y,w:t,h}],
  uShape:(x:number,y:number,w:number,h:number,t:number):RectSpec[]=>[{x,y,w,h:t},{x,y,w:t,h},{x:x+w-t,y,w:t,h}],
  tJunction:(x:number,y:number,w:number,h:number,t:number):RectSpec[]=>[{x,y,w,h:t},{x:x+w/2-t/2,y,w:t,h}],
  crossJunction:(x:number,y:number,w:number,h:number,t:number):RectSpec[]=>[{x,y:y+h/2-t/2,w,h:t},{x:x+w/2-t/2,y,w:t,h}],
  box:(x:number,y:number,w:number,h:number,t:number):RectSpec[]=>[{x,y,w,h:t},{x,y:y+h-t,w,h:t},{x,y,w:t,h},{x:x+w-t,y,w:t,h}],
  partialBox:(x:number,y:number,w:number,h:number,t:number,gap:number):RectSpec[]=>[
    {x,y,w:(w-gap)/2,h:t},{x:x+(w+gap)/2,y,w:(w-gap)/2,h:t},{x,y:y+h-t,w,h:t},{x,y,w:t,h},{x:x+w-t,y,w:t,h}
  ],
  ring:(x:number,y:number,w:number,h:number,t:number,gapRatio=.24,minimumGap=0):RectSpec[]=>{
    const horizontalGap=Math.min(Math.max(w*gapRatio,minimumGap),Math.max(0,w-t*2));
    const verticalGap=Math.min(Math.max(h*gapRatio,minimumGap),Math.max(0,h-t*2));
    const hw=(w-horizontalGap)/2,vh=(h-verticalGap)/2;
    return [{x,y,w:hw,h:t},{x:x+w-hw,y,w:hw,h:t},{x,y:y+h-t,w:hw,h:t},{x:x+w-hw,y:y+h-t,w:hw,h:t},{x,y,w:t,h:vh},{x,y:y+h-vh,w:t,h:vh},{x:x+w-t,y,w:t,h:vh},{x:x+w-t,y:y+h-vh,w:t,h:vh}];
  },
  pillarCluster:(x:number,y:number,size:number,gap:number):RectSpec[]=>[{x,y,w:size,h:size},{x:x+size+gap,y,w:size,h:size},{x,y:y+size+gap,w:size,h:size},{x:x+size+gap,y:y+size+gap,w:size,h:size}],
  corridor:(x:number,y:number,length:number,width:number,t:number,vertical=false):RectSpec[]=>vertical?[{x,y,w:t,h:length},{x:x+width-t,y,w:t,h:length}]:[{x,y,w:length,h:t},{x,y:y+width-t,w:length,h:t}],
  gate:(x:number,y:number,span:number,gap:number,t:number,vertical=false):RectSpec[]=>vertical?[{x,y,w:t,h:(span-gap)/2},{x,y:y+(span+gap)/2,w:t,h:(span-gap)/2}]:[{x,y,w:(span-gap)/2,h:t},{x:x+(span+gap)/2,y,w:(span-gap)/2,h:t}],
  funnel:(x:number,y:number,length:number,opening:number,t:number):RectSpec[]=>[{x,y,w:length,h:t},{x,y:y+opening,w:length,h:t}],
  chokePoint:(x:number,y:number,span:number,gap:number,t:number,vertical=false):RectSpec[]=>ArenaStructureGrammar.gate(x,y,span,gap,t,vertical),
  centralStructure:(x:number,y:number,w:number,h:number,t:number):RectSpec[]=>ArenaStructureGrammar.ring(x,y,w,h,t),
  perimeterStructure:(bounds:RectSpec,t:number):RectSpec[]=>ArenaStructureGrammar.box(bounds.x,bounds.y,bounds.w,bounds.h,t),
  diagonalWall:(x:number,y:number,length:number,t:number,rising=true):RectSpec[]=>Array.from({length:7},(_,i)=>({x:x+i*length/8,y:y+(rising?i:6-i)*t*1.6,w:length/5.5,h:t})),
  staggeredWalls:(x:number,y:number,length:number,t:number,count:number,gap:number):RectSpec[]=>Array.from({length:count},(_,i)=>({x:x+(i%2)*length*.35,y:y+i*gap,w:length,h:t}))
} as const;
