import Phaser from 'phaser';
import type { ArenaTheme, BombSiteRuntime, ObjectiveMode } from '../types';
import { BombSiteState } from '../types';

interface ArmedSiteEffect {
  electricity: Phaser.GameObjects.Graphics;
  shield: Phaser.GameObjects.Graphics;
  shieldGlow: Phaser.GameObjects.Arc;
  guardLabel: Phaser.GameObjects.Text;
  pulse: Phaser.Tweens.Tween;
  defenseMs: number;
}

interface AmbientSiteEffect {
  root: Phaser.GameObjects.Container;
  color: number;
  halo: Phaser.GameObjects.Arc;
  sweep: Phaser.GameObjects.Graphics;
  rotor: Phaser.GameObjects.Graphics;
  bomb: Phaser.GameObjects.Graphics;
  leftMast: Phaser.GameObjects.Rectangle;
  rightMast: Phaser.GameObjects.Rectangle;
  leftTip: Phaser.GameObjects.Arc;
  rightTip: Phaser.GameObjects.Arc;
  particles: Phaser.GameObjects.Arc[];
  phase: number;
}

const SITE_COLORS = [0x4ffcff, 0xff5ee7, 0x72ff91, 0xffb347, 0x9b7bff, 0xff627d] as const;

export class BombSiteManager extends Phaser.Events.EventEmitter {
  readonly sites: BombSiteRuntime[] = [];
  private readonly mode: ObjectiveMode;
  private readonly maxActiveBombs: number;
  private scene: Phaser.Scene | null = null;
  private theme: ArenaTheme | null = null;
  private readonly armedEffects = new Map<string, ArmedSiteEffect>();
  private readonly ambientEffects = new Map<string, AmbientSiteEffect>();

  constructor(mode: ObjectiveMode, maxActiveBombs: number) {
    super();
    this.mode = mode;
    this.maxActiveBombs = maxActiveBombs;
  }

  initialize(scene: Phaser.Scene, positions: Phaser.Math.Vector2[], theme: ArenaTheme): void {
    this.scene = scene;
    this.theme = theme;
    this.destroyArmedEffects();
    this.destroyAmbientEffects();
    this.sites.length = 0;

    for (let i = 0; i < positions.length; i += 1) {
      const p = positions[i];
      const letter = String.fromCharCode(65 + i);
      const siteColor = SITE_COLORS[i % SITE_COLORS.length];
      const ring = scene.add.circle(p.x, p.y, 80, siteColor, 0.035).setStrokeStyle(3, siteColor, 0.9).setDepth(2);
      const label = scene.add.text(p.x, p.y - 102, `Site ${letter}`, {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '21px',
        color: '#d7faff'
      }).setOrigin(0.5).setDepth(6);

      scene.tweens.add({
        targets: ring,
        alpha: { from: 0.28, to: 0.82 },
        duration: 1200,
        yoyo: true,
        repeat: -1
      });

      this.sites.push({
        id: `site-${letter}`,
        letter,
        x: p.x,
        y: p.y,
        state: BombSiteState.Locked,
        ring,
        label,
        timerMs: 0,
        defuseMs: 0,
        plantedAt: 0,
        activeBomb: false,
        scorch: null
      });
      this.createAmbientEffect(`site-${letter}`, p.x, p.y, siteColor, i);
    }

    if (this.mode === 'open') {
      for (const site of this.sites) site.state = BombSiteState.Available;
    } else if (this.sites.length > 0) {
      this.sites[0].state = BombSiteState.Available;
    }

    this.refreshVisuals(theme);
  }

  updateAmbient(playerX: number, playerY: number, now: number, particlesEnabled: boolean): void {
    for (const site of this.sites) {
      const effect = this.ambientEffects.get(site.id);
      if (!effect) continue;
      const destroyed = site.state === BombSiteState.Destroyed;
      const locked = site.state === BombSiteState.Locked;
      const charged = site.state === BombSiteState.Armed || site.state === BombSiteState.BeingDefused;
      const activitySpeed = charged ? 2.15 : site.state === BombSiteState.Planting ? 1.55 : 1;
      const distance = Phaser.Math.Distance.Between(playerX, playerY, site.x, site.y);
      const proximity = destroyed ? 0 : Phaser.Math.Clamp(1 - (distance - 70) / 260, 0, 1);
      const extension = locked ? proximity * 0.38 : 0.16 + proximity * 0.84;
      const mastHeight = 34 * extension;

      effect.leftMast.setScale(1, Math.max(0.05, extension));
      effect.rightMast.setScale(1, Math.max(0.05, extension));
      effect.leftTip.setPosition(-58, 5 - mastHeight).setAlpha(destroyed ? 0 : 0.35 + proximity * 0.65);
      effect.rightTip.setPosition(58, 5 - mastHeight).setAlpha(destroyed ? 0 : 0.35 + proximity * 0.65);
      effect.rotor.rotation = now * 0.00055 * activitySpeed + effect.phase;
      effect.sweep.rotation = -now * 0.00028 * activitySpeed + effect.phase;
      effect.bomb.rotation = Math.sin(now * 0.0018 + effect.phase) * 0.08;
      effect.halo.setRadius(60 + Math.sin(now * 0.002 + effect.phase) * 3 + proximity * 7);
      effect.halo.setAlpha(destroyed ? 0.06 : (locked ? 0.12 : 0.2) + proximity * 0.2);
      effect.root.setAlpha(destroyed ? 0.22 : 1);

      effect.particles.forEach((particle, index) => {
        particle.setVisible(particlesEnabled && !destroyed);
        if (!particle.visible) return;
        const angle = now * (0.00045 + index * 0.000025) * activitySpeed + effect.phase + index * (Math.PI * 2 / effect.particles.length);
        const radius = 69 + (index % 3) * 8 + Math.sin(now * 0.0025 + index) * 3;
        particle.setPosition(Math.cos(angle) * radius, Math.sin(angle) * radius);
        particle.setAlpha((locked ? 0.18 : 0.35) + proximity * 0.42);
      });
    }
  }

  activeBombCount(): number {
    return this.sites.filter((s) => s.state === BombSiteState.Armed || s.state === BombSiteState.BeingDefused).length;
  }

  getNearestAvailable(x: number, y: number, radius: number): BombSiteRuntime | null {
    let best: BombSiteRuntime | null = null;
    let bestDist = Infinity;
    for (const site of this.sites) {
      if (site.state !== BombSiteState.Available && site.state !== BombSiteState.Planting) continue;
      const d = Phaser.Math.Distance.Between(x, y, site.x, site.y);
      if (d <= radius && d < bestDist) {
        best = site;
        bestDist = d;
      }
    }
    return best;
  }

  canPlant(site: BombSiteRuntime): boolean {
    if (site.state !== BombSiteState.Available && site.state !== BombSiteState.Planting) return false;
    return this.activeBombCount() < this.maxActiveBombs;
  }

  setPlanting(site: BombSiteRuntime): void {
    site.state = BombSiteState.Planting;
    this.emit('bomb-site-plant-started', site);
  }

  cancelPlanting(site: BombSiteRuntime): void {
    if (site.state === BombSiteState.Planting) site.state = BombSiteState.Available;
  }

  armSite(site: BombSiteRuntime, defenseMs: number, now: number): void {
    site.state = BombSiteState.Armed;
    site.timerMs = defenseMs;
    site.defuseMs = 0;
    site.plantedAt = now;
    site.activeBomb = true;
    this.createArmedEffect(site, defenseMs);
    this.emit('bomb-site-armed', site);
  }

  tickActive(delta: number): BombSiteRuntime[] {
    const detonated: BombSiteRuntime[] = [];
    for (const site of this.sites) {
      if (site.state === BombSiteState.Armed || site.state === BombSiteState.BeingDefused) {
        site.timerMs = Math.max(0, site.timerMs - delta);
        if (site.state === BombSiteState.Armed) site.defuseMs = Math.max(0, site.defuseMs - delta * 0.35);
        this.updateArmedEffect(site);
        if (site.timerMs <= 0) detonated.push(site);
      }
    }
    return detonated;
  }

  startDefuse(site: BombSiteRuntime): void {
    if (site.state === BombSiteState.Armed) {
      site.state = BombSiteState.BeingDefused;
      this.emit('bomb-site-defuse-started', site);
    }
  }

  stopDefuse(site: BombSiteRuntime): void {
    if (site.state === BombSiteState.BeingDefused) {
      site.state = BombSiteState.Armed;
      this.emit('bomb-site-defuse-stopped', site);
    }
  }

  applyDefuse(site: BombSiteRuntime, deltaMs: number, requiredMs: number): boolean {
    site.defuseMs += deltaMs;
    return site.defuseMs >= requiredMs;
  }

  interruptDefuse(site: BombSiteRuntime, resetProgress = true): void {
    if (resetProgress) site.defuseMs = 0;
    this.stopDefuse(site);
  }

  reduceCountdown(site: BombSiteRuntime, amountMs: number): number {
    if ((site.state !== BombSiteState.Armed && site.state !== BombSiteState.BeingDefused) || amountMs <= 0 || site.timerMs <= 250) return 0;
    const previous = site.timerMs;
    // Countdown Mods may accelerate the objective, but detonation still passes
    // through tickActive on the following update instead of skipping its state.
    site.timerMs = Math.max(250, site.timerMs - Math.max(0, amountMs));
    return previous - site.timerMs;
  }

  onDetonated(site: BombSiteRuntime, theme: ArenaTheme): void {
    this.destroyArmedEffect(site.id);
    site.state = BombSiteState.Destroyed;
    site.activeBomb = false;
    site.timerMs = 0;
    site.defuseMs = 0;
    site.ring.setStrokeStyle(3, 0x3f4152, 0.85).setFillStyle(0x101216, 0.35);
    site.label.setColor('#798195');

    const scorch = site.ring.scene.add.circle(site.x, site.y, 82, 0x181b25, 0.6).setStrokeStyle(2, theme.secondary, 0.25).setDepth(1);
    site.scorch = scorch;

    this.emit('bomb-site-detonated', site);
    this.emit('bomb-site-destroyed', site);

    if (this.mode === 'sequential') {
      const next = this.sites.find((s) => s.state === BombSiteState.Locked);
      if (next) next.state = BombSiteState.Available;
    }

    this.refreshVisuals(theme);

    if (this.sites.every((s) => s.state === BombSiteState.Destroyed)) {
      this.emit('all-bomb-sites-destroyed');
    }
  }

  getActiveBombSite(): BombSiteRuntime | null {
    return this.getActiveBombSites().sort((a, b) => a.timerMs - b.timerMs)[0] ?? null;
  }

  getActiveBombSites(): BombSiteRuntime[] {
    return this.sites.filter((s) => s.state === BombSiteState.Armed || s.state === BombSiteState.BeingDefused);
  }

  getRemainingSites(): BombSiteRuntime[] {
    return this.sites.filter((s) => s.state !== BombSiteState.Destroyed);
  }

  destroyedCount(): number {
    return this.sites.filter((s) => s.state === BombSiteState.Destroyed).length;
  }

  refreshVisuals(theme: ArenaTheme): void {
    for (const s of this.sites) {
      const siteColor = this.ambientEffects.get(s.id)?.color ?? theme.primary;
      const siteCssColor = `#${siteColor.toString(16).padStart(6, '0')}`;
      if (s.state === BombSiteState.Available) {
        s.ring.setStrokeStyle(3, siteColor, 0.95).setFillStyle(siteColor, 0.035);
        s.label.setText(`Site ${s.letter} [AVAILABLE]`).setColor(siteCssColor);
      } else if (s.state === BombSiteState.Locked) {
        s.ring.setStrokeStyle(3, 0x3a4563, 0.65);
        s.label.setText(`Site ${s.letter} [LOCKED]`).setColor('#6f7c98');
      } else if (s.state === BombSiteState.Planting) {
        s.ring.setStrokeStyle(4, siteColor, 1).setFillStyle(siteColor, 0.08);
        s.label.setText(`Site ${s.letter} [PLANTING]`).setColor(siteCssColor);
      } else if (s.state === BombSiteState.Armed) {
        s.ring.setStrokeStyle(4, siteColor, 1).setFillStyle(siteColor, 0.09);
        s.label.setText(`Site ${s.letter} [ARMED]`).setColor(siteCssColor);
      } else if (s.state === BombSiteState.BeingDefused) {
        s.ring.setStrokeStyle(4, 0xff5e75, 1).setFillStyle(0xff5e75, 0.1);
        s.label.setText(`Site ${s.letter} [DEFUSE ALERT]`).setColor('#ffd6dc');
      } else if (s.state === BombSiteState.Destroyed) {
        s.label.setText(`Site ${s.letter} [DESTROYED]`).setColor('#737a8a');
      }
    }
  }

  private createAmbientEffect(siteId: string, x: number, y: number, color: number, index: number): void {
    if (!this.scene) return;
    const root = this.scene.add.container(x, y).setDepth(3);
    const halo = this.scene.add.circle(0, 0, 60, color, 0.04).setStrokeStyle(1, color, 0.28);

    const sweep = this.scene.add.graphics();
    sweep.lineStyle(1, color, 0.3);
    sweep.lineBetween(-72, 0, 72, 0);
    sweep.lineBetween(0, -72, 0, 72);
    sweep.strokeCircle(0, 0, 48);

    const rotor = this.scene.add.graphics();
    rotor.lineStyle(3, color, 0.78);
    for (let segment = 0; segment < 4; segment += 1) {
      const start = segment * Math.PI * 0.5 + 0.12;
      rotor.beginPath();
      rotor.arc(0, 0, 34, start, start + 0.62, false);
      rotor.strokePath();
    }
    rotor.fillStyle(0xffffff, 0.9);
    rotor.fillCircle(34, 0, 2);
    rotor.fillCircle(-34, 0, 2);

    const bomb = this.scene.add.graphics();
    bomb.fillStyle(0x07131d, 0.96);
    bomb.lineStyle(2, color, 1);
    bomb.fillCircle(0, 3, 13);
    bomb.strokeCircle(0, 3, 13);
    bomb.fillStyle(color, 0.95);
    bomb.fillCircle(-4, 0, 3);
    bomb.lineStyle(3, color, 0.95);
    bomb.beginPath();
    bomb.moveTo(7, -8);
    bomb.lineTo(11, -14);
    bomb.lineTo(16, -12);
    bomb.strokePath();
    bomb.fillStyle(0xffffff, 0.95);
    bomb.fillCircle(18, -13, 2);

    const leftMast = this.scene.add.rectangle(-58, 5, 3, 34, color, 0.9).setOrigin(0.5, 1);
    const rightMast = this.scene.add.rectangle(58, 5, 3, 34, color, 0.9).setOrigin(0.5, 1);
    const leftBase = this.scene.add.circle(-58, 6, 6, 0x07131d, 0.95).setStrokeStyle(2, color, 0.8);
    const rightBase = this.scene.add.circle(58, 6, 6, 0x07131d, 0.95).setStrokeStyle(2, color, 0.8);
    const leftTip = this.scene.add.circle(-58, -29, 4, color, 0.85).setStrokeStyle(1, 0xffffff, 0.8);
    const rightTip = this.scene.add.circle(58, -29, 4, color, 0.85).setStrokeStyle(1, 0xffffff, 0.8);
    const particles = Array.from({ length: 7 }, (_, particleIndex) =>
      this.scene!.add.circle(0, 0, particleIndex % 3 === 0 ? 2.5 : 1.5, color, 0.55)
    );

    root.add([halo, sweep, rotor, bomb, leftMast, rightMast, leftBase, rightBase, leftTip, rightTip, ...particles]);
    this.ambientEffects.set(siteId, {
      root, color, halo, sweep, rotor, bomb, leftMast, rightMast, leftTip, rightTip, particles,
      phase: index * 1.37
    });
  }

  private createArmedEffect(site: BombSiteRuntime, defenseMs: number): void {
    if (!this.scene || !this.theme) return;
    this.destroyArmedEffect(site.id);

    const siteColor = this.ambientEffects.get(site.id)?.color ?? this.theme.primary;
    const electricity = this.scene.add.graphics().setDepth(5);
    const shieldGlow = this.scene.add.circle(site.x, site.y, 29, siteColor, 0.1)
      .setStrokeStyle(1, siteColor, 0.45)
      .setDepth(5);
    const shield = this.scene.add.graphics().setDepth(6);
    shield.lineStyle(4, 0xffffff, 0.92);
    shield.fillStyle(siteColor, 0.13);
    shield.beginPath();
    shield.moveTo(site.x, site.y - 25);
    shield.lineTo(site.x + 21, site.y - 15);
    shield.lineTo(site.x + 17, site.y + 10);
    shield.lineTo(site.x, site.y + 28);
    shield.lineTo(site.x - 17, site.y + 10);
    shield.lineTo(site.x - 21, site.y - 15);
    shield.closePath();
    shield.fillPath();
    shield.strokePath();
    shield.lineStyle(2, this.theme.secondary, 0.9);
    shield.lineBetween(site.x, site.y - 16, site.x, site.y + 17);
    shield.lineBetween(site.x - 10, site.y - 7, site.x + 10, site.y - 7);

    const guardLabel = this.scene.add.text(site.x, site.y + 40, 'GUARD', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '12px',
      color: '#d9fdff',
      stroke: '#06101a',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(6);

    const pulse = this.scene.tweens.add({
      targets: [shieldGlow, shield, guardLabel],
      alpha: { from: 0.58, to: 1 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.armedEffects.set(site.id, { electricity, shield, shieldGlow, guardLabel, pulse, defenseMs });
    this.updateArmedEffect(site);
  }

  private updateArmedEffect(site: BombSiteRuntime): void {
    const effect = this.armedEffects.get(site.id);
    if (!effect || !this.theme) return;
    const charge = Phaser.Math.Clamp(1 - site.timerMs / effect.defenseMs, 0, 1);
    const segments = Math.round(10 + charge * 34);
    const radius = 82 + charge * 7;
    const arcLength = Phaser.Math.Linear(0.08, 0.17, charge);
    const flicker = 0.72 + Math.random() * 0.28;

    effect.electricity.clear();
    const siteColor = this.ambientEffects.get(site.id)?.color ?? this.theme.primary;
    effect.electricity.lineStyle(1 + charge * 2.2, siteColor, (0.34 + charge * 0.52) * flicker);
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2 + Math.random() * 0.06;
      const nextAngle = angle + arcLength + Math.random() * 0.05;
      const jitter = 2 + charge * 7;
      const r1 = radius + Phaser.Math.FloatBetween(-jitter, jitter);
      const r2 = radius + Phaser.Math.FloatBetween(-jitter, jitter);
      effect.electricity.beginPath();
      effect.electricity.moveTo(site.x + Math.cos(angle) * r1, site.y + Math.sin(angle) * r1);
      effect.electricity.lineTo(
        site.x + Math.cos((angle + nextAngle) * 0.5) * (radius + Phaser.Math.FloatBetween(-jitter, jitter)),
        site.y + Math.sin((angle + nextAngle) * 0.5) * (radius + Phaser.Math.FloatBetween(-jitter, jitter))
      );
      effect.electricity.lineTo(site.x + Math.cos(nextAngle) * r2, site.y + Math.sin(nextAngle) * r2);
      effect.electricity.strokePath();
    }

    effect.electricity.lineStyle(1, this.theme.secondary, 0.22 + charge * 0.5);
    effect.electricity.strokeCircle(site.x, site.y, radius + 6 + Math.sin((this.scene?.time.now ?? 0) / 180) * 2);
    effect.shieldGlow.setRadius(29 + charge * 5);
  }

  private destroyArmedEffect(siteId: string): void {
    const effect = this.armedEffects.get(siteId);
    if (!effect) return;
    effect.pulse.remove();
    effect.electricity.destroy();
    effect.shield.destroy();
    effect.shieldGlow.destroy();
    effect.guardLabel.destroy();
    this.armedEffects.delete(siteId);
  }

  private destroyArmedEffects(): void {
    for (const siteId of Array.from(this.armedEffects.keys())) this.destroyArmedEffect(siteId);
  }

  private destroyAmbientEffects(): void {
    for (const effect of this.ambientEffects.values()) effect.root.destroy(true);
    this.ambientEffects.clear();
  }

  destroy(): void {
    this.destroyArmedEffects();
    this.destroyAmbientEffects();
    this.removeAllListeners();
    for (const site of this.sites) {
      site.ring.destroy();
      site.label.destroy();
      site.scorch?.destroy();
    }
    this.sites.length = 0;
    this.scene = null;
    this.theme = null;
  }
}
