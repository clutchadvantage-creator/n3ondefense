import type Phaser from 'phaser';
import { HudInformationSystem } from '../ui/HudInformationSystem.ts';

/** Event announcements and live objectives share the same panel. */
export class ArcadeHudView {
  private readonly information: HudInformationSystem;
  private nextObjectiveAt = 0;
  constructor(private readonly scene: Phaser.Scene) { this.information = HudInformationSystem.forScene(scene); }
  showObjective(text: string): void {
    if (this.scene.time.now < this.nextObjectiveAt) return;
    this.nextObjectiveAt = this.scene.time.now + 100;
    const parts = text.split(' // ');
    this.information.setEventState('arcade', parts.shift() ?? 'N3ON ARCADE', parts.join(' // '), text.startsWith('REDLINE') ? 'redline' : 'arcade');
  }
  hideObjective(): void { this.information.removeEventState('arcade'); this.nextObjectiveAt = 0; }
  announce(title: string, subtitle: string, color = 0xffd65a): void {
    this.information.notify({ category: color === 0xff5d8f ? 'failure' : color === 0x7dffb2 ? 'success' : title.toUpperCase().includes('REDLINE') ? 'redline' : 'arcade',
      heading: title, message: subtitle, priority: color === 0xffd65a ? 1 : 2 });
  }
  resize(_width: number, _height: number): void {}
  destroy(): void { this.hideObjective(); }
}
