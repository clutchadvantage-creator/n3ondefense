import type Phaser from 'phaser';
import { HudInformationSystem } from '../ui/HudInformationSystem.ts';

/** One live event slot in the shared panel; no separate anomaly HUD. */
export class AnomalyHudView {
  private readonly information: HudInformationSystem;
  constructor(scene: Phaser.Scene) {
    this.information = HudInformationSystem.forScene(scene);
  }
  show(title: string, detail: string, color = 0xff5bd8, durationMs = 0): void {
    if (durationMs > 0) {
      const key = `anomaly:notice:${title}`;
      if (this.information.queue.active?.key === key) return;
      this.information.queue.cancelPrefix('anomaly:notice:');
      const [message, ...secondary] = detail.split('\n');
      this.information.notify({ category: color === 0xff5f7c ? 'failure' : 'anomaly', heading: title,
        message, secondary: secondary.join(' // '), durationMs, key, priority: color === 0xff5f7c ? 4 : 2 });
      return;
    }
    this.information.setEventState('anomaly', title, detail, 'anomaly');
  }
  update(_now: number): void {}
  resize(_width: number): void {}
  hide(): void { this.information.removeEventState('anomaly'); }
  destroy(): void { this.hide(); }
}
