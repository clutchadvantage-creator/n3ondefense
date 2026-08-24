import Phaser from 'phaser';
import { COLORS } from '../config/constants.ts';
import type { AudioSfxName } from '../config/audio.ts';
import type { PickupType } from '../types.ts';
import type { ModDefinition } from '../mods/types.ts';
import { MOD_RARITY_COLORS } from '../mods/ModCardView.ts';

interface PickupVisual {
  glow: Phaser.GameObjects.Arc;
  scanRing: Phaser.GameObjects.Arc;
  orbitRig: Phaser.GameObjects.Container;
  infusionOrbit: Phaser.GameObjects.Container | null;
  iconRig: Phaser.GameObjects.Container;
  leftBracket: Phaser.GameObjects.Polygon;
  rightBracket: Phaser.GameObjects.Polygon;
  phase: number;
}

interface FluxCorePickupVisual {
  glow: Phaser.GameObjects.Arc;
  orb: Phaser.GameObjects.Arc;
  electricity: Phaser.GameObjects.Graphics;
  color: number;
  phase: number;
  nextArcAt: number;
}

export interface GameplayModPickupVisual {
  root: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  scan: Phaser.GameObjects.Graphics;
  phase: number;
  definition: ModDefinition;
}

export const GAMEPLAY_PICKUP_SFX_BY_TYPE = {
  health: 'healthPickup', energy: 'energyPickup', damageBoost: 'damageBoostPickup', speedBoost: 'speedPickup',
  rapidFire: 'fireRatePickup', ricochet: 'ricochetPickup', grenadeRounds: 'grenadeRoundsPickup',
  scattershot: 'scattershotPickup', credits: 'creditPickup', coreToken: 'coreTokenPickup', plasmaChip: 'pickup',
  fluxCore: 'fluxCorePickup'
} as const satisfies Record<PickupType, AudioSfxName>;

export const GAMEPLAY_PICKUP_COLOR_BY_TYPE: Record<PickupType, number> = {
  health: COLORS.green, energy: COLORS.cyan, damageBoost: COLORS.red, speedBoost: COLORS.pink,
  rapidFire: COLORS.orange, ricochet: 0x6fffd2, grenadeRounds: 0xff7a3d, scattershot: 0x58b8ff,
  credits: 0xf5ff58, coreToken: COLORS.purple, plasmaChip: 0xd06dff, fluxCore: COLORS.cyan
};

/** Authoritative arena pickup renderer shared by the Arena and side anomalies. */
export class GameplayPickupPresentation {
  private visuals = new WeakMap<Phaser.GameObjects.Container, PickupVisual>();
  private fluxVisuals = new WeakMap<Phaser.GameObjects.Container, FluxCorePickupVisual>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hasPickupOrbit: () => boolean = () => false
  ) {}

  create(type: PickupType, x: number, y: number, color = GAMEPLAY_PICKUP_COLOR_BY_TYPE[type]): Phaser.GameObjects.Container {
    if (type === 'fluxCore') return this.createFluxCore(x, y, color);
    const container = this.scene.add.container(x, y).setDepth(6);
    const visualColor = type === 'credits' ? 0xf5ff58 : color;
    const visual = this.createShell(container, visualColor, x, y, type);
    this.addIcon(visual.iconRig, type, visualColor);
    this.visuals.set(container, visual);
    return container;
  }

  update(container: Phaser.GameObjects.Container, now: number): void {
    const visual = this.visuals.get(container);
    if (visual) {
      const pulse = 0.5 + Math.sin(now * 0.008 + visual.phase) * 0.5;
      container.setRotation(Math.sin(now * 0.0022 + visual.phase) * 0.055).setAlpha(0.8 + pulse * 0.2);
      visual.orbitRig.setRotation(now * 0.0034 + visual.phase);
      visual.infusionOrbit?.setRotation(-now * 0.0045 + visual.phase * 0.7);
      visual.scanRing.setScale(0.88 + pulse * 0.2).setAlpha(0.36 + pulse * 0.48);
      visual.glow.setScale(0.9 + pulse * 0.22).setAlpha(0.08 + pulse * 0.15);
      visual.iconRig.setRotation(-container.rotation).setScale(0.96 + pulse * 0.07)
        .setY(Math.sin(now * 0.003 + visual.phase) * 2.2);
      const bracketOffset = 16 + pulse * 2;
      visual.leftBracket.setX(-bracketOffset);
      visual.rightBracket.setX(bracketOffset);
      return;
    }
    const flux = this.fluxVisuals.get(container);
    if (!flux) return;
    const pulse = 0.5 + Math.sin(now * 0.008 + flux.phase) * 0.5;
    container.setScale(0.95 + pulse * 0.22).setAlpha(0.84 + pulse * 0.16);
    flux.glow.setAlpha(0.16 + pulse * 0.22).setScale(0.9 + pulse * 0.35);
    flux.orb.setFillStyle(pulse > 0.78 ? 0xffffff : flux.color, 0.96);
    if (now < flux.nextArcAt) return;
    flux.nextArcAt = now + 95 + Math.floor(pulse * 80);
    flux.electricity.clear().lineStyle(1, pulse > 0.6 ? 0xffffff : flux.color, 0.75);
    const angle = now * 0.01 + flux.phase;
    flux.electricity.beginPath();
    flux.electricity.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6 - 1);
    flux.electricity.lineTo(Math.cos(angle + 1.8) * 10, Math.sin(angle + 1.8) * 10 - 1);
    flux.electricity.lineTo(Math.cos(angle + 3.5) * 7, Math.sin(angle + 3.5) * 7 - 1);
    flux.electricity.strokePath();
  }

  private createFluxCore(x: number, y: number, color: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y).setDepth(8);
    const glow = this.scene.add.circle(0, -1, 10, color, 0.23).setBlendMode(Phaser.BlendModes.ADD);
    const orb = this.scene.add.circle(0, -1, 5, color, 0.95).setStrokeStyle(1, 0xffffff, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    const electricity = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    container.add([glow, orb, electricity]);
    const phase = Math.abs(x * 0.019 + y * 0.027) % (Math.PI * 2);
    this.fluxVisuals.set(container, { glow, orb, electricity, color, phase, nextArcAt: 0 });
    return container;
  }

  private createShell(container: Phaser.GameObjects.Container, color: number, x: number, y: number, type: PickupType): PickupVisual {
    const phase = Math.abs(x * 0.019 + y * 0.027 + type.length * 0.83) % (Math.PI * 2);
    const glow = this.scene.add.circle(0, 0, 18, color, 0.12).setStrokeStyle(1, color, 0.28)
      .setBlendMode(Phaser.BlendModes.ADD);
    const backing = this.scene.add.polygon(0, 0, [0, -14, 12, -7, 12, 7, 0, 14, -12, 7, -12, -7], 0x071017, 0.94)
      .setStrokeStyle(2, color, 0.92);
    const scanRing = this.scene.add.circle(0, 0, 15, 0, 0).setStrokeStyle(1.35, color, 0.7)
      .setBlendMode(Phaser.BlendModes.ADD);
    const centerBloom = this.scene.add.circle(0, 0, 10, color, 0.08).setBlendMode(Phaser.BlendModes.ADD);
    const arcs = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).lineStyle(1.6, 0xffffff, 0.64);
    for (let index = 0; index < 4; index += 1) {
      const start = index * Math.PI / 2 + 0.14;
      arcs.beginPath(); arcs.arc(0, 0, 17, start, start + 0.46, false); arcs.strokePath();
    }
    const orbitRig = this.scene.add.container(0, 0);
    const orbitPath = this.scene.add.circle(0, 0, 20, 0, 0).setStrokeStyle(1, color, 0.26);
    const satellites = [0, 1, 2].map((index) => {
      const angle = index * Math.PI * 2 / 3;
      return this.scene.add.polygon(Math.cos(angle) * 20, Math.sin(angle) * 20,
        [0, -2.8, 2.8, 0, 0, 2.8, -2.8, 0], index === 0 ? 0xffffff : color, 0.94)
        .setStrokeStyle(1, color, 0.9).setBlendMode(Phaser.BlendModes.ADD);
    });
    orbitRig.add([orbitPath, ...satellites]);
    let infusionOrbit: Phaser.GameObjects.Container | null = null;
    if (this.hasPickupOrbit()) {
      infusionOrbit = this.scene.add.container(0, 0);
      infusionOrbit.add([
        this.scene.add.circle(0, 0, 23, color, 0.035).setStrokeStyle(1, 0xffffff, 0.42),
        this.scene.add.circle(23, 0, 2.4, 0xffffff, 0.98).setStrokeStyle(1, color, 1),
        this.scene.add.circle(-23, 0, 1.8, color, 0.98).setStrokeStyle(1, 0xffffff, 0.86)
      ]);
    }
    const iconRig = this.scene.add.container(0, 0);
    const leftBracket = this.scene.add.polygon(-16.5, 0, [0, -6, 2.5, -6, 2.5, -2.5, 6, 0, 2.5, 2.5, 2.5, 6, 0, 6], color, 0.86);
    const rightBracket = this.scene.add.polygon(16.5, 0, [0, -6, -2.5, -6, -2.5, -2.5, -6, 0, -2.5, 2.5, -2.5, 6, 0, 6], color, 0.86);
    container.add([glow, orbitRig]);
    if (infusionOrbit) container.add(infusionOrbit);
    container.add([backing, centerBloom, scanRing, arcs, iconRig, leftBracket, rightBracket]);
    return { glow, scanRing, orbitRig, infusionOrbit, iconRig, leftBracket, rightBracket, phase };
  }

  private addIcon(iconRig: Phaser.GameObjects.Container, type: PickupType, color: number): void {
    if (type === 'health') {
      iconRig.add([this.scene.add.rectangle(0, 0, 4.5, 15, color, 1).setStrokeStyle(1, 0xe7ffed, 1),
        this.scene.add.rectangle(0, 0, 15, 4.5, color, 1).setStrokeStyle(1, 0xe7ffed, 1)]); return;
    }
    if (type === 'energy') {
      iconRig.add(this.scene.add.polygon(0, 0, [-3.5, -11, 2, -11, -1, -3, 5.5, -3, -2, 11, 0.5, 3, -5.5, 3], color, 1)
        .setStrokeStyle(1, 0xe8fdff, 1)); return;
    }
    if (type === 'damageBoost') {
      iconRig.add([this.scene.add.rectangle(-1, -2, 16, 6, color, 1).setStrokeStyle(1, 0xffffff, 0.92),
        this.scene.add.rectangle(8.5, -2, 7, 2.5, 0xffffff, 0.94),
        this.scene.add.polygon(-4, 4, [0, 0, 5, 0, 2.5, 8, -1.5, 8], color, 1).setStrokeStyle(1, 0xffffff, 0.72)]); return;
    }
    if (type === 'speedBoost') {
      iconRig.add([this.scene.add.triangle(0, 11, -4, 0, 4, 0, 0, 7, COLORS.orange, 0.96),
        this.scene.add.polygon(0, -1, [0, -11, 6, -3, 5, 7, 0, 10, -5, 7, -6, -3], color, 1).setStrokeStyle(1, 0xffffff, 0.92)]); return;
    }
    if (type === 'rapidFire') {
      iconRig.add([-6, 0, 6].map((offset) => this.scene.add.rectangle(offset, 0, 3.5, 17, color, 1)
        .setRotation(0.31).setStrokeStyle(1, 0xffffff, 0.78))); return;
    }
    if (type === 'ricochet') {
      iconRig.add([this.scene.add.rectangle(0, 0, 2.5, 20, 0xffffff, 0.82).setRotation(0.42),
        this.scene.add.line(0, 0, -10, 7, -1, 1, color, 1).setLineWidth(2.5, 2.5),
        this.scene.add.line(0, 0, 1, -1, 10, -8, color, 1).setLineWidth(2.5, 2.5),
        this.scene.add.polygon(0, 0, [0, -4, 1.5, -1.5, 4, 0, 1.5, 1.5, 0, 4, -1.5, 1.5, -4, 0, -1.5, -1.5], 0xffffff, 0.96)]); return;
    }
    if (type === 'grenadeRounds') {
      iconRig.add([this.scene.add.circle(0, 2, 7.5, color, 0.98).setStrokeStyle(1.5, 0xffffff, 0.94),
        this.scene.add.rectangle(0, -6.5, 7, 4, 0x101722, 1).setStrokeStyle(1, color, 1),
        this.scene.add.line(0, 0, 2, -9, 8, -10, 0xffffff, 0.95).setLineWidth(1.5, 1.5),
        this.scene.add.circle(8.5, -9.5, 2.5, 0, 0).setStrokeStyle(1.4, color, 1),
        this.scene.add.line(0, 0, -6, 3, 6, 3, 0xffffff, 0.55).setLineWidth(1, 1)]); return;
    }
    if (type === 'scattershot') {
      iconRig.add([this.scene.add.line(0, 0, 0, 0, 8, -7, color, 0.72).setLineWidth(1, 1),
        this.scene.add.line(0, 0, 0, 0, 10, 0, color, 0.72).setLineWidth(1, 1),
        this.scene.add.line(0, 0, 0, 0, 8, 7, color, 0.72).setLineWidth(1, 1),
        this.scene.add.rectangle(-4, 1, 8, 18, color, 0.98).setStrokeStyle(1.4, 0xffffff, 0.92),
        this.scene.add.rectangle(-4, 9, 10, 3.5, 0xffd45e, 1).setStrokeStyle(1, 0xffffff, 0.7),
        this.scene.add.circle(5, -7, 2.2, 0xffffff, 0.96).setStrokeStyle(1, color, 1),
        this.scene.add.circle(9, 0, 2.2, 0xffffff, 0.96).setStrokeStyle(1, color, 1),
        this.scene.add.circle(5, 7, 2.2, 0xffffff, 0.96).setStrokeStyle(1, color, 1)]); return;
    }
    if (type === 'credits') {
      iconRig.add([this.scene.add.text(0, 0, '¢', { fontFamily: 'Orbitron, Rajdhani, sans-serif', fontSize: '24px',
        fontStyle: 'bold', color: '#fff36a', stroke: '#f5ff58', strokeThickness: 4 }).setOrigin(0.5).setAlpha(0.32)
        .setBlendMode(Phaser.BlendModes.ADD),
      this.scene.add.text(0, -1, '¢', { fontFamily: 'Orbitron, Rajdhani, sans-serif', fontSize: '22px',
        fontStyle: 'bold', color: '#ffffa8', stroke: '#8e7300', strokeThickness: 2 }).setOrigin(0.5)
        .setShadow(0, 0, '#f5ff58', 6, true, true)]); return;
    }
    if (type === 'coreToken') {
      iconRig.add([this.scene.add.polygon(0, 0, [0, -10, 8.5, -5, 8.5, 5, 0, 10, -8.5, 5, -8.5, -5], color, 0.96)
        .setStrokeStyle(1.5, 0xffffff, 0.94), this.scene.add.circle(0, 0, 3.5, 0xffffff, 0.96).setStrokeStyle(1, color, 1)]); return;
    }
    if (type === 'plasmaChip') {
      iconRig.add([this.scene.add.polygon(0, 0, [-10, -6, 4, -9, 10, 0, 4, 9, -10, 6, -5, 0], color, 0.96)
        .setStrokeStyle(1.5, 0xffffff, 0.94), this.scene.add.rectangle(1, 0, 9, 2.5, 0xffffff, 0.9).setRotation(-0.22)]);
    }
  }
}

export const createGameplayModPickupVisual = (
  scene: Phaser.Scene, definition: ModDefinition, x: number, y: number
): GameplayModPickupVisual => {
  const corrupted = definition.variant === 'corrupted';
  const rarityColor = corrupted ? 0xff2ba7 : MOD_RARITY_COLORS[definition.rarity];
  const root = scene.add.container(x, y).setDepth(12);
  const premium = definition.rarity === 'legendary' || definition.rarity === 'supreme';
  const glow = scene.add.circle(0, 0, definition.rarity === 'supreme' ? 32 : premium ? 27 : 23, rarityColor,
    definition.rarity === 'supreme' ? 0.26 : 0.18).setStrokeStyle(2, rarityColor, 0.62)
    .setBlendMode(Phaser.BlendModes.ADD);
  const outer = scene.add.polygon(0, 0, [0, -17, 14, -9, 14, 9, 0, 17, -14, 9, -14, -9], 0x06101a, 0.96)
    .setStrokeStyle(2, rarityColor, 1);
  const chip = scene.add.polygon(0, 0, [0, -9, 9, 0, 0, 9, -9, 0], definition.iconColor, 0.96)
    .setStrokeStyle(1, 0xffffff, 0.88).setBlendMode(Phaser.BlendModes.ADD);
  const label = scene.add.text(0, 24, corrupted ? 'CORRUPTED MOD' : `${definition.rarity.toUpperCase()} MOD`, {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '10px', fontStyle: 'bold',
    color: Phaser.Display.Color.IntegerToColor(rarityColor).rgba, stroke: '#020611', strokeThickness: 3
  }).setOrigin(0.5);
  const scan = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  root.add([glow, outer, chip, scan, label]);
  return { root, glow, scan, phase: Math.abs(x * 0.019 + y * 0.031 + definition.id.length), definition };
};

export const updateGameplayModPickupVisual = (visual: GameplayModPickupVisual, now: number, dt: number): void => {
  const pulse = 0.5 + Math.sin(now * 0.007 + visual.phase) * 0.5;
  visual.root.rotation += dt * (visual.definition.rarity === 'supreme' ? 0.92 : visual.definition.rarity === 'legendary' ? 0.75 : 0.42);
  visual.root.setScale(0.96 + pulse * 0.08);
  visual.glow.setAlpha(0.12 + pulse * 0.2).setScale(0.9 + pulse * 0.25);
  visual.scan.clear().lineStyle(1, 0xffffff, 0.38 + pulse * 0.34)
    .lineBetween(-10, -13 + pulse * 25, 10, -13 + pulse * 25);
};
