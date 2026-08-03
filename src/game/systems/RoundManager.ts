import { ARENA_TEMPLATES, getRoundSiteCount } from '../config/gameplay';
import type { ArenaTemplate, ObjectiveMode, RoundDefinition } from '../types';
import { SeededRandom } from './SeededRandom';

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
    const random = new SeededRandom(this.baseSeed + this.round * 17);
    const siteCount = getRoundSiteCount(this.round);
    const template = random.pick(ARENA_TEMPLATES) as ArenaTemplate;
    return {
      round: this.round,
      seed: this.baseSeed + this.round * 17,
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
