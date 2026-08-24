import Phaser from 'phaser';

const FONT = 'Rajdhani, sans-serif';

export class AnomalyHudView {
  private readonly panel: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly accent: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;
  private hideAt = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.background = scene.add.rectangle(0, 0, 470, 82, 0x06121d, 0.92)
      .setStrokeStyle(2, 0xff4fd8, 0.95);
    this.accent = scene.add.rectangle(-234, 0, 5, 76, 0x52f7ff, 0.95);
    this.title = scene.add.text(-215, -28, '', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '20px', color: '#ff67de', fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    this.detail = scene.add.text(-215, 7, '', {
      fontFamily: FONT, fontSize: '17px', color: '#c7f7ff', lineSpacing: 3, wordWrap: { width: 420 }
    }).setOrigin(0, 0.5);
    this.panel = scene.add.container(scene.scale.width * 0.5, 72, [this.background, this.accent, this.title, this.detail])
      .setScrollFactor(0).setDepth(12_800).setAlpha(0).setVisible(false);
  }

  show(title: string, detail: string, color = 0xff4fd8, durationMs = 0): void {
    const unchanged = this.panel.visible && this.title.text === title && this.detail.text === detail;
    this.title.setText(title).setColor(`#${color.toString(16).padStart(6, '0')}`);
    this.detail.setText(detail);
    this.background.setStrokeStyle(2, color, 0.95);
    this.hideAt = durationMs > 0 ? this.scene.time.now + durationMs : 0;
    if (unchanged) return;
    this.panel.setVisible(true);
    this.scene.tweens.killTweensOf(this.panel);
    this.scene.tweens.add({ targets: this.panel, alpha: 1, y: 86, duration: 180, ease: 'Quad.Out' });
  }

  update(now: number): void {
    if (this.hideAt > 0 && now >= this.hideAt) this.hide();
  }

  hide(): void {
    this.hideAt = 0;
    this.scene.tweens.killTweensOf(this.panel);
    this.scene.tweens.add({
      targets: this.panel, alpha: 0, y: 66, duration: 150,
      onComplete: () => this.panel.setVisible(false)
    });
  }

  resize(width: number): void { this.panel.setX(width * 0.5); }
  destroy(): void { this.panel.destroy(true); }
}
