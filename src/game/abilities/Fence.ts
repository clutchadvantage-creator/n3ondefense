import Phaser from 'phaser';

const FENCE_WIRE_LEVELS = [-5, -11, -17, -23] as const;

/**
 * The combat fence remains a single logical segment with precomputed endpoints.
 * This class only layers a deployable two-node electric-fence presentation over
 * that existing segment, so damage, slowing, collision, and projectile splitting
 * continue to use the same geometry as before.
 */
export class Fence {
  readonly sprite: Phaser.GameObjects.Container;
  readonly width: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  hp: number;
  dps: number;
  slowFactor: number;
  expiresAt: number;

  private readonly scene: Phaser.Scene;
  private readonly groundGlow: Phaser.GameObjects.Rectangle;
  private readonly nodeGlows: Phaser.GameObjects.Arc[] = [];
  private readonly nodeRings: Phaser.GameObjects.Arc[] = [];
  private readonly nodeCores: Phaser.GameObjects.Arc[] = [];
  private readonly poleSegments: Phaser.GameObjects.Rectangle[] = [];
  private readonly poleCollars: Phaser.GameObjects.Rectangle[] = [];
  private readonly poleRoots: Phaser.GameObjects.Container[] = [];
  private readonly warningLights: Phaser.GameObjects.Arc[] = [];
  private readonly wires: Phaser.GameObjects.Rectangle[] = [];
  private readonly currentPips: Phaser.GameObjects.Arc[] = [];
  private readonly animatedTargets: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, angle: number, color: number, width: number, durationMs: number, hp: number, dps: number, slowFactor: number) {
    this.scene = scene;
    this.width = width;
    const halfWidth = width * 0.5;
    const offsetX = Math.cos(angle) * halfWidth;
    const offsetY = Math.sin(angle) * halfWidth;
    this.x1 = x - offsetX;
    this.y1 = y - offsetY;
    this.x2 = x + offsetX;
    this.y2 = y + offsetY;

    const root = scene.add.container(x, y).setRotation(angle).setDepth(4);
    const groundGlow = scene.add.rectangle(0, 1, width, 5, color, 0.08)
      .setStrokeStyle(1, color, 0.2)
      .setBlendMode(Phaser.BlendModes.ADD);
    root.add(groundGlow);
    this.groundGlow = groundGlow;

    for (const localX of [-halfWidth, halfWidth]) {
      const glow = scene.add.circle(localX, 1, 12, color, 0.11)
        .setBlendMode(Phaser.BlendModes.ADD);
      const mount = scene.add.rectangle(localX, 2, 18, 8, 0x06111a, 0.98)
        .setStrokeStyle(1, color, 0.82);
      const ring = scene.add.circle(localX, 1, 7, 0x07131d, 1)
        .setStrokeStyle(2, color, 1);
      const core = scene.add.circle(localX, 1, 3, color, 0.9)
        .setStrokeStyle(1, 0xf2feff, 0.88);
      root.add([glow, mount, ring, core]);
      this.nodeGlows.push(glow);
      this.nodeRings.push(ring);
      this.nodeCores.push(core);

      const poleRoot = scene.add.container(localX, 1).setScale(1, 0.04);
      const lower = scene.add.rectangle(0, -5, 7, 11, 0x102630, 1).setStrokeStyle(1.5, color, 0.94);
      const middle = scene.add.rectangle(0, -14, 5, 9, 0x17323b, 1).setStrokeStyle(1, color, 0.86);
      const upper = scene.add.rectangle(0, -22, 3, 8, 0xb9edf1, 0.88).setStrokeStyle(1, color, 0.9);
      const collarA = scene.add.rectangle(0, -10, 9, 2, color, 0.78);
      const collarB = scene.add.rectangle(0, -18, 7, 2, color, 0.72);
      const lightHalo = scene.add.circle(0, -28, 6, color, 0.1).setBlendMode(Phaser.BlendModes.ADD);
      const light = scene.add.circle(0, -28, 2.6, 0xffffff, 0).setStrokeStyle(1, color, 1);
      poleRoot.add([lower, middle, upper, collarA, collarB, lightHalo, light]);
      root.add(poleRoot);
      this.poleRoots.push(poleRoot);
      this.poleSegments.push(lower, middle, upper, collarA, collarB);
      this.poleCollars.push(collarA, collarB);
      this.warningLights.push(lightHalo, light);
    }

    const liveWireLength = Math.max(8, width - 16);
    const wireStart = -halfWidth + 8;
    for (const [wireIndex, wireY] of FENCE_WIRE_LEVELS.entries()) {
      const wire = scene.add.rectangle(wireStart, wireY, liveWireLength, wireIndex % 2 === 0 ? 2.2 : 1.7, color, 0.9)
        .setOrigin(0, 0.5)
        .setScale(0, 1)
        .setBlendMode(Phaser.BlendModes.ADD);
      root.add(wire);
      this.wires.push(wire);

      for (let pipIndex = 0; pipIndex < 2; pipIndex += 1) {
        const pip = scene.add.circle(wireStart, wireY, pipIndex === 0 ? 2.2 : 1.4, pipIndex === 0 ? 0xffffff : color, 0)
          .setBlendMode(Phaser.BlendModes.ADD);
        root.add(pip);
        this.currentPips.push(pip);
        scene.tweens.add({
          targets: pip,
          x: wireStart + liveWireLength,
          alpha: { from: 0, to: pipIndex === 0 ? 1 : 0.76 },
          scale: { from: 0.55, to: 1.25 },
          delay: 420 + wireIndex * 85 + pipIndex * 310,
          duration: 660 + wireIndex * 65,
          repeat: -1,
          repeatDelay: 170 + pipIndex * 90,
          ease: 'Sine.easeInOut'
        });
      }
    }

    this.sprite = root;
    this.animatedTargets.push(
      groundGlow,
      ...this.nodeGlows,
      ...this.nodeCores,
      ...this.poleRoots,
      ...this.warningLights,
      ...this.wires,
      ...this.currentPips
    );

    scene.tweens.add({ targets: this.nodeGlows, scale: { from: 0.82, to: 1.22 }, alpha: { from: 0.05, to: 0.2 }, duration: 820, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: this.nodeCores, scale: { from: 0.82, to: 1.18 }, duration: 460, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: this.poleRoots, scaleY: 1, duration: 330, ease: 'Back.easeOut', stagger: 55 });
    scene.tweens.add({ targets: this.wires, scaleX: 1, alpha: { from: 0.12, to: 0.9 }, delay: 260, duration: 280, ease: 'Quad.easeOut', stagger: 42 });
    scene.tweens.add({ targets: this.wires, alpha: { from: 0.48, to: 1 }, delay: 600, duration: 170, yoyo: true, repeat: -1, repeatDelay: 110, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: this.warningLights[0], alpha: { from: 0.06, to: 0.34 }, delay: 360, duration: 540, yoyo: true, repeat: -1 });
    scene.tweens.add({ targets: this.warningLights[1], alpha: { from: 0.15, to: 1 }, delay: 360, duration: 540, yoyo: true, repeat: -1 });
    scene.tweens.add({ targets: this.warningLights[2], alpha: { from: 0.06, to: 0.34 }, delay: 510, duration: 640, yoyo: true, repeat: -1 });
    scene.tweens.add({ targets: this.warningLights[3], alpha: { from: 0.15, to: 1 }, delay: 510, duration: 640, yoyo: true, repeat: -1 });

    this.hp = hp;
    this.dps = dps;
    this.slowFactor = slowFactor;
    this.expiresAt = scene.time.now + durationMs;
  }

  isExpired(now: number): boolean {
    return now >= this.expiresAt || this.hp <= 0;
  }

  setColor(color: number): void {
    this.groundGlow.setFillStyle(color, 0.08).setStrokeStyle(1, color, 0.2);
    for (const glow of this.nodeGlows) glow.setFillStyle(color, 0.11);
    for (const ring of this.nodeRings) ring.setStrokeStyle(2, color, 1);
    for (const core of this.nodeCores) core.setFillStyle(color, 0.9);
    for (const segment of this.poleSegments) segment.setStrokeStyle(1, color, 0.9);
    for (const collar of this.poleCollars) collar.setFillStyle(color, 0.76);
    for (const light of this.warningLights) light.setFillStyle(color, light.radius > 3 ? 0.1 : 1).setStrokeStyle(1, color, 1);
    for (const wire of this.wires) wire.setFillStyle(color, 0.88);
    for (const pip of this.currentPips) if (pip.radius < 2) pip.setFillStyle(color, 1);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.animatedTargets);
    this.sprite.destroy(true);
  }
}
