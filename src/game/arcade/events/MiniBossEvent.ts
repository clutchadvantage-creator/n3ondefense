import Phaser from 'phaser';
import { BossEncounter } from '../../bosses/BossEncounter.ts';
import type { Boss } from '../../bosses/Boss.ts';
import { BOSS_ARCHETYPES, selectBossArchetype, type BossArchetype } from '../../config/bossBalance.ts';
import type {
  ArcadeEvent,
  ArcadeEventDefinition,
  ArcadeEventOutcome,
  ArcadeGameplayEvent,
  ArcadeRuntimeContext,
  ArcadeStopReason
} from '../types.ts';

export const ARCADE_MINIBOSS_HEALTH_MULTIPLIER = 0.42;

export class MiniBossEvent implements ArcadeEvent {
  readonly id = 'mini-boss' as const;
  private encounter: BossEncounter | null = null;
  private wallCollider: Phaser.Physics.Arcade.Collider | null = null;
  private marker: Phaser.GameObjects.Container | null = null;
  private startedAt = 0;
  private defeated = false;
  private archetype: BossArchetype | null = null;

  constructor(
    private readonly context: ArcadeRuntimeContext,
    private readonly definition: ArcadeEventDefinition
  ) {}

  start(activeElapsedMs: number): boolean {
    const point = this.context.findSpawnPoints(1, 360)[0];
    if (!point) return false;
    this.startedAt = activeElapsedMs;
    this.archetype = selectBossArchetype(this.context.round, this.context.seed ^ 0xa7cade);
    this.encounter = new BossEncounter(
      this.context.scene,
      this.context.round,
      this.context.seed ^ 0x6d1b055,
      this.archetype,
      point,
      this.context.bounds,
      (x, y) => this.context.isBlocked(x, y),
      {
        fireProjectile: (spec) => this.context.fireBossProjectile(spec),
        damageArea: (x, y, radius, damage, attack) => this.context.applyBossAreaDamage(x, y, radius, damage, attack),
        dropCredit: () => undefined,
        onDamaged: () => undefined,
        onAttackCast: () => undefined,
        onDefeated: () => { this.defeated = true; }
      },
      this.context.modeFamily,
      { healthMultiplier: ARCADE_MINIBOSS_HEALTH_MULTIPLIER, showHealthUi: false }
    );
    this.wallCollider = this.context.scene.physics.add.collider(this.encounter.boss, this.context.walls);
    this.marker = this.createMarker(this.encounter.boss, this.archetype);
    this.context.emitMetric({
      name: 'arcade_miniboss_spawned', eventId: this.id, round: this.context.round,
      protocol: this.context.protocol, elapsedMs: 0, bossType: this.archetype
    });
    return true;
  }

  update(activeElapsedMs: number, deltaMs: number): ArcadeEventOutcome | null {
    if (!this.encounter) return { success: false, reason: 'failed' };
    if (this.defeated || this.encounter.boss.isDefeated) {
      this.context.emitMetric({
        name: 'arcade_miniboss_killed', eventId: this.id, round: this.context.round,
        protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
        bossType: this.archetype ?? undefined, success: true
      });
      this.context.emitMetric({
        name: 'arcade_miniboss_completed', eventId: this.id, round: this.context.round,
        protocol: this.context.protocol, elapsedMs: activeElapsedMs - this.startedAt,
        bossType: this.archetype ?? undefined, success: true
      });
      this.defeated = false;
      return { success: true, reason: 'success' };
    }
    if (activeElapsedMs - this.startedAt >= this.definition.durationMs) return { success: false, reason: 'timeout' };
    this.encounter.update(deltaMs, this.context.player);
    if (this.marker) {
      const boss = this.encounter.boss;
      const pulse = 0.5 + Math.sin(activeElapsedMs * 0.009) * 0.5;
      this.marker.setPosition(boss.x, boss.y - boss.hazardRadius - 35).setScale(0.96 + pulse * 0.08);
    }
    return null;
  }

  handleGameplayEvent(_event: ArcadeGameplayEvent): ArcadeEventOutcome | null {
    return null;
  }

  objectiveText(activeElapsedMs: number): string {
    const hp = Math.round((this.encounter?.boss.healthRatio ?? 0) * 100);
    const remaining = Math.max(0, this.definition.durationMs - (activeElapsedMs - this.startedAt));
    return `MINI-BOSS  —  ${hp}% HP  —  ${(remaining / 1000).toFixed(1)}s`;
  }

  getBossTarget(): Boss | null {
    const boss = this.encounter?.boss;
    return boss?.active && !boss.isDefeated ? boss : null;
  }

  cleanup(reason: ArcadeStopReason): void {
    if (reason === 'success') this.context.scene.cameras.main.flash(180, 255, 198, 72, false);
    this.context.retireBossProjectiles();
    this.wallCollider?.destroy();
    this.wallCollider = null;
    this.marker?.destroy(true);
    this.marker = null;
    this.encounter?.destroy();
    this.encounter = null;
  }

  private createMarker(boss: Boss, archetype: BossArchetype): Phaser.GameObjects.Container {
    const color = BOSS_ARCHETYPES[archetype].color;
    const ring = this.context.scene.add.circle(0, 0, 31, 0x000000, 0)
      .setStrokeStyle(2, 0xffd65a, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    const crown = this.context.scene.add.text(0, -3, '⌁', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '21px', fontStyle: 'bold', color: '#ffe27a',
      stroke: '#140712', strokeThickness: 4
    }).setOrigin(0.5);
    const label = this.context.scene.add.text(0, 24, 'ARCADE', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '9px', fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      stroke: '#02050b', strokeThickness: 3
    }).setOrigin(0.5);
    return this.context.scene.add.container(boss.x, boss.y - boss.hazardRadius - 35, [ring, crown, label]).setDepth(13);
  }
}
