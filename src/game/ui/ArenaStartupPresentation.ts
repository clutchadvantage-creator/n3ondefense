import Phaser from 'phaser';
import type { Player } from '../entities/Player.ts';
import type { Hud } from '../systems/Hud.ts';
import type { BombSiteManager } from '../systems/BombSiteManager.ts';

export type ArenaStartupPresentationKind = 'deployment' | 'round';

export interface ArenaStartupPresentationStats {
  kind: ArenaStartupPresentationKind;
  durationMs: number;
  completed: boolean;
}

/**
 * Presentation-only child of the authoritative RoundRuntimeLifecycle starting
 * phase. It owns no gameplay timers and cannot activate a round by itself.
 */
export class ArenaStartupPresentation {
  private readonly durationMs: number;
  private readonly startedAt: number;
  private readonly veil: Phaser.GameObjects.Rectangle;
  private readonly rails: Phaser.GameObjects.Graphics;
  private readonly operativeRing: Phaser.GameObjects.Arc;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private completed = false;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly kind: ArenaStartupPresentationKind,
    private readonly player: Player,
    private readonly hud: Hud,
    private readonly bombSites: BombSiteManager | null,
    private readonly onComplete: () => void
  ) {
    this.durationMs = kind === 'deployment' ? 1_350 : 420;
    this.startedAt = scene.time.now;
    const { width, height } = scene.scale;
    this.veil = scene.add.rectangle(width * 0.5, height * 0.5, width + 8, height + 8, 0x02050b, 1)
      .setScrollFactor(0).setDepth(930);
    this.rails = scene.add.graphics().setScrollFactor(0).setDepth(940);
    this.operativeRing = scene.add.circle(player.x, player.y, 16, 0x5ef6ff, 0.08)
      .setStrokeStyle(3, 0x5ef6ff, 0.92).setDepth(24);
    this.title = scene.add.text(width * 0.5, height * 0.46, kind === 'deployment' ? 'ARENA SYSTEMS ONLINE' : 'NEXT ROUND', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: kind === 'deployment' ? '34px' : '28px',
      color: '#7ef9ff',
      stroke: '#06101c',
      strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1_180);
    this.subtitle = scene.add.text(width * 0.5, height * 0.46 + 42, kind === 'deployment'
      ? 'TACTICAL GRID // POWERING COMBAT SYSTEMS'
      : 'TACTICAL GRID RECALIBRATED', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '18px',
      color: '#d4f9ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1_180);
    player.setAlpha(0);
    hud.setStartupPresentationProgress(0);
    bombSites?.setStartupPresentationProgress(0);
  }

  update(now: number): void {
    if (this.destroyed || this.completed) return;
    const raw = Phaser.Math.Clamp((now - this.startedAt) / this.durationMs, 0, 1);
    const power = this.kind === 'deployment'
      ? Phaser.Math.Clamp((raw - 0.06) / 0.72, 0, 1)
      : Phaser.Math.Clamp(raw / 0.72, 0, 1);
    const eased = 1 - (1 - power) ** 3;
    const flicker = raw < 0.38 && Math.floor(raw * 42) % 5 === 0 ? 0.12 : 0;

    this.veil.setAlpha(Math.max(0, 1 - eased * 1.08) + flicker);
    this.player.setAlpha(Phaser.Math.Clamp((raw - 0.42) / 0.3, 0, 1));
    this.operativeRing.setPosition(this.player.x, this.player.y)
      .setRadius(16 + eased * 58)
      .setScale(1 + Math.sin(now * 0.018) * 0.04)
      .setAlpha(raw < 0.42 ? 0 : Math.max(0, 1 - raw));
    this.hud.setStartupPresentationProgress(Phaser.Math.Clamp((raw - 0.28) / 0.45, 0, 1));
    this.bombSites?.setStartupPresentationProgress(Phaser.Math.Clamp((raw - 0.16) / 0.46, 0, 1));
    this.title.setAlpha(raw < 0.12 ? raw / 0.12 : raw > 0.78 ? (1 - raw) / 0.22 : 1);
    this.subtitle.setAlpha(this.title.alpha * 0.82);
    this.drawRails(raw, now);

    if (raw >= 1) this.finish();
  }

  stats(): ArenaStartupPresentationStats {
    return { kind: this.kind, durationMs: this.durationMs, completed: this.completed };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.restoreTargets();
    this.veil.destroy();
    this.rails.destroy();
    this.operativeRing.destroy();
    this.title.destroy();
    this.subtitle.destroy();
  }

  private finish(): void {
    if (this.completed || this.destroyed) return;
    this.completed = true;
    this.restoreTargets();
    this.veil.destroy();
    this.rails.destroy();
    this.operativeRing.destroy();
    this.title.destroy();
    this.subtitle.destroy();
    this.onComplete();
  }

  private restoreTargets(): void {
    if (this.player.active) this.player.setAlpha(1);
    this.hud.finishStartupPresentation();
    this.bombSites?.finishStartupPresentation();
  }

  private drawRails(progress: number, now: number): void {
    const { width, height } = this.scene.scale;
    const sweep = Phaser.Math.Clamp((progress - 0.08) / 0.64, 0, 1);
    const pulse = 0.45 + Math.sin(now * 0.014) * 0.14;
    this.rails.clear();
    this.rails.lineStyle(2, 0x55efff, Math.max(0, (1 - progress) * pulse));
    this.rails.strokeRect(18, 18, width - 36, height - 36);
    this.rails.lineStyle(1, 0xff50d8, Math.max(0, (1 - progress) * 0.38));
    const y = 24 + (height - 48) * sweep;
    this.rails.lineBetween(30, y, width - 30, y);
    for (let index = 0; index < 5; index += 1) {
      const x = 30 + (width - 60) * (index / 4);
      this.rails.fillStyle(index % 2 ? 0xff50d8 : 0x55efff, Math.max(0, 0.6 - progress * 0.45));
      this.rails.fillRect(x - 2, y - 5, 4, 10);
    }
  }
}
