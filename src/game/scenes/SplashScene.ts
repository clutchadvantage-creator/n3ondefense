import Phaser from 'phaser';
import splashImageUrl from '../../assets/splashimage.png';
import { SPLASH_SESSION_KEY } from '../config/gameplay';
import { SceneKeys } from '../flow/SceneKeys';
import { AudioManager } from '../systems/AudioManager';

export class SplashScene extends Phaser.Scene {
  private skipped = false;
  private readonly audio = AudioManager.get();
  private splashImage: Phaser.GameObjects.Image | null = null;
  private versionText: Phaser.GameObjects.Text | null = null;
  private creatorText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(SceneKeys.Splash);
  }

  preload(): void {
    if (!this.textures.exists('n3on-splash')) {
      this.load.image('n3on-splash', splashImageUrl);
    }
  }

  create(): void {
    this.audio.startMusicLoop();

    if (sessionStorage.getItem(SPLASH_SESSION_KEY) === '1') {
      this.scene.start(SceneKeys.LocalProfiles);
      return;
    }

    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x04070d, 1);
    this.splashImage = this.add.image(width / 2, height / 2, 'n3on-splash').setAlpha(0);
    this.layoutSplashImage(width, height);
    this.tweens.add({
      targets: this.splashImage,
      alpha: 1,
      scaleX: this.splashImage.scaleX * 1.012,
      scaleY: this.splashImage.scaleY * 1.012,
      duration: 1200,
      ease: 'Sine.easeOut'
    });

    this.add.rectangle(width / 2, height / 2, width, height, 0x02050b, 0.08);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x55dff4, 0.1);
    for (let x = 0; x < width; x += 42) grid.lineBetween(x, 0, x, height);
    for (let y = 0; y < height; y += 42) grid.lineBetween(0, y, width, y);

    const scan = this.add.rectangle(width / 2, 0, width, 8, 0x82e9ff, 0.25).setAlpha(0.55);
    this.tweens.add({ targets: scan, y: height + 20, duration: 1700, repeat: -1, ease: 'Linear' });

    const creditStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '18px',
      color: '#c9f8ff',
      stroke: '#02050b',
      strokeThickness: 4,
      shadow: { color: '#29dfff', blur: 8, fill: true }
    };
    this.versionText = this.add.text(0, 0, 'Version 0.0.1', creditStyle).setOrigin(0, 1).setDepth(20);
    this.creatorText = this.add.text(0, 0, 'Created By RuntWerkx Gaming Division', creditStyle).setOrigin(1, 1).setDepth(20);
    this.layoutCornerText(width, height);

    this.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => {
        if (Math.random() < 0.18) {
          const spark = this.add.rectangle(
            Phaser.Math.Between(90, width - 90),
            Phaser.Math.Between(80, height - 80),
            Phaser.Math.Between(2, 4),
            Phaser.Math.Between(10, 26),
            Math.random() < 0.5 ? 0x5cefff : 0xff79df,
            0.9
          );
          this.tweens.add({ targets: spark, alpha: 0, angle: Phaser.Math.Between(-50, 50), duration: 280, onComplete: () => spark.destroy() });
        }
        if (Math.random() < 0.08) {
          this.splashImage?.setAlpha(0.78);
          this.time.delayedCall(55, () => this.splashImage?.setAlpha(1));
        }
      }
    });

    const skip = (): void => {
      if (this.skipped) return;
      this.skipped = true;
      sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.time.delayedCall(280, () => this.scene.start(SceneKeys.LocalProfiles));
    };

    this.input.keyboard?.once('keydown', skip);
    this.input.once('pointerdown', (_pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (currentlyOver.length === 0) skip();
    });
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
      this.splashImage = null;
      this.versionText = null;
      this.creatorText = null;
    });
  }

  private handleResize(size: Phaser.Structs.Size): void {
    this.layoutSplashImage(size.width, size.height);
    this.layoutCornerText(size.width, size.height);
  }

  private layoutCornerText(width: number, height: number): void {
    const margin = Phaser.Math.Clamp(width * 0.018, 16, 34);
    const bottom = height - Phaser.Math.Clamp(height * 0.022, 14, 26);
    this.versionText?.setPosition(margin, bottom);
    this.creatorText?.setPosition(width - margin, bottom);
  }

  private layoutSplashImage(width: number, height: number): void {
    if (!this.splashImage) return;
    const texture = this.splashImage.texture.getSourceImage() as HTMLImageElement;
    const coverScale = Math.max(width / texture.naturalWidth, height / texture.naturalHeight);
    this.splashImage.setPosition(width / 2, height / 2).setScale(coverScale);
  }
}
