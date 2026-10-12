import type { GridPathfinder } from '../systems/GridPathfinder.ts';
import { DYNAMIC_FLOOR as C } from '../config/dynamicFloor.ts';
import { circleTouches, sweepRect, type FloorPanel, type FloorPoint } from './DynamicFloorModel.ts';
export interface FloorFence {x1:number;y1:number;x2:number;y2:number;hp:number;expiresAt:number}
/** Full-open hatches are a superset of every intermediate gap. Existing GridPathfinder
 * validates normal walking access, with static walls and live rigid fences in the same query. */
export function validateFloorConnectivity(pathfinder:GridPathfinder,panels:readonly FloorPanel[],
  required:readonly FloorPoint[],fences:readonly FloorFence[],now:number,
  fenceBlocked:(cx:number,cy:number)=>boolean):boolean {
  for(const p of panels)for(const f of fences){
    if(f.hp>0&&f.expiresAt>now&&sweepRect(f.x1,f.y1,f.x2,f.y2,28,p)<1)return false;
  }
  const blocked=(cx:number,cy:number)=>fenceBlocked(cx,cy)||panels.some(p=>circleTouches(pathfinder.cellCenterX(cx),pathfinder.cellCenterY(cy),C.navigationPadding+C.navigationCellSize*.72,p));
  const origin=required[0];if(!origin)return false;
  for(const point of required){
    if(panels.some(p=>circleTouches(point.x,point.y,C.spawnPadding,p)))return false;
    const path=pathfinder.findPath(origin.x,origin.y,point.x,point.y,{cellBlocked:blocked,maxIterations:10_000,smooth:false});
    if(!path.length)return false;
    const end=path[path.length-1];if(Math.hypot(end.x-point.x,end.y-point.y)>C.navigationCellSize*1.5)return false;
  }
  return true;
}
