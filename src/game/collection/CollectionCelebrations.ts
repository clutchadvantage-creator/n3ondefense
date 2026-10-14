import Phaser from 'phaser';
import { fragmentRelic, TROPHIES } from './CollectionCatalog.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import { createButton } from '../utils/ui.ts';
import { setSceneUiModalDepth } from '../input/UiNavigationController.ts';
import { addRelicAssembly, collectionChassis } from './CollectionView.ts';
import { playCollectionAudio } from './CollectionAudio.ts';
import { SceneKeys } from '../flow/SceneKeys.ts';

/** Presentation acknowledges a durable receipt; it never owns or grants the reward. */
export class CollectionCelebrations {
  private root: Phaser.GameObjects.Container | null = null;
  private readonly poll: Phaser.Time.TimerEvent;
  private readonly tweens: Phaser.Tweens.Tween[] = [];
  private ready = false;
  private postponed = false;
  private readonly shutdown = () => this.destroy();
  constructor(private readonly scene: Phaser.Scene, private readonly canPresent: () => boolean = () => true) {
    this.poll = scene.time.addEvent({ delay: 500, loop: true, callback: () => this.present() });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown);
  }
  get active(): boolean { return Boolean(this.root); }
  dismiss(): void { this.postponed = true; this.clear(); }
  private present(): void {
    const s = this.scene;
    if (this.root || this.postponed || !s.scene.isActive() || !this.canPresent()
      || (s.sys.settings.key !== SceneKeys.MainMenu && s.sys.settings.key !== SceneKeys.Garage)
      || Number(s.data.get('ui-controller-modal-depth') ?? 0) > 0 || !SaveSystem.getActiveProfileSummary()) return;
    const state = SaveSystem.getCollection(), receipt = state.pending[0];
    if (!receipt) return;
    const { width, height } = s.scale, w = Math.min(830, width - 24), h = Math.min(740, height - 24);
    const x = width / 2, y = height / 2, top = y - h / 2;
    const root = this.root = s.add.container(0, 0).setDepth(6500);
    s.data.set('collection-reveal', true); setSceneUiModalDepth(s, 70); this.ready = false;
    root.add(s.add.rectangle(x, y, width, height, 0x01040b, 0.91).setInteractive());
    const relic = receipt.kind === 'fragment' ? fragmentRelic(receipt.itemId) : undefined;
    const trophy = receipt.kind === 'trophy' ? TROPHIES.find(t => t.id === receipt.itemId) : undefined;
    if (!relic && !trophy) { this.dismiss(); return; }
    const color = relic?.color ?? trophy!.color;
    collectionChassis(s, root, x, y, w, h, color);
    const label = (cy: number, value: string, size: number, tint: string) => {
      const text = s.add.text(x, cy, value, { fontFamily: 'Rajdhani, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color: tint, align: 'center', wordWrap: { width: w - 54 } }).setOrigin(0.5);
      root.add(text); return text;
    };
    label(top + 32, 'RUNTWERKX // COLLECTION ARCHIVE', 15, '#98b9c9');
    label(top + 76, relic ? 'ARTIFACT RECOVERED' : 'TROPHY EARNED', 26, '#d8f6ff').setFontFamily('Orbitron, sans-serif');
    const artSize = Math.min(w - 90, h * 0.47), artY = top + h * 0.43;
    const pulse = s.add.ellipse(x, artY, artSize * 0.88, artSize * 0.88, color, 0.025).setStrokeStyle(3, color, 0.55).setAlpha(0);
    root.add(pulse);
    let complete = false, progress = '';
    if (relic) {
      // Exclude queued pieces so three pickups reveal 1/3 -> 2/3 -> 3/3, even after reload.
      const queued = new Set(state.pending.filter(p => p.kind === 'fragment').map(p => p.itemId));
      const prior = state.fragments.filter(id => !queued.has(id));
      const count = relic.fragments.filter(f => prior.includes(f.id)).length + 1;
      complete = count === relic.fragments.length;
      progress = `${count} / ${relic.fragments.length} FRAGMENTS SECURED`;
      addRelicAssembly(s, root, relic, x, artY, artSize, prior);
      const piece = s.add.image(x + artSize * 0.5, artY - artSize * 0.38, `fragment-${receipt.itemId}`)
        .setDisplaySize(artSize * 1.18, artSize * 1.18).setRotation(0.42).setAlpha(0);
      root.add(piece);
      this.tweens.push(s.tweens.add({ targets: piece, x, y: artY, displayWidth: artSize, displayHeight: artSize, rotation: 0, alpha: 1,
        delay: 220, duration: 1050, ease: 'Back.easeOut', onComplete: () => {
          if (!this.root) return;
          playCollectionAudio(complete ? 'reconstructed' : 'snap');
          this.tweens.push(s.tweens.add({ targets: pulse, alpha: { from: 0.85, to: 0 }, scale: { from: 0.9, to: complete ? 1.35 : 1.12 }, duration: 650 }));
          this.ready = true;
        } }));
    } else {
      const image = s.add.image(x, artY + 40, `trophy-${trophy!.id}`).setDisplaySize(artSize, artSize).setAlpha(0).setRotation(-0.12);
      root.add(image); progress = trophy!.requirement.toUpperCase();
      this.tweens.push(s.tweens.add({ targets: image, y: artY, rotation: 0, alpha: 1, duration: 1100, ease: 'Back.easeOut', onComplete: () => {
        if (!this.root) return; playCollectionAudio('trophy'); this.ready = true;
        this.tweens.push(s.tweens.add({ targets: pulse, alpha: { from: 0.75, to: 0 }, scale: { from: 0.9, to: 1.25 }, duration: 650 }));
      } }));
    }
    label(top + h * 0.72, (relic?.name ?? trophy!.name).toUpperCase(), Math.min(28, w / 23), '#ebf7ff').setFontFamily('Orbitron, sans-serif');
    label(top + h * 0.79, complete ? `${relic!.category === 'cosmetic' ? 'COSMETIC INFUSIONS' : 'BANNED TECHNOLOGY'} UNLOCKED` : progress, 20, complete ? '#9cffe0' : '#c5aaff');
    const status = label(top + h * 0.84, complete ? 'RECONSTRUCTED // CATEGORY AUTHORIZATION PERMANENT' : 'PERMANENTLY SAVED TO YOUR COLLECTION', 13, '#8da8b9');
    root.add(createButton(s, x - 112, top + h - 46, 'VIEW LATER', () => this.dismiss(), 185, 'menu', { height: 40, fontSize: 16, focusModalDepth: 70, focusLabel: 'Close and view later' }));
    const next = createButton(s, x + 112, top + h - 46, state.pending.length > 1 ? 'NEXT REWARD' : 'CONTINUE', () => {
      if (!this.ready) return;
      if (!SaveSystem.acknowledgeCollectionCelebration(receipt.id)) { status.setText('SAVING UNAVAILABLE // REVEAL RETAINED FOR RETRY').setColor('#ff8299'); return; }
      this.clear(); this.present();
    }, 185, 'menu', { height: 40, fontSize: 16, focusModalDepth: 70, accent: color });
    root.add(next);
  }
  private clear(): void {
    for (const tween of this.tweens) tween.remove(); this.tweens.length = 0;
    this.root?.destroy(true); this.root = null; this.ready = false;
    this.scene.data.set('collection-reveal', false); setSceneUiModalDepth(this.scene, 0);
  }
  destroy(): void { this.poll.remove(); this.clear(); this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown); }
}
