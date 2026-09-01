import Phaser from 'phaser';
import { drawBeveledTechPlate, drawHazardStripes, drawPanelBolts } from '../../rendering/LayeredArtPrimitives.ts';
import type { HeistTrapPlacement, HeistTrapType } from './HeistFacilityLayout.ts';

interface TrapRuntime {
  placement: HeistTrapPlacement;
  root: Phaser.GameObjects.Container;
  dynamic: Phaser.GameObjects.Graphics;
  warningLight: Phaser.GameObjects.Arc;
  state: 'idle' | 'telegraph' | 'active' | 'cooldown';
  stateStartedAt: number;
  nextReadyAt: number;
  nextDamageAt: number;
  damageApplied: boolean;
}

export interface HeistTrapCallbacks {
  damagePlayer(amount: number): void;
  snarePlayer(until: number): void;
  playSfx(name: 'bomblet' | 'mine' | 'unavailable'): void;
}

export interface HeistTrapSystemDiagnostics {
  trapCount: number;
  fireCount: number;
  spikeCount: number;
  snagCount: number;
  maximumLiveDynamicBatches: number;
  updateIntervalMs: number;
  physicsBodies: 0;
}

const TRAP_TIMING: Record<HeistTrapType, { telegraph: number; active: number; cooldown: number; triggerRadius: number }> = {
  fire: { telegraph: 900, active: 1_050, cooldown: 3_200, triggerRadius: 270 },
  spike: { telegraph: 620, active: 620, cooldown: 2_650, triggerRadius: 92 },
  snag: { telegraph: 320, active: 1_000, cooldown: 3_800, triggerRadius: 78 }
};

const createFireNozzle = (scene: Phaser.Scene, placement: HeistTrapPlacement): TrapRuntime => {
  const root = scene.add.container(placement.x, placement.y).setRotation(placement.rotation).setDepth(5);
  const shadow = scene.add.ellipse(-4, 15, 88, 34, 0x000000, 0.62);
  const chassis = scene.add.graphics();
  drawBeveledTechPlate(chassis, -62, -42, 80, 84, {
    face: 0x172b36, inset: 0x09141d, edge: 0x647f8b, side: 0x02070d, highlight: 0xcaf6ff, depth: 8
  });
  drawPanelBolts(chassis, -56, -36, 59, 60, 0xb6c5ca, 9);
  drawHazardStripes(chassis, -49, 23, 52, 8, 0xffc857, 0.78, 7);
  // Integrated fuel reservoir, pressure readout, and hard-line conduits keep
  // the silhouette readable as authored machinery rather than a loose nozzle.
  chassis.fillStyle(0x061018, 1).fillRoundedRect(-52, -24, 30, 39, 7);
  chassis.lineStyle(2, 0x45dff2, 0.72).strokeRoundedRect(-52, -24, 30, 39, 7);
  chassis.fillStyle(0xff793f, 0.42).fillRoundedRect(-47, -7, 20, 17, 4);
  chassis.lineStyle(2, 0x748d98, 0.82).beginPath()
    .moveTo(-22, -16).lineTo(-4, -16).lineTo(4, -8).strokePath();
  for (let vent = 0; vent < 4; vent += 1) {
    chassis.fillStyle(0x02050a, 0.88).fillRect(-48 + vent * 7, 17, 4, 2);
  }
  const pipe = scene.add.rectangle(4, 0, 76, 30, 0x263d48, 1).setStrokeStyle(3, 0x839ca5, 0.9);
  const heatShield = scene.add.polygon(38, 0, [0, -23, 35, -14, 42, 0, 35, 14, 0, 23], 0x111c24, 1)
    .setStrokeStyle(2, 0xff8a3d, 0.78);
  const barrel = scene.add.rectangle(50, 0, 52, 18, 0x334d58, 1).setStrokeStyle(2, 0xf1fbff, 0.7);
  const throat = scene.add.ellipse(76, 0, 18, 27, 0x07090b, 1).setStrokeStyle(3, 0xff723b, 0.82);
  const fuelLine = scene.add.line(0, 0, -38, 31, 24, 31, 0x59dff0, 0.6).setLineWidth(4, 4);
  const warningLight = scene.add.circle(-38, -25, 7, 0x31404a, 1).setStrokeStyle(2, 0xccefff, 0.5);
  const dynamic = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  root.add([shadow, chassis, fuelLine, pipe, heatShield, barrel, throat, warningLight, dynamic]);
  return { placement, root, dynamic, warningLight, state: 'idle', stateStartedAt: 0,
    nextReadyAt: 900 + placement.x % 1_400, nextDamageAt: 0, damageApplied: false };
};

const createSpikeTrap = (scene: Phaser.Scene, placement: HeistTrapPlacement): TrapRuntime => {
  const root = scene.add.container(placement.x, placement.y).setRotation(placement.rotation).setDepth(4);
  const base = scene.add.graphics();
  drawBeveledTechPlate(base, -72, -58, 144, 116, {
    face: 0x101e28, inset: 0x030810, edge: 0x5d7d88, side: 0x010408, highlight: 0xc7f8ff, depth: 8
  });
  drawHazardStripes(base, -59, -47, 118, 10, 0xffc857, 0.64, 9);
  drawPanelBolts(base, -62, -48, 124, 96, 0x9eb2b8, 12);
  base.fillStyle(0x07111a, 0.95).fillRoundedRect(-54, 34, 108, 12, 4);
  base.lineStyle(1.5, 0x54e5f5, 0.48).strokeRoundedRect(-54, 34, 108, 12, 4);
  for (let piston = -2; piston <= 2; piston += 1) {
    base.fillStyle(0x314954, 0.92).fillCircle(piston * 22, 38, 4.5);
    base.lineStyle(1, piston % 2 ? 0xff674f : 0x75efff, 0.72).strokeCircle(piston * 22, 38, 6.5);
  }
  for (let index = -2; index <= 2; index += 1) {
    base.fillStyle(0x010408, 0.92).fillRoundedRect(index * 22 - 7, -23, 14, 54, 3);
    base.lineStyle(1, 0xff5f4d, 0.3).strokeRoundedRect(index * 22 - 7, -23, 14, 54, 3);
  }
  const warningLight = scene.add.circle(0, 42, 6, 0x293840, 1).setStrokeStyle(2, 0xffc857, 0.55);
  const dynamic = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  root.add([base, warningLight, dynamic]);
  return { placement, root, dynamic, warningLight, state: 'idle', stateStartedAt: 0,
    nextReadyAt: 1_200 + placement.y % 1_200, nextDamageAt: 0, damageApplied: false };
};

const createSnagTrap = (scene: Phaser.Scene, placement: HeistTrapPlacement): TrapRuntime => {
  const root = scene.add.container(placement.x, placement.y).setRotation(placement.rotation).setDepth(5);
  const base = scene.add.graphics();
  drawBeveledTechPlate(base, -58, -50, 116, 100, {
    face: 0x151d2a, inset: 0x050912, edge: 0xa757d6, side: 0x02040a, highlight: 0xf2c7ff, depth: 8
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
    nextReadyAt: 1_500 + placement.x % 1_600, nextDamageAt: 0, damageApplied: false };
};

export class HeistTrapSystem {
  readonly diagnostics: HeistTrapSystemDiagnostics;
  private readonly traps: TrapRuntime[];
  private readonly restraintOverlay: Phaser.GameObjects.Graphics;
  private nextUpdateAt = 0;
  private snaredUntil = 0;
  private snaredX = 0;
  private snaredY = 0;

  constructor(
    scene: Phaser.Scene,
    placements: readonly HeistTrapPlacement[],
    private readonly callbacks: HeistTrapCallbacks
  ) {
    this.traps = placements.map((placement) => placement.type === 'fire'
      ? createFireNozzle(scene, placement)
      : placement.type === 'spike' ? createSpikeTrap(scene, placement) : createSnagTrap(scene, placement));
    this.restraintOverlay = scene.add.graphics().setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
    this.diagnostics = {
      trapCount: this.traps.length,
      fireCount: this.traps.filter((trap) => trap.placement.type === 'fire').length,
      spikeCount: this.traps.filter((trap) => trap.placement.type === 'spike').length,
      snagCount: this.traps.filter((trap) => trap.placement.type === 'snag').length,
      maximumLiveDynamicBatches: this.traps.length + 1,
      updateIntervalMs: 50,
      physicsBodies: 0
    };
  }

  isMovementSnared(now: number): boolean { return now < this.snaredUntil; }

  update(now: number, playerX: number, playerY: number, hazardDamageMultiplier: number): void {
    this.snaredX = playerX;
    this.snaredY = playerY;
    if (now < this.nextUpdateAt) return;
    this.nextUpdateAt = now + 50;
    for (const trap of this.traps) this.updateTrap(trap, now, playerX, playerY, hazardDamageMultiplier);
    this.drawRestraint(now);
  }

  destroy(): void {
    this.restraintOverlay.destroy();
    for (const trap of this.traps) trap.root.destroy(true);
    this.traps.length = 0;
  }

  private updateTrap(trap: TrapRuntime, now: number, playerX: number, playerY: number, damageMultiplier: number): void {
    const timing = TRAP_TIMING[trap.placement.type];
    const dx = playerX - trap.placement.x;
    const dy = playerY - trap.placement.y;
    const cosine = Math.cos(trap.placement.rotation);
    const sine = Math.sin(trap.placement.rotation);
    const localX = dx * cosine + dy * sine;
    const localY = -dx * sine + dy * cosine;
    const distanceSquared = dx * dx + dy * dy;

    if (trap.state === 'idle' && now >= trap.nextReadyAt && distanceSquared <= timing.triggerRadius ** 2) {
      trap.state = 'telegraph';
      trap.stateStartedAt = now;
      trap.damageApplied = false;
    }
    if (trap.state === 'telegraph' && now - trap.stateStartedAt >= timing.telegraph) {
      trap.state = 'active';
      trap.stateStartedAt = now;
      trap.nextDamageAt = now;
      if (trap.placement.type === 'fire') this.callbacks.playSfx('bomblet');
      else if (trap.placement.type === 'spike') this.callbacks.playSfx('mine');
      else this.callbacks.playSfx('unavailable');
    }
    if (trap.state === 'active') {
      const elapsed = now - trap.stateStartedAt;
      if (trap.placement.type === 'fire') {
        const hit = localX >= 44 && localX <= 330 && Math.abs(localY) <= 62;
        if (hit && now >= trap.nextDamageAt) {
          trap.nextDamageAt = now + 260;
          this.callbacks.damagePlayer(4.2 * damageMultiplier);
        }
      } else if (trap.placement.type === 'spike') {
        if (!trap.damageApplied && distanceSquared <= 86 ** 2) {
          trap.damageApplied = true;
          this.callbacks.damagePlayer(11 * damageMultiplier);
        }
      } else if (!trap.damageApplied && distanceSquared <= 82 ** 2) {
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

    if (trap.placement.type === 'fire' && trap.state === 'active') {
      const pulse = 0.5 + Math.sin(now * 0.021) * 0.5;
      graphics.fillStyle(0xff3b18, 0.2).fillTriangle(72, -54, 346, -76 - pulse * 9, 346, 76 + pulse * 9);
      graphics.fillStyle(0xff7b22, 0.58).fillTriangle(68, -38, 322, -54 + pulse * 8, 322, 54 - pulse * 8);
      graphics.fillStyle(0xffd34f, 0.82).fillTriangle(66, -25, 294, -34 - pulse * 5, 294, 34 + pulse * 5);
      graphics.fillStyle(0xffffff, 0.96).fillTriangle(66, -12, 220, -17, 220, 17);
      for (let spark = 0; spark < 7; spark += 1) {
        const phase = (now * 0.003 + spark * 0.173) % 1;
        graphics.fillStyle(spark % 2 ? 0xffc44e : 0xff6840, 0.8 - phase * 0.55)
          .fillCircle(90 + phase * 255, Math.sin(spark * 2.1 + now * 0.01) * (18 + spark * 5), 2.6 - phase * 1.2);
      }
      for (let plume = 0; plume < 4; plume += 1) {
        const drift = (now * 0.0018 + plume * 0.29) % 1;
        graphics.fillStyle(plume % 2 ? 0x552a32 : 0x233745, 0.16 * (1 - drift))
          .fillEllipse(185 + drift * 155, Math.sin(now * 0.006 + plume * 1.9) * 42, 34 + drift * 25, 18 + drift * 18);
      }
    } else if (trap.placement.type === 'fire' && trap.state === 'telegraph') {
      graphics.lineStyle(2, telegraph > 0.65 ? 0xff4b32 : 0xffba4d, 0.25 + telegraph * 0.55)
        .lineBetween(78, -44, 312, -44).lineBetween(78, 44, 312, 44);
      graphics.lineStyle(2, 0xffd56a, 0.24 + telegraph * 0.54)
        .strokeCircle(-37, -4, 8 + telegraph * 9);
    } else if (trap.placement.type === 'fire' && trap.state === 'cooldown') {
      const cool = 1 - Phaser.Math.Clamp(elapsed / timing.cooldown, 0, 1);
      graphics.lineStyle(3, 0xff6338, 0.46 * cool).lineBetween(65, -15, 88, -15).lineBetween(65, 15, 88, 15);
    }

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
        graphics.lineStyle(1, 0xff5850, 0.62).lineBetween(x - 8, 24, x, -height);
      }
      if (trap.state === 'telegraph') {
        graphics.lineStyle(2, telegraph > 0.7 ? 0xff5749 : 0xffc857, 0.28 + telegraph * 0.48)
          .strokeRoundedRect(-65, -51, 130, 102, 8);
      }
    }

    if (trap.placement.type === 'snag') {
      const active = trap.state === 'active';
      const radius = active ? 28 + Math.sin(now * 0.018) * 5 : 12 + telegraph * 16;
      graphics.lineStyle(active ? 4 : 2, 0xb65cff, active ? 0.88 : 0.28 + telegraph * 0.5)
        .strokeCircle(0, 0, radius);
      if (active) {
        for (let arm = 0; arm < 4; arm += 1) {
          const angle = arm * Math.PI * 0.5 + now * 0.002;
          graphics.lineStyle(2, arm % 2 ? 0xff61d5 : 0x61eaff, 0.78)
            .lineBetween(Math.cos(angle) * 12, Math.sin(angle) * 12,
              Math.cos(angle) * 47, Math.sin(angle) * 47);
        }
        graphics.lineStyle(1.5, 0xffffff, 0.38).beginPath();
        for (let node = 0; node < 7; node += 1) {
          const angle = node * Math.PI * 2 / 7 - now * 0.0014;
          const nextAngle = angle + Math.PI * 2 / 7;
          graphics.moveTo(Math.cos(angle) * 34, Math.sin(angle) * 34)
            .lineTo(Math.cos(nextAngle) * 34, Math.sin(nextAngle) * 34);
        }
        graphics.strokePath();
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
    for (let band = -1; band <= 1; band += 1) {
      this.restraintOverlay.lineStyle(2, band === 0 ? 0xffffff : 0xb75cff, 0.58)
        .lineBetween(this.snaredX - 32, this.snaredY + band * 13,
          this.snaredX + 32, this.snaredY + band * 13 + Math.sin(now * 0.017 + band) * 5);
    }
  }
}
