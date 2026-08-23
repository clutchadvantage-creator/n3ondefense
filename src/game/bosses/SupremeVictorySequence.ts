import Phaser from 'phaser';
import { ArenaCommandButton } from '../ui/ArenaCommandButton.ts';

export interface SupremeCreditSection { title: string; lines: readonly string[] }

/** Editable attribution source. No people are fabricated when project credits
 * are not present in repository metadata. */
export const SUPREME_CREDITS: readonly SupremeCreditSection[] = [
  { title: 'N3ONDEFENSE', lines: ['A CYBER ARCADE DEFENSE EXPERIENCE'] },
  { title: 'PROJECT', lines: ['DESIGN & DEVELOPMENT // N3ONDEFENSE PROJECT'] },
  { title: 'TECHNOLOGY', lines: ['PHASER', 'TYPESCRIPT', 'VITE'] },
  { title: 'AUDIO & MUSIC', lines: ['PROJECT AUDIO LIBRARY', 'ADDITIONAL CREDITS TO BE MAINTAINED HERE'] },
  { title: 'SPECIAL THANKS', lines: ['EVERY OPERATIVE WHO ENTERED THE ARENA'] }
] as const;

export class SupremeVictorySequence {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly tweens: Phaser.Tweens.Tween[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private readonly skipButton: ArenaCommandButton;
  private finished = false;

  constructor(scene: Phaser.Scene, private readonly onComplete: () => void) {
    const { width, height } = scene.scale;
    const veil = this.keep(scene.add.rectangle(width * .5, height * .5, width, height, 0x020712, .22).setScrollFactor(0).setDepth(1500));
    this.tweens.push(scene.tweens.add({ targets: veil, alpha: { from: .12, to: .32 }, duration: 1600, yoyo: true, repeat: -1 }));
    for (let index = 0; index < 6; index += 1) {
      const beam = this.keep(scene.add.rectangle(width * ((index + .5) / 6), height * .52, Math.max(12, width * .025), height * 1.15, index % 2 ? 0xff4fd8 : 0x4defff, .055)
        .setScrollFactor(0).setDepth(1501).setBlendMode(Phaser.BlendModes.ADD));
      this.tweens.push(scene.tweens.add({ targets: beam, alpha: { from: .025, to: .14 }, scaleX: { from: .55, to: 1.35 }, duration: 900 + index * 120, yoyo: true, repeat: -1 }));
    }
    for (let index = 0; index < 5; index += 1) {
      const wave = this.keep(scene.add.circle(width * .5, height * .48, 54, 0x000000, 0)
        .setStrokeStyle(index % 2 ? 2 : 3, index % 2 ? 0xff4fd8 : 0x4defff, .64)
        .setScrollFactor(0).setDepth(1502).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
      this.tweens.push(scene.tweens.add({
        targets: wave,
        scale: { from: .25, to: Math.max(width, height) / 80 },
        alpha: { from: .72, to: 0 },
        duration: 1700,
        delay: index * 310,
        repeat: -1,
        repeatDelay: 450
      }));
    }
    for (let index = 0; index < 72; index += 1) {
      const color = [0x4defff, 0xff4fd8, 0xffffff, 0xffd95a][index % 4];
      const fragment = this.keep(scene.add.rectangle((index * 83) % width, -20 - (index % 9) * 55, 3 + index % 5, 8 + index % 7, color, .82)
        .setScrollFactor(0).setDepth(1503).setRotation(index * .37));
      this.tweens.push(scene.tweens.add({ targets: fragment, y: height + 35, x: `+=${(index % 2 ? 1 : -1) * (35 + index % 70)}`, angle: index % 2 ? 300 : -300, duration: 4200 + (index % 11) * 240, delay: (index % 13) * 120, repeat: -1 }));
    }
    const title = this.keep(scene.add.text(width * .5, height * .16, 'SUPREME OVERDRIVE COMPLETE', { fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(width * .045, 31, 70)}px`, color: '#efffff', fontStyle: 'bold', stroke: '#06101a', strokeThickness: 10, align: 'center' }).setOrigin(.5).setScrollFactor(0).setDepth(1510));
    this.tweens.push(scene.tweens.add({ targets: title, scale: { from: .96, to: 1.035 }, alpha: { from: .78, to: 1 }, duration: 780, yoyo: true, repeat: -1 }));

    const creditsText = SUPREME_CREDITS.flatMap((section) => [section.title, ...section.lines, '']).join('\n');
    const credits = this.keep(scene.add.text(width * .5, height + 90, creditsText, { fontFamily: 'Rajdhani, sans-serif', fontSize: `${Phaser.Math.Clamp(width * .015, 17, 26)}px`, color: '#d8fbff', align: 'center', lineSpacing: 10, fontStyle: 'bold', stroke: '#02060d', strokeThickness: 5 }).setOrigin(.5, 0).setScrollFactor(0).setDepth(1510));
    this.tweens.push(scene.tweens.add({ targets: credits, y: -credits.height - 120, duration: 17_000, ease: 'Linear' }));
    this.skipButton = new ArenaCommandButton(scene, 'CONTINUE TO SUPREME DEBRIEF', () => this.finish());
    this.skipButton.setGamePosition(width * .5, height - 42, Math.min(430, width - 50), 48);
    this.timers.push(scene.time.delayedCall(18_000, () => this.finish()));
  }

  destroy(): void {
    this.timers.forEach((timer) => timer.remove(false));
    this.timers.length = 0;
    this.tweens.forEach((tween) => tween.remove());
    this.tweens.length = 0;
    this.objects.forEach((object) => object.destroy());
    this.objects.length = 0;
    this.skipButton.destroy();
  }

  private keep<T extends Phaser.GameObjects.GameObject>(object: T): T { this.objects.push(object); return object; }
  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.onComplete();
  }
}
