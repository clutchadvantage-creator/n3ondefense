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

export class BombSiteManager extends Phaser.Events.EventEmitter {
  readonly sites: BombSiteRuntime[] = [];
  private readonly mode: ObjectiveMode;
  private readonly maxActiveBombs: number;
  private scene: Phaser.Scene | null = null;
  private theme: ArenaTheme | null = null;
  private readonly armedEffects = new Map<string, ArmedSiteEffect>();

  constructor(mode: ObjectiveMode, maxActiveBombs: number) {
    super();
    this.mode = mode;
    this.maxActiveBombs = maxActiveBombs;
  }

  initialize(scene: Phaser.Scene, positions: Phaser.Math.Vector2[], theme: ArenaTheme): void {
    this.scene = scene;
    this.theme = theme;
    this.destroyArmedEffects();
    this.sites.length = 0;

    for (let i = 0; i < positions.length; i += 1) {
      const p = positions[i];
      const letter = String.fromCharCode(65 + i);
      const ring = scene.add.circle(p.x, p.y, 80, 0x000000, 0.08).setStrokeStyle(3, theme.primary, 0.9).setDepth(2);
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
    }

    if (this.mode === 'open') {
      for (const site of this.sites) site.state = BombSiteState.Available;
    } else if (this.sites.length > 0) {
      this.sites[0].state = BombSiteState.Available;
    }

    this.refreshVisuals(theme);
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

  tickActive(delta: number): BombSiteRuntime | null {
    for (const site of this.sites) {
      if (site.state === BombSiteState.Armed || site.state === BombSiteState.BeingDefused) {
        site.timerMs = Math.max(0, site.timerMs - delta);
        if (site.state === BombSiteState.Armed) site.defuseMs = Math.max(0, site.defuseMs - delta * 0.35);
        this.updateArmedEffect(site);
        if (site.timerMs <= 0) return site;
      }
    }
    return null;
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

    if (this.sites.every((s) => s.state === BombSiteState.Destroyed)) {
      this.emit('all-bomb-sites-destroyed');
    }
  }

  getActiveBombSite(): BombSiteRuntime | null {
    return this.sites.find((s) => s.state === BombSiteState.Armed || s.state === BombSiteState.BeingDefused) ?? null;
  }

  getRemainingSites(): BombSiteRuntime[] {
    return this.sites.filter((s) => s.state !== BombSiteState.Destroyed);
  }

  destroyedCount(): number {
    return this.sites.filter((s) => s.state === BombSiteState.Destroyed).length;
  }

  refreshVisuals(theme: ArenaTheme): void {
    for (const s of this.sites) {
      if (s.state === BombSiteState.Available) {
        s.ring.setStrokeStyle(3, theme.primary, 0.95);
        s.label.setText(`Site ${s.letter} [AVAILABLE]`).setColor('#d6fbff');
      } else if (s.state === BombSiteState.Locked) {
        s.ring.setStrokeStyle(3, 0x3a4563, 0.65);
        s.label.setText(`Site ${s.letter} [LOCKED]`).setColor('#6f7c98');
      } else if (s.state === BombSiteState.Planting) {
        s.ring.setStrokeStyle(3, theme.secondary, 1);
        s.label.setText(`Site ${s.letter} [PLANTING]`).setColor('#fff0cf');
      } else if (s.state === BombSiteState.Armed || s.state === BombSiteState.BeingDefused) {
        s.ring.setStrokeStyle(3, 0xff5e75, 1);
        s.label.setText(`Site ${s.letter} [ARMED]`).setColor('#ffd6dc');
      } else if (s.state === BombSiteState.Destroyed) {
        s.label.setText(`Site ${s.letter} [DESTROYED]`).setColor('#737a8a');
      }
    }
  }

  private createArmedEffect(site: BombSiteRuntime, defenseMs: number): void {
    if (!this.scene || !this.theme) return;
    this.destroyArmedEffect(site.id);

    const electricity = this.scene.add.graphics().setDepth(5);
    const shieldGlow = this.scene.add.circle(site.x, site.y, 29, this.theme.primary, 0.1)
      .setStrokeStyle(1, this.theme.primary, 0.45)
      .setDepth(5);
    const shield = this.scene.add.graphics().setDepth(6);
    shield.lineStyle(4, 0xffffff, 0.92);
    shield.fillStyle(this.theme.primary, 0.13);
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
    effect.electricity.lineStyle(1 + charge * 2.2, this.theme.primary, (0.34 + charge * 0.52) * flicker);
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

  destroy(): void {
    this.destroyArmedEffects();
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
