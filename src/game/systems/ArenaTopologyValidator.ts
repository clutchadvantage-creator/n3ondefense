import type { RectSpec } from '../types.ts';
import { ARENA_GENERATION_CONFIG as CONFIG } from '../config/arenaGeneration.ts';
import type { ArenaTopologyDraft, PointSpec } from './ArenaTopology.ts';

const blockedAt=(x:number,y:number,walls:RectSpec[],padding:number=CONFIG.enemyNavigationPadding):boolean=>walls.some((r)=>x>=r.x-padding&&x<=r.x+r.w+padding&&y>=r.y-padding&&y<=r.y+r.h+padding);
export const validateTopologyDraft=(draft:ArenaTopologyDraft,sites:PointSpec[]):{valid:boolean;failures:string[]}=>{
  const failures:string[]=[];
  const cell=CONFIG.navigationCellSize,cols=Math.ceil(draft.bounds.w/cell),rows=Math.ceil(draft.bounds.h/cell);
  const walkable=new Uint8Array(cols*rows);
  for(let y=0;y<rows;y+=1)for(let x=0;x<cols;x+=1){const wx=draft.bounds.x+x*cell+cell/2,wy=draft.bounds.y+y*cell+cell/2;walkable[y*cols+x]=blockedAt(wx,wy,draft.walls)?0:1;}
  const toCell=(p:PointSpec)=>({x:Math.max(0,Math.min(cols-1,Math.floor((p.x-draft.bounds.x)/cell))),y:Math.max(0,Math.min(rows-1,Math.floor((p.y-draft.bounds.y)/cell)))});
  const start=toCell(draft.playerCandidates[0]);
  if(!walkable[start.y*cols+start.x])failures.push('player-spawn-blocked');
  const visited=new Uint8Array(cols*rows),queue=[start];visited[start.y*cols+start.x]=1;
  for(let head=0;head<queue.length;head+=1){const current=queue[head];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=current.x+dx,y=current.y+dy,index=y*cols+x;if(x<0||y<0||x>=cols||y>=rows||visited[index]||!walkable[index])continue;visited[index]=1;queue.push({x,y});}}
  for(const site of sites){const c=toCell(site);if(blockedAt(site.x,site.y,draft.walls,92))failures.push('objective-clearance');if(!visited[c.y*cols+c.x])failures.push('objective-unreachable');}
  for(const spawn of draft.enemySpawns){const c=toCell(spawn);if(blockedAt(spawn.x,spawn.y,draft.walls,30))failures.push('enemy-spawn-blocked');if(!visited[c.y*cols+c.x])failures.push('enemy-spawn-disconnected');}
  return {valid:failures.length===0,failures:[...new Set(failures)]};
};
