import Phaser from 'phaser';
import { BOSS_ARCHETYPES, type BossArchetype } from '../config/bossBalance.ts';
import { createButton } from '../utils/ui.ts';

/** UI-clock boss gate. The Arena simulation remains paused behind this view. */
export class BossIntroOverlay {
  private readonly root: Phaser.GameObjects.Container;
  private readonly veil: Phaser.GameObjects.Rectangle;
  private readonly scanlines: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly bossImage: Phaser.GameObjects.Image;
  private readonly ghostA: Phaser.GameObjects.Image;
  private readonly ghostB: Phaser.GameObjects.Image;
  private readonly ready: Phaser.GameObjects.Container;
  private readonly tweens: Phaser.Tweens.Tween[] = [];
  private accepted = false;

  constructor(scene: Phaser.Scene, archetype: BossArchetype, onReady: () => void) {
    const definition = BOSS_ARCHETYPES[archetype];
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(3600);
    this.veil = scene.add.rectangle(0, 0, 1, 1, 0x01040a, 0.88).setOrigin(0);
    this.scanlines = scene.add.graphics().setAlpha(0.2);
    this.frame = scene.add.graphics();
    const heading = scene.add.text(0, -205, 'HOSTILE SIGNATURE DETECTED', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '25px', fontStyle: 'bold', color: '#ff718c',
      stroke: '#020611', strokeThickness: 6
    }).setOrigin(0.5);
    const title = scene.add.text(0, -161, definition.label, {
      fontFamily: 'Orbitron, sans-serif', fontSize: '42px', fontStyle: 'bold', color: '#ffffff',
      stroke: Phaser.Display.Color.IntegerToColor(definition.color).rgba, strokeThickness: 3
    }).setOrigin(0.5);
    const subtitle = scene.add.text(0, -111, definition.subtitle, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '21px', fontStyle: 'bold', color: '#bcefff'
    }).setOrigin(0.5);
    this.ghostA = scene.add.image(-4, 5, definition.texture).setDisplaySize(178, 178).setTint(0xff2f9d).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD);
    this.ghostB = scene.add.image(4, 5, definition.texture).setDisplaySize(178, 178).setTint(0x39eaff).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD);
    this.bossImage = scene.add.image(0, 5, definition.texture).setDisplaySize(170, 170).setTint(definition.color);
    const directive = scene.add.text(0, 115, 'COMBAT SYSTEMS HELD // CONFIRM WHEN READY', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#82d7e7'
    }).setOrigin(0.5);
    this.ready = createButton(scene, 0, 170, 'READY // ENGAGE', () => {
      if (this.accepted) return false;
      this.accepted = true;
      this.ready.disableInteractive();
      onReady();
      return true;
    }, 280, 'menu', { height: 48, fontSize: 18 });
    this.root.add([this.veil, this.scanlines, this.frame, this.ghostA, this.ghostB, this.bossImage, heading, title, subtitle, directive, this.ready]);
    this.tweens.push(scene.tweens.add({ targets: [this.ghostA, this.ghostB], x: '+=6', duration: 90, yoyo: true, repeat: -1 }));
    this.tweens.push(scene.tweens.add({ targets: this.bossImage, scaleX: 1.045, scaleY: 1.045, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    this.resize(scene.scale.width, scene.scale.height);
  }

  resize(width: number, height: number): void {
    const scale = Phaser.Math.Clamp(Math.min(width / 1100, height / 760), 0.72, 1.18);
    this.root.setPosition(width * 0.5, height * 0.5).setScale(scale);
    this.veil.setPosition(-width / scale * 0.5, -height / scale * 0.5).setDisplaySize(width / scale, height / scale);
    this.frame.clear().fillStyle(0x071522, 0.96).lineStyle(2, 0x59efff, 0.85)
      .fillRoundedRect(-360, -242, 720, 470, 12).strokeRoundedRect(-360, -242, 720, 470, 12)
      .lineStyle(2, 0xff4ba8, 0.7).lineBetween(-330, -222, 330, -222).lineBetween(-250, 215, 250, 215);
    this.scanlines.clear().lineStyle(1, 0x7defff, 0.2);
    for (let y = -214; y <= 205; y += 8) this.scanlines.lineBetween(-340, y, 340, y);
  }

  destroy(): void {
    for (const tween of this.tweens) tween.remove();
    this.tweens.length = 0;
    this.root.destroy(true);
  }
}
