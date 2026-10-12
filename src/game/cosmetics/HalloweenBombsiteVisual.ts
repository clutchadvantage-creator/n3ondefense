import Phaser from 'phaser';
import { HALLOWEEN_SETS } from '../../data/halloweenCosmetics.ts';
import { halloweenTexture, type HalloweenSet } from './HalloweenCosmeticArt.ts';
import { clampCelebration as clamp, HALLOWEEN_TIMING, halloweenCelebrationEnvelope, halloweenRevealScale } from './HalloweenCelebrationTiming.ts';

/** Celebration artwork only. Fixed sprites, no timers/tweens/physics; driven by scene time and pooled by the bomb renderer. */
export class HalloweenBombsiteVisual {
  readonly root: Phaser.GameObjects.Container;
  private readonly seal: Phaser.GameObjects.Image;
  private readonly floor: Phaser.GameObjects.Container;
  private readonly sealBack: Phaser.GameObjects.Image;
  private readonly shock: Phaser.GameObjects.Arc;
  private readonly hero: Phaser.GameObjects.Container;
  private readonly face: Phaser.GameObjects.Image;
  private readonly jaw: Phaser.GameObjects.Image;
  private readonly hands: Phaser.GameObjects.Image[];
  private readonly bats: Array<{ root: Phaser.GameObjects.Container; left: Phaser.GameObjects.Image; right: Phaser.GameObjects.Image; body: Phaser.GameObjects.Image }>;
  private readonly sparks: Phaser.GameObjects.Image[];
  private set: HalloweenSet | null = null;

  constructor(scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(18).setVisible(false);
    this.sealBack = scene.add.image(0, 0, halloweenTexture('witch', 'seal')).setBlendMode(Phaser.BlendModes.ADD);
    this.seal = scene.add.image(0, 0, halloweenTexture('witch', 'seal')).setBlendMode(Phaser.BlendModes.ADD);
    this.floor = scene.add.container(0, 0, [this.seal]);
    this.shock = scene.add.circle(0, 0, 110).setFillStyle(0, 0).setStrokeStyle(3, 0xffffff, .7).setBlendMode(Phaser.BlendModes.ADD);
    this.hero = scene.add.container(0, 0);
    this.face = scene.add.image(0, 0, halloweenTexture('witch', 'hero')).setDisplaySize(256, 256);
    this.jaw = scene.add.image(0, 0, halloweenTexture('witch', 'jaw')).setDisplaySize(256, 256);
    this.hands = [scene.add.image(0, 0, halloweenTexture('witch', 'hand')).setDisplaySize(256, 256), scene.add.image(0, 0, halloweenTexture('witch', 'hand')).setDisplaySize(256, 256).setFlipX(true)];
    this.hero.add([this.face, this.jaw, ...this.hands]);
    this.bats = Array.from({ length: 12 }, () => {
      const root = scene.add.container(0, 0);
      // All three layers share a 256px canvas; hinging the wing around its root keeps joints connected.
      const left = scene.add.image(0, -18, halloweenTexture('bats', 'wing')).setOrigin(.5, 110 / 256);
      const right = scene.add.image(0, -18, halloweenTexture('bats', 'wing')).setOrigin(.5, 110 / 256).setFlipX(true);
      const body = scene.add.image(0, 0, halloweenTexture('bats', 'bat-body')).setDisplaySize(256, 256);
      root.add([left, right, body]);
      return { root, left, right, body };
    });
    this.sparks = Array.from({ length: 22 }, () => scene.add.image(0, 0, halloweenTexture('witch', 'spark')).setBlendMode(Phaser.BlendModes.ADD));
    this.root.add([this.sealBack, this.floor, this.shock, this.hero, ...this.bats.map(bat => bat.root), ...this.sparks]);
  }

  update(set: HalloweenSet, x: number, y: number, radius: number, elapsed: number, reduced: boolean): void {
    if (this.set !== set) {
      this.set = set;
      this.face.setTexture(halloweenTexture(set, 'hero'));
      this.jaw.setTexture(halloweenTexture(set, 'jaw'));
      this.seal.setTexture(halloweenTexture(set, 'seal'));
      this.sealBack.setTexture(halloweenTexture(set, 'seal'));
      for (const spark of this.sparks) spark.setTexture(halloweenTexture(set, 'spark'));
      this.shock.setStrokeStyle(3, HALLOWEEN_SETS[set].accentColor, .7);
    }
    const age = Math.max(0, elapsed);
    const reveal = halloweenRevealScale(age);
    const release = clamp((age - HALLOWEEN_TIMING.releaseAt) / 900);
    const envelope = halloweenCelebrationEnvelope(age);
    const scale = Math.min(radius, 300) / 128;
    this.root.setPosition(x, y).setScale(scale).setAlpha(envelope).setVisible(elapsed >= 0 && age < HALLOWEEN_TIMING.end);
    this.floor.setPosition(0, 14).setScale(.85 + reveal * .22, .34 + reveal * .1);
    this.seal.setScale(.5).setRotation(-age * .0006).setAlpha(.65);
    // Back halo rises behind the character while the floor seal stays anchored at the bombsite.
    this.sealBack.setPosition(0, -65).setScale((.65 + reveal * .44) * .5).setRotation(age * .00034).setAlpha(reduced ? .2 : .42);
    const shockProgress = clamp((age >= HALLOWEEN_TIMING.releaseAt ? age - HALLOWEEN_TIMING.releaseAt : age) / 700);
    this.shock.setScale(.12 + shockProgress * 1.6).setAlpha((1 - shockProgress) * (reduced ? .3 : .75));
    this.hero.setPosition(Math.sin(age * .004) * 3, -45 - reveal * 14 + Math.sin(age * .003) * 5)
      .setScale(reveal * (1 + release * .18)).setRotation(Math.sin(age * .0032) * .035).setAlpha(1 - release * .85);
    this.face.setVisible(set !== 'bats');
    this.jaw.setVisible(set !== 'bats').setY(3 + Math.max(0, Math.sin(age * .023)) * (set === 'witch' ? 9 : 7));
    for (let index = 0; index < this.hands.length; index += 1) this.hands[index].setVisible(set === 'witch')
      .setPosition(index ? 28 : -28, -7 + Math.sin(age * .004 + index) * 12).setRotation((index ? -1 : 1) * (.1 + Math.sin(age * .003) * .06));
    const batCount = set === 'bats' ? reduced ? 6 : 12 : set === 'witch' && !reduced ? 3 : 0;
    for (let index = 0; index < this.bats.length; index += 1) {
      const bat = this.bats[index];
      bat.root.setVisible(index < batCount);
      if (index >= batCount) continue;
      const central = set === 'bats' && index === 0;
      const angle = index * 2.39996 + age * (.0009 + index * .000025);
      const travel = central ? release * 170 : 30 + clamp((age - index * 65) / 1500) * (65 + index % 3 * 24) + release * 100;
      const size = central ? reveal * .94 : (.16 + index % 3 * .04) * clamp((age - index * 45) / 400);
      bat.root.setPosition(central ? Math.sin(age * .002) * 9 : Math.cos(angle) * travel,
        central ? -55 - release * 120 : -46 + Math.sin(angle) * travel * .58 - release * 100)
        .setScale(size).setRotation(central ? Math.sin(age * .0025) * .1 : Math.sin(angle) * .3);
      const flap = .34 + (Math.sin(age * .021 + index * 1.7) + 1) * .4;
      bat.left.setScale(.5, flap * .5); bat.right.setScale(.5, flap * .5);
    }
    const sparkCount = reduced ? 8 : this.sparks.length;
    for (let index = 0; index < this.sparks.length; index += 1) {
      const spark = this.sparks[index];
      const launch = 100 + index * 47;
      const progress = clamp((age - launch) / (HALLOWEEN_TIMING.end - launch));
      spark.setVisible(index < sparkCount && age > launch);
      if (index >= sparkCount) continue;
      const angle = index * 2.39996 + age * .0006;
      const distance = 30 + progress * 85 + release * (70 + index % 4 * 11);
      spark.setPosition(Math.cos(angle) * distance, -45 + Math.sin(angle) * distance * .65 - progress * 30)
        .setScale((.035 + index % 3 * .015) * (1 + release)).setRotation(angle + age * .002)
        .setAlpha((.45 + Math.sin(age * .006 + index) * .25) * (1 - progress * .65));
    }
  }

  hide(): void { this.root.setVisible(false); }
  destroy(): void { this.root.destroy(true); }
}
