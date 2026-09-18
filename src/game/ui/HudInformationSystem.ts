import Phaser from 'phaser';
import { normalizeHudSettings, type HudSettings } from '../config/interfaceSettings.ts';
import { bakeStaticGraphics } from '../rendering/bakeStaticGraphics.ts';
import { calculateHudLayout } from '../systems/hudLayout.ts';
import { HudNotificationQueue, type HudNotification, type HudNotificationCategory } from './HudNotificationQueue.ts';

const owners = new WeakMap<Phaser.Scene, HudInformationSystem>();
const ACCENTS: Record<HudNotificationCategory, number> = {
  system: 0x63f7ff, arcade: 0xffd65a, redline: 0xff526f, success: 0x7dffb2,
  failure: 0xff5f7c, weekly: 0x7dffb2, anomaly: 0xff5bd8, progression: 0xffd65a, reward: 0x7dffb2
};
const ROWS = ['laser', 'bomblet', 'gas', 'flux'];

/** One reusable panel and a separate live feed, owned by the current encounter. */
export class HudInformationSystem {
  static forScene(scene: Phaser.Scene): HudInformationSystem {
    return owners.get(scene) ?? new HudInformationSystem(scene);
  }
  readonly queue = new HudNotificationQueue();
  private readonly eventStates = new Map<string, HudNotification>();
  private readonly eventLines: Phaser.GameObjects.Text[];
  private readonly art: Phaser.GameObjects.RenderTexture;
  private eventRevision = 0;
  private shownEventRevision = -1;
  private footerCount = 0;
  private readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Container;
  private readonly accent: Phaser.GameObjects.Rectangle;
  private readonly heading: Phaser.GameObjects.Text;
  private readonly message: Phaser.GameObjects.Text;
  private readonly secondary: Phaser.GameObjects.Text;
  private readonly rows = new Map<string, { text: Phaser.GameObjects.Text; essential: boolean }>();
  private settings = normalizeHudSettings(undefined);
  private shown: HudNotification | null = null;
  private destroyed = false;
  private panelY = 208;
  private topBoundary = 134;

  private constructor(private readonly scene: Phaser.Scene) {
    owners.set(scene, this);
    const g = scene.make.graphics({}, false);
    const points = [{ x: -305, y: -46 }, { x: 281, y: -46 }, { x: 305, y: -22 },
      { x: 305, y: 46 }, { x: -281, y: 46 }, { x: -305, y: 22 }];
    g.fillStyle(0x020711, .94).fillPoints(points, true);
    g.lineStyle(1, 0x63f7ff, .65).strokePoints(points, true);
    g.lineStyle(1, 0x63f7ff, .35).lineBetween(-275, -38, 271, -38).lineBetween(-271, 38, 275, 38);
    this.art = bakeStaticGraphics(scene, g, { x: -307, y: -48, w: 614, h: 96 });
    this.accent = scene.add.rectangle(-296, 0, 3, 42, ACCENTS.system);
    this.heading = scene.add.text(0, -25, '', { fontFamily: 'Orbitron, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#63f7ff' }).setOrigin(.5);
    this.message = scene.add.text(0, 1, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#e7fbff', align: 'center', wordWrap: { width: 556, useAdvancedWrap: true } }).setOrigin(.5);
    this.secondary = scene.add.text(0, 25, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#b9d7e4' }).setOrigin(.5);
    this.eventLines = [0, 1].map(index => scene.add.text(0, 58 + index * 32, '', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#c9f7ff', align: 'center'
    }).setOrigin(.5).setVisible(false));
    this.panel = scene.add.container(0, 0, [this.art, this.accent, this.heading, this.message, this.secondary, ...this.eventLines]).setVisible(false).setName('hud-notification-panel');
    this.root = scene.add.container(0, 0, [this.panel]).setScrollFactor(0).setDepth(3650).setName('hud-information');
    scene.scale.on('resize', this.layout, this);
    scene.events.once('shutdown', this.destroy, this);
    scene.events.on('pause', this.clear, this);
    scene.events.on('sleep', this.clear, this);
    this.layout();
  }

  notify(notice: HudNotification): void { if (!this.destroyed) this.queue.submit(notice); }

  /** Live event state is updated in place, never timed out or pushed into the toast queue. */
  setEventState(key: 'arcade' | 'anomaly', heading: string, message: string, category: HudNotificationCategory = 'arcade'): void {
    if (this.destroyed) return;
    const old = this.eventStates.get(key);
    if (old?.heading === heading && old.message === message && old.category === category) return;
    if (!old && this.eventStates.size >= this.eventLines.length) return;
    this.eventStates.set(key, { heading, message, category });
    this.eventRevision++;
  }

  removeEventState(key: string): void { if (this.eventStates.delete(key)) this.eventRevision++; }

  createTacticalText(key: string, color: string, essential = false): Phaser.GameObjects.Text {
    this.rows.get(key)?.text.destroy();
    const text = this.scene.add.text(0, 0, '', { fontFamily: 'Orbitron, sans-serif', fontSize: '17px', color,
      stroke: '#050812', strokeThickness: 4, align: 'center' }).setOrigin(.5).setAlpha(0).setName(`tactical-${key}`);
    this.root.add(text);
    this.rows.set(key, { text, essential });
    text.once('destroy', () => { if (this.rows.get(key)?.text === text) this.rows.delete(key); });
    this.layout();
    return text;
  }

  setEssential(key: string, essential: boolean): void {
    const row = this.rows.get(key);
    if (row && row.essential !== essential) { row.essential = essential; this.layout(); }
  }

  applySettings(settings: HudSettings): void { this.settings = normalizeHudSettings(settings); this.layout(); }
  setTopBoundary(bottom: number): void { this.topBoundary = bottom; this.layout(); }

  update(deltaMs: number, suspended = false): void {
    if (this.destroyed) return;
    this.root.setVisible(!suspended);
    this.syncCamera();
    if (suspended) return;
    this.queue.update(deltaMs);
    const notice = this.queue.active ?? this.eventStates.values().next().value ?? null;
    if (notice !== this.shown || this.eventRevision !== this.shownEventRevision) {
      this.shown = notice;
      this.shownEventRevision = this.eventRevision;
      this.panel.setVisible(Boolean(notice));
      if (notice) {
        const color = ACCENTS[notice.category];
        this.accent.setFillStyle(color);
        this.heading.setColor(`#${color.toString(16).padStart(6, '0')}`).setText(notice.heading.replace(/\n/g, ' '));
        this.message.setText((notice.message ?? '').replace(/\n/g, ' '));
        this.secondary.setText((notice.secondary ?? '').replace(/\n/g, ' '));
        for (const text of [this.heading, this.message, this.secondary]) text.setScale(Math.min(1, 556 / Math.max(1, text.width), (text === this.message ? 38 : 24) / Math.max(1, text.height)));
      }
      let count = 0;
      for (const state of this.eventStates.values()) {
        if (state === notice) continue;
        const line = this.eventLines[count++];
        line.setText(`${state.heading} // ${state.message}`).setVisible(true);
        line.setScale(Math.min(1, 556 / Math.max(1, line.width)));
      }
      for (let index = count; index < this.eventLines.length; index++) this.eventLines[index].setVisible(false);
      if (count !== this.footerCount) { this.footerCount = count; this.layout(); }
    }
    if (notice) {
      const age = this.queue.elapsedMs;
      // Never fade a live timer or paid entry prompt with an unrelated toast.
      const fade = this.eventStates.size || !this.queue.active ? 1 : Math.min(1, age / 180, (notice.durationMs! - age) / 260);
      this.panel.setAlpha(Math.max(0, fade)).setY(this.panelY + (1 - fade) * (age < 180 ? 8 : -8));
    }
    const safeWidth = this.scene.scale.height < 720 ? (this.scene.scale.width - 96) / 2 : Math.min(760, this.scene.scale.width - 48);
    for (const { text } of this.rows.values()) {
      // Countdown content can change width without rebuilding the layout or allocating a view.
      const scale = Math.min(1, safeWidth / Math.max(1, text.width));
      if (text.scaleX !== scale) text.setScale(scale);
    }
  }

  private syncCamera(): void {
    const { width, height } = this.scene.scale;
    const zoom = this.scene.cameras.main.zoom;
    this.root.setPosition(width * .5 * (1 - 1 / zoom), height * .5 * (1 - 1 / zoom)).setScale(1 / zoom);
  }

  private layout(): void {
    if (this.destroyed) return;
    const { width, height } = this.scene.scale;
    const coreHud = calculateHudLayout(width, height, this.settings);
    this.panelY = Math.max(this.topBoundary + 54, coreHud.objective.y + coreHud.objective.height + 62, height * .22);
    this.panel.setPosition(width / 2, this.panelY).setScale(Math.min(1, (width - 48) / 614));
    this.art.setScale(.5, .5 * (96 + this.footerCount * 32) / 96);
    const font = { small: 13, medium: 17, large: 24 }[this.settings.tacticalTextSize];
    for (const [key, row] of this.rows) {
      const index = Math.max(0, ROWS.indexOf(key));
      const compact = height < 720;
      const x = compact ? width * (index % 2 === 0 ? .25 : .75) : width / 2;
      const y = this.panelY + (compact ? 69 : 82) + this.footerCount * 32
        + (compact ? Math.floor(index / 2) : index) * (font + 14);
      row.text.setPosition(x, y)
        .setFontSize(font).setVisible(row.essential || this.settings.tacticalInformation);
    }
    this.syncCamera();
  }

  clear(): void {
    this.queue.clear(); this.shown = null; this.panel.setVisible(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clear();
    this.eventStates.clear();
    this.scene.scale.off('resize', this.layout, this);
    this.scene.events.off('shutdown', this.destroy, this);
    this.scene.events.off('pause', this.clear, this);
    this.scene.events.off('sleep', this.clear, this);
    if (owners.get(this.scene) === this) owners.delete(this.scene);
    this.root.destroy(true);
    this.rows.clear();
  }
}
