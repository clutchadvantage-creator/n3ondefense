import Phaser from 'phaser';
import { MOD_BY_ID } from '../../mods/definitions.ts';
import { GameplayPickupPresentation, createGameplayModPickupVisual, updateGameplayModPickupVisual,
  type GameplayModPickupVisual } from '../../loot/GameplayPickupPresentation.ts';
import { createPhysicalLootPlan, type PhysicalLootKind } from '../../loot/PhysicalLootService.ts';
import { ReusableObjectPool } from '../../performance/ReusableObjectPool.ts';
import type { HeistContainerReward, HeistRewardService } from './HeistRewardService.ts';
import { GameplayPickupMotion, collectOrAttractPickup, findGameplayPickupLanding } from '../../loot/GameplayPickupMotion.ts';
import type { RectSpec, PickupType } from '../../types.ts';

export const MAX_HEIST_LOOSE_LOOT = 64;
const MAX_CURRENCY_STACKS = 12;
const MAX_COLLECTION_LABELS = 8;

interface HeistLootPickup {
  reward: HeistContainerReward;
  root: Phaser.GameObjects.Container;
  modVisual: GameplayModPickupVisual | null;
  settled: boolean; collectibleAt: number;
}
interface Spawn { x: number; y: number; reward: HeistContainerReward; angle: number; distance: number; index: number; }
interface Label { root: Phaser.GameObjects.Text; expiresAt: number; y: number; }

const physicalKindFor = (reward: HeistContainerReward): PhysicalLootKind => {
  if (reward.kind === 'coreTokens') return 'core-tokens';
  if (reward.kind === 'plasmaChips') return 'plasma-chips';
  if (reward.kind === 'fluxCores') return 'flux-cores';
  return reward.kind;
};

/** Provisional values remain in physical stacks until collected. Overflow stacks merge, while unique
 * Mods wait at their original drop position and are presented individually. */
export class HeistLootPickupSystem {
  private readonly pickups: HeistLootPickup[] = [];
  private readonly pending: Spawn[] = [];
  private readonly pools = new Map<string, ReusableObjectPool<HeistLootPickup, Spawn>>();
  private readonly labels: Label[] = [];
  private readonly freeLabels: Label[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly rewards: HeistRewardService,
    private readonly presentation: GameplayPickupPresentation, private readonly motion: GameplayPickupMotion,
    private readonly bounds: RectSpec, private readonly blocked: (x: number, y: number) => boolean) {}

  appendMotionTargets(targets: Phaser.GameObjects.Container[]): void {
    for (const pickup of this.pickups) if (pickup.settled && !pickup.modVisual) targets.push(pickup.root);
  }

  get activeCount(): number { return this.pickups.length; }
  diagnostics(): Record<string, number> {
    let capacity = 0;
    for (const pool of this.pools.values()) { const s = pool.stats(); capacity += s.active + s.available; }
    return { active: this.pickups.length, collecting: 0, pending: this.pending.length,
      currencyCapacity: capacity, labels: this.labels.length, labelCapacity: this.labels.length + this.freeLabels.length };
  }

  spawn(x: number, y: number, reward: HeistContainerReward, sequence: number): void {
    const plan = createPhysicalLootPlan([{ kind: physicalKindFor(reward), amount: reward.amount }],
      { maximumCreditBundles: 4, minimumCreditBundles: 2, maximumStackableBundles: 4,
        seed: Math.imul(sequence + 1, 0x45d9f3b) });
    for (const entry of plan) {
      const itemReward: HeistContainerReward = reward.kind === 'mod'
        ? { ...reward } : { kind: reward.kind, amount: entry.amount };
      const spawn = { x, y, reward: itemReward, angle: entry.angle, distance: entry.distance, index: entry.index };
      if (!this.present(spawn)) this.pending.push(spawn);
    }
  }

  private present(spawn: Spawn): boolean {
    const { reward, x, y } = spawn;
    const sameKind = this.pickups.filter(p => p.reward.kind === reward.kind);
    if (reward.kind !== 'mod' && sameKind.length > 0
      && (sameKind.length >= MAX_CURRENCY_STACKS || this.pickups.length >= MAX_HEIST_LOOSE_LOOT)) {
      let nearest = sameKind[0];
      for (const item of sameKind) {
        if ((item.root.x-x)**2+(item.root.y-y)**2 < (nearest.root.x-x)**2+(nearest.root.y-y)**2) nearest = item;
      }
      nearest.reward.amount += reward.amount;
      // Keep its location and existing motion. Merging must not replay a drop effect.
      return true;
    }
    if (this.pickups.length >= MAX_HEIST_LOOSE_LOOT) return false;
    if (reward.kind === 'mod') {
      this.pickups.push(this.create(spawn));
    } else {
      let pool = this.pools.get(reward.kind);
      if (!pool) {
        pool = new ReusableObjectPool(s => this.create(s), (p,s) => this.reset(p,s),
          p => { this.scene.tweens.killTweensOf(p.root); this.motion.delete(p.root); p.root.setVisible(false).setActive(false); });
        this.pools.set(reward.kind, pool);
      }
      if (pool.activeCount >= MAX_CURRENCY_STACKS) return false;
      this.pickups.push(pool.obtain(spawn));
    }
    return true;
  }

  private create(spawn: Spawn): HeistLootPickup {
    let modVisual: GameplayModPickupVisual | null = null;
    let root: Phaser.GameObjects.Container;
    if (spawn.reward.kind === 'mod') {
      const definition = MOD_BY_ID.get(spawn.reward.modId);
      if (!definition) throw new Error(`Unknown HEIST Mod reward: ${spawn.reward.modId}`);
      modVisual = createGameplayModPickupVisual(this.scene, definition, spawn.x, spawn.y);
      root = modVisual.root;
    } else {
      const type = spawn.reward.kind === 'coreTokens' ? 'coreToken' : spawn.reward.kind === 'plasmaChips'
        ? 'plasmaChip' : spawn.reward.kind === 'fluxCores' ? 'fluxCore' : 'credits';
      root = this.presentation.create(type, spawn.x, spawn.y);
    }
    const pickup: HeistLootPickup = { reward: spawn.reward, root, modVisual, settled: false, collectibleAt: 0 };
    this.reset(pickup, spawn);
    return pickup;
  }

  private reset(pickup: HeistLootPickup, spawn: Spawn): void {
    this.scene.tweens.killTweensOf(pickup.root);
    this.motion.delete(pickup.root);
    Object.assign(pickup, { reward: { ...spawn.reward }, settled: false, collectibleAt: this.scene.time.now + 680 });
    pickup.root.setDepth(14).setPosition(spawn.x, spawn.y).setVisible(true).setActive(true).setScale(1).setAlpha(1).setRotation(0);
    const landing = findGameplayPickupLanding(spawn.x, spawn.y, spawn.angle, spawn.distance, this.bounds, this.blocked);
    this.presentation.launch(pickup.root, landing.x, landing.y, spawn.index, false, () => {
      pickup.settled = true;
      if (!pickup.modVisual) {
        const phase = Math.abs(landing.x * .019 + landing.y * .027 + spawn.index);
        this.motion.set(pickup.root, { velocityX: Math.cos(phase) * 8, velocityY: Math.sin(phase) * 8, phase });
      }
    });
  }

  update(now: number, deltaSeconds: number, playerX: number, playerY: number, pickupRadius: number,
    attractionRadius: number, pullSpeed: number,
    onCollect: (reward: HeistContainerReward, x: number, y: number) => void): void {
    const dt = Math.min(0.05, Math.max(0, deltaSeconds));
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const label = this.labels[i];
      const remaining = Math.max(0, (label.expiresAt - now) / 1050);
      label.root.setAlpha(remaining).setY(label.y - (1-remaining)*44);
      if (remaining > 0) continue;
      label.root.setActive(false).setVisible(false);
      this.labels.splice(i,1); this.freeLabels.push(label);
    }
    // A failed presentation attempt leaves its value queued. Avoid scanning a
    // backlog of unique rewards every frame when all slots are occupied.
    while (this.pending.length && this.pickups.length < MAX_HEIST_LOOSE_LOOT) {
      if (!this.present(this.pending[0])) break;
      this.pending.shift();
    }
    for (let index = this.pickups.length - 1; index >= 0; index--) {
      const pickup = this.pickups[index];
      if (pickup.modVisual) updateGameplayModPickupVisual(pickup.modVisual, now, dt);
      else this.presentation.update(pickup.root,now);
      if (!collectOrAttractPickup(pickup.root, playerX, playerY, pickupRadius, attractionRadius, pullSpeed, dt,
        pickup.settled && now >= pickup.collectibleAt)) continue;
      this.pickups.splice(index,1);
      onCollect(pickup.reward,pickup.root.x,pickup.root.y);
      if (pickup.modVisual) pickup.root.destroy(true);
      else this.pools.get(pickup.reward.kind)!.release(pickup);
    }
  }

  showCollectionLabel(reward: HeistContainerReward, x: number, y: number): void {
    if (reward.kind !== 'mod') {
      const type: PickupType = reward.kind === 'coreTokens' ? 'coreToken' : reward.kind === 'plasmaChips'
        ? 'plasmaChip' : reward.kind === 'fluxCores' ? 'fluxCore' : 'credits';
      this.presentation.showCollectionLabel(type, x, y);
      return;
    }
    let label = this.freeLabels.pop();
    if (!label && this.labels.length >= MAX_COLLECTION_LABELS) label = this.labels.shift();
    label ??= { root: this.scene.add.text(0,0,'', { fontFamily: 'Rajdhani, sans-serif', fontSize: '20px',
      color: '#ffe889', stroke: '#02060d', strokeThickness: 6, fontStyle: 'bold' }).setOrigin(.5).setDepth(15), expiresAt: 0, y: 0 };
    label.y = y-46; label.expiresAt = this.scene.time.now+1050;
    label.root.setText(this.rewards.label(reward)).setPosition(x,label.y).setAlpha(1).setActive(true).setVisible(true);
    this.labels.push(label);
  }

  destroy(): void {
    for (const pool of this.pools.values()) pool.destroy(p => p.root.destroy(true));
    for (const pickup of this.pickups) if (pickup.reward.kind === 'mod') { this.scene.tweens.killTweensOf(pickup.root); pickup.root.destroy(true); }
    for (const label of [...this.labels,...this.freeLabels]) label.root.destroy();
    this.discardReferences();
  }

  discardReferences(): void {
    for (const pool of this.pools.values()) pool.discardReferences();
    this.pools.clear(); this.pickups.length = 0;
    this.pending.length = 0; this.labels.length = 0; this.freeLabels.length = 0;
  }
}
