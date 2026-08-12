import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';
import { GAS_HAZARD_BALANCE, getGasExposureDamage } from '../config/gasHazards';
import type { Player } from '../entities/Player';
import type { RectSpec } from '../types';
import { AIR_DROP_PATTERN_NAMES, createAirDropPattern } from './AirDropPatterns';
import { SeededRandom } from './SeededRandom';

const GAS_CLOUD_TEXTURE = 'hazard-gas-cloud-brush-v2';
const GAS_SKULL_TEXTURE = 'hazard-gas-skull-brush';
const GAS_TUNNEL_TEXTURE = 'hazard-gas-tunnel-brush';
const GAS_COLOR = 0x55ff36;

interface GasCanisterTarget {
  x: number;
  y: number;
  delayMs: number;
  released: boolean;
  showSkull: boolean;
  wispPhase: number;
  marker: Phaser.GameObjects.Arc;
  canister: Phaser.GameObjects.Container;
}

/**
 * Occasional non-blocking gas phase. One render texture holds every cloud and
 * is erased along the operative path; a coarse byte grid mirrors collision.
 */
export class GasHazardSystem {
  private readonly random: SeededRandom;
  private readonly warningText: Phaser.GameObjects.Text;
  private readonly gasLayer: Phaser.GameObjects.RenderTexture;
  private readonly cloudBrush: Phaser.GameObjects.Image;
  private readonly skullBrush: Phaser.GameObjects.Image;
  private readonly tunnelBrush: Phaser.GameObjects.Image;
  private readonly wispGraphics: Phaser.GameObjects.Graphics;
  private readonly effects = new Set<Phaser.GameObjects.GameObject>();
  private readonly densityColumns = Math.ceil(WORLD_WIDTH / GAS_HAZARD_BALANCE.densityCellSize);
  private readonly densityRows = Math.ceil(WORLD_HEIGHT / GAS_HAZARD_BALANCE.densityCellSize);
  private readonly density = new Uint8Array(this.densityColumns * this.densityRows);
  private canisters: GasCanisterTarget[] = [];
  private nextPhaseAt: number;
  private phaseStartedAt = 0;
  private phaseIndex = 0;
  private patternIndex = 0;
  private recoveryUntil = 0;
  private gasExposureUntil = 0;
  private nextGasDamageAt = 0;
  private lastWispDrawAt = -Infinity;
  private lastTunnelX = Number.NaN;
  private lastTunnelY = Number.NaN;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly round: number,
    seed: number,
    private readonly bounds: RectSpec,
    private readonly isBlocked: (x: number, y: number) => boolean,
    private readonly particlesEnabled: boolean,
    private readonly onPlayerDamaged?: (damage: number) => void
  ) {
    this.random = new SeededRandom((seed ^ Math.imul(round + 31, 0x85ebca6b) ^ 0x6a55e11) >>> 0);
    this.nextPhaseAt = scene.time.now + GAS_HAZARD_BALANCE.initialDelayMs + this.random.int(0, 5000);
    this.ensureBrushTextures();
    this.gasLayer = scene.add.renderTexture(this.bounds.x, this.bounds.y, Math.ceil(this.bounds.w), Math.ceil(this.bounds.h))
      .setOrigin(0)
      .setDepth(7)
      .setVisible(false);
    this.cloudBrush = scene.make.image({ x: 0, y: 0, key: GAS_CLOUD_TEXTURE, add: false }).setOrigin(0.5);
    this.skullBrush = scene.make.image({ x: 0, y: 0, key: GAS_SKULL_TEXTURE, add: false }).setOrigin(0.5);
    this.tunnelBrush = scene.make.image({ x: 0, y: 0, key: GAS_TUNNEL_TEXTURE, add: false }).setOrigin(0.5);
    this.wispGraphics = scene.add.graphics().setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.warningText = scene.add.text(scene.scale.width * 0.5, 248, '', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '17px',
      color: '#8cff73',
      stroke: '#041008',
      strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1050).setAlpha(0);
  }

  get active(): boolean {
    return this.canisters.length > 0;
  }

  isLaserSuppressed(now: number): boolean {
    return this.active || now < this.recoveryUntil;
  }

  update(now: number, player: Player, gasDamageMultiplier = 1): void {
    const config = GAS_HAZARD_BALANCE;
    if (this.round < config.unlockRound) return;

    if (!this.active) {
      this.gasLayer.setVisible(false);
      if (now < this.recoveryUntil) {
        const remaining = Math.max(0, (this.recoveryUntil - now) / 1000);
        const warning = `ATMOSPHERE CLEAR // LASER GRID RESET ${remaining.toFixed(1)}s`;
        if (this.warningText.text !== warning) this.warningText.setText(warning);
        this.warningText.setAlpha(0.46);
        return;
      }
      this.warningText.setAlpha(0);
      if (now < this.nextPhaseAt) return;
      this.startPhase(now);
      if (!this.active) {
        this.nextPhaseAt = now + config.minimumCooldownMs;
        return;
      }
    }

    const elapsed = now - this.phaseStartedAt;
    const finalDelay = this.canisters.at(-1)?.delayMs ?? 0;
    const allReleasedAt = config.telegraphMs + config.fallMs + finalDelay;
    const dissipateAt = allReleasedAt + config.activeMs;
    const finishAt = dissipateAt + config.dissipateMs;

    if (elapsed < config.telegraphMs) {
      const remaining = Math.max(0, (config.telegraphMs - elapsed) / 1000);
      const warning = `GAS CANISTER DROP: ${AIR_DROP_PATTERN_NAMES[this.patternIndex]}  ${remaining.toFixed(1)}s`;
      if (this.warningText.text !== warning) this.warningText.setText(warning);
      this.warningText.setAlpha(0.62 + Math.sin(now * 0.021) * 0.22);
    } else if (elapsed < dissipateAt) {
      const warning = 'NEON GAS RELEASE // MOVE TO CARVE AN ESCAPE PATH';
      if (this.warningText.text !== warning) this.warningText.setText(warning);
      this.warningText.setAlpha(0.78);
    } else {
      const warning = 'NEON GAS DISSIPATING';
      if (this.warningText.text !== warning) this.warningText.setText(warning);
      this.warningText.setAlpha(0.58);
    }

    for (let index = 0; index < this.canisters.length; index += 1) {
      const target = this.canisters[index];
      const dropElapsed = elapsed - config.telegraphMs - target.delayMs;
      const fallProgress = Phaser.Math.Clamp(dropElapsed / config.fallMs, 0, 1);
      const pulse = 0.72 + Math.sin(now * 0.02 + index * 0.63) * 0.18;
      target.marker.setScale(pulse).setAlpha(target.released ? 0 : 0.22 + fallProgress * 0.55);
      target.canister
        .setPosition(target.x, target.y - config.fallHeight * (1 - fallProgress))
        .setRotation(now * 0.006 + index * 0.7)
        .setAlpha(dropElapsed < 0 || target.released ? 0 : 0.3 + fallProgress * 0.7);
      if (!target.released && dropElapsed >= config.fallMs) this.releaseGas(target);
    }

    if (this.gasLayer.visible) {
      const dissipateProgress = elapsed <= dissipateAt
        ? 0
        : Phaser.Math.Clamp((elapsed - dissipateAt) / config.dissipateMs, 0, 1);
      this.updateGasAnimation(now, dissipateProgress);
      const playerEnteredGas = this.hasGasAt(player.x, player.y);
      if (playerEnteredGas && dissipateProgress < 0.95) {
        this.gasExposureUntil = now + config.damageRetryWindowMs;
      }
      if (now <= this.gasExposureUntil && now >= this.nextGasDamageAt) {
        const damage = getGasExposureDamage(this.round)
          * Math.max(0.05, gasDamageMultiplier)
          * (1 - dissipateProgress);
        if (damage > 0 && player.takeDamage(damage)) {
          this.onPlayerDamaged?.(damage);
          this.nextGasDamageAt = now + config.damageTickIntervalMs;
          this.gasExposureUntil = 0;
        }
      }
      this.carvePlayerTunnel(player.x, player.y);
    }

    if (elapsed >= finishAt) this.finishPhase(now);
  }

  destroy(): void {
    this.clearCanisters();
    for (const effect of this.effects) {
      this.scene.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.effects.clear();
    this.warningText.destroy();
    this.gasLayer.destroy();
    this.wispGraphics.destroy();
    this.cloudBrush.destroy();
    this.skullBrush.destroy();
    this.tunnelBrush.destroy();
    this.density.fill(0);
  }

  private ensureBrushTextures(): void {
    const config = GAS_HAZARD_BALANCE;
    if (!this.scene.textures.exists(GAS_CLOUD_TEXTURE)) {
      const size = config.cloudRadius * 2;
      const center = size * 0.5;
      const graphics = this.scene.make.graphics({ x: 0, y: 0 });
      const lobes = [
        [0, 0, 0.72], [-0.38, 0.08, 0.5], [0.34, -0.13, 0.54],
        [-0.2, -0.34, 0.4], [0.16, 0.34, 0.45], [-0.5, -0.28, 0.29],
        [0.53, 0.22, 0.32], [0.02, -0.55, 0.28], [-0.04, 0.56, 0.3]
      ] as const;
      for (const [offsetX, offsetY, scale] of lobes) {
        const x = center + offsetX * config.cloudRadius;
        const y = center + offsetY * config.cloudRadius;
        const radius = config.cloudRadius * scale;
        graphics.fillStyle(0x37d72d, 0.055);
        graphics.fillCircle(x, y, radius);
        graphics.fillStyle(GAS_COLOR, 0.075);
        graphics.fillCircle(x - radius * 0.04, y + radius * 0.03, radius * 0.78);
        graphics.fillStyle(0xb5ff65, 0.055);
        graphics.fillCircle(x + radius * 0.08, y - radius * 0.08, radius * 0.52);
      }
      graphics.generateTexture(GAS_CLOUD_TEXTURE, size, size);
      graphics.destroy();
    }
    if (!this.scene.textures.exists(GAS_SKULL_TEXTURE)) {
      const size = 128;
      const graphics = this.scene.make.graphics({ x: 0, y: 0 });
      graphics.lineStyle(8, 0xb8ff79, 0.34);
      graphics.lineBetween(22, 106, 106, 32);
      graphics.lineBetween(22, 32, 106, 106);
      for (const [x, y] of [[20, 108], [108, 30], [20, 30], [108, 108]] as const) {
        graphics.fillStyle(0xb8ff79, 0.28);
        graphics.fillCircle(x, y, 8);
      }
      graphics.fillStyle(0x64ef3c, 0.18);
      graphics.fillCircle(64, 55, 34);
      graphics.fillRect(42, 55, 44, 31);
      graphics.lineStyle(4, 0xd9ffa5, 0.45);
      graphics.strokeCircle(64, 55, 34);
      graphics.strokeRect(42, 55, 44, 31);
      graphics.fillStyle(0x07150a, 0.75);
      graphics.fillCircle(52, 55, 8);
      graphics.fillCircle(76, 55, 8);
      graphics.fillTriangle(64, 62, 58, 73, 70, 73);
      graphics.lineStyle(3, 0x07150a, 0.72);
      graphics.lineBetween(53, 76, 53, 86);
      graphics.lineBetween(64, 76, 64, 86);
      graphics.lineBetween(75, 76, 75, 86);
      graphics.generateTexture(GAS_SKULL_TEXTURE, size, size);
      graphics.destroy();
    }
    if (!this.scene.textures.exists(GAS_TUNNEL_TEXTURE)) {
      const size = config.tunnelRadius * 2;
      const graphics = this.scene.make.graphics({ x: 0, y: 0 });
      graphics.fillStyle(0xffffff, 1);
      graphics.fillCircle(size * 0.5, size * 0.5, config.tunnelRadius);
      graphics.generateTexture(GAS_TUNNEL_TEXTURE, size, size);
      graphics.destroy();
    }
  }

  private startPhase(now: number): void {
    const config = GAS_HAZARD_BALANCE;
    this.phaseStartedAt = now;
    this.patternIndex = (this.phaseIndex + this.random.int(0, AIR_DROP_PATTERN_NAMES.length - 1)) % AIR_DROP_PATTERN_NAMES.length;
    const count = Math.min(
      config.maximumCanisters,
      config.minimumCanisters + Math.floor((this.round - config.unlockRound) / config.roundsPerAdditionalCanister)
    );
    const points = createAirDropPattern({
      pattern: this.patternIndex,
      count,
      bounds: this.bounds,
      safeEdgeInset: config.safeEdgeInset,
      minimumSpacing: 110,
      random: this.random,
      isBlocked: this.isBlocked
    });
    this.density.fill(0);
    this.gasLayer.clear().setAlpha(0.9).setVisible(false);
    this.wispGraphics.clear().setAlpha(1);
    this.lastTunnelX = Number.NaN;
    this.lastTunnelY = Number.NaN;
    this.gasExposureUntil = 0;
    this.nextGasDamageAt = 0;
    this.lastWispDrawAt = -Infinity;
    this.canisters = points.map((point, index) => {
      const marker = this.scene.add.circle(point.x, point.y, 31, GAS_COLOR, 0.06)
        .setStrokeStyle(3, GAS_COLOR, 0.9)
        .setDepth(6);
      const shell = this.scene.add.rectangle(0, 0, 18, 34, 0x0b2410, 1).setStrokeStyle(3, GAS_COLOR, 0.95);
      const capTop = this.scene.add.rectangle(0, -19, 12, 5, 0xc8ff82, 0.95);
      const capBottom = this.scene.add.rectangle(0, 19, 12, 5, 0x45d82d, 0.95);
      const core = this.scene.add.circle(0, 0, 5, GAS_COLOR, 0.9).setStrokeStyle(2, 0xeaffbd, 0.9);
      const canister = this.scene.add.container(point.x, point.y - config.fallHeight, [shell, capTop, capBottom, core])
        .setDepth(9)
        .setAlpha(0);
      return {
        ...point,
        delayMs: index * config.staggerMs,
        released: false,
        showSkull: index % 3 === 0,
        wispPhase: this.random.float(0, Math.PI * 2),
        marker,
        canister
      };
    });
  }

  private releaseGas(target: GasCanisterTarget): void {
    target.released = true;
    target.marker.setAlpha(0);
    target.canister.setAlpha(0);
    this.cloudBrush.setPosition(target.x - this.bounds.x, target.y - this.bounds.y);
    this.gasLayer.draw(this.cloudBrush).setVisible(true);
    if (target.showSkull) {
      this.skullBrush
        .setPosition(target.x - this.bounds.x, target.y - this.bounds.y)
        .setRotation(target.wispPhase * 0.16)
        .setScale(0.92 + Math.sin(target.wispPhase) * 0.08);
      this.gasLayer.draw(this.skullBrush);
    }
    this.stampDensity(target.x, target.y, GAS_HAZARD_BALANCE.cloudRadius);

    const ring = this.scene.add.circle(target.x, target.y, 12, GAS_COLOR, 0.1)
      .setStrokeStyle(4, 0xb6ff70, 0.92)
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.effects.add(ring);
    this.scene.tweens.add({
      targets: ring,
      radius: GAS_HAZARD_BALANCE.cloudRadius * 0.78,
      alpha: 0,
      duration: 620,
      onComplete: () => { this.effects.delete(ring); ring.destroy(); }
    });
    if (!this.particlesEnabled) return;
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI * 0.5 + 0.4;
      const puff = this.scene.add.circle(target.x, target.y, 8, GAS_COLOR, 0.38).setDepth(8);
      this.effects.add(puff);
      this.scene.tweens.add({
        targets: puff,
        x: target.x + Math.cos(angle) * 95,
        y: target.y + Math.sin(angle) * 95,
        radius: 32,
        alpha: 0,
        duration: 700,
        onComplete: () => { this.effects.delete(puff); puff.destroy(); }
      });
    }
  }

  private stampDensity(x: number, y: number, radius: number): void {
    const cellSize = GAS_HAZARD_BALANCE.densityCellSize;
    const minimumColumn = Math.max(0, Math.floor((x - radius) / cellSize));
    const maximumColumn = Math.min(this.densityColumns - 1, Math.floor((x + radius) / cellSize));
    const minimumRow = Math.max(0, Math.floor((y - radius) / cellSize));
    const maximumRow = Math.min(this.densityRows - 1, Math.floor((y + radius) / cellSize));
    const radiusSquared = radius * radius;
    for (let row = minimumRow; row <= maximumRow; row += 1) {
      const cellY = (row + 0.5) * cellSize;
      for (let column = minimumColumn; column <= maximumColumn; column += 1) {
        const cellX = (column + 0.5) * cellSize;
        const dx = cellX - x;
        const dy = cellY - y;
        if (dx * dx + dy * dy <= radiusSquared) this.density[row * this.densityColumns + column] = 255;
      }
    }
  }

  /** Redraws a small fixed set of drifting wisps at 12.5 Hz, not every frame. */
  private updateGasAnimation(now: number, dissipateProgress: number): void {
    const fade = 1 - dissipateProgress;
    const breathing = 0.82 + Math.sin(now * 0.0018) * 0.08 + Math.sin(now * 0.00071) * 0.04;
    this.gasLayer.setAlpha(breathing * fade);
    if (now - this.lastWispDrawAt < 80) {
      this.wispGraphics.setAlpha(fade);
      return;
    }
    this.lastWispDrawAt = now;
    this.wispGraphics.clear().setAlpha(fade);
    const time = now * 0.00032;
    for (let index = 0; index < this.canisters.length; index += 1) {
      const target = this.canisters[index];
      if (!target.released) continue;
      for (let wisp = 0; wisp < 3; wisp += 1) {
        const direction = wisp % 2 === 0 ? 1 : -1;
        const angle = target.wispPhase + wisp * 2.094 + time * direction;
        const orbit = GAS_HAZARD_BALANCE.cloudRadius * (0.14 + wisp * 0.075);
        const x = target.x + Math.cos(angle) * orbit;
        const y = target.y + Math.sin(angle * 1.17) * orbit * 0.64 - Math.sin(time * 1.7 + target.wispPhase) * 18;
        if (!this.hasGasAt(x, y)) continue;
        const radius = 24 + wisp * 7 + Math.sin(time * 2.3 + index + wisp) * 5;
        this.wispGraphics.fillStyle(wisp === 1 ? 0xb8ff68 : GAS_COLOR, 0.045);
        this.wispGraphics.fillCircle(x, y, radius);
        this.wispGraphics.fillStyle(0xd7ffa3, 0.026);
        this.wispGraphics.fillCircle(x - radius * 0.18, y - radius * 0.16, radius * 0.58);
      }
    }
  }

  private carvePlayerTunnel(x: number, y: number): void {
    const radius = GAS_HAZARD_BALANCE.tunnelRadius;
    if (!Number.isFinite(this.lastTunnelX) || !Number.isFinite(this.lastTunnelY)) {
      this.eraseTunnelAt(x, y);
      this.lastTunnelX = x;
      this.lastTunnelY = y;
      return;
    }
    const dx = x - this.lastTunnelX;
    const dy = y - this.lastTunnelY;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.min(12, Math.ceil(distance / (radius * 0.55))));
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      this.eraseTunnelAt(this.lastTunnelX + dx * progress, this.lastTunnelY + dy * progress);
    }
    this.lastTunnelX = x;
    this.lastTunnelY = y;
  }

  private eraseTunnelAt(x: number, y: number): void {
    this.tunnelBrush.setPosition(x - this.bounds.x, y - this.bounds.y);
    this.gasLayer.erase(this.tunnelBrush);
    const radius = GAS_HAZARD_BALANCE.tunnelRadius;
    const cellSize = GAS_HAZARD_BALANCE.densityCellSize;
    const minimumColumn = Math.max(0, Math.floor((x - radius) / cellSize));
    const maximumColumn = Math.min(this.densityColumns - 1, Math.floor((x + radius) / cellSize));
    const minimumRow = Math.max(0, Math.floor((y - radius) / cellSize));
    const maximumRow = Math.min(this.densityRows - 1, Math.floor((y + radius) / cellSize));
    const radiusSquared = radius * radius;
    for (let row = minimumRow; row <= maximumRow; row += 1) {
      const cellY = (row + 0.5) * cellSize;
      for (let column = minimumColumn; column <= maximumColumn; column += 1) {
        const cellX = (column + 0.5) * cellSize;
        const dx = cellX - x;
        const dy = cellY - y;
        if (dx * dx + dy * dy <= radiusSquared) this.density[row * this.densityColumns + column] = 0;
      }
    }
  }

  private hasGasAt(x: number, y: number): boolean {
    const cellSize = GAS_HAZARD_BALANCE.densityCellSize;
    const column = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (column < 0 || column >= this.densityColumns || row < 0 || row >= this.densityRows) return false;
    return this.density[row * this.densityColumns + column] > 0;
  }

  private finishPhase(now: number): void {
    const config = GAS_HAZARD_BALANCE;
    this.clearCanisters();
    this.gasLayer.clear().setVisible(false);
    this.wispGraphics.clear();
    this.density.fill(0);
    this.warningText.setAlpha(0);
    this.recoveryUntil = now + config.laserRecoveryDelayMs;
    const cooldown = Math.max(
      config.minimumCooldownMs,
      config.baseCooldownMs - Math.max(0, this.round - config.unlockRound) * config.cooldownReductionPerRoundMs
    );
    this.nextPhaseAt = this.recoveryUntil + cooldown + this.random.int(0, config.cooldownVarianceMs);
    this.phaseIndex += 1;
  }

  private clearCanisters(): void {
    for (const target of this.canisters) {
      target.marker.destroy();
      target.canister.destroy();
    }
    this.canisters = [];
    this.wispGraphics.clear();
    this.gasExposureUntil = 0;
    this.lastTunnelX = Number.NaN;
    this.lastTunnelY = Number.NaN;
  }
}
