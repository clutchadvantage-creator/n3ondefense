import { rollModDrop } from '../../mods/ModDropService.ts';
import { MOD_BY_ID } from '../../mods/definitions.ts';
import { SeededRandom } from '../../systems/SeededRandom.ts';
import type { RunProtocolId } from '../../mods/types.ts';
import { isSupremeProtocol } from '../../progression/SupremeProgression.ts';
import type { PendingAnomalyLoot } from '../types.ts';
import { HEIST_REWARD_TABLE } from './HeistConfig.ts';

export type HeistContainerReward =
  | { kind: 'credits'; amount: number }
  | { kind: 'coreTokens'; amount: number }
  | { kind: 'plasmaChips'; amount: number }
  | { kind: 'fluxCores'; amount: number }
  | { kind: 'mod'; amount: 1; modId: string };

export const isHeistModRewardEligible = (modId: string, protocol: RunProtocolId): boolean => {
  const definition = MOD_BY_ID.get(modId);
  if (!definition) return false;
  return definition.rarity !== 'supreme' || isSupremeProtocol(protocol);
};

export class HeistRewardService {
  private readonly random: SeededRandom;
  private sequence = 0;
  private readonly seed: number;
  private readonly round: number;
  private readonly protocol: RunProtocolId;
  private readonly entryCost: number;
  private containerSequence = 0;

  constructor(seed: number, round: number, protocol: RunProtocolId, entryCost = 150) {
    this.seed = seed;
    this.round = round;
    this.protocol = protocol;
    this.entryCost = Math.max(0, Math.floor(entryCost));
    this.random = new SeededRandom((seed ^ Math.imul(round, 0x45d9f3b) ^ 0x4e1a57) >>> 0);
  }

  createEmpty(): PendingAnomalyLoot {
    return { credits: 0, coreTokens: 0, plasmaChips: 0, fluxCores: 0, modIds: [] };
  }

  rollContainer(): HeistContainerReward {
    const guaranteedKind = HEIST_REWARD_TABLE.guaranteedVaultSequence[this.containerSequence++];
    if (guaranteedKind === 'credits') return { kind: 'credits', amount: Math.round(
      HEIST_REWARD_TABLE.guaranteedCreditsBase
      + this.entryCost * HEIST_REWARD_TABLE.guaranteedCreditsPerFlux
      + this.round * HEIST_REWARD_TABLE.guaranteedCreditsPerRound
      + this.random.float(0, HEIST_REWARD_TABLE.creditsVariance)
    ) };
    if (guaranteedKind === 'plasmaChips') return { kind: 'plasmaChips', amount: Math.max(1, Math.round(
      HEIST_REWARD_TABLE.guaranteedPlasmaBase
      + this.entryCost * HEIST_REWARD_TABLE.guaranteedPlasmaPerFlux
      + this.round * HEIST_REWARD_TABLE.guaranteedPlasmaPerRound
      + this.random.float(0, 5)
    )) };
    if (guaranteedKind === 'coreTokens') return { kind: 'coreTokens', amount: Math.max(1, Math.round(
      HEIST_REWARD_TABLE.guaranteedCoreBase
      + this.entryCost * HEIST_REWARD_TABLE.guaranteedCorePerFlux
      + this.round * HEIST_REWARD_TABLE.guaranteedCorePerRound
      + this.random.float(0, 3)
    )) };
    if (guaranteedKind === 'mod') return this.rollModOrFallback();

    const roll = this.random.next();
    const coreTokensThreshold = HEIST_REWARD_TABLE.creditsWeight + HEIST_REWARD_TABLE.coreTokensWeight;
    const plasmaThreshold = coreTokensThreshold + HEIST_REWARD_TABLE.plasmaChipsWeight;
    const fluxThreshold = plasmaThreshold + HEIST_REWARD_TABLE.fluxCoresWeight;
    if (roll < HEIST_REWARD_TABLE.creditsWeight) return { kind: 'credits', amount: Math.round(
      HEIST_REWARD_TABLE.creditsBase + this.entryCost * HEIST_REWARD_TABLE.creditsPerFlux
      + this.round * HEIST_REWARD_TABLE.creditsPerRound
      + this.random.float(0, HEIST_REWARD_TABLE.creditsVariance)
    ) };
    if (roll < coreTokensThreshold) return { kind: 'coreTokens', amount: Math.max(1, Math.round(
      HEIST_REWARD_TABLE.coreBase + this.entryCost * HEIST_REWARD_TABLE.corePerFlux
      + this.round * HEIST_REWARD_TABLE.corePerRound + this.random.float(0, 3)
    )) };
    if (roll < plasmaThreshold) return { kind: 'plasmaChips', amount: Math.max(2, Math.round(
      HEIST_REWARD_TABLE.plasmaBase + this.entryCost * HEIST_REWARD_TABLE.plasmaPerFlux
      + this.round * HEIST_REWARD_TABLE.plasmaPerRound + this.random.float(0, 6)
    )) };
    if (roll < fluxThreshold) return { kind: 'fluxCores', amount: Math.max(1, Math.round(
      HEIST_REWARD_TABLE.fluxBase + this.entryCost * HEIST_REWARD_TABLE.fluxPerEntryFlux
      + this.round * HEIST_REWARD_TABLE.fluxPerRound + this.random.float(0, 3)
    )) };
    return this.rollModOrFallback();
  }

  rollMiniBossReward(): HeistContainerReward {
    return { kind: 'plasmaChips', amount: Math.max(4, Math.round(
      HEIST_REWARD_TABLE.miniBossPlasmaBase + this.round * HEIST_REWARD_TABLE.miniBossPlasmaPerRound
      + this.random.float(0, 6)
    )) };
  }

  /** Small provisional anomaly opportunities layered on top of the normal
   * shared enemy-pickup roll. This never commits before successful extraction. */
  rollEnemyBonus(): HeistContainerReward {
    const roll = this.random.next();
    if (roll < 0.7) return { kind: 'credits', amount: Math.round(
      HEIST_REWARD_TABLE.enemyBonusCreditsBase
      + this.round * HEIST_REWARD_TABLE.enemyBonusCreditsPerRound
      + this.random.float(0, HEIST_REWARD_TABLE.enemyBonusCreditsBase)
    ) };
    if (roll < 0.9) return { kind: 'plasmaChips', amount: Math.max(1, Math.round(1 + this.round * 0.035 + this.random.float(0, 2))) };
    if (roll < 0.97) return { kind: 'coreTokens', amount: 1 };
    if (roll < 0.995) return { kind: 'fluxCores', amount: 1 };
    return this.rollModOrFallback();
  }

  private rollModOrFallback(): HeistContainerReward {
    const mod = rollModDrop({
      source: 'anomaly', round: this.round, seed: this.seed, sequence: this.sequence++, protocol: this.protocol, guaranteed: true
    });
    return mod && isHeistModRewardEligible(mod.id, this.protocol)
      ? { kind: 'mod', amount: 1, modId: mod.id }
      : { kind: 'credits', amount: Math.round(
        HEIST_REWARD_TABLE.fallbackCreditsBase + this.round * HEIST_REWARD_TABLE.fallbackCreditsPerRound
      ) };
  }

  add(loot: PendingAnomalyLoot, reward: HeistContainerReward): void {
    if (reward.kind === 'mod') loot.modIds.push(reward.modId);
    else loot[reward.kind] += reward.amount;
  }

  label(reward: HeistContainerReward): string {
    if (reward.kind === 'mod') return 'ENCRYPTED MOD CARD';
    if (reward.kind === 'coreTokens') return `+${reward.amount} CORE TOKENS`;
    if (reward.kind === 'plasmaChips') return `+${reward.amount} PLASMA CHIPS`;
    if (reward.kind === 'fluxCores') return `+${reward.amount} FLUX CORES`;
    return `+${reward.amount.toLocaleString()} CREDITS`;
  }
}
