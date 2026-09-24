import Phaser from 'phaser';
import { normalizeHudSettings, type HudSettings } from '../config/interfaceSettings.ts';
import { HudNotificationQueue, type HudNotification, type HudNotificationCategory } from './HudNotificationQueue.ts';
import { MechanicalNotificationView } from './MechanicalNotificationView.ts';

const owners = new WeakMap<Phaser.Scene, HudInformationSystem>();
/** Existing encounter owner and producer API; exactly one mechanical display. */
export class HudInformationSystem {
  static forScene(scene: Phaser.Scene): HudInformationSystem {
    return owners.get(scene) ?? new HudInformationSystem(scene);
  }
  readonly queue = new HudNotificationQueue();
  readonly view: MechanicalNotificationView;
  private readonly rows = new Map<string, { text: Phaser.GameObjects.Text; essential: boolean }>();
  private settings = normalizeHudSettings(undefined);
  private destroyed = false;
  private constructor(private readonly scene: Phaser.Scene) {
    owners.set(scene, this);
    this.view = new MechanicalNotificationView(scene);
    scene.scale.on('resize', this.layout, this);
    scene.events.once('shutdown', this.destroy, this);
    scene.events.on('pause', this.clear, this);
    scene.events.on('sleep', this.clear, this);
    this.layout();
  }
  notify(notice: HudNotification): void { if (!this.destroyed) this.queue.submit(notice); }
  setCommunication(message: string | null, mode = 'GUIDANCE', speaking = false): void {
    if (this.destroyed) return;
    if (!message) this.queue.removeLive('lyra');
    else this.queue.setLive('lyra', { category: 'system', heading: `LYRA // ${mode}`, message,
      secondary: speaking ? 'TRANSMITTING' : 'TACTICAL SYSTEMS INTELLIGENCE', priority: 60, animation: 'console' });
  }
  setEventState(key: 'arcade' | 'anomaly', heading: string, message: string, category: HudNotificationCategory = 'arcade'): void {
    if (this.destroyed) return;
    this.queue.setLive(key, { heading, message, category, priority: 10 });
  }
  setRedlineRpm(rpm: number): void {
    const live = this.queue.live.get('arcade');
    if (live && live.category === 'redline') live.rpm = Phaser.Math.Clamp(rpm, 0, 100);
    if (this.queue.active?.category === 'redline') this.queue.active.rpm = Phaser.Math.Clamp(rpm, 0, 100);
  }
  setDisarm(site: string | null, progress = 0, count = 1): void {
    if (this.destroyed) return;
    if (!site) this.queue.removeLive('bomb-disarm');
    else this.queue.setLive('bomb-disarm', { category: 'failure', heading: 'BOMBSITE DISARM IN PROGRESS',
      message: `SITE ${site} // INTERRUPT DEFUSERS`, secondary: count > 1 ? `${count} SITES UNDER DISARM` : 'DEFEND THE PLANTED CHARGE',
      animation: 'disarm', progress: Number.isFinite(progress) ? Phaser.Math.Clamp(progress, 0, 1) : 0, priority: 100 });
  }
  removeEventState(key: string): void { this.queue.removeLive(key); }
  /** Retain the hazard producers' Text contract as a hidden state source. It is
   * never added to the display list; all visible text belongs to the one screen. */
  createTacticalText(key: string, color: string, essential = false): Phaser.GameObjects.Text {
    this.rows.get(key)?.text.destroy();
    const text = this.scene.make.text({ x: 0, y: 0, text: '', style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color } }, false)
      .setAlpha(0).setName(`tactical-${key}`);
    this.rows.set(key, { text, essential });
    text.once('destroy', () => {
      if (this.rows.get(key)?.text === text) this.rows.delete(key);
      this.queue.removeLive(`hazard:${key}`);
    });
    return text;
  }
  setEssential(key: string, essential: boolean): void { const row = this.rows.get(key); if (row) row.essential = essential; }
  applySettings(settings: HudSettings): void { this.settings = normalizeHudSettings(settings); this.layout(); }
  setTopBoundary(_bottom: number): void { /* The deck now supplies the physical anchor. */ }
  update(deltaMs: number, suspended = false): void {
    if (this.destroyed) return;
    if (!suspended) {
      for (const [key, row] of this.rows) {
        if (row.text.alpha > 0 && row.text.text && (row.essential || this.settings.tacticalInformation))
          this.queue.setLive(`hazard:${key}`, { category: 'system', heading: key === 'flux' ? 'FLUX RECOVERY' : 'SECURITY HAZARD',
            message: row.text.text, animation: 'hazard', priority: 10 });
        else this.queue.removeLive(`hazard:${key}`);
      }
      this.queue.update(deltaMs);
    }
    this.view.update(this.queue, deltaMs, suspended);
  }
  private layout(): void { if (!this.destroyed) this.view.layout(this.settings); }
  clear(): void {
    this.queue.clear(); this.view.clear();
    for (const row of this.rows.values()) row.text.setAlpha(0);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.clear(); this.destroyed = true;
    this.scene.scale.off('resize', this.layout, this);
    this.scene.events.off('shutdown', this.destroy, this);
    this.scene.events.off('pause', this.clear, this);
    this.scene.events.off('sleep', this.clear, this);
    if (owners.get(this.scene) === this) owners.delete(this.scene);
    this.view.destroy();
    for (const row of [...this.rows.values()]) row.text.destroy();
    this.rows.clear();
  }
}
