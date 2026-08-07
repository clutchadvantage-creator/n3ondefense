import { ARENA_ARCHETYPES as ARENA_TEMPLATES, ARENA_GENERATION_CONFIG as CONFIG } from '../src/game/config/arenaGeneration.ts';
import { getRoundSiteCountBalanced as getRoundSiteCount } from '../src/game/config/balance/index.ts';
import type { ArenaTemplate } from '../src/game/types.ts';
import { ArenaHistory, createArenaFingerprint } from '../src/game/systems/ArenaFingerprint.ts';
import { generateArenaTopology } from '../src/game/systems/ArenaTopology.ts';
import { validateTopologyDraft } from '../src/game/systems/ArenaTopologyValidator.ts';
import { SeededRandom } from '../src/game/systems/SeededRandom.ts';

const baseSeed=0x4e334f4e;
const history=new ArenaHistory();
const recent:ArenaTemplate[]=[];
const rows:Array<Record<string,string|number>>=[];
for(let round=1;round<=30;round+=1){
  const selector=new SeededRandom(baseSeed^Math.imul(round,0x45d9f3b));
  const archetype=selector.shuffle([...ARENA_TEMPLATES]).find((candidate)=>!recent.includes(candidate))??ARENA_TEMPLATES[0];
  recent.push(archetype);if(recent.length>CONFIG.archetypeCooldownRounds)recent.shift();
  const roundSeed=(baseSeed^Math.imul(round,0x9e3779b1)^Math.imul(Math.floor((round-1)/ARENA_TEMPLATES.length)+7,0x85ebca6b))>>>0;
  let accepted=false;
  const rejectionReasons:string[]=[];
  for(let attempt=1;attempt<=CONFIG.maximumAttemptsPerArchetype;attempt+=1){
    const attemptSeed=(roundSeed^Math.imul(round+31,0x85ebca6b)^Math.imul(attempt,0x9e3779b1))>>>0;
    const draft=generateArenaTopology(archetype,attemptSeed||1);
    const sites=draft.objectiveCandidates.slice(0,getRoundSiteCount(round));
    const validation=validateTopologyDraft(draft,sites);if(!validation.valid){rejectionReasons.push(validation.failures.join(','));continue;}
    const fingerprint=createArenaFingerprint({archetype,bounds:draft.bounds,blockers:draft.walls,bombSites:sites,enemySpawns:draft.enemySpawns,attempt,majorStructureCount:draft.majorStructureCount,chokePointCount:draft.chokePointCount,connectedRegionCount:draft.connectedRegionCount,orientationBias:draft.orientationBias,validation:['headless-path-valid']});
    fingerprint.similarityScore=history.highestSimilarity(fingerprint);if(fingerprint.similarityScore>CONFIG.similarityThreshold){rejectionReasons.push(`similar:${fingerprint.similarityScore.toFixed(3)}`);continue;}
    history.add(fingerprint);rows.push({round,archetype,size:`${draft.bounds.w}x${draft.bounds.h}`,aspect:(draft.bounds.w/draft.bounds.h).toFixed(2),open:`${fingerprint.openSpacePercentage}%`,regions:draft.connectedRegionCount,chokes:draft.chokePointCount,walls:draft.walls.length,attempt,similarity:fingerprint.similarityScore.toFixed(3)});accepted=true;break;
  }
  if(!accepted)throw new Error(`No valid dissimilar arena for round ${round} (${archetype}): ${[...new Set(rejectionReasons)].join(' | ')}`);
}
console.table(rows);
const archetypeCount=new Set(rows.map((row)=>row.archetype)).size;
const aspectCount=new Set(rows.map((row)=>row.aspect)).size;
if(archetypeCount<10)throw new Error(`Only ${archetypeCount} archetypes represented`);
if(aspectCount<8)throw new Error(`Only ${aspectCount} aspect ratios represented`);
if(rows.some((row)=>Number(row.similarity)>CONFIG.similarityThreshold))throw new Error('Similarity threshold exceeded');
console.log(`PASS: 30 deterministic arenas, ${archetypeCount} archetypes, ${aspectCount} aspect ratios, no accepted similarity above ${CONFIG.similarityThreshold}.`);
