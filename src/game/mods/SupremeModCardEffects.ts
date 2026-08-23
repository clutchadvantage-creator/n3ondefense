import Phaser from 'phaser';
import type { HudAnimationLevel } from '../config/interfaceSettings.ts';

export type SupremeCardEffectDetail = 'static' | 'reduced' | 'full';
export type SupremeCardPresentationState = 'idle' | 'acquired';

type SupremeEnergyStyle =
  | 'arsenal'
  | 'singularity'
  | 'carapace'
  | 'phase'
  | 'triune'
  | 'fortress'
  | 'ordnance'
  | 'sentry'
  | 'terminal'
  | 'stellar';

export interface SupremeCardEffectProfile {
  primary: number;
  secondary: number;
  energyStyle: SupremeEnergyStyle;
  arcIntensity: number;
  particleIntensity: number;
}

export const SUPREME_CARD_EFFECT_PROFILES: Readonly<Record<string, SupremeCardEffectProfile>> = Object.freeze({
  'supreme-eventide-arsenal': { primary: 0x54f6ff, secondary: 0xff5dd7, energyStyle: 'arsenal', arcIntensity: 0.86, particleIntensity: 0.72 },
  'supreme-singularity-chamber': { primary: 0xb46cff, secondary: 0x58f7ff, energyStyle: 'singularity', arcIntensity: 0.72, particleIntensity: 0.9 },
  'supreme-quantum-carapace': { primary: 0x67ffde, secondary: 0x75a7ff, energyStyle: 'carapace', arcIntensity: 0.55, particleIntensity: 0.55 },
  'supreme-zero-point-drive': { primary: 0x66f5ff, secondary: 0xff63ee, energyStyle: 'phase', arcIntensity: 0.78, particleIntensity: 0.68 },
  'supreme-triune-bastion': { primary: 0xffd867, secondary: 0x61f9ff, energyStyle: 'triune', arcIntensity: 0.68, particleIntensity: 0.5 },
  'supreme-immortal-emplacements': { primary: 0x79ffb2, secondary: 0x57dcff, energyStyle: 'fortress', arcIntensity: 0.5, particleIntensity: 0.45 },
  'supreme-infinite-ordnance': { primary: 0xff8fdc, secondary: 0xffd762, energyStyle: 'ordnance', arcIntensity: 0.9, particleIntensity: 0.68 },
  'supreme-omniscient-sentry': { primary: 0x62f4ff, secondary: 0xff4b9f, energyStyle: 'sentry', arcIntensity: 0.7, particleIntensity: 0.5 },
  'supreme-final-protocol': { primary: 0xff477d, secondary: 0x62edff, energyStyle: 'terminal', arcIntensity: 1, particleIntensity: 0.7 },
  'supreme-crown-of-stars': { primary: 0xf5ffff, secondary: 0xc66cff, energyStyle: 'stellar', arcIntensity: 0.62, particleIntensity: 1 }
});

export interface SupremeModCardEffectsOptions {
  modId: string;
  width: number;
  height: number;
  iconY: number;
  iconColor: number;
  equipped: boolean;
  detail: SupremeCardEffectDetail;
  motion: HudAnimationLevel;
  presentationState: SupremeCardPresentationState;
}

const hash = (value: string): number => {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
};

const drawArc = (
  graphics: Phaser.GameObjects.Graphics,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: number,
  seed: number,
  alpha: number
): void => {
  graphics.lineStyle(1.4, color, alpha);
  graphics.beginPath();
  graphics.moveTo(fromX, fromY);
  const normalX = -(toY - fromY);
  const normalY = toX - fromX;
  const normalLength = Math.max(1, Math.hypot(normalX, normalY));
  for (let step = 1; step < 8; step += 1) {
    const ratio = step / 8;
    const noise = Math.sin(seed * 0.013 + step * 4.73) * (step % 2 ? 3.8 : 2.1);
    graphics.lineTo(
      Phaser.Math.Linear(fromX, toX, ratio) + normalX / normalLength * noise,
      Phaser.Math.Linear(fromY, toY, ratio) + normalY / normalLength * noise
    );
  }
  graphics.lineTo(toX, toY);
  graphics.strokePath();
};

const addChamferedCorners = (
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  color: number
): void => {
  const x = width / 2 - 6;
  const y = height / 2 - 6;
  const arm = Math.max(8, width * 0.095);
  graphics.lineStyle(2, color, 0.88);
  graphics.beginPath();
  graphics.moveTo(-x, -y + arm); graphics.lineTo(-x, -y); graphics.lineTo(-x + arm, -y);
  graphics.moveTo(x - arm, -y); graphics.lineTo(x, -y); graphics.lineTo(x, -y + arm);
  graphics.moveTo(x, y - arm); graphics.lineTo(x, y); graphics.lineTo(x - arm, y);
  graphics.moveTo(-x + arm, y); graphics.lineTo(-x, y); graphics.lineTo(-x, y - arm);
  graphics.strokePath();
};

/**
 * Reusable, bounded Supreme-card presentation. All shapes are allocated once,
 * animated by Phaser's shared tween clock, and disposed with the owning card.
 * Compact grids automatically use the reduced detail tier.
 */
export class SupremeModCardEffects {
  readonly root: Phaser.GameObjects.Container;

  private readonly tweens: Phaser.Tweens.Tween[] = [];
  private readonly hoverTweens: Phaser.Tweens.Tween[] = [];
  private readonly hoverHalo: Phaser.GameObjects.Rectangle;
  private readonly reactorRoot: Phaser.GameObjects.Container;
  private readonly hoverArc: Phaser.GameObjects.Graphics;
  private disposed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: SupremeModCardEffectsOptions
  ) {
    const { width, height, iconY, iconColor } = options;
    const profile = SUPREME_CARD_EFFECT_PROFILES[options.modId] ?? SUPREME_CARD_EFFECT_PROFILES['supreme-crown-of-stars'];
    const seed = hash(options.modId);
    this.root = scene.add.container(0, 0);

    // Deep holographic substrate, cached stars, and powered circuit traces.
    const substrate = scene.add.rectangle(0, 0, width - 10, height - 10, 0x06151f, 0.72)
      .setStrokeStyle(1, profile.primary, 0.24);
    const upperField = scene.add.rectangle(0, -height * 0.2, width - 16, height * 0.42, profile.primary, 0.035)
      .setBlendMode(Phaser.BlendModes.ADD);
    const lowerField = scene.add.rectangle(0, height * 0.25, width - 16, height * 0.34, profile.secondary, 0.026)
      .setBlendMode(Phaser.BlendModes.ADD);
    const starfield = scene.add.graphics();
    const starCount = options.detail === 'full' ? 18 : options.detail === 'reduced' ? 10 : 8;
    for (let index = 0; index < starCount; index += 1) {
      const px = -width * 0.43 + ((seed + index * 47) % 997) / 997 * width * 0.86;
      const py = -height * 0.43 + ((seed + index * 83) % 991) / 991 * height * 0.86;
      starfield.fillStyle(index % 4 === 0 ? profile.secondary : 0xeaffff, index % 4 === 0 ? 0.32 : 0.16);
      starfield.fillCircle(px, py, index % 5 === 0 ? 1.25 : 0.7);
    }
    const circuitry = scene.add.graphics();
    circuitry.lineStyle(1, profile.primary, 0.22);
    const left = -width * 0.43;
    const right = width * 0.43;
    const circuitY = height * 0.14;
    circuitry.beginPath();
    circuitry.moveTo(left, circuitY); circuitry.lineTo(-width * 0.25, circuitY); circuitry.lineTo(-width * 0.17, circuitY + 8); circuitry.lineTo(-width * 0.05, circuitY + 8);
    circuitry.moveTo(right, circuitY + height * 0.2); circuitry.lineTo(width * 0.26, circuitY + height * 0.2); circuitry.lineTo(width * 0.18, circuitY + height * 0.2 - 8); circuitry.lineTo(width * 0.04, circuitY + height * 0.2 - 8);
    circuitry.strokePath();
    circuitry.fillStyle(profile.secondary, 0.7);
    circuitry.fillCircle(-width * 0.05, circuitY + 8, 1.7);
    circuitry.fillCircle(width * 0.04, circuitY + height * 0.2 - 8, 1.7);

    // Layered energized frame, corner accumulators, and hover overload shell.
    const bloomFrame = scene.add.rectangle(0, 0, width + 5, height + 5, 0x000000, 0)
      .setStrokeStyle(options.detail === 'full' ? 6 : 4, profile.primary, options.detail === 'static' ? 0.2 : 0.1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const outerFrame = scene.add.rectangle(0, 0, width - 2, height - 2, 0x000000, 0)
      .setStrokeStyle(2, 0xf4ffff, 0.82);
    const spectralFrame = scene.add.rectangle(0, 0, width - 7, height - 7, 0x000000, 0)
      .setStrokeStyle(1, profile.secondary, 0.55);
    const corners = scene.add.graphics();
    addChamferedCorners(corners, width, height, profile.primary);
    this.hoverHalo = scene.add.rectangle(0, 0, width + 10, height + 10, 0x000000, 0)
      .setStrokeStyle(7, profile.secondary, 0)
      .setBlendMode(Phaser.BlendModes.ADD);

    // A bounded diagonal foil system: small cards use one band, focus cards two.
    const foilA = scene.add.rectangle(-width * 0.26, 0, Math.max(8, width * 0.12), height * 0.9, 0xc9ffff, 0.07)
      .setRotation(-0.24).setBlendMode(Phaser.BlendModes.ADD);
    const foilB = scene.add.rectangle(width * 0.24, 0, Math.max(4, width * 0.035), height * 0.86, profile.secondary, options.detail === 'full' ? 0.11 : 0.055)
      .setRotation(-0.24).setBlendMode(Phaser.BlendModes.ADD);

    // Reactor chamber behind the authoritative Mod icon.
    this.reactorRoot = scene.add.container(0, iconY);
    const reactorGlow = scene.add.circle(0, 0, width * 0.31, profile.primary, 0.045)
      .setStrokeStyle(Math.max(3, width * 0.025), profile.primary, 0.1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const segmentedRing = scene.add.graphics();
    const ringRadius = width * 0.278;
    segmentedRing.lineStyle(Math.max(1.2, width * 0.009), profile.primary, 0.8);
    for (let segment = 0; segment < 6; segment += 1) {
      const start = segment * Phaser.Math.PI2 / 6 + 0.08;
      segmentedRing.arc(0, 0, ringRadius, start, start + 0.62, false);
      segmentedRing.strokePath();
    }
    const counterRing = scene.add.graphics();
    counterRing.lineStyle(Math.max(1, width * 0.006), profile.secondary, 0.72);
    counterRing.arc(0, 0, width * 0.218, -0.35, 1.48, false);
    counterRing.strokePath();
    counterRing.arc(0, 0, width * 0.218, 2.2, 4.6, false);
    counterRing.strokePath();
    const core = scene.add.circle(0, 0, width * 0.125, iconColor, 0.12)
      .setStrokeStyle(2, 0xf5ffff, 0.55).setBlendMode(Phaser.BlendModes.ADD);
    const orbital = scene.add.container(0, 0);
    const orbitalCount = options.detail === 'full' ? 4 : 3;
    for (let index = 0; index < orbitalCount; index += 1) {
      const angle = index / orbitalCount * Phaser.Math.PI2;
      orbital.add(scene.add.circle(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, Math.max(1.2, width * 0.012), index % 2 ? profile.secondary : 0xffffff, 0.88));
    }
    this.reactorRoot.add([reactorGlow, segmentedRing, counterRing, core, orbital]);

    // Short, prebuilt electrical discharges. No geometry is regenerated while idle.
    const arcTop = scene.add.graphics().setAlpha(options.detail === 'static' ? 0.32 : 0);
    drawArc(arcTop, -width * 0.39, -height * 0.47, width * 0.32, -height * 0.47, profile.primary, seed, profile.arcIntensity);
    const arcReactor = scene.add.graphics().setAlpha(options.detail === 'static' ? 0.24 : 0);
    drawArc(arcReactor, -width * 0.24, iconY - width * 0.09, width * 0.24, iconY + width * 0.06, profile.secondary, seed + 91, profile.arcIntensity * 0.85);
    this.hoverArc = scene.add.graphics().setAlpha(0);
    drawArc(this.hoverArc, -width * 0.45, height * 0.39, width * 0.45, -height * 0.31, 0xffffff, seed + 233, 0.7);

    this.root.add([
      substrate, upperField, lowerField, starfield, circuitry,
      bloomFrame, outerFrame, spectralFrame, corners, this.hoverHalo,
      foilA, foilB, arcTop, arcReactor, this.hoverArc, this.reactorRoot
    ]);

    this.createPersonality(profile, seed);
    this.createMotes(profile, seed);
    this.createGlitch(profile, seed);
    if (options.equipped) this.createEquippedLink(profile);

    if (options.motion !== 'off') {
      this.track(scene.tweens.add({ targets: [bloomFrame, reactorGlow], alpha: { from: 0.28, to: 0.75 }, duration: 1450 + seed % 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      this.track(scene.tweens.add({ targets: segmentedRing, angle: 360, duration: options.detail === 'full' ? 5600 : 8400, repeat: -1 }));
      if (options.detail === 'full') {
        this.track(scene.tweens.add({ targets: counterRing, angle: -360, duration: 7200, repeat: -1 }));
        this.track(scene.tweens.add({ targets: orbital, angle: 360, duration: 3900, repeat: -1 }));
      }
      this.track(scene.tweens.add({ targets: core, alpha: { from: 0.22, to: 0.62 }, scale: { from: 0.86, to: 1.08 }, duration: 920 + seed % 330, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      this.track(scene.tweens.add({ targets: foilA, x: { from: -width * 0.29, to: width * 0.29 }, alpha: { from: 0.025, to: options.detail === 'full' ? 0.16 : 0.09 }, duration: options.detail === 'full' ? 3200 : 5200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      if (options.detail === 'full') {
        this.track(scene.tweens.add({ targets: foilB, x: { from: width * 0.29, to: -width * 0.29 }, alpha: { from: 0.025, to: 0.18 }, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
        this.track(scene.tweens.add({ targets: arcReactor, alpha: { from: 0, to: 0.88 }, duration: 82, yoyo: true, repeat: -1, repeatDelay: 1850 + seed % 1400 }));
      }
      this.track(scene.tweens.add({ targets: arcTop, alpha: { from: 0, to: options.detail === 'full' ? 0.92 : 0.52 }, duration: 96, yoyo: true, repeat: -1, repeatDelay: 2500 + seed % 2100 }));
    }

    if (options.presentationState === 'acquired' && options.motion !== 'off') {
      this.root.setAlpha(0.12).setScale(0.92);
      outerFrame.setAlpha(0.1);
      core.setScale(0.12).setAlpha(1);
      this.track(scene.tweens.add({ targets: this.root, alpha: 1, scale: 1, duration: 740, delay: 180, ease: 'Cubic.Out' }));
      this.track(scene.tweens.add({ targets: outerFrame, alpha: 1, duration: 130, delay: 610, yoyo: true, repeat: 3 }));
      this.track(scene.tweens.add({ targets: core, scale: 1, duration: 620, delay: 360, ease: 'Back.Out' }));
    }
  }

  setHovered(hovered: boolean): void {
    if (this.disposed) return;
    this.hoverTweens.forEach((tween) => tween.remove());
    this.hoverTweens.length = 0;
    if (this.options.motion === 'off') {
      this.hoverHalo.setAlpha(hovered ? 0.36 : 0);
      this.hoverArc.setAlpha(hovered ? 0.28 : 0);
      return;
    }
    this.hoverTweens.push(
      this.scene.tweens.add({ targets: this.root, alpha: hovered ? 1 : 0.92, duration: 180, ease: 'Quad.Out' }),
      this.scene.tweens.add({ targets: this.hoverHalo, alpha: hovered ? 0.44 : 0, duration: 190, ease: 'Quad.Out' }),
      this.scene.tweens.add({ targets: this.reactorRoot, scale: hovered ? 1.08 : 1, duration: 210, ease: 'Cubic.Out' }),
      this.scene.tweens.add({ targets: this.hoverArc, alpha: hovered ? 0.58 : 0, duration: hovered ? 120 : 210, ease: 'Quad.Out' })
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hoverTweens.forEach((tween) => tween.remove());
    this.hoverTweens.length = 0;
    this.tweens.forEach((tween) => tween.remove());
    this.tweens.length = 0;
  }

  private track(tween: Phaser.Tweens.Tween): void {
    this.tweens.push(tween);
  }

  private createMotes(profile: SupremeCardEffectProfile, seed: number): void {
    const { width, height, detail, motion } = this.options;
    const count = detail === 'full' ? Math.max(4, Math.round(7 * profile.particleIntensity)) : detail === 'reduced' ? 2 : 3;
    const motes: Phaser.GameObjects.Arc[] = [];
    for (let index = 0; index < count; index += 1) {
      const x = -width * 0.38 + ((seed + index * 61) % 953) / 953 * width * 0.76;
      const y = -height * 0.34 + ((seed + index * 97) % 947) / 947 * height * 0.69;
      const mote = this.scene.add.circle(x, y, index % 3 === 0 ? 1.8 : 1.1, index % 2 ? profile.secondary : profile.primary, detail === 'static' ? 0.45 : 0.68)
        .setBlendMode(Phaser.BlendModes.ADD);
      motes.push(mote);
      this.root.add(mote);
    }
    if (motion === 'off') return;
    this.track(this.scene.tweens.add({
      targets: motes,
      y: `-=${detail === 'full' ? 13 : 7}`,
      alpha: { from: 0.18, to: detail === 'full' ? 0.9 : 0.58 },
      duration: detail === 'full' ? 1900 + seed % 600 : 3100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    }));
  }

  private createGlitch(profile: SupremeCardEffectProfile, seed: number): void {
    const { width, height, detail, motion } = this.options;
    const count = detail === 'full' ? 3 : detail === 'reduced' ? 1 : 2;
    const bars: Phaser.GameObjects.Rectangle[] = [];
    for (let index = 0; index < count; index += 1) {
      const bar = this.scene.add.rectangle(
        index % 2 ? width * 0.12 : -width * 0.1,
        -height * 0.34 + index * height * 0.29,
        width * (0.24 + index * 0.08),
        Math.max(1, height * 0.007),
        index % 2 ? profile.secondary : profile.primary,
        motion === 'off' ? 0.15 : 0
      );
      bars.push(bar);
      this.root.add(bar);
    }
    if (motion === 'off') return;
    this.track(this.scene.tweens.add({
      targets: bars,
      x: `+=${detail === 'full' ? 18 : 8}`,
      alpha: { from: 0, to: detail === 'full' ? 0.72 : 0.32 },
      duration: 74,
      yoyo: true,
      repeat: -1,
      repeatDelay: detail === 'full' ? 2200 + seed % 1900 : 5200 + seed % 1700
    }));
  }

  private createEquippedLink(profile: SupremeCardEffectProfile): void {
    const { width, height, motion } = this.options;
    const y = height * 0.43;
    const connector = this.scene.add.graphics();
    connector.lineStyle(1, profile.primary, 0.62);
    connector.lineBetween(-width * 0.27, y, width * 0.27, y);
    connector.fillStyle(profile.primary, 0.84);
    connector.fillCircle(-width * 0.29, y, 2.5);
    connector.fillCircle(width * 0.29, y, 2.5);
    const flow = this.scene.add.rectangle(-width * 0.25, y, Math.max(4, width * 0.045), 2, 0xffffff, 0.82)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.root.add([connector, flow]);
    if (motion !== 'off') this.track(this.scene.tweens.add({ targets: flow, x: width * 0.25, alpha: { from: 0.18, to: 1 }, duration: 980, repeat: -1, ease: 'Sine.easeInOut' }));
  }

  private createPersonality(profile: SupremeCardEffectProfile, seed: number): void {
    const { width, height, iconY, detail, motion } = this.options;
    const layer = this.scene.add.container(0, 0);
    this.root.add(layer);
    // Grid cards retain the unique geometry but only focused/full cards run
    // the personality motion, preventing ten visible Supreme cards from each
    // owning another independent high-frequency animation.
    const animate = motion !== 'off' && detail === 'full';

    if (profile.energyStyle === 'arsenal') {
      const streaks = [0, 1, 2].map((index) => this.scene.add.rectangle(-width * 0.34, iconY - width * 0.17 + index * width * 0.17, width * (0.14 + index * 0.035), 1.5, index === 1 ? profile.secondary : profile.primary, 0.54));
      layer.add(streaks);
      if (animate) this.track(this.scene.tweens.add({ targets: streaks, x: width * 0.34, alpha: { from: 0.08, to: 0.72 }, duration: detail === 'full' ? 880 : 1500, repeat: -1, repeatDelay: 700, ease: 'Cubic.In' }));
    } else if (profile.energyStyle === 'singularity') {
      const orbit = this.scene.add.container(0, iconY);
      for (let index = 0; index < 4; index += 1) orbit.add(this.scene.add.rectangle(width * (0.2 + index * 0.016), 0, 3, 6, index % 2 ? profile.secondary : profile.primary, 0.62).setRotation(index * 0.7));
      layer.add(orbit);
      if (animate) this.track(this.scene.tweens.add({ targets: orbit, angle: 360, scale: { from: 1.08, to: 0.58 }, alpha: { from: 0.25, to: 0.9 }, duration: 2600, repeat: -1, ease: 'Sine.easeIn' }));
    } else if (profile.energyStyle === 'carapace') {
      const shield = this.scene.add.polygon(0, iconY, [0,-width*.3,width*.26,-width*.15,width*.26,width*.16,0,width*.3,-width*.26,width*.16,-width*.26,-width*.15], 0x000000, 0).setStrokeStyle(2, profile.primary, 0.42);
      layer.add(shield);
      if (animate) this.track(this.scene.tweens.add({ targets: shield, alpha: { from: 0.22, to: 0.78 }, scale: { from: 0.92, to: 1.08 }, duration: 1700, yoyo: true, repeat: -1 }));
    } else if (profile.energyStyle === 'phase') {
      const ghosts = [-1, 0, 1].map((offset) => this.scene.add.rectangle(offset * width * 0.13, iconY, 2, width * 0.48, offset ? profile.secondary : profile.primary, offset ? 0.2 : 0.42));
      layer.add(ghosts);
      if (animate) this.track(this.scene.tweens.add({ targets: ghosts, x: `+=${width * 0.08}`, alpha: { from: 0.06, to: 0.52 }, duration: 520, yoyo: true, repeat: -1, repeatDelay: 780 }));
    } else if (profile.energyStyle === 'triune') {
      const nodes = [-1, 0, 1].map((offset, index) => this.scene.add.circle(offset * width * 0.19, iconY + (index === 1 ? -width * 0.24 : width * 0.16), width * 0.025, index === 1 ? profile.secondary : profile.primary, 0.78));
      const links = this.scene.add.graphics();
      links.lineStyle(1, profile.primary, 0.34);
      links.strokeTriangle(-width*.19, iconY+width*.16, 0, iconY-width*.24, width*.19, iconY+width*.16);
      layer.add([links, ...nodes]);
      if (animate) this.track(this.scene.tweens.add({ targets: nodes, scale: { from: 0.7, to: 1.5 }, alpha: { from: 0.28, to: 1 }, duration: 780, yoyo: true, repeat: -1, stagger: 180 }));
    } else if (profile.energyStyle === 'fortress') {
      const armor = [-1, 1].map((side) => this.scene.add.rectangle(side * width * 0.24, iconY, width * 0.055, width * 0.43, profile.primary, 0.18).setStrokeStyle(1, profile.secondary, 0.54));
      const scan = this.scene.add.rectangle(0, iconY - width * 0.25, width * 0.48, 2, profile.secondary, 0.56);
      layer.add([...armor, scan]);
      if (animate) this.track(this.scene.tweens.add({ targets: scan, y: iconY + width * 0.25, alpha: { from: 0.1, to: 0.7 }, duration: 1800, yoyo: true, repeat: -1 }));
    } else if (profile.energyStyle === 'ordnance') {
      const feeds = [-1, 0, 1].map((offset, index) => this.scene.add.rectangle(offset * width * 0.17, -height * 0.35, 3, 9 + index * 3, index % 2 ? profile.secondary : profile.primary, 0.55));
      layer.add(feeds);
      if (animate) this.track(this.scene.tweens.add({ targets: feeds, y: height * 0.36, alpha: { from: 0.05, to: 0.7 }, duration: 1250, repeat: -1, stagger: 180, ease: 'Cubic.In' }));
    } else if (profile.energyStyle === 'sentry') {
      const reticle = this.scene.add.graphics();
      reticle.lineStyle(1.5, profile.primary, 0.6);
      reticle.strokeCircle(0, iconY, width * 0.31);
      reticle.lineBetween(-width*.34, iconY, -width*.23, iconY);
      reticle.lineBetween(width*.23, iconY, width*.34, iconY);
      const scanner = this.scene.add.rectangle(0, iconY, width * 0.56, 2, profile.secondary, 0.44);
      layer.add([reticle, scanner]);
      if (animate) this.track(this.scene.tweens.add({ targets: reticle, angle: 360, duration: 5200, repeat: -1 }));
      if (animate) this.track(this.scene.tweens.add({ targets: scanner, angle: { from: -48, to: 48 }, alpha: { from: 0.14, to: 0.68 }, duration: 1050, yoyo: true, repeat: -1 }));
    } else if (profile.energyStyle === 'terminal') {
      const warningA = this.scene.add.rectangle(0, -height * 0.39, width * 0.58, 2, profile.primary, 0.62);
      const warningB = this.scene.add.rectangle(0, height * 0.39, width * 0.58, 2, profile.secondary, 0.52);
      layer.add([warningA, warningB]);
      if (animate) this.track(this.scene.tweens.add({ targets: [warningA, warningB], alpha: { from: 0.08, to: 0.92 }, scaleX: { from: 0.42, to: 1 }, duration: 390, yoyo: true, repeat: -1, repeatDelay: 580 + seed % 420 }));
    } else {
      const constellation = this.scene.add.graphics();
      const points = [[-.27,-.18],[-.13,-.31],[.04,-.19],[.22,-.3],[.3,-.07],[.1,.08],[-.12,.02]] as const;
      constellation.lineStyle(1, profile.secondary, 0.38);
      for (let index = 1; index < points.length; index += 1) constellation.lineBetween(points[index-1][0]*width, iconY+points[index-1][1]*width, points[index][0]*width, iconY+points[index][1]*width);
      const stars = points.map(([x, y], index) => this.scene.add.star(x * width, iconY + y * width, 4, index % 3 ? 1.4 : 2.2, index % 3 ? 3.2 : 5, index % 2 ? profile.secondary : profile.primary, 0.84));
      layer.add([constellation, ...stars]);
      if (animate) this.track(this.scene.tweens.add({ targets: stars, alpha: { from: 0.22, to: 1 }, scale: { from: 0.7, to: 1.35 }, duration: 1050, yoyo: true, repeat: -1, stagger: 130 }));
    }
  }
}
