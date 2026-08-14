import Phaser from 'phaser';
import splashImageUrl from '../../assets/splashimage.png';
import { SPLASH_SESSION_KEY } from '../config/gameplay';
import { GAME_VERSION } from '../config/version';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys';
import { AudioManager } from '../systems/AudioManager';

interface SplashSceneData {
  replay?: boolean;
  returnScene?: SceneKeyValue;
  resumeGameplay?: boolean;
  returnToOptions?: boolean;
}

export class SplashScene extends Phaser.Scene {
  private static readonly SLOGAN = 'Arcade never died....it went N3ON!......';
  private skipped = false;
  private readonly audio = AudioManager.get();
  private splashImage: Phaser.GameObjects.Image | null = null;
  private versionText: Phaser.GameObjects.Text | null = null;
  private creatorText: Phaser.GameObjects.Text | null = null;
  private sloganText: Phaser.GameObjects.Text | null = null;
  private sloganCyanGhost: Phaser.GameObjects.Text | null = null;
  private sloganPinkGhost: Phaser.GameObjects.Text | null = null;
  private sloganNoise: Phaser.GameObjects.Graphics | null = null;
  private sloganX = 0;
  private sloganY = 0;
  private sloganVisible = false;

  constructor() {
    super(SceneKeys.Splash);
  }

  preload(): void {
    if (!this.textures.exists('n3on-splash')) {
      this.load.image('n3on-splash', splashImageUrl);
    }
  }

  create(data?: SplashSceneData): void {
    // Scene instances are reused by Phaser. A completed first-run splash leaves this
    // flag true, so every replay must explicitly reset its input gate and camera FX.
    this.skipped = false;
    this.cameras.main.resetFX();
    this.audio.startMusicLoop();

    const replay = data?.replay === true;
    const returnScene = data?.returnScene ?? SceneKeys.MainMenu;
    if (replay) this.scene.bringToTop();
    if (!replay && sessionStorage.getItem(SPLASH_SESSION_KEY) === '1') {
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
    this.versionText = this.add.text(0, 0, `Version ${GAME_VERSION}`, creditStyle).setOrigin(0, 1).setDepth(20);
    this.creatorText = this.add.text(0, 0, 'Created By RuntWerkx Gaming Division', creditStyle).setOrigin(1, 1).setDepth(20);
    this.layoutCornerText(width, height);

    const sloganStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#bafaff',
      align: 'center',
      stroke: '#02050b',
      strokeThickness: 5,
      shadow: { color: '#22ddff', blur: 12, fill: true, stroke: true }
    };
    this.sloganPinkGhost = this.add.text(0, 0, SplashScene.SLOGAN, { ...sloganStyle, color: '#ff5bd9' })
      .setOrigin(0.5).setAlpha(0).setDepth(21).setBlendMode(Phaser.BlendModes.ADD);
    this.sloganCyanGhost = this.add.text(0, 0, SplashScene.SLOGAN, { ...sloganStyle, color: '#41f3ff' })
      .setOrigin(0.5).setAlpha(0).setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
    this.sloganText = this.add.text(0, 0, SplashScene.SLOGAN, sloganStyle)
      .setOrigin(0.5).setAlpha(0).setDepth(23);
    this.sloganNoise = this.add.graphics().setDepth(24).setBlendMode(Phaser.BlendModes.ADD);
    this.layoutSlogan(width, height);
    this.tweens.add({
      targets: this.sloganText,
      alpha: 1,
      delay: 520,
      duration: 520,
      ease: 'Sine.easeOut',
      onComplete: () => { this.sloganVisible = true; }
    });

    this.time.addEvent({
      delay: 85,
      loop: true,
      callback: () => this.updateSloganNoise()
    });

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
      this.time.delayedCall(280, () => {
        if (!replay) {
          this.scene.start(SceneKeys.LocalProfiles);
          return;
        }
        if (returnScene === SceneKeys.Arena && this.scene.isPaused(SceneKeys.Arena)) {
          this.scene.resume(SceneKeys.Arena);
          if (data?.resumeGameplay === true) this.scene.get(SceneKeys.Arena).events.emit('resume-from-options');
          this.scene.stop();
          return;
        }
        if (data?.returnToOptions === true) {
          this.scene.start(SceneKeys.Options, {
            returnScene: returnScene === SceneKeys.Arena ? SceneKeys.MainMenu : returnScene,
            resumeGameplay: false
          });
          return;
        }
        this.scene.start(returnScene);
      });
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
      this.sloganText = null;
      this.sloganCyanGhost = null;
      this.sloganPinkGhost = null;
      this.sloganNoise = null;
      this.sloganVisible = false;
    });
  }

  private handleResize(size: Phaser.Structs.Size): void {
    this.layoutSplashImage(size.width, size.height);
    this.layoutCornerText(size.width, size.height);
    this.layoutSlogan(size.width, size.height);
  }

  private updateSloganNoise(): void {
    const text = this.sloganText;
    const cyanGhost = this.sloganCyanGhost;
    const pinkGhost = this.sloganPinkGhost;
    const noise = this.sloganNoise;
    if (!this.sloganVisible || !text || !cyanGhost || !pinkGhost || !noise) return;

    text.setText(SplashScene.SLOGAN).setPosition(this.sloganX, this.sloganY).setAlpha(1);
    cyanGhost.setText(SplashScene.SLOGAN).setPosition(this.sloganX, this.sloganY).setAlpha(0);
    pinkGhost.setText(SplashScene.SLOGAN).setPosition(this.sloganX, this.sloganY).setAlpha(0);
    noise.clear();

    const hardBlink = Math.random() < 0.045;
    const glitches = hardBlink || Math.random() < 0.24;
    if (!glitches) return;

    const jitterX = Phaser.Math.Between(1, 4);
    const jitterY = Phaser.Math.Between(-2, 2);
    const corrupted = this.corruptSlogan();
    text.setPosition(this.sloganX + Phaser.Math.Between(-1, 1), this.sloganY + jitterY)
      .setAlpha(hardBlink ? 0.12 : Phaser.Math.FloatBetween(0.72, 0.94));
    cyanGhost.setText(corrupted).setPosition(this.sloganX - jitterX, this.sloganY - jitterY)
      .setAlpha(hardBlink ? 0.22 : 0.38);
    pinkGhost.setText(corrupted).setPosition(this.sloganX + jitterX, this.sloganY + jitterY)
      .setAlpha(hardBlink ? 0.18 : 0.32);

    const halfWidth = Math.min(text.displayWidth / 2, this.scale.width * 0.46);
    for (let i = 0; i < Phaser.Math.Between(3, 7); i += 1) {
      noise.fillStyle(Math.random() < 0.5 ? 0x41f3ff : 0xff5bd9, Phaser.Math.FloatBetween(0.25, 0.75));
      noise.fillRect(
        this.sloganX + Phaser.Math.FloatBetween(-halfWidth, halfWidth),
        this.sloganY + Phaser.Math.FloatBetween(-text.displayHeight * 0.55, text.displayHeight * 0.55),
        Phaser.Math.Between(3, 22),
        Phaser.Math.Between(1, 2)
      );
    }
  }

  private corruptSlogan(): string {
    const characters = [...SplashScene.SLOGAN];
    const mutableIndices = characters
      .map((character, index) => /[A-Za-z0-9]/.test(character) ? index : -1)
      .filter((index) => index >= 0);
    const replacements = ['#', '/', '|', '0', '3', '?'];
    for (let i = 0; i < Phaser.Math.Between(1, 3); i += 1) {
      const index = Phaser.Utils.Array.GetRandom(mutableIndices);
      characters[index] = Phaser.Utils.Array.GetRandom(replacements);
    }
    return characters.join('');
  }

  private layoutSlogan(width: number, height: number): void {
    if (!this.splashImage || !this.sloganText || !this.sloganCyanGhost || !this.sloganPinkGhost) return;
    const texture = this.splashImage.texture.getSourceImage() as HTMLImageElement;
    const imageTop = this.splashImage.y - texture.naturalHeight * this.splashImage.scaleY * 0.5;
    const mappedPromptLeadIn = imageTop + texture.naturalHeight * this.splashImage.scaleY * 0.825;
    this.sloganX = width / 2;
    this.sloganY = Phaser.Math.Clamp(mappedPromptLeadIn, height * 0.62, height - 86);

    const fontSize = Math.round(Phaser.Math.Clamp(width / 45, 10, 25));
    const letterSpacing = Phaser.Math.Clamp(Math.round(fontSize * 0.08), 1, 2);
    for (const text of [this.sloganText, this.sloganCyanGhost, this.sloganPinkGhost]) {
      text.setFontSize(fontSize).setLetterSpacing(letterSpacing).setPosition(this.sloganX, this.sloganY);
    }
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
