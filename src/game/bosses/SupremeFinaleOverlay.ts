import Phaser from 'phaser';
import { ArenaCommandButton } from '../ui/ArenaCommandButton.ts';

export class SupremeFinaleOverlay {
  private readonly root: Phaser.GameObjects.Container;
  private readonly ready: ArenaCommandButton;

  constructor(scene: Phaser.Scene, onReady: () => void) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(1900);
    const blocker = scene.add.rectangle(width * .5, height * .5, width, height, 0x01050b, .84).setInteractive();
    const ring = scene.add.circle(width * .5, height * .43, Math.min(width, height) * .22, 0x000000, 0).setStrokeStyle(4, 0xe8ffff, .5);
    const title = scene.add.text(width * .5, height * .28, 'FINAL OVERRIDE DETECTED', { fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(width * .04, 30, 64)}px`, color: '#ffffff', fontStyle: 'bold', stroke: '#05101a', strokeThickness: 9 }).setOrigin(.5);
    const subtitle = scene.add.text(width * .5, height * .39, 'SUPREME PROTOCOL // TERMINAL ENGAGEMENT\nTHREE HOSTILE COMMAND SIGNATURES', { fontFamily: 'Rajdhani, sans-serif', fontSize: `${Phaser.Math.Clamp(width * .019, 17, 30)}px`, color: '#8ffaff', align: 'center', fontStyle: 'bold', lineSpacing: 8 }).setOrigin(.5);
    this.root.add([blocker, ring, title, subtitle]);
    scene.tweens.add({ targets: ring, scale: { from: .82, to: 1.12 }, alpha: { from: .25, to: .8 }, angle: 180, duration: 1200, yoyo: true, repeat: -1 });
    this.ready = new ArenaCommandButton(scene, 'ENGAGE TERMINAL', onReady);
    this.ready.setGamePosition(width * .5, height * .68, Math.min(390, width - 60), 58);
  }

  destroy(): void { this.ready.destroy(); this.root.destroy(true); }
}
