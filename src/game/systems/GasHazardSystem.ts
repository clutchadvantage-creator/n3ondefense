import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';
import { GAS_HAZARD_BALANCE, getGasExposureDamage } from '../config/gasHazards';
import type { Player } from '../entities/Player';
import type { RectSpec } from '../types';
import { AIR_DROP_PATTERN_NAMES, createAirDropPattern } from './AirDropPatterns';
import { SeededRandom } from './SeededRandom';
import { drawBakedShadow, drawLayeredPanel, drawMechanicalRivets } from '../rendering/LayeredArtPrimitives.ts';

const GAS_CLOUD_TEXTURE = 'hazard-gas-cloud-brush-v2';
const GAS_SKULL_TEXTURE = 'hazard-gas-skull-brush';
const GAS_TUNNEL_TEXTURE = 'hazard-gas-tunnel-brush';
const GAS_CANISTER_TEXTURE = 'hazard-gas-canister-v3';
const GAS_COLOR = 0x55ff36;

interface GasCanisterTarget {
  x: number;
  y: number;
  delayMs: number;
  released: boolean;
  showSkull: boolean;
  wispPhase: number;
  marker: Phaser.GameObjects.Arc;
  canister: Phaser.GameObjects.Image;
}

interface GasIgnitionState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  startedAt: number;
  lastEraseRadius: number;
  primaryColor: number;
  secondaryColor: number;
}

interface GasImpactBurstState {
  active: boolean;
  x: number;
  y: number;
  startedAt: number;
}

const MAX_CONCURRENT_GAS_IGNITIONS = 6;

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
  private readonly impactGraphics: Phaser.GameObjects.Graphics;
  private readonly ignitionGraphics: Phaser.GameObjects.Graphics;
  private readonly ignitionStates: GasIgnitionState[];
  private readonly impactStates: GasImpactBurstState[];
  /** Canister presentation is prewarmed and reused across every gas phase. */
  private readonly canisterPool: GasCanisterTarget[];
  private readonly densityColumns = Math.ceil(WORLD_WIDTH / GAS_HAZARD_BALANCE.densityCellSize);
  private readonly densityRows = Math.ceil(WORLD_HEIGHT / GAS_HAZARD_BALANCE.densityCellSize);
  /** Persistent logical footprint: tunneling never removes gas exposure. */
  private readonly density = new Uint8Array(this.densityColumns * this.densityRows);
  /** Visual-only mask used to keep animated wisps out of carved tunnels. */
  private readonly tunnelMask = new Uint8Array(this.densityColumns * this.densityRows);
  private readonly canisters: GasCanisterTarget[] = [];
  private nextPhaseAt: number;
  private phaseStartedAt = 0;
  private phaseIndex = 0;
  private patternIndex = 0;
  private releasedCanisterCount = 0;
  private recoveryUntil = 0;
  private nextGasDamageAt = 0;
  private lastWispDrawAt = -Infinity;
  private lastTunnelX = Number.NaN;
  private lastTunnelY = Number.NaN;
  private impactPresentationVisible = false;
  private ignitionPresentationVisible = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly round: number,
    seed: number,
    private readonly bounds: RectSpec,
    private readonly isBlocked: (x: number, y: number) => boolean,
    private readonly particlesEnabled: boolean,
    private readonly onPlayerDamaged?: (damage: number) => void,
    private readonly onGasReleased?: () => void,
    private readonly onCanisterImpact?: () => void
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
    this.impactGraphics = scene.add.graphics().setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.ignitionGraphics = scene.add.graphics().setDepth(10).setBlendMode(Phaser.BlendModes.ADD);
    this.impactStates = Array.from({ length: GAS_HAZARD_BALANCE.maximumCanisters }, () => ({
      active: false, x: 0, y: 0, startedAt: 0
    }));
    this.ignitionStates = Array.from({ length: MAX_CONCURRENT_GAS_IGNITIONS }, (): GasIgnitionState => ({
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      startedAt: 0,
      lastEraseRadius: 0,
      primaryColor: 0xff9d24,
      secondaryColor: 0xe9ff38
    }));
    this.canisterPool = Array.from(
      { length: GAS_HAZARD_BALANCE.maximumCanisters },
      () => this.createCanisterSlot()
    );
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

  get visualGasActive(): boolean {
    return this.gasLayer.visible;
  }

  isLaserSuppressed(now: number): boolean {
    return this.active || now < this.recoveryUntil;
  }

  /**
   * Low-cost moving-entity tunnel. The byte-grid gate ensures each gas cell is
   * erased once even when thousands of projectiles reuse the same route.
   */
  carveVisualTunnel(x: number, y: number, radius: number): boolean {
    if (!this.gasLayer.visible || !this.hasVisibleGasAt(x, y)) return false;
    this.eraseGasAt(x, y, radius, false);
    return true;
  }

  /** Explosive displacement checks the full blast, not only its center cell. */
  carveVisualBlast(x: number, y: number, radius: number): boolean {
    if (!this.gasLayer.visible || !this.hasVisibleGasWithin(x, y, radius)) return false;
    this.eraseGasAt(x, y, radius, false);
    return true;
  }

  /** Mines consume both the visual cloud and persistent damage footprint. */
  igniteFromMine(
    x: number,
    y: number,
    mineRadius: number,
    primaryColor = 0xff9d24,
    secondaryColor = 0xe9ff38
  ): boolean {
    if (!this.gasLayer.visible || !this.hasGasAt(x, y)) return false;
    const ignitionRadius = mineRadius * GAS_HAZARD_BALANCE.mineIgnitionRadiusMultiplier;
    // Damage disappears immediately across the same authoritative footprint as
    // before; only the RenderTexture erasure is staged behind the burn front.
    this.clearGasHazardAt(x, y, ignitionRadius);
    this.startIgnitionBurn(x, y, ignitionRadius, primaryColor, secondaryColor);
    return true;
  }

  update(now: number, player: Player, gasDamageMultiplier = 1): void {
    const config = GAS_HAZARD_BALANCE;
    if (this.round < config.unlockRound) return;
    this.updateIgnitionBurns(now);
    this.updateImpactBursts(now);

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
      if (playerEnteredGas && now >= this.nextGasDamageAt) {
        const damage = getGasExposureDamage(this.round)
          * Math.max(0.05, gasDamageMultiplier);
        if (damage > 0 && player.takeDamage(damage)) {
          this.onPlayerDamaged?.(damage);
          this.nextGasDamageAt = now + config.damageTickIntervalMs;
        }
      }
      this.carvePlayerTunnel(player.x, player.y);
    }

    if (elapsed >= finishAt) this.finishPhase(now);
  }

  destroy(): void {
    this.clearCanisters();
    for (const target of this.canisterPool) {
      target.marker.destroy();
      target.canister.destroy();
    }
    this.canisterPool.length = 0;
    this.resetIgnitionBurns();
    this.resetImpactBursts();
    this.warningText.destroy();
    this.gasLayer.destroy();
    this.wispGraphics.destroy();
    this.impactGraphics.destroy();
    this.ignitionGraphics.destroy();
    this.cloudBrush.destroy();
    this.skullBrush.destroy();
    this.tunnelBrush.destroy();
    this.density.fill(0);
    this.tunnelMask.fill(0);
  }

  /** Starts the production gas path immediately, but is unreachable in production builds. */
  forcePhaseForDevelopment(now: number): boolean {
    if (!import.meta.env.DEV || this.round < GAS_HAZARD_BALANCE.unlockRound) return false;
    this.clearCanisters();
    this.startPhase(now);
    return this.active;
  }

  /** Exercises the real mine-ignition path against an already released DEV cloud. */
  igniteFirstCloudForDevelopment(mineRadius: number): boolean {
    if (!import.meta.env.DEV) return false;
    for (const target of this.canisters) {
      if (target.released) return this.igniteFromMine(target.x, target.y, mineRadius);
    }
    return false;
  }

  diagnostics(): Readonly<{
    activeCanisters: number;
    pooledCanisters: number;
    activeImpacts: number;
    activeIgnitions: number;
  }> {
    let activeImpacts = 0;
    let activeIgnitions = 0;
    for (const state of this.impactStates) if (state.active) activeImpacts += 1;
    for (const state of this.ignitionStates) if (state.active) activeIgnitions += 1;
    return {
      activeCanisters: this.canisters.length,
      pooledCanisters: this.canisterPool.length,
      activeImpacts,
      activeIgnitions
    };
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
    if (!this.scene.textures.exists(GAS_CANISTER_TEXTURE)) {
      const graphics = this.scene.make.graphics({ x: 0, y: 0 });
      graphics.fillStyle(0x000000, 0).fillRect(0, 0, 52, 78);
      drawBakedShadow(graphics, 29, 70, 38, 10, 0.34);
      drawLayeredPanel(graphics, [
        { x: 12, y: 16 }, { x: 36, y: 12 }, { x: 43, y: 20 }, { x: 43, y: 62 },
        { x: 34, y: 68 }, { x: 12, y: 64 }
      ], 0x163323, 0x041008, 2.2);
      drawLayeredPanel(graphics, [
        { x: 12, y: 16 }, { x: 34, y: 13 }, { x: 36, y: 63 }, { x: 12, y: 64 }
      ], 0x335342, 0x07150c, 1.3);
      drawLayeredPanel(graphics, [
        { x: 34, y: 13 }, { x: 43, y: 20 }, { x: 43, y: 62 }, { x: 36, y: 63 }
      ], 0x0a2015, 0x07150c, 1.3);
      graphics.fillStyle(0x64756a, 1).fillEllipse(27, 15, 31, 10);
      graphics.lineStyle(2, 0xc2d0c7, 0.8).strokeEllipse(27, 15, 31, 10);
      graphics.fillStyle(0x233b2e, 1).fillEllipse(27, 63, 31, 9);
      for (const y of [24, 55]) {
        graphics.fillStyle(0x718479, 0.95).fillRect(10, y, 33, 5);
        graphics.lineStyle(1, 0xc7d5cc, 0.75).strokeRect(10, y, 33, 5);
      }
      graphics.fillStyle(0x111b17, 1).fillRoundedRect(17, 31, 20, 18, 4);
      graphics.lineStyle(2, GAS_COLOR, 0.92).strokeRoundedRect(17, 31, 20, 18, 4);
      graphics.fillStyle(0x48e832, 0.72).fillEllipse(27, 40, 13, 11);
      graphics.fillStyle(0xd9ff9d, 0.8).fillEllipse(24, 37, 4, 3);
      graphics.fillStyle(0xb7c7bc, 1).fillRect(22, 5, 10, 8);
      graphics.fillStyle(0x24322b, 1).fillRect(19, 2, 16, 5);
      graphics.lineStyle(1.3, 0xe4eee8, 0.85).strokeRect(19, 2, 16, 5);
      graphics.lineStyle(1, GAS_COLOR, 0.58).lineBetween(14, 30, 14, 52).lineBetween(39, 30, 39, 52);
      drawMechanicalRivets(graphics, [{ x: 14, y: 20 }, { x: 39, y: 21 }, { x: 14, y: 59 }, { x: 39, y: 58 }], 0xd9e4dd, 0x08100b, 1.25);
      graphics.generateTexture(GAS_CANISTER_TEXTURE, 52, 78);
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
    this.tunnelMask.fill(0);
    this.resetIgnitionBurns();
    this.resetImpactBursts();
    this.gasLayer.clear().setAlpha(0.9).setVisible(false);
    this.wispGraphics.clear().setAlpha(1);
    this.lastTunnelX = Number.NaN;
    this.lastTunnelY = Number.NaN;
    this.nextGasDamageAt = 0;
    this.lastWispDrawAt = -Infinity;
    this.releasedCanisterCount = 0;
    this.canisters.length = 0;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const target = this.canisterPool[index];
      target.x = point.x;
      target.y = point.y;
      target.delayMs = index * config.staggerMs;
      target.released = false;
      target.showSkull = index % 3 === 0;
      target.wispPhase = this.random.float(0, Math.PI * 2);
      target.marker
        .setPosition(point.x, point.y)
        .setScale(1)
        .setAlpha(0.06)
        .setVisible(true)
        .setActive(true);
      target.canister
        .setPosition(point.x, point.y - config.fallHeight)
        .setRotation(0)
        .setAlpha(0)
        .setVisible(true)
        .setActive(true);
      this.canisters.push(target);
    }
  }

  private createCanisterSlot(): GasCanisterTarget {
    const marker = this.scene.add.circle(0, 0, 31, GAS_COLOR, 0.06)
      .setStrokeStyle(3, GAS_COLOR, 0.9)
      .setDepth(6)
      .setVisible(false)
      .setActive(false);
    const canister = this.scene.add.image(0, 0, GAS_CANISTER_TEXTURE)
      .setDepth(9)
      .setAlpha(0)
      .setVisible(false)
      .setActive(false);
    return {
      x: 0,
      y: 0,
      delayMs: 0,
      released: false,
      showSkull: false,
      wispPhase: 0,
      marker,
      canister
    };
  }

  private releaseGas(target: GasCanisterTarget): void {
    target.released = true;
    this.releasedCanisterCount += 1;
    this.onCanisterImpact?.();
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
    if (this.releasedCanisterCount === this.canisters.length) this.onGasReleased?.();

    this.startImpactBurst(target.x, target.y);
  }

  private startImpactBurst(x: number, y: number): void {
    let state = this.impactStates[0];
    for (const candidate of this.impactStates) {
      if (!candidate.active) { state = candidate; break; }
      if (candidate.startedAt < state.startedAt) state = candidate;
    }
    state.active = true;
    state.x = x;
    state.y = y;
    state.startedAt = this.scene.time.now;
  }

  /** One bounded graphics batch replaces per-impact circles and five tweens. */
  private updateImpactBursts(now: number): void {
    let hasActiveState = false;
    for (const state of this.impactStates) {
      if (!state.active) continue;
      if (now - state.startedAt >= 700) state.active = false;
      else hasActiveState = true;
    }
    if (!hasActiveState) {
      if (this.impactPresentationVisible) this.impactGraphics.clear();
      this.impactPresentationVisible = false;
      return;
    }
    this.impactGraphics.clear();
    this.impactPresentationVisible = true;
    for (let stateIndex = 0; stateIndex < this.impactStates.length; stateIndex += 1) {
      const state = this.impactStates[stateIndex];
      if (!state.active) continue;
      const progress = Phaser.Math.Clamp((now - state.startedAt) / 700, 0, 1);
      if (progress >= 1) { state.active = false; continue; }
      const eased = 1 - (1 - progress) ** 3;
      const fade = (1 - progress) ** 1.35;
      const ringRadius = 12 + GAS_HAZARD_BALANCE.cloudRadius * 0.72 * eased;
      this.impactGraphics.lineStyle(8, GAS_COLOR, 0.1 * fade).strokeCircle(state.x, state.y, ringRadius);
      this.impactGraphics.lineStyle(3, 0xcaff83, 0.86 * fade).strokeCircle(state.x, state.y, ringRadius);
      if (!this.particlesEnabled) continue;
      for (let puff = 0; puff < 4; puff += 1) {
        const angle = puff * Math.PI * 0.5 + 0.4 + stateIndex * 0.11;
        const travel = 95 * eased;
        const radius = 8 + 24 * eased;
        const x = state.x + Math.cos(angle) * travel;
        const y = state.y + Math.sin(angle) * travel;
        this.impactGraphics.fillStyle(puff % 2 === 0 ? GAS_COLOR : 0xb7ff64, 0.3 * fade).fillCircle(x, y, radius);
      }
    }
  }

  private resetImpactBursts(): void {
    for (const state of this.impactStates) state.active = false;
    this.impactGraphics.clear();
    this.impactPresentationVisible = false;
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
        if (dx * dx + dy * dy <= radiusSquared) {
          const densityIndex = row * this.densityColumns + column;
          this.density[densityIndex] = 255;
          this.tunnelMask[densityIndex] = 0;
        }
      }
    }
  }

  /** Redraws a fixed, bounded set of drifting wisps at 12.5 Hz, not every frame. */
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
      for (let wisp = 0; wisp < (this.particlesEnabled ? 5 : 3); wisp += 1) {
        const direction = wisp % 2 === 0 ? 1 : -1;
        const angle = target.wispPhase + wisp * 1.257 + time * direction * (0.8 + wisp * 0.07);
        const orbit = GAS_HAZARD_BALANCE.cloudRadius * (0.12 + wisp * 0.052);
        const x = target.x + Math.cos(angle) * orbit;
        const y = target.y + Math.sin(angle * 1.17) * orbit * 0.64 - Math.sin(time * 1.7 + target.wispPhase) * 18;
        if (!this.hasVisibleGasAt(x, y)) continue;
        const radius = 22 + wisp * 5.5 + Math.sin(time * 2.3 + index + wisp) * 5;
        this.wispGraphics.fillStyle(wisp % 3 === 1 ? 0xb8ff68 : GAS_COLOR, 0.043);
        this.wispGraphics.fillCircle(x, y, radius);
        this.wispGraphics.fillStyle(0xd7ffa3, 0.026);
        this.wispGraphics.fillCircle(x - radius * 0.18, y - radius * 0.16, radius * 0.58);
        this.wispGraphics.lineStyle(1.2, wisp % 2 === 0 ? 0xbfff65 : GAS_COLOR, 0.11);
        this.wispGraphics.beginPath();
        this.wispGraphics.arc(x, y, radius * 0.86, angle, angle + 2.4, false);
        this.wispGraphics.strokePath();
      }
      this.drawGasBubbles(target, index, now, time);
    }
  }

  /** Batched toxic pockets per cloud; no sprites, tweens, physics, or allocations. */
  private drawGasBubbles(target: GasCanisterTarget, cloudIndex: number, now: number, time: number): void {
    const bubbleCount = this.particlesEnabled ? 5 : 3;
    for (let bubble = 0; bubble < bubbleCount; bubble += 1) {
      const phase = target.wispPhase + bubble * 2.17 + cloudIndex * 0.43;
      const orbit = GAS_HAZARD_BALANCE.cloudRadius * (0.13 + bubble * 0.065);
      const x = target.x + Math.sin(time * (1.1 + bubble * 0.08) + phase) * orbit;
      const y = target.y
        + Math.sin(time * (1.55 + bubble * 0.11) + phase * 1.31) * orbit * 0.72
        - Math.sin(time * 0.47 + phase) * 24;
      if (!this.hasVisibleGasAt(x, y)) continue;
      const pulse = 0.72 + Math.sin(now * 0.0055 + phase) * 0.28;
      const radius = (4.5 + bubble * 1.8) * pulse;
      const color = bubble % 2 === 0 ? 0xbfff37 : 0x64ff52;
      this.wispGraphics.fillStyle(color, 0.16 + pulse * 0.08);
      this.wispGraphics.fillCircle(x, y, radius);
      this.wispGraphics.lineStyle(1.5, bubble % 2 === 0 ? 0xf1ff72 : 0xafff68, 0.4);
      this.wispGraphics.strokeCircle(x, y, radius + 1.5);
      this.wispGraphics.fillStyle(0xf1ffb0, 0.3);
      this.wispGraphics.fillCircle(x - radius * 0.3, y - radius * 0.34, Math.max(1, radius * 0.2));
      if (bubble % 2 === 0) {
        const tail = 5 + bubble * 1.5;
        this.wispGraphics.lineStyle(1, color, 0.16 + pulse * 0.08)
          .lineBetween(x, y + radius, x - Math.sin(phase) * tail, y + radius + tail);
      }
    }
  }

  private carvePlayerTunnel(x: number, y: number): void {
    const radius = GAS_HAZARD_BALANCE.tunnelRadius;
    if (!Number.isFinite(this.lastTunnelX) || !Number.isFinite(this.lastTunnelY)) {
      this.carveVisualTunnel(x, y, radius);
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
      this.carveVisualTunnel(this.lastTunnelX + dx * progress, this.lastTunnelY + dy * progress, radius);
    }
    this.lastTunnelX = x;
    this.lastTunnelY = y;
  }

  private eraseGasAt(x: number, y: number, radius: number, removeHazard: boolean): void {
    const scale = Math.max(0.1, radius / GAS_HAZARD_BALANCE.tunnelRadius);
    this.tunnelBrush
      .setPosition(x - this.bounds.x, y - this.bounds.y)
      .setScale(scale);
    this.gasLayer.erase(this.tunnelBrush);
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
        if (dx * dx + dy * dy <= radiusSquared) {
          const densityIndex = row * this.densityColumns + column;
          this.tunnelMask[densityIndex] = 255;
          if (removeHazard) this.density[densityIndex] = 0;
        }
      }
    }
  }

  private hasVisibleGasWithin(x: number, y: number, radius: number): boolean {
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
        if (dx * dx + dy * dy > radiusSquared) continue;
        const densityIndex = row * this.densityColumns + column;
        if (this.density[densityIndex] > 0 && this.tunnelMask[densityIndex] === 0) return true;
      }
    }
    return false;
  }

  private startIgnitionBurn(
    x: number,
    y: number,
    radius: number,
    primaryColor: number,
    secondaryColor: number
  ): void {
    let state = this.ignitionStates[0];
    let oldestStartedAt = Number.POSITIVE_INFINITY;
    for (const candidate of this.ignitionStates) {
      if (!candidate.active) {
        state = candidate;
        oldestStartedAt = Number.NEGATIVE_INFINITY;
        break;
      }
      if (candidate.startedAt < oldestStartedAt) {
        state = candidate;
        oldestStartedAt = candidate.startedAt;
      }
    }
    state.active = true;
    state.x = x;
    state.y = y;
    state.radius = radius;
    state.startedAt = this.scene.time.now;
    state.lastEraseRadius = 0;
    state.primaryColor = primaryColor;
    state.secondaryColor = secondaryColor;
  }

  private updateIgnitionBurns(now: number): void {
    const duration = GAS_HAZARD_BALANCE.mineIgnitionVisualMs;
    let hasActiveState = false;
    for (const state of this.ignitionStates) {
      if (!state.active) continue;
      if (now - state.startedAt >= duration) {
        if (state.lastEraseRadius < state.radius) this.eraseVisualGasAt(state.x, state.y, state.radius);
        state.active = false;
      } else {
        hasActiveState = true;
      }
    }
    if (!hasActiveState) {
      if (this.ignitionPresentationVisible) this.ignitionGraphics.clear();
      this.ignitionPresentationVisible = false;
      return;
    }
    this.ignitionGraphics.clear();
    this.ignitionPresentationVisible = true;
    for (let stateIndex = 0; stateIndex < this.ignitionStates.length; stateIndex += 1) {
      const state = this.ignitionStates[stateIndex];
      if (!state.active) continue;
      const progress = Phaser.Math.Clamp((now - state.startedAt) / duration, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      const burnRadius = Math.max(5, state.radius * eased);
      // At most one cheap RenderTexture erasure stamp per active burn per frame.
      if (burnRadius - state.lastEraseRadius >= 5 || progress >= 1) {
        this.eraseVisualGasAt(state.x, state.y, burnRadius);
        state.lastEraseRadius = burnRadius;
      }
      if (progress >= 1) {
        state.active = false;
        continue;
      }

      const fade = (1 - progress) ** 0.72;
      const frontWidth = Math.max(2, 10 * fade);
      this.ignitionGraphics.lineStyle(frontWidth + 5, state.primaryColor, 0.12 * fade);
      this.ignitionGraphics.strokeCircle(state.x, state.y, burnRadius);
      this.ignitionGraphics.lineStyle(frontWidth, 0xff8a21, 0.82 * fade);
      this.ignitionGraphics.strokeCircle(state.x, state.y, burnRadius);
      this.ignitionGraphics.lineStyle(Math.max(1.5, frontWidth * 0.42), 0xfff26b, 0.92 * fade);
      this.ignitionGraphics.strokeCircle(state.x, state.y, Math.max(2, burnRadius - frontWidth * 0.45));

      // Mine-faction color remains visible at the outer fringe of the hot fire.
      this.ignitionGraphics.lineStyle(Math.max(1, frontWidth * 0.28), state.secondaryColor, 0.66 * fade);
      this.ignitionGraphics.strokeCircle(state.x, state.y, burnRadius + frontWidth * 0.5);
      for (let index = 0; index < 10; index += 1) {
        const angle = index / 10 * Math.PI * 2 + stateIndex * 0.37;
        const directionX = Math.cos(angle);
        const directionY = Math.sin(angle);
        const tangentX = -directionY;
        const tangentY = directionX;
        const baseRadius = Math.max(2, burnRadius - frontWidth * 0.4);
        const tipRadius = burnRadius + frontWidth * (0.65 + (index % 3) * 0.22);
        const halfBase = Math.max(2, frontWidth * 0.34);
        this.ignitionGraphics.fillStyle(index % 2 === 0 ? 0xffc52f : state.primaryColor, 0.58 * fade);
        this.ignitionGraphics.fillTriangle(
          state.x + directionX * baseRadius + tangentX * halfBase,
          state.y + directionY * baseRadius + tangentY * halfBase,
          state.x + directionX * tipRadius,
          state.y + directionY * tipRadius,
          state.x + directionX * baseRadius - tangentX * halfBase,
          state.y + directionY * baseRadius - tangentY * halfBase
        );
      }
    }
  }

  private clearGasHazardAt(x: number, y: number, radius: number): void {
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

  private eraseVisualGasAt(x: number, y: number, radius: number): void {
    const scale = Math.max(0.1, radius / GAS_HAZARD_BALANCE.tunnelRadius);
    this.tunnelBrush
      .setPosition(x - this.bounds.x, y - this.bounds.y)
      .setScale(scale);
    this.gasLayer.erase(this.tunnelBrush);
  }

  private resetIgnitionBurns(): void {
    for (const state of this.ignitionStates) state.active = false;
    this.ignitionGraphics.clear();
    this.ignitionPresentationVisible = false;
  }

  private hasGasAt(x: number, y: number): boolean {
    const cellSize = GAS_HAZARD_BALANCE.densityCellSize;
    const column = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (column < 0 || column >= this.densityColumns || row < 0 || row >= this.densityRows) return false;
    return this.density[row * this.densityColumns + column] > 0;
  }

  private hasVisibleGasAt(x: number, y: number): boolean {
    const cellSize = GAS_HAZARD_BALANCE.densityCellSize;
    const column = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (column < 0 || column >= this.densityColumns || row < 0 || row >= this.densityRows) return false;
    const densityIndex = row * this.densityColumns + column;
    return this.density[densityIndex] > 0 && this.tunnelMask[densityIndex] === 0;
  }

  private finishPhase(now: number): void {
    const config = GAS_HAZARD_BALANCE;
    this.clearCanisters();
    this.gasLayer.clear().setVisible(false);
    this.wispGraphics.clear();
    this.density.fill(0);
    this.tunnelMask.fill(0);
    this.resetIgnitionBurns();
    this.resetImpactBursts();
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
      target.marker.setVisible(false).setActive(false).setAlpha(0).setScale(1);
      target.canister.setVisible(false).setActive(false).setAlpha(0).setRotation(0);
      target.released = false;
    }
    this.canisters.length = 0;
    this.releasedCanisterCount = 0;
    this.wispGraphics.clear();
    this.lastTunnelX = Number.NaN;
    this.lastTunnelY = Number.NaN;
  }
}
