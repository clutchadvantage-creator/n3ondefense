import { getDifficultyCurve } from '../config/balance';

export class DifficultyManager {
  static multiplier(round: number, destroyedSites: number, remainingSites: number): number {
    void remainingSites;
    return getDifficultyCurve(round, destroyedSites).healthMultiplier;
  }
}
