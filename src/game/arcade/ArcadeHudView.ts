import Phaser from 'phaser';

const FONT = 'Orbitron, sans-serif';

export class ArcadeHudView {
  private readonly objectiveRoot: Phaser.GameObjects.Container;
  private readonly objectivePanel: Phaser.GameObjects.Rectangle;
  private readonly objectiveText: Phaser.GameObjects.Text;
  private announcementRoot: Phaser.GameObjects.Container | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.objectivePanel = scene.add.rectangle(0, 0, 410, 38, 0x040912, 0.9)
      .setStrokeStyle(2, 0xffd65a, 0.95);
    const edge = scene.add.rectangle(-202, 0, 4, 27, 0xff49cb, 0.92);
    this.objectiveText = scene.add.text(0, 0, '', {
      fontFamily: FONT,
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#fff2a8',
      stroke: '#02050b',
      strokeThickness: 4
    }).setOrigin(0.5);
    this.objectiveRoot = scene.add.container(scene.scale.width * 0.5, 132, [this.objectivePanel, edge, this.objectiveText])
      .setScrollFactor(0)
      .setDepth(3600)
      .setVisible(false);
  }

  showObjective(text: string): void {
    this.objectiveText.setText(text);
    this.objectiveRoot.setVisible(true);
  }

  hideObjective(): void {
    this.objectiveRoot.setVisible(false);
  }

  announce(title: string, subtitle: string, color = 0xffd65a): void {
    this.destroyAnnouncement();
    const width = Math.min(610, this.scene.scale.width - 48);
    const panel = this.scene.add.rectangle(0, 0, width, 92, 0x020711, 0.91)
      .setStrokeStyle(2, color, 0.98);
    const top = this.scene.add.rectangle(0, -44, width * 0.7, 3, 0x55f8ff, 0.9);
    const system = this.scene.add.text(0, -26, 'N3ON ARCADE', {
      fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#52f7ff',
      stroke: '#02050b', strokeThickness: 4
    }).setOrigin(0.5);
    const heading = this.scene.add.text(0, 1, title, {
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      stroke: '#02050b', strokeThickness: 5
    }).setOrigin(0.5);
    const detail = this.scene.add.text(0, 28, subtitle, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#e7fbff',
      stroke: '#02050b', strokeThickness: 3
    }).setOrigin(0.5);
    const root = this.scene.add.container(this.scene.scale.width * 0.5, Math.max(188, this.scene.scale.height * 0.22), [panel, top, system, heading, detail])
      .setScrollFactor(0).setDepth(3650).setAlpha(0).setScale(0.86);
    this.announcementRoot = root;
    this.scene.tweens.add({
      targets: root,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 190,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!root.active) return;
        this.scene.tweens.add({
          targets: root,
          alpha: 0,
          y: root.y - 18,
          delay: 1450,
          duration: 360,
          onComplete: () => {
            if (this.announcementRoot === root) this.announcementRoot = null;
            root.destroy(true);
          }
        });
      }
    });
  }

  resize(width: number, height: number): void {
    this.objectiveRoot.setPosition(width * 0.5, 132);
    this.announcementRoot?.setPosition(width * 0.5, Math.max(188, height * 0.22));
  }

  destroy(): void {
    this.destroyAnnouncement();
    this.objectiveRoot.destroy(true);
  }

  private destroyAnnouncement(): void {
    if (!this.announcementRoot) return;
    this.scene.tweens.killTweensOf(this.announcementRoot);
    this.announcementRoot.destroy(true);
    this.announcementRoot = null;
  }
}
