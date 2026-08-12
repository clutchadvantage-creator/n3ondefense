import Phaser from 'phaser';
import { BOSS_ARCHETYPES, BOSS_BALANCE, getBossHealth, type BossArchetype } from '../config/bossBalance';
import { AudioManager } from '../systems/AudioManager.ts';

export type BossDamageSource = 'weapon' | 'turret' | 'mine' | 'fence' | 'hazard';

export class Boss extends Phaser.Physics.Arcade.Sprite {
  readonly archetype: BossArchetype;
  readonly maxHp: number;
  readonly hazardRadius = 34;
  hp: number;
  private defeated = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    archetype: BossArchetype,
    completedRound: number,
    private readonly onDamaged: (damage: number, source: BossDamageSource) => void,
    private readonly onDefeated: () => void
  ) {
    const definition = BOSS_ARCHETYPES[archetype];
    super(scene, x, y, definition.texture);
    this.archetype = archetype;
    this.maxHp = getBossHealth(completedRound);
    this.hp = this.maxHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(78, 78).setTint(definition.color).setDepth(9);
    this.body?.setCircle(30, 6, 6);
    this.setCollideWorldBounds(true);
  }

  takeDamage(amount: number, source: BossDamageSource = 'weapon'): number {
    if (this.defeated || !Number.isFinite(amount) || amount <= 0) return 0;
    const applied = Math.min(this.hp, amount * (source === 'hazard' ? BOSS_BALANCE.hazardDamageMultiplier : 1));
    if (applied <= 0) return 0;
    this.hp = Math.max(0, this.hp - applied);
    AudioManager.get().playSfx('hit');
    this.onDamaged(applied, source);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(55, () => {
      if (this.active) this.setTint(BOSS_ARCHETYPES[this.archetype].color);
    });
    if (this.hp <= 0) {
      this.defeated = true;
      this.setVelocity(0, 0);
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
}
