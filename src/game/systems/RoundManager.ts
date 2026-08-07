import { ARENA_TEMPLATES, getRoundSiteCount } from '../config/gameplay';
import type { ArenaTemplate, ObjectiveMode, RoundDefinition } from '../types';
import { SeededRandom } from './SeededRandom';
import { ARENA_GENERATION_CONFIG } from '../config/arenaGeneration.ts';

export class RoundManager {
  round = 1;
  private baseSeed: number;
  private readonly objectiveMode: ObjectiveMode;

  constructor(seed: number, objectiveMode: ObjectiveMode, startRound = 1) {
    this.baseSeed = seed;
    this.objectiveMode = objectiveMode;
    this.round = Math.max(1, Math.floor(startRound));
  }

  get seedBase(): number {
    return this.baseSeed;
  }

  get mode(): ObjectiveMode {
    return this.objectiveMode;
  }

  currentDefinition(): RoundDefinition {
    const recent:ArenaTemplate[]=[];
    let template=ARENA_TEMPLATES[0];
    for(let candidateRound=1;candidateRound<=this.round;candidateRound+=1){
      const random=new SeededRandom(this.baseSeed^Math.imul(candidateRound,0x45d9f3b));
      const candidates=random.shuffle([...ARENA_TEMPLATES]);
      template=candidates.find((candidate)=>!recent.includes(candidate))??candidates[0];
      recent.push(template);
      if(recent.length>ARENA_GENERATION_CONFIG.archetypeCooldownRounds)recent.shift();
    }
    const siteCount = getRoundSiteCount(this.round);
    const roundSeed = (this.baseSeed ^ Math.imul(this.round, 0x9e3779b1) ^ Math.imul(Math.floor((this.round-1)/ARENA_TEMPLATES.length) + 7, 0x85ebca6b)) >>> 0;
    return {
      round: this.round,
      seed: roundSeed || this.round,
      template,
      siteCount,
      objectiveMode: this.objectiveMode
    };
  }

  nextRound(): RoundDefinition {
    this.round += 1;
    return this.currentDefinition();
  }
}
