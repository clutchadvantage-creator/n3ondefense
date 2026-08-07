import Phaser from 'phaser';
import type { ArenaLayout, ArenaTemplate, GeneratedObstacle, RectSpec } from '../types.ts';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants.ts';
import { ARENA_GENERATION_CONFIG as CONFIG } from '../config/arenaGeneration.ts';
import { ArenaThemeManager } from './ArenaThemeManager.ts';
import { ObstacleFactory } from './ObstacleFactory.ts';
import { SeededRandom } from './SeededRandom.ts';
import { ArenaValidator } from './ArenaValidator.ts';
import { generateArenaTopology, type PointSpec } from './ArenaTopology.ts';
import { ArenaHistory, createArenaFingerprint, type ArenaFingerprint } from './ArenaFingerprint.ts';

const pointClear = (point:PointSpec, rects:RectSpec[], clearance:number):boolean => rects.every((r)=>point.x<r.x-clearance||point.x>r.x+r.w+clearance||point.y<r.y-clearance||point.y>r.y+r.h+clearance);
const obstacleRect = (obstacle:GeneratedObstacle):RectSpec => ({x:obstacle.x-obstacle.w/2,y:obstacle.y-obstacle.h/2,w:obstacle.w,h:obstacle.h});
const vector = (point:PointSpec):Phaser.Math.Vector2 => new Phaser.Math.Vector2(Math.round(point.x),Math.round(point.y));

export class ArenaGenerator {
  private static readonly history = new ArenaHistory();
  private static forcedArchetype:ArenaTemplate|null=null;

  static generate(seed:number, requestedArchetype:ArenaTemplate, round:number, siteCount:number):ArenaLayout {
    const archetype=this.forcedArchetype??requestedArchetype;
    let best:{layout:ArenaLayout;fingerprint:ArenaFingerprint}|null=null;
    for(let attempt=1;attempt<=CONFIG.maximumAttemptsPerArchetype;attempt+=1){
      const attemptSeed=(seed^Math.imul(round+31,0x85ebca6b)^Math.imul(attempt,0x9e3779b1))>>>0;
      const random=new SeededRandom(attemptSeed||1);
      const topology=generateArenaTopology(archetype,attemptSeed||1);
      const theme=ArenaThemeManager.pick(random);
      const selectedSites=this.selectSites(random,topology.objectiveCandidates,siteCount);
      const player=topology.playerCandidates[random.int(0,topology.playerCandidates.length-1)];
      const protectedPoints=[player,...selectedSites,...topology.enemySpawns];
      const obstacles=this.addSecondaryObstacles(random,topology.bounds,topology.walls,protectedPoints,archetype,round);
      const decorations=this.createDecorations(random,topology.bounds,archetype);
      const placeholder = {
        attempt,bounds:topology.bounds,openSpacePercentage:0,majorStructureCount:topology.majorStructureCount,
        chokePointCount:topology.chokePointCount,connectedRegionCount:topology.connectedRegionCount,symmetryScore:0,
        orientationBias:topology.orientationBias,occupancy:[],similarityScore:0,validation:[]
      };
      const layout:ArenaLayout={seed,template:archetype,theme,walls:topology.walls,obstacles,playerSpawn:vector(player),enemySpawns:topology.enemySpawns.map(vector),bombSites:selectedSites.map(vector),decorativeNeon:decorations,generation:placeholder};
      const validation=ArenaValidator.validateDetailed(layout,WORLD_WIDTH,WORLD_HEIGHT);
      if(!validation.valid) continue;
      const fingerprint=createArenaFingerprint({archetype,bounds:topology.bounds,blockers:[...topology.walls,...obstacles.map(obstacleRect)],bombSites:selectedSites,enemySpawns:topology.enemySpawns,attempt,majorStructureCount:topology.majorStructureCount,chokePointCount:topology.chokePointCount,connectedRegionCount:topology.connectedRegionCount,orientationBias:topology.orientationBias,validation:validation.checks});
      fingerprint.similarityScore=this.history.highestSimilarity(fingerprint);
      layout.generation=fingerprint;
      if(!best||fingerprint.similarityScore<best.fingerprint.similarityScore)best={layout,fingerprint};
      if(fingerprint.similarityScore<=CONFIG.similarityThreshold){this.history.add(fingerprint);this.debug(layout,round);return layout;}
    }
    if(best){this.history.add(best.fingerprint);this.debug(best.layout,round,'similarity fallback');return best.layout;}
    const fallback=this.buildFallback(seed,archetype,siteCount);
    this.history.add(fallback.generation as ArenaFingerprint);this.debug(fallback,round,'validation fallback');return fallback;
  }

  private static selectSites(random:SeededRandom,candidates:PointSpec[],count:number):PointSpec[]{
    const shuffled=random.shuffle([...candidates]);
    const selected:PointSpec[]=[];
    for(const candidate of shuffled){if(selected.every((site)=>Math.hypot(site.x-candidate.x,site.y-candidate.y)>=200))selected.push(candidate);if(selected.length>=count)break;}
    return selected;
  }

  private static addSecondaryObstacles(random:SeededRandom,bounds:RectSpec,walls:RectSpec[],protectedPoints:PointSpec[],archetype:ArenaTemplate,round:number):GeneratedObstacle[]{
    const factory=new ObstacleFactory(random);
    const ranges:Record<ArenaTemplate,[number,number]>={
      'open-field':[8,15],islands:[3,8],fortress:[3,7],ring:[2,6],split:[4,9],'hub-spoke':[4,8],canyon:[2,6],maze:[1,4],chambers:[2,5],'asymmetric-clusters':[2,5],crossroads:[3,7],perimeter:[3,7]
    };
    const [min,max]=ranges[archetype];
    const target=random.int(min,Math.min(max,min+Math.floor(round/5)+4));
    const obstacles:GeneratedObstacle[]=[];
    for(let attempt=0;attempt<target*15&&obstacles.length<target;attempt+=1){
      const candidate=factory.createAt(random.int(bounds.x+90,bounds.x+bounds.w-90),random.int(bounds.y+90,bounds.y+bounds.h-90),26,archetype==='open-field'?88:64);
      const rect=obstacleRect(candidate);
      const center={x:candidate.x,y:candidate.y};
      if(!pointClear(center,walls,35)||protectedPoints.some((p)=>Math.hypot(p.x-center.x,p.y-center.y)<150)||obstacles.some((o)=>!pointClear(center,[obstacleRect(o)],45)))continue;
      if(rect.x<bounds.x+35||rect.y<bounds.y+35||rect.x+rect.w>bounds.x+bounds.w-35||rect.y+rect.h>bounds.y+bounds.h-35)continue;
      obstacles.push(candidate);
    }
    return obstacles;
  }

  private static createDecorations(random:SeededRandom,bounds:RectSpec,archetype:ArenaTemplate):RectSpec[]{
    const count=archetype==='open-field'?24:18;
    return Array.from({length:count},()=>({x:random.int(bounds.x+40,bounds.x+bounds.w-90),y:random.int(bounds.y+40,bounds.y+bounds.h-40),w:random.int(24,90),h:random.int(5,14)}));
  }

  private static buildFallback(seed:number,archetype:ArenaTemplate,siteCount:number):ArenaLayout{
    const random=new SeededRandom(seed^0x71f4a7c1);
    const bounds={x:180,y:170,w:2040,h:1260};
    const walls=[{x:bounds.x,y:bounds.y,w:bounds.w,h:30},{x:bounds.x,y:bounds.y+bounds.h-30,w:bounds.w,h:30},{x:bounds.x,y:bounds.y,w:30,h:bounds.h},{x:bounds.x+bounds.w-30,y:bounds.y,w:30,h:bounds.h}];
    const sites=[{x:650,y:480},{x:1700,y:500},{x:720,y:1120},{x:1720,y:1100}].slice(0,siteCount);
    const spawns=[{x:240,y:240},{x:2160,y:240},{x:2160,y:1360},{x:240,y:1360}];
    const fingerprint=createArenaFingerprint({archetype,bounds,blockers:walls,bombSites:sites,enemySpawns:spawns,attempt:CONFIG.maximumAttemptsPerArchetype+1,majorStructureCount:0,chokePointCount:0,connectedRegionCount:1,orientationBias:{horizontal:.5,vertical:.5,diagonal:0},validation:['safe-fallback']});
    fingerprint.similarityScore=this.history.highestSimilarity(fingerprint);
    return {seed,template:archetype,theme:ArenaThemeManager.pick(random),walls,obstacles:[],playerSpawn:new Phaser.Math.Vector2(1200,800),enemySpawns:spawns.map(vector),bombSites:sites.map(vector),decorativeNeon:this.createDecorations(random,bounds,archetype),generation:fingerprint};
  }

  static resetHistory():void{this.history.clear();}
  static forceArenaType(archetype:ArenaTemplate|null):void{this.forcedArchetype=archetype;}
  static recentFingerprints():readonly ArenaFingerprint[]{return this.history.recent();}
  private static debug(layout:ArenaLayout,round:number,note='accepted'):void{if(!import.meta.env.DEV)return;const m=layout.generation;console.info(`[Arena] ${note}`,{seed:layout.seed,round,archetype:layout.template,dimensions:`${m.bounds.w}x${m.bounds.h}`,attempt:m.attempt,similarity:m.similarityScore.toFixed(3),recent:this.history.recentArchetypes(),obstacles:layout.obstacles.length,walls:layout.walls.length,openSpace:m.openSpacePercentage,bombSites:layout.bombSites.length,spawns:layout.enemySpawns.length,validation:m.validation});}
}
