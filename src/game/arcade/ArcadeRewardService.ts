import type {
  ArcadeEventDefinition,
  ArcadeEventId,
  ArcadeGrantedReward,
  ArcadeRewardPlan,
  ArcadeRewardOption,
  ArcadeRuntimeContext
} from './types.ts';

const clampRoll = (roll: number): number => Math.max(0, Math.min(0.999999, Number.isFinite(roll) ? roll : 0));

const rewardLabel = (kind: ArcadeGrantedReward['kind'], amount: number): string => {
  if (kind === 'mod') return 'RANDOM MOD';
  if (kind === 'credits') return `+${amount.toLocaleString()} CREDITS`;
  if (kind === 'core-tokens') return `+${amount} CORE TOKEN${amount === 1 ? '' : 'S'}`;
  if (kind === 'flux-cores') return `+${amount} FLUX CORE${amount === 1 ? '' : 'S'}`;
  if (kind === 'plasma-chips') return `+${amount} PLASMA CHIP${amount === 1 ? '' : 'S'}`;
  if (kind === 'grenade-rounds') return 'GRENADE ROUNDS';
  return 'SCATTERSHOT ROUNDS';
};

/** Rolls Arcade rewards, then asks the Arena's one physical-loot path to spawn them. */
export class ArcadeRewardService {
  private readonly context: ArcadeRuntimeContext;

  constructor(context: ArcadeRuntimeContext) {
    this.context = context;
  }

  roll(definition: ArcadeEventDefinition, roll: number, plan?: ArcadeRewardPlan): ArcadeGrantedReward {
    const options = (plan?.profile ?? definition.reward).options;
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

    const amount = selected.kind === 'mod' || selected.kind === 'grenade-rounds' || selected.kind === 'scattershot-rounds'
      ? 1
      : Math.max(1, Math.floor((selected.baseAmount ?? 1) + this.context.round * (selected.amountPerRound ?? 0)));
    return { kind: selected.kind, amount, label: rewardLabel(selected.kind, amount) };
  }

  spawn(
    eventId: ArcadeEventId,
    definition: ArcadeEventDefinition,
    plan: ArcadeRewardPlan,
    nextRoll: () => number
  ): ArcadeGrantedReward[] {
    const rewards: ArcadeGrantedReward[] = [];
    for (const guaranteed of plan.guaranteed ?? []) {
      const amount = Math.max(1, Math.floor(guaranteed.amount ?? 1));
      rewards.push({ kind: guaranteed.kind, amount, label: rewardLabel(guaranteed.kind, amount) });
    }
    const rolls = Math.max(0, Math.floor(plan.rolls ?? 1));
    for (let index = 0; index < rolls; index += 1) rewards.push(this.roll(definition, nextRoll(), plan));
    this.context.spawnPhysicalRewards(eventId, plan.origin, rewards);
    return rewards;
  }
}
