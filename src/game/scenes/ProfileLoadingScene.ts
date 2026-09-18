import Phaser from 'phaser';
import { SceneKeys } from '../flow/SceneKeys';
import { drawProfileEnemyArtwork } from '../enemies/EnemyArtTextures';
import { bakeStaticGraphics } from '../rendering/bakeStaticGraphics';

const STAGES = [
  { end: 400, progress: .20, label: 'INITIALIZING SYSTEMS' },
  { end: 1000, progress: .55, label: 'LOADING OPERATIVE DATABASE' },
  { end: 1600, progress: .85, label: 'SYNCING PROFILE DATA' },
  { end: 2000, progress: 1, label: 'SYSTEM READY' }
] as const;

/** Presentation only. Combat deployment keeps its existing Loading scene. */
export class ProfileLoadingScene extends Phaser.Scene {
  private portrait!: Phaser.GameObjects.RenderTexture;
  private bar!: Phaser.GameObjects.Rectangle;
  private track!: Phaser.GameObjects.Rectangle;
  private status!: Phaser.GameObjects.Text;
  private percentage!: Phaser.GameObjects.Text;
  private elapsed = 0;
  private progress = 0;
  private finished = false;
  private barWidth = 400;

  constructor() { super(SceneKeys.ProfileLoading); }

  create(): void {
    this.elapsed = 0;
    this.progress = 0;
    this.finished = false;
    this.cameras.main.setBackgroundColor(0x04070d);
    const source = this.make.graphics({}, false);
    drawProfileEnemyArtwork(source);
    this.portrait = bakeStaticGraphics(this, source, { x: 0, y: 0, w: 576, h: 576 });
    this.add.existing(this.portrait);
    this.portrait.setOrigin(.5).setAlpha(0).setName('profile-loading-enemy');
    this.track = this.add.rectangle(0, 0, 400, 5, 0x182935).setOrigin(0, .5);
    this.bar = this.add.rectangle(0, 0, 400, 3, 0x63e7ee).setOrigin(0, .5).setName('profile-loading-progress');
    const style = { fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#9ebbc9' };
    this.status = this.add.text(0, 0, STAGES[0].label, style).setOrigin(0, 1);
    this.percentage = this.add.text(0, 0, '0%', style).setOrigin(1, 1);
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    this.elapsed = Math.min(2000, this.elapsed + delta);
    const index = STAGES.findIndex(stage => this.elapsed <= stage.end);
    const stage = STAGES[index];
    const previous = index > 0 ? STAGES[index - 1] : { end: 0, progress: 0 };
    this.progress = previous.progress + (stage.progress - previous.progress)
      * (this.elapsed - previous.end) / (stage.end - previous.end);
    if (this.status.text !== stage.label) this.status.setText(stage.label);
    const label = `${Math.round(this.progress * 100)}%`;
    if (this.percentage.text !== label) this.percentage.setText(label);
    this.bar.displayWidth = this.barWidth * this.progress;
    this.portrait.setAlpha(Math.min(1, this.elapsed / 220, (2140 - this.elapsed) / 280));
    if (this.elapsed >= 2000) {
      this.finished = true;
      // Profile creates its DOM synchronously in this handoff; no early hidden UI.
      this.scene.start(SceneKeys.LocalProfiles);
    }
  }

  private layout(): void {
    const { width, height } = this.scale;
    const size = Math.min(620, height * .65, width * .76);
    this.portrait.setPosition(width / 2, height * .43).setDisplaySize(size, size);
    this.barWidth = Math.min(440, width - 80);
    const left = (width - this.barWidth) / 2, y = height * .84;
    this.track.setPosition(left, y).setDisplaySize(this.barWidth, 5);
    this.bar.setPosition(left, y).setDisplaySize(this.barWidth * this.progress, 3);
    this.status.setPosition(left, y - 14);
    this.percentage.setPosition(left + this.barWidth, y - 14);
  }
}
