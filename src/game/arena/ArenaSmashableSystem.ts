import Phaser from 'phaser';
import type { ArenaSmashablePlacement } from '../types.ts';
import {
  ARENA_SMASHABLE_DEFINITIONS,
  ARENA_SMASHABLE_DURABILITY,
  resolveSmashableLootDrops,
  smashableLootChance,
  type ArenaSmashableDefinition,
  type ArenaSmashableLoot,
  type SmashableDestructionFamily,
  type SmashableEnvironment
} from './ArenaSmashableDefinitions.ts';

interface SmashableRuntime {
  placement: ArenaSmashablePlacement;
  definition: ArenaSmashableDefinition;
  root: Phaser.GameObjects.Container;
  art: Phaser.GameObjects.Graphics;
  hp: number;
  maximumHp: number;
  damageStage: number;
  active: boolean;
}

interface DestructionBurst {
  active: boolean;
  prop: SmashableRuntime | null;
  x: number;
  y: number;
  width: number;
  height: number;
  accent: number;
  startedAt: number;
  phase: number;
  family: SmashableDestructionFamily;
}

export interface ArenaSmashableDiagnostics {
  total: number;
  active: number;
  activeDestructionBursts: number;
  destructionSlots: number;
  physicsBodies: 0;
  updateLoops: 1;
}

const DEFINITIONS = new Map(ARENA_SMASHABLE_DEFINITIONS.map((definition) => [definition.kind, definition]));
const MAX_BURSTS = 8;
const BURST_LIFETIME_MS = 1_180;

const rotatedRectangle = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  color: number,
  alpha: number
): void => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const x1 = x - halfWidth * cos + halfHeight * sin;
  const y1 = y - halfWidth * sin - halfHeight * cos;
  const x2 = x + halfWidth * cos + halfHeight * sin;
  const y2 = y + halfWidth * sin - halfHeight * cos;
  const x3 = x + halfWidth * cos - halfHeight * sin;
  const y3 = y + halfWidth * sin + halfHeight * cos;
  const x4 = x - halfWidth * cos - halfHeight * sin;
  const y4 = y - halfWidth * sin + halfHeight * cos;
  graphics.fillStyle(color, alpha)
    .fillTriangle(x1, y1, x2, y2, x3, y3)
    .fillTriangle(x1, y1, x3, y3, x4, y4);
};

/**
 * Shared Arena/HEIST environmental prop runtime. It owns no physics bodies,
 * listeners, or per-prop timers. Damage is event-driven, damage-state redraws
 * happen only at thresholds, and all breakup animation uses two fixed batched
 * Graphics layers with eight reusable burst records.
 */
export class ArenaSmashableSystem {
  private readonly props: SmashableRuntime[] = [];
  private readonly destructionGraphics: Phaser.GameObjects.Graphics;
  private readonly destructionGlowGraphics: Phaser.GameObjects.Graphics;
  private readonly bursts: DestructionBurst[];
  private activeBurstCount = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    placements: readonly ArenaSmashablePlacement[],
    private readonly onLoot: (type: ArenaSmashableLoot, x: number, y: number) => void,
    private readonly particlesEnabled: boolean,
    private readonly environment: SmashableEnvironment = 'arena'
  ) {
    this.destructionGraphics = scene.add.graphics().setDepth(13.55);
    this.destructionGlowGraphics = scene.add.graphics().setDepth(13.6).setBlendMode(Phaser.BlendModes.ADD);
    this.bursts = Array.from({ length: MAX_BURSTS }, () => ({
      active: false, prop: null, x: 0, y: 0, width: 0, height: 0,
      accent: 0xffffff, startedAt: 0, phase: 0, family: 'equipment'
    }));
    for (const placement of placements) {
      const definition = DEFINITIONS.get(placement.kind);
      if (!definition) continue;
      const art = scene.add.graphics();
      const root = scene.add.container(placement.x, placement.y, [art])
        .setRotation(placement.rotation)
        .setDepth(4.4 + placement.y * 0.0001);
      const maximumHp = ARENA_SMASHABLE_DURABILITY[placement.durability];
      const runtime: SmashableRuntime = {
        placement, definition, root, art, hp: maximumHp, maximumHp, damageStage: 0, active: true
      };
      this.drawProp(runtime);
      this.props.push(runtime);
    }
  }

  hasTargetAt(x: number, y: number, padding = 0): boolean {
    return this.props.some((prop) => prop.active && this.contains(prop, x, y, padding));
  }

  damagePoint(x: number, y: number, damage: number, padding = 4): boolean {
    if (damage <= 0) return false;
    for (const prop of this.props) {
      if (!prop.active || !this.contains(prop, x, y, padding)) continue;
      this.applyDamage(prop, damage);
      return true;
    }
    return false;
  }

  damageArea(x: number, y: number, radius: number, damage: number): number {
    if (radius <= 0 || damage <= 0) return 0;
    let hits = 0;
    for (const prop of this.props) {
      if (!prop.active) continue;
      const dx = prop.placement.x - x;
      const dy = prop.placement.y - y;
      const reach = Math.max(prop.placement.width, prop.placement.height) * 0.5;
      const combinedReach = radius + reach;
      if (dx * dx + dy * dy > combinedReach * combinedReach) continue;
      this.applyDamage(prop, damage);
      hits += 1;
    }
    return hits;
  }

  update(now: number): void {
    if (this.activeBurstCount === 0) return;
    this.destructionGraphics.clear();
    this.destructionGlowGraphics.clear();
    for (const burst of this.bursts) {
      if (!burst.active) continue;
      const progress = (now - burst.startedAt) / BURST_LIFETIME_MS;
      if (progress >= 1) {
        burst.active = false;
        burst.prop?.root.setVisible(false).setActive(false).setAlpha(1);
        burst.prop = null;
        this.activeBurstCount -= 1;
        continue;
      }
      if (burst.prop && progress > 0.58) burst.prop.root.setAlpha(1 - (progress - 0.58) / 0.42);
      this.drawDestructionBurst(burst, progress);
    }
    if (this.activeBurstCount === 0) {
      this.destructionGraphics.clear();
      this.destructionGlowGraphics.clear();
    }
  }

  diagnostics(): ArenaSmashableDiagnostics {
    let active = 0;
    for (const prop of this.props) if (prop.active) active += 1;
    return {
      total: this.props.length,
      active,
      activeDestructionBursts: this.activeBurstCount,
      destructionSlots: MAX_BURSTS,
      physicsBodies: 0,
      updateLoops: 1
    };
  }

  destroy(): void {
    for (const prop of this.props) prop.root.destroy(true);
    this.props.length = 0;
    for (const burst of this.bursts) { burst.active = false; burst.prop = null; }
    this.activeBurstCount = 0;
    this.destructionGraphics.destroy();
    this.destructionGlowGraphics.destroy();
  }

  /** Used by HEIST's shutdown callback after Phaser has already released the
   * Scene display graph. This avoids double-destruction while dropping refs. */
  discardReferences(): void {
    this.props.length = 0;
    for (const burst of this.bursts) { burst.active = false; burst.prop = null; }
    this.activeBurstCount = 0;
  }

  private contains(prop: SmashableRuntime, x: number, y: number, padding: number): boolean {
    const dx = x - prop.placement.x;
    const dy = y - prop.placement.y;
    const vertical = Math.abs(Math.sin(prop.placement.rotation)) > 0.5;
    const localX = vertical ? dy : dx;
    const localY = vertical ? -dx : dy;
    return Math.abs(localX) <= prop.placement.width * 0.5 + padding
      && Math.abs(localY) <= prop.placement.height * 0.5 + padding;
  }

  private applyDamage(prop: SmashableRuntime, damage: number): void {
    prop.hp = Math.max(0, prop.hp - damage);
    const nextStage = prop.hp <= prop.maximumHp * 0.34 ? 2 : prop.hp <= prop.maximumHp * 0.68 ? 1 : 0;
    if (nextStage !== prop.damageStage) {
      prop.damageStage = nextStage;
      this.drawProp(prop);
    }
    if (prop.hp > 0) return;
    prop.active = false;
    prop.damageStage = 3;
    this.drawProp(prop);
    this.beginBurst(prop);
    if (prop.placement.lootRoll >= smashableLootChance(prop.definition, this.environment)) return;
    const lootRoll = (prop.placement.lootRoll * 3.731 + prop.placement.x * 0.00031
      + prop.placement.y * 0.00017 + 0.173) % 1;
    const drops = resolveSmashableLootDrops(this.environment, lootRoll);
    drops.forEach((type, index) => this.onLoot(type,
      prop.placement.x + (index * 2 - drops.length + 1) * 16,
      prop.placement.y - index * 7));
  }

  private beginBurst(prop: SmashableRuntime): void {
    const state = this.bursts.find((burst) => !burst.active) ?? this.bursts[0];
    if (state.active) state.prop?.root.setVisible(false).setActive(false).setAlpha(1);
    else this.activeBurstCount += 1;
    state.active = true;
    state.prop = prop;
    state.x = prop.placement.x;
    state.y = prop.placement.y;
    state.width = prop.placement.width;
    state.height = prop.placement.height;
    state.accent = prop.placement.accent;
    state.startedAt = this.scene.time.now;
    state.phase = (state.x * 0.013 + state.y * 0.021) % (Math.PI * 2);
    state.family = prop.definition.destructionFamily;
  }

  private drawDestructionBurst(burst: DestructionBurst, progress: number): void {
    const fade = (1 - progress) ** 1.45;
    const ballistic = progress * progress;
    const fragmentCount = this.particlesEnabled ? 13 : 8;
    const spreadMultiplier = burst.family === 'power' ? 1.22 : burst.family === 'cabinet' ? 0.92 : 1;
    const spread = (18 + progress * 82) * spreadMultiplier;
    const glow = this.destructionGlowGraphics;
    const debris = this.destructionGraphics;

    glow.lineStyle(2.8 * fade, burst.accent, 0.78 * fade).strokeCircle(burst.x, burst.y, 10 + progress * 54);
    glow.fillStyle(burst.accent, 0.12 * fade).fillCircle(burst.x, burst.y, 15 + progress * 38);
    const smokeCount = this.particlesEnabled ? 5 : 3;
    for (let index = 0; index < smokeCount; index += 1) {
      const angle = burst.phase + index * 2.17;
      const drift = progress * (18 + index * 5);
      debris.fillStyle(index % 2 ? 0x16202b : 0x273443, 0.24 * fade)
        .fillCircle(burst.x + Math.cos(angle) * drift,
          burst.y - progress * (20 + index * 6) + Math.sin(angle) * 5,
          7 + progress * (8 + index));
    }

    for (let index = 0; index < fragmentCount; index += 1) {
      const angle = burst.phase + index * Math.PI * 2 / fragmentCount;
      const distance = spread * (0.68 + index % 4 * 0.11);
      const px = burst.x + Math.cos(angle) * distance;
      const py = burst.y + Math.sin(angle) * distance + ballistic * 34;
      const fragmentAngle = angle + progress * (index % 2 ? 5.4 : -4.7);
      if (burst.family === 'cabinet') {
        const largePanel = index < 2;
        rotatedRectangle(debris, px, py, largePanel ? burst.width * 0.38 : 7 + index % 3 * 3,
          largePanel ? burst.height * 0.42 : 3 + index % 2 * 2,
          fragmentAngle, index % 3 ? 0x244151 : burst.accent, 0.88 * fade);
      } else if (burst.family === 'electronics') {
        if (index % 3 === 0) {
          debris.fillStyle(0x9cecff, 0.72 * fade).fillTriangle(px, py - 5, px + 6, py + 4, px - 4, py + 3);
        } else rotatedRectangle(debris, px, py, 7 + index % 2 * 4, 3, fragmentAngle,
          index % 2 ? 0x193a49 : burst.accent, 0.9 * fade);
        glow.fillStyle(index % 2 ? burst.accent : 0xffffff, 0.75 * fade).fillCircle(px, py, 1.4);
      } else if (burst.family === 'power') {
        const cellRadius = index % 3 === 0 ? 4 : 2;
        debris.fillStyle(index % 2 ? 0x172b34 : burst.accent, 0.9 * fade).fillCircle(px, py, cellRadius);
        glow.lineStyle(1.4, index % 2 ? 0xffffff : burst.accent, 0.8 * fade)
          .lineBetween(burst.x + Math.cos(angle) * 8, burst.y + Math.sin(angle) * 8, px, py);
      } else {
        rotatedRectangle(debris, px, py, 8 + index % 3 * 3, 4 + index % 2 * 2,
          fragmentAngle, index % 3 === 0 ? 0xa9c6cf : 0x203846, 0.88 * fade);
        if (index % 4 === 0) debris.fillStyle(0x05090d, 0.9 * fade).fillCircle(px, py, 4.5);
      }
    }

    const sparkCount = this.particlesEnabled ? 7 : 4;
    for (let index = 0; index < sparkCount; index += 1) {
      const angle = burst.phase * 1.7 + index * 2.39;
      const length = 19 + progress * (32 + index * 2);
      const startX = burst.x + Math.cos(angle) * 7;
      const startY = burst.y + Math.sin(angle) * 7;
      glow.lineStyle(1.2 + index % 2, index % 3 ? burst.accent : 0xffffff, 0.72 * fade)
        .beginPath().moveTo(startX, startY)
        .lineTo(startX + Math.cos(angle + 0.12) * length * 0.48,
          startY + Math.sin(angle + 0.12) * length * 0.48)
        .lineTo(startX + Math.cos(angle - 0.08) * length,
          startY + Math.sin(angle - 0.08) * length).strokePath();
    }
  }

  private drawProp(prop: SmashableRuntime): void {
    const graphics = prop.art;
    const { width, height, accent, kind } = prop.placement;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    const damaged = prop.damageStage;
    graphics.clear();
    graphics.fillStyle(0x000207, 0.44).fillEllipse(5, halfHeight + 6, width * 1.16, 12);
    if (damaged === 3) {
      this.drawDestroyedRemnant(graphics, prop, halfWidth, halfHeight);
      return;
    }

    const depth = 8;
    const squat = kind === 'maintenance-cart' || kind === 'equipment-case' || kind === 'drone-dock';
    graphics.fillStyle(squat ? 0x081520 : 0x07111c, 1).fillRoundedRect(-halfWidth, -halfHeight, width, height, squat ? 5 : 2);
    graphics.lineStyle(2, accent, damaged === 2 ? 0.5 : 0.84).strokeRoundedRect(-halfWidth, -halfHeight, width, height, squat ? 5 : 2);
    graphics.fillStyle(0x102a39, 1).beginPath()
      .moveTo(-halfWidth, -halfHeight).lineTo(-halfWidth + depth, -halfHeight - depth)
      .lineTo(halfWidth + depth, -halfHeight - depth).lineTo(halfWidth, -halfHeight).closePath().fillPath();
    graphics.lineStyle(1.4, accent, 0.62).strokePath();
    graphics.fillStyle(0x020812, 1).beginPath()
      .moveTo(halfWidth, -halfHeight).lineTo(halfWidth + depth, -halfHeight - depth)
      .lineTo(halfWidth + depth, halfHeight - depth).lineTo(halfWidth, halfHeight).closePath().fillPath();
    graphics.lineStyle(1.2, accent, 0.45).strokePath();

    if (prop.definition.destructionFamily === 'cabinet') this.drawCabinetFace(graphics, width, height, accent);
    else if (prop.definition.destructionFamily === 'electronics') this.drawElectronicsFace(graphics, width, height, accent, kind);
    else if (prop.definition.destructionFamily === 'power') this.drawPowerFace(graphics, width, height, accent, kind);
    else this.drawEquipmentFace(graphics, width, height, accent, kind);

    graphics.fillStyle(damaged ? 0xff825e : 0x89ffb6, 0.94).fillCircle(halfWidth - 7, -halfHeight + 6, 2.2);
    if (damaged > 0) this.drawDamage(graphics, prop, halfWidth, halfHeight, damaged);
  }

  private drawCabinetFace(graphics: Phaser.GameObjects.Graphics, width: number, height: number, accent: number): void {
    const top = -height * 0.5 + 8;
    graphics.fillStyle(0x0b202c, 1).fillRect(-width * 0.5 + 6, top, width - 12, height - 15);
    graphics.lineStyle(1.2, accent, 0.62).lineBetween(0, top, 0, height * 0.5 - 7);
    graphics.strokeRect(-width * 0.5 + 6, top, width - 12, height - 15);
    graphics.fillStyle(accent, 0.7).fillRect(-width * 0.29, -3, 4, 2).fillRect(width * 0.2, -3, 4, 2);
    for (let index = 0; index < 3; index += 1) {
      graphics.fillStyle(0x173646, 0.9).fillRect(-width * 0.35, top + 7 + index * 8, width * 0.7, 2);
    }
  }

  private drawElectronicsFace(graphics: Phaser.GameObjects.Graphics, width: number, height: number,
    accent: number, kind: ArenaSmashablePlacement['kind']): void {
    const windowHeight = Math.max(10, height * (kind === 'vending-unit' ? 0.42 : 0.29));
    const top = -height * 0.5 + 8;
    graphics.fillStyle(0x01060b, 1).fillRect(-width * 0.5 + 6, top, width - 12, windowHeight);
    graphics.fillStyle(accent, 0.14).fillRect(-width * 0.5 + 8, top + 2, width - 16, windowHeight - 4);
    graphics.lineStyle(1.2, accent, 0.82).strokeRect(-width * 0.5 + 6, top, width - 12, windowHeight);
    const rows = kind === 'server-tower' ? 5 : 3;
    for (let index = 0; index < rows; index += 1) {
      const y = top + windowHeight + 7 + index * Math.max(4, (height - windowHeight - 20) / rows);
      graphics.fillStyle(index % 2 ? accent : 0x5df7ff, 0.66).fillRect(-width * 0.5 + 8, y, width - 16, 2);
    }
  }

  private drawPowerFace(graphics: Phaser.GameObjects.Graphics, width: number, height: number,
    accent: number, kind: ArenaSmashablePlacement['kind']): void {
    const columns = kind === 'battery-rack' ? 3 : 2;
    const rows = kind === 'neon-canister' ? 2 : 3;
    const cellWidth = (width - 14) / columns;
    const cellHeight = (height - 16) / rows;
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const x = -width * 0.5 + 8 + column * cellWidth + cellWidth * 0.5;
      const y = -height * 0.5 + 9 + row * cellHeight + cellHeight * 0.5;
      graphics.fillStyle(0x02080d, 1).fillRoundedRect(x - cellWidth * 0.36, y - cellHeight * 0.34,
        cellWidth * 0.72, cellHeight * 0.68, 3);
      graphics.fillStyle(accent, 0.28 + (row + column) % 2 * 0.18).fillCircle(x, y, Math.max(2.4, Math.min(cellWidth, cellHeight) * 0.2));
      graphics.lineStyle(1, accent, 0.65).strokeCircle(x, y, Math.max(3.6, Math.min(cellWidth, cellHeight) * 0.27));
    }
  }

  private drawEquipmentFace(graphics: Phaser.GameObjects.Graphics, width: number, height: number,
    accent: number, kind: ArenaSmashablePlacement['kind']): void {
    graphics.lineStyle(1.4, accent, 0.7)
      .strokeRect(-width * 0.5 + 7, -height * 0.5 + 7, width - 14, height - 14);
    graphics.lineBetween(-width * 0.5 + 8, 0, width * 0.5 - 8, 0);
    graphics.fillStyle(accent, 0.65).fillRect(-11, -2, 22, 4);
    if (kind === 'maintenance-cart') {
      graphics.fillStyle(0x010509, 1).fillCircle(-width * 0.31, height * 0.5 - 1, 5)
        .fillCircle(width * 0.31, height * 0.5 - 1, 5);
    } else {
      graphics.fillStyle(0x183847, 1).fillRect(-width * 0.34, -height * 0.22, width * 0.68, 3);
    }
  }

  private drawDamage(graphics: Phaser.GameObjects.Graphics, prop: SmashableRuntime,
    halfWidth: number, halfHeight: number, damaged: number): void {
    graphics.lineStyle(1.6, 0xff7b91, 0.92).beginPath()
      .moveTo(-halfWidth * 0.42, -halfHeight + 8).lineTo(-3, -6)
      .lineTo(-halfWidth * 0.25, 4).lineTo(2, halfHeight - 7).strokePath();
    graphics.fillStyle(0x000207, 0.82).fillCircle(halfWidth * 0.42, -halfHeight * 0.12, 3 + damaged);
    if (damaged < 2) return;
    graphics.fillStyle(0x010306, 0.96).fillRect(-halfWidth + 6, -2, halfWidth * 0.72, halfHeight * 0.78);
    graphics.lineStyle(1.2, prop.placement.accent, 0.9).beginPath()
      .moveTo(-halfWidth + 9, 1).lineTo(-halfWidth + 17, 8).lineTo(-halfWidth + 11, 16).strokePath();
    graphics.lineStyle(1.2, 0xffb46c, 0.85).lineBetween(halfWidth * 0.1, -3, halfWidth * 0.42, 8);
    graphics.fillStyle(0x59636b, 0.3).fillCircle(halfWidth * 0.18, -halfHeight - 4, 5)
      .fillCircle(halfWidth * 0.31, -halfHeight - 9, 7);
  }

  private drawDestroyedRemnant(graphics: Phaser.GameObjects.Graphics, prop: SmashableRuntime,
    halfWidth: number, halfHeight: number): void {
    const accent = prop.placement.accent;
    graphics.fillStyle(0x020407, 0.9).fillEllipse(0, halfHeight * 0.66, prop.placement.width * 1.05, 15);
    if (prop.definition.destructionFamily === 'cabinet') {
      graphics.fillStyle(0x101b23, 1).fillRect(-halfWidth, halfHeight * 0.12, prop.placement.width, halfHeight * 0.72);
      graphics.lineStyle(1.5, accent, 0.45).strokeRect(-halfWidth, halfHeight * 0.12, prop.placement.width, halfHeight * 0.72);
    } else if (prop.definition.destructionFamily === 'electronics') {
      graphics.fillStyle(0x071018, 1).fillRect(-halfWidth, halfHeight * 0.25, prop.placement.width, halfHeight * 0.55);
      graphics.fillStyle(accent, 0.28).fillRect(-halfWidth * 0.72, halfHeight * 0.1, halfWidth * 0.35, 3);
      graphics.fillStyle(0xb8f6ff, 0.38).fillTriangle(-8, 1, 2, 8, -3, 14);
    } else if (prop.definition.destructionFamily === 'power') {
      graphics.fillStyle(0x09131a, 1).fillRoundedRect(-halfWidth, halfHeight * 0.18,
        prop.placement.width, halfHeight * 0.66, 4);
      for (let index = 0; index < 3; index += 1) {
        graphics.fillStyle(index === 1 ? accent : 0x172d37, 0.72).fillCircle(-8 + index * 8, halfHeight * 0.4, 3.5);
      }
    } else {
      graphics.fillStyle(0x111c22, 1).beginPath().moveTo(-halfWidth, halfHeight * 0.25)
        .lineTo(-halfWidth * 0.25, 2).lineTo(halfWidth, halfHeight * 0.16)
        .lineTo(halfWidth * 0.7, halfHeight * 0.75).lineTo(-halfWidth, halfHeight * 0.75).closePath().fillPath();
    }
    graphics.lineStyle(1.2, 0xff6f67, 0.65).lineBetween(-6, halfHeight * 0.18, 1, halfHeight * 0.4);
    graphics.lineStyle(1, accent, 0.48).lineBetween(1, halfHeight * 0.4, 9, halfHeight * 0.12);
  }
}
