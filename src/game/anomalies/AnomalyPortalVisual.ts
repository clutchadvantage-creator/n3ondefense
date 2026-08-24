import Phaser from 'phaser';

interface EssenceWisp {
  root: Phaser.GameObjects.Container;
  fromX: number;
  fromY: number;
  controlX: number;
  controlY: number;
  startedAt: number;
  durationMs: number;
  onAbsorbed?: () => void;
}

/** Allocation-bounded shared presentation for charging anomalies and portals. */
export class AnomalyPortalVisual {
  readonly root: Phaser.GameObjects.Container;
  private readonly floorGlow: Phaser.GameObjects.Ellipse;
  private readonly outerShell: Phaser.GameObjects.Arc;
  private readonly innerShell: Phaser.GameObjects.Arc;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly portalShadow: Phaser.GameObjects.Ellipse;
  private readonly portalVoid: Phaser.GameObjects.Ellipse;
  private readonly portalEnergy: Phaser.GameObjects.Ellipse;
  private readonly energyLines: Phaser.GameObjects.Graphics;
  private readonly shockwave: Phaser.GameObjects.Arc;
  private readonly fragments: Phaser.GameObjects.Arc[] = [];
  private readonly wispPool: Phaser.GameObjects.Container[] = [];
  private readonly activeWisps: EssenceWisp[] = [];
  private activationStartedAt = 0;
  private portalStable = false;
  private chargeRatio = 0;
  private absorptionPulseUntil = 0;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene, readonly x: number, readonly y: number, private readonly particlesEnabled: boolean) {
    this.floorGlow = scene.add.ellipse(0, 12, 118, 48, 0x4deeff, 0.1)
      .setStrokeStyle(2, 0x66f7ff, 0.24).setBlendMode(Phaser.BlendModes.ADD);
    this.outerShell = scene.add.circle(0, 0, 48, 0x60efff, 0.055)
      .setStrokeStyle(2, 0xbafcff, 0.48).setBlendMode(Phaser.BlendModes.ADD);
    this.innerShell = scene.add.circle(0, 0, 32, 0xa845ff, 0.1)
      .setStrokeStyle(2, 0xff75dc, 0.72).setBlendMode(Phaser.BlendModes.ADD);
    this.core = scene.add.circle(0, 0, 13, 0xffffff, 0.96)
      .setStrokeStyle(4, 0x5df5ff, 0.92).setBlendMode(Phaser.BlendModes.ADD);
    this.portalShadow = scene.add.ellipse(0, 18, 132, 42, 0x01030a, 0.72).setVisible(false);
    this.portalVoid = scene.add.ellipse(0, -58, 82, 142, 0x01030b, 0.98)
      .setStrokeStyle(9, 0x18284f, 0.9).setVisible(false);
    this.portalEnergy = scene.add.ellipse(0, -58, 68, 126, 0x07132a, 0.86)
      .setStrokeStyle(4, 0xff59d6, 0.92).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.energyLines = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.shockwave = scene.add.circle(0, 0, 18, 0xffffff, 0)
      .setStrokeStyle(5, 0xc8ffff, 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.root = scene.add.container(x, y, [
      this.floorGlow, this.portalShadow, this.portalVoid, this.portalEnergy,
      this.outerShell, this.innerShell, this.core, this.energyLines, this.shockwave
    ]).setDepth(24);

    const fragmentCount = particlesEnabled ? 14 : 8;
    for (let index = 0; index < fragmentCount; index += 1) {
      const fragment = scene.add.circle(0, 0, index % 3 === 0 ? 3.5 : 2.25,
        index % 2 ? 0xff62dc : 0x71f8ff, 0.85).setBlendMode(Phaser.BlendModes.ADD);
      this.fragments.push(fragment);
      this.root.add(fragment);
    }

    const wispCount = particlesEnabled ? 18 : 8;
    for (let index = 0; index < wispCount; index += 1) {
      const tail = scene.add.ellipse(-13, 0, 30, 8, 0xb9fbff, 0.25).setBlendMode(Phaser.BlendModes.ADD);
      const cloudA = scene.add.circle(0, -2, 8, 0xf7ffff, 0.78).setBlendMode(Phaser.BlendModes.ADD);
      const cloudB = scene.add.circle(-6, 4, 6, 0xaaf7ff, 0.52).setBlendMode(Phaser.BlendModes.ADD);
      const spark = scene.add.circle(2, -3, 2.2, 0xffffff, 1).setBlendMode(Phaser.BlendModes.ADD);
      this.wispPool.push(scene.add.container(-10_000, -10_000, [tail, cloudB, cloudA, spark])
        .setDepth(25).setVisible(false).setActive(false));
    }
  }

  get readyForInteraction(): boolean { return this.portalStable; }

  setCharge(ratio: number): void {
    this.chargeRatio = Phaser.Math.Clamp(ratio, 0, 1);
  }

  transformToPortal(): void {
    if (this.activationStartedAt <= 0) this.activationStartedAt = this.scene.time.now;
  }

  emitFeed(fromX: number, fromY: number, count = 2, onAbsorbed?: () => void): void {
    for (let index = 0; index < count; index += 1) {
      const root = this.wispPool.find((candidate) => !candidate.visible);
      if (!root) return;
      const dx = this.x - fromX;
      const dy = this.y - fromY;
      const length = Math.max(1, Math.hypot(dx, dy));
      const direction = ((Math.floor(fromX + fromY + index) & 1) ? 1 : -1);
      const curve = Math.min(125, 36 + length * 0.16) * direction;
      root.setVisible(true).setActive(true).setPosition(fromX, fromY).setAlpha(0.92).setScale(0.82 + index * 0.08);
      this.activeWisps.push({
        root, fromX, fromY,
        controlX: (fromX + this.x) * 0.5 - dy / length * curve,
        controlY: (fromY + this.y) * 0.5 + dx / length * curve,
        startedAt: this.scene.time.now + index * 65,
        durationMs: Phaser.Math.Clamp(690 + length * 0.32 + index * 70, 760, 1450),
        onAbsorbed: index === 0 ? onAbsorbed : undefined
      });
    }
  }

  update(now: number): void {
    if (this.destroyed) return;
    const chargedMotion = 1 + this.chargeRatio * 1.65;
    const absorbed = now < this.absorptionPulseUntil;
    const pulse = 1 + Math.sin(now * 0.006 * chargedMotion) * 0.055 + (absorbed ? 0.16 : 0);
    this.outerShell.setScale(pulse + this.chargeRatio * 0.08).setRotation(now * 0.0007 * chargedMotion);
    this.innerShell.setScale(1.02 - Math.sin(now * 0.009 * chargedMotion) * 0.08).setRotation(-now * 0.0012 * chargedMotion);
    this.core.setScale(1 + this.chargeRatio * 0.42 + Math.sin(now * 0.015) * 0.1 + (absorbed ? 0.24 : 0));
    this.floorGlow.setScale(1 + Math.sin(now * 0.004) * 0.08 + this.chargeRatio * 0.22);
    this.updateFragments(now, chargedMotion);
    this.updateWisps(now);
    this.updateActivation(now);
    this.redrawEnergy(now);
  }

  setTransitionProgress(progress: number): void {
    const t = Phaser.Math.Clamp(progress, 0, 1);
    this.root.setScale(1 + t * 0.22).setAlpha(1 - t * 0.12);
    this.portalEnergy.setAlpha(0.86 + t * 0.14);
  }

  playReturnCollapse(onComplete: () => void): void {
    if (this.destroyed) { onComplete(); return; }
    this.scene.tweens.killTweensOf(this.root);
    this.scene.tweens.add({
      targets: this.root, scaleX: 0.08, scaleY: 1.45, alpha: 0,
      duration: 520, ease: 'Cubic.In', onComplete
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy(true);
    for (const wisp of this.wispPool) wisp.destroy(true);
    this.activeWisps.length = 0;
  }

  private updateFragments(now: number, speed: number): void {
    const portalProgress = this.activationStartedAt > 0
      ? Phaser.Math.Clamp((now - this.activationStartedAt) / 980, 0, 1) : 0;
    for (let index = 0; index < this.fragments.length; index += 1) {
      const fragment = this.fragments[index];
      const angle = index / this.fragments.length * Math.PI * 2 + now * (0.0011 + index % 3 * 0.00022) * speed;
      const orbRadius = 43 + (index % 4) * 7 + Math.sin(now * 0.004 + index) * 4;
      const portalX = Math.cos(angle) * (47 + index % 3 * 8);
      const portalY = -58 + Math.sin(angle) * (70 + index % 2 * 9);
      fragment.setPosition(
        Phaser.Math.Linear(Math.cos(angle) * orbRadius, portalX, portalProgress),
        Phaser.Math.Linear(Math.sin(angle) * orbRadius * 0.78, portalY, portalProgress)
      ).setAlpha(0.48 + Math.sin(now * 0.012 + index) * 0.25 + portalProgress * 0.2);
    }
  }

  private updateWisps(now: number): void {
    for (let index = this.activeWisps.length - 1; index >= 0; index -= 1) {
      const wisp = this.activeWisps[index];
      const raw = (now - wisp.startedAt) / wisp.durationMs;
      if (raw < 0) continue;
      const t = Phaser.Math.Clamp(raw, 0, 1);
      const accelerated = t < 0.52 ? t * 0.78 : 0.4056 + Math.pow((t - 0.52) / 0.48, 1.65) * 0.5944;
      const inv = 1 - accelerated;
      const px = inv * inv * wisp.fromX + 2 * inv * accelerated * wisp.controlX + accelerated * accelerated * this.x;
      const py = inv * inv * wisp.fromY + 2 * inv * accelerated * wisp.controlY + accelerated * accelerated * this.y;
      const tangentX = 2 * inv * (wisp.controlX - wisp.fromX) + 2 * accelerated * (this.x - wisp.controlX);
      const tangentY = 2 * inv * (wisp.controlY - wisp.fromY) + 2 * accelerated * (this.y - wisp.controlY);
      const turbulence = Math.sin(now * 0.02 + index * 2.1) * (1 - t) * 5;
      wisp.root.setPosition(px - tangentY * 0.006 * turbulence, py + tangentX * 0.006 * turbulence)
        .setRotation(Math.atan2(tangentY, tangentX))
        .setScale(0.82 + t * 0.72, 0.82 - t * 0.34)
        .setAlpha(0.7 + t * 0.3);
      if (t < 1) continue;
      wisp.root.setVisible(false).setActive(false).setPosition(-10_000, -10_000);
      this.absorptionPulseUntil = now + 190;
      wisp.onAbsorbed?.();
      this.activeWisps.splice(index, 1);
    }
  }

  private updateActivation(now: number): void {
    if (this.activationStartedAt <= 0) return;
    const t = Phaser.Math.Clamp((now - this.activationStartedAt) / 980, 0, 1);
    const compression = t < 0.34 ? t / 0.34 : 1;
    const rupture = Phaser.Math.Clamp((t - 0.32) / 0.42, 0, 1);
    const stabilize = Phaser.Math.Clamp((t - 0.62) / 0.38, 0, 1);
    this.outerShell.setScale(1 - compression * 0.7).setAlpha(1 - rupture);
    this.innerShell.setScale(1 - compression * 0.58).setAlpha(1 - rupture);
    this.core.setScale(1 + compression * 1.8).setAlpha(1 - stabilize * 0.85);
    this.portalShadow.setVisible(rupture > 0).setAlpha(rupture * 0.78);
    this.portalVoid.setVisible(rupture > 0).setScale(0.12 + rupture * 0.88, 0.06 + rupture * 0.94).setAlpha(rupture);
    this.portalEnergy.setVisible(rupture > 0).setScale(0.1 + rupture * 0.9, 0.04 + rupture * 0.96).setAlpha(rupture * 0.9);
    if (rupture > 0 && t < 0.82) this.shockwave.setAlpha(1 - rupture).setScale(1 + rupture * 7.5);
    else this.shockwave.setAlpha(0);
    if (t >= 1) this.portalStable = true;
  }

  private redrawEnergy(now: number): void {
    const g = this.energyLines;
    g.clear();
    if (!this.portalStable && this.activationStartedAt <= 0) {
      const spin = now * 0.0015 * (1 + this.chargeRatio * 1.5);
      for (let index = 0; index < 9; index += 1) {
        const angle = spin + index / 9 * Math.PI * 2;
        const radius = 53 + (index % 3) * 6;
        g.lineStyle(index % 2 ? 2 : 3, index % 2 ? 0xff5bd8 : 0x72f8ff, 0.35 + this.chargeRatio * 0.5);
        g.beginPath();
        g.arc(0, 0, radius, angle, angle + 0.28 + this.chargeRatio * 0.16, false);
        g.strokePath();
      }
      const filamentCount = this.particlesEnabled ? 4 : 2;
      for (let index = 0; index < filamentCount; index += 1) {
        const angle = now * 0.0028 + index * Math.PI * 0.71;
        g.lineStyle(1.5, 0xeaffff, 0.4 + this.chargeRatio * 0.45);
        g.lineBetween(Math.cos(angle) * 15, Math.sin(angle) * 15,
          Math.cos(angle + 0.35) * (35 + index * 5), Math.sin(angle + 0.35) * (35 + index * 5));
      }
      return;
    }
    const activation = this.activationStartedAt > 0 ? Phaser.Math.Clamp((now - this.activationStartedAt) / 980, 0, 1) : 1;
    if (activation <= 0.34) return;
    const leak = 0.52 + Math.sin(now * 0.014) * 0.22;
    for (let index = 0; index < 7; index += 1) {
      const y = -112 + index * 18 + Math.sin(now * 0.004 + index) * 5;
      const halfWidth = Math.sqrt(Math.max(0, 1 - ((y + 58) / 72) ** 2)) * 46;
      g.lineStyle(index % 2 ? 2 : 3, index % 2 ? 0xff59d6 : 0x70f8ff, leak);
      g.lineBetween(-halfWidth, y, halfWidth * (0.35 + Math.sin(now * 0.003 + index) * 0.3), y + 5);
    }
    for (let index = 0; index < 4; index += 1) {
      const angle = now * 0.002 + index * 1.7;
      g.lineStyle(2, 0xd9ffff, 0.55);
      g.lineBetween(Math.cos(angle) * 42, -58 + Math.sin(angle) * 67,
        Math.cos(angle + 0.22) * 58, -58 + Math.sin(angle + 0.22) * 82);
    }
  }
}
