import Phaser from 'phaser';

export type BombsiteTotemEffectKind = 'push' | 'damage' | 'control' | 'electric' | 'support';

interface TotemSlot {
  active: boolean;
  siteId: string;
  x: number;
  y: number;
  deployedAt: number;
  impactAt: number;
  impacted: boolean;
  resolvingAt: number;
  phase: number;
  chargeStartedAt: number;
  chargeUntil: number;
  chargeColor: number;
  chargeKind: BombsiteTotemEffectKind;
  pulseStartedAt: number;
  pulseDurationMs: number;
  pulseRadius: number;
  pulseColor: number;
  pulseKind: BombsiteTotemEffectKind;
  flashStartedAt: number;
  flashColor: number;
  root: Phaser.GameObjects.Container;
  ground: Phaser.GameObjects.Container;
  rig: Phaser.GameObjects.Container;
  marker: Phaser.GameObjects.Graphics;
  fissures: Phaser.GameObjects.Graphics;
  fissureBranches: Phaser.GameObjects.Graphics;
  debris: Phaser.GameObjects.Graphics;
  lastDebrisFrame: number;
  dynamic: Phaser.GameObjects.Graphics;
  shadow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Graphics;
  channels: Phaser.GameObjects.Graphics;
  face: Phaser.GameObjects.Graphics;
  coreGlow: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  innerRing: Phaser.GameObjects.Arc;
  outerRing: Phaser.GameObjects.Arc;
}

const MAX_ACTIVE_TOTEMS = 5;
const TARGETING_MS = 160;
const DROP_MS = 500;
const IMPACT_MS = TARGETING_MS + DROP_MS;
const POWER_UP_MS = 430;
const FISSURE_HOLD_MS = 760;
const FISSURE_FADE_MS = 1_900;
const FISSURE_BRANCH_HOLD_MS = 480;
const FISSURE_BRANCH_FADE_MS = 1_850;
const IMPACT_FLASH_MS = 520;
const DEBRIS_DRAW_INTERVAL_MS = 1000 / 30;
const DEBRIS_COUNT = 38;
const LARGE_DEBRIS_COUNT = 8;
const MEDIUM_DEBRIS_COUNT = 22;
const DEBRIS_MAX_LIFETIME_MS = 2_950;
const DROP_HEIGHT = 330;
const TOTEM_RENDER_DEPTH = 11;
const TOTEM_VISUAL_SCALE = 1.16;
const TAU = Math.PI * 2;
const RAY_COUNT = 14;
const RAY_COS = new Float32Array(RAY_COUNT);
const RAY_SIN = new Float32Array(RAY_COUNT);
const DEBRIS_COS = new Float32Array(DEBRIS_COUNT);
const DEBRIS_SIN = new Float32Array(DEBRIS_COUNT);
const DEBRIS_DISTANCE = new Float32Array(DEBRIS_COUNT);
const DEBRIS_HEIGHT = new Float32Array(DEBRIS_COUNT);
const DEBRIS_SPIN = new Float32Array(DEBRIS_COUNT);
const DEBRIS_SIZE = new Float32Array(DEBRIS_COUNT);
const DEBRIS_DELAY = new Float32Array(DEBRIS_COUNT);
const DEBRIS_LIFETIME = new Float32Array(DEBRIS_COUNT);
const DEBRIS_TYPE = new Uint8Array(DEBRIS_COUNT);

for (let index = 0; index < RAY_COUNT; index += 1) {
  const angle = index / RAY_COUNT * TAU;
  RAY_COS[index] = Math.cos(angle);
  RAY_SIN[index] = Math.sin(angle);
}

const seededUnit = (index: number, salt: number): number => {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43_758.5453;
  return value - Math.floor(value);
};

for (let index = 0; index < DEBRIS_COUNT; index += 1) {
  const angle = index / DEBRIS_COUNT * TAU + (seededUnit(index, 1) - 0.5) * 0.34;
  const large = index < LARGE_DEBRIS_COUNT;
  const medium = index >= LARGE_DEBRIS_COUNT && index < MEDIUM_DEBRIS_COUNT;
  DEBRIS_COS[index] = Math.cos(angle);
  DEBRIS_SIN[index] = Math.sin(angle);
  DEBRIS_DISTANCE[index] = (large ? 116 : medium ? 94 : 76) + seededUnit(index, 2) * (large ? 76 : medium ? 64 : 54);
  DEBRIS_HEIGHT[index] = (large ? 48 : medium ? 34 : 20) + seededUnit(index, 3) * (large ? 38 : medium ? 31 : 25);
  DEBRIS_SPIN[index] = (index % 2 === 0 ? 1 : -1) * (2.1 + seededUnit(index, 4) * 5.4);
  DEBRIS_SIZE[index] = (large ? 7.5 : medium ? 4.5 : 2.5) + seededUnit(index, 5) * (large ? 5 : medium ? 3.5 : 2.5);
  DEBRIS_DELAY[index] = seededUnit(index, 6) * 115;
  DEBRIS_LIFETIME[index] = large
    ? 1_850 + seededUnit(index, 7) * 1_000
    : medium
      ? 1_150 + seededUnit(index, 7) * 1_050
      : 720 + seededUnit(index, 7) * 780;
  DEBRIS_TYPE[index] = Math.floor(seededUnit(index, 8) * 4);
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeInCubic = (value: number): number => value ** 3;
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;

/**
 * Bounded, event-driven presentation for objective Mods. It never owns combat
 * timing, targets, radii, or damage; BombsiteModSystem supplies those values.
 */
export class BombsiteTotemVfx {
  private readonly slots: TotemSlot[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly callbacks: {
      onEntrance?: (siteId: string) => void;
    } = {}
  ) {}

  deploy(siteId: string, x: number, y: number, now: number): boolean {
    this.remove(siteId);
    const slot = this.obtainSlot();
    if (!slot) return false;

    slot.active = true;
    slot.siteId = siteId;
    slot.x = x;
    slot.y = y;
    slot.deployedAt = now;
    slot.impactAt = now + IMPACT_MS;
    slot.impacted = false;
    slot.resolvingAt = 0;
    slot.phase = this.sitePhase(siteId);
    slot.chargeStartedAt = 0;
    slot.chargeUntil = 0;
    slot.chargeColor = 0x63efff;
    slot.chargeKind = 'electric';
    slot.pulseStartedAt = 0;
    slot.pulseDurationMs = 0;
    slot.pulseRadius = 0;
    slot.pulseColor = 0x63efff;
    slot.pulseKind = 'electric';
    slot.flashStartedAt = 0;
    slot.flashColor = 0xffffff;

    slot.root.setPosition(x, y).setAlpha(1).setVisible(true).setActive(true);
    slot.ground.setVisible(true).setAlpha(1);
    slot.rig.setPosition(0, -DROP_HEIGHT).setScale(TOTEM_VISUAL_SCALE * 0.72).setAlpha(0).setVisible(true);
    slot.marker.setVisible(true).setAlpha(0.8).setRotation(slot.phase);
    slot.fissures.clear().setAlpha(0).setVisible(false);
    slot.fissureBranches.clear().setAlpha(0).setVisible(false);
    slot.debris.clear().setAlpha(1).setVisible(false);
    slot.lastDebrisFrame = -1;
    slot.dynamic.clear().setVisible(true).setAlpha(1);
    slot.shadow.setVisible(true).setAlpha(0.08).setScale(0.38);
    // Keep the descending chassis unmistakable against the dark arena. The
    // powered state still ramps up after impact, but the orbital device itself
    // no longer arrives as an almost-black silhouette.
    slot.body.setAlpha(1);
    slot.face.setAlpha(0.82);
    slot.core.setFillStyle(0x63efff, 0.88).setAlpha(0.72).setScale(0.72);
    slot.coreGlow.setFillStyle(0x63efff, 0.2).setAlpha(0.34);
    slot.channels.setAlpha(0.62);
    slot.innerRing.setStrokeStyle(2, 0x63efff, 0.82).setAlpha(0.62);
    slot.outerRing.setStrokeStyle(2, 0xff5bd6, 0.74).setAlpha(0.54);
    this.callbacks.onEntrance?.(siteId);
    return true;
  }

  charge(siteId: string, color: number, now: number, durationMs: number, kind: BombsiteTotemEffectKind): void {
    const slot = this.find(siteId);
    if (!slot) return;
    slot.chargeStartedAt = now;
    slot.chargeUntil = Math.max(slot.chargeUntil, now + Math.max(80, durationMs));
    slot.chargeColor = color;
    slot.chargeKind = kind;
  }

  trigger(
    siteId: string,
    color: number,
    radius: number,
    now: number,
    durationMs: number,
    kind: BombsiteTotemEffectKind
  ): boolean {
    const slot = this.find(siteId);
    if (!slot) return false;
    const chargeLeadMs = Math.min(120, Math.max(70, durationMs * 0.22));
    slot.chargeStartedAt = now;
    slot.chargeUntil = now + chargeLeadMs;
    slot.chargeColor = color;
    slot.chargeKind = kind;
    slot.pulseStartedAt = now + chargeLeadMs;
    slot.pulseDurationMs = Math.max(160, durationMs);
    slot.pulseRadius = Math.max(20, radius);
    slot.pulseColor = color;
    slot.pulseKind = kind;
    return true;
  }

  flash(siteId: string, color: number, now: number, kind: BombsiteTotemEffectKind): void {
    const slot = this.find(siteId);
    if (!slot) return;
    slot.flashStartedAt = now;
    slot.flashColor = color;
    slot.chargeStartedAt = now;
    slot.chargeUntil = Math.max(slot.chargeUntil, now + 150);
    slot.chargeColor = color;
    slot.chargeKind = kind;
  }

  beginResolve(siteId: string, now: number): void {
    const slot = this.find(siteId);
    if (!slot) return;
    slot.resolvingAt = now;
    slot.chargeStartedAt = now;
    slot.chargeUntil = now + 220;
    slot.chargeColor = 0xffffff;
    slot.chargeKind = 'damage';
  }

  remove(siteId: string): void {
    const slot = this.find(siteId);
    if (slot) this.release(slot);
  }

  update(now: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      this.updateSlot(slot, now);
    }
  }

  activeCount(): number {
    let count = 0;
    for (const slot of this.slots) if (slot.active) count += 1;
    return count;
  }

  destroy(): void {
    for (const slot of this.slots) slot.root.destroy(true);
    this.slots.length = 0;
  }

  private obtainSlot(): TotemSlot | null {
    for (const slot of this.slots) if (!slot.active) return slot;
    if (this.slots.length >= MAX_ACTIVE_TOTEMS) return null;
    const slot = this.createSlot();
    this.slots.push(slot);
    return slot;
  }

  private createSlot(): TotemSlot {
    const root = this.scene.add.container(0, 0).setDepth(TOTEM_RENDER_DEPTH).setVisible(false).setActive(false);
    const ground = this.scene.add.container(0, 0);
    const rig = this.scene.add.container(0, 0);
    const marker = this.scene.add.graphics();
    marker.lineStyle(2, 0x5ff7ff, 0.76).strokeCircle(0, 0, 45);
    marker.lineStyle(1, 0xff5bd6, 0.62).strokeCircle(0, 0, 33);
    marker.lineStyle(3, 0xffffff, 0.72);
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI * 0.5;
      marker.lineBetween(Math.cos(angle) * 48, Math.sin(angle) * 48, Math.cos(angle) * 62, Math.sin(angle) * 62);
    }

    const fissures = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const fissureBranches = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const debris = this.scene.add.graphics();
    const dynamic = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const shadow = this.scene.add.ellipse(2, 30, 72, 26, 0x000000, 0.48);
    ground.add([shadow, marker, fissures, fissureBranches, debris, dynamic]);

    const body = this.scene.add.graphics();
    this.drawBody(body);
    const channels = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.drawChannels(channels);
    const face = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.drawTikiFace(face);
    const coreGlow = this.scene.add.circle(-3, 7, 17, 0x63efff, 0.14).setBlendMode(Phaser.BlendModes.ADD);
    const core = this.scene.add.circle(-3, 7, 7, 0x06101a, 1).setStrokeStyle(2, 0xffffff, 0.8);
    const innerRing = this.scene.add.circle(1, 27, 24, 0x000000, 0).setScale(1, 0.35).setStrokeStyle(2, 0x63efff, 0.72);
    const outerRing = this.scene.add.circle(1, 27, 33, 0x000000, 0).setScale(1, 0.34).setStrokeStyle(2, 0xff5bd6, 0.6);
    rig.add([body, channels, outerRing, innerRing, coreGlow, core, face]);
    root.add([ground, rig]);

    return {
      active: false, siteId: '', x: 0, y: 0, deployedAt: 0, impactAt: 0, impacted: false,
      resolvingAt: 0, phase: 0, chargeStartedAt: 0, chargeUntil: 0, chargeColor: 0x63efff,
      chargeKind: 'electric', pulseStartedAt: 0, pulseDurationMs: 0, pulseRadius: 0,
      pulseColor: 0x63efff, pulseKind: 'electric', flashStartedAt: 0, flashColor: 0xffffff,
      root, ground, rig, marker, fissures, fissureBranches, debris, lastDebrisFrame: -1,
      dynamic, shadow, body, channels, face, coreGlow, core, innerRing, outerRing
    };
  }

  private drawBody(graphics: Phaser.GameObjects.Graphics): void {
    // Three opaque faces create a readable pseudo-3D pole while remaining one
    // retained Graphics object with no texture or per-frame redraw cost.
    const frontFace = [
      new Phaser.Geom.Point(-25, -44), new Phaser.Geom.Point(9, -51),
      new Phaser.Geom.Point(16, 25), new Phaser.Geom.Point(-20, 34)
    ];
    const sideFace = [
      new Phaser.Geom.Point(9, -51), new Phaser.Geom.Point(25, -39),
      new Phaser.Geom.Point(29, 18), new Phaser.Geom.Point(16, 25)
    ];
    const topFace = [
      new Phaser.Geom.Point(-25, -44), new Phaser.Geom.Point(-10, -59),
      new Phaser.Geom.Point(9, -51), new Phaser.Geom.Point(-6, -37)
    ];
    graphics.fillStyle(0x0a2030, 1).fillPoints(frontFace, true, true);
    graphics.lineStyle(3, 0x63efff, 0.96).strokePoints(frontFace, true, true);
    graphics.fillStyle(0x170d28, 1).fillPoints(sideFace, true, true);
    graphics.lineStyle(3, 0xff5bd6, 0.94).strokePoints(sideFace, true, true);
    graphics.fillStyle(0x15394a, 1).fillPoints(topFace, true, true);
    graphics.lineStyle(2, 0xb7fbff, 0.9).strokePoints(topFace, true, true);

    const anchor = [
      new Phaser.Geom.Point(-29, 27), new Phaser.Geom.Point(3, 19),
      new Phaser.Geom.Point(34, 25), new Phaser.Geom.Point(20, 39),
      new Phaser.Geom.Point(-17, 42), new Phaser.Geom.Point(-36, 35)
    ];
    graphics.fillStyle(0x06111b, 1).fillPoints(anchor, true, true);
    graphics.lineStyle(2, 0x63efff, 0.72).strokePoints(anchor, true, true);
    graphics.lineStyle(2, 0xff5bd6, 0.66).lineBetween(3, 20, 20, 38);
    graphics.fillStyle(0xf2ffff, 0.88).fillCircle(-16, 31, 2.5).fillCircle(22, 27, 2.5);
  }

  private drawChannels(graphics: Phaser.GameObjects.Graphics): void {
    graphics.lineStyle(3, 0x63efff, 0.78).lineBetween(-18, -4, -16, 25);
    graphics.lineStyle(2, 0x63efff, 0.72).lineBetween(8, -18, 11, 22);
    graphics.lineStyle(2, 0xff5bd6, 0.74).lineBetween(18, -31, 22, 13);
    graphics.lineStyle(1, 0xffffff, 0.62).strokeRoundedRect(-12, -3, 19, 22, 4);
    graphics.fillStyle(0x63efff, 0.9).fillCircle(-17, 24, 2.5).fillCircle(11, 22, 2.5);
    graphics.fillStyle(0xff5bd6, 0.86).fillCircle(22, 13, 2.5);
  }

  private drawTikiFace(graphics: Phaser.GameObjects.Graphics): void {
    const leftEye = [
      new Phaser.Geom.Point(-19, -36), new Phaser.Geom.Point(-10, -41),
      new Phaser.Geom.Point(-7, -31), new Phaser.Geom.Point(-15, -27)
    ];
    const rightEye = [
      new Phaser.Geom.Point(-4, -39), new Phaser.Geom.Point(5, -42),
      new Phaser.Geom.Point(8, -33), new Phaser.Geom.Point(0, -28)
    ];
    graphics.fillStyle(0x63efff, 0.92).fillPoints(leftEye, true, true).fillPoints(rightEye, true, true);
    graphics.lineStyle(2, 0xeaffff, 0.9).strokePoints(leftEye, true, true).strokePoints(rightEye, true, true);
    graphics.lineStyle(3, 0xff5bd6, 0.94).lineBetween(-7, -29, -2, -20).lineBetween(-2, -20, -9, -17);
    graphics.lineStyle(3, 0x63efff, 0.88)
      .lineBetween(-17, -13, 5, -17)
      .lineBetween(5, -17, 1, -7)
      .lineBetween(1, -7, -13, -5)
      .lineBetween(-13, -5, -17, -13);
    graphics.lineStyle(1, 0xffffff, 0.76)
      .lineBetween(-11, -14, -9, -6)
      .lineBetween(-4, -15, -3, -7);
  }

  private updateSlot(slot: TotemSlot, now: number): void {
    const elapsed = now - slot.deployedAt;
    const descendProgress = clamp01((elapsed - TARGETING_MS) / DROP_MS);
    slot.marker.setRotation(slot.phase + now * 0.0014);
    slot.marker.setAlpha(elapsed < IMPACT_MS ? 0.45 + Math.sin(now * 0.018) * 0.25 : Math.max(0, 1 - (elapsed - IMPACT_MS) / 260));

    if (elapsed < TARGETING_MS) {
      slot.rig.setAlpha(0);
    } else if (elapsed < IMPACT_MS) {
      const eased = easeInCubic(descendProgress);
      slot.rig.setPosition(0, -DROP_HEIGHT * (1 - eased))
        .setScale(TOTEM_VISUAL_SCALE * (0.72 + eased * 0.28))
        .setAlpha(1);
      slot.shadow.setScale(0.38 + eased * 0.72).setAlpha(0.08 + eased * 0.34);
    } else {
      if (!slot.impacted) this.beginImpact(slot, now);
      const impactElapsed = now - slot.impactAt;
      const settle = 1 + Math.sin(clamp01(impactElapsed / 240) * Math.PI) * 0.16;
      slot.rig.setPosition(0, 0).setScale(TOTEM_VISUAL_SCALE * settle).setAlpha(1);
      slot.shadow.setScale(1).setAlpha(0.38);
      this.updatePoweredRig(slot, now, impactElapsed);
    }

    this.updateFissures(slot, now);
    this.updateImpactDebris(slot, now);
    this.drawDynamicEffects(slot, now);
    if (slot.resolvingAt > 0) {
      const resolveProgress = clamp01((now - slot.resolvingAt) / 220);
      slot.rig.setScale(TOTEM_VISUAL_SCALE * (1 + resolveProgress * 0.45)).setAlpha(1 - resolveProgress);
      slot.ground.setAlpha(1 - resolveProgress);
    }
  }

  private beginImpact(slot: TotemSlot, now: number): void {
    slot.impacted = true;
    slot.impactAt = now;
    this.drawFissures(slot);
    slot.fissures.setVisible(true).setAlpha(1);
    slot.fissureBranches.setVisible(true).setAlpha(1);
    slot.debris.setVisible(true).setAlpha(1);
    slot.lastDebrisFrame = -1;
    this.scene.cameras.main.shake(105, 0.0018, false);
  }

  private updatePoweredRig(slot: TotemSlot, now: number, impactElapsed: number): void {
    const powered = easeOutCubic(clamp01(impactElapsed / POWER_UP_MS));
    const idlePulse = 1 + Math.sin(now * 0.0042 + slot.phase) * 0.055;
    const charging = now < slot.chargeUntil;
    const chargeProgress = charging
      ? clamp01((now - slot.chargeStartedAt) / Math.max(1, slot.chargeUntil - slot.chargeStartedAt))
      : 0;
    const activeColor = charging ? slot.chargeColor : 0x63efff;
    const chargeBoost = charging ? 0.35 + chargeProgress * 0.65 : 0;

    slot.core.setFillStyle(activeColor, 0.92).setAlpha(0.28 + powered * 0.72).setScale((0.58 + powered * 0.42 + chargeBoost * 0.18) * idlePulse);
    slot.coreGlow.setFillStyle(activeColor, 0.2 + chargeBoost * 0.2).setAlpha(powered * (0.34 + chargeBoost * 0.6)).setScale(idlePulse + chargeBoost * 0.35);
    slot.channels.setAlpha(powered * (0.42 + chargeBoost * 0.58));
    slot.face.setAlpha(powered * (0.7 + idlePulse * 0.22 + chargeBoost * 0.08));
    slot.innerRing.setStrokeStyle(charging ? 3 : 2, activeColor, 0.42 + powered * 0.45).setAlpha(powered);
    slot.outerRing.setStrokeStyle(charging ? 3 : 2, charging ? activeColor : 0xff5bd6, 0.34 + powered * 0.4).setAlpha(powered * 0.9);
    slot.innerRing.setRotation(now * 0.00085 + slot.phase);
    slot.outerRing.setRotation(-now * 0.00052 - slot.phase);
    slot.body.setAlpha(0.72 + powered * 0.28);
  }

  private drawFissures(slot: TotemSlot): void {
    const primary = slot.fissures;
    const branches = slot.fissureBranches;
    primary.clear();
    branches.clear();
    const primaryRayCount = 11;
    for (let ray = 0; ray < primaryRayCount; ray += 1) {
      const color = ray % 3 === 0 ? 0xff5bd6 : ray % 2 === 0 ? 0x63efff : 0x8b7dff;
      const baseAngle = ray / primaryRayCount * TAU + slot.phase + (seededUnit(ray, 19) - 0.5) * 0.31;
      const targetLength = 112 + seededUnit(ray, 20) * 66;
      const startRadius = 20 + seededUnit(ray, 21) * 9;
      let previousX = Math.cos(baseAngle) * startRadius;
      let previousY = Math.sin(baseAngle) * startRadius;

      for (let segment = 1; segment <= 6; segment += 1) {
        const distance = startRadius + targetLength * (segment / 6);
        const bend = Math.sin((ray + 1) * (segment + 2) * 1.713 + slot.phase) * (0.11 + segment * 0.012);
        const angle = baseAngle + bend;
        const nextX = Math.cos(angle) * distance;
        const nextY = Math.sin(angle) * distance;
        const width = Math.max(1.5, (ray % 4 === 0 ? 5.4 : 4.1) - segment * 0.42);
        const gap = segment >= 4 && (ray + segment) % 4 === 0 ? 0.86 : 1;
        const endX = previousX + (nextX - previousX) * gap;
        const endY = previousY + (nextY - previousY) * gap;
        this.drawCrackSegment(primary, previousX, previousY, endX, endY, color, width, 0.92);

        if ((segment === 2 || segment === 4) && (ray + segment) % 3 !== 1) {
          const direction = (ray + segment) % 2 === 0 ? 1 : -1;
          const branchAngle = angle + direction * (0.36 + seededUnit(ray * 7 + segment, 22) * 0.3);
          const branchLength = 25 + seededUnit(ray * 7 + segment, 23) * 27;
          const branchMidX = nextX + Math.cos(branchAngle) * branchLength * 0.56;
          const branchMidY = nextY + Math.sin(branchAngle) * branchLength * 0.56;
          const branchEndAngle = branchAngle - direction * (0.08 + seededUnit(ray + segment, 24) * 0.16);
          const branchEndX = branchMidX + Math.cos(branchEndAngle) * branchLength * 0.44;
          const branchEndY = branchMidY + Math.sin(branchEndAngle) * branchLength * 0.44;
          this.drawCrackSegment(branches, nextX, nextY, branchMidX, branchMidY, color, Math.max(1.2, width * 0.55), 0.76);
          this.drawCrackSegment(branches, branchMidX, branchMidY, branchEndX, branchEndY, color, Math.max(1, width * 0.38), 0.66);

          if ((ray + segment) % 2 === 0) {
            const offshootAngle = branchAngle - direction * 0.58;
            const offshootLength = 12 + seededUnit(ray * 11 + segment, 25) * 15;
            this.drawCrackSegment(
              branches,
              branchMidX,
              branchMidY,
              branchMidX + Math.cos(offshootAngle) * offshootLength,
              branchMidY + Math.sin(offshootAngle) * offshootLength,
              color,
              1,
              0.54
            );
          }
        }
        previousX = nextX;
        previousY = nextY;
      }
    }
  }

  private drawCrackSegment(
    graphics: Phaser.GameObjects.Graphics,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    color: number,
    width: number,
    alpha: number
  ): void {
    graphics.lineStyle(width + 5, color, alpha * 0.11).lineBetween(startX, startY, endX, endY);
    graphics.lineStyle(width, color, alpha * 0.6).lineBetween(startX, startY, endX, endY);
    graphics.lineStyle(Math.max(0.8, width * 0.3), 0xeaffff, alpha * 0.88).lineBetween(startX, startY, endX, endY);
  }

  private updateFissures(slot: TotemSlot, now: number): void {
    if (!slot.impacted || !slot.fissures.visible) return;
    const elapsed = now - slot.impactAt;
    const primaryFade = elapsed <= FISSURE_HOLD_MS
      ? 1
      : 1 - clamp01((elapsed - FISSURE_HOLD_MS) / FISSURE_FADE_MS);
    const branchFade = elapsed <= FISSURE_BRANCH_HOLD_MS
      ? 1
      : 1 - clamp01((elapsed - FISSURE_BRANCH_HOLD_MS) / FISSURE_BRANCH_FADE_MS);
    const primaryFlicker = 0.82 + Math.sin(elapsed * 0.021) * 0.12 + Math.sin(elapsed * 0.057 + slot.phase) * 0.06;
    const branchFlicker = Math.floor(elapsed / 83) % 9 === 2
      ? 0.38
      : 0.66 + Math.sin(elapsed * 0.033 + slot.phase * 2) * 0.2;
    slot.fissures.setAlpha(Math.max(0, primaryFade * primaryFlicker));
    slot.fissureBranches.setAlpha(Math.max(0, branchFade * branchFlicker));
    if (primaryFade <= 0) slot.fissures.setVisible(false);
    if (branchFade <= 0) slot.fissureBranches.setVisible(false);
  }

  private updateImpactDebris(slot: TotemSlot, now: number): void {
    if (!slot.impacted || !slot.debris.visible) return;
    const elapsed = now - slot.impactAt;
    if (elapsed >= DEBRIS_MAX_LIFETIME_MS) {
      slot.debris.clear().setVisible(false);
      return;
    }
    const frame = Math.floor(elapsed / DEBRIS_DRAW_INTERVAL_MS);
    if (frame === slot.lastDebrisFrame) return;
    slot.lastDebrisFrame = frame;
    this.drawImpactDebris(slot, elapsed);
  }

  private drawImpactDebris(slot: TotemSlot, elapsed: number): void {
    const graphics = slot.debris;
    graphics.clear();
    const phaseCos = Math.cos(slot.phase);
    const phaseSin = Math.sin(slot.phase);

    for (let index = 0; index < DEBRIS_COUNT; index += 1) {
      const age = elapsed - DEBRIS_DELAY[index];
      if (age < 0 || age >= DEBRIS_LIFETIME[index]) continue;
      const progress = clamp01(age / DEBRIS_LIFETIME[index]);
      const glitchFrame = Math.floor((elapsed + index * 47) / 58);
      const glitchState = (glitchFrame + index * 3) % 17;
      if (glitchState === 0 || (index % 7 === 0 && glitchState === 6)) continue;

      const directionX = DEBRIS_COS[index] * phaseCos - DEBRIS_SIN[index] * phaseSin;
      const directionY = DEBRIS_SIN[index] * phaseCos + DEBRIS_COS[index] * phaseSin;
      const travel = easeOutCubic(progress);
      const distance = DEBRIS_DISTANCE[index] * travel;
      const lateral = Math.sin(progress * Math.PI * 2 + index) * (index % 3) * 1.4;
      const floorX = directionX * distance - directionY * lateral;
      const floorY = directionY * distance + directionX * lateral;
      const height = Math.sin(progress * Math.PI) * DEBRIS_HEIGHT[index];
      const fragmentX = floorX;
      const fragmentY = floorY - height;
      const fadeStart = index < LARGE_DEBRIS_COUNT ? 0.72 : index < MEDIUM_DEBRIS_COUNT ? 0.62 : 0.48;
      const fade = progress <= fadeStart ? 1 : 1 - clamp01((progress - fadeStart) / (1 - fadeStart));
      const color = index % 5 === 0 ? 0xffffff : index % 3 === 0 ? 0xff5bd6 : index % 2 === 0 ? 0x63efff : 0x8b7dff;
      const size = DEBRIS_SIZE[index];

      graphics.fillStyle(0x00040a, 0.18 * fade).fillEllipse(floorX, floorY + 2, size * (2.1 - progress * 0.5), size * 0.62);
      graphics.lineStyle(index < MEDIUM_DEBRIS_COUNT ? 1.2 : 0.8, color, 0.2 * fade)
        .lineBetween(fragmentX - directionX * size * 2.4, fragmentY + directionY * size * 0.5, fragmentX, fragmentY);

      const rotation = slot.phase + index * 0.61 + progress * DEBRIS_SPIN[index];
      const rotationCos = Math.cos(rotation);
      const rotationSin = Math.sin(rotation);
      const type = DEBRIS_TYPE[index];
      const halfWidth = size * (type === 1 ? 1.48 : type === 3 ? 1.16 : 1);
      const halfHeight = size * (type === 1 ? 0.28 : type === 2 ? 0.7 : 0.58);
      const axisX = rotationCos * halfWidth;
      const axisY = rotationSin * halfWidth;
      const normalX = -rotationSin * halfHeight;
      const normalY = rotationCos * halfHeight;
      const x1 = fragmentX - axisX - normalX;
      const y1 = fragmentY - axisY - normalY;
      const x2 = fragmentX + axisX - normalX;
      const y2 = fragmentY + axisY - normalY;
      const x3 = fragmentX + axisX + normalX;
      const y3 = fragmentY + axisY + normalY;
      const x4 = fragmentX - axisX + normalX;
      const y4 = fragmentY - axisY + normalY;

      if (type === 2) {
        graphics.fillStyle(index < MEDIUM_DEBRIS_COUNT ? 0x081522 : color, (index < MEDIUM_DEBRIS_COUNT ? 0.84 : 0.42) * fade)
          .fillTriangle(x1, y1, x2, y2, x3, y3);
        graphics.lineStyle(index < LARGE_DEBRIS_COUNT ? 2 : 1, color, 0.86 * fade)
          .lineBetween(x1, y1, x2, y2)
          .lineBetween(x2, y2, x3, y3)
          .lineBetween(x3, y3, x1, y1);
      } else if (type === 3) {
        graphics.lineStyle(index < MEDIUM_DEBRIS_COUNT ? 2.4 : 1.4, color, 0.88 * fade)
          .lineBetween(x1, y1, x3, y3)
          .lineBetween(fragmentX, fragmentY, x2, y2);
        graphics.fillStyle(0xeaffff, 0.86 * fade).fillCircle(fragmentX, fragmentY, Math.max(1, size * 0.2));
      } else {
        graphics.fillStyle(0x07131d, 0.86 * fade)
          .fillTriangle(x1, y1, x2, y2, x3, y3)
          .fillTriangle(x1, y1, x3, y3, x4, y4);
        graphics.lineStyle(index < LARGE_DEBRIS_COUNT ? 2.2 : 1.2, color, 0.9 * fade)
          .lineBetween(x1, y1, x2, y2)
          .lineBetween(x2, y2, x3, y3)
          .lineBetween(x3, y3, x4, y4)
          .lineBetween(x4, y4, x1, y1);
        graphics.lineStyle(0.8, 0xeaffff, 0.46 * fade).lineBetween(x1, y1, x3, y3);
      }

      if (index % 3 === 0) {
        const glitchOffset = glitchState % 2 === 0 ? 3 : -3;
        graphics.lineStyle(Math.max(1, size * 0.18), color, 0.4 * fade)
          .lineBetween(fragmentX - halfWidth, fragmentY + glitchOffset, fragmentX + halfWidth * 0.72, fragmentY + glitchOffset);
      }
      if (index % 5 === 0) {
        graphics.fillStyle(color, 0.15 * fade).fillRect(fragmentX + 3, fragmentY - 2, Math.max(2, size * 1.2), Math.max(1, size * 0.3));
      }
      if (index % 2 === 0) {
        const pixelDistance = size * (2.1 + progress * 2.4);
        graphics.fillStyle(index % 4 === 0 ? 0xffffff : color, 0.62 * fade)
          .fillRect(
            fragmentX - directionX * pixelDistance - 1,
            fragmentY - directionY * pixelDistance - 1,
            index < MEDIUM_DEBRIS_COUNT ? 2 : 1.5,
            index < MEDIUM_DEBRIS_COUNT ? 2 : 1.5
          );
      }
    }
  }

  private drawDynamicEffects(slot: TotemSlot, now: number): void {
    const graphics = slot.dynamic;
    graphics.clear();
    if (!slot.impacted) {
      if (now >= slot.deployedAt + TARGETING_MS) {
        const trailProgress = clamp01((now - slot.deployedAt - TARGETING_MS) / DROP_MS);
        graphics.lineStyle(4, 0x63efff, 0.5 * trailProgress);
        graphics.lineBetween(0, -DROP_HEIGHT * (1 - trailProgress), 0, -12);
      }
      return;
    }

    const impactElapsed = now - slot.impactAt;
    if (impactElapsed < IMPACT_FLASH_MS) this.drawImpact(graphics, impactElapsed);

    if (now < slot.chargeUntil) this.drawCharge(graphics, slot, now);
    if (slot.pulseStartedAt > 0 && now >= slot.pulseStartedAt) {
      const progress = clamp01((now - slot.pulseStartedAt) / slot.pulseDurationMs);
      if (progress < 1) this.drawPulse(graphics, slot, progress);
      else slot.pulseStartedAt = 0;
    }
    const flashProgress = clamp01((now - slot.flashStartedAt) / 180);
    if (slot.flashStartedAt > 0 && flashProgress < 1) {
      graphics.fillStyle(slot.flashColor, 0.26 * (1 - flashProgress)).fillCircle(0, 0, 24 + flashProgress * 20);
    }
  }

  private drawImpact(graphics: Phaser.GameObjects.Graphics, elapsed: number): void {
    const progress = easeOutCubic(clamp01(elapsed / 420));
    const fade = 1 - clamp01(elapsed / IMPACT_FLASH_MS);
    graphics.fillStyle(0xffffff, 0.68 * Math.max(0, 1 - elapsed / 105)).fillCircle(0, 0, 8 + progress * 20);
    graphics.fillStyle(0x63efff, 0.12 * fade).fillCircle(0, 0, 28 + progress * 48);
    graphics.lineStyle(5 - progress * 3, 0x63efff, 0.9 * fade).strokeCircle(0, 0, 18 + progress * 78);
    graphics.lineStyle(2, 0xff5bd6, 0.68 * fade).strokeCircle(0, 0, 10 + progress * 104);
    graphics.lineStyle(1.5, 0xffffff, 0.42 * fade).strokeEllipse(0, 8, 35 + progress * 190, 15 + progress * 72);
    for (let ray = 0; ray < RAY_COUNT; ray += 1) {
      const inner = 18 + progress * 20;
      const outer = 34 + progress * (50 + (ray % 3) * 9);
      graphics.lineStyle(ray % 3 === 0 ? 3 : 2, ray % 2 === 0 ? 0x63efff : 0xff5bd6, 0.68 * fade);
      graphics.lineBetween(RAY_COS[ray] * inner, RAY_SIN[ray] * inner, RAY_COS[ray] * outer, RAY_SIN[ray] * outer);
    }
    graphics.lineStyle(5, 0xffffff, 0.42 * fade).lineBetween(0, -165 * fade, 0, -12);
    graphics.lineStyle(2, 0x63efff, 0.52 * fade).lineBetween(-9, -145 * fade, -2, -10);
    graphics.lineStyle(2, 0xff5bd6, 0.46 * fade).lineBetween(10, -132 * fade, 3, -8);
  }

  private drawCharge(graphics: Phaser.GameObjects.Graphics, slot: TotemSlot, now: number): void {
    const progress = clamp01((now - slot.chargeStartedAt) / Math.max(1, slot.chargeUntil - slot.chargeStartedAt));
    const radius = 62 - progress * 35;
    graphics.lineStyle(2 + progress * 2, slot.chargeColor, 0.28 + progress * 0.7).strokeCircle(0, 0, radius);
    for (let index = 0; index < 8; index += 1) {
      const ray = index * 2 % RAY_COUNT;
      const outer = radius + 15;
      graphics.lineStyle(2, slot.chargeColor, 0.58 + progress * 0.35);
      graphics.lineBetween(RAY_COS[ray] * outer, RAY_SIN[ray] * outer, RAY_COS[ray] * radius, RAY_SIN[ray] * radius);
    }
  }

  private drawPulse(graphics: Phaser.GameObjects.Graphics, slot: TotemSlot, progress: number): void {
    const eased = easeOutCubic(progress);
    const fade = (1 - progress) ** 1.45;
    const radius = 18 + (slot.pulseRadius - 18) * eased;
    const isDamage = slot.pulseKind === 'damage';
    const isPush = slot.pulseKind === 'push';
    graphics.fillStyle(slot.pulseColor, (isDamage ? 0.12 : 0.07) * fade).fillCircle(0, 0, radius);
    graphics.lineStyle(isDamage ? 5 : 4, slot.pulseColor, 0.94 * fade).strokeCircle(0, 0, radius);
    graphics.lineStyle(2, isDamage ? 0xff3f2f : 0xffffff, 0.54 * fade).strokeCircle(0, 0, radius * 0.84);
    graphics.lineStyle(1.5, isDamage ? 0xffd45e : 0x63efff, 0.46 * fade).strokeCircle(0, 0, radius * 1.08);
    graphics.lineStyle(isDamage ? 3 : 2, 0xffffff, 0.34 * fade).strokeEllipse(0, 4, radius * 2.2, radius * (isPush ? 0.62 : 0.82));
    graphics.fillStyle(isDamage ? 0xffffff : slot.pulseColor, 0.5 * fade).fillRect(-3, -30 * fade, 6, 30 * fade);
    const streakCount = slot.pulseKind === 'push' ? 14 : isDamage ? 12 : 8;
    for (let index = 0; index < streakCount; index += 1) {
      const ray = index % RAY_COUNT;
      const inner = radius * (slot.pulseKind === 'push' ? 0.72 : 0.82);
      const outer = radius + (slot.pulseKind === 'push' ? 22 : isDamage ? 13 + (index % 3) * 5 : 8);
      graphics.lineStyle(isDamage && index % 3 === 0 ? 3 : 2, index % 2 === 0 ? slot.pulseColor : 0xffffff, 0.62 * fade);
      graphics.lineBetween(RAY_COS[ray] * inner, RAY_SIN[ray] * inner, RAY_COS[ray] * outer, RAY_SIN[ray] * outer);
      const fragmentSize = isDamage ? 4 + (index % 3) : 3 + (index % 2);
      const fragmentX = RAY_COS[ray] * (outer + progress * (isPush ? 16 : 8));
      const fragmentY = RAY_SIN[ray] * (outer + progress * (isPush ? 16 : 8));
      if (isDamage && index % 2 === 0) {
        const tangentX = -RAY_SIN[ray] * fragmentSize;
        const tangentY = RAY_COS[ray] * fragmentSize;
        graphics.fillStyle(index % 3 === 0 ? 0xffffff : slot.pulseColor, 0.74 * fade).fillTriangle(
          fragmentX + RAY_COS[ray] * fragmentSize * 1.8,
          fragmentY + RAY_SIN[ray] * fragmentSize * 1.8,
          fragmentX + tangentX,
          fragmentY + tangentY,
          fragmentX - tangentX,
          fragmentY - tangentY
        );
      } else {
        graphics.fillStyle(index % 2 === 0 ? slot.pulseColor : 0xffffff, 0.64 * fade)
          .fillRect(fragmentX - fragmentSize * 0.5, fragmentY - fragmentSize * 0.5, fragmentSize, fragmentSize);
      }
      if (isDamage && index % 3 === 0) {
        const arcRadius = radius * (0.56 + (index % 4) * 0.08);
        const start = index * TAU / streakCount + progress * 1.4;
        graphics.lineStyle(2, 0xffffff, 0.7 * fade);
        graphics.beginPath();
        graphics.arc(0, 0, arcRadius, start, start + 0.48, false);
        graphics.strokePath();
      }
    }
  }

  private find(siteId: string): TotemSlot | null {
    for (const slot of this.slots) if (slot.active && slot.siteId === siteId) return slot;
    return null;
  }

  private release(slot: TotemSlot): void {
    slot.active = false;
    slot.siteId = '';
    slot.root.setVisible(false).setActive(false).setAlpha(1);
    slot.fissures.clear();
    slot.fissureBranches.clear();
    slot.debris.clear();
    slot.dynamic.clear();
    slot.lastDebrisFrame = -1;
    slot.chargeUntil = 0;
    slot.pulseStartedAt = 0;
    slot.flashStartedAt = 0;
    slot.resolvingAt = 0;
  }

  private sitePhase(siteId: string): number {
    let hash = 0;
    for (let index = 0; index < siteId.length; index += 1) hash = (hash * 31 + siteId.charCodeAt(index)) | 0;
    return Math.abs(hash % 6283) / 1000;
  }
}

export const BOMBSITE_TOTEM_LIMIT = MAX_ACTIVE_TOTEMS;
