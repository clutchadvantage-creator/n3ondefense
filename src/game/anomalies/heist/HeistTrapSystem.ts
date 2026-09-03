import Phaser from 'phaser';
import { drawBeveledTechPlate, drawHazardStripes, drawPanelBolts } from '../../rendering/LayeredArtPrimitives.ts';
import { SharedFireTrapSystem, type SharedFireTrapPlacement } from '../../hazards/SharedFireTrapSystem.ts';
import { getFireHazardDamageProfile } from '../../config/fireHazards.ts';
import type { RunProtocolId } from '../../mods/types.ts';
import type { HeistTrapPlacement } from './HeistFacilityLayout.ts';

type MechanicalTrapType = 'spike' | 'snag';
type MechanicalPlacement = HeistTrapPlacement & { type: MechanicalTrapType };

interface TrapRuntime {
  placement: MechanicalPlacement;
  root: Phaser.GameObjects.Container;
  dynamic: Phaser.GameObjects.Graphics;
  warningLight: Phaser.GameObjects.Arc;
  state: 'idle' | 'telegraph' | 'active' | 'cooldown';
  stateStartedAt: number;
  nextReadyAt: number;
  damageApplied: boolean;
}

export interface HeistTrapCallbacks {
  damagePlayer(amount: number): void;
  snarePlayer(until: number): void;
  playSfx(name: 'mine' | 'unavailable'): void;
}

export interface HeistTrapDifficultyContext {
  round: number;
  protocol: RunProtocolId;
}

export interface HeistTrapSystemDiagnostics {
  trapCount: number;
  fireCount: number;
  spikeCount: number;
  snagCount: number;
  maximumLiveDynamicBatches: number;
  updateIntervalMs: number;
  physicsBodies: 0;
  sharedFire: ReturnType<SharedFireTrapSystem['diagnostics']>;
}

const TRAP_TIMING: Record<MechanicalTrapType,
  { telegraph: number; active: number; cooldown: number; triggerRadius: number }> = {
  spike: { telegraph: 620, active: 620, cooldown: 2_650, triggerRadius: 92 },
  snag: { telegraph: 320, active: 1_000, cooldown: 3_800, triggerRadius: 78 }
};

const createSpikeTrap = (scene: Phaser.Scene, placement: MechanicalPlacement): TrapRuntime => {
  const root = scene.add.container(placement.x, placement.y).setRotation(placement.rotation).setDepth(4);
  const base = scene.add.graphics();
  drawBeveledTechPlate(base, -72, -58, 144, 116, {
    face: 0x101e28, inset: 0x030810, edge: 0x5d7d88, side: 0x010408,
    highlight: 0xc7f8ff, depth: 8
  });
  drawHazardStripes(base, -59, -47, 118, 10, 0xffc857, 0.64, 9);
  drawPanelBolts(base, -62, -48, 124, 96, 0x9eb2b8, 12);
  base.fillStyle(0x07111a, 0.95).fillRoundedRect(-54, 34, 108, 12, 4);
  base.lineStyle(1.5, 0x54e5f5, 0.48).strokeRoundedRect(-54, 34, 108, 12, 4);
  for (let index = -2; index <= 2; index += 1) {
    base.fillStyle(0x314954, 0.92).fillCircle(index * 22, 38, 4.5);
    base.lineStyle(1, index % 2 ? 0xff674f : 0x75efff, 0.72).strokeCircle(index * 22, 38, 6.5);
    base.fillStyle(0x010408, 0.92).fillRoundedRect(index * 22 - 7, -23, 14, 54, 3);
  }
  const warningLight = scene.add.circle(0, 42, 6, 0x293840, 1).setStrokeStyle(2, 0xffc857, 0.55);
  const dynamic = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  root.add([base, warningLight, dynamic]);
  return { placement, root, dynamic, warningLight, state: 'idle', stateStartedAt: 0,
    nextReadyAt: 1_200 + placement.y % 1_200, damageApplied: false };
};

const createSnagTrap = (scene: Phaser.Scene, placement: MechanicalPlacement): TrapRuntime => {
  const root = scene.add.container(placement.x, placement.y).setRotation(placement.rotation).setDepth(5);
  const base = scene.add.graphics();
  drawBeveledTechPlate(base, -58, -50, 116, 100, {
    face: 0x151d2a, inset: 0x050912, edge: 0xa757d6, side: 0x02040a,
    highlight: 0xf2c7ff, depth: 8
  });
  drawPanelBolts(base, -49, -41, 98, 82, 0xb69dc1, 10);
  base.lineStyle(4, 0x24354c, 0.94).beginPath()
    .moveTo(-48, 31).lineTo(-24, 31).lineTo(-15, 17)
    .moveTo(48, 31).lineTo(24, 31).lineTo(15, 17).strokePath();
  base.lineStyle(1.5, 0x6eeafa, 0.65).strokeCircle(0, 0, 36);
  base.lineStyle(1.5, 0xff5bd7, 0.48).strokeCircle(0, 0, 43);
  const leftJaw = scene.add.polygon(-32, 0, [-22, -30, 2, -17, 15, 0, 2, 17, -22, 30], 0x26374a, 1)
    .setStrokeStyle(2, 0x67eaff, 0.82);
  const rightJaw = scene.add.polygon(32, 0, [22, -30, -2, -17, -15, 0, -2, 17, 22, 30], 0x34233f, 1)
    .setStrokeStyle(2, 0xff5bd7, 0.82);
  const core = scene.add.circle(0, 0, 13, 0x070913, 1).setStrokeStyle(3, 0xcf77ff, 0.88);
  const warningLight = scene.add.circle(0, 0, 5, 0x4b3559, 1).setStrokeStyle(1, 0xffffff, 0.72);
  const dynamic = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  root.add([base, leftJaw, rightJaw, core, warningLight, dynamic]);
  return { placement, root, dynamic, warningLight, state: 'idle', stateStartedAt: 0,
    nextReadyAt: 1_500 + placement.x % 1_600, damageApplied: false };
};

/** HEIST retains its spike/snare machinery here while fire is delegated to
 * the same bounded runtime used by Arena and future anomaly scenes. */
export class HeistTrapSystem {
  private readonly traps: TrapRuntime[];
  private readonly fireSystem: SharedFireTrapSystem;
  private readonly restraintOverlay: Phaser.GameObjects.Graphics;
  private nextUpdateAt = 0;
  private snaredUntil = 0;
  private snaredX = 0;
  private snaredY = 0;

  constructor(
    scene: Phaser.Scene,
    placements: readonly HeistTrapPlacement[],
    difficulty: HeistTrapDifficultyContext,
    private readonly callbacks: HeistTrapCallbacks,
    particlesEnabled = true
  ) {
    const firePlacements: SharedFireTrapPlacement[] = placements
      .filter((placement) => placement.type === 'fire')
      .map((placement) => ({
        id: placement.id, x: placement.x, y: placement.y, rotation: placement.rotation,
        kind: 'wall', flameLength: 250, triggerRadius: 330,
        initialDelayMs: 900 + placement.x % 1_400
      }));
    this.fireSystem = new SharedFireTrapSystem(scene, firePlacements, {
      environment: 'heist', particlesEnabled,
      damageProfile: getFireHazardDamageProfile(difficulty.round, difficulty.protocol),
      maximumConcurrent: 2,
      wallCooldownMs: 4_800,
      wallSelectionIntervalMs: 900,
      wallPredictionSeconds: 0.14,
      wallMaximumLead: 54,
      onDamagePlayer: (amount) => callbacks.damagePlayer(amount)
    });
    this.traps = [];
    for (const placement of placements) {
      if (placement.type === 'spike') this.traps.push(createSpikeTrap(scene, placement as MechanicalPlacement));
      else if (placement.type === 'snag') this.traps.push(createSnagTrap(scene, placement as MechanicalPlacement));
    }
    this.restraintOverlay = scene.add.graphics().setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
  }

  get diagnostics(): HeistTrapSystemDiagnostics {
    const sharedFire = this.fireSystem.diagnostics();
    return {
      trapCount: this.traps.length + sharedFire.wallNozzles,
      fireCount: sharedFire.wallNozzles,
      spikeCount: this.traps.filter((trap) => trap.placement.type === 'spike').length,
      snagCount: this.traps.filter((trap) => trap.placement.type === 'snag').length,
      maximumLiveDynamicBatches: this.traps.length + sharedFire.dynamicGraphicsBatches + 1,
      updateIntervalMs: 50,
      physicsBodies: 0,
      sharedFire
    };
  }

  isMovementSnared(now: number): boolean { return now < this.snaredUntil; }

  update(now: number, playerX: number, playerY: number, hazardDamageMultiplier: number,
    velocityX = 0, velocityY = 0): void {
    this.snaredX = playerX;
    this.snaredY = playerY;
    this.fireSystem.update(now, { x: playerX, y: playerY, velocityX, velocityY });
    if (now < this.nextUpdateAt) return;
    this.nextUpdateAt = now + 50;
    for (const trap of this.traps) this.updateTrap(trap, now, playerX, playerY, hazardDamageMultiplier);
    this.drawRestraint(now);
  }

  destroy(): void {
    this.fireSystem.destroy();
    this.restraintOverlay.destroy();
    for (const trap of this.traps) trap.root.destroy(true);
    this.traps.length = 0;
  }

  discardReferences(): void {
    this.fireSystem.discardReferences();
    this.traps.length = 0;
  }

  private updateTrap(trap: TrapRuntime, now: number, playerX: number, playerY: number,
    damageMultiplier: number): void {
    const timing = TRAP_TIMING[trap.placement.type];
    const dx = playerX - trap.placement.x;
    const dy = playerY - trap.placement.y;
    const distanceSquared = dx * dx + dy * dy;
    if (trap.state === 'idle' && now >= trap.nextReadyAt && distanceSquared <= timing.triggerRadius ** 2) {
      trap.state = 'telegraph';
      trap.stateStartedAt = now;
      trap.damageApplied = false;
    }
    if (trap.state === 'telegraph' && now - trap.stateStartedAt >= timing.telegraph) {
      trap.state = 'active';
      trap.stateStartedAt = now;
      this.callbacks.playSfx(trap.placement.type === 'spike' ? 'mine' : 'unavailable');
    }
    if (trap.state === 'active') {
      const elapsed = now - trap.stateStartedAt;
      if (trap.placement.type === 'spike' && !trap.damageApplied && distanceSquared <= 86 ** 2) {
        trap.damageApplied = true;
        this.callbacks.damagePlayer(11 * damageMultiplier);
      } else if (trap.placement.type === 'snag' && !trap.damageApplied && distanceSquared <= 82 ** 2) {
        trap.damageApplied = true;
        this.snaredUntil = Math.max(this.snaredUntil, now + 1_000);
        this.callbacks.snarePlayer(this.snaredUntil);
      }
      if (elapsed >= timing.active) {
        trap.state = 'cooldown';
        trap.stateStartedAt = now;
        trap.nextReadyAt = now + timing.cooldown;
      }
    } else if (trap.state === 'cooldown' && now >= trap.nextReadyAt) {
      trap.state = 'idle';
      trap.stateStartedAt = now;
    }
    this.drawTrap(trap, now);
  }

  private drawTrap(trap: TrapRuntime, now: number): void {
    const graphics = trap.dynamic;
    graphics.clear();
    const timing = TRAP_TIMING[trap.placement.type];
    const elapsed = now - trap.stateStartedAt;
    const telegraph = trap.state === 'telegraph' ? Phaser.Math.Clamp(elapsed / timing.telegraph, 0, 1) : 0;
    const blink = Math.floor(now / Math.max(75, 220 - telegraph * 130)) % 2 === 0;
    trap.warningLight.setFillStyle(trap.state === 'active' ? 0xfff2a1
      : telegraph > 0.72 ? 0xff3f31 : telegraph > 0.35 ? 0xff923d : telegraph > 0 ? 0xffd45c : 0x31404a,
    trap.state === 'idle' ? 0.65 : blink ? 1 : 0.42);
    if (trap.placement.type === 'spike') {
      const extension = trap.state === 'active'
        ? 1 - Math.abs(Phaser.Math.Clamp(elapsed / timing.active, 0, 1) * 2 - 1) * 0.12
        : telegraph * 0.16;
      for (let index = -2; index <= 2; index += 1) {
        const x = index * 22;
        const height = 18 + extension * (54 + Math.abs(index) * 5);
        graphics.fillStyle(0x02060a, 0.7).fillTriangle(x - 10, 28, x + 12, 28, x + 4, -height + 7);
        graphics.fillStyle(index % 2 ? 0x7d94a0 : 0x9eb3bb, 0.98)
          .fillTriangle(x - 8, 24, x + 8, 24, x, -height);
        graphics.fillStyle(0xdafcff, 0.74).fillTriangle(x - 4, 18, x, -height, x + 1, 15);
      }
      if (trap.state === 'telegraph') graphics.lineStyle(2, telegraph > 0.7 ? 0xff5749 : 0xffc857,
        0.28 + telegraph * 0.48).strokeRoundedRect(-65, -51, 130, 102, 8);
    } else {
      const active = trap.state === 'active';
      const radius = active ? 28 + Math.sin(now * 0.018) * 5 : 12 + telegraph * 16;
      graphics.lineStyle(active ? 4 : 2, 0xb65cff, active ? 0.88 : 0.28 + telegraph * 0.5)
        .strokeCircle(0, 0, radius);
      if (active) for (let arm = 0; arm < 4; arm += 1) {
        const angle = arm * Math.PI * 0.5 + now * 0.002;
        graphics.lineStyle(2, arm % 2 ? 0xff61d5 : 0x61eaff, 0.78)
          .lineBetween(Math.cos(angle) * 12, Math.sin(angle) * 12,
            Math.cos(angle) * 47, Math.sin(angle) * 47);
      }
    }
  }

  private drawRestraint(now: number): void {
    this.restraintOverlay.clear();
    if (now >= this.snaredUntil) return;
    const pulse = 0.5 + Math.sin(now * 0.024) * 0.5;
    this.restraintOverlay.lineStyle(3, 0x69ecff, 0.72 + pulse * 0.25)
      .strokeEllipse(this.snaredX, this.snaredY, 58 + pulse * 10, 34 + pulse * 5);
    this.restraintOverlay.lineStyle(3, 0xff5bd8, 0.64 + (1 - pulse) * 0.28)
      .strokeEllipse(this.snaredX, this.snaredY, 38 + pulse * 6, 62 + pulse * 8);
  }
}
