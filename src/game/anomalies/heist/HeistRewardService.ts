import { rollModDrop } from '../../mods/ModDropService.ts';
import { SeededRandom } from '../../systems/SeededRandom.ts';
import type { RunProtocolId } from '../../mods/types.ts';
import type { PendingAnomalyLoot } from '../types.ts';

export type HeistContainerReward =
  | { kind: 'credits'; amount: number }
  | { kind: 'coreTokens'; amount: number }
  | { kind: 'plasmaChips'; amount: number }
  | { kind: 'fluxCores'; amount: number }
  | { kind: 'mod'; amount: 1; modId: string };

export class HeistRewardService {
  private readonly random: SeededRandom;
  private sequence = 0;
  private readonly seed: number;
  private readonly round: number;
  private readonly protocol: RunProtocolId;

  constructor(seed: number, round: number, protocol: RunProtocolId) {
    this.seed = seed;
    this.round = round;
    this.protocol = protocol;
    this.random = new SeededRandom((seed ^ Math.imul(round, 0x45d9f3b) ^ 0x4e1a57) >>> 0);
  }

  createEmpty(): PendingAnomalyLoot {
    return { credits: 0, coreTokens: 0, plasmaChips: 0, fluxCores: 0, modIds: [] };
  }

  rollContainer(): HeistContainerReward {
    const roll = this.random.next();
    if (roll < 0.38) return { kind: 'credits', amount: Math.round(420 + this.round * 38 + this.random.float(0, 280)) };
    if (roll < 0.58) return { kind: 'coreTokens', amount: Math.max(1, Math.round(2 + this.round * 0.09 + this.random.float(0, 2))) };
    if (roll < 0.75) return { kind: 'plasmaChips', amount: Math.max(2, Math.round(4 + this.round * 0.13 + this.random.float(0, 5))) };
    if (roll < 0.89) return { kind: 'fluxCores', amount: Math.max(1, Math.round(1 + this.round * 0.025 + this.random.float(0, 1.6))) };
    const mod = rollModDrop({
      source: 'anomaly', round: this.round, seed: this.seed, sequence: this.sequence++, protocol: this.protocol, guaranteed: true
    });
    return mod ? { kind: 'mod', amount: 1, modId: mod.id }
      : { kind: 'credits', amount: Math.round(650 + this.round * 44) };
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
