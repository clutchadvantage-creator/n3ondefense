import type { ArcadeEventDefinition, ArcadeRuntimeContext } from './types.ts';

/** Routes all Arcade payouts through ArenaScene's authoritative round reward paths. */
export class ArcadeRewardService {
  constructor(private readonly context: ArcadeRuntimeContext) {}

  grant(definition: ArcadeEventDefinition): void {
    const reward = definition.reward;
    if (reward.kind === 'guaranteed-mod') {
      this.context.grantGuaranteedMod(this.context.player.x, this.context.player.y);
      return;
    }
    this.context.grantCredits(reward.creditsBase + this.context.round * reward.creditsPerRound);
    this.context.grantFluxCores(reward.fluxCores);
  }
}
