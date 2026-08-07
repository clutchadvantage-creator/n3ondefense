import Phaser from 'phaser';
import type { EnergyStats, PlayerStats, WeaponStats } from '../types';
import { PLAYER_BALANCE, WEAPON_BALANCE } from '../config/balance';

export interface BuffState {
  damageBoostUntil: number;
  speedBoostUntil: number;
  rapidFireUntil: number;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  readonly stats: PlayerStats;
  readonly energyStats: EnergyStats;
  readonly weapon: WeaponStats;
  energy: number;
  heat = 0;
  invulnUntil = 0;
  lastDashMs = -9_999;
  dashUntil = 0;
  private cosmeticTint = 0xffffff;
  modSpeedBoostUntil = 0;
  modSpeedMultiplier = 1;
  buffs: BuffState = {
    damageBoostUntil: 0,
    speedBoostUntil: 0,
    rapidFireUntil: 0
  };

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, stats: PlayerStats, energyStats: EnergyStats, weapon: WeaponStats) {
    super(scene, x, y, texture);
    this.stats = stats;
    this.energyStats = energyStats;
    this.weapon = weapon;
    this.hp = stats.maxHealth;
    this.energy = energyStats.max;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(12);
    this.setDamping(true);
    this.setDrag(0.0005);
    this.setCollideWorldBounds(true);
    this.setDepth(8);
  }

  get speed(): number {
    const boosted = this.scene.time.now < this.buffs.speedBoostUntil;
    const modBoost = this.scene.time.now < this.modSpeedBoostUntil ? this.modSpeedMultiplier : 1;
    return this.stats.moveSpeed * (boosted ? WEAPON_BALANCE.speedBoostMultiplier : 1) * modBoost;
  }

  get fireRate(): number {
    const boosted = this.scene.time.now < this.buffs.rapidFireUntil;
    return this.weapon.fireRate * (boosted ? WEAPON_BALANCE.rapidFireMultiplier : 1);
  }

  get damageMultiplier(): number {
    return this.scene.time.now < this.buffs.damageBoostUntil ? WEAPON_BALANCE.damageBoostMultiplier : 1;
  }

  updateEnergy(dtSec: number): void {
    this.energy = Phaser.Math.Clamp(this.energy + this.energyStats.regenPerSecond * dtSec, 0, this.energyStats.max);
    this.heat = Phaser.Math.Clamp(this.heat - this.weapon.cooldownRate * dtSec, 0, this.weapon.maxHeat);
  }

  canDash(now: number): boolean {
    return now - this.lastDashMs >= this.stats.dashCooldownMs;
  }

  dashTowardPoint(targetX: number, targetY: number, now: number): void {
    this.lastDashMs = now;
    const dir = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y).normalize();
    const dashFactor = PLAYER_BALANCE.dashSpeedBase * (0.9 + this.stats.dashDistanceMultiplier * PLAYER_BALANCE.dashSpeedMultiplier);
    this.dashUntil = now + Phaser.Math.Clamp(
      PLAYER_BALANCE.dashDurationBaseMs + this.stats.dashDistanceMultiplier * PLAYER_BALANCE.dashDurationPerMultiplierMs,
      PLAYER_BALANCE.dashDurationBaseMs,
      PLAYER_BALANCE.dashDurationMaxMs
    );
    this.setVelocity(dir.x * this.speed * dashFactor, dir.y * this.speed * dashFactor);
  }

  canSpendEnergy(amount: number): boolean {
    return this.energy >= amount;
  }

  spendEnergy(amount: number): void {
    this.energy = Math.max(0, this.energy - amount);
  }

  setCosmeticTint(color: number): void {
    this.cosmeticTint = color;
    this.setTint(color);
  }

  takeDamage(amount: number): boolean {
    const now = this.scene.time.now;
    if (now < this.invulnUntil) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = now + this.stats.invulnMs;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => {
      if (this.active) this.setTint(this.cosmeticTint);
    });
    return true;
  }

  isDead(): boolean {
    return this.hp <= 0;
  }
}
