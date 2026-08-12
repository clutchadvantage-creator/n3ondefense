import Phaser from 'phaser';
import type { EnemyType } from '../types';
import { ENEMY_BALANCE } from '../config/balance';
import { GameplayTelemetryRecorder, type CombatDamageSource } from '../telemetry/GameplayTelemetryRecorder.ts';
import { AudioManager } from '../systems/AudioManager.ts';

export interface EnemyStats {
  type: EnemyType;
  hp: number;
  speed: number;
  damage: number;
  color: number;
  size: number;
  valueCredits: number;
  valueCoreTokens: number;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly stats: EnemyStats;
  hp: number;
  lastAttackMs = 0;
  lastShotMs = 0;
  defuseProgressMs = 0;
  defuseInterruptedUntil = 0;
  slowedUntil = 0;
  slowFactor = 1;
  disabledUntil = 0;
  telemetrySpawnedAtActiveMs = 0;
  telemetryFirstDamagedAtActiveMs: number | null = null;
  lastDamageSource: CombatDamageSource = 'unknown';
  readonly damageTakenBySource: Partial<Record<CombatDamageSource, number>> = {};
  private damageFlashUntil = 0;
  private damageFlashActive = false;

  get hazardRadius(): number {
    return this.stats.size * 0.45;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, stats: EnemyStats) {
    super(scene, x, y, texture);
    this.stats = stats;
    this.hp = stats.hp;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const bodyScale = stats.type === 'tank' || stats.type === 'star' ? 0.86 : 0.72;
    this.body?.setSize(stats.size * bodyScale, stats.size * bodyScale, true);

    this.setDisplaySize(stats.size, stats.size);
    this.setTint(stats.color);
    this.setDepth(7);
  }

  takeDamage(amount: number, source: CombatDamageSource = 'unknown'): number {
    if (!Number.isFinite(amount) || amount <= 0 || this.hp <= 0) return 0;
    if (this.telemetryFirstDamagedAtActiveMs === null) {
      this.telemetryFirstDamagedAtActiveMs = GameplayTelemetryRecorder.activeEncounterElapsedMs();
    }
    const applied = Math.min(this.hp, amount);
    const overkill = Math.max(0, amount - applied);
    this.hp = Math.max(0, this.hp - applied);
    AudioManager.get().playSfx('hit');
    this.lastDamageSource = source;
    this.damageTakenBySource[source] = (this.damageTakenBySource[source] ?? 0) + applied;
    GameplayTelemetryRecorder.recordEnemyDamage(this.stats.type, source, applied, overkill);
    this.setTintFill(0xffffff);
    if (!this.damageFlashActive) this.damageFlashUntil = this.scene.time.now + 50;
    this.damageFlashActive = true;
    return applied;
  }

  updateDamageFlash(now: number): void {
    if (!this.damageFlashActive || now < this.damageFlashUntil) return;
    this.damageFlashActive = false;
    if (this.active) this.setTint(this.stats.color);
  }

  isDead(): boolean {
    return this.hp <= 0;
  }

  effectiveSpeed(baseSpeed: number, now: number): number {
    return baseSpeed * (now < this.slowedUntil ? this.slowFactor : 1);
  }
}

export const baseEnemyStats: Record<EnemyType, EnemyStats> = {
  grunt: { type: 'grunt', hp: ENEMY_BALANCE.grunt.hp, speed: ENEMY_BALANCE.grunt.speed, damage: ENEMY_BALANCE.grunt.damage, color: ENEMY_BALANCE.grunt.color, size: ENEMY_BALANCE.grunt.size, valueCredits: ENEMY_BALANCE.grunt.credits, valueCoreTokens: ENEMY_BALANCE.grunt.tokens },
  shooter: { type: 'shooter', hp: ENEMY_BALANCE.shooter.hp, speed: ENEMY_BALANCE.shooter.speed, damage: ENEMY_BALANCE.shooter.damage, color: ENEMY_BALANCE.shooter.color, size: ENEMY_BALANCE.shooter.size, valueCredits: ENEMY_BALANCE.shooter.credits, valueCoreTokens: ENEMY_BALANCE.shooter.tokens },
  defuser: { type: 'defuser', hp: ENEMY_BALANCE.defuser.hp, speed: ENEMY_BALANCE.defuser.speed, damage: ENEMY_BALANCE.defuser.damage, color: ENEMY_BALANCE.defuser.color, size: ENEMY_BALANCE.defuser.size, valueCredits: ENEMY_BALANCE.defuser.credits, valueCoreTokens: ENEMY_BALANCE.defuser.tokens },
  tank: { type: 'tank', hp: ENEMY_BALANCE.tank.hp, speed: ENEMY_BALANCE.tank.speed, damage: ENEMY_BALANCE.tank.damage, color: ENEMY_BALANCE.tank.color, size: ENEMY_BALANCE.tank.size, valueCredits: ENEMY_BALANCE.tank.credits, valueCoreTokens: ENEMY_BALANCE.tank.tokens },
  disruptor: { type: 'disruptor', hp: ENEMY_BALANCE.disruptor.hp, speed: ENEMY_BALANCE.disruptor.speed, damage: ENEMY_BALANCE.disruptor.damage, color: ENEMY_BALANCE.disruptor.color, size: ENEMY_BALANCE.disruptor.size, valueCredits: ENEMY_BALANCE.disruptor.credits, valueCoreTokens: ENEMY_BALANCE.disruptor.tokens },
  star: { type: 'star', hp: ENEMY_BALANCE.star.hp, speed: ENEMY_BALANCE.star.speed, damage: ENEMY_BALANCE.star.damage, color: ENEMY_BALANCE.star.color, size: ENEMY_BALANCE.star.size, valueCredits: ENEMY_BALANCE.star.credits, valueCoreTokens: ENEMY_BALANCE.star.tokens }
};
