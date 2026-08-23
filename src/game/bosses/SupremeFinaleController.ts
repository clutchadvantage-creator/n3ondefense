import Phaser from 'phaser';
import type { Player } from '../entities/Player.ts';
import type { RectSpec } from '../types.ts';
import { BOSS_ARCHETYPES, type BossArchetype } from '../config/bossBalance.ts';
import type { RunModeFamily } from '../config/modeBalance.ts';
import { BossEncounter, type BossAttackKind, type BossProjectileSpec } from './BossEncounter.ts';
import type { Boss, BossDamageSource } from './Boss.ts';

export interface SupremeFinaleCallbacks {
  fireProjectile(spec: BossProjectileSpec): void;
  damageArea(x: number, y: number, radius: number, damage: number, attack: BossAttackKind): void;
  dropCredit(x: number, y: number): void;
  onDamaged(damage: number, source: BossDamageSource): void;
  onAttackCast(attack: BossAttackKind): void;
  onBossDefeated(archetype: BossArchetype, remaining: number): void;
  onComplete(): void;
}

export interface SupremeFinaleOptions {
  healthMultiplier: number;
  damageMultiplier: number;
  particlesEnabled: boolean;
}

const ARCHETYPES: readonly BossArchetype[] = ['artillery', 'storm-mage', 'void-brawler'];

/** Coordinates three genuine BossEncounter instances. It owns presentation and
 * lifecycle only; combat formulas remain in the established boss classes. */
export class SupremeFinaleController {
  readonly encounters: readonly BossEncounter[];
  private readonly defeated = new Set<BossArchetype>();
  private readonly activationDelays = [0, 900, 1800] as const;
  private readonly healthRoots: Phaser.GameObjects.Container[] = [];
  private elapsedMs = 0;
  private combatActive = true;
  private lastHudRefreshAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly scene: Phaser.Scene,
    completedRound: number,
    seed: number,
    spawns: readonly { x: number; y: number }[],
    bounds: RectSpec,
    isBlocked: (x: number, y: number) => boolean,
    callbacks: SupremeFinaleCallbacks,
    modeFamily: RunModeFamily,
    options: SupremeFinaleOptions
  ) {
    this.encounters = ARCHETYPES.map((archetype, index) => new BossEncounter(
      scene,
      completedRound,
      (seed ^ Math.imul(index + 1, 0x6c8e9cf5)) >>> 0,
      archetype,
      spawns[index] ?? spawns[0] ?? { x: bounds.x + bounds.w * .5, y: bounds.y + bounds.h * .5 },
      bounds,
      isBlocked,
      {
        fireProjectile: callbacks.fireProjectile,
        damageArea: callbacks.damageArea,
        dropCredit: callbacks.dropCredit,
        onDamaged: callbacks.onDamaged,
        onAttackCast: callbacks.onAttackCast,
        onDefeated: () => {
          if (this.defeated.has(archetype)) return;
          this.defeated.add(archetype);
          this.encounters[index]?.cancelCombat();
          const remaining = this.remaining;
          callbacks.onBossDefeated(archetype, remaining);
          if (remaining === 0) {
            this.combatActive = false;
            callbacks.onComplete();
          }
        }
      },
      modeFamily,
      {
        showHealthUi: false,
        particlesEnabled: options.particlesEnabled,
        healthMultiplier: options.healthMultiplier,
        damageMultiplier: options.damageMultiplier
      }
    ));
    this.createSharedHealthUi();
  }

  get bosses(): Boss[] { return this.encounters.map((encounter) => encounter.boss); }
  get remaining(): number { return this.encounters.length - this.defeated.size; }
  get totalMaximumHealth(): number { return this.encounters.reduce((sum, encounter) => sum + encounter.boss.maxHp, 0); }
  get allDefeated(): boolean { return this.remaining === 0; }

  update(deltaMs: number, player: Player): void {
    if (!this.combatActive) return;
    this.elapsedMs += Math.max(0, deltaMs);
    this.encounters.forEach((encounter, index) => {
      if (this.elapsedMs >= this.activationDelays[index] && !encounter.boss.isDefeated) encounter.update(deltaMs, player);
    });
    if (this.elapsedMs - this.lastHudRefreshAt >= 80) {
      this.lastHudRefreshAt = this.elapsedMs;
      this.refreshSharedHealthUi();
    }
  }

  activeBosses(): Boss[] { return this.encounters.map((encounter) => encounter.boss).filter((boss) => boss.active && !boss.isDefeated); }

  nearestTarget(x: number, y: number): Boss | null {
    let result: Boss | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const boss of this.activeBosses()) {
      const distance = (boss.x - x) ** 2 + (boss.y - y) ** 2;
      if (distance < best) { best = distance; result = boss; }
    }
    return result;
  }

  setPresentationVisible(visible: boolean): void {
    this.encounters.forEach((encounter) => encounter.setPresentationVisible(visible));
    this.healthRoots.forEach((root) => root.setVisible(visible));
  }

  playEntrance(): void { this.encounters.forEach((encounter) => encounter.playEntrance()); }
  cancelCombat(): void { this.combatActive = false; this.encounters.forEach((encounter) => encounter.cancelCombat()); }
  resize(width: number): void { this.layoutSharedHealthUi(width); }

  destroy(): void {
    this.combatActive = false;
    this.encounters.forEach((encounter) => encounter.destroy());
    this.healthRoots.forEach((root) => root.destroy(true));
    this.healthRoots.length = 0;
    this.defeated.clear();
  }

  private createSharedHealthUi(): void {
    for (let index = 0; index < this.encounters.length; index += 1) {
      const encounter = this.encounters[index];
      const color = BOSS_ARCHETYPES[encounter.archetype].color;
      const root = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(1122);
      const track = this.scene.add.rectangle(0, 0, 250, 13, 0x060b12, .94).setOrigin(0, .5).setStrokeStyle(1, color, .8).setName('track');
      const fill = this.scene.add.rectangle(2, 0, 246, 9, color, .9).setOrigin(0, .5).setName('fill');
      const label = this.scene.add.text(0, -17, BOSS_ARCHETYPES[encounter.archetype].label, { fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#eaffff', fontStyle: 'bold' }).setOrigin(0, 1);
      root.add([track, fill, label]);
      this.healthRoots.push(root);
    }
    this.layoutSharedHealthUi(this.scene.scale.width);
    this.refreshSharedHealthUi();
  }

  private layoutSharedHealthUi(width: number): void {
    const gap = 14;
    const barWidth = Math.min(270, Math.max(150, (width - 90 - gap * 2) / 3));
    const total = barWidth * 3 + gap * 2;
    this.healthRoots.forEach((root, index) => {
      root.setPosition(width * .5 - total * .5 + index * (barWidth + gap), 292);
      (root.getByName('track') as Phaser.GameObjects.Rectangle | null)?.setDisplaySize(barWidth, 13);
    });
  }

  private refreshSharedHealthUi(): void {
    this.healthRoots.forEach((root, index) => {
      const track = root.getByName('track') as Phaser.GameObjects.Rectangle | null;
      const fill = root.getByName('fill') as Phaser.GameObjects.Rectangle | null;
      const boss = this.encounters[index].boss;
      if (!track || !fill) return;
      fill.setDisplaySize(Math.max(0, (track.displayWidth - 4) * boss.healthRatio), 9).setAlpha(boss.isDefeated ? .16 : .9);
      root.setAlpha(boss.isDefeated ? .42 : 1);
    });
  }
}

