import type { ArenaGenerationMetadata, ArenaTemplate, RectSpec } from '../types.ts';
import { ARENA_GENERATION_CONFIG as CONFIG } from '../config/arenaGeneration.ts';

export interface ArenaFingerprint extends ArenaGenerationMetadata {
  archetype: ArenaTemplate;
  bombDistribution: number[];
  spawnDistribution: number[];
  obstacleDensity: number;
  largeStructureCount: number;
  smallStructureCount: number;
}
interface PointLike { x: number; y: number }

const intersects = (a: RectSpec, b: RectSpec): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const distribution = (points: PointLike[], bounds: RectSpec): number[] => {
  const result = [0,0,0,0];
  for (const point of points) {
    const x = (point.x-bounds.x)/bounds.w, y=(point.y-bounds.y)/bounds.h;
    result[(y>=.5?2:0)+(x>=.5?1:0)] += 1;
  }
  return result;
};
const cosineSimilarity = (a: number[], b: number[]): number => {
  let dot=0, aa=0, bb=0;
  for (let i=0;i<Math.min(a.length,b.length);i+=1) { dot+=a[i]*b[i]; aa+=a[i]*a[i]; bb+=b[i]*b[i]; }
  return aa && bb ? dot/Math.sqrt(aa*bb) : 0;
};
const occupancySimilarity = (a:number[],b:number[]):number => 1-a.reduce((sum,value,index)=>sum+Math.abs(value-(b[index]??0)),0)/Math.max(1,a.length);

export const createArenaFingerprint = (input: {
  archetype: ArenaTemplate; bounds: RectSpec; blockers: RectSpec[]; bombSites: PointLike[]; enemySpawns: PointLike[];
  attempt: number; majorStructureCount: number; chokePointCount: number; connectedRegionCount: number;
  orientationBias: ArenaFingerprint['orientationBias']; validation: string[];
}): ArenaFingerprint => {
  const size=CONFIG.fingerprintGridSize;
  const occupancy:number[]=[];
  for(let gy=0;gy<size;gy+=1) for(let gx=0;gx<size;gx+=1) {
    const cell={x:input.bounds.x+gx*input.bounds.w/size,y:input.bounds.y+gy*input.bounds.h/size,w:input.bounds.w/size,h:input.bounds.h/size};
    const blockedArea=input.blockers.reduce((sum,r)=>intersects(cell,r)?sum+Math.min(cell.w*cell.h,r.w*r.h):sum,0);
    occupancy.push(Math.min(1,blockedArea/(cell.w*cell.h)));
  }
  const blocked=occupancy.reduce((sum,value)=>sum+value,0)/occupancy.length;
  let mirrorDifference=0;
  for(let y=0;y<size;y+=1) for(let x=0;x<Math.floor(size/2);x+=1) mirrorDifference+=Math.abs(occupancy[y*size+x]-occupancy[y*size+(size-1-x)]);
  const symmetryScore=1-mirrorDifference/(size*Math.floor(size/2));
  const large=input.blockers.filter(r=>r.w*r.h>12000).length;
  return {
    archetype:input.archetype, attempt:input.attempt, bounds:input.bounds, occupancy,
    openSpacePercentage:Math.round((1-blocked)*1000)/10, obstacleDensity:blocked,
    majorStructureCount:input.majorStructureCount, largeStructureCount:large, smallStructureCount:input.blockers.length-large,
    chokePointCount:input.chokePointCount, connectedRegionCount:input.connectedRegionCount,
    bombDistribution:distribution(input.bombSites,input.bounds),spawnDistribution:distribution(input.enemySpawns,input.bounds),
    symmetryScore:Math.max(0,Math.min(1,symmetryScore)),orientationBias:input.orientationBias,similarityScore:0,validation:input.validation
  };
};

export const compareArenaFingerprints = (a:ArenaFingerprint,b:ArenaFingerprint):number => {
  const occupancy=occupancySimilarity(a.occupancy,b.occupancy);
  const dimensions=1-Math.min(1,(Math.abs(a.bounds.w/b.bounds.w-1)+Math.abs(a.bounds.h/b.bounds.h-1))/1.2);
  const density=1-Math.min(1,Math.abs(a.obstacleDensity-b.obstacleDensity)*3);
  const bombs=cosineSimilarity(a.bombDistribution,b.bombDistribution);
  const spawns=cosineSimilarity(a.spawnDistribution,b.spawnDistribution);
  const topology=1-Math.min(1,(Math.abs(a.chokePointCount-b.chokePointCount)+Math.abs(a.connectedRegionCount-b.connectedRegionCount))/10);
  const sameArchetype=a.archetype===b.archetype?1:0;
  return Math.max(0,Math.min(1,occupancy*.35+dimensions*.1+density*.1+bombs*.1+spawns*.08+topology*.12+sameArchetype*.15));
};

export class ArenaHistory {
  private readonly fingerprints:ArenaFingerprint[]=[];
  recent():readonly ArenaFingerprint[]{return this.fingerprints;}
  add(fingerprint:ArenaFingerprint):void { this.fingerprints.push(fingerprint); if(this.fingerprints.length>CONFIG.recentFingerprintCount)this.fingerprints.shift(); }
  highestSimilarity(fingerprint:ArenaFingerprint):number { return this.fingerprints.reduce((max,recent)=>Math.max(max,compareArenaFingerprints(fingerprint,recent)),0); }
  recentArchetypes():ArenaTemplate[]{return this.fingerprints.slice(-CONFIG.archetypeCooldownRounds).map(entry=>entry.archetype);}
  clear():void{this.fingerprints.length=0;}
}
