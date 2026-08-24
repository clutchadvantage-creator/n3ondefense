import Phaser from 'phaser';
import type { HeistContainerReward, HeistRewardService } from './HeistRewardService.ts';

interface HeistLootPickup {
  reward: HeistContainerReward;
  root: Phaser.GameObjects.Container;
  payload: Phaser.GameObjects.Container;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  phase: number;
  settled: boolean;
}

const rewardStyle = (reward: HeistContainerReward): { color: number; symbol: string } => {
  if (reward.kind === 'credits') return { color: 0xffe45b, symbol: 'C' };
  if (reward.kind === 'coreTokens') return { color: 0x79ffaf, symbol: 'T' };
  if (reward.kind === 'plasmaChips') return { color: 0xc47aff, symbol: 'P' };
  if (reward.kind === 'fluxCores') return { color: 0x64f5ff, symbol: 'F' };
  return { color: 0xff5bd7, symbol: 'M' };
};

/** Visible provisional loot. Rewards are not added until the operative collects the pickup. */
export class HeistLootPickupSystem {
  private readonly pickups: HeistLootPickup[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly rewards: HeistRewardService) {}

  get activeCount(): number { return this.pickups.length; }

  spawn(x: number, y: number, reward: HeistContainerReward, sequence: number): void {
    const style = rewardStyle(reward);
    const shadow = this.scene.add.ellipse(0, 5, 40, 18, 0x000000, 0.48);
    const halo = this.scene.add.circle(0, 0, reward.kind === 'mod' ? 25 : 21, style.color, 0.12)
      .setStrokeStyle(2, style.color, 0.72).setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.scene.add.circle(0, 0, reward.kind === 'mod' ? 16 : 13, 0x06131f, 0.98)
      .setStrokeStyle(3, style.color, 1);
    const core = reward.kind === 'mod'
      ? this.scene.add.rectangle(0, 0, 16, 16, style.color, 0.92).setRotation(Math.PI / 4)
      : this.scene.add.circle(0, 0, 8, style.color, 0.88);
    const symbol = this.scene.add.text(0, 0, style.symbol, {
      fontFamily: 'Orbitron, sans-serif', fontSize: reward.kind === 'mod' ? '11px' : '12px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    const payload = this.scene.add.container(0, 0, [halo, ring, core, symbol]);
    const root = this.scene.add.container(x, y, [shadow, payload]).setDepth(11);
    const angle = sequence * 2.39996 + (sequence % 2 ? 0.42 : -0.31);
    const speed = 88 + sequence % 4 * 18;
    this.pickups.push({
      reward, root, payload,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      z: 14,
      vz: 190 + sequence % 3 * 28,
      phase: sequence * 1.31,
      settled: false
    });
  }

  update(now: number, deltaSeconds: number, playerX: number, playerY: number, pickupRadius: number,
    onCollect: (reward: HeistContainerReward, x: number, y: number) => void): void {
    const dt = Math.min(0.05, Math.max(0, deltaSeconds));
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index];
      if (!pickup.settled) {
        pickup.root.x += pickup.vx * dt;
        pickup.root.y += pickup.vy * dt;
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
      const bob = pickup.settled ? 7 + Math.sin(now * 0.0045 + pickup.phase) * 5 : pickup.z;
      pickup.payload.y = -bob;
      pickup.payload.setRotation(now * 0.0014 + pickup.phase * 0.1)
        .setScale(1 + Math.sin(now * 0.006 + pickup.phase) * 0.07);
      const dx = pickup.root.x - playerX;
      const dy = pickup.root.y - playerY;
      if (!pickup.settled || dx * dx + dy * dy > pickupRadius * pickupRadius) continue;
      onCollect(pickup.reward, pickup.root.x, pickup.root.y);
      this.scene.tweens.add({
        targets: pickup.root, x: playerX, y: playerY, alpha: 0, scale: 0.2,
        duration: 150, onComplete: () => pickup.root.destroy(true)
      });
      this.pickups.splice(index, 1);
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
