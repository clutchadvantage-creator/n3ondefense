import Phaser from 'phaser';
import type { ArenaLayout, ArenaTemplate, GeneratedObstacle, RectSpec } from '../types.ts';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants.ts';
import { ARENA_ARCHETYPES, ARENA_GENERATION_CONFIG as CONFIG } from '../config/arenaGeneration.ts';
import { ArenaThemeManager } from './ArenaThemeManager.ts';
import { ObstacleFactory } from './ObstacleFactory.ts';
import { SeededRandom } from './SeededRandom.ts';
import { ArenaValidator } from './ArenaValidator.ts';
import { generateArenaTopology, type PointSpec } from './ArenaTopology.ts';
import { ArenaHistory, createArenaFingerprint, type ArenaFingerprint } from './ArenaFingerprint.ts';
import { createsNarrowPassage, repairNarrowPassages } from './ArenaTraversal.ts';
import { createSafeArenaFallbacks, type SafeArenaFallbackDraft } from './ArenaFallbacks.ts';
import { createArenaSmashablePlacements } from '../arena/ArenaSmashablePlacement.ts';

const pointClear = (point:PointSpec, rects:RectSpec[], clearance:number):boolean => rects.every((r)=>point.x<r.x-clearance||point.x>r.x+r.w+clearance||point.y<r.y-clearance||point.y>r.y+r.h+clearance);
const obstacleRect = (obstacle:GeneratedObstacle):RectSpec => ({x:obstacle.x-obstacle.w/2,y:obstacle.y-obstacle.h/2,w:obstacle.w,h:obstacle.h});
const vector = (point:PointSpec):Phaser.Math.Vector2 => new Phaser.Math.Vector2(Math.round(point.x),Math.round(point.y));

interface GenerationDiagnostics {
  candidateAttempts: number;
  validationRejected: number;
  similarityRejected: number;
  exactRejected: number;
  openRepeatRejected: number;
  fallbackUsed: boolean;
}

export class ArenaGenerator {
  private static readonly history = new ArenaHistory();
  private static forcedArchetype:ArenaTemplate|null=null;

  static generate(seed:number, requestedArchetype:ArenaTemplate, round:number, siteCount:number):ArenaLayout {
    const preferredArchetype=this.forcedArchetype??requestedArchetype;
    const archetypes=this.forcedArchetype
      ? [preferredArchetype]
      : this.history.orderArchetypes(preferredArchetype,ARENA_ARCHETYPES,seed^round)
        .slice(0,1+CONFIG.alternateArchetypeCount);
    const diagnostics:GenerationDiagnostics={candidateAttempts:0,validationRejected:0,similarityRejected:0,exactRejected:0,openRepeatRejected:0,fallbackUsed:false};
    const alternateAttempts=Math.max(1,Math.floor((CONFIG.maximumCandidateAttempts-CONFIG.preferredArchetypeAttempts)/Math.max(1,archetypes.length-1)));

    for(let archetypeIndex=0;archetypeIndex<archetypes.length;archetypeIndex+=1){
      const archetype=archetypes[archetypeIndex];
      const attemptsForArchetype=archetypeIndex===0?CONFIG.preferredArchetypeAttempts:alternateAttempts;
      for(let localAttempt=1;localAttempt<=attemptsForArchetype&&diagnostics.candidateAttempts<CONFIG.maximumCandidateAttempts;localAttempt+=1){
        diagnostics.candidateAttempts+=1;
        const attempt=diagnostics.candidateAttempts;
        const archetypeSalt=Math.imul(ARENA_ARCHETYPES.indexOf(archetype)+1,0x27d4eb2d);
        const attemptSeed=(seed^Math.imul(round+31,0x85ebca6b)^Math.imul(attempt,0x9e3779b1)^archetypeSalt)>>>0;
        const random=new SeededRandom(attemptSeed||1);
        const topology=generateArenaTopology(archetype,attemptSeed||1);
        const traversalRepair=repairNarrowPassages(topology.walls,CONFIG.minimumCorridorWidth,CONFIG.boundaryThickness);
        topology.walls=traversalRepair.walls;
        const selectedSites=this.selectSites(random,topology.objectiveCandidates,siteCount);
        if(selectedSites.length!==siteCount){diagnostics.validationRejected+=1;continue;}
        const player=topology.playerCandidates[random.int(0,topology.playerCandidates.length-1)];
        const protectedPoints=[player,...selectedSites,...topology.enemySpawns];
        const obstacles=this.addSecondaryObstacles(random,topology.bounds,topology.walls,protectedPoints,archetype,round);
        const placeholder = {
          attempt,bounds:topology.bounds,openSpacePercentage:0,majorStructureCount:topology.majorStructureCount,
          chokePointCount:topology.chokePointCount,connectedRegionCount:topology.connectedRegionCount,symmetryScore:0,
          orientationBias:topology.orientationBias,occupancy:[],similarityScore:0,validation:[]
        };
        const layout:ArenaLayout={
          seed,template:archetype,theme:ArenaThemeManager.pick(random),walls:topology.walls,obstacles,smashables:[],
          playerSpawn:vector(player),enemySpawns:topology.enemySpawns.map(vector),bombSites:selectedSites.map(vector),
          decorativeNeon:this.createDecorations(random,topology.bounds,archetype),generation:placeholder
        };
        const validation=ArenaValidator.validateDetailed(layout,WORLD_WIDTH,WORLD_HEIGHT);
        if(!validation.valid){diagnostics.validationRejected+=1;continue;}
        const fingerprint=createArenaFingerprint({
          archetype,bounds:topology.bounds,blockers:[...topology.walls,...obstacles.map(obstacleRect)],
          bombSites:selectedSites,enemySpawns:topology.enemySpawns,attempt,
          majorStructureCount:topology.majorStructureCount,chokePointCount:topology.chokePointCount,
          connectedRegionCount:topology.connectedRegionCount,orientationBias:topology.orientationBias,validation:validation.checks
        });
        const progress=Math.max(0,(attempt-CONFIG.preferredArchetypeAttempts)/Math.max(1,CONFIG.maximumCandidateAttempts-CONFIG.preferredArchetypeAttempts));
        const assessment=this.history.assess(fingerprint,CONFIG.maximumSimilarityRelaxation*progress);
        fingerprint.similarityScore=assessment.score;
        fingerprint.closestHistoryAge=assessment.closestHistoryAge;
        fingerprint.similarityRejected=diagnostics.similarityRejected;
        fingerprint.validationRejected=diagnostics.validationRejected;
        layout.generation=fingerprint;
        if(assessment.reject){
          diagnostics.similarityRejected+=1;
          if(assessment.exact)diagnostics.exactRejected+=1;
          if(assessment.openRepeat)diagnostics.openRepeatRejected+=1;
          continue;
        }
        fingerprint.similarityRejected=diagnostics.similarityRejected;
        layout.smashables=createArenaSmashablePlacements(layout,round);
        this.history.add(fingerprint);
        this.debug(layout,round,traversalRepair.widenedPassages>0?`accepted; widened ${traversalRepair.widenedPassages} passage(s)`:'accepted',diagnostics);
        return layout;
      }
    }

    diagnostics.fallbackUsed=true;
    const fallback=this.buildFallback(seed,round,preferredArchetype,siteCount,diagnostics);
    this.history.add(fallback.generation as ArenaFingerprint);
    this.debug(fallback,round,'diverse safe fallback',diagnostics);
    return fallback;
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
      const existingObstacleRects=obstacles.map(obstacleRect);
      if(!pointClear(center,walls,35)
        || protectedPoints.some((p)=>Math.hypot(p.x-center.x,p.y-center.y)<150)
        || obstacles.some((o)=>!pointClear(center,[obstacleRect(o)],45))
        || createsNarrowPassage(rect,[...walls,...existingObstacleRects],CONFIG.minimumCorridorWidth))continue;
      if(rect.x<bounds.x+35||rect.y<bounds.y+35||rect.x+rect.w>bounds.x+bounds.w-35||rect.y+rect.h>bounds.y+bounds.h-35)continue;
      obstacles.push(candidate);
    }
    return obstacles;
  }

  private static createDecorations(random:SeededRandom,bounds:RectSpec,archetype:ArenaTemplate):RectSpec[]{
    const count=archetype==='open-field'?24:18;
    return Array.from({length:count},()=>({x:random.int(bounds.x+40,bounds.x+bounds.w-90),y:random.int(bounds.y+40,bounds.y+bounds.h-40),w:random.int(24,90),h:random.int(5,14)}));
  }

  private static buildFallback(seed:number,round:number,_preferredArchetype:ArenaTemplate,siteCount:number,diagnostics:GenerationDiagnostics):ArenaLayout{
    let best:{layout:ArenaLayout;fingerprint:ArenaFingerprint;score:number}|null=null;
    const drafts=createSafeArenaFallbacks(seed,round,siteCount);
    for(let index=0;index<drafts.length;index+=1){
      const draft=drafts[index];
      const random=new SeededRandom((seed^Math.imul(index+1,0x71f4a7c1))>>>0);
      const placeholder={
        attempt:CONFIG.maximumCandidateAttempts+index+1,bounds:draft.bounds,openSpacePercentage:0,
        majorStructureCount:draft.majorStructureCount,chokePointCount:draft.chokePointCount,
        connectedRegionCount:draft.connectedRegionCount,symmetryScore:0,orientationBias:draft.orientationBias,
        occupancy:[],similarityScore:0,validation:[]
      };
      const layout:ArenaLayout={
        seed,template:draft.archetype,theme:ArenaThemeManager.pick(random),walls:draft.walls.map((wall)=>({...wall})),obstacles:[],smashables:[],
        playerSpawn:vector(draft.playerSpawn),enemySpawns:draft.enemySpawns.map(vector),bombSites:draft.bombSites.map(vector),
        decorativeNeon:this.createDecorations(random,draft.bounds,draft.archetype),generation:placeholder
      };
      const validation=ArenaValidator.validateDetailed(layout,WORLD_WIDTH,WORLD_HEIGHT);
      if(!validation.valid){diagnostics.validationRejected+=1;continue;}
      const fingerprint=this.fingerprintFallback(draft,validation.checks,index,diagnostics);
      const assessment=this.history.assess(fingerprint,CONFIG.maximumSimilarityRelaxation);
      fingerprint.similarityScore=assessment.score;
      fingerprint.closestHistoryAge=assessment.closestHistoryAge;
      fingerprint.fallbackUsed=true;
      layout.generation=fingerprint;
      layout.smashables=createArenaSmashablePlacements(layout,round);
      const score=assessment.score+(assessment.exactPrevious?10:assessment.reject?1:0);
      if(!best||score<best.score)best={layout,fingerprint,score};
      if(!assessment.reject)return layout;
    }
    if(best&&!this.history.assess(best.fingerprint).exactPrevious)return best.layout;
    throw new Error('Arena generation exhausted all validated normal and fallback layouts.');
  }

  private static fingerprintFallback(draft:SafeArenaFallbackDraft,validation:string[],index:number,diagnostics:GenerationDiagnostics):ArenaFingerprint{
    const fingerprint=createArenaFingerprint({
      archetype:draft.archetype,bounds:draft.bounds,blockers:draft.walls,bombSites:draft.bombSites,
      enemySpawns:draft.enemySpawns,attempt:CONFIG.maximumCandidateAttempts+index+1,
      majorStructureCount:draft.majorStructureCount,chokePointCount:draft.chokePointCount,
      connectedRegionCount:draft.connectedRegionCount,orientationBias:draft.orientationBias,
      validation:[`safe-fallback:${draft.id}`,...validation]
    });
    fingerprint.similarityRejected=diagnostics.similarityRejected;
    fingerprint.validationRejected=diagnostics.validationRejected;
    return fingerprint;
  }

  static resetHistory():void{this.history.clear();}
  static forceArenaType(archetype:ArenaTemplate|null):void{this.forcedArchetype=archetype;}
  static recentFingerprints():readonly ArenaFingerprint[]{return this.history.recent();}
  private static debug(layout:ArenaLayout,round:number,note='accepted',diagnostics?:GenerationDiagnostics):void{if(!import.meta.env.DEV)return;const m=layout.generation;console.info(`[Arena] ${note}`,{seed:layout.seed,round,archetype:layout.template,fingerprint:m.fingerprintHash,dimensions:`${m.bounds.w}x${m.bounds.h}`,attempt:m.attempt,similarity:m.similarityScore.toFixed(3),closestHistoryAge:m.closestHistoryAge,recent:this.history.recentArchetypes(),obstacles:layout.obstacles.length,walls:layout.walls.length,openSpace:m.openSpacePercentage,bombSites:layout.bombSites.length,spawns:layout.enemySpawns.length,rejections:diagnostics,fallback:m.fallbackUsed??false,validation:m.validation});}
}
