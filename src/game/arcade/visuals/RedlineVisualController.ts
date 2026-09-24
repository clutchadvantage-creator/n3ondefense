import { HudInformationSystem } from '../../ui/HudInformationSystem.ts';
import Phaser from 'phaser';
import { type RedlineMomentum, type RedlineResult } from '../events/RedlineMomentum.ts';
/** Redline keeps its edge treatment; all event readouts use the shared information panel. */
export class RedlineVisualController {
  private readonly root: Phaser.GameObjects.Container;
  private readonly rails: Phaser.GameObjects.Rectangle[];
  private resultShown = false;
  constructor(private readonly scene: Phaser.Scene) {
    this.rails = [0, 1, 2, 3].map(() => scene.add.rectangle(0, 0, 3, 100, 0xff4563, 1).setBlendMode(Phaser.BlendModes.ADD));
    this.root = scene.add.container(0, 0, this.rails).setScrollFactor(0).setDepth(3605).setName('redline-rails');
  }
  announce(text: string, _now: number): void {
    if (text === 'REDLINE TERMINATED') HudInformationSystem.forScene(this.scene).queue.cancelPrefix('redline:');
    HudInformationSystem.forScene(this.scene).notify({ category: 'redline', heading: 'REDLINE', message: text,
      key: 'redline:' + text, priority: text.startsWith('CRITICAL') ? 3 : 0, durationMs: 2200 });
  }
  update(now: number, model: RedlineMomentum, _remainingMs: number, terminalMs = -1, result?: RedlineResult): void {
    HudInformationSystem.forScene(this.scene).setRedlineRpm(terminalMs >= 0 ? 0 : model.rpm);
    const { width: w, height: h } = this.scene.scale;
    const camera = this.scene.cameras.main, zoom = camera.zoom;
    this.root.setPosition(w * .5 * (1 - 1 / zoom), h * .5 * (1 - 1 / zoom)).setScale(1 / zoom);
    this.rails[0].setPosition(5, h * .5).setSize(3, h * .66);
    this.rails[1].setPosition(w - 5, h * .5).setSize(3, h * .66);
    this.rails[2].setPosition(w * .5, 5).setSize(w * .7, 3);
    this.rails[3].setPosition(w * .5, h - 5).setSize(w * .7, 3);
    const intensity = terminalMs >= 0 ? 0 : (.04 + model.stage * .09) * (.7 + .3 * Math.sin(now * (.004 + model.stage * .002)));
    for (const rail of this.rails)
      rail.setAlpha(intensity);
    if (result && terminalMs >= 500 && !this.resultShown) {
      this.resultShown = true;
      HudInformationSystem.forScene(this.scene).queue.cancelPrefix('redline:');
      HudInformationSystem.forScene(this.scene).notify({ category: 'redline', heading: 'REDLINE COMPLETE / RANK ' + result.rank,
        message: 'SCORE ' + result.score.toLocaleString() + ' / PEAK ' + result.peakRpm + '% / CHAIN ' + result.longestChain + ' / TARGETS ' + result.targetKills,
        secondary: 'REDLINE ' + (result.redlineMs / 1000).toFixed(1) + 's / CRITICAL ' + (result.criticalMs / 1000).toFixed(1) + 's',
        priority: 3, durationMs: 3300, key: 'redline-result' });
    }
  }
  destroy(): void { this.root.destroy(true); }
}
