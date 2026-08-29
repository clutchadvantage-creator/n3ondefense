import Phaser from 'phaser';
import type { EnergyStats, PlayerStats, WeaponStats } from '../types';
import { PLAYER_BALANCE, WEAPON_BALANCE } from '../config/balance';
import { applyOperativeSpeedMultipliers } from '../mods/ModRules.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { stackedPickupMultiplier } from '../player/OverdriveRules.ts';
import {
  OperativeAppearanceController,
  type OperativeAppearanceResolver
} from '../cosmetics/OperativeAppearanceController.ts';

export interface BuffState {
  damageBoostUntil: number;
  speedBoostUntil: number;
  rapidFireUntil: number;
  ricochetUntil: number;
  speedBoostStacks: number;
  rapidFireStacks: number;
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
  private readonly appearanceController: OperativeAppearanceController;
  permanentModSpeedMultiplier = 1;
  modSpeedBoostUntil = 0;
  modSpeedMultiplier = 1;
  buffs: BuffState = {
    damageBoostUntil: 0,
    speedBoostUntil: 0,
    rapidFireUntil: 0,
    ricochetUntil: 0,
    speedBoostStacks: 0,
    rapidFireStacks: 0
  };

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, stats: PlayerStats, energyStats: EnergyStats, weapon: WeaponStats) {
    super(scene, x, y, texture);
    this.stats = stats;
    this.energyStats = energyStats;
    this.weapon = weapon;
    this.hp = stats.maxHealth;
    this.energy = energyStats.max;
    this.appearanceController = new OperativeAppearanceController({
      isActive: () => this.active,
      getTextureKey: () => this.texture.key,
      setTexture: (textureKey) => { this.setTexture(textureKey); },
      clearTint: () => { this.clearTint(); },
      setTint: (color) => { this.setTint(color); },
      setTintFill: (color) => { this.setTintFill(color); }
    }, () => ({ textureKey: this.texture.key, tint: null }));
    scene.add.existing(this);
    scene.physics.add.existing(this);
    if (texture.startsWith('player-premium-')) {
      // Premium artwork may be wide or tall, but every frame retains the
      // exact same centered 12px gameplay collision radius.
      this.setCircle(12, (this.width - 24) * 0.5, (this.height - 24) * 0.5);
    } else if (texture === 'player-spaceship') this.setCircle(12, 10, 3);
    else if (texture === 'player-clover') this.setCircle(12, 7, 7);
    else if (texture === 'player-ice-cream') this.setCircle(12, 6, 10);
    else if (texture === 'player-airplane') this.setCircle(12, 11, 5);
    else if (texture === 'player-ufo') this.setCircle(12, 9, 9);
    else this.setCircle(12, (this.width - 24) * 0.5, (this.height - 24) * 0.5);
    this.setDamping(true);
    this.setDrag(0.0005);
    this.setCollideWorldBounds(true);
    this.setDepth(8);
  }

  get speed(): number {
    const boosted = this.scene.time.now < this.buffs.speedBoostUntil;
    const boostStacks = boosted ? Math.max(1, this.buffs.speedBoostStacks) : 0;
    const pickupMultiplier = stackedPickupMultiplier(WEAPON_BALANCE.speedBoostMultiplier, boostStacks);
    const modBoost = this.scene.time.now < this.modSpeedBoostUntil ? this.modSpeedMultiplier : 1;
    return applyOperativeSpeedMultipliers(
      this.stats.moveSpeed,
      this.permanentModSpeedMultiplier,
      boosted ? pickupMultiplier : 1,
      modBoost
    );
  }

  get fireRate(): number {
    const boosted = this.scene.time.now < this.buffs.rapidFireUntil;
    const boostStacks = boosted ? Math.max(1, this.buffs.rapidFireStacks) : 0;
    const multiplier = stackedPickupMultiplier(WEAPON_BALANCE.rapidFireMultiplier, boostStacks);
    return Math.min(WEAPON_BALANCE.maximumBuffedFireRate, this.weapon.fireRate * multiplier);
  }

  get damageMultiplier(): number {
    return this.scene.time.now < this.buffs.damageBoostUntil ? WEAPON_BALANCE.damageBoostMultiplier : 1;
  }

  updateEnergy(dtSec: number): void {
    // Regeneration restores the normal reservoir but never creates overcharge.
    // Existing overcharge is preserved until the player spends it.
    if (this.energy < this.energyStats.max) {
      this.energy = Phaser.Math.Clamp(this.energy + this.energyStats.regenPerSecond * dtSec, 0, this.energyStats.max);
    }
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

  setAppearanceResolver(resolver: OperativeAppearanceResolver): void {
    this.appearanceController.setResolver(resolver);
  }

  restoreOperativeAppearance(now = this.scene.time.now, cancelDamageFlash = false): boolean {
    return this.appearanceController.restore(now, cancelDamageFlash);
  }

  updatePresentation(now: number): void {
    this.appearanceController.update(now);
  }

  takeDamage(amount: number): boolean {
    const now = this.scene.time.now;
    if (now < this.invulnUntil) return false;
    const previousHp = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp < previousHp) AudioManager.get().playSfx('playerDamage');
    this.invulnUntil = now + this.stats.invulnMs;
    this.appearanceController.beginDamageFlash(now, 90);
    return true;
  }

  isDead(): boolean {
    return this.hp <= 0;
  }
}
