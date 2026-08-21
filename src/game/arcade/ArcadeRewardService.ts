import type {
  ArcadeEventDefinition,
  ArcadeGrantedReward,
  ArcadeRewardOption,
  ArcadeRuntimeContext
} from './types.ts';

const clampRoll = (roll: number): number => Math.max(0, Math.min(0.999999, Number.isFinite(roll) ? roll : 0));

/** Routes all Arcade payouts through ArenaScene's authoritative round reward paths. */
export class ArcadeRewardService {
  private readonly context: ArcadeRuntimeContext;

  constructor(context: ArcadeRuntimeContext) {
    this.context = context;
  }

  grant(definition: ArcadeEventDefinition, roll: number): ArcadeGrantedReward {
    const options = definition.reward.options;
    const totalWeight = options.reduce((sum, option) => sum + Math.max(0, option.weight), 0);
    let cursor = clampRoll(roll) * Math.max(1, totalWeight);
    let selected = options.at(-1) as ArcadeRewardOption;
    for (const option of options) {
      cursor -= Math.max(0, option.weight);
      if (cursor <= 0) {
        selected = option;
        break;
      }
    }

    if (selected.kind === 'mod') {
      this.context.grantGuaranteedMod(this.context.player.x, this.context.player.y);
      return { kind: selected.kind, amount: 1, label: 'RANDOM MOD' };
    }

    const amount = Math.max(1, Math.floor((selected.baseAmount ?? 1) + this.context.round * (selected.amountPerRound ?? 0)));
    if (selected.kind === 'credits') this.context.grantCredits(amount);
    else if (selected.kind === 'core-tokens') this.context.grantCoreTokens(amount);
    else if (selected.kind === 'flux-cores') this.context.grantFluxCores(amount);
    else this.context.grantPlasmaChips(amount);

    const label = selected.kind === 'credits'
      ? `+${amount.toLocaleString()} CREDITS`
      : selected.kind === 'core-tokens'
        ? `+${amount} CORE TOKEN${amount === 1 ? '' : 'S'}`
        : selected.kind === 'flux-cores'
          ? `+${amount} FLUX CORE${amount === 1 ? '' : 'S'}`
          : `+${amount} PLASMA CHIP${amount === 1 ? '' : 'S'}`;
    return { kind: selected.kind, amount, label };
  }
}
