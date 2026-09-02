import Phaser from 'phaser';
import { AudioManager } from '../systems/AudioManager.ts';
import { drawBeveledTechPlate, drawHazardStripes, drawPanelBolts } from '../rendering/LayeredArtPrimitives.ts';

export type SharedFireNozzleKind = 'wall' | 'floor';
export type SharedFireTrapState = 'idle' | 'telegraph' | 'active' | 'cooldown';

export interface SharedFireTrapPlacement {
  id: string;
  x: number;
  y: number;
  rotation: number;
  kind: SharedFireNozzleKind;
  triggerRadius?: number;
  initialDelayMs?: number;
}

export interface SharedFireTrapTarget {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

export interface SharedFireAntiCampConfig {
  dwellMs: number;
  regionRadius: number;
  redeployCooldownMs: number;
  predictionSeconds: number;
  maximumLead: number;
  /** Returns a safe nearby Arena point, or null when no fair placement exists. */
  resolvePlacement(x: number, y: number, sequence: number): { x: number; y: number } | null;
}

export interface SharedFireTrapOptions {
  environment: 'arena' | 'heist' | 'anomaly';
  particlesEnabled: boolean;
  damagePerTick?: number;
  damageIntervalMs?: number;
  maximumConcurrent?: number;
  antiCamp?: SharedFireAntiCampConfig;
  onDamagePlayer(amount: number): void;
}

export interface SharedFireTrapDiagnostics {
  environment: SharedFireTrapOptions['environment'];
  nozzleCount: number;
  wallNozzles: number;
  floorNozzleSlots: number;
  activeNozzles: number;
  maximumConcurrent: number;
  updateIntervalMs: 50;
  dynamicGraphicsBatches: 2;
  physicsBodies: 0;
  independentTimers: 0;
}

interface FireNozzleRuntime {
  placement: SharedFireTrapPlacement;
  root: Phaser.GameObjects.Container;
  warningLight: Phaser.GameObjects.Arc;
  state: SharedFireTrapState;
  stateStartedAt: number;
  nextReadyAt: number;
  nextDamageAt: number;
  deployed: boolean;
}

const FIRE_TIMING = Object.freeze({ telegraph: 980, active: 1_100, cooldown: 3_250 });
const UPDATE_INTERVAL_MS = 50 as const;
const WALL_FLAME_START = 62;
const WALL_FLAME_END = 330;
const WALL_HALF_WIDTH = 62;
const FLOOR_DAMAGE_RADIUS = 78;
const WALL_FIRE_LAYERS = Object.freeze([
  { start: 66, end: 324, half: 61, color: 0xd93218, alpha: 0.23 },
  { start: 66, end: 302, half: 43, color: 0xff6c1f, alpha: 0.62 },
  { start: 65, end: 262, half: 28, color: 0xffc63b, alpha: 0.86 },
  { start: 65, end: 190, half: 14, color: 0xffffd2, alpha: 0.96 }
]);
const FLOOR_FIRE_LAYERS = Object.freeze([
  { radius: 71, height: 132, color: 0xd83218, alpha: 0.28 },
  { radius: 53, height: 112, color: 0xff6b1d, alpha: 0.66 },
  { radius: 34, height: 88, color: 0xffc83f, alpha: 0.88 },
  { radius: 18, height: 54, color: 0xffffdc, alpha: 0.98 }
]);

const createWallNozzle = (scene: Phaser.Scene, placement: SharedFireTrapPlacement): FireNozzleRuntime => {
  const root = scene.add.container(placement.x, placement.y).setRotation(placement.rotation).setDepth(5.2);
  const shadow = scene.add.ellipse(-5, 14, 88, 34, 0x000000, 0.62);
  const chassis = scene.add.graphics();
  drawBeveledTechPlate(chassis, -62, -42, 80, 84, {
    face: 0x172b36, inset: 0x09141d, edge: 0x647f8b, side: 0x02070d,
    highlight: 0xcaf6ff, depth: 8
  });
  drawPanelBolts(chassis, -56, -36, 59, 60, 0xb6c5ca, 9);
  drawHazardStripes(chassis, -49, 23, 52, 8, 0xffc857, 0.78, 7);
  chassis.fillStyle(0x061018, 1).fillRoundedRect(-52, -24, 30, 39, 7);
  chassis.lineStyle(2, 0x45dff2, 0.72).strokeRoundedRect(-52, -24, 30, 39, 7);
  chassis.fillStyle(0xff793f, 0.42).fillRoundedRect(-47, -7, 20, 17, 4);
  chassis.lineStyle(2, 0x748d98, 0.82).beginPath()
    .moveTo(-22, -16).lineTo(-4, -16).lineTo(4, -8).strokePath();
  const pipe = scene.add.rectangle(4, 0, 76, 30, 0x263d48, 1).setStrokeStyle(3, 0x839ca5, 0.9);
  const shield = scene.add.polygon(38, 0, [0, -23, 35, -14, 42, 0, 35, 14, 0, 23], 0x111c24, 1)
    .setStrokeStyle(2, 0xff8a3d, 0.78);
  const barrel = scene.add.rectangle(50, 0, 52, 18, 0x334d58, 1).setStrokeStyle(2, 0xf1fbff, 0.7);
  const throat = scene.add.ellipse(76, 0, 18, 27, 0x07090b, 1).setStrokeStyle(3, 0xff723b, 0.82);
  const warningLight = scene.add.circle(-38, -25, 7, 0x31404a, 1).setStrokeStyle(2, 0xccefff, 0.5);
  root.add([shadow, chassis, pipe, shield, barrel, throat, warningLight]);
  return {
    placement, root, warningLight, state: 'idle', stateStartedAt: 0,
    nextReadyAt: placement.initialDelayMs ?? 900, nextDamageAt: 0, deployed: true
  };
};

const createFloorNozzle = (scene: Phaser.Scene): FireNozzleRuntime => {
  const placement: SharedFireTrapPlacement = {
    id: 'anti-camp-floor-nozzle', x: -10_000, y: -10_000, rotation: 0, kind: 'floor'
  };
  const root = scene.add.container(placement.x, placement.y).setDepth(5.3).setVisible(false).setActive(false);
  const art = scene.add.graphics();
  art.fillStyle(0x010408, 0.78).fillEllipse(4, 11, 112, 42);
  art.fillStyle(0x07131c, 1).fillCircle(0, 0, 48);
  art.lineStyle(3, 0x506c79, 0.96).strokeCircle(0, 0, 48);
  art.lineStyle(2, 0xff7540, 0.78).strokeCircle(0, 0, 35);
  art.fillStyle(0x152e39, 1).fillCircle(0, 0, 27);
  art.lineStyle(2, 0x62efff, 0.66).strokeCircle(0, 0, 25);
  drawHazardStripes(art, -36, 34, 72, 7, 0xffc857, 0.74, 8);
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI * 0.25;
    art.fillStyle(0x94a9b2, 0.9).fillCircle(Math.cos(angle) * 40, Math.sin(angle) * 40, 2.5);
  }
  const iris = scene.add.circle(0, 0, 13, 0x020305, 1).setStrokeStyle(3, 0xff8145, 0.9);
  const warningLight = scene.add.circle(0, 0, 5, 0x31404a, 1).setStrokeStyle(1, 0xffffff, 0.62);
  root.add([art, iris, warningLight]);
  return {
    placement, root, warningLight, state: 'idle', stateStartedAt: 0,
    nextReadyAt: 0, nextDamageAt: 0, deployed: false
  };
};

/**
 * One allocation-free fire runtime shared by Arena, HEIST, and future anomaly
 * scenes. Nozzles own static art only; all live flame, smoke, heat, sparks and
 * telegraphs are drawn into two reusable Graphics batches at 20 Hz.
 */
export class SharedFireTrapSystem {
  private readonly nozzles: FireNozzleRuntime[];
  private readonly flameGraphics: Phaser.GameObjects.Graphics;
  private readonly glowGraphics: Phaser.GameObjects.Graphics;
  private readonly audio = AudioManager.get();
  private readonly damagePerTick: number;
  private readonly damageIntervalMs: number;
  private readonly maximumConcurrent: number;
  private readonly floorNozzle: FireNozzleRuntime | null;
  private nextUpdateAt = 0;
  private campingAnchorX = Number.NaN;
  private campingAnchorY = Number.NaN;
  private campingStartedAt = 0;
  private nextAntiCampAt = 0;
  private smoothedVelocityX = 0;
  private smoothedVelocityY = 0;
  private deploymentSequence = 0;

  constructor(
    scene: Phaser.Scene,
    placements: readonly SharedFireTrapPlacement[],
    private readonly options: SharedFireTrapOptions
  ) {
    this.nozzles = placements.filter((placement) => placement.kind === 'wall')
      .map((placement) => createWallNozzle(scene, placement));
    this.floorNozzle = options.antiCamp ? createFloorNozzle(scene) : null;
    if (this.floorNozzle) this.nozzles.push(this.floorNozzle);
    this.flameGraphics = scene.add.graphics().setDepth(8.62);
    this.glowGraphics = scene.add.graphics().setDepth(8.66).setBlendMode(Phaser.BlendModes.ADD);
    this.damagePerTick = options.damagePerTick ?? 4.2;
    this.damageIntervalMs = options.damageIntervalMs ?? 260;
    this.maximumConcurrent = Math.max(1, options.maximumConcurrent ?? 2);
  }

  update(now: number, target: SharedFireTrapTarget, damageMultiplier = 1): void {
    if (now < this.nextUpdateAt) return;
    this.nextUpdateAt = now + UPDATE_INTERVAL_MS;
    this.updateAntiCamp(now, target);
    let activeCount = 0;
    for (const nozzle of this.nozzles) if (nozzle.state === 'active') activeCount += 1;
    for (const nozzle of this.nozzles) {
      const dx = target.x - nozzle.placement.x;
      const dy = target.y - nozzle.placement.y;
      const distanceSquared = dx * dx + dy * dy;
      if (nozzle.deployed && nozzle.placement.kind === 'wall' && nozzle.state === 'idle'
        && now >= nozzle.nextReadyAt && activeCount < this.maximumConcurrent
        && distanceSquared <= (nozzle.placement.triggerRadius ?? 270) ** 2) {
        this.beginTelegraph(nozzle, now);
      }
      if (nozzle.state === 'telegraph' && now - nozzle.stateStartedAt >= FIRE_TIMING.telegraph
        && activeCount < this.maximumConcurrent) {
        nozzle.state = 'active';
        nozzle.stateStartedAt = now;
        nozzle.nextDamageAt = now;
        activeCount += 1;
        this.audio.playSfx('fireTrap');
      }
      if (nozzle.state === 'active') {
        const hit = nozzle.placement.kind === 'floor'
          ? distanceSquared <= FLOOR_DAMAGE_RADIUS * FLOOR_DAMAGE_RADIUS
          : this.wallFlameContains(nozzle, target.x, target.y);
        if (hit && now >= nozzle.nextDamageAt) {
          nozzle.nextDamageAt = now + this.damageIntervalMs;
          this.options.onDamagePlayer(this.damagePerTick * Math.max(0, damageMultiplier));
        }
        if (now - nozzle.stateStartedAt >= FIRE_TIMING.active) {
          nozzle.state = 'cooldown';
          nozzle.stateStartedAt = now;
          nozzle.nextReadyAt = now + FIRE_TIMING.cooldown;
          activeCount = Math.max(0, activeCount - 1);
        }
      } else if (nozzle.state === 'cooldown' && now >= nozzle.nextReadyAt) {
        nozzle.state = 'idle';
        nozzle.stateStartedAt = now;
        if (nozzle.placement.kind === 'floor') this.retractFloorNozzle(nozzle);
      }
      this.updateWarningLight(nozzle, now);
    }
    this.drawDynamicLayers(now);
  }

  diagnostics(): SharedFireTrapDiagnostics {
    return {
      environment: this.options.environment,
      nozzleCount: this.nozzles.length,
      wallNozzles: this.nozzles.filter((nozzle) => nozzle.placement.kind === 'wall').length,
      floorNozzleSlots: this.floorNozzle ? 1 : 0,
      activeNozzles: this.nozzles.filter((nozzle) => nozzle.state === 'active').length,
      maximumConcurrent: this.maximumConcurrent,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      dynamicGraphicsBatches: 2,
      physicsBodies: 0,
      independentTimers: 0
    };
  }

  destroy(): void {
    for (const nozzle of this.nozzles) nozzle.root.destroy(true);
    this.nozzles.length = 0;
    this.flameGraphics.destroy();
    this.glowGraphics.destroy();
  }

  discardReferences(): void {
    this.nozzles.length = 0;
  }

  private beginTelegraph(nozzle: FireNozzleRuntime, now: number): void {
    nozzle.state = 'telegraph';
    nozzle.stateStartedAt = now;
    nozzle.nextDamageAt = 0;
  }

  private retractFloorNozzle(nozzle: FireNozzleRuntime): void {
    nozzle.deployed = false;
    nozzle.root.setVisible(false).setActive(false).setPosition(-10_000, -10_000).setScale(1);
    nozzle.placement.x = -10_000;
    nozzle.placement.y = -10_000;
  }

  private updateAntiCamp(now: number, target: SharedFireTrapTarget): void {
    const config = this.options.antiCamp;
    const nozzle = this.floorNozzle;
    if (!config || !nozzle) return;
    this.smoothedVelocityX += (target.velocityX - this.smoothedVelocityX) * 0.18;
    this.smoothedVelocityY += (target.velocityY - this.smoothedVelocityY) * 0.18;
    if (!Number.isFinite(this.campingAnchorX)) {
      this.campingAnchorX = target.x;
      this.campingAnchorY = target.y;
      this.campingStartedAt = now;
      return;
    }
    const anchorDx = target.x - this.campingAnchorX;
    const anchorDy = target.y - this.campingAnchorY;
    if (anchorDx * anchorDx + anchorDy * anchorDy > config.regionRadius * config.regionRadius) {
      this.campingAnchorX = target.x;
      this.campingAnchorY = target.y;
      this.campingStartedAt = now;
      return;
    }
    if (nozzle.deployed || now < this.nextAntiCampAt || now - this.campingStartedAt < config.dwellMs) return;
    const rawLeadX = this.smoothedVelocityX * config.predictionSeconds;
    const rawLeadY = this.smoothedVelocityY * config.predictionSeconds;
    const leadLength = Math.hypot(rawLeadX, rawLeadY);
    const leadScale = leadLength > config.maximumLead ? config.maximumLead / leadLength : 1;
    const phase = this.deploymentSequence * 2.3999632297;
    const pressureOffset = 34 + this.deploymentSequence % 3 * 14;
    const candidateX = target.x + rawLeadX * leadScale + Math.cos(phase) * pressureOffset;
    const candidateY = target.y + rawLeadY * leadScale + Math.sin(phase) * pressureOffset;
    const safe = config.resolvePlacement(candidateX, candidateY, this.deploymentSequence++);
    this.campingStartedAt = now;
    this.campingAnchorX = target.x;
    this.campingAnchorY = target.y;
    this.nextAntiCampAt = now + config.redeployCooldownMs;
    if (!safe) return;
    // Do not layer the portable nozzle over an active/telegraphing wall lane.
    // The topology resolver handles static geometry; the shared runtime owns
    // the live-hazard state needed for this final fairness check.
    if (this.nozzles.some((existing) => existing !== nozzle && existing.deployed
      && existing.state !== 'idle' && existing.state !== 'cooldown'
      && (this.wallFlameContains(existing, safe.x, safe.y)
        || Phaser.Math.Distance.Squared(existing.placement.x, existing.placement.y, safe.x, safe.y) < 150 * 150))) return;
    nozzle.placement.x = safe.x;
    nozzle.placement.y = safe.y;
    nozzle.root.setPosition(safe.x, safe.y).setVisible(true).setActive(true).setScale(0.72);
    nozzle.deployed = true;
    this.beginTelegraph(nozzle, now);
  }

  private wallFlameContains(nozzle: FireNozzleRuntime, x: number, y: number): boolean {
    const dx = x - nozzle.placement.x;
    const dy = y - nozzle.placement.y;
    const cosine = Math.cos(nozzle.placement.rotation);
    const sine = Math.sin(nozzle.placement.rotation);
    const localX = dx * cosine + dy * sine;
    const localY = -dx * sine + dy * cosine;
    return localX >= WALL_FLAME_START && localX <= WALL_FLAME_END && Math.abs(localY) <= WALL_HALF_WIDTH;
  }

  private updateWarningLight(nozzle: FireNozzleRuntime, now: number): void {
    if (!nozzle.deployed) return;
    const elapsed = now - nozzle.stateStartedAt;
    const telegraph = nozzle.state === 'telegraph'
      ? Phaser.Math.Clamp(elapsed / FIRE_TIMING.telegraph, 0, 1) : 0;
    const blink = Math.floor(now / Math.max(90, 280 - telegraph * 150)) % 2 === 0;
    nozzle.warningLight.setFillStyle(nozzle.state === 'active' ? 0xffffff
      : telegraph > 0.7 ? 0xff3f24 : telegraph > 0 ? 0xffb43d : 0x31404a,
    nozzle.state === 'idle' ? 0.65 : blink ? 1 : 0.38);
    if (nozzle.placement.kind === 'floor' && nozzle.state === 'telegraph') {
      const deployScale = 0.72 + telegraph * 0.28;
      nozzle.root.setScale(deployScale);
    }
  }

  private drawDynamicLayers(now: number): void {
    this.flameGraphics.clear();
    this.glowGraphics.clear();
    for (let index = 0; index < this.nozzles.length; index += 1) {
      const nozzle = this.nozzles[index];
      if (!nozzle.deployed || nozzle.state === 'idle') continue;
      const elapsed = now - nozzle.stateStartedAt;
      if (nozzle.state === 'telegraph') this.drawTelegraph(nozzle, elapsed / FIRE_TIMING.telegraph, now);
      else if (nozzle.state === 'active') this.drawFire(nozzle, now, index);
      else this.drawCooldown(nozzle, 1 - elapsed / FIRE_TIMING.cooldown);
    }
  }

  private drawTelegraph(nozzle: FireNozzleRuntime, progressValue: number, now: number): void {
    const progress = Phaser.Math.Clamp(progressValue, 0, 1);
    const pulse = 0.5 + Math.sin(now * 0.014) * 0.5;
    const color = progress > 0.68 ? 0xff4d28 : 0xffbd4d;
    if (nozzle.placement.kind === 'floor') {
      const radius = FLOOR_DAMAGE_RADIUS * (0.82 + pulse * 0.1);
      this.glowGraphics.lineStyle(2 + progress * 2, color, 0.28 + progress * 0.55)
        .strokeCircle(nozzle.placement.x, nozzle.placement.y, radius);
      this.glowGraphics.fillStyle(color, 0.035 + progress * 0.075)
        .fillCircle(nozzle.placement.x, nozzle.placement.y, radius);
      for (let tick = 0; tick < 8; tick += 1) {
        const angle = tick * Math.PI * 0.25 + now * 0.0012;
        this.glowGraphics.lineStyle(2, tick % 2 ? 0xffffff : color, 0.36 + progress * 0.42)
          .lineBetween(nozzle.placement.x + Math.cos(angle) * (radius - 13), nozzle.placement.y + Math.sin(angle) * (radius - 13),
            nozzle.placement.x + Math.cos(angle) * radius, nozzle.placement.y + Math.sin(angle) * radius);
      }
      return;
    }
    const cosine = Math.cos(nozzle.placement.rotation);
    const sine = Math.sin(nozzle.placement.rotation);
    for (const side of [-1, 1]) {
      const x1 = nozzle.placement.x + cosine * 78 - sine * 44 * side;
      const y1 = nozzle.placement.y + sine * 78 + cosine * 44 * side;
      const x2 = nozzle.placement.x + cosine * 312 - sine * 44 * side;
      const y2 = nozzle.placement.y + sine * 312 + cosine * 44 * side;
      this.glowGraphics.lineStyle(2, color, 0.22 + progress * 0.6).lineBetween(x1, y1, x2, y2);
    }
  }

  private drawCooldown(nozzle: FireNozzleRuntime, remainingValue: number): void {
    const remaining = Phaser.Math.Clamp(remainingValue, 0, 1);
    if (remaining <= 0) return;
    this.glowGraphics.lineStyle(2, 0xff6738, 0.32 * remaining)
      .strokeCircle(nozzle.placement.x, nozzle.placement.y, nozzle.placement.kind === 'floor' ? 34 : 22);
  }

  private drawFire(nozzle: FireNozzleRuntime, now: number, index: number): void {
    if (nozzle.placement.kind === 'floor') this.drawFloorFire(nozzle, now, index);
    else this.drawWallFire(nozzle, now, index);
  }

  private drawWallFire(nozzle: FireNozzleRuntime, now: number, index: number): void {
    const cosine = Math.cos(nozzle.placement.rotation);
    const sine = Math.sin(nozzle.placement.rotation);
    const turbulence = Math.sin(now * 0.019 + index * 1.7);
    for (let layer = 0; layer < WALL_FIRE_LAYERS.length; layer += 1) {
      const spec = WALL_FIRE_LAYERS[layer];
      const upperY = -spec.half + turbulence * (7 - layer);
      const lowerX = spec.end - layer * 5;
      const lowerY = spec.half - turbulence * (5 - layer);
      this.flameGraphics.fillStyle(spec.color, spec.alpha).fillTriangle(
        nozzle.placement.x + spec.start * cosine,
        nozzle.placement.y + spec.start * sine,
        nozzle.placement.x + spec.end * cosine - upperY * sine,
        nozzle.placement.y + spec.end * sine + upperY * cosine,
        nozzle.placement.x + lowerX * cosine - lowerY * sine,
        nozzle.placement.y + lowerX * sine + lowerY * cosine
      );
    }
    this.glowGraphics.fillStyle(0xffa333, 0.15).fillCircle(
      nozzle.placement.x + 75 * cosine,
      nozzle.placement.y + 75 * sine,
      54
    );
    for (let tongue = 0; tongue < 5; tongue += 1) {
      const phase = (now * 0.0025 + tongue * 0.197 + index * 0.13) % 1;
      const localX = 92 + phase * 224;
      const localY = Math.sin(now * 0.013 + tongue * 2.1) * (17 + tongue * 6);
      this.flameGraphics.fillStyle(tongue % 2 ? 0xff9b28 : 0xff5124, 0.58 * (1 - phase * 0.7))
        .fillEllipse(
          nozzle.placement.x + localX * cosine - localY * sine,
          nozzle.placement.y + localX * sine + localY * cosine,
          22 + (1 - phase) * 20,
          9 + (1 - phase) * 9
        );
    }
    this.drawEmbersAndSmoke(nozzle, now, index, cosine, sine);
  }

  private drawFloorFire(nozzle: FireNozzleRuntime, now: number, index: number): void {
    const x = nozzle.placement.x;
    const y = nozzle.placement.y;
    const pulse = 0.5 + Math.sin(now * 0.021 + index) * 0.5;
    this.glowGraphics.fillStyle(0xff7424, 0.16).fillCircle(x, y, 92 + pulse * 8);
    this.glowGraphics.lineStyle(3, 0xffa12c, 0.82).strokeCircle(x, y, FLOOR_DAMAGE_RADIUS);
    for (let layer = 0; layer < FLOOR_FIRE_LAYERS.length; layer += 1) {
      const spec = FLOOR_FIRE_LAYERS[layer];
      const sway = Math.sin(now * (0.014 + layer * 0.002) + layer * 1.9) * (13 - layer * 2);
      this.flameGraphics.fillStyle(spec.color, spec.alpha)
        .fillEllipse(x, y + 3, spec.radius * 2, spec.radius * 0.68)
        .fillTriangle(x - spec.radius, y, x + spec.radius, y, x + sway, y - spec.height - pulse * 12);
    }
    for (let tongue = 0; tongue < 5; tongue += 1) {
      const angle = tongue * Math.PI * 0.4 + now * 0.0018;
      const radius = 34 + tongue % 2 * 18;
      const tx = x + Math.cos(angle) * radius;
      const ty = y + Math.sin(angle) * radius * 0.45;
      this.flameGraphics.fillStyle(tongue % 2 ? 0xffc13b : 0xff5b20, 0.68)
        .fillTriangle(tx - 9, ty, tx + 9, ty, tx + Math.sin(now * 0.017 + tongue) * 9, ty - 48 - tongue * 6);
    }
    this.drawEmbersAndSmoke(nozzle, now, index);
  }

  private drawEmbersAndSmoke(
    nozzle: FireNozzleRuntime,
    now: number,
    index: number,
    cosine = 0,
    sine = 0
  ): void {
    const floor = nozzle.placement.kind === 'floor';
    const sparkCount = this.options.particlesEnabled ? 8 : 4;
    for (let spark = 0; spark < sparkCount; spark += 1) {
      const phase = (now * 0.0027 + spark * 0.157 + index * 0.093) % 1;
      const localX = 86 + phase * 236;
      const localY = Math.sin(spark * 2.17 + now * 0.009) * (18 + spark * 4);
      const pointX = floor ? nozzle.placement.x + localY
        : nozzle.placement.x + localX * cosine - localY * sine;
      const pointY = floor ? nozzle.placement.y - localX
        : nozzle.placement.y + localX * sine + localY * cosine;
      this.glowGraphics.fillStyle(spark % 3 ? 0xffbf3f : 0xffffff, 0.9 - phase * 0.72)
        .fillCircle(pointX, pointY, 2.6 - phase * 1.2);
    }
    const smokeCount = this.options.particlesEnabled ? 4 : 2;
    for (let smoke = 0; smoke < smokeCount; smoke += 1) {
      const phase = (now * 0.0012 + smoke * 0.283 + index * 0.071) % 1;
      const localX = 184 + phase * 148;
      const localY = Math.sin(now * 0.004 + smoke * 2.4) * 45;
      const pointX = floor ? nozzle.placement.x + localY
        : nozzle.placement.x + localX * cosine - localY * sine;
      const pointY = floor ? nozzle.placement.y - localX
        : nozzle.placement.y + localX * sine + localY * cosine;
      this.flameGraphics.fillStyle(smoke % 2 ? 0x271d22 : 0x273845, 0.13 * (1 - phase))
        .fillEllipse(pointX, pointY, 30 + phase * 24, 15 + phase * 18);
    }
    if (nozzle.placement.kind === 'wall') {
      const heatEndY = Math.sin(now * 0.01) * 6;
      this.glowGraphics.lineStyle(2, 0xffe09a, 0.13)
        .lineBetween(
          nozzle.placement.x + 100 * cosine,
          nozzle.placement.y + 100 * sine,
          nozzle.placement.x + 306 * cosine - heatEndY * sine,
          nozzle.placement.y + 306 * sine + heatEndY * cosine
        );
    }
  }
}
