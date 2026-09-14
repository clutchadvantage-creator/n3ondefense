import Phaser from 'phaser';
import type { EnemyType } from '../types.ts';
import type { BossArchetype } from '../config/bossBalance.ts';
import { ReusableObjectPool, type ObjectPoolStats } from '../performance/ReusableObjectPool.ts';
import { resolveMechanicalFragmentBudget } from './MechanicalDestructionBudget.ts';

export const MECHANICAL_DEBRIS_TEXTURES = [
  'mechanical-bolt',
  'mechanical-nut',
  'mechanical-washer',
  'mechanical-gear',
  'mechanical-plate',
  'mechanical-circuit'
] as const;

type MechanicalDebrisTexture = typeof MECHANICAL_DEBRIS_TEXTURES[number] | 'mechanical-spark' | 'mechanical-smoke' | 'mechanical-arc';

interface DebrisSpawn {
  effect?: 'spark' | 'smoke' | 'arc';
  x: number;
  y: number;
  color: number;
  texture: MechanicalDebrisTexture;
  scale: number;
  velocityX: number;
  groundVelocityY: number;
  liftVelocity: number;
  angularVelocity: number;
  lifetimeMs: number;
  bornAt: number;
  priority: 'enemy' | 'boss';
}

interface DebrisSlot extends DebrisSpawn {
  sprite: Phaser.GameObjects.Image;
  groundY: number;
  height: number;
  bounceCount: number;
}

interface BurstSlot {
  circle: Phaser.GameObjects.Arc;
  bornAt: number;
  lifetimeMs: number;
  startRadius: number;
  endRadius: number;
  startAlpha: number;
}

export interface MechanicalDestructionStats {
  activeFragments: number;
  peakFragments: number;
  fragmentCapacity: number;
  fragmentPool: ObjectPoolStats;
  activeBursts: number;
  peakBursts: number;
  allocationMisses: number;
  degradedEffects: number;
  droppedOptionalFragments: number;
}

export interface MechanicalCirclePool {
  obtain(state: {
    x: number;
    y: number;
    radius: number;
    color: number;
    alpha: number;
    depth: number;
    strokeWidth?: number;
    strokeColor?: number;
    strokeAlpha?: number;
  }): Phaser.GameObjects.Arc;
  release(circle: Phaser.GameObjects.Arc): void;
}

const TAU = Math.PI * 2;
const MAX_FRAGMENTS = 168;
const MAX_BURSTS = 96;

const fragmentCountForEnemy = (type: EnemyType): number => {
  if (type === 'tank' || type === 'drone') return 8;
  if (type === 'shooter' || type === 'disruptor') return 6;
  if (type === 'star') return 7;
  return type === 'grunt' ? 4 : 5;
};

const profileForBoss = (archetype: BossArchetype): readonly MechanicalDebrisTexture[] => {
  if (archetype === 'void-brawler') return ['mechanical-plate', 'mechanical-gear', 'mechanical-nut', 'mechanical-bolt'];
  if (archetype === 'storm-mage') return ['mechanical-circuit', 'mechanical-washer', 'mechanical-bolt'];
  return ['mechanical-plate', 'mechanical-circuit', 'mechanical-gear', 'mechanical-bolt'];
};

/**
 * Draws the tiny monochrome atlas once during Boot. Runtime deaths only retint
 * pooled Images; they never construct Graphics objects or physics bodies.
 */
export const createMechanicalDebrisTextures = (graphics: Phaser.GameObjects.Graphics): void => {
  const begin = (): void => {
    graphics.clear();
    graphics.fillStyle(0xffffff, 1);
    graphics.lineStyle(2, 0xffffff, 1);
  };

  begin();
  graphics.fillRoundedRect(6, 2, 5, 12, 2);
  graphics.fillRect(3, 3, 11, 3);
  graphics.generateTexture('mechanical-bolt', 17, 17);

  begin();
  graphics.fillPoints([{ x: 8, y: 1 }, { x: 15, y: 5 }, { x: 15, y: 12 }, { x: 8, y: 16 }, { x: 1, y: 12 }, { x: 1, y: 5 }], true);
  graphics.fillStyle(0x000000, 1).fillCircle(8, 8, 3);
  graphics.generateTexture('mechanical-nut', 17, 17);

  begin();
  graphics.fillCircle(8, 8, 7);
  graphics.fillStyle(0x000000, 1).fillCircle(8, 8, 4);
  graphics.generateTexture('mechanical-washer', 17, 17);

  begin();
  for (let i = 0; i < 8; i += 1) {
    const angle = i / 8 * TAU;
    graphics.fillRect(7 + Math.cos(angle) * 6, 7 + Math.sin(angle) * 6, 3, 3);
  }
  graphics.fillCircle(8.5, 8.5, 5.2);
  graphics.fillStyle(0x000000, 1).fillCircle(8.5, 8.5, 2.2);
  graphics.generateTexture('mechanical-gear', 18, 18);

  begin();
  graphics.fillPoints([{ x: 2, y: 4 }, { x: 15, y: 1 }, { x: 17, y: 11 }, { x: 5, y: 16 }, { x: 1, y: 11 }], true);
  graphics.generateTexture('mechanical-plate', 18, 18);

  begin();
  graphics.fillRoundedRect(1, 3, 16, 12, 2);
  graphics.lineStyle(1, 0x000000, 1);
  graphics.lineBetween(4, 6, 14, 6);
  graphics.lineBetween(6, 6, 6, 12);
  graphics.lineBetween(6, 12, 13, 12);
  graphics.generateTexture('mechanical-circuit', 18, 18);

  begin();
  graphics.fillStyle(0xffffff, .15).fillRoundedRect(0, 5, 28, 6, 3);
  graphics.fillStyle(0xffffff, .8).fillRect(3, 7, 23, 2);
  graphics.fillStyle(0xffffff, 1).fillRect(19, 6, 6, 4);
  graphics.generateTexture('mechanical-spark', 28, 16);
  begin();
  graphics.clear();
  for (let r = 22; r >= 4; r -= 3) graphics.fillStyle(0xffffff, .035).fillCircle(24, 24, r);
  graphics.generateTexture('mechanical-smoke', 48, 48);
  begin();
  graphics.clear().lineStyle(4, 0xffffff, .15).lineBetween(2, 14, 12, 7).lineBetween(12, 7, 17, 18).lineBetween(17, 18, 29, 8);
  graphics.lineStyle(1, 0xffffff, 1).lineBetween(2, 14, 12, 7).lineBetween(12, 7, 17, 18).lineBetween(17, 18, 29, 8);
  graphics.generateTexture('mechanical-arc', 32, 26);
};

/**
 * Bounded, non-physics mechanical destruction presentation. Authoritative
 * damage/death/reward code calls emit; this class never drives gameplay state.
 */
export class MechanicalDestructionVfx {
  private readonly fragments: DebrisSlot[] = [];
  private readonly bursts: BurstSlot[] = [];
  private readonly ownedSprites = new Set<Phaser.GameObjects.Image>();
  private readonly pool: ReusableObjectPool<DebrisSlot, DebrisSpawn>;
  private peakFragments = 0;
  private peakBursts = 0;
  private allocationMisses = 0;
  private degradedEffects = 0;
  private droppedOptionalFragments = 0;
  private sequence = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly circles: MechanicalCirclePool,
    private readonly particlesEnabled: boolean
  ) {
    this.pool = new ReusableObjectPool<DebrisSlot, DebrisSpawn>(
      (state) => {
        const sprite = scene.add.image(state.x, state.y, state.texture).setDepth(12);
        this.ownedSprites.add(sprite);
        return this.resetFragment({ ...state, sprite, groundY: state.y, height: 0, bounceCount: 0 }, state);
      },
      (slot, state) => { this.resetFragment(slot, state); },
      (slot) => slot.sprite.setActive(false).setVisible(false).setPosition(-10_000, -10_000).clearTint()
    );
  }

  prewarm(target: number): number {
    return this.pool.prewarm(Math.min(MAX_FRAGMENTS, Math.max(0, target)), (index) => ({
      x: -10_000,
      y: -10_000,
      color: 0xffffff,
      texture: MECHANICAL_DEBRIS_TEXTURES[index % MECHANICAL_DEBRIS_TEXTURES.length],
      scale: 0.5,
      velocityX: 0,
      groundVelocityY: 0,
      liftVelocity: 0,
      angularVelocity: 0,
      lifetimeMs: 0,
      bornAt: 0,
      priority: 'enemy'
    }));
  }

  emitEnemy(type: EnemyType, x: number, y: number, color: number, now: number): void {
    this.emitCoreBurst(x, y, color, now, type === 'tank' ? 1.18 : 1);
    if (!this.particlesEnabled) return;
    this.emitFragments(fragmentCountForEnemy(type), x, y, color, now, 'enemy', undefined, type === 'tank' ? 1.25 : 1);
    this.emitAccents(x, y, now);
  }

  emitBossStage(archetype: BossArchetype, x: number, y: number, color: number, now: number, final = false): void {
    this.emitCoreBurst(x, y, color, now, final ? 2.15 : 1.35);
    if (!this.particlesEnabled) return;
    this.emitFragments(final ? 12 : 6, x, y, color, now, 'boss', profileForBoss(archetype), final ? 1.65 : 1.2);
  }

  emitPlayer(x: number, y: number, color: number, now: number): void {
    this.emitCoreBurst(x, y, color, now, 1.35);
    if (this.particlesEnabled) this.emitFragments(10, x, y, color, now, 'boss', undefined, 1.25);
  }

  update(now: number, deltaMs: number): void {
    const dt = Math.min(0.05, Math.max(0, deltaMs / 1000));
    let write = 0;
    for (const slot of this.fragments) {
      const age = now - slot.bornAt;
      if (age >= slot.lifetimeMs || !slot.sprite.active) {
        this.pool.release(slot);
        continue;
      }
      if (slot.effect) {
        const life = Math.max(0, age / slot.lifetimeMs);
        slot.sprite.x += slot.velocityX * dt; slot.sprite.y += slot.groundVelocityY * dt;
        if (slot.effect === 'smoke') slot.sprite.setScale(slot.scale * (1 + life * 1.5)).setAlpha(.55 * (1 - life));
        else if (slot.effect === 'arc') slot.sprite.setAlpha((1 - life) * (Math.sin(age * .075) > -.2 ? .8 : .08));
        else slot.sprite.setAlpha(1 - life).setScale(slot.scale * (1 - life * .4), slot.scale);
        this.fragments[write++] = slot;
        continue;
      }
      slot.sprite.x += slot.velocityX * dt;
      slot.groundY += slot.groundVelocityY * dt;
      slot.height += slot.liftVelocity * dt;
      slot.liftVelocity -= 440 * dt;
      if (slot.height <= 0 && slot.liftVelocity < 0) {
        slot.height = 0;
        if (slot.bounceCount < 1 && Math.abs(slot.liftVelocity) > 70) {
          slot.liftVelocity = -slot.liftVelocity * 0.34;
          slot.velocityX *= 0.76;
          slot.groundVelocityY *= 0.76;
          slot.bounceCount += 1;
        } else {
          slot.liftVelocity = 0;
          slot.velocityX *= Math.pow(0.08, dt);
          slot.groundVelocityY *= Math.pow(0.08, dt);
        }
      }
      const life = age / slot.lifetimeMs;
      const altitudeScale = 1 + Math.min(0.25, slot.height * 0.005);
      slot.sprite.setY(slot.groundY - slot.height)
        .setRotation(slot.sprite.rotation + slot.angularVelocity * dt)
        .setScale(slot.scale * altitudeScale)
        .setAlpha(life < 0.72 ? 1 : 1 - (life - 0.72) / 0.28);
      this.fragments[write++] = slot;
    }
    this.fragments.length = write;

    let burstWrite = 0;
    for (const burst of this.bursts) {
      const progress = (now - burst.bornAt) / burst.lifetimeMs;
      if (progress >= 1 || !burst.circle.active) {
        this.circles.release(burst.circle);
        continue;
      }
      const eased = 1 - (1 - Math.max(0, progress)) ** 3;
      burst.circle.setRadius(Phaser.Math.Linear(burst.startRadius, burst.endRadius, eased));
      burst.circle.setAlpha(burst.startAlpha * (1 - progress));
      this.bursts[burstWrite++] = burst;
    }
    this.bursts.length = burstWrite;
  }

  reset(): void {
    for (const slot of this.fragments) this.pool.release(slot);
    this.fragments.length = 0;
    for (const burst of this.bursts) this.circles.release(burst.circle);
    this.bursts.length = 0;
  }

  trimRetained(target: number): number {
    return this.pool.trimAvailable(Math.min(MAX_FRAGMENTS, Math.max(0, target)), (slot) => {
      this.ownedSprites.delete(slot.sprite);
      slot.sprite.destroy();
    }, 32);
  }

  ownsDisplayObject(object: unknown): boolean {
    return this.ownedSprites.has(object as Phaser.GameObjects.Image);
  }

  stats(): MechanicalDestructionStats {
    return {
      activeFragments: this.fragments.length,
      peakFragments: this.peakFragments,
      fragmentCapacity: MAX_FRAGMENTS,
      fragmentPool: this.pool.stats(),
      activeBursts: this.bursts.length,
      peakBursts: this.peakBursts,
      allocationMisses: this.allocationMisses,
      degradedEffects: this.degradedEffects,
      droppedOptionalFragments: this.droppedOptionalFragments
    };
  }

  destroy(): void {
    this.reset();
    this.pool.destroy((slot) => {
      this.ownedSprites.delete(slot.sprite);
      slot.sprite.destroy();
    });
    this.ownedSprites.clear();
  }

  discardReferences(): void {
    this.fragments.length = 0;
    this.bursts.length = 0;
    this.pool.discardReferences();
    this.ownedSprites.clear();
  }

  private emitCoreBurst(x: number, y: number, color: number, now: number, scale: number): void {
    this.obtainBurst(x, y, 5 * scale, 24 * scale, 0xffffff, 0.95, 100, now, 14);
    this.obtainBurst(x, y, 10 * scale, 42 * scale, color, 0.72, 220, now, 13);
    if (this.bursts.length < MAX_BURSTS - 1) {
      this.obtainBurst(x, y, 15 * scale, 57 * scale, color, 0.22, 330, now, 12, 2.5);
    } else {
      this.degradedEffects += 1;
    }
  }

  private obtainBurst(
    x: number,
    y: number,
    startRadius: number,
    endRadius: number,
    color: number,
    alpha: number,
    lifetimeMs: number,
    now: number,
    depth: number,
    strokeWidth = 0
  ): void {
    while (this.bursts.length >= MAX_BURSTS) {
      const retired = this.bursts.shift();
      if (retired) this.circles.release(retired.circle);
    }
    const circle = this.circles.obtain({
      x, y, radius: startRadius, color, alpha, depth,
      strokeWidth, strokeColor: color, strokeAlpha: strokeWidth > 0 ? 0.95 : 0
    });
    this.bursts.push({ circle, bornAt: now, lifetimeMs, startRadius, endRadius, startAlpha: alpha });
    this.peakBursts = Math.max(this.peakBursts, this.bursts.length);
  }

  private emitFragments(
    requested: number,
    x: number,
    y: number,
    color: number,
    now: number,
    priority: 'enemy' | 'boss',
    textureProfile?: readonly MechanicalDebrisTexture[],
    sizeScale = 1
  ): void {
    const budget = resolveMechanicalFragmentBudget(requested, this.fragments.length, MAX_FRAGMENTS);
    const desired = budget.count;
    if (budget.degraded) this.degradedEffects += 1;

    for (let index = 0; index < desired; index += 1) {
      if (this.fragments.length >= MAX_FRAGMENTS) {
        if (priority === 'boss') {
          const expendable = this.fragments.findIndex((slot) => slot.priority === 'enemy');
          if (expendable >= 0) {
            const [slot] = this.fragments.splice(expendable, 1);
            this.pool.release(slot);
          }
        }
      }
      if (this.fragments.length >= MAX_FRAGMENTS) {
        this.allocationMisses += 1;
        this.droppedOptionalFragments += desired - index;
        break;
      }
      const serial = this.sequence++;
      const angle = ((serial * 2.399963229728653) + index * 0.71) % TAU;
      const speed = (62 + ((serial * 37) % 74)) * sizeScale;
      const profile = textureProfile ?? MECHANICAL_DEBRIS_TEXTURES;
      // The final small bolt doubles as the pooled spark streak. It keeps the
      // kill silhouette lively without adding a second particle emitter.
      const spark = desired > 3 && index === desired - 1;
      const texture = spark ? 'mechanical-bolt' : profile[serial % profile.length];
      const tint = spark ? 0xffffff : index % 4 === 0 ? 0xeaffff : index % 3 === 0 ? 0x8aa4b5 : color;
      const slot = this.pool.obtain({
        x,
        y,
        color: tint,
        texture,
        scale: (spark ? 0.32 : 0.48 + (serial % 4) * 0.1) * sizeScale,
        velocityX: Math.cos(angle) * speed,
        groundVelocityY: Math.sin(angle) * speed * 0.58,
        liftVelocity: (spark ? 220 : 145) + (serial * 29) % 100,
        angularVelocity: (serial % 2 === 0 ? 1 : -1) * (4.5 + serial % 6),
        lifetimeMs: spark ? 420 : 640 + (serial * 53) % 420,
        bornAt: now,
        priority
      });
      this.fragments.push(slot);
    }
    this.peakFragments = Math.max(this.peakFragments, this.fragments.length);
  }

  private emitAccents(x: number, y: number, now: number): void {
    const count = Math.min(MAX_FRAGMENTS - this.fragments.length, resolveMechanicalFragmentBudget(4, this.fragments.length, MAX_FRAGMENTS).count);
    for (let i = 0; i < count; i++) {
      const effect = i < 2 ? 'spark' : i === 2 ? 'smoke' : 'arc';
      const angle = (this.sequence++ * 2.399963229728653) % TAU;
      const slot = this.pool.obtain({ effect, x, y, texture: `mechanical-${effect}`, color: effect === 'smoke' ? 0x667786 : 0xb8efff,
        scale: effect === 'smoke' ? .55 : .65, velocityX: effect === 'spark' ? Math.cos(angle) * 220 : 0,
        groundVelocityY: effect === 'spark' ? Math.sin(angle) * 220 : effect === 'smoke' ? -18 : 0,
        liftVelocity: 0, angularVelocity: 0, lifetimeMs: effect === 'smoke' ? 430 : effect === 'arc' ? 240 : 180,
        bornAt: now, priority: 'enemy' });
      slot.sprite.setRotation(effect === 'smoke' ? 0 : angle);
      this.fragments.push(slot);
    }
    this.peakFragments = Math.max(this.peakFragments, this.fragments.length);
  }

  private resetFragment(slot: DebrisSlot, state: DebrisSpawn): DebrisSlot {
    Object.assign(slot, state);
    slot.effect = state.effect;
    slot.groundY = state.y;
    slot.height = 0;
    slot.bounceCount = 0;
    slot.sprite.setTexture(state.texture).setPosition(state.x, state.y).setTint(state.color)
      .setScale(state.scale).setAlpha(1).setRotation(0).setDepth(12)
      .setActive(true).setVisible(true);
    slot.sprite.setBlendMode(state.effect && state.effect !== 'smoke' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    return slot;
  }
}
