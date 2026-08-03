import type { BombSiteRuntime } from '../types';
import { BombSiteState } from '../types';

export class ObjectiveManager {
  getSummary(sites: BombSiteRuntime[]): string {
    const destroyed = sites.filter((s) => s.state === BombSiteState.Destroyed).length;
    return `OBJECTIVES: ${destroyed} / ${sites.length} DESTROYED`;
  }

  getSiteStatusLines(sites: BombSiteRuntime[]): string[] {
    return sites.map((site) => `Site ${site.letter}: ${site.state}`);
  }

  nextTargets(sites: BombSiteRuntime[]): BombSiteRuntime[] {
    return sites.filter((s) => s.state === BombSiteState.Available || s.state === BombSiteState.Planting || s.state === BombSiteState.Armed || s.state === BombSiteState.BeingDefused);
  }
}
