import Phaser from 'phaser';
import { bakeStaticGraphics } from '../../rendering/bakeStaticGraphics.ts';
import { REDLINE_STATES, type RedlineMomentum, type RedlineResult } from '../events/RedlineMomentum.ts';
/** One private baked dial, a transformed needle, and throttled text. No live path tessellation. */
export class RedlineVisualController {
  private readonly root: Phaser.GameObjects.Container;
  private readonly dial: Phaser.GameObjects.Container;
  private readonly needle: Phaser.GameObjects.Rectangle;
  private readonly readout: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly notice: Phaser.GameObjects.Text;
  private readonly resultText: Phaser.GameObjects.Text;
  private readonly rails: Phaser.GameObjects.Rectangle[];
  private noticeUntil = 0;
  private pendingNotice: string | null = null;
  private nextTextAt = 0;
  private shownRpm = 0;
  constructor(private readonly scene: Phaser.Scene) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0x030b16, .9).fillRoundedRect(-99, -85, 198, 153, 12);
    g.lineStyle(1, 0x386077, .9).strokeRoundedRect(-99, -85, 198, 153, 12);
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI + i / 40 * Math.PI;
      const major = i % 5 === 0;
      g.lineStyle(major ? 2 : 1, i >= 28 ? 0xff4563 : 0x71d7e5, major ? 1 : .55)
        .lineBetween(Math.cos(a) * (major ? 57 : 63), Math.sin(a) * (major ? 57 : 63), Math.cos(a) * 72, Math.sin(a) * 72);
    }
    g.lineStyle(4, 0xff4563, .8).beginPath().arc(0, 0, 79, Math.PI * 1.7, Math.PI * 2).strokePath();
    g.lineStyle(1, 0x427887, .7).lineBetween(-82, 24, 82, 24);
    const art = bakeStaticGraphics(scene, g, { x: -102, y: -88, w: 204, h: 159 });
    this.needle = scene.add.rectangle(0, 0, 61, 2, 0xffffff).setOrigin(0, .5);
    const hub = scene.add.circle(0, 0, 4, 0xff4563).setStrokeStyle(1, 0xffffff);
    this.readout = scene.add.text(0, 8, '0% RPM', { fontFamily: 'Orbitron, sans-serif', fontSize: '15px', color: '#ffffff' }).setOrigin(.5);
    this.status = scene.add.text(0, 37, 'BUILDING  /  x1', { fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: '#83e9f3', align: 'center' }).setOrigin(.5);
    const title = scene.add.text(0, -98, 'REDLINE / RPM', { fontFamily: 'Orbitron, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#ff667e', stroke: '#030811', strokeThickness: 3 }).setOrigin(.5);
    this.dial = scene.add.container(0, 0, [art, title, this.needle, hub, this.readout, this.status]);
    this.notice = scene.add.text(0, 0, '', { fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: '#ff8da0', align: 'center', stroke: '#020711', strokeThickness: 4 }).setOrigin(.5);
    this.resultText = scene.add.text(0, 0, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '19px', fontStyle: 'bold', color: '#e7fbff', backgroundColor: '#030b16ed', padding: { x: 18, y: 12 }, align: 'center', lineSpacing: 3 }).setOrigin(.5, 0).setVisible(false);
    this.rails = [0, 1, 2, 3].map(() => scene.add.rectangle(0, 0, 3, 100, 0xff4563, 1).setBlendMode(Phaser.BlendModes.ADD));
    this.root = scene.add.container(0, 0, [...this.rails, this.dial, this.notice, this.resultText]).setScrollFactor(0).setDepth(3605).setName('redline-rpm');
  }
  announce(text: string, now: number): void {
    if (now < this.noticeUntil && this.notice.text.startsWith('CRITICAL REDLINE')) {
      this.pendingNotice = text;
      return;
    }
    this.notice.setText(text);
    this.noticeUntil = now + 1600;
  }
  update(now: number, model: RedlineMomentum, remainingMs: number, terminalMs = -1, result?: RedlineResult): void {
    if (terminalMs >= 0)
      this.pendingNotice = null;
    else if (this.pendingNotice && now >= this.noticeUntil) {
      this.announce(this.pendingNotice, now);
      this.pendingNotice = null;
    }
    const { width: w, height: h } = this.scene.scale;
    const camera = this.scene.cameras.main, zoom = camera.zoom;
    this.root.setPosition(w * .5 * (1 - 1 / zoom), h * .5 * (1 - 1 / zoom)).setScale(1 / zoom);
    this.dial.setPosition(w - 120, h * .5).setScale(w < 1000 ? .8 : 1);
    this.notice.setPosition(w * .5, 166).setVisible(now < this.noticeUntil);
    this.rails[0].setPosition(5, h * .5).setSize(3, h * .66);
    this.rails[1].setPosition(w - 5, h * .5).setSize(3, h * .66);
    this.rails[2].setPosition(w * .5, 5).setSize(w * .7, 3);
    this.rails[3].setPosition(w * .5, h - 5).setSize(w * .7, 3);
    const target = terminalMs >= 0 ? 0 : model.rpm;
    this.shownRpm += (target - this.shownRpm) * (terminalMs >= 0 ? .35 : .22);
    this.needle.setRotation(Math.PI + this.shownRpm / 100 * Math.PI + (model.stage === 3 && terminalMs < 0 ? Math.sin(now * .11) * .018 : 0));
    const intensity = terminalMs >= 0 ? 0 : (.04 + model.stage * .09) * (.7 + .3 * Math.sin(now * (.004 + model.stage * .002)));
    for (const rail of this.rails)
      rail.setAlpha(intensity);
    if (now >= this.nextTextAt) {
      this.nextTextAt = now + 100;
      this.readout.setText(Math.round(this.shownRpm) + '% RPM');
      this.status.setText(terminalMs >= 0 ? 'REDLINE TERMINATED' : REDLINE_STATES[model.stage] + ' / x' + model.multiplier + '\n' + Math.floor(model.score).toLocaleString() + ' PTS / ' + Math.ceil(remainingMs / 1000) + 's');
    }
    if (result && terminalMs >= 500) {
      this.resultText.setPosition(w * .5, 175).setVisible(true).setText('REDLINE COMPLETE / RANK ' + result.rank + '\nSCORE ' + result.score.toLocaleString() + ' / PEAK ' + result.peakRpm + '%\nREDLINE ' + (result.redlineMs / 1000).toFixed(1) + 's / CRITICAL ' + (result.criticalMs / 1000).toFixed(1) + 's\nLONGEST CHAIN ' + result.longestChain + ' / TARGETS ' + result.targetKills);
      this.notice.setVisible(false);
    }
  }
  destroy(): void { this.root.destroy(true); }
}
