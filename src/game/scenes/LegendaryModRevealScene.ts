import Phaser from 'phaser';
import { SceneKeys } from '../flow/SceneKeys.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { createModCardView, MOD_RARITY_COLORS } from '../mods/ModCardView.ts';
import {
  LEGENDARY_MOD_REVEAL_COMPLETE_EVENT,
  LEGENDARY_MOD_REVEAL_HOLD_MS,
  PREMIUM_MOD_REVEAL_ACKNOWLEDGE_EVENT,
  SUPREME_MOD_REVEAL_HOLD_MS,
  calculateModRevealCardWidth,
  type ModAcquisitionPresentation
} from '../mods/ModAcquisition.ts';
import { createButton, disableButton } from '../utils/ui.ts';

export interface LegendaryModRevealData {
  ownerSceneKey: string;
  token: string;
  request: ModAcquisitionPresentation;
}

export class LegendaryModRevealScene extends Phaser.Scene {
  private ownerSceneKey: string = SceneKeys.Arena;
  private token = '';
  private request: ModAcquisitionPresentation | null = null;
  private root: Phaser.GameObjects.Container | null = null;
  private backdrop: Phaser.GameObjects.Rectangle | null = null;
  private scanlines: Phaser.GameObjects.Graphics | null = null;
  private card: Phaser.GameObjects.Container | null = null;
  private titleObjects: Phaser.GameObjects.Text[] = [];
  private idleTweens: Phaser.Tweens.Tween[] = [];
  private continueButton: Phaser.GameObjects.Container | null = null;
  private finished = false;

  constructor() {
    super(SceneKeys.LegendaryModReveal);
  }

  create(data: LegendaryModRevealData): void {
    this.ownerSceneKey = data?.ownerSceneKey || SceneKeys.Arena;
    this.token = data?.token ?? '';
    this.request = data?.request ?? null;
    if (!this.token || !this.request) {
      this.scene.stop();
      return;
    }

    this.finished = false;
    this.input.setDefaultCursor('default');
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.scene.pause(this.ownerSceneKey);
    this.scene.bringToTop();
    this.createPresentation();
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    if (this.request.rarity === 'supreme') AudioManager.get().playSupremeModAcquired();
    else AudioManager.get().playSfx('legendaryMod');
  }

  private createPresentation(): void {
    if (!this.request) return;
    const { width, height } = this.scale;
    const cardWidth = calculateModRevealCardWidth(width, height, true);
    const cardHeight = cardWidth * 1.4;
    const cardTargetY = Math.min(28, Math.max(12, height * 0.05));
    const supreme = this.request.rarity === 'supreme';
    const rarityColor = supreme ? MOD_RARITY_COLORS.supreme : MOD_RARITY_COLORS.legendary;
    const root = this.add.container(width * 0.5, height * 0.5).setDepth(2000);
    const blocker = this.add.rectangle(0, 0, width, height, 0x020205, 0.001).setInteractive();
    const backdrop = this.add.rectangle(0, 0, width, height, 0x020205, 0);
    const vignette = this.add.rectangle(0, 0, Math.min(width * 0.78, 880), Math.min(height * 0.88, 760), supreme ? 0x061c24 : 0x130b02, 0)
      .setStrokeStyle(2, rarityColor, 0.25);
    const outerGlow = this.add.rectangle(0, cardTargetY, cardWidth + 30, cardHeight + 30, rarityColor, 0)
      .setStrokeStyle(4, rarityColor, 0.2);
    const rgbLeft = this.add.rectangle(-7, cardTargetY + 2, cardWidth + 6, cardHeight + 6, 0x000000, 0)
      .setStrokeStyle(3, 0xff315f, 0.55);
    const rgbRight = this.add.rectangle(7, cardTargetY - 2, cardWidth + 6, cardHeight + 6, 0x000000, 0)
      .setStrokeStyle(3, 0x39efff, 0.55);
    const sourceX = Phaser.Math.Clamp(this.request.sourceScreenX, 30, width - 30) - width * 0.5;
    const sourceY = Phaser.Math.Clamp(this.request.sourceScreenY, 30, height - 30) - height * 0.5;
    const card = createModCardView(this, sourceX, sourceY, this.request.card, this.request.card.upgradeLevel, {
      width: cardWidth,
      height: cardHeight,
      interactive: false,
      presentationState: supreme ? 'acquired' : 'idle'
    }).setScale(0.12).setAlpha(0.2);

    const titleY = cardTargetY - cardHeight * 0.5 - 50;
    const titleStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: `${Phaser.Math.Clamp(width * 0.042, 18, 48)}px`,
      fontStyle: 'bold',
      align: 'center',
      stroke: '#03030a',
      strokeThickness: 9,
      wordWrap: { width: width - 38, useAdvancedWrap: true }
    };
    const announcement = supreme ? 'SUPREME MOD ACQUIRED' : 'LEGENDARY MOD ACQUIRED';
    const titleRed = this.add.text(-5, titleY, announcement, { ...titleStyle, color: supreme ? '#ff6ee7' : '#ff315f' }).setOrigin(0.5).setAlpha(0);
    const titleCyan = this.add.text(5, titleY, announcement, { ...titleStyle, color: '#39efff' }).setOrigin(0.5).setAlpha(0);
    const title = this.add.text(0, titleY, announcement, { ...titleStyle, color: supreme ? '#efffff' : '#ff9b22' }).setOrigin(0.5).setAlpha(0);
    const secondaryLine = this.request.contextLine ?? (this.request.duplicate ? '+1 COPY // DUPLICATE' : '');
    const duplicate = this.add.text(0, titleY + title.height + 7, secondaryLine, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: `${Phaser.Math.Clamp(width * 0.022, 16, 22)}px`,
      fontStyle: 'bold',
      color: this.request.contextLine ? '#8fffe1' : '#ffe099',
      stroke: '#03030a',
      strokeThickness: 5
    }).setOrigin(0.5).setAlpha(0);

    const scanlines = this.add.graphics();
    this.drawScanlines(scanlines, width, height);
    const glitchBars: Phaser.GameObjects.Rectangle[] = [];
    for (let index = 0; index < 9; index += 1) {
      const barWidth = Phaser.Math.Between(Math.round(width * 0.08), Math.round(width * 0.32));
      const bar = this.add.rectangle(
        Phaser.Math.Between(-Math.round(width * 0.4), Math.round(width * 0.4)),
        Phaser.Math.Between(-Math.round(height * 0.42), Math.round(height * 0.42)),
        barWidth,
        Phaser.Math.Between(1, 4),
        index % 3 === 0 ? 0xff315f : index % 3 === 1 ? 0x39efff : rarityColor,
        0.18
      );
      glitchBars.push(bar);
    }

    root.add([blocker, backdrop, vignette, scanlines, outerGlow, rgbLeft, rgbRight, card, titleRed, titleCyan, title, duplicate, ...glitchBars]);
    if (supreme) {
      const beam = this.add.rectangle(0, cardTargetY, Math.max(80, cardWidth * .42), height * 1.25, 0xbdfcff, .09)
        .setBlendMode(Phaser.BlendModes.ADD);
      const ringA = this.add.circle(0, cardTargetY, cardWidth * .78, 0x000000, 0).setStrokeStyle(3, 0xeaffff, .58);
      const ringB = this.add.circle(0, cardTargetY, cardWidth * .98, 0x000000, 0).setStrokeStyle(2, 0xff73e5, .32);
      root.addAt(beam, 4);
      root.addAt(ringA, 5);
      root.addAt(ringB, 6);
      this.idleTweens.push(
        this.tweens.add({ targets: beam, alpha: { from: .035, to: .16 }, scaleX: { from: .7, to: 1.2 }, duration: 760, yoyo: true, repeat: -1 }),
        this.tweens.add({ targets: ringA, angle: 360, scale: { from: .8, to: 1.18 }, alpha: { from: .08, to: .62 }, duration: 1650, repeat: -1 }),
        this.tweens.add({ targets: ringB, angle: -360, scale: { from: 1.2, to: .82 }, duration: 2100, repeat: -1 })
      );
    }
    this.root = root;
    this.backdrop = backdrop;
    this.scanlines = scanlines;
    this.card = card;
    this.titleObjects = [titleRed, titleCyan, title, duplicate];

    this.tweens.add({ targets: backdrop, alpha: 0.78, duration: 260, ease: 'Quad.Out' });
    this.tweens.add({ targets: vignette, alpha: 0.34, scale: { from: 0.82, to: 1 }, duration: 650, ease: 'Cubic.Out' });
    this.tweens.add({ targets: scanlines, alpha: { from: 0.1, to: 0.42 }, duration: 120, yoyo: true, repeat: 5 });
    this.tweens.add({ targets: glitchBars, x: '+=36', alpha: { from: 0.05, to: 0.55 }, duration: 95, yoyo: true, repeat: 6 });
    this.tweens.add({ targets: [rgbLeft, rgbRight], alpha: { from: 0, to: 0.55 }, duration: 140, yoyo: true, repeat: 4 });
    this.tweens.add({
      targets: card,
      x: 0,
      y: cardTargetY,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      angle: { from: Phaser.Math.Between(-9, 9), to: 0 },
      duration: 820,
      delay: 180,
      ease: 'Expo.Out',
      onComplete: () => this.beginReadableHold(card, outerGlow, rgbLeft, rgbRight, titleRed, titleCyan, title, duplicate)
    });
    this.tweens.add({ targets: [titleRed, titleCyan, title, duplicate], alpha: 1, duration: 360, delay: 360, ease: 'Cubic.Out' });
    this.tweens.add({ targets: [titleRed, titleCyan], x: { from: -8, to: 8 }, duration: 85, delay: 340, yoyo: true, repeat: 5 });
  }

  private beginReadableHold(
    card: Phaser.GameObjects.Container,
    outerGlow: Phaser.GameObjects.Rectangle,
    rgbLeft: Phaser.GameObjects.Rectangle,
    rgbRight: Phaser.GameObjects.Rectangle,
    titleRed: Phaser.GameObjects.Text,
    titleCyan: Phaser.GameObjects.Text,
    title: Phaser.GameObjects.Text,
    duplicate: Phaser.GameObjects.Text
  ): void {
    this.tweens.killTweensOf([rgbLeft, rgbRight]);
    rgbLeft.setAlpha(0.18);
    rgbRight.setAlpha(0.18);
    titleRed.setAlpha(0.12).setX(-2);
    titleCyan.setAlpha(0.12).setX(2);
    title.setAlpha(1);
    duplicate.setAlpha(this.request?.duplicate || this.request?.contextLine ? 1 : 0);
    this.idleTweens.push(
      this.tweens.add({ targets: card, y: card.y - 6, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
      this.tweens.add({ targets: outerGlow, alpha: { from: 0.08, to: 0.34 }, scale: { from: 0.98, to: 1.05 }, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    );
    const supreme = this.request?.rarity === 'supreme';
    this.time.delayedCall(supreme ? SUPREME_MOD_REVEAL_HOLD_MS : LEGENDARY_MOD_REVEAL_HOLD_MS, () => {
      if (supreme) this.showSupremeContinue();
      else this.dismissPresentation();
    });
  }

  private showSupremeContinue(): void {
    if (this.finished || this.continueButton) return;
    this.continueButton = createButton(
      this,
      this.scale.width * 0.5,
      this.scale.height - 52,
      'CONTINUE',
      () => {
        if (this.token) this.game.events.emit(PREMIUM_MOD_REVEAL_ACKNOWLEDGE_EVENT, this.token);
        if (this.continueButton) disableButton(this.continueButton);
        this.dismissPresentation();
      },
      280,
      'menu',
      { height: 48, fontSize: 19, focusDefaultPriority: 100 }
    ).setDepth(2100).setAlpha(0);
    this.tweens.add({ targets: this.continueButton, alpha: 1, y: '-=8', duration: 260, ease: 'Back.easeOut' });
  }

  private dismissPresentation(): void {
    if (!this.root || !this.card || !this.backdrop) return;
    this.continueButton?.destroy(true);
    this.continueButton = null;
    this.idleTweens.forEach((tween) => tween.remove());
    this.idleTweens = [];
    const card = this.card;
    this.tweens.add({ targets: this.titleObjects, alpha: 0, x: '+=20', duration: 360, ease: 'Cubic.In' });
    this.tweens.add({ targets: this.scanlines, alpha: 0.68, duration: 90, yoyo: true, repeat: 2 });
    this.tweens.add({ targets: this.backdrop, alpha: 0, duration: 560, ease: 'Quad.In' });
    this.tweens.add({
      targets: card,
      alpha: 0,
      scaleX: 1.12,
      scaleY: 0.82,
      x: card.x + 38,
      duration: 560,
      ease: 'Expo.In',
      onComplete: () => this.finish()
    });
  }

  private drawScanlines(graphics: Phaser.GameObjects.Graphics, width: number, height: number): void {
    graphics.clear();
    graphics.lineStyle(1, this.request?.rarity === 'supreme' ? 0xb8ffff : 0xffa13b, 0.1);
    for (let y = -height * 0.5; y <= height * 0.5; y += 12) {
      graphics.lineBetween(-width * 0.5, y, width * 0.5, y);
    }
  }

  private readonly handleResize = (size: Phaser.Structs.Size): void => {
    this.root?.setPosition(size.width * 0.5, size.height * 0.5);
    this.backdrop?.setSize(size.width, size.height);
    if (this.root?.first instanceof Phaser.GameObjects.Rectangle) {
      this.root.first.setSize(size.width, size.height);
    }
    if (this.scanlines) this.drawScanlines(this.scanlines, size.width, size.height);
    this.continueButton?.setPosition(size.width * 0.5, size.height - 60);
  };

  private finish(): void {
    if (this.finished) return;
    this.completeOwnerHandoff();
    this.scene.stop();
  }

  private completeOwnerHandoff(): void {
    if (this.finished) return;
    this.finished = true;
    // Complete the presenter's queue and restore its physics bookkeeping before
    // the Arena is allowed to run another update frame.
    if (this.token) this.game.events.emit(LEGENDARY_MOD_REVEAL_COMPLETE_EVENT, this.token);
    if (this.scene.isPaused(this.ownerSceneKey)) this.scene.resume(this.ownerSceneKey);
  }

  private cleanup(): void {
    this.scale.off('resize', this.handleResize, this);
    this.idleTweens.forEach((tween) => tween.remove());
    this.idleTweens = [];
    this.continueButton?.destroy(true);
    this.continueButton = null;
    if (!this.finished && this.token) this.completeOwnerHandoff();
    this.root = null;
    this.backdrop = null;
    this.scanlines = null;
    this.card = null;
    this.titleObjects = [];
  }
}
