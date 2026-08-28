import Phaser from 'phaser';
import type { ArenaTheme, BombSiteRuntime, ObjectiveMode } from '../types';
import { BombSiteState } from '../types';
import { drawMechanicalRivets } from '../rendering/LayeredArtPrimitives.ts';

interface ArmedSiteEffect {
  electricity: Phaser.GameObjects.Graphics;
  shield: Phaser.GameObjects.Graphics;
  shieldGlow: Phaser.GameObjects.Arc;
  guardLabel: Phaser.GameObjects.Text;
  defuseBoundary: Phaser.GameObjects.Graphics;
  defuseGlow: Phaser.GameObjects.Arc;
  defuseLabel: Phaser.GameObjects.Text;
  pulse: Phaser.Tweens.Tween;
  defusePulse: Phaser.Tweens.Tween;
  defenseMs: number;
  nextRedrawAt: number;
}

interface AmbientSiteEffect {
  root: Phaser.GameObjects.Container;
  color: number;
  platform: Phaser.GameObjects.Graphics;
  halo: Phaser.GameObjects.Arc;
  statusRing: Phaser.GameObjects.Arc;
  coreLight: Phaser.GameObjects.Arc;
  sweep: Phaser.GameObjects.Graphics;
  rotor: Phaser.GameObjects.Graphics;
  bomb: Phaser.GameObjects.Graphics;
  identifier: Phaser.GameObjects.Text;
  stateReadout: Phaser.GameObjects.Text;
  leftMast: Phaser.GameObjects.Rectangle;
  rightMast: Phaser.GameObjects.Rectangle;
  leftTip: Phaser.GameObjects.Arc;
  rightTip: Phaser.GameObjects.Arc;
  particles: Phaser.GameObjects.Arc[];
  ringPulse: Phaser.Tweens.Tween;
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
    for (const site of this.sites) {
      site.ring.destroy();
      site.label.destroy();
      site.scorch?.destroy();
    }
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

      const ringPulse = scene.tweens.add({
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
      this.createAmbientEffect(`site-${letter}`, p.x, p.y, siteColor, i, letter, ringPulse);
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
      effect.rotor.setScale(1 + Math.sin(now * 0.0028 + effect.phase) * 0.025 + (charged ? 0.045 : 0));
      effect.sweep.rotation = -now * 0.00028 * activitySpeed + effect.phase;
      effect.sweep.setAlpha(destroyed ? 0.08 : (locked ? 0.34 : 0.62) + (charged ? 0.2 : 0));
      effect.bomb.rotation = Math.sin(now * 0.0018 + effect.phase) * 0.08;
      effect.bomb.setY(charged ? -3 + Math.sin(now * 0.0042 + effect.phase) * 2.2 : 0);
      effect.coreLight.setRadius(5 + Math.sin(now * 0.0034 + effect.phase) * 1.2 + proximity * 1.4);
      effect.coreLight.setAlpha(destroyed ? 0.08 : 0.48 + proximity * 0.45);
      effect.statusRing.rotation = now * 0.00022 * activitySpeed + effect.phase;
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
    if (site.state === BombSiteState.Planting) return;
    site.state = BombSiteState.Planting;
    if (this.theme) this.refreshVisuals(this.theme);
    this.emit('bomb-site-plant-started', site);
  }

  cancelPlanting(site: BombSiteRuntime): void {
    if (site.state === BombSiteState.Planting) {
      site.state = BombSiteState.Available;
      if (this.theme) this.refreshVisuals(this.theme);
    }
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
      this.refreshAmbientState(s, siteColor);
    }
  }

  private createAmbientEffect(
    siteId: string,
    x: number,
    y: number,
    color: number,
    index: number,
    letter: string,
    ringPulse: Phaser.Tweens.Tween
  ): void {
    if (!this.scene) return;
    const root = this.scene.add.container(x, y).setDepth(3);
    const platform = this.scene.add.graphics();
    const basePoints = Array.from({ length: 8 }, (_, pointIndex) => {
      const angle = -Math.PI / 8 + pointIndex * Math.PI / 4;
      return { x: Math.cos(angle) * 91, y: Math.sin(angle) * 91 };
    });
    const undersidePoints = basePoints.map((point) => ({ x: point.x + 7, y: point.y + 10 }));
    const insetPoints = basePoints.map((point) => ({ x: point.x * 0.86, y: point.y * 0.86 - 2 }));
    platform.fillStyle(0x000000, 0.46).fillEllipse(8, 13, 205, 76);
    platform.fillStyle(0x01040a, 0.98).fillPoints(undersidePoints, true);
    platform.lineStyle(2, 0x142d3b, 0.78).strokePoints(undersidePoints, true);
    platform.fillStyle(0x0b1722, 1);
    platform.fillPoints(basePoints, true);
    platform.lineStyle(3, color, 0.58);
    platform.strokePoints(basePoints, true);
    platform.fillStyle(0x06101a, 1).fillPoints(insetPoints, true);
    platform.lineStyle(1, 0xc5fbff, 0.24).strokePoints(insetPoints, true);
    platform.lineStyle(1, 0x8deef7, 0.3);
    platform.strokeCircle(0, 0, 72);
    platform.strokeCircle(0, 0, 53);
    platform.lineStyle(2, color, 0.42);
    for (let segment = 0; segment < 8; segment += 1) {
      const angle = segment * Math.PI / 4;
      platform.lineBetween(Math.cos(angle) * 58, Math.sin(angle) * 58, Math.cos(angle) * 84, Math.sin(angle) * 84);
      const next = angle + Math.PI / 4;
      const innerRadius = 62;
      const outerRadius = 83;
      platform.fillStyle(segment % 2 ? 0x102331 : 0x0d1c28, 0.94).fillPoints([
        { x: Math.cos(angle + 0.08) * innerRadius, y: Math.sin(angle + 0.08) * innerRadius },
        { x: Math.cos(next - 0.08) * innerRadius, y: Math.sin(next - 0.08) * innerRadius },
        { x: Math.cos(next - 0.08) * outerRadius, y: Math.sin(next - 0.08) * outerRadius },
        { x: Math.cos(angle + 0.08) * outerRadius, y: Math.sin(angle + 0.08) * outerRadius }
      ], true);
      platform.lineStyle(1, segment % 2 ? color : 0x6b8c9a, segment % 2 ? 0.36 : 0.24);
      platform.lineBetween(Math.cos(angle + 0.08) * innerRadius, Math.sin(angle + 0.08) * innerRadius,
        Math.cos(angle + 0.08) * outerRadius, Math.sin(angle + 0.08) * outerRadius);
    }
    drawMechanicalRivets(platform, Array.from({ length: 8 }, (_, rivetIndex) => {
      const angle = rivetIndex * Math.PI / 4;
      return { x: Math.cos(angle) * 76, y: Math.sin(angle) * 76 };
    }), 0xa6c6d2, 0x010308, 1.6);
    platform.fillStyle(0x02070d, 1).fillCircle(0, 2, 37);
    platform.lineStyle(3, 0x172d3b, 0.92).strokeCircle(0, 2, 37);
    platform.fillStyle(0x07131d, 0.98);
    platform.fillCircle(0, 0, 26);
    platform.lineStyle(2, color, 0.58);
    platform.strokeCircle(0, 0, 26);
    platform.lineStyle(1, 0xd8ffff, 0.28).beginPath();
    platform.arc(0, 0, 87, Math.PI * 1.08, Math.PI * 1.84, false);
    platform.strokePath();

    const halo = this.scene.add.circle(0, 0, 60, color, 0.04).setStrokeStyle(1, color, 0.28);
    const statusRing = this.scene.add.circle(0, 0, 45, color, 0.018).setStrokeStyle(2, color, 0.46);
    const coreLight = this.scene.add.circle(0, 3, 5, color, 0.72).setStrokeStyle(1, 0xffffff, 0.7);

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

    const identifier = this.scene.add.text(0, 29, letter, {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '24px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#02060b',
      strokeThickness: 4
    }).setOrigin(0.5).setAlpha(0.78);
    const stateReadout = this.scene.add.text(0, 52, 'LOCKED', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '10px',
      color: '#728298',
      stroke: '#02060b',
      strokeThickness: 3
    }).setOrigin(0.5).setAlpha(0.9);

    const leftMast = this.scene.add.rectangle(-58, 5, 3, 34, color, 0.9).setOrigin(0.5, 1);
    const rightMast = this.scene.add.rectangle(58, 5, 3, 34, color, 0.9).setOrigin(0.5, 1);
    const leftBase = this.scene.add.circle(-58, 6, 6, 0x07131d, 0.95).setStrokeStyle(2, color, 0.8);
    const rightBase = this.scene.add.circle(58, 6, 6, 0x07131d, 0.95).setStrokeStyle(2, color, 0.8);
    const leftTip = this.scene.add.circle(-58, -29, 4, color, 0.85).setStrokeStyle(1, 0xffffff, 0.8);
    const rightTip = this.scene.add.circle(58, -29, 4, color, 0.85).setStrokeStyle(1, 0xffffff, 0.8);
    const particles = Array.from({ length: 7 }, (_, particleIndex) =>
      this.scene!.add.circle(0, 0, particleIndex % 3 === 0 ? 2.5 : 1.5, color, 0.55)
    );

    root.add([platform, halo, statusRing, sweep, rotor, bomb, coreLight, identifier, stateReadout, leftMast, rightMast, leftBase, rightBase, leftTip, rightTip, ...particles]);
    this.ambientEffects.set(siteId, {
      root, color, platform, halo, statusRing, coreLight, sweep, rotor, bomb, identifier, stateReadout,
      leftMast, rightMast, leftTip, rightTip, particles, ringPulse,
      phase: index * 1.37
    });
  }

  private refreshAmbientState(site: BombSiteRuntime, siteColor: number): void {
    const effect = this.ambientEffects.get(site.id);
    if (!effect) return;
    let color = siteColor;
    let state = 'AVAILABLE';
    let alpha = 1;
    if (site.state === BombSiteState.Locked) {
      color = 0x53617a;
      state = 'LOCKED';
      alpha = 0.62;
    } else if (site.state === BombSiteState.Planting) {
      state = 'LINKING';
    } else if (site.state === BombSiteState.Armed) {
      state = 'DEFEND';
    } else if (site.state === BombSiteState.BeingDefused) {
      color = 0xff4f6d;
      state = 'DEFUSE ALERT';
    } else if (site.state === BombSiteState.Destroyed) {
      color = 0x4c5362;
      state = 'OFFLINE';
      alpha = 0.3;
    }
    const css = `#${color.toString(16).padStart(6, '0')}`;
    effect.statusRing.setStrokeStyle(site.state === BombSiteState.BeingDefused ? 4 : 2, color, 0.72).setFillStyle(color, 0.025);
    effect.coreLight.setFillStyle(color, 0.82).setStrokeStyle(1, 0xffffff, 0.6);
    effect.identifier.setColor(css).setAlpha(alpha);
    effect.stateReadout.setText(state).setColor(css).setAlpha(alpha);
    this.setDefuseWarningVisible(site.id, site.state === BombSiteState.BeingDefused);
    if (site.state === BombSiteState.Destroyed) {
      effect.ringPulse.pause();
      site.ring.setAlpha(0.34);
    } else {
      effect.ringPulse.resume();
    }
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

    // One reusable, pre-drawn hazard perimeter per armed site. It is only
    // animated while this exact site is actively being defused.
    const defuseBoundary = this.scene.add.graphics()
      .setPosition(site.x, site.y)
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    const stripeCount = 24;
    for (let index = 0; index < stripeCount; index += 1) {
      const start = index * Math.PI * 2 / stripeCount;
      const end = start + Math.PI * 2 / stripeCount * 0.62;
      const color = index % 2 === 0 ? 0xffbe32 : 0xff3158;
      defuseBoundary.lineStyle(index % 2 === 0 ? 5 : 4, color, 0.96);
      defuseBoundary.beginPath();
      defuseBoundary.arc(0, 0, 98, start, end, false);
      defuseBoundary.strokePath();
      defuseBoundary.lineStyle(3, color, 0.76);
      defuseBoundary.lineBetween(
        Math.cos(start) * 105,
        Math.sin(start) * 105,
        Math.cos(start) * 115,
        Math.sin(start) * 115
      );
    }
    const defuseGlow = this.scene.add.circle(site.x, site.y, 108, 0xff4b32, 0.045)
      .setStrokeStyle(2, 0xffc93b, 0.7)
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    const defuseLabel = this.scene.add.text(site.x, site.y - 129, '!  DEFUSE IN PROGRESS  !', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffd65c',
      stroke: '#4a0711',
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(9).setVisible(false);

    const pulse = this.scene.tweens.add({
      targets: [shieldGlow, shield, guardLabel],
      alpha: { from: 0.58, to: 1 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const defusePulse = this.scene.tweens.add({
      targets: [defuseBoundary, defuseGlow, defuseLabel],
      alpha: { from: 0.5, to: 1 },
      duration: 330,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      paused: true
    });

    this.armedEffects.set(site.id, {
      electricity, shield, shieldGlow, guardLabel, defuseBoundary, defuseGlow, defuseLabel,
      pulse, defusePulse, defenseMs, nextRedrawAt: 0
    });
    this.updateArmedEffect(site);
  }

  private updateArmedEffect(site: BombSiteRuntime): void {
    const effect = this.armedEffects.get(site.id);
    if (!effect || !this.theme) return;
    const now = this.scene?.time.now ?? 0;
    const charge = Phaser.Math.Clamp(1 - site.timerMs / effect.defenseMs, 0, 1);
    effect.shieldGlow.setRadius(29 + charge * 5);
    if (site.state === BombSiteState.BeingDefused) {
      effect.defuseBoundary.rotation = now * 0.00115;
      effect.defuseGlow.setRadius(106 + Math.sin(now * 0.008) * 4);
    }
    if (now < effect.nextRedrawAt) return;
    effect.nextRedrawAt = now + 50;
    const segments = Math.round(10 + charge * 34);
    const radius = 82 + charge * 7;
    const arcLength = Phaser.Math.Linear(0.08, 0.17, charge);
    const tick = Math.floor(now / 50);
    const noise = (index: number, salt: number): number => {
      const value = Math.sin((tick + 1) * 12.9898 + (index + 1) * 78.233 + salt * 17.17) * 43758.5453;
      return value - Math.floor(value);
    };
    const flicker = 0.72 + noise(0, site.x + site.y) * 0.28;

    effect.electricity.clear();
    const siteColor = site.state === BombSiteState.BeingDefused
      ? 0xff4f67
      : this.ambientEffects.get(site.id)?.color ?? this.theme.primary;
    effect.electricity.lineStyle(1 + charge * 2.2, siteColor, (0.34 + charge * 0.52) * flicker);
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2 + noise(i, 1) * 0.06;
      const nextAngle = angle + arcLength + noise(i, 2) * 0.05;
      const jitter = 2 + charge * 7;
      const r1 = radius + (noise(i, 3) * 2 - 1) * jitter;
      const r2 = radius + (noise(i, 4) * 2 - 1) * jitter;
      effect.electricity.beginPath();
      effect.electricity.moveTo(site.x + Math.cos(angle) * r1, site.y + Math.sin(angle) * r1);
      effect.electricity.lineTo(
        site.x + Math.cos((angle + nextAngle) * 0.5) * (radius + (noise(i, 5) * 2 - 1) * jitter),
        site.y + Math.sin((angle + nextAngle) * 0.5) * (radius + (noise(i, 6) * 2 - 1) * jitter)
      );
      effect.electricity.lineTo(site.x + Math.cos(nextAngle) * r2, site.y + Math.sin(nextAngle) * r2);
      effect.electricity.strokePath();
    }

    effect.electricity.lineStyle(1, this.theme.secondary, 0.22 + charge * 0.5);
    effect.electricity.strokeCircle(site.x, site.y, radius + 6 + Math.sin(now / 180) * 2);
  }

  private setDefuseWarningVisible(siteId: string, visible: boolean): void {
    const effect = this.armedEffects.get(siteId);
    if (!effect) return;
    effect.defuseBoundary.setVisible(visible);
    effect.defuseGlow.setVisible(visible);
    effect.defuseLabel.setVisible(visible);
    if (visible) {
      effect.defusePulse.resume();
    } else {
      effect.defusePulse.pause();
      effect.defuseBoundary.setAlpha(1).setRotation(0);
      effect.defuseGlow.setAlpha(1);
      effect.defuseLabel.setAlpha(1);
    }
  }

  private destroyArmedEffect(siteId: string): void {
    const effect = this.armedEffects.get(siteId);
    if (!effect) return;
    effect.pulse.remove();
    effect.defusePulse.remove();
    effect.electricity.destroy();
    effect.shield.destroy();
    effect.shieldGlow.destroy();
    effect.guardLabel.destroy();
    effect.defuseBoundary.destroy();
    effect.defuseGlow.destroy();
    effect.defuseLabel.destroy();
    this.armedEffects.delete(siteId);
  }

  private destroyArmedEffects(): void {
    for (const siteId of Array.from(this.armedEffects.keys())) this.destroyArmedEffect(siteId);
  }

  private destroyAmbientEffects(): void {
    for (const effect of this.ambientEffects.values()) {
      effect.ringPulse.remove();
      effect.root.destroy(true);
    }
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
