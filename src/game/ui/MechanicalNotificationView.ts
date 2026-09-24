import Phaser from 'phaser';
import { bakeStaticGraphics } from '../rendering/bakeStaticGraphics.ts';
import { calculateHudLayout } from '../systems/hudLayout.ts';
import type { HudSettings } from '../config/interfaceSettings.ts';
import type { HudNotification, HudNotificationAnimation, HudNotificationQueue } from './HudNotificationQueue.ts';

const W = 400, H = 220, CYAN = 0x63f7ff;
const TYPES: HudNotificationAnimation[] = ['console', 'redline', 'supply', 'thief', 'hunt', 'boss', 'circuit', 'anomaly', 'disarm', 'reward', 'hazard'];
/** Existing event names are retained; no new gameplay event is introduced. */
export function notificationAnimation(n: HudNotification): HudNotificationAnimation {
  if (n.animation) return n.animation;
  const title = n.heading.toUpperCase();
  if (title.includes('REDLINE')) return 'redline';
  if (/HOT PACKAGE|SUPPLY (DROP|POD)/.test(title)) return 'supply';
  if (/PACKET SNATCHER|DATA THIEF/.test(title)) return 'thief';
  if (title.includes('GOLDEN HUNT')) return 'hunt';
  if (title.includes('BOSS')) return 'boss';
  if (title.includes('NEON CIRCUIT')) return 'circuit';
  if (n.category === 'anomaly') return 'anomaly';
  if (['weekly', 'reward', 'success', 'progression'].includes(n.category)) return 'reward';
  return 'console';
}

/** One masked screen below the permanent deck in draw order. All artwork is baked
 * once; motion uses transforms on a small, fixed set of indicators. */
export class MechanicalNotificationView {
  readonly root: Phaser.GameObjects.Container;
  readonly panel: Phaser.GameObjects.Container;
  readonly needle: Phaser.GameObjects.Rectangle;
  readonly progressBar: Phaser.GameObjects.Rectangle;
  private readonly maskSource: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.Display.Masks.GeometryMask;
  private readonly motifs = new Map<HudNotificationAnimation, Phaser.GameObjects.RenderTexture>();
  private readonly heading: Phaser.GameObjects.Text;
  private readonly message: Phaser.GameObjects.Text;
  private readonly secondary: Phaser.GameObjects.Text;
  private readonly readout: Phaser.GameObjects.Text;
  private readonly sweep: Phaser.GameObjects.Rectangle;
  private readonly packets: Phaser.GameObjects.Rectangle[];
  private readonly rails: Phaser.GameObjects.Rectangle[];
  private readonly crate: Phaser.GameObjects.RenderTexture;
  private readonly canopy: Phaser.GameObjects.RenderTexture;
  private shownKey = '';
  private shownText = '';
  private lastPhase = 'HIDDEN';
  private age = 0;
  private shownRpm = 0;
  private baseY = 0;
  private nextText = 0;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene) {
    const bake = (draw: (g: Phaser.GameObjects.Graphics) => void, x: number, y: number, w: number, h: number) => {
      const g = scene.make.graphics({}, false); draw(g); return bakeStaticGraphics(scene, g, { x, y, w, h });
    };
    const frame = bake(g => {
      const p = [{ x: 12, y: 18 }, { x: 16, y: 4 }, { x: 107, y: 4 }, { x: 121, y: 18 },
        { x: W - 14, y: 18 }, { x: W, y: 32 }, { x: W, y: H }, { x: 0, y: H }, { x: 0, y: 32 }];
      g.fillStyle(0x07121c, 1).fillPoints(p, true).lineStyle(1.5, 0x428998, .95).strokePoints(p, true);
      g.fillStyle(0x020910, 1).fillRect(10, 31, W - 20, H - 42);
      g.lineStyle(1, CYAN, .5).lineBetween(16, 25, W - 22, 25).lineBetween(109, 44, 109, H - 22);
      g.fillStyle(CYAN, .7).fillRect(15, 29, 54, 2).fillRect(W - 27, 39, 3, 16);
      for (let y = 37; y < H - 12; y += 5) g.fillStyle(0x4be4e9, .035).fillRect(13, y, W - 26, 1);
      for (const x of [6, W - 9]) for (const y of [42, H - 12]) g.fillStyle(0x7595a2, .9).fillRect(x, y, 3, 3);
      g.lineStyle(2, 0x182e3c, 1).lineBetween(16, H - 7, W - 16, H - 7);
    }, -2, 0, W + 4, H + 2);
    const tab = scene.add.text(23, 7, 'TACTICAL', { fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: '#b2edf0', letterSpacing: 2 });
    this.rails = [24, W - 30].map(x => scene.add.rectangle(x, 0, 6, H, 0x264354).setOrigin(0, 1));
    this.heading = scene.add.text(122, 41, '', { fontFamily: 'Orbitron, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#63f7ff', wordWrap: { width: 255 } });
    this.message = scene.add.text(122, 86, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#e5f6fa', wordWrap: { width: 255, useAdvancedWrap: true }, lineSpacing: 1 });
    this.secondary = scene.add.text(122, 182, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#9abac6', wordWrap: { width: 255 } });
    this.readout = scene.add.text(58, 179, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#b9f9ff' }).setOrigin(.5);
    for (const type of TYPES) {
      const art = bake(g => this.drawMotif(g, type), -48, -57, 96, 118).setPosition(10, 55).setVisible(false);
      this.motifs.set(type, art);
    }
    this.needle = scene.add.rectangle(58, 122, 37, 2, 0xffffff).setOrigin(0, .5).setName('notification-rpm-needle');
    this.sweep = scene.add.rectangle(58, 113, 40, 2, CYAN).setOrigin(0, .5);
    this.progressBar = scene.add.rectangle(48, 151, 20, 76, 0xff6175).setOrigin(0, 1).setName('notification-disarm-progress');
    this.packets = [0, 1, 2].map(() => scene.add.rectangle(30, 118, 9, 7, CYAN).setStrokeStyle(1, 0xd8ffff));
    this.crate = bake(g => {
      g.fillStyle(0x143a44).fillRect(-17, -12, 34, 25).lineStyle(2, 0xffdb87).strokeRect(-17, -12, 34, 25);
      g.lineStyle(2, 0xffdb87).lineBetween(-6, -11, -6, 12).lineBetween(6, -11, 6, 12).lineBetween(-16, 0, 16, 0);
    }, -19, -14, 38, 29);
    this.canopy = bake(g => {
      g.lineStyle(1.5, CYAN).beginPath().arc(0, 0, 29, Math.PI, Math.PI * 2).strokePath();
      g.lineBetween(-29, 0, 29, 0).lineBetween(-29, 0, -10, 30).lineBetween(29, 0, 10, 30).lineBetween(0, -27, 0, 29);
    }, -31, -31, 62, 64);
    this.panel = scene.add.container(0, 0, [frame, tab, ...this.motifs.values(), this.crate, this.canopy,
      this.needle, this.sweep, this.progressBar, ...this.packets, this.heading, this.message, this.secondary, this.readout]);
    this.panel.setName('hud-notification-panel');
    this.root = scene.add.container(0, 0, [...this.rails, this.panel]).setScrollFactor(0).setDepth(999).setVisible(false).setName('hud-mechanical-notification');
    this.maskSource = scene.make.graphics({}, false).setScrollFactor(0);
    this.mask = this.maskSource.createGeometryMask(); this.root.setMask(this.mask);
  }

  private drawMotif(g: Phaser.GameObjects.Graphics, type: HudNotificationAnimation): void {
    g.lineStyle(1, 0x244c5b).strokeRect(-44, -51, 88, 111);
    g.lineStyle(2, CYAN, .85);
    if (type === 'redline') {
      // Same semicircle, red zone, and transform-only needle as the original RPM display.
      for (let i = 0; i <= 40; i++) {
        const a = Math.PI + i / 40 * Math.PI, r = i % 5 === 0 ? 31 : 36;
        g.lineStyle(i % 5 === 0 ? 2 : 1, i >= 28 ? 0xff4563 : CYAN, .9)
          .lineBetween(Math.cos(a) * r, 10 + Math.sin(a) * r, Math.cos(a) * 41, 10 + Math.sin(a) * 41);
      }
      g.fillStyle(0xff4563).fillCircle(0, 10, 4);
    } else if (type === 'hunt' || type === 'anomaly') {
      g.strokeCircle(0, 1, 34).strokeCircle(0, 1, 19).lineBetween(-38, 1, 38, 1).lineBetween(0, -37, 0, 39);
      for (const [x, y] of [[15, -14], [-19, 12], [22, 22]]) g.fillStyle(type === 'hunt' ? 0xffd65a : 0xff5bd8).fillRect(x, y, 4, 4);
    } else if (type === 'thief') {
      g.fillStyle(0x15313e).fillTriangle(-7, -17, 35, -17, 14, -46).fillRect(-9, -16, 44, 47);
      g.lineStyle(2, CYAN).strokeTriangle(-7, -17, 35, -17, 14, -46).strokeRect(-9, -16, 44, 47);
      g.fillStyle(0xffd65a).fillRect(1, -10, 9, 4).fillRect(17, -10, 9, 4);
      g.lineBetween(1, 30, -9, 45).lineBetween(24, 30, 35, 43);
    } else if (type === 'boss') {
      g.lineStyle(2, 0xff6175).strokeTriangle(0, -39, -36, 34, 36, 34);
      g.fillStyle(0xff6175).fillRect(-16, -3, 32, 23).fillRect(-23, 1, 9, 12).fillRect(14, 1, 9, 12);
      g.fillStyle(0x06111b).fillRect(-11, 3, 8, 5).fillRect(4, 3, 8, 5);
    } else if (type === 'circuit' || type === 'hazard') {
      for (let i = 0; i < 3; i++) g.lineBetween(-32, -30 + i * 26, -10, -30 + i * 26)
        .lineBetween(-10, -30 + i * 26, 12, -15 + i * 26).lineBetween(12, -15 + i * 26, 31, -15 + i * 26)
        .strokeRect(29, -18 + i * 26, 6, 6);
    } else if (type === 'disarm') {
      g.lineStyle(1.5, 0xff6175).strokeRect(-14, -39, 28, 82);
      for (let i = 0; i <= 5; i++) g.lineBetween(-24, 40 - i * 16, -18, 40 - i * 16).lineBetween(18, 40 - i * 16, 24, 40 - i * 16);
    } else if (type === 'reward') {
      g.lineStyle(2, 0x7dffb2).strokePoints([{ x: 0, y: -37 }, { x: 32, y: -20 }, { x: 32, y: 18 }, { x: 0, y: 38 }, { x: -32, y: 18 }, { x: -32, y: -20 }], true);
      g.lineBetween(-17, 0, -3, 14).lineBetween(-3, 14, 21, -15);
    } else if (type !== 'supply') {
      g.strokeRect(-32, -25, 64, 46).lineBetween(-25, -15, -14, -7).lineBetween(-14, -7, -25, 1).lineBetween(-5, 3, 17, 3).lineBetween(-19, 32, 19, 32);
    }
  }

  layout(settings: HudSettings): void {
    this.message.setFontSize({ small: 16, medium: 18, large: 21 }[settings.tacticalTextSize]);
    const { width, height } = this.scene.scale, hud = calculateHudLayout(width, height, settings), deck = hud.abilities;
    const scale = Math.min(1.15, (deck.width - 20) / W, Math.max(100, deck.y - hud.objective.height - 24) / H);
    this.baseY = deck.y + 2;
    this.root.setData('anchor', { x: deck.x + (deck.width - W * scale) / 2, y: this.baseY, scale });
    this.maskSource.clear().fillStyle(0xffffff).fillRect(0, 0, width, deck.y + 1);
    this.shownText = '';
    this.syncCamera();
  }
  private syncCamera(): void {
    const { width, height } = this.scene.scale, zoom = this.scene.cameras.main.zoom;
    const x = width * .5 * (1 - 1 / zoom), y = height * .5 * (1 - 1 / zoom);
    const anchor = this.root.getData('anchor');
    if (anchor) this.root.setPosition(x + anchor.x / zoom, y + this.baseY / zoom).setScale(anchor.scale / zoom);
    this.maskSource.setPosition(x, y).setScale(1 / zoom);
  }
  update(queue: HudNotificationQueue, delta: number, suspended: boolean): void {
    this.syncCamera();
    const n = queue.active;
    this.root.setVisible(!suspended && !!n && queue.phase !== 'HIDDEN');
    if (!n) { this.shownKey = ''; this.lastPhase = 'HIDDEN'; return; }
    if (suspended) return;
    const p = queue.deployment, eased = p * p * (3 - 2 * p);
    this.panel.setY(-H * eased);
    for (const rail of this.rails) rail.setScale(1, eased);
    if (this.shownKey !== n.key || (queue.phase === 'DEPLOYING' && this.lastPhase === 'RETRACTING')) {
      this.shownKey = n.key!; this.age = this.shownRpm = this.nextText = 0;
    }
    this.lastPhase = queue.phase;
    if (queue.phase === 'ACTIVE') this.age += delta;
    const type = notificationAnimation(n), seconds = this.age / 1000;
    for (const [key, motif] of this.motifs) motif.setVisible(key === type).setAlpha(type === 'boss' ? .65 + .35 * Math.sin(seconds * 5) ** 2 : 1);
    this.needle.setVisible(type === 'redline'); this.progressBar.setVisible(type === 'disarm');
    this.sweep.setVisible(type === 'hunt' || type === 'anomaly' || type === 'reward' || type === 'console');
    this.sweep.setRotation(type === 'hunt' || type === 'anomaly' ? seconds * 1.9 : 0).setAlpha(.3 + .3 * Math.sin(seconds * 3) ** 2);
    this.progressBar.setScale(1, Phaser.Math.Clamp(n.progress ?? 0, 0, 1));
    const target = n.rpm ?? (Math.min(1, seconds / 1.2) * 92);
    this.shownRpm += (target - this.shownRpm) * (1 - Math.exp(-delta / 95));
    this.needle.setRotation(Math.PI + this.shownRpm / 100 * Math.PI + (this.shownRpm > 90 ? Math.sin(seconds * 50) * .016 : 0));
    this.crate.setVisible(type === 'supply'); this.canopy.setVisible(type === 'supply');
    const fall = Math.min(1, seconds / 1.6), bounce = fall >= 1 ? Math.sin((seconds - 1.6) * 14) * Math.exp(-(seconds - 1.6) * 4) * 6 : 0;
    this.crate.setPosition(39, 66 + fall * 71 - bounce);
    this.canopy.setPosition(27, 29 + fall * 71 - bounce).setAlpha(fall < 1 ? 1 : Math.max(0, 1 - (seconds - 1.6) * 3));
    for (let i = 0; i < this.packets.length; i++) {
      const packet = this.packets[i], t = (seconds * .65 + i / 3) % 1;
      packet.setVisible(type === 'thief' || type === 'circuit' || type === 'hazard');
      packet.setPosition(23 + t * 62, type === 'thief' ? 112 + i * 9 : 82 + i * 26 + t * 15).setAlpha(type === 'thief' ? 1 - t * .8 : 1);
    }
    if (this.age >= this.nextText || this.shownText !== `${n.heading}|${n.message}|${n.secondary}`) {
      this.nextText = this.age + 100;
      this.shownText = `${n.heading}|${n.message}|${n.secondary}`;
      const color = type === 'disarm' || n.category === 'failure' || type === 'redline' ? '#ff7890' : '#8ceff2';
      this.heading.setText(n.heading.replace(/\n/g, ' ')).setColor(color);
      this.message.setText((n.message ?? '').replace(/\n/g, ' '));
      this.secondary.setText((n.secondary ?? '').replace(/\n/g, ' '));
      for (const [text, maxHeight] of [[this.heading, 40], [this.message, 90], [this.secondary, 29]] as const)
        text.setScale(Math.min(1, maxHeight / Math.max(1, text.height)));
      this.readout.setText(type === 'redline' ? `${Math.round(this.shownRpm)}% RPM` : type === 'disarm' ? `${Math.round((n.progress ?? 0) * 100)}%` : type === 'supply' ? 'SUPPLY DROP' : type === 'thief' ? 'DATA THEFT' : '');
    }
  }
  clear(): void { this.root.setVisible(false); this.shownKey = this.shownText = ''; this.age = this.shownRpm = 0; }
  destroy(): void {
    if (this.destroyed) return; this.destroyed = true;
    this.root.clearMask(); this.mask.destroy(); this.maskSource.destroy(); this.root.destroy(true);
  }
}
