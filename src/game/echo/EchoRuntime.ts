import Phaser from 'phaser';
import type { Player } from '../entities/Player.ts';
import type { PlayerInput } from '../input/PlayerInput.ts';
import type { HudAbilitySlot } from '../systems/Hud.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { compactBindingLabel } from '../config/controls.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import { EchoTimeline, type EchoShot } from './EchoTimeline.ts';
import { nearestSafeEchoOrigin, type EchoConfig } from './EchoRules.ts';

/** Scene-owned presentation and body adapter. The hologram has no physics body or AI. */
export class EchoRuntime {
  readonly timeline: EchoTimeline;
  readonly hud: HudAbilitySlot = { id: 'echo', keybind: 'L ALT', icon: '', label: 'ECHO', cooldownMs: 0,
    cooldownDurationMs: 12000, selected: false, hasEnergy: true, underLimit: true, count: 0, capacity: null };
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly root: Phaser.GameObjects.Container;
  private readonly ghosts: Phaser.GameObjects.Image[];
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly marker: Phaser.GameObjects.Arc;
  private readonly snapRings: Phaser.GameObjects.Arc[];
  private snapMs = 0;
  private exitMs = 0;
  private trailTick = 0;
  private hudTick = 100;
  private hudPhase = '';
  private destroyed = false;
  private readonly valid = (x: number, y: number): boolean => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const world = this.scene.physics.world, b = world.bounds, radius = 13;
    if (x < b.x + radius || y < b.y + radius || x > b.right - radius || y > b.bottom - radius) return false;
    for (const wall of world.staticBodies.entries) {
      if (!wall.enable || wall.checkCollision.none) continue;
      const dx = x - Math.max(wall.x, Math.min(wall.right, x));
      const dy = y - Math.max(wall.y, Math.min(wall.bottom, y));
      if (dx * dx + dy * dy < radius * radius) return false;
    }
    return true;
  };
  constructor(scene: Phaser.Scene, player: Player, fire: (shot: Readonly<EchoShot>, offsetX: number, offsetY: number, multiplier: number) => void,
    config: Partial<EchoConfig> = {}) {
    this.scene = scene; this.player = player;
    this.ghosts = [0xff5bd8, 0x72faff, 0xffffff].map(color => scene.add.image(0, 0, player.texture.key).setTint(color));
    this.root = scene.add.container(0, 0, this.ghosts).setDepth(7.9).setVisible(false).setName('echo-hologram');
    this.trail = scene.add.graphics().setDepth(5).setName('echo-recorded-route');
    this.marker = scene.add.circle(0, 0, 19, 0x63f7ff, .06).setStrokeStyle(1.5, 0xff5bd8, .85).setDepth(5).setVisible(false);
    this.snapRings = [0xff5bd8, 0x72faff].map(color => scene.add.circle(0, 0, 14).setStrokeStyle(2, color, .85)
      .setDepth(8).setVisible(false).setName('echo-snap-ring'));
    this.timeline = new EchoTimeline({ validOrigin: this.valid,
      snap: (x, y, out) => {
        if (!nearestSafeEchoOrigin(x, y, this.valid, player.x, player.y, out)) return false;
        this.snapRings[0].setPosition(player.x, player.y);
        this.snapRings[1].setPosition(out.x, out.y);
        this.snapMs = 180;
        (player.body as Phaser.Physics.Arcade.Body).reset(out.x, out.y);
        player.setVelocity(0, 0); player.dashUntil = scene.time.now;
        return true;
      },
      pose: (x, y, rotation, dash) => {
        this.root.setPosition(x, y).setVisible(true);
        const separation = dash ? 5 : 2;
        for (let i = 0; i < this.ghosts.length; i++) {
          const image = this.ghosts[i];
          image.setPosition((i - 1) * separation, (1 - i) * .8).setRotation(rotation);
          image.setAlpha(i === 1 ? .65 : i === 0 ? .24 : .10);
        }
      }, fire,
      event: event => {
        if (event === 'record') {
          this.exitMs = 0;
          for (const image of this.ghosts) image.setTexture(player.texture.key, player.frame.name)
            .setDisplaySize(player.displayWidth, player.displayHeight).setOrigin(player.originX, player.originY);
          this.marker.setPosition(player.x, player.y).setRadius(19).setVisible(true);
          AudioManager.get().playSfx('echoRecord');
        } else if (event === 'snap') {
          this.root.setAlpha(1); this.marker.setRadius(25); AudioManager.get().playSfx('echoSnap');
        } else if (event === 'complete') {
          this.exitMs = 160; AudioManager.get().playSfx('echoComplete'); this.marker.setVisible(false); this.trail.clear();
        } else {
          this.root.setVisible(false); this.marker.setVisible(false); this.trail.clear(); this.exitMs = this.snapMs = 0;
          for (const ring of this.snapRings) ring.setVisible(false);
        }
      }
    }, config);
    scene.events.once('shutdown', this.destroy, this);
  }
  update(delta: number, input: PlayerInput, now: number): void {
    if (this.destroyed) return;
    this.timeline.advance(delta, input.held('echo'), input.pressed('echo'), this.player.x, this.player.y,
      this.player.rotation, now < this.player.dashUntil);
    if (this.snapMs > 0) {
      this.snapMs = Math.max(0, this.snapMs - delta);
      for (let i = 0; i < this.snapRings.length; i++) this.snapRings[i].setVisible(this.snapMs > 0)
        .setAlpha(this.snapMs / 180).setRadius(i === 0 ? 14 + (1 - this.snapMs / 180) * 25 : 14 + this.snapMs / 180 * 25);
    }
    if (this.exitMs > 0) {
      this.exitMs = Math.max(0, this.exitMs - delta);
      this.root.setAlpha(this.exitMs / 160 * (.65 + .35 * Math.sin(this.exitMs))).setVisible(this.exitMs > 0);
    }
    this.trailTick += delta;
    if (this.trailTick >= 50 && (this.timeline.recording || this.timeline.replaying)) {
      this.trailTick = 0; this.trail.clear().lineStyle(1.2, 0x63f7ff, .28);
      const s = this.timeline.samples, count = this.timeline.sampleCount;
      for (let i = Math.max(1, count - 32); i < count; i++) this.trail.lineBetween(s[(i - 1) * 5 + 1], s[(i - 1) * 5 + 2], s[i * 5 + 1], s[i * 5 + 2]);
    }
    this.hudTick += delta;
    const phase = this.timeline.recording ? 'record' : this.timeline.replaying ? 'play' : this.timeline.cooldownMs > 0 ? 'cooldown' : 'ready';
    if (this.hudTick >= 100 || phase !== this.hudPhase) {
      this.hudTick = 0; this.hudPhase = phase; this.syncHud(input);
    }
  }
  syncHud(input: PlayerInput): void {
    const t = this.timeline, h = this.hud;
    h.keybind = input.prompt('echo', compactBindingLabel(SaveSystem.get().settings.abilityBindings.echo));
    h.cooldownMs = t.recording ? t.config.recordingMs - t.elapsedMs : t.cooldownMs;
    h.cooldownDurationMs = t.recording ? t.config.recordingMs : t.config.cooldownMs;
    h.active = t.recording; h.selected = t.recording || t.replaying;
    h.countLabel = t.recording ? 'REC' : t.replaying ? 'PLAY' : '';
    h.status = t.recording ? `${(t.elapsedMs / 1000).toFixed(1)}s`
      : t.cooldownMs > 0 ? `${(t.cooldownMs / 1000).toFixed(1)}s` : '';
  }
  reset(): void { this.timeline.reset(); }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true; this.reset(); this.scene.events.off('shutdown', this.destroy, this);
    this.root.destroy(); this.trail.destroy(); this.marker.destroy();
    for (const ring of this.snapRings) ring.destroy();
  }
}
