import Phaser from 'phaser';
import { FLUX_CORE_BALANCE, getFluxCoreCapacity, getFluxCoreHealth } from '../config/fluxCores';
import type { Player } from '../entities/Player';
import type { ArenaTheme, RectSpec } from '../types';
import { SeededRandom } from './SeededRandom';

export type FluxCoreDamageSource = 'weapon' | 'turret' | 'enemy-projectile' | 'mine' | 'fence' | 'bomblet' | 'bomb' | 'boss';

interface FluxCoreVisual {
  id: number;
  x: number;
  y: number;
  color: number;
  hp: number;
  maximumHp: number;
  root: Phaser.GameObjects.Container;
  floorHatch: Phaser.GameObjects.Ellipse;
  hatchGlow: Phaser.GameObjects.Ellipse;
  hatchLip: Phaser.GameObjects.Ellipse;
  coreGlow: Phaser.GameObjects.Arc;
  coreOrb: Phaser.GameObjects.Arc;
  electricity: Phaser.GameObjects.Graphics;
  upperWindowShutter: Phaser.GameObjects.Rectangle;
  lowerWindowShutter: Phaser.GameObjects.Rectangle;
  healthFill: Phaser.GameObjects.Rectangle;
  spawnedAt: number;
  nextArcAt: number;
  arcPhase: number;
}

const CORE_COLORS = [0x39eeff, 0xff4ed3, 0x53ff8a, 0xffc247, 0xae6bff, 0xff5e75] as const;
type FluxCoreCyclePhase = 'waiting' | 'spawning' | 'engaged' | 'shutdown';

/**
 * Small, capped security objective system. Cores use manual point/area tests so
 * they do not add persistent physics bodies or broad collision callbacks.
 */
export class FluxCoreSystem {
  private readonly random: SeededRandom;
  private readonly warningText: Phaser.GameObjects.Text;
  private readonly cores: FluxCoreVisual[] = [];
  private readonly effects = new Set<Phaser.GameObjects.GameObject>();
  private readonly capacity: number;
  private readonly recentSpawnLocations: Array<{ x: number; y: number }> = [];
  private nextSpawnAt: number;
  private nextCoreId = 1;
  private cyclePhase: FluxCoreCyclePhase = 'waiting';
  private plannedCoreCount = 0;
  private spawnedCoreCount = 0;
  private requiresOnlineGrace = false;
  private lasersOnlineSince = 0;
  private laserSuppressedUntil = 0;
  private recoveryAlarmPlayed = false;
  private announcementUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly round: number,
    seed: number,
    private readonly theme: ArenaTheme,
    private readonly bounds: RectSpec,
    private readonly isBlocked: (x: number, y: number, halfWidth: number, halfHeight: number) => boolean,
    private readonly onDestroyed?: (x: number, y: number) => void,
    private readonly onProximityChanged?: (strength: number) => void,
    private readonly onRecoveryAlarm?: () => void
  ) {
    this.random = new SeededRandom((seed ^ Math.imul(round + 31, 0x85ebca6b) ^ 0xf10cc0de) >>> 0);
    this.capacity = getFluxCoreCapacity(round);
    this.nextSpawnAt = scene.time.now + this.random.int(
      FLUX_CORE_BALANCE.initialSpawnMinMs,
      FLUX_CORE_BALANCE.initialSpawnMaxMs
    );
    this.warningText = scene.add.text(scene.scale.width * 0.5, 276, '', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '16px',
      color: '#80fff0',
      stroke: '#050812',
      strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1050).setAlpha(0);
  }

  get activeCount(): number {
    return this.cores.length;
  }

  update(now: number, player: Player, externalLaserSuppressed = false): void {
    if (this.round < FLUX_CORE_BALANCE.unlockRound) return;
    this.updateCycle(now, player.x, player.y, externalLaserSuppressed);

    let closestDistanceSquared = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.cores.length; index += 1) {
      const core = this.cores[index];
      this.updateVisual(core, index, now);
      if (now >= core.spawnedAt + FLUX_CORE_BALANCE.floorRiseMs + FLUX_CORE_BALANCE.windowOpenMs * 0.5) {
        const dx = player.x - core.x;
        const dy = player.y - core.y;
        closestDistanceSquared = Math.min(closestDistanceSquared, dx * dx + dy * dy);
      }
    }
    this.updateProximityAudio(closestDistanceSquared);
    this.updateSuppressionPresentation(now);
  }

  isLaserSuppressed(now: number): boolean {
    return now < this.laserSuppressedUntil;
  }

  hasCoreWithin(x: number, y: number, radius: number): boolean {
    const combinedRadius = radius + FLUX_CORE_BALANCE.collisionRadius;
    const combinedRadiusSquared = combinedRadius * combinedRadius;
    for (const core of this.cores) {
      const dx = core.x - x;
      const dy = core.y - y;
      if (dx * dx + dy * dy <= combinedRadiusSquared) return true;
    }
    return false;
  }

  getNearestCore(x: number, y: number, range: number): { x: number; y: number } | null {
    let nearest: FluxCoreVisual | null = null;
    let nearestDistanceSquared = range * range;
    for (const core of this.cores) {
      const dx = core.x - x;
      const dy = core.y - y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= nearestDistanceSquared) {
        nearest = core;
        nearestDistanceSquared = distanceSquared;
      }
    }
    return nearest;
  }

  damagePoint(x: number, y: number, radius: number, damage: number, source: FluxCoreDamageSource): boolean {
    const combinedRadius = radius + FLUX_CORE_BALANCE.collisionRadius;
    const combinedRadiusSquared = combinedRadius * combinedRadius;
    for (let index = 0; index < this.cores.length; index += 1) {
      const core = this.cores[index];
      const dx = core.x - x;
      const dy = core.y - y;
      if (dx * dx + dy * dy <= combinedRadiusSquared) {
        this.applyDamage(index, damage, source);
        return true;
      }
    }
    return false;
  }

  damageArea(x: number, y: number, radius: number, damage: number, source: FluxCoreDamageSource): number {
    let hits = 0;
    const combinedRadius = radius + FLUX_CORE_BALANCE.collisionRadius;
    const combinedRadiusSquared = combinedRadius * combinedRadius;
    for (let index = this.cores.length - 1; index >= 0; index -= 1) {
      const core = this.cores[index];
      const dx = core.x - x;
      const dy = core.y - y;
      if (dx * dx + dy * dy > combinedRadiusSquared) continue;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const falloff = Math.max(0.2, 1 - distance / Math.max(1, combinedRadius));
      this.applyDamage(index, damage * falloff, source);
      hits += 1;
    }
    return hits;
  }

  damageAlongSegment(x1: number, y1: number, x2: number, y2: number, thickness: number, damage: number): number {
    let hits = 0;
    const segmentX = x2 - x1;
    const segmentY = y2 - y1;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const hitRadius = thickness + FLUX_CORE_BALANCE.collisionRadius;
    for (let index = this.cores.length - 1; index >= 0; index -= 1) {
      const core = this.cores[index];
      const projection = segmentLengthSquared > 0
        ? Phaser.Math.Clamp(((core.x - x1) * segmentX + (core.y - y1) * segmentY) / segmentLengthSquared, 0, 1)
        : 0;
      const closestX = x1 + segmentX * projection;
      const closestY = y1 + segmentY * projection;
      const dx = core.x - closestX;
      const dy = core.y - closestY;
      if (dx * dx + dy * dy > hitRadius * hitRadius) continue;
      this.applyDamage(index, damage, 'fence');
      hits += 1;
    }
    return hits;
  }

  destroy(): void {
    this.onProximityChanged?.(0);
    for (const core of this.cores) this.destroyCoreVisual(core);
    this.cores.length = 0;
    for (const effect of this.effects) {
      this.scene.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.effects.clear();
    this.warningText.destroy();
  }

  private updateCycle(now: number, playerX: number, playerY: number, externalLaserSuppressed: boolean): void {
    if (this.cyclePhase === 'shutdown') {
      if (now < this.laserSuppressedUntil) return;
      this.cyclePhase = 'waiting';
      this.requiresOnlineGrace = true;
      this.lasersOnlineSince = 0;
      this.nextSpawnAt = Number.POSITIVE_INFINITY;
    }

    if (this.cyclePhase === 'engaged') return;

    // Gas is the other legitimate security-grid suppression. No new core may
    // emerge during it, and the continuous 15-second laser-online requirement
    // restarts after the atmosphere clears.
    if (externalLaserSuppressed) {
      this.requiresOnlineGrace = true;
      this.lasersOnlineSince = 0;
      this.nextSpawnAt = Number.POSITIVE_INFINITY;
      return;
    }

    if (this.requiresOnlineGrace) {
      if (this.lasersOnlineSince <= 0) {
        this.lasersOnlineSince = now;
        this.nextSpawnAt = now
          + FLUX_CORE_BALANCE.laserOnlineGraceMs
          + this.random.int(FLUX_CORE_BALANCE.nextCycleVarianceMinMs, FLUX_CORE_BALANCE.nextCycleVarianceMaxMs);
      }
      if (now < this.nextSpawnAt) return;
      this.requiresOnlineGrace = false;
      this.lasersOnlineSince = 0;
    }

    if (now < this.nextSpawnAt) return;
    if (this.cyclePhase === 'waiting') this.beginCycle(now, playerX, playerY);
    else if (this.cyclePhase === 'spawning') this.spawnNextCore(now, playerX, playerY);
  }

  private beginCycle(now: number, playerX: number, playerY: number): void {
    this.plannedCoreCount = this.random.int(1, this.capacity);
    this.spawnedCoreCount = 0;
    this.cyclePhase = 'spawning';
    this.spawnNextCore(now, playerX, playerY);
  }

  private spawnNextCore(now: number, playerX: number, playerY: number): void {
    const point = this.findSpawnPoint(playerX, playerY);
    if (!point) {
      this.nextSpawnAt = now + 900;
      return;
    }

    this.cores.push(this.createCore(point.x, point.y, this.nextCoreId, now));
    this.rememberSpawnLocation(point.x, point.y);
    this.nextCoreId += 1;
    this.spawnedCoreCount += 1;
    this.warningText.setText(`FLUX DEPLOYMENT // ${this.spawnedCoreCount} / ${this.plannedCoreCount}`);
    this.warningText.setAlpha(0.72);
    this.announcementUntil = now + 1900;

    if (this.spawnedCoreCount >= this.plannedCoreCount) {
      this.cyclePhase = 'engaged';
      this.nextSpawnAt = Number.POSITIVE_INFINITY;
      return;
    }
    this.nextSpawnAt = now + this.random.int(
      FLUX_CORE_BALANCE.perCoreSpawnMinMs,
      FLUX_CORE_BALANCE.perCoreSpawnMaxMs
    );
  }

  private findSpawnPoint(playerX: number, playerY: number): { x: number; y: number } | null {
    const inset = FLUX_CORE_BALANCE.spawnEdgeInset;
    for (let attempt = 0; attempt < 72; attempt += 1) {
      const x = this.random.float(this.bounds.x + inset, this.bounds.x + this.bounds.w - inset);
      const y = this.random.float(this.bounds.y + inset, this.bounds.y + this.bounds.h - inset);
      if (this.isBlocked(x, y, FLUX_CORE_BALANCE.geometryHalfWidth, FLUX_CORE_BALANCE.geometryHalfHeight)) continue;
      const playerDx = x - playerX;
      const playerDy = y - playerY;
      if (playerDx * playerDx + playerDy * playerDy < 120 * 120) continue;
      let tooClose = false;
      for (const core of this.cores) {
        const dx = core.x - x;
        const dy = core.y - y;
        if (dx * dx + dy * dy < FLUX_CORE_BALANCE.minimumCoreSpacing * FLUX_CORE_BALANCE.minimumCoreSpacing) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        for (const previous of this.recentSpawnLocations) {
          const dx = previous.x - x;
          const dy = previous.y - y;
          if (dx * dx + dy * dy < FLUX_CORE_BALANCE.recentLocationSpacing * FLUX_CORE_BALANCE.recentLocationSpacing) {
            tooClose = true;
            break;
          }
        }
      }
      if (!tooClose) return { x, y };
    }
    return null;
  }

  private createCore(x: number, y: number, id: number, now: number): FluxCoreVisual {
    const color = CORE_COLORS[(id + this.round + this.random.int(0, CORE_COLORS.length - 1)) % CORE_COLORS.length];
    const floorHatch = this.scene.add.ellipse(x, y + 29, 56, 18, 0x02070d, 0.92)
      .setStrokeStyle(2, this.theme.secondary, 0.72)
      .setDepth(7);
    const hatchGlow = this.scene.add.ellipse(x, y + 29, 66, 24, color, 0.13)
      .setStrokeStyle(2, color, 0.76)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7);
    // This front lip stays above the cylinder and makes the body appear to
    // emerge through the floor instead of merely scaling into existence.
    const hatchLip = this.scene.add.ellipse(x, y + 31, 51, 14, 0x030910, 0.25)
      .setStrokeStyle(3, color, 0.76)
      .setDepth(9);
    const glow = this.scene.add.ellipse(0, 0, 56, 76, color, 0.09).setBlendMode(Phaser.BlendModes.ADD);
    const shell = this.scene.add.rectangle(0, 0, 38, 58, 0x0b1420, 0.96).setStrokeStyle(2, color, 0.94);
    const leftRail = this.scene.add.rectangle(-15, 0, 4, 50, this.theme.primary, 0.95).setStrokeStyle(1, color, 0.7);
    const rightRail = this.scene.add.rectangle(15, 0, 4, 50, this.theme.primary, 0.95).setStrokeStyle(1, color, 0.7);
    const topCap = this.scene.add.ellipse(0, -29, 39, 12, 0x15263a, 1).setStrokeStyle(2, color, 0.95);
    const bottomCap = this.scene.add.ellipse(0, 29, 39, 12, 0x07101a, 1).setStrokeStyle(2, color, 0.8);
    const window = this.scene.add.rectangle(0, -1, 24, 29, 0x01060d, 0.96).setStrokeStyle(2, color, 0.88);
    const coreGlow = this.scene.add.circle(0, -1, 10, color, 0.23).setBlendMode(Phaser.BlendModes.ADD);
    const coreOrb = this.scene.add.circle(0, -1, 5, color, 0.95).setStrokeStyle(1, 0xffffff, 0.9).setBlendMode(Phaser.BlendModes.ADD);
    const electricity = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const upperWindowShutter = this.scene.add.rectangle(0, -8, 22, 13, 0x101b29, 1)
      .setStrokeStyle(1, color, 0.84);
    const lowerWindowShutter = this.scene.add.rectangle(0, 6, 22, 13, 0x101b29, 1)
      .setStrokeStyle(1, color, 0.84);
    const label = this.scene.add.text(0, 18, 'FLUX', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '7px', color: '#d9faff'
    }).setOrigin(0.5);
    const healthBack = this.scene.add.rectangle(0, 39, 40, 4, 0x02060c, 0.95).setStrokeStyle(1, color, 0.72);
    const healthFill = this.scene.add.rectangle(-19, 39, 38, 2, color, 0.95).setOrigin(0, 0.5);
    const root = this.scene.add.container(
      x,
      y + FLUX_CORE_BALANCE.floorRiseDistance,
      [glow, shell, leftRail, rightRail, topCap, bottomCap, window, coreGlow, coreOrb, electricity, upperWindowShutter, lowerWindowShutter, label, healthBack, healthFill]
    ).setDepth(8).setScale(1, 0.12).setAlpha(0.45);
    coreGlow.setAlpha(0);
    coreOrb.setAlpha(0);
    electricity.setAlpha(0);
    const maximumHp = getFluxCoreHealth(this.round);
    return {
      id, x, y, color, hp: maximumHp, maximumHp, root, floorHatch, hatchGlow, hatchLip,
      coreGlow, coreOrb, electricity, upperWindowShutter, lowerWindowShutter, healthFill, spawnedAt: now,
      nextArcAt: 0, arcPhase: this.random.float(0, Math.PI * 2)
    };
  }

  private updateVisual(core: FluxCoreVisual, index: number, now: number): void {
    const deploymentElapsed = Math.max(0, now - core.spawnedAt);
    const riseProgress = Phaser.Math.Clamp(deploymentElapsed / FLUX_CORE_BALANCE.floorRiseMs, 0, 1);
    const easedRise = Phaser.Math.Easing.Sine.Out(riseProgress);
    const windowProgress = Phaser.Math.Clamp(
      (deploymentElapsed - FLUX_CORE_BALANCE.floorRiseMs) / FLUX_CORE_BALANCE.windowOpenMs,
      0,
      1
    );
    const easedWindow = Phaser.Math.Easing.Sine.InOut(windowProgress);
    const pulse = 0.72 + Math.sin(now * 0.008 + core.arcPhase) * 0.24;
    const idleFloat = riseProgress >= 1 ? Math.sin(now * 0.0018 + index) * 2.5 : 0;
    core.root
      .setY(core.y + (1 - easedRise) * FLUX_CORE_BALANCE.floorRiseDistance + idleFloat)
      .setScale(1, 0.12 + easedRise * 0.88)
      .setAlpha(0.45 + easedRise * 0.55);
    core.hatchGlow
      .setScale(0.86 + easedRise * 0.14 + pulse * 0.04)
      .setAlpha(0.12 + (1 - easedRise) * 0.35 + pulse * 0.08);
    core.floorHatch.setScale(0.9 + easedRise * 0.1);
    core.hatchLip.setAlpha(0.3 + easedRise * 0.5);

    core.upperWindowShutter
      .setY(-8 - easedWindow * 11)
      .setScale(1, 1 - easedWindow * 0.72)
      .setAlpha(1 - easedWindow * 0.82)
      .setVisible(windowProgress < 1);
    core.lowerWindowShutter
      .setY(6 + easedWindow * 11)
      .setScale(1, 1 - easedWindow * 0.72)
      .setAlpha(1 - easedWindow * 0.82)
      .setVisible(windowProgress < 1);
    core.coreGlow.setScale(0.88 + pulse * 0.32).setAlpha((0.16 + pulse * 0.23) * easedWindow);
    core.coreOrb
      .setFillStyle(core.color, 0.95)
      .setScale(0.9 + pulse * 0.18)
      .setAlpha((0.78 + pulse * 0.2) * easedWindow);
    core.electricity.setAlpha(easedWindow);
    if (windowProgress <= 0) return;
    if (now < core.nextArcAt) return;
    core.nextArcAt = now + 75 + this.random.int(0, 55);
    core.electricity.clear();
    core.electricity.lineStyle(1.3, core.color, 0.82);
    for (let arc = 0; arc < 3; arc += 1) {
      const startAngle = this.random.float(0, Math.PI * 2);
      const endAngle = startAngle + this.random.float(0.7, 1.8);
      core.electricity.beginPath();
      core.electricity.moveTo(Math.cos(startAngle) * 5, -1 + Math.sin(startAngle) * 5);
      core.electricity.lineTo(this.random.float(-7, 7), this.random.float(-8, 6));
      core.electricity.lineTo(Math.cos(endAngle) * 10, -1 + Math.sin(endAngle) * 10);
      core.electricity.strokePath();
    }
  }

  private updateProximityAudio(closestDistanceSquared: number): void {
    const radius = FLUX_CORE_BALANCE.proximitySoundRadius;
    if (closestDistanceSquared > radius * radius) {
      this.onProximityChanged?.(0);
      return;
    }
    const distance = Math.sqrt(closestDistanceSquared);
    const strength = Phaser.Math.Clamp(1 - distance / radius, 0, 1);
    this.onProximityChanged?.(strength);
  }

  private updateSuppressionPresentation(now: number): void {
    if (now < this.laserSuppressedUntil) {
      const remainingMs = this.laserSuppressedUntil - now;
      if (!this.recoveryAlarmPlayed && remainingMs <= FLUX_CORE_BALANCE.recoveryAlarmLeadMs) {
        this.recoveryAlarmPlayed = true;
        this.onRecoveryAlarm?.();
      }
      const warning = remainingMs <= FLUX_CORE_BALANCE.recoveryAlarmLeadMs
        ? `SECURITY GRID REBOOT // ${(remainingMs / 1000).toFixed(1)}s`
        : `FLUX CORE BREACHED // LASERS OFF ${(remainingMs / 1000).toFixed(1)}s`;
      if (this.warningText.text !== warning) this.warningText.setText(warning);
      this.warningText.setAlpha(remainingMs <= FLUX_CORE_BALANCE.recoveryAlarmLeadMs
        ? 0.64 + Math.sin(now * 0.026) * 0.28
        : 0.7);
      return;
    }
    if (now >= this.announcementUntil) this.warningText.setAlpha(0);
  }

  private applyDamage(index: number, damage: number, _source: FluxCoreDamageSource): void {
    if (!Number.isFinite(damage) || damage <= 0) return;
    const core = this.cores[index];
    if (!core) return;
    core.hp = Math.max(0, core.hp - damage);
    core.healthFill.width = 38 * (core.hp / core.maximumHp);
    core.coreOrb.setFillStyle(0xffffff, 1);
    if (core.hp > 0) return;

    const now = this.scene.time.now;
    this.cores.splice(index, 1);
    this.destroyCoreVisual(core);
    this.playDestroyedEffect(core.x, core.y, core.color);
    this.onDestroyed?.(core.x, core.y);
    // A partial clear never affects the lasers. Shutdown begins only after the
    // complete, already-planned deployment has emerged and every core is gone.
    if (this.cyclePhase === 'engaged' && this.cores.length === 0) {
      this.cyclePhase = 'shutdown';
      this.laserSuppressedUntil = now + FLUX_CORE_BALANCE.laserShutdownMs;
      this.recoveryAlarmPlayed = false;
      this.nextSpawnAt = Number.POSITIVE_INFINITY;
      this.plannedCoreCount = 0;
      this.spawnedCoreCount = 0;
    }
  }

  private playDestroyedEffect(x: number, y: number, color: number): void {
    const blast = this.scene.add.circle(x, y, 8, color, 0.45).setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.scene.add.circle(x, y, 12, 0xffffff, 0.08).setStrokeStyle(3, color, 0.95).setDepth(12);
    this.effects.add(blast);
    this.effects.add(ring);
    this.scene.tweens.add({
      targets: blast, radius: 66, alpha: 0, duration: 320,
      onComplete: () => { this.effects.delete(blast); blast.destroy(); }
    });
    this.scene.tweens.add({
      targets: ring, radius: 82, alpha: 0, duration: 380,
      onComplete: () => { this.effects.delete(ring); ring.destroy(); }
    });
  }

  private destroyCoreVisual(core: FluxCoreVisual): void {
    core.root.destroy();
    core.floorHatch.destroy();
    core.hatchGlow.destroy();
    core.hatchLip.destroy();
  }

  private rememberSpawnLocation(x: number, y: number): void {
    this.recentSpawnLocations.push({ x, y });
    if (this.recentSpawnLocations.length > FLUX_CORE_BALANCE.recentLocationMemory) {
      this.recentSpawnLocations.shift();
    }
  }
}
