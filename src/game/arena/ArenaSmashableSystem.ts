import Phaser from 'phaser';
import type { ArenaSmashablePlacement } from '../types.ts';
import {
  ARENA_SMASHABLE_DEFINITIONS,
  ARENA_SMASHABLE_DURABILITY,
  resolveArenaSmashableLoot,
  type ArenaSmashableDefinition,
  type ArenaSmashableLoot
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
  x: number;
  y: number;
  accent: number;
  startedAt: number;
  phase: number;
}

export interface ArenaSmashableDiagnostics {
  total: number;
  active: number;
  activeDestructionBursts: number;
  physicsBodies: 0;
  updateLoops: 1;
}

const DEFINITIONS = new Map(ARENA_SMASHABLE_DEFINITIONS.map((definition) => [definition.kind, definition]));
const MAX_BURSTS = 8;
const BURST_LIFETIME_MS = 620;

/**
 * Event-driven Arena dressing: no physics bodies, listeners, per-prop timers,
 * or per-prop update loops. Projectile/explosion events query a tiny bounded
 * list and destruction animation is batched into one Graphics object.
 */
export class ArenaSmashableSystem {
  private readonly props: SmashableRuntime[] = [];
  private readonly destructionGraphics: Phaser.GameObjects.Graphics;
  private readonly bursts: DestructionBurst[];
  private activeBurstCount = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    placements: readonly ArenaSmashablePlacement[],
    private readonly onLoot: (type: ArenaSmashableLoot, x: number, y: number) => void,
    private readonly particlesEnabled: boolean
  ) {
    this.destructionGraphics = scene.add.graphics().setDepth(13.6).setBlendMode(Phaser.BlendModes.ADD);
    this.bursts = Array.from({ length: MAX_BURSTS }, () => ({
      active: false, x: 0, y: 0, accent: 0xffffff, startedAt: 0, phase: 0
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
    const shardCount = this.particlesEnabled ? 12 : 7;
    for (const burst of this.bursts) {
      if (!burst.active) continue;
      const progress = (now - burst.startedAt) / BURST_LIFETIME_MS;
      if (progress >= 1) {
        burst.active = false;
        this.activeBurstCount -= 1;
        continue;
      }
      const fade = (1 - progress) ** 1.6;
      const spread = 18 + progress * 68;
      this.destructionGraphics.lineStyle(2.5 * fade, burst.accent, 0.7 * fade)
        .strokeCircle(burst.x, burst.y, 10 + progress * 46);
      this.destructionGraphics.fillStyle(burst.accent, 0.09 * fade)
        .fillCircle(burst.x, burst.y, 16 + progress * 34);
      for (let index = 0; index < shardCount; index += 1) {
        const angle = burst.phase + index * Math.PI * 2 / shardCount;
        const distance = spread * (0.7 + (index % 3) * 0.15);
        const px = burst.x + Math.cos(angle) * distance;
        const py = burst.y + Math.sin(angle) * distance + progress * progress * 24;
        this.destructionGraphics.fillStyle(index % 3 === 0 ? 0xffffff : burst.accent, 0.82 * fade)
          .fillRect(px - 2, py - 1, 4 + (index % 2) * 2, 2);
      }
    }
    if (this.activeBurstCount === 0) this.destructionGraphics.clear();
  }

  diagnostics(): ArenaSmashableDiagnostics {
    let active = 0;
    for (const prop of this.props) if (prop.active) active += 1;
    return { total: this.props.length, active, activeDestructionBursts: this.activeBurstCount, physicsBodies: 0, updateLoops: 1 };
  }

  destroy(): void {
    for (const prop of this.props) prop.root.destroy(true);
    this.props.length = 0;
    for (const burst of this.bursts) burst.active = false;
    this.activeBurstCount = 0;
    this.destructionGraphics.destroy();
  }

  private contains(prop: SmashableRuntime, x: number, y: number, padding: number): boolean {
    const dx = x - prop.placement.x;
    const dy = y - prop.placement.y;
    const vertical = Math.abs(prop.placement.rotation) > 0.1;
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
    prop.root.setActive(false).setVisible(false);
    this.beginBurst(prop.placement.x, prop.placement.y, prop.placement.accent);
    if (prop.placement.lootRoll < prop.definition.lootChance) {
      this.onLoot(resolveArenaSmashableLoot((prop.placement.lootRoll * 3.731 + 0.173) % 1),
        prop.placement.x, prop.placement.y);
    }
  }

  private beginBurst(x: number, y: number, accent: number): void {
    let state = this.bursts.find((burst) => !burst.active) ?? this.bursts[0];
    if (!state.active) this.activeBurstCount += 1;
    state.active = true;
    state.x = x;
    state.y = y;
    state.accent = accent;
    state.startedAt = this.scene.time.now;
    state.phase = (x * 0.013 + y * 0.021) % (Math.PI * 2);
  }

  private drawProp(prop: SmashableRuntime): void {
    const graphics = prop.art;
    const { width: width, height: height, accent, kind } = prop.placement;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    const depth = 8;
    const damaged = prop.damageStage;
    graphics.clear();
    graphics.fillStyle(0x000207, 0.42).fillEllipse(5, halfHeight + 6, width * 1.15, 12);
    graphics.fillStyle(0x07111c, 1).fillRect(-halfWidth, -halfHeight, width, height);
    graphics.lineStyle(2, accent, damaged === 2 ? 0.45 : 0.82).strokeRect(-halfWidth, -halfHeight, width, height);
    graphics.fillStyle(0x102a39, 1).beginPath()
      .moveTo(-halfWidth, -halfHeight).lineTo(-halfWidth + depth, -halfHeight - depth)
      .lineTo(halfWidth + depth, -halfHeight - depth).lineTo(halfWidth, -halfHeight).closePath().fillPath();
    graphics.lineStyle(1.4, accent, 0.62).strokePath();
    graphics.fillStyle(0x020812, 1).beginPath()
      .moveTo(halfWidth, -halfHeight).lineTo(halfWidth + depth, -halfHeight - depth)
      .lineTo(halfWidth + depth, halfHeight - depth).lineTo(halfWidth, halfHeight).closePath().fillPath();
    graphics.lineStyle(1.2, accent, 0.45).strokePath();
    const windowHeight = Math.max(10, height * 0.27);
    graphics.fillStyle(0x02070d, 1).fillRect(-halfWidth + 7, -halfHeight + 9, width - 14, windowHeight);
    graphics.fillStyle(accent, 0.16).fillRect(-halfWidth + 9, -halfHeight + 11, width - 18, windowHeight - 4);
    graphics.lineStyle(1.2, accent, 0.8).strokeRect(-halfWidth + 7, -halfHeight + 9, width - 14, windowHeight);
    const bars = kind === 'server-tower' || kind === 'battery-rack' ? 4 : kind === 'vending-unit' ? 3 : 2;
    for (let index = 0; index < bars; index += 1) {
      const y = -halfHeight + windowHeight + 16 + index * Math.max(5, (height - windowHeight - 24) / bars);
      graphics.fillStyle(index % 2 ? accent : 0x5df7ff, 0.62).fillRect(-halfWidth + 8, y, width - 16, 2);
    }
    graphics.fillStyle(damaged ? 0xff825e : 0x89ffb6, 0.94).fillCircle(halfWidth - 7, -halfHeight + 6, 2.2);
    if (damaged > 0) {
      graphics.lineStyle(1.5, 0xff6c8c, 0.9).beginPath()
        .moveTo(-8, -halfHeight + 8).lineTo(-2, -5).lineTo(-9, 3).lineTo(1, halfHeight - 6).strokePath();
    }
    if (damaged > 1) {
      graphics.lineStyle(1, 0x7a2c45, 0.85).lineBetween(halfWidth - 5, -10, 3, 4);
      graphics.lineBetween(3, 4, halfWidth - 9, 15);
    }
  }
}
