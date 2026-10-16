import Phaser from 'phaser';
import type { Enemy } from '../../enemies/Enemy.ts';
import { Turret } from '../../abilities/Turret.ts';
import { MechanicalDestructionVfx, type MechanicalCirclePool } from '../../vfx/MechanicalDestructionVfx.ts';
import { HEIST_SENTRY_DEPLOY_MS, HeistSentryState, insideSentryRoom, type HeistSentryRoomPlan } from './HeistSentryPlan.ts';

interface RoomRuntime {
  plan: HeistSentryRoomPlan;
  state: HeistSentryState;
  hatch: Phaser.GameObjects.Rectangle;
  collar: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  turret: Turret;
  enemy: Enemy | null;
  destroyedAt: number;
  breakupPlayed: boolean;
}

/** Three fixed room records; one scene-clock update and a shared debris pool.
 * Enemy entities still use the scene's ordinary targeting and damage pipeline. */
export class HeistSentryRooms {
  readonly rooms: RoomRuntime[];
  private clock = 0;
  private nextLightDraw = 0;
  private readonly lights: Phaser.GameObjects.Graphics;
  private readonly destruction: MechanicalDestructionVfx;
  private readonly byEnemy = new Map<Enemy, RoomRuntime>();
  private readonly spawn: (x: number, y: number) => Enemy | null;
  private readonly reward: (x: number, y: number) => void;
  private readonly sound: () => void;

  constructor(scene: Phaser.Scene, plans: readonly HeistSentryRoomPlan[], hp: number, circles: MechanicalCirclePool,
    particles: boolean, spawn: (x: number, y: number) => Enemy | null,
    reward: (x: number, y: number) => void, sound: () => void) {
    this.spawn = spawn; this.reward = reward; this.sound = sound;
    this.lights = scene.add.graphics().setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.destruction = new MechanicalDestructionVfx(scene, circles, particles);
    this.destruction.prewarm(particles ? 64 : 0);
    this.rooms = plans.map(plan => {
      const { x, y } = plan.sentry;
      scene.add.rectangle(x + 4, y + 9, 76, 60, 0x01050a, .85).setDepth(3);
      scene.add.rectangle(x, y, 72, 58, 0x102330).setStrokeStyle(2, 0x748b96, .7).setDepth(3.1);
      const collar = scene.add.ellipse(x, y + 5, 60, 40, 0x02060b).setStrokeStyle(2, 0xff5575, .4).setDepth(3.2);
      const hatch = scene.add.rectangle(x, y, 58, 44, 0x183343).setStrokeStyle(2, 0x6dc8d5, .6).setDepth(4);
      const label = scene.add.text(x, y + 43, 'SECURITY // STANDBY', { fontFamily: 'monospace', fontSize: '10px', color: '#8ba5b2' })
        .setOrigin(.5).setDepth(4);
      const turret = new Turret(scene, x, y, 0xff5575, hp, 0, 1, 360);
      turret.sprite.setVisible(false).setScale(1.65).setDepth(7);
      return { plan, state: new HeistSentryState(), hatch, collar, label, turret, enemy: null, destroyedAt: 0, breakupPlayed: false };
    });
  }

  damageAt(x: number, y: number): void {
    for (const room of this.rooms) if (insideSentryRoom(room.plan, x, y) && room.state.trigger()) {
      room.label.setText('SECURITY // DEPLOYING').setColor('#ff657e');
      this.nextLightDraw = 0;
    }
  }

  owns(enemy: Enemy): boolean { return this.byEnemy.has(enemy); }

  aim(enemy: Enemy, angle: number): void {
    const room = this.byEnemy.get(enemy);
    if (!room) return;
    room.turret.aimAt(angle);
    room.turret.hp = enemy.hp;
    room.turret.updateVisual();
  }

  killed(enemy: Enemy): boolean {
    const room = this.byEnemy.get(enemy);
    if (!room || !room.state.destroy()) return false;
    const { x, y } = room.plan.sentry;
    room.destroyedAt = this.clock;
    room.label.setText('SECURITY // OFFLINE').setColor('#a18a94');
    this.destruction.emitEnemy('tank', x, y, 0x89faff, this.clock);
    this.destruction.emitBossStage('artillery', x, y, 0xff5575, this.clock);
    this.reward(x, y);
    this.sound();
    this.nextLightDraw = 0;
    return true;
  }

  update(deltaMs: number): void {
    if (deltaMs <= 0) return;
    this.clock += deltaMs;
    for (const room of this.rooms) {
      if (room.state.phase === 'deploying') {
        const ready = room.state.advance(deltaMs);
        const t = Math.min(1, room.state.elapsedMs / HEIST_SENTRY_DEPLOY_MS);
        const rise = Math.max(0, (t - .22) / .78);
        room.hatch.setScale(1, Math.max(.05, 1 - t * 2.5)).setAlpha(1 - t);
        room.turret.sprite.setVisible(true).setPosition(room.plan.sentry.x, room.plan.sentry.y + 20 * (1 - rise))
          .setScale(1.65, 1.65 * (.15 + .85 * rise)).setAlpha(rise);
        if (ready) {
          room.enemy = this.spawn(room.plan.sentry.x, room.plan.sentry.y);
          if (room.enemy) { this.byEnemy.set(room.enemy, room); room.label.setText('SECURITY // ACTIVE'); }
          else { room.state.phase = 'deploying'; room.state.elapsedMs = 0; }
        }
      }
      if (room.state.phase === 'destroyed') {
        const age = this.clock - room.destroyedAt;
        const t = Math.min(1, age / 460);
        if (room.turret.sprite.visible) room.turret.sprite.setScale(1.65, 1.65 * (1 - t * .8)).setRotation(t * .38)
          .setPosition(room.plan.sentry.x + t * 7, room.plan.sentry.y + t * 13).setAlpha(1 - t);
        if (t === 1 && room.turret.sprite.visible) {
          room.turret.sprite.setVisible(false); room.collar.setStrokeStyle(2, 0x553841, .7);
        }
        if (age >= 120 && !room.breakupPlayed) {
          room.breakupPlayed = true;
          this.destruction.emitBossStage('artillery', room.plan.sentry.x, room.plan.sentry.y, 0xffad60, this.clock, true);
        }
      }
    }
    this.destruction.update(this.clock, deltaMs);
    if (this.clock < this.nextLightDraw) return;
    this.nextLightDraw = this.clock + 90;
    this.lights.clear();
    for (const room of this.rooms) {
      if (room.state.phase !== 'deploying' && room.state.phase !== 'active') continue;
      const b = room.plan.bounds, on = Math.floor(this.clock / 180) % 2 === 0;
      this.lights.fillStyle(0xff254f, on ? .065 : .012).fillRect(b.x, b.y, b.w, b.h);
      this.lights.fillStyle(0xff3154, on ? .95 : .16);
      for (const x of [b.x + 24, b.x + b.w - 24]) for (const y of [b.y + 18, b.y + b.h - 18]) {
        this.lights.fillRect(x - 9, y - 3, 18, 6);
      }
    }
  }

  discardReferences(): void {
    this.destruction.discardReferences(); this.byEnemy.clear(); this.rooms.length = 0;
  }
}
