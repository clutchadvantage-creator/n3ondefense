import Phaser from 'phaser';
import type { EconomyValuePoint } from '../economy/EconomyAnalytics.ts';

export interface EconomyConsoleRect { x: number; y: number; width: number; height: number }

export const ECONOMY_FONT = 'Rajdhani, sans-serif';
export const ECONOMY_DISPLAY_FONT = 'Orbitron, sans-serif';

const chamfer = (width: number, height: number, cut = 12): number[] => [
  cut, 0, width - cut, 0, width, cut, width, height - cut,
  width - cut, height, cut, height, 0, height - cut, 0, cut
];

export const formatEconomyNumber = (value: number): string => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (absolute >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
};

export const createEconomyPanel = (
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  rect: EconomyConsoleRect,
  title: string,
  accent = 0x62efff,
  subtitle = ''
): Phaser.GameObjects.Container => {
  const panel = scene.add.container(rect.x, rect.y);
  const shadow = scene.add.polygon(7, 9, chamfer(rect.width, rect.height, 14), 0x000000, 0.64).setOrigin(0);
  const rear = scene.add.polygon(3, 3, chamfer(rect.width, rect.height, 14), 0x102431, 0.97)
    .setOrigin(0).setStrokeStyle(3, 0x02070c, 0.95);
  const face = scene.add.polygon(0, 0, chamfer(rect.width - 4, rect.height - 4, 13), 0x07131e, 0.97)
    .setOrigin(0).setStrokeStyle(2, accent, 0.62);
  const recess = scene.add.rectangle(10, 43, rect.width - 24, Math.max(8, rect.height - 56), 0x020a11, 0.68)
    .setOrigin(0).setStrokeStyle(1, accent, 0.18);
  const headerGlass = scene.add.rectangle(11, 9, rect.width - 25, 29, accent, 0.075).setOrigin(0);
  const rail = scene.add.rectangle(18, 5, rect.width - 43, 3, accent, 0.82).setOrigin(0);
  const sideRail = scene.add.rectangle(5, 16, 3, Math.max(10, rect.height - 34), accent, 0.32).setOrigin(0);
  const titleText = scene.add.text(20, 14, title, {
    fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${rect.width < 300 ? 11 : 13}px`, color: Phaser.Display.Color.IntegerToColor(accent).rgba,
    fontStyle: 'bold', letterSpacing: 0.5
  });
  const led = scene.add.circle(rect.width - 22, 22, 3, accent, 0.92);
  panel.add([shadow, rear, face, recess, headerGlass, rail, sideRail, titleText, led]);
  if (subtitle) panel.add(scene.add.text(rect.width - 35, 16, subtitle, {
    fontFamily: ECONOMY_FONT, fontSize: '10px', color: '#789baa', fontStyle: 'bold'
  }).setOrigin(1, 0));
  root.add(panel);
  return panel;
};

export const addMetric = (
  scene: Phaser.Scene,
  panel: Phaser.GameObjects.Container,
  x: number,
  y: number,
  label: string,
  value: string,
  color = 0x62efff,
  align: 'left' | 'center' | 'right' = 'left',
  width = 180
): void => {
  const originX = align === 'left' ? 0 : align === 'right' ? 1 : 0.5;
  panel.add(scene.add.text(x, y, label, {
    fontFamily: ECONOMY_FONT, fontSize: '11px', color: '#789baa', fontStyle: 'bold', letterSpacing: 0.5,
    align, fixedWidth: align === 'center' ? width : undefined
  }).setOrigin(originX, 0));
  panel.add(scene.add.text(x, y + 15, value, {
    fontFamily: ECONOMY_DISPLAY_FONT, fontSize: '17px', color: Phaser.Display.Color.IntegerToColor(color).rgba,
    fontStyle: 'bold', align, fixedWidth: align === 'center' ? width : undefined
  }).setOrigin(originX, 0));
};

export const drawProgressBar = (
  scene: Phaser.Scene,
  panel: Phaser.GameObjects.Container,
  x: number,
  y: number,
  width: number,
  label: string,
  value: number,
  detail: string,
  color = 0x62efff
): void => {
  const ratio = Phaser.Math.Clamp(value / 100, 0, 1);
  panel.add(scene.add.text(x, y, label, { fontFamily: ECONOMY_FONT, fontSize: '12px', color: '#c6dce5', fontStyle: 'bold' }));
  panel.add(scene.add.text(x + width, y, detail, { fontFamily: ECONOMY_FONT, fontSize: '12px', color: '#8fb2bf', fontStyle: 'bold' }).setOrigin(1, 0));
  panel.add(scene.add.rectangle(x, y + 20, width, 9, 0x18323e, 0.85).setOrigin(0).setStrokeStyle(1, color, 0.35));
  panel.add(scene.add.rectangle(x + 2, y + 22, Math.max(1, (width - 4) * ratio), 5, color, 0.9).setOrigin(0));
};

export const drawHorizontalBars = (
  scene: Phaser.Scene,
  panel: Phaser.GameObjects.Container,
  rect: EconomyConsoleRect,
  points: EconomyValuePoint[],
  options: { maxRows?: number; suffix?: string; normalizeLabel?: string } = {}
): void => {
  const rows = [...points].sort((a, b) => b.value - a.value).slice(0, options.maxRows ?? 7);
  const max = Math.max(1, ...rows.map((point) => point.value));
  const labelWidth = Math.min(145, rect.width * 0.36);
  const barLeft = rect.x + labelWidth;
  const barWidth = Math.max(40, rect.width - labelWidth - 65);
  const rowHeight = rect.height / Math.max(1, rows.length);
  rows.forEach((point, index) => {
    const y = rect.y + index * rowHeight + 3;
    panel.add(scene.add.text(rect.x, y, point.label, {
      fontFamily: ECONOMY_FONT, fontSize: `${rowHeight < 27 ? 10 : 12}px`, color: '#bdd2dc', fontStyle: 'bold'
    }).setWordWrapWidth(labelWidth - 7, false).setMaxLines(1));
    const barHeight = point.detail ? Math.max(6, Math.min(11, rowHeight - 23)) : Math.max(7, rowHeight - 12);
    panel.add(scene.add.rectangle(barLeft, y + 4, barWidth, barHeight, 0x19333e, 0.7).setOrigin(0));
    panel.add(scene.add.rectangle(barLeft, y + 4, Math.max(1, barWidth * point.value / max), barHeight, point.color, 0.82).setOrigin(0));
    panel.add(scene.add.text(rect.x + rect.width, y, `${formatEconomyNumber(point.value)}${options.suffix ?? ''}`, {
      fontFamily: ECONOMY_FONT, fontSize: `${rowHeight < 27 ? 10 : 12}px`, color: '#e6faff', fontStyle: 'bold'
    }).setOrigin(1, 0));
    if (point.detail) panel.add(scene.add.text(rect.x, y + 17, point.detail, {
      fontFamily: ECONOMY_FONT, fontSize: '9px', color: '#718f9b', fontStyle: 'bold'
    }).setMaxLines(1));
  });
  if (options.normalizeLabel) panel.add(scene.add.text(rect.x, rect.y + rect.height + 2, options.normalizeLabel, {
    fontFamily: ECONOMY_FONT, fontSize: '9px', color: '#648695', fontStyle: 'bold'
  }));
};

const evenlySample = (points: EconomyValuePoint[], limit: number): EconomyValuePoint[] => {
  if (points.length <= limit) return points;
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * (points.length - 1) / (limit - 1))]);
};

export const drawLineChart = (
  scene: Phaser.Scene,
  panel: Phaser.GameObjects.Container,
  rect: EconomyConsoleRect,
  points: EconomyValuePoint[],
  color = 0x62efff,
  unit = 'CR EQ'
): void => {
  const data = evenlySample(points, Math.max(8, Math.floor(rect.width / 10)));
  const values = data.map((point) => point.value);
  const maximum = Math.max(1, ...values);
  const minimum = Math.min(0, ...values);
  const graphLeft = rect.x + 52;
  const graphTop = rect.y + 12;
  const graphWidth = Math.max(40, rect.width - 61);
  const graphHeight = Math.max(24, rect.height - 36);
  const graphics = scene.add.graphics();
  graphics.lineStyle(1, 0x537887, 0.25);
  for (let i = 0; i <= 4; i += 1) {
    const y = graphTop + graphHeight * i / 4;
    graphics.lineBetween(graphLeft, y, graphLeft + graphWidth, y);
  }
  if (data.length > 1) {
    const chartPoints = data.map((point, index) => new Phaser.Math.Vector2(
      graphLeft + graphWidth * index / (data.length - 1),
      graphTop + graphHeight - ((point.value - minimum) / Math.max(1, maximum - minimum)) * graphHeight
    ));
    graphics.lineStyle(3, color, 0.9);
    graphics.strokePoints(chartPoints, false);
    graphics.fillStyle(color, 0.95);
    chartPoints.forEach((point, index) => { if (index === 0 || index === chartPoints.length - 1) graphics.fillCircle(point.x, point.y, 3); });
  }
  panel.add(graphics);
  for (let i = 0; i <= 4; i += 1) {
    panel.add(scene.add.text(rect.x + 47, graphTop + graphHeight * i / 4, formatEconomyNumber(maximum * (1 - i / 4)), {
      fontFamily: ECONOMY_FONT, fontSize: '9px', color: '#7f9eaa'
    }).setOrigin(1, 0.5));
  }
  const first = points[0]?.label ?? 'NO DATA';
  const last = points.at(-1)?.label ?? 'NO DATA';
  panel.add(scene.add.text(graphLeft, graphTop + graphHeight + 5, first, { fontFamily: ECONOMY_FONT, fontSize: '9px', color: '#7797a4' }).setMaxLines(1));
  panel.add(scene.add.text(graphLeft + graphWidth, graphTop + graphHeight + 5, last, { fontFamily: ECONOMY_FONT, fontSize: '9px', color: '#7797a4' }).setOrigin(1, 0).setMaxLines(1));
  panel.add(scene.add.text(rect.x, rect.y, unit, { fontFamily: ECONOMY_FONT, fontSize: '9px', color: '#658795', fontStyle: 'bold' }));
};

export const drawDonut = (
  scene: Phaser.Scene,
  panel: Phaser.GameObjects.Container,
  centerX: number,
  centerY: number,
  radius: number,
  entries: Array<{ label: string; percentage: number; color: number }>,
  centerLabel: string
): void => {
  const graphics = scene.add.graphics();
  graphics.lineStyle(Math.max(9, radius * 0.24), 0x18343e, 0.8);
  graphics.strokeCircle(centerX, centerY, radius);
  let start = -Math.PI / 2;
  const positiveTotal = entries.reduce((sum, entry) => sum + Math.max(0, entry.percentage), 0);
  entries.forEach((entry) => {
    const share = positiveTotal ? entry.percentage / positiveTotal : 0;
    const end = start + share * Math.PI * 2;
    if (share > 0) {
      graphics.lineStyle(Math.max(9, radius * 0.24), entry.color, 0.95);
      graphics.beginPath(); graphics.arc(centerX, centerY, radius, start + 0.01, end - 0.01); graphics.strokePath();
    }
    start = end;
  });
  panel.add(graphics);
  panel.add(scene.add.text(centerX, centerY - 9, centerLabel, {
    fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${Math.max(10, radius * 0.19)}px`, color: '#e9fcff', fontStyle: 'bold', align: 'center'
  }).setOrigin(0.5));
  panel.add(scene.add.text(centerX, centerY + 10, 'CR EQ', { fontFamily: ECONOMY_FONT, fontSize: '10px', color: '#7598a6', fontStyle: 'bold' }).setOrigin(0.5));
};

export const drawVerticalBars = (
  scene: Phaser.Scene,
  panel: Phaser.GameObjects.Container,
  rect: EconomyConsoleRect,
  points: EconomyValuePoint[],
  threshold?: number
): void => {
  const data = points.slice(0, Math.max(1, Math.floor(rect.width / 54)));
  const maximum = Math.max(1, threshold ?? 0, ...data.map((point) => point.value));
  const gap = 7;
  const barWidth = Math.max(14, (rect.width - gap * (data.length - 1)) / Math.max(1, data.length));
  if (threshold !== undefined) {
    const thresholdY = rect.y + rect.height - threshold / maximum * rect.height;
    panel.add(scene.add.rectangle(rect.x, thresholdY, rect.width, 1, 0xffffff, 0.62).setOrigin(0));
    panel.add(scene.add.text(rect.x + rect.width, thresholdY - 12, `BAL ${threshold.toLocaleString()} PC`, {
      fontFamily: ECONOMY_FONT, fontSize: '9px', color: '#dcecff', fontStyle: 'bold'
    }).setOrigin(1, 0));
  }
  data.forEach((point, index) => {
    const x = rect.x + index * (barWidth + gap);
    const barHeight = Math.max(2, rect.height * point.value / maximum);
    panel.add(scene.add.rectangle(x, rect.y + rect.height, barWidth, barHeight, point.color, 0.86).setOrigin(0, 1));
    panel.add(scene.add.text(x + barWidth / 2, rect.y + rect.height - barHeight - 15, point.value.toLocaleString(), {
      fontFamily: ECONOMY_FONT, fontSize: '9px', color: '#e8faff', fontStyle: 'bold'
    }).setOrigin(0.5, 0));
    panel.add(scene.add.text(x + barWidth / 2, rect.y + rect.height + 3, point.label.slice(0, 10).toUpperCase(), {
      fontFamily: ECONOMY_FONT, fontSize: '8px', color: '#819da8', fontStyle: 'bold'
    }).setOrigin(0.5, 0));
  });
};
