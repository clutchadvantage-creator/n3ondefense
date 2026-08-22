import Phaser from 'phaser';
import type { BossArchetype } from '../config/bossBalance.ts';

export type BossCombatVfxKind =
  | 'muzzle-light'
  | 'muzzle-heavy'
  | 'mage-cast'
  | 'mage-volley'
  | 'mage-depart'
  | 'mage-arrive'
  | 'brawler-windup'
  | 'brawler-launch'
  | 'brawler-trail'
  | 'brawler-impact'
  | 'brawler-depart'
  | 'brawler-arrive'
  | 'artillery-impact'
  | 'spawn-artillery'
  | 'spawn-mage'
  | 'spawn-brawler'
  | 'support-artillery'
  | 'support-mage'
  | 'support-brawler';

interface BossCombatVfxState {
  active: boolean;
  kind: BossCombatVfxKind;
  x: number;
  y: number;
  radius: number;
  color: number;
  angle: number;
  startedAt: number;
  durationMs: number;
  phase: number;
}

const TAU = Math.PI * 2;
const MAX_ACTIVE_FULL = 28;
const MAX_ACTIVE_REDUCED = 16;
const RAY_COUNT = 16;
const RAY_COS = new Float32Array(RAY_COUNT);
const RAY_SIN = new Float32Array(RAY_COUNT);

for (let index = 0; index < RAY_COUNT; index += 1) {
  const angle = index / RAY_COUNT * TAU;
  RAY_COS[index] = Math.cos(angle);
  RAY_SIN[index] = Math.sin(angle);
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOut = (value: number): number => 1 - (1 - value) ** 3;
const easeIn = (value: number): number => value ** 3;

/**
 * Bounded, allocation-free renderer for boss anticipation, movement, impact,
 * teleport, and arrival accents. Gameplay timing and hit areas stay in the
 * encounter controller; this class only visualizes the authoritative events.
 */
export class BossCombatVfx {
  private readonly floorGraphics: Phaser.GameObjects.Graphics;
  private readonly energyGraphics: Phaser.GameObjects.Graphics;
  private readonly states: BossCombatVfxState[];
  private sequence = 0;

  constructor(scene: Phaser.Scene, particlesEnabled = true) {
    this.floorGraphics = scene.add.graphics().setDepth(7.2).setBlendMode(Phaser.BlendModes.ADD);
    this.energyGraphics = scene.add.graphics().setDepth(12.4).setBlendMode(Phaser.BlendModes.ADD);
    this.states = Array.from(
      { length: particlesEnabled ? MAX_ACTIVE_FULL : MAX_ACTIVE_REDUCED },
      (): BossCombatVfxState => ({
        active: false,
        kind: 'muzzle-light',
        x: 0,
        y: 0,
        radius: 0,
        color: 0xffffff,
        angle: 0,
        startedAt: 0,
        durationMs: 1,
        phase: 0
      })
    );
  }

  emit(
    kind: BossCombatVfxKind,
    x: number,
    y: number,
    radius: number,
    color: number,
    now: number,
    durationMs: number,
    angle = 0
  ): void {
    let slot = this.states[0];
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const candidate of this.states) {
      if (!candidate.active) {
        slot = candidate;
        oldestAt = Number.NEGATIVE_INFINITY;
        break;
      }
      if (candidate.startedAt < oldestAt) {
        oldestAt = candidate.startedAt;
        slot = candidate;
      }
    }
    slot.active = true;
    slot.kind = kind;
    slot.x = x;
    slot.y = y;
    slot.radius = radius;
    slot.color = color;
    slot.angle = angle;
    slot.startedAt = now;
    slot.durationMs = Math.max(1, durationMs);
    slot.phase = (this.sequence * 2.399963229728653) % TAU;
    this.sequence += 1;
  }

  emitArrival(archetype: BossArchetype, x: number, y: number, color: number, now: number, support = false): void {
    const kind: BossCombatVfxKind = support
      ? archetype === 'artillery' ? 'support-artillery' : archetype === 'storm-mage' ? 'support-mage' : 'support-brawler'
      : archetype === 'artillery' ? 'spawn-artillery' : archetype === 'storm-mage' ? 'spawn-mage' : 'spawn-brawler';
    this.emit(kind, x, y, support ? 58 : 105, color, now, support ? 720 : 1050);
  }

  update(now: number): void {
    this.floorGraphics.clear();
    this.energyGraphics.clear();
    for (const state of this.states) {
      if (!state.active) continue;
      const progress = clamp01((now - state.startedAt) / state.durationMs);
      if (progress >= 1) {
        state.active = false;
        continue;
      }
      this.drawState(state, progress, now);
    }
  }

  reset(): void {
    for (const state of this.states) state.active = false;
    this.floorGraphics.clear();
    this.energyGraphics.clear();
  }

  destroy(): void {
    this.reset();
    this.floorGraphics.destroy();
    this.energyGraphics.destroy();
  }

  get activeCount(): number {
    let count = 0;
    for (const state of this.states) if (state.active) count += 1;
    return count;
  }

  private drawState(state: BossCombatVfxState, progress: number, now: number): void {
    switch (state.kind) {
      case 'muzzle-light':
      case 'muzzle-heavy':
        this.drawMuzzle(state, progress);
        return;
      case 'mage-cast':
      case 'mage-volley':
        this.drawMageCast(state, progress, now);
        return;
      case 'mage-depart':
      case 'mage-arrive':
        this.drawTeleport(state, progress, true);
        return;
      case 'brawler-depart':
      case 'brawler-arrive':
        this.drawTeleport(state, progress, false);
        return;
      case 'brawler-windup':
        this.drawBrawlerWindup(state, progress);
        return;
      case 'brawler-launch':
      case 'brawler-trail':
        this.drawBrawlerMotion(state, progress);
        return;
      case 'brawler-impact':
      case 'artillery-impact':
        this.drawImpact(state, progress);
        return;
      default:
        this.drawArrival(state, progress);
    }
  }

  private drawMuzzle(state: BossCombatVfxState, progress: number): void {
    const heavy = state.kind === 'muzzle-heavy';
    const fade = (1 - progress) ** 1.7;
    const reach = state.radius * (0.45 + easeOut(progress) * (heavy ? 1.15 : 0.8));
    const tangentX = -Math.sin(state.angle);
    const tangentY = Math.cos(state.angle);
    const directionX = Math.cos(state.angle);
    const directionY = Math.sin(state.angle);
    this.energyGraphics.fillStyle(0xffffff, 0.9 * fade).fillCircle(state.x, state.y, (heavy ? 9 : 6) * fade + 2);
    this.energyGraphics.fillStyle(state.color, 0.4 * fade).fillCircle(state.x, state.y, (heavy ? 22 : 15) * (0.6 + progress));
    const half = heavy ? 12 : 7;
    this.energyGraphics.fillStyle(state.color, 0.86 * fade).fillTriangle(
      state.x + tangentX * half,
      state.y + tangentY * half,
      state.x - tangentX * half,
      state.y - tangentY * half,
      state.x + directionX * reach,
      state.y + directionY * reach
    );
    for (let index = 0; index < (heavy ? 7 : 4); index += 1) {
      const spread = (index - (heavy ? 3 : 1.5)) * 0.18;
      const angle = state.angle + spread;
      this.energyGraphics.lineStyle(index % 2 === 0 ? 2 : 1, index % 2 === 0 ? 0xffffff : state.color, 0.7 * fade);
      this.energyGraphics.lineBetween(
        state.x + Math.cos(angle) * 7,
        state.y + Math.sin(angle) * 7,
        state.x + Math.cos(angle) * reach * (0.72 + index * 0.05),
        state.y + Math.sin(angle) * reach * (0.72 + index * 0.05)
      );
    }
  }

  private drawMageCast(state: BossCombatVfxState, progress: number, now: number): void {
    const release = state.kind === 'mage-volley';
    const gather = release ? Math.sin(progress * Math.PI) : easeIn(progress);
    const fade = release ? 1 - progress : 0.35 + progress * 0.65;
    const rotation = state.phase + now * 0.0022 * (release ? -1 : 1);
    const outerRadius = state.radius * (release ? 0.65 + progress * 0.85 : 1.2 - progress * 0.62);
    this.floorGraphics.lineStyle(2 + gather * 2, state.color, 0.55 * fade).strokeCircle(state.x, state.y, outerRadius);
    this.floorGraphics.lineStyle(1.5, 0x67efff, 0.45 * fade).strokeCircle(state.x, state.y, outerRadius * 0.66);
    for (let index = 0; index < 8; index += 1) {
      const angle = rotation + index * TAU / 8;
      const inner = outerRadius * 0.42;
      const outer = outerRadius * (0.86 + (index % 2) * 0.14);
      this.floorGraphics.lineStyle(index % 2 === 0 ? 2.5 : 1.5, index % 3 === 0 ? 0xffffff : state.color, 0.54 * fade);
      this.floorGraphics.lineBetween(
        state.x + Math.cos(angle) * inner,
        state.y + Math.sin(angle) * inner,
        state.x + Math.cos(angle) * outer,
        state.y + Math.sin(angle) * outer
      );
      const fragmentRadius = state.radius * (1.08 - gather * 0.82) + (index % 3) * 4;
      const fx = state.x + Math.cos(-angle) * fragmentRadius;
      const fy = state.y + Math.sin(-angle) * fragmentRadius;
      this.energyGraphics.fillStyle(index % 2 === 0 ? state.color : 0x67efff, 0.82 * fade)
        .fillTriangle(fx, fy - 5, fx + 4, fy + 3, fx - 4, fy + 3);
    }
    this.energyGraphics.fillStyle(state.color, 0.16 * gather).fillCircle(state.x, state.y, 19 + gather * 30);
    this.energyGraphics.fillStyle(0xffffff, 0.58 * gather).fillCircle(state.x, state.y, 5 + gather * 8);
  }

  private drawTeleport(state: BossCombatVfxState, progress: number, elegant: boolean): void {
    const arriving = state.kind.endsWith('arrive');
    const convergence = arriving ? 1 - progress : progress;
    const fade = Math.sin(progress * Math.PI);
    const radius = state.radius * (0.22 + (1 - convergence) * 0.9);
    const accent = elegant ? 0x74efff : 0xff4e82;
    this.floorGraphics.lineStyle(elegant ? 2 : 4, state.color, 0.72 * fade).strokeCircle(state.x, state.y, radius);
    this.floorGraphics.lineStyle(1.5, accent, 0.55 * fade).strokeCircle(state.x, state.y, radius * 0.68);
    for (let index = 0; index < 12; index += 1) {
      const angle = state.phase + index * TAU / 12 + progress * (elegant ? 0.7 : -1.5);
      const distance = state.radius * (0.25 + Math.abs(convergence - 0.5) * 1.3) + (index % 3) * 7;
      const x = state.x + Math.cos(angle) * distance;
      const y = state.y + Math.sin(angle) * distance;
      const targetX = state.x + Math.cos(angle) * radius * 0.18;
      const targetY = state.y + Math.sin(angle) * radius * 0.18;
      this.energyGraphics.lineStyle(index % 3 === 0 ? 3 : 1.5, index % 2 === 0 ? accent : 0xffffff, 0.68 * fade);
      this.energyGraphics.lineBetween(x, y, targetX, targetY);
      if (!elegant) this.energyGraphics.fillStyle(state.color, 0.56 * fade).fillRect(x - 3, y - 2, 6 + (index % 3) * 2, 4);
    }
    if (!elegant) {
      this.energyGraphics.lineStyle(4, 0xffffff, 0.48 * fade)
        .lineBetween(state.x - radius, state.y + radius * 0.25, state.x + radius, state.y - radius * 0.18);
    }
  }

  private drawBrawlerWindup(state: BossCombatVfxState, progress: number): void {
    const pulse = 0.72 + Math.sin(progress * Math.PI * 9) * 0.18;
    const contracting = state.radius * (1.08 - progress * 0.62);
    this.floorGraphics.fillStyle(state.color, 0.035 + progress * 0.08).fillCircle(state.x, state.y, state.radius * 0.72);
    this.floorGraphics.lineStyle(3 + progress * 3, state.color, 0.65 + progress * 0.28).strokeCircle(state.x, state.y, contracting);
    for (let index = 0; index < 10; index += 1) {
      const angle = state.angle + index * TAU / 10;
      const outer = state.radius * (0.9 - progress * 0.54) + (index % 2) * 9;
      const inner = state.radius * 0.18;
      this.floorGraphics.lineStyle(index % 3 === 0 ? 3 : 2, index % 2 === 0 ? state.color : 0xffffff, 0.62 * pulse);
      this.floorGraphics.lineBetween(
        state.x + Math.cos(angle) * outer,
        state.y + Math.sin(angle) * outer,
        state.x + Math.cos(angle) * inner,
        state.y + Math.sin(angle) * inner
      );
    }
  }

  private drawBrawlerMotion(state: BossCombatVfxState, progress: number): void {
    const fade = (1 - progress) ** 1.35;
    const directionX = Math.cos(state.angle);
    const directionY = Math.sin(state.angle);
    const tangentX = -directionY;
    const tangentY = directionX;
    const rear = state.kind === 'brawler-launch' ? state.radius * easeOut(progress) : state.radius * 0.65;
    this.floorGraphics.lineStyle(5, state.color, 0.35 * fade)
      .lineBetween(state.x, state.y, state.x - directionX * rear, state.y - directionY * rear);
    for (let index = 0; index < 7; index += 1) {
      const side = (index - 3) * 6;
      const length = rear * (0.55 + (index % 3) * 0.18);
      this.energyGraphics.lineStyle(index % 2 === 0 ? 3 : 1.5, index % 2 === 0 ? state.color : 0xffffff, 0.7 * fade);
      this.energyGraphics.lineBetween(
        state.x + tangentX * side,
        state.y + tangentY * side,
        state.x - directionX * length + tangentX * side * 1.5,
        state.y - directionY * length + tangentY * side * 1.5
      );
    }
  }

  private drawImpact(state: BossCombatVfxState, progress: number): void {
    const artillery = state.kind === 'artillery-impact';
    const expanded = easeOut(progress);
    const fade = (1 - progress) ** 1.35;
    this.floorGraphics.fillStyle(state.color, 0.09 * fade).fillCircle(state.x, state.y, state.radius * expanded);
    this.floorGraphics.lineStyle(artillery ? 4 : 6, state.color, 0.88 * fade).strokeCircle(state.x, state.y, state.radius * expanded);
    this.floorGraphics.lineStyle(2, 0xffffff, 0.55 * fade).strokeCircle(state.x, state.y, state.radius * expanded * 0.72);
    for (let index = 0; index < RAY_COUNT; index += 1) {
      const distance = state.radius * expanded * (0.45 + (index % 4) * 0.17);
      const height = Math.sin(progress * Math.PI) * state.radius * (0.18 + (index % 3) * 0.06);
      const x = state.x + RAY_COS[index] * distance;
      const y = state.y + RAY_SIN[index] * distance - height;
      const size = 2 + (index % 3) * 1.5;
      this.energyGraphics.fillStyle(index % 3 === 0 ? 0xffffff : state.color, 0.78 * fade)
        .fillTriangle(x, y - size * 1.8, x + size, y + size, x - size, y + size);
      if (!artillery && index % 2 === 0) {
        this.floorGraphics.lineStyle(2, state.color, 0.48 * fade)
          .lineBetween(state.x + RAY_COS[index] * 10, state.y + RAY_SIN[index] * 10, x, y + height);
      }
    }
  }

  private drawArrival(state: BossCombatVfxState, progress: number): void {
    const support = state.kind.startsWith('support-');
    const mage = state.kind.endsWith('mage');
    const brawler = state.kind.endsWith('brawler');
    const fade = Math.sin(progress * Math.PI);
    const beamWidth = state.radius * (support ? 0.24 : 0.36) * (0.4 + fade);
    const ringRadius = state.radius * easeOut(progress);
    this.floorGraphics.lineStyle(support ? 2 : 4, state.color, 0.82 * fade).strokeCircle(state.x, state.y, ringRadius);
    this.floorGraphics.lineStyle(1.5, mage ? 0xb980ff : brawler ? 0xff4e82 : 0xffffff, 0.52 * fade)
      .strokeCircle(state.x, state.y, ringRadius * 0.68);
    this.energyGraphics.fillStyle(state.color, (mage ? 0.12 : 0.08) * fade)
      .fillRect(state.x - beamWidth * 0.5, state.y - state.radius * (1.5 - progress), beamWidth, state.radius * (1.6 - progress * 0.45));
    for (let index = 0; index < (support ? 8 : 14); index += 1) {
      const angle = state.phase + index * TAU / (support ? 8 : 14) + progress * (mage ? 1.4 : -0.45);
      const distance = state.radius * (1.05 - progress * 0.72) + (index % 3) * 7;
      const x = state.x + Math.cos(angle) * distance;
      const y = state.y + Math.sin(angle) * distance - Math.sin(progress * Math.PI) * (index % 4) * 5;
      this.energyGraphics.fillStyle(index % 2 === 0 ? state.color : 0xffffff, 0.72 * fade)
        .fillRect(x - 2, y - 2, support ? 4 : 6, support ? 4 : 6);
    }
  }
}
