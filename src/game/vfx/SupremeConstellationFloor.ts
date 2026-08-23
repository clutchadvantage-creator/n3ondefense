import Phaser from 'phaser';
import type { RectSpec } from '../types.ts';
import { SUPREME_CONSTELLATIONS, SUPREME_STAGE_DEFINITIONS, getSupremeStage } from '../progression/SupremeProgression.ts';
import type { RunProtocolId } from '../mods/types.ts';

/** One static command buffer plus one traveling light; no per-frame allocation. */
export class SupremeConstellationFloor {
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly traveler: Phaser.GameObjects.Arc;
  private readonly projected: Array<{ x: number; y: number }>;
  private readonly connections: readonly (readonly [number, number])[];
  private finaleJourney: Phaser.GameObjects.Graphics | null = null;
  private lastUpdateAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly scene: Phaser.Scene, protocol: RunProtocolId, private readonly bounds: RectSpec) {
    const stage = getSupremeStage(protocol);
    const definition = stage ? SUPREME_CONSTELLATIONS[stage.constellationKey] : undefined;
    this.base = scene.add.graphics().setDepth(-1.35).setBlendMode(Phaser.BlendModes.ADD);
    this.traveler = scene.add.circle(0, 0, 5, 0xf2ffff, .86).setDepth(-1.3).setBlendMode(Phaser.BlendModes.ADD);
    if (!definition) {
      this.projected = [];
      this.connections = [];
      this.base.setVisible(false);
      this.traveler.setVisible(false);
      return;
    }
    const projection = Math.min(bounds.w, bounds.h) * .58;
    const left = bounds.x + bounds.w * .5 - projection * .5;
    const top = bounds.y + bounds.h * .5 - projection * .5;
    this.projected = definition.points.map((point) => ({ x: left + point.x * projection, y: top + point.y * projection }));
    this.connections = definition.connections;
    this.base.lineStyle(3, 0xa9f9ff, .16);
    for (const [from, to] of this.connections) {
      const a = this.projected[from];
      const b = this.projected[to];
      if (a && b) this.base.lineBetween(a.x, a.y, b.x, b.y);
    }
    definition.points.forEach((point, index) => {
      const p = this.projected[index];
      this.base.fillStyle(point.major ? 0xffffff : 0x7beeff, point.major ? .48 : .26);
      this.base.fillCircle(p.x, p.y, point.major ? 8 : 5);
      this.base.lineStyle(1, 0xe8ffff, point.major ? .42 : .22);
      this.base.strokeCircle(p.x, p.y, point.major ? 15 : 10);
    });
  }

  update(now: number, intensity = 1): void {
    if (!this.base.visible || this.connections.length === 0 || now - this.lastUpdateAt < 50) return;
    this.lastUpdateAt = now;
    this.base.setAlpha((.72 + Math.sin(now * .0014) * .18) * intensity);
    const cycle = now * .00032;
    const connectionIndex = Math.floor(cycle) % this.connections.length;
    const progress = cycle - Math.floor(cycle);
    const [from, to] = this.connections[connectionIndex];
    const a = this.projected[from];
    const b = this.projected[to];
    if (!a || !b) return;
    this.traveler.setPosition(Phaser.Math.Linear(a.x, b.x, progress), Phaser.Math.Linear(a.y, b.y, progress))
      .setScale(.8 + Math.sin(now * .008) * .25).setAlpha(.6 + Math.sin(now * .01) * .25);
  }

  setFinaleIntensity(enabled: boolean): void {
    this.base.setAlpha(enabled ? 1 : .75);
    this.traveler.setScale(enabled ? 1.8 : 1);
    if (!enabled) {
      this.finaleJourney?.setVisible(false);
      return;
    }
    if (!this.finaleJourney) this.finaleJourney = this.createJourneyMap();
    this.finaleJourney.setVisible(true);
  }

  /** Draws the completed ladder into one cached Graphics command buffer. The
   * finale therefore gains eleven constellations without eleven update loops. */
  private createJourneyMap(): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics().setDepth(-1.34).setBlendMode(Phaser.BlendModes.ADD);
    const columns = 4;
    const rows = 3;
    const cellWidth = this.bounds.w / columns;
    const cellHeight = this.bounds.h / rows;
    SUPREME_STAGE_DEFINITIONS.forEach((stage, index) => {
      const definition = SUPREME_CONSTELLATIONS[stage.constellationKey];
      if (!definition) return;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const scale = Math.min(cellWidth, cellHeight) * .47;
      const left = this.bounds.x + column * cellWidth + (cellWidth - scale) * .5;
      const top = this.bounds.y + row * cellHeight + (cellHeight - scale) * .5;
      const points = definition.points.map((point) => ({ x: left + point.x * scale, y: top + point.y * scale }));
      graphics.lineStyle(1.2, index % 2 ? 0xff72e6 : 0x7beeff, .1);
      for (const [from, to] of definition.connections) {
        const a = points[from];
        const b = points[to];
        if (a && b) graphics.lineBetween(a.x, a.y, b.x, b.y);
      }
      graphics.fillStyle(index % 2 ? 0xff9ceb : 0xc9ffff, .22);
      points.forEach((point) => graphics.fillCircle(point.x, point.y, 2.2));
    });
    return graphics;
  }

  destroy(): void {
    this.base.destroy();
    this.traveler.destroy();
    this.finaleJourney?.destroy();
    this.finaleJourney = null;
    this.projected.length = 0;
  }
}
