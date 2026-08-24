import Phaser from 'phaser';
import { MOD_BY_ID } from '../../mods/definitions.ts';
import {
  GameplayPickupPresentation,
  createGameplayModPickupVisual,
  updateGameplayModPickupVisual,
  type GameplayModPickupVisual
} from '../../loot/GameplayPickupPresentation.ts';
import { createPhysicalLootPlan, type PhysicalLootKind } from '../../loot/PhysicalLootService.ts';
import type { HeistContainerReward, HeistRewardService } from './HeistRewardService.ts';

interface HeistLootPickup {
  reward: HeistContainerReward;
  root: Phaser.GameObjects.Container;
  modVisual: GameplayModPickupVisual | null;
  worldX: number;
  worldY: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  settled: boolean;
  collectibleAt: number;
}

const physicalKindFor = (reward: HeistContainerReward): PhysicalLootKind => {
  if (reward.kind === 'coreTokens') return 'core-tokens';
  if (reward.kind === 'plasmaChips') return 'plasma-chips';
  if (reward.kind === 'fluxCores') return 'flux-cores';
  return reward.kind;
};

const sliceReward = (reward: HeistContainerReward, amount: number): HeistContainerReward =>
  reward.kind === 'mod' ? { kind: 'mod', amount: 1, modId: reward.modId } : { kind: reward.kind, amount };

/**
 * Physical provisional loot. It owns only motion and collection; rendering is
 * delegated to the same authoritative pickup and Mod presenters as Arena.
 */
export class HeistLootPickupSystem {
  private readonly pickups: HeistLootPickup[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rewards: HeistRewardService,
    private readonly presentation: GameplayPickupPresentation
  ) {}

  get activeCount(): number { return this.pickups.length; }

  spawn(x: number, y: number, reward: HeistContainerReward, sequence: number): void {
    const plan = createPhysicalLootPlan(
      [{ kind: physicalKindFor(reward), amount: reward.amount }],
      { maximumCreditBundles: 4, minimumCreditBundles: 2, seed: Math.imul(sequence + 1, 0x45d9f3b) }
    );
    for (const entry of plan) {
      const itemReward = sliceReward(reward, entry.amount);
      let root: Phaser.GameObjects.Container;
      let modVisual: GameplayModPickupVisual | null = null;
      if (itemReward.kind === 'mod') {
        const definition = MOD_BY_ID.get(itemReward.modId);
        if (!definition) continue;
        modVisual = createGameplayModPickupVisual(this.scene, definition, x, y);
        root = modVisual.root;
      } else {
        if (!entry.pickupType) continue;
        root = this.presentation.create(entry.pickupType, x, y);
      }
      const speed = 88 + entry.index % 4 * 18;
      this.pickups.push({
        reward: itemReward,
        root: root.setDepth(11),
        modVisual,
        worldX: x,
        worldY: y,
        vx: Math.cos(entry.angle) * speed,
        vy: Math.sin(entry.angle) * speed,
        z: 14,
        vz: 190 + entry.index % 3 * 28,
        settled: false,
        collectibleAt: this.scene.time.now + 220
      });
    }
  }

  update(now: number, deltaSeconds: number, playerX: number, playerY: number, pickupRadius: number,
    attractionRadius: number, pullSpeed: number,
    onCollect: (reward: HeistContainerReward, x: number, y: number) => void): void {
    const dt = Math.min(0.05, Math.max(0, deltaSeconds));
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index];
      if (!pickup.settled) {
        pickup.worldX += pickup.vx * dt;
        pickup.worldY += pickup.vy * dt;
        pickup.vx *= Math.pow(0.12, dt);
        pickup.vy *= Math.pow(0.12, dt);
        pickup.vz -= 520 * dt;
        pickup.z += pickup.vz * dt;
        if (pickup.z <= 0) {
          pickup.z = 0;
          if (Math.abs(pickup.vz) > 55) pickup.vz = Math.abs(pickup.vz) * 0.34;
          else { pickup.vz = 0; pickup.settled = true; }
        }
      }
      pickup.root.setPosition(pickup.worldX, pickup.worldY - pickup.z);
      if (pickup.modVisual) updateGameplayModPickupVisual(pickup.modVisual, now, dt);
      else this.presentation.update(pickup.root, now);

      let dx = pickup.worldX - playerX;
      let dy = pickup.worldY - playerY;
      let distanceSquared = dx * dx + dy * dy;
      if (pickup.settled && pullSpeed > 0 && distanceSquared <= attractionRadius * attractionRadius
        && distanceSquared > pickupRadius * pickupRadius) {
        const distance = Math.sqrt(Math.max(1, distanceSquared));
        const step = Math.min(distance, pullSpeed * dt);
        pickup.worldX -= dx / distance * step;
        pickup.worldY -= dy / distance * step;
        pickup.root.setPosition(pickup.worldX, pickup.worldY);
        dx = pickup.worldX - playerX;
        dy = pickup.worldY - playerY;
        distanceSquared = dx * dx + dy * dy;
      }
      if (!pickup.settled || now < pickup.collectibleAt || distanceSquared > pickupRadius * pickupRadius) continue;
      // Remove before invoking accounting so a callback or frame re-entry can
      // never credit the same physical item twice.
      this.pickups.splice(index, 1);
      onCollect(pickup.reward, pickup.worldX, pickup.worldY);
      this.scene.tweens.add({
        targets: pickup.root, x: playerX, y: playerY, alpha: 0, scale: 0.2,
        duration: 150, onComplete: () => pickup.root.destroy(true)
      });
    }
  }

  showCollectionLabel(reward: HeistContainerReward, x: number, y: number): void {
    const label = this.scene.add.text(x, y - 46, this.rewards.label(reward), {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', color: '#ffe889',
      stroke: '#02060d', strokeThickness: 6, fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(15);
    this.scene.tweens.add({ targets: label, y: label.y - 44, alpha: 0, duration: 1050, onComplete: () => label.destroy() });
  }

  destroy(): void {
    for (const pickup of this.pickups) pickup.root.destroy(true);
    this.pickups.length = 0;
  }
}
