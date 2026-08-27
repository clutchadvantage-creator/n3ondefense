import Phaser from 'phaser';
import { BOSS_ARCHETYPES, BOSS_BALANCE, getBossHealth, type BossArchetype } from '../config/bossBalance';
import type { RunModeFamily } from '../config/modeBalance.ts';

export type BossDamageSource = 'weapon' | 'turret' | 'mine' | 'fence' | 'hazard';

export interface BossInstanceOptions {
  /** Applies only to this boss instance; normal milestone bosses remain unchanged. */
  healthMultiplier?: number;
}

export class Boss extends Phaser.Physics.Arcade.Sprite {
  readonly archetype: BossArchetype;
  readonly maxHp: number;
  readonly hazardRadius = 34;
  hp: number;
  private defeated = false;
  private readonly visualRoot: Phaser.GameObjects.Container;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly aura: Phaser.GameObjects.Arc;
  private readonly animatedParts: Phaser.GameObjects.GameObject[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    archetype: BossArchetype,
    completedRound: number,
    private readonly onDamaged: (damage: number, source: BossDamageSource) => void,
    private readonly onDefeated: () => void,
    modeFamily: RunModeFamily,
    options: BossInstanceOptions = {}
  ) {
    const definition = BOSS_ARCHETYPES[archetype];
    super(scene, x, y, definition.texture);
    this.archetype = archetype;
    this.maxHp = Math.max(1, Math.round(
      getBossHealth(completedRound, modeFamily) * Math.max(0.01, options.healthMultiplier ?? 1)
    ));
    this.hp = this.maxHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(archetype === 'artillery' ? 112 : 102, archetype === 'artillery' ? 96 : 102)
      .clearTint().setDepth(9);
    this.body?.setCircle(36, Math.max(0, (this.displayWidth - 72) * 0.5), Math.max(0, (this.displayHeight - 72) * 0.5));
    this.setCollideWorldBounds(true);

    // Animated hardware sits above the cached chassis art. The chassis itself
    // carries the expensive detail; this rig is deliberately small and only
    // animates the pieces that communicate attacks.
    this.visualRoot = scene.add.container(x, y).setDepth(9.1);
    this.aura = scene.add.circle(0, 0, archetype === 'artillery' ? 58 : 52, definition.color, 0.08)
      .setStrokeStyle(2, definition.color, 0.38).setBlendMode(Phaser.BlendModes.ADD);
    this.core = scene.add.circle(0, 0, archetype === 'void-brawler' ? 13 : 10, definition.color, 0.72)
      .setStrokeStyle(2, 0xffffff, 0.85).setBlendMode(Phaser.BlendModes.ADD);
    this.visualRoot.add([this.aura, this.core]);
    this.createArchetypeRig(definition.color);
  }

  private createArchetypeRig(color: number): void {
    if (this.archetype === 'artillery') {
      for (const side of [-1, 1]) {
        const mountShadow = this.scene.add.rectangle(side * 47 + 3, 4, 31, 15, 0x02050a, 0.82)
          .setStrokeStyle(1, 0x02050a, 0.9);
        const mount = this.scene.add.rectangle(side * 45, 0, 29, 13, 0x071018, 0.98)
          .setStrokeStyle(2, color, 0.92);
        const mountFacet = this.scene.add.polygon(side * 45, -4, [-14, -4, 10, -4, 14, 0, -10, 0], 0xffffff, 0.2)
          .setStrokeStyle(1, 0xffffff, 0.48);
        const barrelShadow = this.scene.add.rectangle(side * 59 + 2, 3, 28, 7, 0x02050a, 0.9);
        const barrel = this.scene.add.rectangle(side * 58, 0, 26, 5, color, 0.82)
          .setStrokeStyle(1, 0xffffff, 0.7);
        const muzzle = this.scene.add.circle(side * 72, 0, 3, 0x071018, 1)
          .setStrokeStyle(1, 0xffffff, 0.82);
        this.visualRoot.add([mountShadow, barrelShadow, mount, mountFacet, barrel, muzzle]);
        this.animatedParts.push(mount, barrel);
      }
      const chassisRing = this.scene.add.circle(0, 0, 43, 0x000000, 0).setStrokeStyle(4, color, 0.72);
      const innerRing = this.scene.add.circle(-2, -2, 36, 0x000000, 0).setStrokeStyle(1, 0xffffff, 0.42);
      this.visualRoot.add(chassisRing);
      this.visualRoot.add(innerRing);
      this.animatedParts.push(chassisRing);
      return;
    }
    if (this.archetype === 'storm-mage') {
      for (let index = 0; index < 3; index += 1) {
        const satelliteShadow = this.scene.add.polygon(3, 4, [0, -9, 7, 0, 0, 9, -7, 0], 0x02050a, 0.72);
        const satellite = this.scene.add.polygon(0, 0, [0, -8, 6, 0, 0, 8, -6, 0], color, 0.85)
          .setStrokeStyle(1, 0xffffff, 0.82).setBlendMode(Phaser.BlendModes.ADD);
        const satelliteCore = this.scene.add.circle(0, 0, 2.2, 0xffffff, 0.9).setBlendMode(Phaser.BlendModes.ADD);
        const satelliteRig = this.scene.add.container(0, 0, [satelliteShadow, satellite, satelliteCore]);
        this.visualRoot.add(satelliteRig);
        this.animatedParts.push(satelliteRig);
      }
      return;
    }
    for (const side of [-1, 1]) {
      const fistShadow = this.scene.add.polygon(side * 42 + 3, 8, [-10, -10, 8, -13, 15, 0, 7, 14, -11, 10, -16, 0], 0x02050a, 0.82);
      const fist = this.scene.add.polygon(side * 42, 4, [-10, -10, 8, -13, 15, 0, 7, 14, -11, 10, -16, 0], color, 0.9)
        .setStrokeStyle(2, 0xffffff, 0.72);
      const knuckles = this.scene.add.rectangle(side * 43, -1, 18, 3, 0xffffff, 0.45);
      const fistRig = this.scene.add.container(0, 0, [fistShadow, fist, knuckles]);
      this.visualRoot.add(fistRig);
      this.animatedParts.push(fistRig);
    }
    const phaseRing = this.scene.add.circle(0, 0, 45, 0x000000, 0).setStrokeStyle(3, color, 0.74);
    const armorChevron = this.scene.add.polygon(0, 17, [-18, -5, 0, 5, 18, -5, 0, 11], 0x071018, 0.8)
      .setStrokeStyle(1, 0xffffff, 0.48);
    this.visualRoot.add([phaseRing, armorChevron]);
    this.animatedParts.push(phaseRing);
  }

  updatePresentation(elapsedMs: number, aimAngle: number, charge = 0): void {
    if (!this.visualRoot.active) return;
    this.visualRoot.setPosition(this.x, this.y).setAlpha(this.alpha);
    const pulse = 0.5 + Math.sin(elapsedMs * 0.006) * 0.5;
    this.aura.setScale(0.94 + pulse * 0.12 + charge * 0.18).setAlpha(0.07 + pulse * 0.11 + charge * 0.18);
    this.core.setScale(0.9 + pulse * 0.16 + charge * 0.42)
      .setFillStyle(charge > 0.75 ? 0xffffff : BOSS_ARCHETYPES[this.archetype].color, 0.78 + charge * 0.2);
    if (this.archetype === 'artillery') {
      this.visualRoot.setRotation(aimAngle);
      return;
    }
    if (this.archetype === 'storm-mage') {
      this.visualRoot.setRotation(0);
      this.animatedParts.forEach((part, index) => {
        const satellite = part as Phaser.GameObjects.Shape;
        const angle = elapsedMs * (index % 2 === 0 ? 0.0018 : -0.0016) + index * Math.PI * 2 / 3;
        satellite.setPosition(Math.cos(angle) * (42 + charge * 10), Math.sin(angle) * (42 + charge * 10));
        satellite.setRotation(angle + Math.PI * 0.5);
      });
      return;
    }
    this.visualRoot.setRotation(aimAngle);
    const extension = 4 + Math.sin(elapsedMs * 0.01) * 3 + charge * 12;
    const left = this.animatedParts[0] as Phaser.GameObjects.Shape | undefined;
    const right = this.animatedParts[1] as Phaser.GameObjects.Shape | undefined;
    left?.setX(-42 - extension);
    right?.setX(42 + extension);
  }

  takeDamage(amount: number, source: BossDamageSource = 'weapon'): number {
    if (this.defeated || !Number.isFinite(amount) || amount <= 0) return 0;
    const applied = Math.min(this.hp, amount * (source === 'hazard' ? BOSS_BALANCE.hazardDamageMultiplier : 1));
    if (applied <= 0) return 0;
    this.hp = Math.max(0, this.hp - applied);
    this.onDamaged(applied, source);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(55, () => {
      if (this.active) this.clearTint();
    });
    if (this.hp <= 0) {
      this.defeated = true;
      this.setVelocity(0, 0);
      this.visualRoot.setAlpha(0.95);
      this.onDefeated();
    }
    return applied;
  }

  get healthRatio(): number {
    return Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
  }

  get isDefeated(): boolean {
    return this.defeated;
  }

  override setVisible(value: boolean): this {
    super.setVisible(value);
    this.visualRoot?.setVisible(value);
    return this;
  }

  override destroy(fromScene?: boolean): void {
    this.visualRoot?.destroy(true);
    super.destroy(fromScene);
  }
}
