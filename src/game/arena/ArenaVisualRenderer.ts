import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants.ts';
import type { ArenaLayout, GeneratedObstacle, RectSpec } from '../types.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';
import {
  NEON_CITY_VISUAL_THEME,
  createArenaDressingPlan,
  type ArenaDressingPlan
} from './ArenaVisualTheme.ts';

const colorCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
const centerX = (rect: RectSpec): number => rect.x + rect.w * 0.5;
const centerY = (rect: RectSpec): number => rect.y + rect.h * 0.5;

/** Static/setup-time renderer for the visual theme. It owns no physics bodies. */
export class ArenaVisualRenderer {
  readonly plan: ArenaDressingPlan;
  private readonly roots: Phaser.GameObjects.GameObject[] = [];
  private readonly tweens: Phaser.Tweens.Tween[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly layout: ArenaLayout) {
    this.plan = createArenaDressingPlan(layout);
    this.drawBackdropAndBeachStadium();
    this.drawFloor();
    this.drawArchetypeMotif();
    this.drawContainmentPerimeter();
    this.drawWalls();
    this.drawObstacles();
    this.drawDistrictDressing();
  }

  destroy(): void {
    for (const tween of this.tweens) tween.remove();
    this.tweens.length = 0;
    for (const root of this.roots) root.destroy();
    this.roots.length = 0;
  }

  private keep<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.roots.push(object);
    return object;
  }

  private drawBackdropAndBeachStadium(): void {
    const { palette } = NEON_CITY_VISUAL_THEME;
    const bounds = this.layout.generation.bounds;
    const random = new SeededRandom(this.plan.venueSeed);
    const graphics = this.keep(this.scene.add.graphics().setDepth(-4));

    graphics.fillStyle(palette.void, 1);
    graphics.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawCoastalApron(graphics, bounds, random);
    this.drawStadiumStructure(graphics, bounds, random);
    this.drawPalmTrees(graphics, bounds, random);
    this.drawVenueBanners(graphics, bounds, random);
    this.drawVenueLabels(bounds);
    this.createVenueBeacons(bounds);
  }

  private drawCoastalApron(graphics: Phaser.GameObjects.Graphics, bounds: RectSpec, random: SeededRandom): void {
    // Ocean sits beyond the long sides of the venue. Filled foam clusters and
    // a tiled promenade replace the former full-height cyan wave stripes.
    graphics.fillStyle(0x031329, 1);
    graphics.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const leftMargin = Math.max(0, bounds.x);
    const rightMargin = Math.max(0, WORLD_WIDTH - bounds.x - bounds.w);
    const leftVenueDepth = Math.max(18, Math.min(104, leftMargin * 0.58));
    const rightVenueDepth = Math.max(18, Math.min(104, rightMargin * 0.58));
    const leftShore = Math.max(0, bounds.x - leftVenueDepth);
    const rightShore = Math.min(WORLD_WIDTH, bounds.x + bounds.w + rightVenueDepth);
    const leftBeachWidth = Math.max(6, Math.min(66, leftShore * 0.45));
    const rightBeachWidth = Math.max(6, Math.min(66, (WORLD_WIDTH - rightShore) * 0.45));

    graphics.fillStyle(0x6f4a55, 0.94);
    graphics.fillRect(Math.max(0, leftShore - leftBeachWidth), 0, leftBeachWidth, WORLD_HEIGHT);
    graphics.fillRect(rightShore, 0, rightBeachWidth, WORLD_HEIGHT);
    graphics.fillStyle(0xd6a56f, 0.34);
    graphics.fillRect(Math.max(0, leftShore - leftBeachWidth * 0.72), 0, leftBeachWidth * 0.72, WORLD_HEIGHT);
    graphics.fillRect(rightShore + rightBeachWidth * 0.28, 0, rightBeachWidth * 0.72, WORLD_HEIGHT);

    // Boardwalk tiles make the shore/venue transition read as a promenade.
    const tileHeight = 42;
    for (let y = 0, tile = 0; y < WORLD_HEIGHT; y += tileHeight, tile += 1) {
      const inset = tile % 2 === 0 ? 2 : 7;
      graphics.fillStyle(tile % 2 === 0 ? 0x412c42 : 0x34253b, 0.72);
      graphics.fillRoundedRect(Math.max(0, leftShore - leftBeachWidth + inset), y + 3, Math.max(3, leftBeachWidth - inset - 3), tileHeight - 7, 3);
      graphics.fillRoundedRect(rightShore + 3, y + 3, Math.max(3, rightBeachWidth - inset - 3), tileHeight - 7, 3);
    }

    // Small foam patches suggest moving surf without any repeated long lines.
    for (let y = 18; y < WORLD_HEIGHT; y += 54) {
      const wobble = random.int(-7, 7);
      const leftFoamX = Math.max(4, leftShore - leftBeachWidth - random.int(3, 13));
      const rightFoamX = Math.min(WORLD_WIDTH - 4, rightShore + rightBeachWidth + random.int(3, 13));
      graphics.fillStyle(0xaafaff, random.float(0.14, 0.3));
      graphics.fillEllipse(leftFoamX, y + wobble, random.int(10, 24), random.int(4, 8));
      graphics.fillEllipse(rightFoamX, y - wobble, random.int(10, 24), random.int(4, 8));
      graphics.fillStyle(0x45dff5, 0.18);
      graphics.fillCircle(leftFoamX + random.int(-7, 7), y + 9 + wobble, random.int(2, 4));
      graphics.fillCircle(rightFoamX + random.int(-7, 7), y + 9 - wobble, random.int(2, 4));
    }
  }

  private drawStadiumStructure(graphics: Phaser.GameObjects.Graphics, bounds: RectSpec, random: SeededRandom): void {
    const topMargin = Math.max(0, bounds.y);
    const bottomMargin = Math.max(0, WORLD_HEIGHT - bounds.y - bounds.h);
    const leftMargin = Math.max(0, bounds.x);
    const rightMargin = Math.max(0, WORLD_WIDTH - bounds.x - bounds.w);
    const topDepth = Math.max(24, Math.min(132, topMargin * 0.82));
    const bottomDepth = Math.max(24, Math.min(132, bottomMargin * 0.82));
    const leftDepth = Math.max(20, Math.min(104, leftMargin * 0.58));
    const rightDepth = Math.max(20, Math.min(104, rightMargin * 0.58));
    const topY = Math.max(0, bounds.y - topDepth);
    const bottomY = Math.min(WORLD_HEIGHT - bottomDepth, bounds.y + bounds.h);
    const leftX = Math.max(0, bounds.x - leftDepth);
    const rightX = Math.min(WORLD_WIDTH - rightDepth, bounds.x + bounds.w);

    graphics.fillStyle(0x010308, 0.96);
    graphics.fillRoundedRect(leftX - 10, topY - 10, rightX + rightDepth - leftX + 20, bottomY + bottomDepth - topY + 20, 18);

    const topConcourse = Math.max(6, Math.min(20, topDepth * 0.2));
    const bottomConcourse = Math.max(6, Math.min(20, bottomDepth * 0.2));
    const leftConcourse = Math.max(6, Math.min(18, leftDepth * 0.2));
    const rightConcourse = Math.max(6, Math.min(18, rightDepth * 0.2));
    graphics.fillStyle(0x172638, 1);
    graphics.fillRect(bounds.x, bounds.y - topConcourse, bounds.w, topConcourse);
    graphics.fillRect(bounds.x, bounds.y + bounds.h, bounds.w, bottomConcourse);
    graphics.fillRect(bounds.x - leftConcourse, bounds.y, leftConcourse, bounds.h);
    graphics.fillRect(bounds.x + bounds.w, bounds.y, rightConcourse, bounds.h);
    for (let x = bounds.x + 10, tile = 0; x < bounds.x + bounds.w - 10; x += 46, tile += 1) {
      graphics.fillStyle(tile % 2 ? 0x24384c : 0x1d3043, 0.95);
      graphics.fillRoundedRect(x, bounds.y - topConcourse + 3, 31, Math.max(3, topConcourse - 6), 2);
      graphics.fillRoundedRect(x, bounds.y + bounds.h + 3, 31, Math.max(3, bottomConcourse - 6), 2);
    }
    for (let y = bounds.y + 10, tile = 0; y < bounds.y + bounds.h - 10; y += 46, tile += 1) {
      graphics.fillStyle(tile % 2 ? 0x24384c : 0x1d3043, 0.95);
      graphics.fillRoundedRect(bounds.x - leftConcourse + 3, y, Math.max(3, leftConcourse - 6), 31, 2);
      graphics.fillRoundedRect(bounds.x + bounds.w + 3, y, Math.max(3, rightConcourse - 6), 31, 2);
    }

    const horizontalSeatBudget = Math.floor(this.plan.spectatorLightCount * 0.36);
    const verticalSeatBudget = Math.floor(this.plan.spectatorLightCount * 0.14);
    this.drawHorizontalGrandstand(graphics, bounds.x, bounds.w, bounds.y, topDepth, true, random, { remaining: horizontalSeatBudget });
    this.drawHorizontalGrandstand(graphics, bounds.x, bounds.w, bounds.y + bounds.h, bottomDepth, false, random, { remaining: horizontalSeatBudget });
    this.drawVerticalGrandstand(graphics, bounds.y, bounds.h, bounds.x, leftDepth, true, random, { remaining: verticalSeatBudget });
    this.drawVerticalGrandstand(graphics, bounds.y, bounds.h, bounds.x + bounds.w, rightDepth, false, random, { remaining: verticalSeatBudget });
    this.drawStadiumLightTowers(graphics, bounds, topDepth, bottomDepth);

    // A solid concourse and segmented safety rail visually separate spectators
    // from the combat floor without creating any gameplay object or collider.
    graphics.fillStyle(0x142232, 0.98);
    graphics.fillRect(bounds.x, bounds.y - 8, bounds.w, 8);
    graphics.fillRect(bounds.x, bounds.y + bounds.h, bounds.w, 8);
    graphics.fillRect(bounds.x - 8, bounds.y, 8, bounds.h);
    graphics.fillRect(bounds.x + bounds.w, bounds.y, 8, bounds.h);
    for (let x = bounds.x + 16, segment = 0; x < bounds.x + bounds.w - 10; x += 38, segment += 1) {
      graphics.fillStyle(segment % 2 ? this.layout.theme.primary : this.layout.theme.secondary, 0.62);
      graphics.fillRoundedRect(x, bounds.y - 5, 24, 3, 1);
      graphics.fillRoundedRect(x, bounds.y + bounds.h + 2, 24, 3, 1);
    }
    for (let y = bounds.y + 16, segment = 0; y < bounds.y + bounds.h - 10; y += 38, segment += 1) {
      graphics.fillStyle(segment % 2 ? this.layout.theme.secondary : this.layout.theme.primary, 0.58);
      graphics.fillRoundedRect(bounds.x - 5, y, 3, 24, 1);
      graphics.fillRoundedRect(bounds.x + bounds.w + 2, y, 3, 24, 1);
    }
  }

  private drawHorizontalGrandstand(
    graphics: Phaser.GameObjects.Graphics,
    startX: number,
    width: number,
    edgeY: number,
    depth: number,
    top: boolean,
    random: SeededRandom,
    seatBudget: { remaining: number }
  ): void {
    const bayCount = Math.max(5, Math.min(10, Math.round(width / 235)));
    const bayWidth = width / bayCount;
    const concourse = Math.max(6, Math.min(20, depth * 0.2));
    const standDepth = Math.max(12, depth - concourse);
    const direction = top ? -1 : 1;
    const centerBay = Math.floor(bayCount * 0.5);
    for (let bay = 0; bay < bayCount; bay += 1) {
      const x = startX + bay * bayWidth + 6;
      const w = Math.max(26, bayWidth - 12);
      if (bay === centerBay) {
        this.drawHorizontalEntryGate(graphics, x, w, edgeY, depth, top);
        continue;
      }
      const outerY = edgeY + direction * depth;
      const innerY = edgeY + direction * concourse;
      graphics.fillStyle(0x0c1422, 1);
      graphics.fillPoints([
        { x: x + 10, y: outerY }, { x: x + w - 10, y: outerY },
        { x: x + w, y: innerY }, { x, y: innerY }
      ], true);
      graphics.lineStyle(2, bay % 2 ? this.layout.theme.primary : this.layout.theme.secondary, 0.38);
      graphics.strokePoints([
        { x: x + 10, y: outerY }, { x: x + w - 10, y: outerY },
        { x: x + w, y: innerY }, { x, y: innerY }
      ], true);
      const rearY = top ? outerY - 5 : outerY;
      graphics.fillStyle(0x31465b, 1);
      graphics.fillRoundedRect(x + 5, rearY, w - 10, 5, 2);
      graphics.fillRoundedRect(x + 7, Math.min(outerY, innerY), 5, Math.max(5, Math.abs(innerY - outerY)), 2);
      graphics.fillRoundedRect(x + w - 12, Math.min(outerY, innerY), 5, Math.max(5, Math.abs(innerY - outerY)), 2);

      const rows = Math.max(2, Math.min(5, Math.floor(standDepth / 15)));
      for (let row = 0; row < rows; row += 1) {
        const t0 = row / rows;
        const t1 = (row + 0.78) / rows;
        const rowOuterY = Phaser.Math.Linear(outerY, innerY, t0);
        const rowInnerY = Phaser.Math.Linear(outerY, innerY, t1);
        const outerInset = 9 * (1 - t0);
        const innerInset = 9 * (1 - t1);
        graphics.fillStyle(row % 2 ? 0x1b2638 : 0x253249, 0.98);
        graphics.fillPoints([
          { x: x + outerInset, y: rowOuterY }, { x: x + w - outerInset, y: rowOuterY },
          { x: x + w - innerInset, y: rowInnerY }, { x: x + innerInset, y: rowInnerY }
        ], true);
        const seatY = (rowOuterY + rowInnerY) * 0.5;
        for (let seatX = x + 15; seatX < x + w - 12 && seatBudget.remaining > 0; seatX += 16) {
          const color = random.pick([0x45efff, 0xff4fcf, 0xffc857, 0x8affbd]);
          graphics.fillStyle(color, random.float(0.42, 0.82));
          graphics.fillRoundedRect(seatX, seatY - 2, 8, 4, 1);
          seatBudget.remaining -= 1;
        }
      }

      // Filled aisle wedges and support feet make each bay architectural.
      graphics.fillStyle(0x03070d, 1);
      graphics.fillPoints([
        { x: x, y: innerY }, { x: x + 8, y: innerY },
        { x: x + 15, y: outerY }, { x: x + 9, y: outerY }
      ], true);
      graphics.fillStyle(0x25374a, 1);
      graphics.fillRoundedRect(x + 7, outerY - (top ? 4 : 0), 9, 4, 1);
      graphics.fillRoundedRect(x + w - 16, outerY - (top ? 4 : 0), 9, 4, 1);
    }
  }

  private drawVerticalGrandstand(
    graphics: Phaser.GameObjects.Graphics,
    startY: number,
    height: number,
    edgeX: number,
    depth: number,
    left: boolean,
    random: SeededRandom,
    seatBudget: { remaining: number }
  ): void {
    const bayCount = Math.max(4, Math.min(8, Math.round(height / 225)));
    const bayHeight = height / bayCount;
    const concourse = Math.max(6, Math.min(18, depth * 0.2));
    const standDepth = Math.max(12, depth - concourse);
    const direction = left ? -1 : 1;
    const centerBay = Math.floor(bayCount * 0.5);
    for (let bay = 0; bay < bayCount; bay += 1) {
      const y = startY + bay * bayHeight + 6;
      const h = Math.max(28, bayHeight - 12);
      if (bay === centerBay) {
        this.drawVerticalEntryGate(graphics, y, h, edgeX, depth, left);
        continue;
      }
      const outerX = edgeX + direction * depth;
      const innerX = edgeX + direction * concourse;
      graphics.fillStyle(0x0b1421, 1);
      graphics.fillPoints([
        { x: outerX, y: y + 10 }, { x: innerX, y },
        { x: innerX, y: y + h }, { x: outerX, y: y + h - 10 }
      ], true);
      graphics.lineStyle(2, bay % 2 ? this.layout.theme.secondary : this.layout.theme.primary, 0.36);
      graphics.strokePoints([
        { x: outerX, y: y + 10 }, { x: innerX, y },
        { x: innerX, y: y + h }, { x: outerX, y: y + h - 10 }
      ], true);
      const rearX = left ? outerX - 5 : outerX;
      graphics.fillStyle(0x31465b, 1);
      graphics.fillRoundedRect(rearX, y + 5, 5, h - 10, 2);
      graphics.fillRoundedRect(Math.min(outerX, innerX), y + 7, Math.max(5, Math.abs(innerX - outerX)), 5, 2);
      graphics.fillRoundedRect(Math.min(outerX, innerX), y + h - 12, Math.max(5, Math.abs(innerX - outerX)), 5, 2);

      const rows = Math.max(2, Math.min(4, Math.floor(standDepth / 15)));
      for (let row = 0; row < rows; row += 1) {
        const t0 = row / rows;
        const t1 = (row + 0.78) / rows;
        const rowOuterX = Phaser.Math.Linear(outerX, innerX, t0);
        const rowInnerX = Phaser.Math.Linear(outerX, innerX, t1);
        const outerInset = 9 * (1 - t0);
        const innerInset = 9 * (1 - t1);
        graphics.fillStyle(row % 2 ? 0x1b2739 : 0x26334a, 0.98);
        graphics.fillPoints([
          { x: rowOuterX, y: y + outerInset }, { x: rowInnerX, y: y + innerInset },
          { x: rowInnerX, y: y + h - innerInset }, { x: rowOuterX, y: y + h - outerInset }
        ], true);
        const seatX = (rowOuterX + rowInnerX) * 0.5;
        for (let seatY = y + 15; seatY < y + h - 12 && seatBudget.remaining > 0; seatY += 16) {
          graphics.fillStyle(random.pick([0x45efff, 0xff4fcf, 0xffc857, 0x8affbd]), random.float(0.4, 0.78));
          graphics.fillRoundedRect(seatX - 2, seatY, 4, 8, 1);
          seatBudget.remaining -= 1;
        }
      }
    }
  }

  private drawHorizontalEntryGate(graphics: Phaser.GameObjects.Graphics, x: number, width: number, edgeY: number, depth: number, top: boolean): void {
    const direction = top ? -1 : 1;
    const outerY = edgeY + direction * depth;
    const innerY = edgeY + direction * Math.max(5, depth * 0.16);
    graphics.fillStyle(0x020409, 1);
    graphics.fillPoints([
      { x: x + 8, y: outerY }, { x: x + width - 8, y: outerY },
      { x: x + width * 0.72, y: innerY }, { x: x + width * 0.28, y: innerY }
    ], true);
    graphics.fillStyle(0x26384d, 1);
    const supportY = Math.min(outerY, innerY);
    const supportHeight = Math.max(5, Math.abs(innerY - outerY));
    graphics.fillRoundedRect(x + 6, supportY, 10, supportHeight, 2);
    graphics.fillRoundedRect(x + width - 16, supportY, 10, supportHeight, 2);
    graphics.fillStyle(this.layout.theme.secondary, 0.62);
    graphics.fillRoundedRect(x + width * 0.28, outerY + direction * 4, width * 0.44, 5, 2);
  }

  private drawVerticalEntryGate(graphics: Phaser.GameObjects.Graphics, y: number, height: number, edgeX: number, depth: number, left: boolean): void {
    const direction = left ? -1 : 1;
    const outerX = edgeX + direction * depth;
    const innerX = edgeX + direction * Math.max(5, depth * 0.16);
    graphics.fillStyle(0x020409, 1);
    graphics.fillPoints([
      { x: outerX, y: y + 8 }, { x: innerX, y: y + height * 0.28 },
      { x: innerX, y: y + height * 0.72 }, { x: outerX, y: y + height - 8 }
    ], true);
    graphics.fillStyle(0x26384d, 1);
    graphics.fillRoundedRect(Math.min(outerX, innerX), y + 6, Math.max(5, Math.abs(innerX - outerX)), 10, 2);
    graphics.fillRoundedRect(Math.min(outerX, innerX), y + height - 16, Math.max(5, Math.abs(innerX - outerX)), 10, 2);
    graphics.fillStyle(this.layout.theme.primary, 0.62);
    graphics.fillRoundedRect(outerX + direction * 4 - (left ? 5 : 0), y + height * 0.28, 5, height * 0.44, 2);
  }

  private drawStadiumLightTowers(graphics: Phaser.GameObjects.Graphics, bounds: RectSpec, topDepth: number, bottomDepth: number): void {
    const rigs = [
      { x: bounds.x + bounds.w * 0.12, y: Math.max(8, bounds.y - topDepth * 0.82), top: true },
      { x: bounds.x + bounds.w * 0.88, y: Math.max(8, bounds.y - topDepth * 0.82), top: true },
      { x: bounds.x + bounds.w * 0.12, y: Math.min(WORLD_HEIGHT - 8, bounds.y + bounds.h + bottomDepth * 0.82), top: false },
      { x: bounds.x + bounds.w * 0.88, y: Math.min(WORLD_HEIGHT - 8, bounds.y + bounds.h + bottomDepth * 0.82), top: false }
    ];
    for (let rigIndex = 0; rigIndex < rigs.length; rigIndex += 1) {
      const rig = rigs[rigIndex];
      const accent = rigIndex % 2 ? this.layout.theme.primary : this.layout.theme.secondary;
      graphics.fillStyle(0x03070d, 0.96);
      graphics.fillPoints([
        { x: rig.x - 13, y: rig.y }, { x: rig.x, y: rig.y - 10 },
        { x: rig.x + 13, y: rig.y }, { x: rig.x, y: rig.y + 10 }
      ], true);
      graphics.fillStyle(0x24384c, 1);
      graphics.fillRect(rig.x - 3, rig.top ? rig.y : rig.y - 22, 6, 22);
      graphics.fillRoundedRect(rig.x - 24, rig.top ? rig.y + 18 : rig.y - 23, 48, 8, 2);
      for (let light = 0; light < 4; light += 1) {
        graphics.fillStyle(accent, 0.72);
        graphics.fillRoundedRect(rig.x - 19 + light * 11, rig.top ? rig.y + 20 : rig.y - 21, 7, 4, 1);
      }
    }
  }

  private drawPalmTrees(graphics: Phaser.GameObjects.Graphics, bounds: RectSpec, random: SeededRandom): void {
    const offsetX = Math.max(14, Math.min(72, bounds.x * 0.55));
    const offsetY = Math.max(14, Math.min(72, bounds.y * 0.58));
    const anchors = [
      { x: bounds.x - offsetX, y: bounds.y - offsetY },
      { x: bounds.x + bounds.w + offsetX, y: bounds.y - offsetY },
      { x: bounds.x - offsetX, y: bounds.y + bounds.h + offsetY },
      { x: bounds.x + bounds.w + offsetX, y: bounds.y + bounds.h + offsetY },
      { x: bounds.x + bounds.w * 0.16, y: bounds.y - offsetY },
      { x: bounds.x + bounds.w * 0.84, y: bounds.y - offsetY },
      { x: bounds.x + bounds.w * 0.18, y: bounds.y + bounds.h + offsetY },
      { x: bounds.x + bounds.w * 0.82, y: bounds.y + bounds.h + offsetY },
      { x: bounds.x - offsetX, y: bounds.y + bounds.h * 0.5 },
      { x: bounds.x + bounds.w + offsetX, y: bounds.y + bounds.h * 0.5 }
    ];
    const scale = Math.max(0.58, Math.min(1, Math.min(bounds.x, bounds.y) / 105));
    const selected = random.shuffle(anchors).slice(0, this.plan.palmTreeCount);
    for (let index = 0; index < selected.length; index += 1) {
      const anchor = selected[index];
      const rotation = random.float(-0.28, 0.28);
      const trunkLength = random.int(25, 34) * scale;
      const canopyX = Phaser.Math.Clamp(anchor.x + Math.sin(rotation) * trunkLength, 8, WORLD_WIDTH - 8);
      const canopyY = Phaser.Math.Clamp(anchor.y - Math.cos(rotation) * trunkLength, 8, WORLD_HEIGHT - 8);
      const baseX = Phaser.Math.Clamp(anchor.x, 8, WORLD_WIDTH - 8);
      const baseY = Phaser.Math.Clamp(anchor.y, 8, WORLD_HEIGHT - 8);
      const trunkSegments = 6;
      for (let segment = 0; segment < trunkSegments; segment += 1) {
        const t = segment / (trunkSegments - 1);
        const x = Phaser.Math.Linear(baseX, canopyX, t);
        const y = Phaser.Math.Linear(baseY, canopyY, t);
        graphics.fillStyle(segment % 2 ? 0x6d3a55 : 0x4a2941, 0.96);
        graphics.fillEllipse(x, y, Math.max(4, (8 - segment * 0.55) * scale), Math.max(3, (6 - segment * 0.4) * scale));
      }
      for (let leaf = 0; leaf < 8; leaf += 1) {
        const angle = leaf * Math.PI / 4 + rotation;
        const length = random.int(24, 38) * scale;
        const bend = leaf % 2 ? 0.1 : -0.1;
        const tipAngle = angle + bend;
        const tipX = canopyX + Math.cos(tipAngle) * length;
        const tipY = canopyY + Math.sin(tipAngle) * length;
        const normalX = -Math.sin(angle) * 5 * scale;
        const normalY = Math.cos(angle) * 5 * scale;
        const midX = canopyX + Math.cos(angle) * length * 0.48;
        const midY = canopyY + Math.sin(angle) * length * 0.48;
        graphics.fillStyle(0x123d38, 0.96);
        graphics.fillPoints([
          { x: canopyX, y: canopyY },
          { x: midX + normalX, y: midY + normalY },
          { x: tipX, y: tipY },
          { x: midX - normalX, y: midY - normalY }
        ], true);
        graphics.fillStyle(leaf % 2 ? 0x43ffba : 0x30d7db, 0.28);
        graphics.fillPoints([
          { x: canopyX, y: canopyY },
          { x: midX + normalX * 0.42, y: midY + normalY * 0.42 },
          { x: tipX, y: tipY },
          { x: midX - normalX * 0.42, y: midY - normalY * 0.42 }
        ], true);
      }
      graphics.fillStyle(0x071a18, 1);
      graphics.fillCircle(canopyX, canopyY, Math.max(4, 7 * scale));
      graphics.fillStyle(0xff4fcf, 0.74);
      graphics.fillCircle(canopyX, canopyY, Math.max(2, 3.4 * scale));
    }
  }

  private drawVenueBanners(graphics: Phaser.GameObjects.Graphics, bounds: RectSpec, random: SeededRandom): void {
    const count = this.plan.venueBannerCount;
    for (let index = 0; index < count; index += 1) {
      const side = index % 4;
      const sideIndex = Math.floor(index / 4);
      const sideTotal = Math.ceil((count - side) / 4);
      const fraction = (sideIndex + 1) / (sideTotal + 1);
      const horizontal = side === 0 || side === 2;
      const topOrLeft = side === 0 || side === 3;
      const edgeX = horizontal ? bounds.x + bounds.w * fraction : (side === 1 ? bounds.x + bounds.w : bounds.x);
      const edgeY = horizontal ? (side === 0 ? bounds.y : bounds.y + bounds.h) : bounds.y + bounds.h * fraction;
      const outwardX = horizontal ? 0 : (side === 1 ? 1 : -1);
      const outwardY = horizontal ? (side === 0 ? -1 : 1) : 0;
      const tangentX = horizontal ? (topOrLeft ? 1 : -1) : 0;
      const tangentY = horizontal ? 0 : (topOrLeft ? -1 : 1);
      const available = horizontal
        ? (side === 0 ? bounds.y : WORLD_HEIGHT - bounds.y - bounds.h)
        : (side === 1 ? WORLD_WIDTH - bounds.x - bounds.w : bounds.x);
      const poleHeight = Math.max(13, Math.min(40, available * 0.5));
      const mastX = Phaser.Math.Clamp(edgeX + outwardX * poleHeight, 5, WORLD_WIDTH - 5);
      const mastY = Phaser.Math.Clamp(edgeY + outwardY * poleHeight, 5, WORLD_HEIGHT - 5);
      const accent = index % 2 ? this.layout.theme.primary : this.layout.theme.secondary;
      graphics.lineStyle(2, 0xa9eafa, 0.48);
      graphics.lineBetween(edgeX + outwardX * 5, edgeY + outwardY * 5, mastX, mastY);
      const bannerLength = random.int(20, 31);
      const bannerDepth = Math.max(9, Math.min(19, poleHeight * 0.5));
      graphics.fillStyle(0x08101d, 0.96);
      graphics.fillPoints([
        { x: mastX, y: mastY },
        { x: mastX + tangentX * bannerLength + outwardX * 3, y: mastY + tangentY * bannerLength + outwardY * 3 },
        { x: mastX + tangentX * bannerLength * 0.76 - outwardX * bannerDepth, y: mastY + tangentY * bannerLength * 0.76 - outwardY * bannerDepth },
        { x: mastX - outwardX * bannerDepth * 0.72, y: mastY - outwardY * bannerDepth * 0.72 }
      ], true);
      graphics.lineStyle(2, accent, 0.78);
      graphics.strokePoints([
        { x: mastX, y: mastY },
        { x: mastX + tangentX * bannerLength + outwardX * 3, y: mastY + tangentY * bannerLength + outwardY * 3 },
        { x: mastX + tangentX * bannerLength * 0.76 - outwardX * bannerDepth, y: mastY + tangentY * bannerLength * 0.76 - outwardY * bannerDepth },
        { x: mastX - outwardX * bannerDepth * 0.72, y: mastY - outwardY * bannerDepth * 0.72 }
      ], true);
      graphics.fillStyle(accent, 0.68);
      graphics.fillCircle(
        mastX + tangentX * bannerLength * 0.4 - outwardX * bannerDepth * 0.32,
        mastY + tangentY * bannerLength * 0.4 - outwardY * bannerDepth * 0.32,
        2.5
      );
    }
  }

  private drawVenueLabels(bounds: RectSpec): void {
    const root = this.keep(this.scene.add.container(0, 0).setDepth(-3.5));
    const topY = Math.max(8, bounds.y * 0.44);
    const bottomY = Math.min(WORLD_HEIGHT - 8, bounds.y + bounds.h + (WORLD_HEIGHT - bounds.y - bounds.h) * 0.56);
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '11px',
      color: colorCss(this.layout.theme.primary),
      stroke: '#02050b',
      strokeThickness: 3,
      letterSpacing: 2
    };
    root.add(this.scene.add.text(bounds.x + bounds.w * 0.5, topY, 'N3ON BEACH CIRCUIT // LIVE', style).setOrigin(0.5).setAlpha(0.82));
    root.add(this.scene.add.text(bounds.x + bounds.w * 0.5, bottomY, `${this.plan.districtLabel} // COMBAT GRANDSTAND`, {
      ...style,
      color: colorCss(this.layout.theme.secondary)
    }).setOrigin(0.5).setAlpha(0.72));
  }

  private createVenueBeacons(bounds: RectSpec): void {
    const offsetX = Math.max(8, Math.min(24, bounds.x * 0.35));
    const offsetY = Math.max(8, Math.min(24, bounds.y * 0.35));
    const anchors = [
      { x: bounds.x + bounds.w * 0.22, y: bounds.y - offsetY },
      { x: bounds.x + bounds.w * 0.78, y: bounds.y - offsetY },
      { x: bounds.x + bounds.w + offsetX, y: bounds.y + bounds.h * 0.5 },
      { x: bounds.x + bounds.w * 0.78, y: bounds.y + bounds.h + offsetY },
      { x: bounds.x + bounds.w * 0.22, y: bounds.y + bounds.h + offsetY },
      { x: bounds.x - offsetX, y: bounds.y + bounds.h * 0.5 }
    ].slice(0, this.plan.animatedVenueLightCount);
    const beacons = anchors.map((anchor, index) => this.keep(this.scene.add.circle(
      Phaser.Math.Clamp(anchor.x, 5, WORLD_WIDTH - 5),
      Phaser.Math.Clamp(anchor.y, 5, WORLD_HEIGHT - 5),
      3,
      index % 2 ? this.layout.theme.primary : this.layout.theme.secondary,
      0.58
    ).setStrokeStyle(1, 0xffffff, 0.32).setDepth(-2.6)));
    if (beacons.length === 0) return;
    this.tweens.push(this.scene.tweens.add({
      targets: beacons,
      alpha: { from: 0.28, to: 0.86 },
      scale: { from: 0.82, to: 1.28 },
      duration: 1350,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    }));
  }

  private drawFloor(): void {
    const { palette } = NEON_CITY_VISUAL_THEME;
    const bounds = this.layout.generation.bounds;
    const graphics = this.keep(this.scene.add.graphics().setDepth(-2));
    graphics.fillStyle(palette.floor, 1);
    graphics.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

    const panelW = this.plan.panelWidth;
    const panelH = this.plan.panelHeight;
    let row = 0;
    for (let y = bounds.y; y < bounds.y + bounds.h; y += panelH) {
      let column = 0;
      for (let x = bounds.x; x < bounds.x + bounds.w; x += panelW) {
        const w = Math.min(panelW, bounds.x + bounds.w - x);
        const h = Math.min(panelH, bounds.y + bounds.h - y);
        graphics.fillStyle((row + column) % 3 === 0 ? palette.floorPanel : palette.floor, 0.72);
        graphics.fillRect(x + 2, y + 2, Math.max(0, w - 4), Math.max(0, h - 4));
        graphics.lineStyle(1, palette.floorSeam, 0.42);
        graphics.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
        if ((row + column) % this.plan.circuitStride === 0) {
          const accent = (row + column) % 2 ? this.layout.theme.primary : this.layout.theme.secondary;
          graphics.lineStyle(1, accent, 0.13);
          graphics.lineBetween(x + 18, y + h * 0.5, x + Math.min(w - 12, 70), y + h * 0.5);
          graphics.fillStyle(accent, 0.22);
          graphics.fillCircle(x + 14, y + h * 0.5, 2);
        }
        column += 1;
      }
      row += 1;
    }

    // Reuse the generator's seeded, non-colliding neon marks as embedded floor
    // conduits. They remain dressing only and never become physics objects.
    for (let index = 0; index < this.layout.decorativeNeon.length; index += 1) {
      const deco = this.layout.decorativeNeon[index];
      const accent = index % 2 === 0 ? this.layout.theme.primary : this.layout.theme.secondary;
      graphics.fillStyle(accent, 0.1);
      graphics.fillRoundedRect(deco.x, deco.y, deco.w, deco.h, Math.min(4, deco.h * 0.5));
      graphics.fillStyle(accent, 0.24);
      graphics.fillCircle(deco.x + 3, deco.y + deco.h * 0.5, 2);
    }
  }

  private drawArchetypeMotif(): void {
    const bounds = this.layout.generation.bounds;
    const cx = bounds.x + bounds.w * 0.5;
    const cy = bounds.y + bounds.h * 0.5;
    const g = this.keep(this.scene.add.graphics().setDepth(-1));
    const primary = this.layout.theme.primary;
    const secondary = this.layout.theme.secondary;
    const motif = this.plan.profile.floorMotif;
    g.lineStyle(2, primary, 0.13);

    if (motif === 'concentric' || motif === 'radial') {
      for (const radius of [150, 290, 430]) g.strokeCircle(cx, cy, radius);
      if (motif === 'radial') {
        for (let index = 0; index < 8; index += 1) {
          const angle = index * Math.PI / 4;
          g.lineBetween(cx + Math.cos(angle) * 80, cy + Math.sin(angle) * 80, cx + Math.cos(angle) * 500, cy + Math.sin(angle) * 500);
        }
      }
    } else if (motif === 'split-lanes' || motif === 'transit-lanes') {
      const vertical = this.layout.generation.orientationBias.vertical >= this.layout.generation.orientationBias.horizontal;
      for (const offset of [-54, -26, 26, 54]) {
        if (vertical) g.lineBetween(cx + offset, bounds.y + 50, cx + offset, bounds.y + bounds.h - 50);
        else g.lineBetween(bounds.x + 50, cy + offset, bounds.x + bounds.w - 50, cy + offset);
      }
      g.lineStyle(8, secondary, 0.045);
      if (vertical) g.lineBetween(cx, bounds.y + 50, cx, bounds.y + bounds.h - 50);
      else g.lineBetween(bounds.x + 50, cy, bounds.x + bounds.w - 50, cy);
    } else if (motif === 'cross-junction') {
      g.lineStyle(3, primary, 0.14);
      g.strokeRect(cx - 190, cy - 190, 380, 380);
      g.lineBetween(bounds.x + 60, cy, bounds.x + bounds.w - 60, cy);
      g.lineBetween(cx, bounds.y + 60, cx, bounds.y + bounds.h - 60);
      g.lineStyle(2, secondary, 0.15);
      g.strokeCircle(cx, cy, 112);
    } else if (motif === 'fortress-bays' || motif === 'containment') {
      for (const inset of [68, 104]) {
        g.lineStyle(2, inset === 68 ? primary : secondary, 0.1);
        g.strokeRect(bounds.x + inset, bounds.y + inset, bounds.w - inset * 2, bounds.h - inset * 2);
      }
    } else if (motif === 'island-cells' || motif === 'cluster-zones' || motif === 'room-nodes') {
      const random = new SeededRandom(this.plan.landmarkSeed ^ 0x91a7);
      for (let index = 0; index < 8; index += 1) {
        const x = random.int(bounds.x + 170, bounds.x + bounds.w - 170);
        const y = random.int(bounds.y + 150, bounds.y + bounds.h - 150);
        const radius = random.int(45, 88);
        g.lineStyle(1, index % 2 ? primary : secondary, 0.12);
        g.strokeCircle(x, y, radius);
        g.fillStyle(index % 2 ? primary : secondary, 0.16);
        g.fillCircle(x, y, 3);
      }
    } else if (motif === 'circuit-maze') {
      g.lineStyle(1, primary, 0.12);
      for (let y = bounds.y + 100; y < bounds.y + bounds.h - 80; y += 150) {
        g.beginPath();
        g.moveTo(bounds.x + 80, y);
        g.lineTo(cx - 70, y);
        g.lineTo(cx - 70, y + 54);
        g.lineTo(bounds.x + bounds.w - 80, y + 54);
        g.strokePath();
      }
    } else {
      g.lineStyle(1, primary, 0.12);
      g.strokeRect(cx - 300, cy - 210, 600, 420);
      g.lineStyle(1, secondary, 0.1);
      g.strokeRect(cx - 460, cy - 320, 920, 640);
    }

    // Small tactical chevrons bind objective sockets to the environment without
    // competing with the live BombSiteManager telegraphs drawn above them.
    for (let siteIndex = 0; siteIndex < this.layout.bombSites.length; siteIndex += 1) {
      const site = this.layout.bombSites[siteIndex];
      const accent = siteIndex % 2 === 0 ? primary : secondary;
      g.lineStyle(2, accent, 0.2);
      for (let chevron = 0; chevron < 3; chevron += 1) {
        const radius = 106 + chevron * 12;
        g.beginPath();
        g.moveTo(site.x - 10, site.y - radius - 7);
        g.lineTo(site.x, site.y - radius);
        g.lineTo(site.x + 10, site.y - radius - 7);
        g.strokePath();
      }
    }
  }

  private drawContainmentPerimeter(): void {
    const bounds = this.layout.generation.bounds;
    const g = this.keep(this.scene.add.graphics().setDepth(1));
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.shadow, 0.75);
    g.fillRect(bounds.x - 22, bounds.y - 22, bounds.w + 44, 18);
    g.fillRect(bounds.x - 22, bounds.y + bounds.h + 4, bounds.w + 44, 18);
    g.fillRect(bounds.x - 22, bounds.y - 4, 18, bounds.h + 8);
    g.fillRect(bounds.x + bounds.w + 4, bounds.y - 4, 18, bounds.h + 8);
    g.lineStyle(2, this.layout.theme.primary, 0.42);
    g.strokeRect(bounds.x - 9, bounds.y - 9, bounds.w + 18, bounds.h + 18);
    g.lineStyle(1, this.layout.theme.secondary, 0.3);
    g.strokeRect(bounds.x - 16, bounds.y - 16, bounds.w + 32, bounds.h + 32);

    const nodeSpacing = 180;
    for (let x = bounds.x + 80; x < bounds.x + bounds.w - 50; x += nodeSpacing) {
      this.drawPerimeterNode(g, x, bounds.y - 11);
      this.drawPerimeterNode(g, x, bounds.y + bounds.h + 11);
    }
    for (let y = bounds.y + 80; y < bounds.y + bounds.h - 50; y += nodeSpacing) {
      this.drawPerimeterNode(g, bounds.x - 11, y);
      this.drawPerimeterNode(g, bounds.x + bounds.w + 11, y);
    }
  }

  private drawPerimeterNode(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x06111b, 1);
    g.fillCircle(x, y, 7);
    g.lineStyle(2, this.layout.theme.primary, 0.72);
    g.strokeCircle(x, y, 7);
    g.fillStyle(this.layout.theme.secondary, 0.72);
    g.fillCircle(x, y, 2);
  }

  private drawWalls(): void {
    const g = this.keep(this.scene.add.graphics().setDepth(2));
    const nodeSet = new Set(this.plan.animatedNodeIndices);
    for (let index = 0; index < this.layout.walls.length; index += 1) {
      const wall = this.layout.walls[index];
      this.drawWallModule(g, wall, index);
      if (nodeSet.has(index)) this.createWallNode(wall, index);
    }
  }

  private drawWallModule(g: Phaser.GameObjects.Graphics, wall: RectSpec, index: number): void {
    const horizontal = wall.w >= wall.h;
    const accent = index % 3 === 0 ? this.layout.theme.secondary : this.layout.theme.primary;
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.shadow, 0.82);
    g.fillRect(wall.x + 7, wall.y + 8, wall.w, wall.h);
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.wall, 1);
    g.fillRect(wall.x, wall.y, wall.w, wall.h);
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.wallInset, 0.96);
    g.fillRect(wall.x + 5, wall.y + 5, Math.max(1, wall.w - 10), Math.max(1, wall.h - 10));
    g.lineStyle(2, accent, 0.75);
    g.strokeRect(wall.x + 1, wall.y + 1, Math.max(1, wall.w - 2), Math.max(1, wall.h - 2));
    g.lineStyle(1, 0x8bdbe5, 0.18);
    g.strokeRect(wall.x + 6, wall.y + 6, Math.max(1, wall.w - 12), Math.max(1, wall.h - 12));

    const stride = this.plan.wallPanelStride;
    g.lineStyle(1, accent, 0.24 + this.plan.profile.wallDensity * 0.12);
    if (horizontal) {
      const railY = wall.y + Math.min(wall.h - 4, Math.max(4, wall.h * 0.28));
      g.lineBetween(wall.x + 8, railY, wall.x + wall.w - 8, railY);
      for (let x = wall.x + stride; x < wall.x + wall.w - 8; x += stride) g.lineBetween(x, wall.y + 5, x, wall.y + wall.h - 5);
    } else {
      const railX = wall.x + Math.min(wall.w - 4, Math.max(4, wall.w * 0.28));
      g.lineBetween(railX, wall.y + 8, railX, wall.y + wall.h - 8);
      for (let y = wall.y + stride; y < wall.y + wall.h - 8; y += stride) g.lineBetween(wall.x + 5, y, wall.x + wall.w - 5, y);
    }

    if ((index * 17 + this.layout.seed) % 7 === 0) {
      g.fillStyle(NEON_CITY_VISUAL_THEME.palette.warning, 0.38);
      if (horizontal) g.fillRect(wall.x + 12, wall.y + wall.h - 5, Math.min(54, wall.w - 24), 2);
      else g.fillRect(wall.x + wall.w - 5, wall.y + 12, 2, Math.min(54, wall.h - 24));
    }
  }

  private createWallNode(wall: RectSpec, index: number): void {
    const color = index % 2 === 0 ? this.layout.theme.primary : this.layout.theme.secondary;
    const node = this.keep(this.scene.add.circle(centerX(wall), centerY(wall), 4, color, 0.56)
      .setStrokeStyle(1, 0xffffff, 0.42)
      .setDepth(2.2));
    const tween = this.scene.tweens.add({
      targets: node,
      alpha: { from: 0.32, to: 0.9 },
      scale: { from: 0.8, to: 1.25 },
      duration: 1100 + (index % 5) * 170,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.tweens.push(tween);
  }

  private drawObstacles(): void {
    const g = this.keep(this.scene.add.graphics().setDepth(3));
    for (let index = 0; index < this.layout.obstacles.length; index += 1) {
      this.drawObstacleModule(g, this.layout.obstacles[index], index);
    }
  }

  private drawObstacleModule(g: Phaser.GameObjects.Graphics, obstacle: GeneratedObstacle, index: number): void {
    const x = obstacle.x;
    const y = obstacle.y;
    const rx = obstacle.w * 0.5;
    const ry = obstacle.h * 0.5;
    const radius = Math.min(rx, ry);
    const accent = index % 2 === 0 ? this.layout.theme.primary : this.layout.theme.secondary;
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.shadow, 0.82);
    this.traceObstacle(g, obstacle, x + 6, y + 7, rx, ry, true, false);
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.wall, 0.98);
    g.lineStyle(2, accent, 0.9);
    this.traceObstacle(g, obstacle, x, y, rx, ry, true, true);
    g.lineStyle(1, 0xa9f8ff, 0.22);
    if (obstacle.kind === 'circle' || obstacle.kind === 'energy-column') {
      g.strokeCircle(x, y, Math.max(3, radius - 7));
      g.fillStyle(accent, obstacle.kind === 'energy-column' ? 0.18 : 0.08);
      g.fillCircle(x, y, Math.max(3, radius * 0.38));
    } else {
      g.strokeRect(x - rx + 7, y - ry + 7, Math.max(1, obstacle.w - 14), Math.max(1, obstacle.h - 14));
      g.lineBetween(x - rx + 10, y, x + rx - 10, y);
    }
  }

  private traceObstacle(g: Phaser.GameObjects.Graphics, obstacle: GeneratedObstacle, x: number, y: number, rx: number, ry: number, fill: boolean, stroke: boolean): void {
    if (obstacle.kind === 'circle' || obstacle.kind === 'energy-column') {
      const radius = Math.min(rx, ry);
      if (fill) g.fillCircle(x, y, radius);
      if (stroke) g.strokeCircle(x, y, radius);
      return;
    }
    if (obstacle.kind === 'triangle') {
      const points = [{ x, y: y - ry }, { x: x - rx, y: y + ry }, { x: x + rx, y: y + ry }];
      if (fill) g.fillPoints(points, true);
      if (stroke) g.strokePoints(points, true);
      return;
    }
    if (obstacle.kind === 'hexagon' || obstacle.kind === 'octagon') {
      const sides = obstacle.kind === 'hexagon' ? 6 : 8;
      const points = Array.from({ length: sides }, (_, side) => {
        const angle = side * Math.PI * 2 / sides;
        return { x: x + Math.cos(angle) * rx, y: y + Math.sin(angle) * ry };
      });
      if (fill) g.fillPoints(points, true);
      if (stroke) g.strokePoints(points, true);
      return;
    }
    if (fill) g.fillRect(x - rx, y - ry, obstacle.w, obstacle.h);
    if (stroke) g.strokeRect(x - rx, y - ry, obstacle.w, obstacle.h);
  }

  private drawDistrictDressing(): void {
    const bounds = this.layout.generation.bounds;
    const random = new SeededRandom(this.plan.landmarkSeed);
    const labelRoot = this.keep(this.scene.add.container(0, 0).setDepth(1.6));
    const title = this.scene.add.text(bounds.x + 56, bounds.y + 52, `N3ON // ${this.plan.districtLabel}`, {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '16px',
      color: colorCss(this.layout.theme.primary),
      stroke: '#02060b',
      strokeThickness: 4
    }).setAlpha(0.52);
    const sector = this.scene.add.text(bounds.x + 56, bounds.y + 76, `${this.plan.profile.landmark} // ${this.layout.template.toUpperCase()}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '12px',
      color: '#91a9b6',
      stroke: '#02060b',
      strokeThickness: 3
    }).setAlpha(0.62);
    labelRoot.add([title, sector]);

    const wallSigns = this.plan.signWallIndices.slice(0, NEON_CITY_VISUAL_THEME.maximumSigns);
    for (let index = 0; index < wallSigns.length; index += 1) {
      const wall = this.layout.walls[wallSigns[index]];
      if (!wall || Math.min(wall.w, wall.h) < 22 || Math.max(wall.w, wall.h) < 90) continue;
      const horizontal = wall.w >= wall.h;
      const sign = this.scene.add.text(centerX(wall), centerY(wall), random.pick(['N3ON', 'GRID', 'LINK', 'VOID', `S-${(this.layout.seed + index) % 99}`]), {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '9px',
        color: colorCss(index % 2 ? this.layout.theme.primary : this.layout.theme.secondary),
        backgroundColor: '#030810',
        padding: { x: 5, y: 2 }
      }).setOrigin(0.5).setAlpha(0.72).setRotation(horizontal ? 0 : Math.PI * 0.5);
      labelRoot.add(sign);
    }
  }
}
