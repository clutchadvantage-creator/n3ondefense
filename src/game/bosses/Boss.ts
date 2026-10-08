import Phaser from 'phaser';
import { authoritativeEchoDamage, type EchoDamageStamp } from '../echo/EchoRules.ts';
import { BOSS_ARCHETYPES, BOSS_BALANCE, getBossHealth, type BossArchetype } from '../config/bossBalance';
import type { RunModeFamily } from '../config/modeBalance.ts';
import type { RectSpec } from '../types.ts';
import { BossLegRig } from './BossLegRig.ts';

export type BossDamageSource = 'weapon' | 'echo' | 'turret' | 'mine' | 'fence' | 'hazard';

export interface BossInstanceOptions {
  faction?: 'enemy' | 'player';
  ownerId?: string;
  /** Applies only to this boss instance; normal milestone bosses remain unchanged. */
  healthMultiplier?: number;
  legBlockers?: readonly RectSpec[];
}

export class Boss extends Phaser.Physics.Arcade.Sprite {
  readonly faction: 'enemy' | 'player';
  readonly ownerId: string | null;
  readonly archetype: BossArchetype;
  readonly maxHp: number;
  readonly hazardRadius = 34;
  hp: number;
  shielded = false;
  private defeated = false;
  private readonly visualRoot: Phaser.GameObjects.Container;
  private readonly legRig: BossLegRig;
  private weaponFacing = 0;
  private readonly weapons: Phaser.GameObjects.Image[] = [];
  private presentationNow = 0;
  private hitUntil = 0;
  private actionAt = -10000;
  private actionDuration = 400;
  private action: 'fire' | 'slam' | 'spin' | 'arrival' = 'fire';
  private weaponAngle = 0;

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
    this.faction=options.faction??'enemy';this.ownerId=options.ownerId??null;
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

    // Blender component sprites share pivots and units with the authored source.
    // Physics retains a centered 34px world radius independently of sprite padding.
    this.setTexture('rwg-' + archetype + '-chassis').setDisplaySize(160, 160);
    const radius = this.hazardRadius / this.scaleX;
    this.body?.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
    this.legRig = new BossLegRig(scene, archetype, options.legBlockers ?? []);
    this.visualRoot = scene.add.container(x, y).setDepth(9.1);
    const parts = archetype === 'artillery' ? ['artillery-gun']
      : archetype === 'storm-mage' ? ['storm-mage-rotor'] : ['void-brawler-hammer', 'void-brawler-shield'];
    for (const part of parts) {
      const weapon = scene.add.image(0, 0, 'rwg-' + part).setDisplaySize(160, 160);
      this.weapons.push(weapon);
      this.visualRoot.add(weapon);
    }
  }

  playAction(action: 'fire' | 'slam' | 'spin' | 'arrival', now: number, duration = 400): void {
    this.action = action;
    this.actionAt = now;
    this.actionDuration = duration;
  }

  /** Hammer tip in world space; used by damage and impact presentation alike. */
  hammerTip(angle = this.weaponAngle): { x: number; y: number } {
    const facing = this.weaponFacing;
    return { x: this.x + Math.cos(facing) * 4 - Math.sin(facing) * -22 + Math.cos(angle) * 43,
      y: this.y + Math.sin(facing) * 4 + Math.cos(facing) * -22 + Math.sin(angle) * 43 };
  }

  updatePresentation(elapsedMs: number, aimAngle: number, charge = 0, spinAngle?: number): void {
    if (!this.visualRoot.active) return;
    this.presentationNow = elapsedMs;
    this.weaponFacing = aimAngle;
    const chassisAngle = this.legRig.update(this.x, this.y, aimAngle, elapsedMs, charge, this.alpha);
    this.visualRoot.setPosition(this.x, this.y).setAlpha(this.alpha);
    this.setRotation(chassisAngle);
    const progress = Math.min(1, Math.max(0, (elapsedMs - this.actionAt) / this.actionDuration));
    const recoil = this.action === 'fire' && progress < 1 ? Math.sin(progress * Math.PI) * 7 : 0;
    if (this.archetype === 'artillery') {
      this.visualRoot.setRotation(aimAngle);
      this.weapons[0].setPosition(-recoil, 0).setRotation(charge > 0 ? Math.sin(elapsedMs * .016) * charge * .18 : 0);
    } else if (this.archetype === 'storm-mage') {
      this.visualRoot.setRotation(0);
      this.weapons[0].setRotation(elapsedMs * (.001 + charge * .003)).setScale(160 / 384 * (1 + charge * .12));
    } else {
      this.visualRoot.setRotation(aimAngle);
      const swing = this.action === 'slam' && progress < 1
        ? progress < .48 ? -1.25 * progress / .48 : progress < .68 ? -1.25 + 1.9 * (progress - .48) / .2 : .65 * (1 - progress) / .32
        : -charge * 1.1;
      const localAngle = spinAngle === undefined ? swing : spinAngle - aimAngle;
      this.weapons[0].setPosition(4, -22).setRotation(localAngle);
      this.weapons[1].setPosition(1 + charge * 8, 22).setRotation(.25 - charge * .35);
      this.weaponAngle = aimAngle + localAngle;
    }
    const flash = elapsedMs < this.hitUntil;
    if (flash) this.setTintFill(0xd9edff); else this.clearTint();
    for (const part of this.weapons) { if (flash) part.setTint(0xffffff); else part.clearTint(); }
  }

  takeDamage(amount: number, source: BossDamageSource = 'weapon', echo?: EchoDamageStamp): number {
    if (source === 'echo') amount = authoritativeEchoDamage(amount, echo);
    if (this.defeated || this.shielded || !Number.isFinite(amount) || amount <= 0) return 0;
    const applied = Math.min(this.hp, amount * (source === 'hazard' && this.faction==='enemy' ? BOSS_BALANCE.hazardDamageMultiplier : 1));
    if (applied <= 0) return 0;
    this.hp = Math.max(0, this.hp - applied);
    this.onDamaged(applied, source);
    this.hitUntil = this.presentationNow + 70;
    if (this.hp <= 0) {
      this.defeated = true;
      this.setVelocity(0, 0);
      this.setTint(0x8c8c9a);
      for (const part of this.weapons) part.setTint(0x8c8c9a);
      this.legRig.defeat();
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
    this.legRig?.setVisible(value);
    return this;
  }

  override destroy(fromScene?: boolean): void {
    this.visualRoot?.destroy(true);
    this.legRig?.destroy();
    super.destroy(fromScene);
  }
}
