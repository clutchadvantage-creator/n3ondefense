import Phaser from 'phaser';
import { AudioManager } from '../systems/AudioManager.ts';
import { SceneKeys } from '../flow/SceneKeys.ts';
import { createModCardView, MOD_RARITY_COLORS } from './ModCardView.ts';
import {
  LEGENDARY_MOD_REVEAL_COMPLETE_EVENT,
  NORMAL_MOD_REVEAL_HOLD_MS,
  calculateModRevealCardWidth,
  enqueueModAcquisition,
  type ModAcquisitionPresentation
} from './ModAcquisition.ts';

export interface ModAcquisitionPresenterHooks {
  onLegendaryStart: () => void;
  onLegendaryComplete: () => void;
}

export class ModAcquisitionPresenter {
  private readonly queue: ModAcquisitionPresentation[] = [];
  private readonly idleCallbacks = new Set<() => void>();
  private active: ModAcquisitionPresentation | null = null;
  private activeRoot: Phaser.GameObjects.Container | null = null;
  private activeBackdrop: Phaser.GameObjects.Rectangle | null = null;
  private holdTimer: Phaser.Time.TimerEvent | null = null;
  private legendaryToken = '';
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: ModAcquisitionPresenterHooks
  ) {
    this.scene.game.events.on(LEGENDARY_MOD_REVEAL_COMPLETE_EVENT, this.handleLegendaryComplete, this);
  }

  enqueue(request: ModAcquisitionPresentation): void {
    if (this.destroyed) return;
    enqueueModAcquisition(this.queue, {
      ...request,
      card: { ...request.card }
    });
    this.presentNext();
  }

  isBusy(): boolean {
    return this.active !== null || this.queue.length > 0;
  }

  whenIdle(callback: () => void): void {
    if (!this.isBusy()) {
      callback();
      return;
    }
    this.idleCallbacks.add(callback);
  }

  resize(width: number, height: number): void {
    this.activeRoot?.setPosition(width * 0.5, height * 0.5);
    this.activeBackdrop?.setSize(width, height);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.queue.length = 0;
    this.idleCallbacks.clear();
    this.holdTimer?.remove(false);
    this.holdTimer = null;
    this.scene.game.events.off(LEGENDARY_MOD_REVEAL_COMPLETE_EVENT, this.handleLegendaryComplete, this);
    if (this.activeRoot) {
      this.scene.tweens.killTweensOf(this.activeRoot.list);
      this.activeRoot.destroy(true);
    }
    this.activeRoot = null;
    this.activeBackdrop = null;
    if (this.scene.scene.isActive(SceneKeys.LegendaryModReveal)) {
      this.scene.scene.stop(SceneKeys.LegendaryModReveal);
    }
    this.active = null;
  }

  private presentNext(): void {
    if (this.destroyed || this.active) return;
    const request = this.queue.shift();
    if (!request) {
      this.flushIdleCallbacks();
      return;
    }
    this.active = request;
    if (request.rarity === 'legendary') this.presentLegendary(request);
    else this.presentStandard(request);
  }

  private presentStandard(request: ModAcquisitionPresentation): void {
    const { width, height } = this.scene.scale;
    const cardWidth = calculateModRevealCardWidth(width, height, false);
    const cardHeight = cardWidth * 1.4;
    const targetY = Math.min(22, Math.max(8, height * 0.04));
    const root = this.scene.add.container(width * 0.5, height * 0.5)
      .setScrollFactor(0)
      .setDepth(1160);
    const backdrop = this.scene.add.rectangle(0, 0, width, height, 0x02050a, 0)
      .setScrollFactor(0);
    const halo = this.scene.add.circle(0, targetY, cardWidth * 0.72, MOD_RARITY_COLORS[request.rarity], 0)
      .setStrokeStyle(2, MOD_RARITY_COLORS[request.rarity], 0.28);
    const startX = Phaser.Math.Clamp(request.sourceScreenX, 32, width - 32) - width * 0.5;
    const startY = Phaser.Math.Clamp(request.sourceScreenY, 32, height - 32) - height * 0.5;
    const card = createModCardView(this.scene, startX, startY, request.card, request.card.upgradeLevel, {
      width: cardWidth,
      height: cardHeight,
      interactive: false
    }).setScale(0.26).setAlpha(0.25);
    const titleY = targetY - cardHeight * 0.5 - 42;
    const title = this.scene.add.text(0, titleY - 14, 'MOD ACQUIRED!', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: `${Phaser.Math.Clamp(width * 0.034, 23, 38)}px`,
      fontStyle: 'bold',
      color: '#6ff6ff',
      stroke: '#020711',
      strokeThickness: 7,
      align: 'center'
    }).setOrigin(0.5).setAlpha(0).setScale(0.86);
    const duplicate = this.scene.add.text(0, titleY + 29, request.duplicate ? '+1 COPY // DUPLICATE' : '', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: `${Phaser.Math.Clamp(width * 0.021, 15, 20)}px`,
      fontStyle: 'bold',
      color: '#ffd36a',
      stroke: '#020711',
      strokeThickness: 4
    }).setOrigin(0.5).setAlpha(0);
    root.add([backdrop, halo, card, title, duplicate]);
    this.activeRoot = root;
    this.activeBackdrop = backdrop;
    AudioManager.get().playSfx('pickup');

    this.scene.tweens.add({ targets: backdrop, alpha: 0.16, duration: 260, ease: 'Quad.Out' });
    this.scene.tweens.add({ targets: halo, alpha: 0.22, scale: { from: 0.65, to: 1.12 }, duration: 520, ease: 'Cubic.Out' });
    this.scene.tweens.add({
      targets: card,
      x: 0,
      y: targetY,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      angle: { from: Phaser.Math.Between(-6, 6), to: 0 },
      duration: 480,
      ease: 'Back.Out',
      onComplete: () => {
        if (this.destroyed || this.activeRoot !== root) return;
        this.holdTimer = this.scene.time.delayedCall(NORMAL_MOD_REVEAL_HOLD_MS, () => this.dismissStandard(root, card, title, duplicate, halo, backdrop));
      }
    });
    this.scene.tweens.add({ targets: [title, duplicate], y: '+=14', alpha: 1, scaleX: 1, scaleY: 1, duration: 360, delay: 150, ease: 'Cubic.Out' });
  }

  private dismissStandard(
    root: Phaser.GameObjects.Container,
    card: Phaser.GameObjects.Container,
    title: Phaser.GameObjects.Text,
    duplicate: Phaser.GameObjects.Text,
    halo: Phaser.GameObjects.Arc,
    backdrop: Phaser.GameObjects.Rectangle
  ): void {
    this.holdTimer = null;
    this.scene.tweens.add({ targets: backdrop, alpha: 0, duration: 340 });
    this.scene.tweens.add({ targets: [title, duplicate, halo], alpha: 0, y: '-=18', duration: 320, ease: 'Quad.In' });
    this.scene.tweens.add({
      targets: card,
      y: card.y - 54,
      scaleX: 0.78,
      scaleY: 0.78,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.In',
      onComplete: () => {
        if (this.activeRoot !== root) return;
        root.destroy(true);
        this.activeRoot = null;
        this.activeBackdrop = null;
        this.completeActive();
      }
    });
  }

  private presentLegendary(request: ModAcquisitionPresentation): void {
    this.legendaryToken = `${request.card.instanceId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.hooks.onLegendaryStart();
    try {
      this.scene.scene.launch(SceneKeys.LegendaryModReveal, {
        ownerSceneKey: this.scene.scene.key,
        token: this.legendaryToken,
        request
      });
      this.scene.scene.bringToTop(SceneKeys.LegendaryModReveal);
    } catch {
      this.hooks.onLegendaryComplete();
      this.legendaryToken = '';
      this.presentStandard(request);
    }
  }

  private readonly handleLegendaryComplete = (token: string): void => {
    if (this.destroyed || !this.active || token !== this.legendaryToken) return;
    this.legendaryToken = '';
    this.hooks.onLegendaryComplete();
    this.completeActive();
  };

  private completeActive(): void {
    this.active = null;
    this.presentNext();
  }

  private flushIdleCallbacks(): void {
    const callbacks = [...this.idleCallbacks];
    this.idleCallbacks.clear();
    callbacks.forEach((callback) => callback());
  }
}
