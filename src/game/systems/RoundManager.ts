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
    const cycle = Math.floor((this.round - 1) / ARENA_TEMPLATES.length);
    const index = (this.round - 1) % ARENA_TEMPLATES.length;
    const random = new SeededRandom(this.baseSeed ^ Math.imul(cycle + 1, 0x45d9f3b));
    const templates = random.shuffle([...ARENA_TEMPLATES]);
    // Prevent a cycle boundary from placing the same macro layout back-to-back.
    if (cycle > 0 && index === 0 && templates.length > 1) {
      const previousRandom = new SeededRandom(this.baseSeed ^ Math.imul(cycle, 0x45d9f3b));
      const previousTemplates = previousRandom.shuffle([...ARENA_TEMPLATES]);
      if (templates[0] === previousTemplates.at(-1)) {
        [templates[0], templates[1]] = [templates[1], templates[0]];
      }
    }
    const siteCount = getRoundSiteCount(this.round);
    const template = templates[index] as ArenaTemplate;
    const roundSeed = (this.baseSeed ^ Math.imul(this.round, 0x9e3779b1) ^ Math.imul(cycle + 7, 0x85ebca6b)) >>> 0;
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
