import Phaser from 'phaser';
import { MOD_BY_ID } from '../../mods/definitions.ts';
import { GameplayPickupPresentation, createGameplayModPickupVisual, updateGameplayModPickupVisual,
  type GameplayModPickupVisual } from '../../loot/GameplayPickupPresentation.ts';
import { createPhysicalLootPlan, type PhysicalLootKind } from '../../loot/PhysicalLootService.ts';
import { ReusableObjectPool } from '../../performance/ReusableObjectPool.ts';
import type { HeistContainerReward, HeistRewardService } from './HeistRewardService.ts';

export const MAX_HEIST_LOOSE_LOOT = 64;
const MAX_CURRENCY_STACKS = 12;
const MAX_COLLECTION_LABELS = 8;

interface HeistLootPickup {
  reward: HeistContainerReward;
  root: Phaser.GameObjects.Container;
  modVisual: GameplayModPickupVisual | null;
  worldX: number; worldY: number; vx: number; vy: number; z: number; vz: number;
  settled: boolean; collectibleAt: number;
}
interface Spawn { x: number; y: number; reward: HeistContainerReward; angle: number; index: number; }
interface Collection { pickup: HeistLootPickup; startedAt: number; x: number; y: number; }
interface Label { root: Phaser.GameObjects.Text; expiresAt: number; y: number; }

const physicalKindFor = (reward: HeistContainerReward): PhysicalLootKind => {
  if (reward.kind === 'coreTokens') return 'core-tokens';
  if (reward.kind === 'plasmaChips') return 'plasma-chips';
  if (reward.kind === 'fluxCores') return 'flux-cores';
  return reward.kind;
};

/** Provisional values remain in physical stacks until collected. The presentation
 * budget includes collection animations; overflow stacks merge, while unique
 * Mods wait at their original drop position and are presented individually. */
export class HeistLootPickupSystem {
  private readonly pickups: HeistLootPickup[] = [];
  private readonly collecting: Collection[] = [];
  private readonly pending: Spawn[] = [];
  private readonly pools = new Map<string, ReusableObjectPool<HeistLootPickup, Spawn>>();
  private readonly labels: Label[] = [];
  private readonly freeLabels: Label[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly rewards: HeistRewardService,
    private readonly presentation: GameplayPickupPresentation) {}

  get activeCount(): number { return this.pickups.length; }
  diagnostics(): Record<string, number> {
    let capacity = 0;
    for (const pool of this.pools.values()) { const s = pool.stats(); capacity += s.active + s.available; }
    return { active: this.pickups.length, collecting: this.collecting.length, pending: this.pending.length,
      currencyCapacity: capacity, labels: this.labels.length, labelCapacity: this.labels.length + this.freeLabels.length };
  }

  spawn(x: number, y: number, reward: HeistContainerReward, sequence: number): void {
    const plan = createPhysicalLootPlan([{ kind: physicalKindFor(reward), amount: reward.amount }],
      { maximumCreditBundles: 4, minimumCreditBundles: 2, maximumStackableBundles: 4,
        seed: Math.imul(sequence + 1, 0x45d9f3b) });
    for (const entry of plan) {
      const itemReward: HeistContainerReward = reward.kind === 'mod'
        ? { ...reward } : { kind: reward.kind, amount: entry.amount };
      const spawn = { x, y, reward: itemReward, angle: entry.angle, index: entry.index };
      if (!this.present(spawn)) this.pending.push(spawn);
    }
  }

  private present(spawn: Spawn): boolean {
    const { reward, x, y } = spawn;
    const sameKind = this.pickups.filter(p => p.reward.kind === reward.kind);
    if (reward.kind !== 'mod' && sameKind.length > 0
      && (sameKind.length >= MAX_CURRENCY_STACKS || this.pickups.length + this.collecting.length >= MAX_HEIST_LOOSE_LOOT)) {
      let nearest = sameKind[0];
      for (const item of sameKind) {
        if ((item.worldX-x)**2+(item.worldY-y)**2 < (nearest.worldX-x)**2+(nearest.worldY-y)**2) nearest = item;
      }
      nearest.reward.amount += reward.amount;
      // Keep the collectible's location; the existing stack pops when its
      // denomination grows. No reward is granted or discarded at this point.
      nearest.z = Math.max(nearest.z, 10); nearest.vz = Math.max(nearest.vz, 130); nearest.settled = false;
      return true;
    }
    if (this.pickups.length + this.collecting.length >= MAX_HEIST_LOOSE_LOOT) return false;
    if (reward.kind === 'mod') {
      this.pickups.push(this.create(spawn));
    } else {
      let pool = this.pools.get(reward.kind);
      if (!pool) {
        pool = new ReusableObjectPool(s => this.create(s), (p,s) => this.reset(p,s),
          p => { p.root.setVisible(false).setActive(false); });
        this.pools.set(reward.kind, pool);
      }
      // Include slots still finishing their collection flight in the budget.
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
    const pickup: HeistLootPickup = { reward: spawn.reward, root, modVisual, worldX: 0, worldY: 0,
      vx: 0, vy: 0, z: 0, vz: 0, settled: false, collectibleAt: 0 };
    this.reset(pickup, spawn);
    return pickup;
  }

  private reset(pickup: HeistLootPickup, spawn: Spawn): void {
    const speed = 88 + spawn.index % 4 * 18;
    Object.assign(pickup, { reward: { ...spawn.reward }, worldX: spawn.x, worldY: spawn.y,
      vx: Math.cos(spawn.angle)*speed, vy: Math.sin(spawn.angle)*speed, z: 14,
      vz: 190 + spawn.index % 3 * 28, settled: false, collectibleAt: this.scene.time.now + 220 });
    pickup.root.setDepth(11).setPosition(spawn.x, spawn.y).setVisible(true).setActive(true).setScale(1).setAlpha(1).setRotation(0);
  }

  update(now: number, deltaSeconds: number, playerX: number, playerY: number, pickupRadius: number,
    attractionRadius: number, pullSpeed: number,
    onCollect: (reward: HeistContainerReward, x: number, y: number) => void): void {
    const dt = Math.min(0.05, Math.max(0, deltaSeconds));
    for (let i = this.collecting.length - 1; i >= 0; i--) {
      const entry = this.collecting[i];
      const t = Math.min(1, (now - entry.startedAt) / 150);
      entry.pickup.root.setPosition(Phaser.Math.Linear(entry.pickup.worldX, entry.x, t),
        Phaser.Math.Linear(entry.pickup.worldY, entry.y, t)).setAlpha(1-t).setScale(1-t*.8);
      if (t < 1) continue;
      if (entry.pickup.reward.kind === 'mod') entry.pickup.root.destroy(true);
      else this.pools.get(entry.pickup.reward.kind)!.release(entry.pickup);
      this.collecting.splice(i, 1);
    }
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
    while (this.pending.length && this.pickups.length + this.collecting.length < MAX_HEIST_LOOSE_LOOT) {
      if (!this.present(this.pending[0])) break;
      this.pending.shift();
    }
    for (let index = this.pickups.length - 1; index >= 0; index--) {
      const pickup = this.pickups[index];
      if (!pickup.settled) {
        pickup.worldX += pickup.vx*dt; pickup.worldY += pickup.vy*dt;
        pickup.vx *= Math.pow(.12,dt); pickup.vy *= Math.pow(.12,dt);
        pickup.vz -= 520*dt; pickup.z += pickup.vz*dt;
        if (pickup.z <= 0) {
          pickup.z = 0;
          if (Math.abs(pickup.vz)>55) pickup.vz = Math.abs(pickup.vz)*.34;
          else { pickup.vz = 0; pickup.settled = true; }
        }
      }
      pickup.root.setPosition(pickup.worldX, pickup.worldY-pickup.z);
      if (pickup.modVisual) updateGameplayModPickupVisual(pickup.modVisual, now, dt);
      else this.presentation.update(pickup.root,now);
      let dx = pickup.worldX-playerX, dy = pickup.worldY-playerY, distanceSquared = dx*dx+dy*dy;
      if (pickup.settled && pullSpeed>0 && distanceSquared<=attractionRadius*attractionRadius && distanceSquared>pickupRadius*pickupRadius) {
        const distance = Math.sqrt(Math.max(1,distanceSquared));
        const step = Math.min(distance,pullSpeed*dt);
        pickup.worldX -= dx/distance*step; pickup.worldY -= dy/distance*step;
        pickup.root.setPosition(pickup.worldX,pickup.worldY);
        dx = pickup.worldX-playerX; dy = pickup.worldY-playerY; distanceSquared = dx*dx+dy*dy;
      }
      if (!pickup.settled || now<pickup.collectibleAt || distanceSquared>pickupRadius*pickupRadius) continue;
      this.pickups.splice(index,1);
      this.collecting.push({ pickup, startedAt: now, x: playerX, y: playerY });
      onCollect(pickup.reward,pickup.worldX,pickup.worldY);
    }
  }

  showCollectionLabel(reward: HeistContainerReward, x: number, y: number): void {
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
    for (const pickup of [...this.pickups, ...this.collecting.map(c=>c.pickup)]) if (pickup.reward.kind === 'mod') pickup.root.destroy(true);
    for (const label of [...this.labels,...this.freeLabels]) label.root.destroy();
    this.discardReferences();
  }

  discardReferences(): void {
    for (const pool of this.pools.values()) pool.discardReferences();
    this.pools.clear(); this.pickups.length = 0; this.collecting.length = 0;
    this.pending.length = 0; this.labels.length = 0; this.freeLabels.length = 0;
  }
}
