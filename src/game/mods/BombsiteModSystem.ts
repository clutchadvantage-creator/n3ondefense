import Phaser from 'phaser';
import type { Enemy } from '../enemies/Enemy.ts';
import type { Player } from '../entities/Player.ts';
import type { BombSiteRuntime } from '../types.ts';
import { BombSiteState } from '../types.ts';
import { GameplayTelemetryRecorder } from '../telemetry/GameplayTelemetryRecorder.ts';
import { BombsiteTotemVfx, type BombsiteTotemEffectKind } from '../vfx/BombsiteTotemVfx.ts';
import { MOD_BALANCE } from './modBalance.ts';
import type { ModRuntime } from './ModRuntime.ts';
import {
  advanceKillSwitch,
  countdownStagesCrossed,
  defuseCrossesThreshold,
  isInsideBombsiteField,
  segmentIntersectsBombsiteField
} from './BombsiteModRules.ts';

type EffectCue = 'electric' | 'warning' | 'heavy' | 'gravity';

export interface BombsiteModCallbacks {
  reduceCountdown(site: BombSiteRuntime, amountMs: number): number;
  interruptDefuse(site: BombSiteRuntime): void;
  damagePlayer(amount: number): boolean;
  announce(message: string): void;
  playCue(cue: EffectCue): void;
}

export interface BombsiteDefuseResolution {
  activeDefusers: number;
  interrupted: boolean;
  requestedProgressMs: number;
}

interface FieldVisual {
  ring: Phaser.GameObjects.Arc;
  markings: Phaser.GameObjects.Graphics;
  pulse: Phaser.Tweens.Tween;
}

interface ExposureState {
  stacks: number;
  nextTickAt: number;
  lastSeenAt: number;
}

interface PullState {
  site: BombSiteRuntime;
  until: number;
  speed: number;
}

interface ActiveSiteState {
  site: BombSiteRuntime;
  defenseMs: number;
  previousTimerMs: number;
  nextArcAt: number;
  arcChargingFor: number;
  nextUnstableWarningAt: number;
  unstablePulseAt: number;
  nextGravityWarningAt: number;
  gravityPulseAt: number;
  countermeasures: number;
  groundZeroUsed: boolean;
  groundChargedUntil: number;
  nextGroundTickAt: number;
  nextHotVisualAt: number;
  killSwitchKills: number;
  secondSunStages: Set<number>;
  activeDefusers: Set<Enemy>;
  visual: FieldVisual | null;
}

const TOTEM_VISUAL_MODS = [
  'arc-surge', 'defuse-feedback', 'pressure-field', 'combat-uplink', 'countermeasure-array', 'kill-switch', 'hot-zone',
  'final-countdown', 'capacitor-field', 'sentry-uplink', 'munitions-relay', 'emergency-shielding',
  'danger-close', 'unstable-reactor', 'blood-beacon', 'ground-zero', 'event-horizon-array', 'second-sun'
] as const;

/**
 * Shared lifecycle and query layer for objective-centric Mods. ArenaScene owns
 * combat entities; this system owns per-planted-bomb state, field checks, trigger
 * cadence, and temporary presentation. No state survives destroy().
 */
export class BombsiteModSystem {
  private readonly stateBySite = new Map<string, ActiveSiteState>();
  private readonly exposures = new Map<Enemy, ExposureState>();
  private readonly pulls = new Map<Enemy, PullState>();
  private readonly temporaryObjects = new Set<Phaser.GameObjects.GameObject>();
  private readonly totems: BombsiteTotemVfx;
  private nextFieldScanAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runtime: ModRuntime,
    private readonly callbacks: BombsiteModCallbacks
  ) {
    this.totems = new BombsiteTotemVfx(scene);
  }

  onBombArmed(site: BombSiteRuntime, defenseMs: number, now: number): void {
    this.onBombDestroyed(site);
    const countermeasureRank = this.runtime.rank('countermeasure-array');
    const state: ActiveSiteState = {
      site,
      defenseMs,
      previousTimerMs: defenseMs,
      nextArcAt: now + MOD_BALANCE.bombsite.arcSurge.intervalMs[this.runtime.rank('arc-surge')],
      arcChargingFor: 0,
      nextUnstableWarningAt: now + MOD_BALANCE.bombsite.unstableReactor.intervalMs[this.runtime.rank('unstable-reactor')],
      unstablePulseAt: 0,
      nextGravityWarningAt: now + MOD_BALANCE.bombsite.eventHorizon.intervalMs[this.runtime.rank('event-horizon-array')],
      gravityPulseAt: 0,
      countermeasures: this.runtime.has('countermeasure-array')
        ? MOD_BALANCE.bombsite.countermeasureArray.charges[countermeasureRank]
        : 0,
      groundZeroUsed: false,
      groundChargedUntil: 0,
      nextGroundTickAt: 0,
      nextHotVisualAt: 0,
      killSwitchKills: 0,
      secondSunStages: new Set<number>(),
      activeDefusers: new Set<Enemy>(),
      visual: this.shouldShowField() ? this.createFieldVisual(site) : null
    };
    this.stateBySite.set(site.id, state);
    if (state.visual) this.totems.deploy(site.id, site.x, site.y, now);
  }

  onBombDestroyed(site: BombSiteRuntime): void {
    const state = this.stateBySite.get(site.id);
    if (!state) return;
    this.totems.remove(site.id);
    this.destroyFieldVisual(state.visual);
    state.activeDefusers.clear();
    this.stateBySite.delete(site.id);
    for (const [enemy, pull] of this.pulls) if (pull.site.id === site.id) this.pulls.delete(enemy);
  }

  /** Starts the visual overload while ArenaScene's bomb detonation stays authoritative. */
  onBombDetonationStarted(site: BombSiteRuntime, now: number): void {
    if (this.stateBySite.has(site.id)) this.totems.beginResolve(site.id, now);
  }

  update(now: number, deltaMs: number, activeSites: BombSiteRuntime[], enemies: Enemy[], player: Player): void {
    this.totems.update(now);
    if (activeSites.length === 0) {
      this.exposures.clear();
      this.pulls.clear();
      return;
    }

    const weaponDamage = Math.max(1, player.weapon.damage * player.damageMultiplier);
    for (const site of activeSites) {
      const state = this.stateBySite.get(site.id);
      if (!state) continue;
      this.updateFieldVisual(state, now);
      this.updateArcSurge(state, now, enemies, weaponDamage);
      this.updateUnstableReactor(state, now, enemies, player, weaponDamage);
      this.updateEventHorizon(state, now, enemies);
      this.updateSecondSun(state, now, enemies, weaponDamage);
      this.updateGroundCharge(state, now, enemies, weaponDamage);
      state.previousTimerMs = site.timerMs;
    }

    if (now >= this.nextFieldScanAt) {
      this.nextFieldScanAt = now + MOD_BALANCE.bombsite.fieldScanIntervalMs;
      this.updateFieldStatuses(now, activeSites, enemies, weaponDamage);
    }
    this.applyGravityPulls(now);

    // Keep the argument explicit for future deterministic cadence work and to
    // document that the system advances using ArenaScene's authoritative clock.
    void deltaMs;
  }

  processDefuse(
    site: BombSiteRuntime,
    defusers: readonly Enemy[],
    baseProgressMs: number,
    requiredProgressMs: number,
    now: number,
    weaponDamage: number,
    allEnemies: readonly Enemy[] = defusers,
    progressBlocked = false
  ): BombsiteDefuseResolution {
    const state = this.stateBySite.get(site.id);
    if (!state) {
      const cooperationMultiplier = 1 + Math.min(0.75, Math.max(0, defusers.length - 1) * 0.25);
      return { activeDefusers: defusers.length, interrupted: false, requestedProgressMs: baseProgressMs * cooperationMultiplier };
    }

    const current = new Set(defusers.filter((enemy) => enemy.active && !enemy.isDead()));
    if (this.runtime.has('defuse-feedback')) {
      const rank = this.runtime.rank('defuse-feedback');
      for (const enemy of current) {
        if (state.activeDefusers.has(enemy)) continue;
        const damage = weaponDamage * MOD_BALANCE.bombsite.defuseFeedback.weaponDamageMultiplier[rank];
        const applied = enemy.takeDamage(damage, 'bombSite');
        if (applied > 0) {
          GameplayTelemetryRecorder.recordModEffect('defuse-feedback', 'damage', applied);
          this.totems.flash(site.id, 0x7dfff2, now, 'electric');
          this.drawElectricArc(site.x, site.y, enemy.x, enemy.y, 0x7dfff2);
          this.callbacks.playCue('electric');
        }
        const staggerMs = MOD_BALANCE.bombsite.defuseFeedback.staggerMs[rank];
        if (staggerMs > 0 && !enemy.isDead()) enemy.defuseInterruptedUntil = Math.max(enemy.defuseInterruptedUntil, now + staggerMs);
      }
    }
    state.activeDefusers.clear();
    for (const enemy of current) state.activeDefusers.add(enemy);

    const eligible = Array.from(current).filter((enemy) => !enemy.isDead() && now >= enemy.defuseInterruptedUntil);
    if (eligible.length === 0) return { activeDefusers: 0, interrupted: false, requestedProgressMs: 0 };

    const cooperationMultiplier = 1 + Math.min(0.75, (eligible.length - 1) * 0.25);
    const requestedProgressMs = baseProgressMs * cooperationMultiplier;
    const thresholdProgressMs = progressBlocked ? 0 : requestedProgressMs;

    if (this.runtime.has('countermeasure-array')
      && state.countermeasures > 0
      && defuseCrossesThreshold(site.defuseMs, thresholdProgressMs, requiredProgressMs, MOD_BALANCE.bombsite.countermeasureArray.threshold)) {
      state.countermeasures -= 1;
      const rank = this.runtime.rank('countermeasure-array');
      this.callbacks.interruptDefuse(site);
      this.applyShockwave(
        site,
        allEnemies,
        MOD_BALANCE.bombsite.countermeasureArray.radius,
        MOD_BALANCE.bombsite.countermeasureArray.knockbackSpeed[rank],
        MOD_BALANCE.bombsite.countermeasureArray.staggerMs,
        0,
        'countermeasure-array'
      );
      this.callbacks.announce(`COUNTERMEASURE ARRAY // ${state.countermeasures} REMAINING`);
      this.callbacks.playCue('warning');
      return { activeDefusers: 0, interrupted: true, requestedProgressMs };
    }

    if (this.runtime.has('ground-zero')
      && !state.groundZeroUsed
      && defuseCrossesThreshold(site.defuseMs, thresholdProgressMs, requiredProgressMs, MOD_BALANCE.bombsite.groundZero.threshold)) {
      state.groundZeroUsed = true;
      const rank = this.runtime.rank('ground-zero');
      state.groundChargedUntil = now + MOD_BALANCE.bombsite.groundZero.chargedDurationMs[rank];
      state.nextGroundTickAt = now + MOD_BALANCE.bombsite.groundZero.chargedTickMs;
      this.callbacks.interruptDefuse(site);
      this.applyShockwave(
        site,
        allEnemies,
        MOD_BALANCE.bombsite.groundZero.radius,
        MOD_BALANCE.bombsite.groundZero.knockbackSpeed[rank],
        MOD_BALANCE.bombsite.groundZero.staggerMs[rank],
        weaponDamage * MOD_BALANCE.bombsite.groundZero.weaponDamageMultiplier[rank],
        'ground-zero'
      );
      this.callbacks.announce('GROUND ZERO');
      this.callbacks.playCue('heavy');
      return { activeDefusers: 0, interrupted: true, requestedProgressMs };
    }

    return { activeDefusers: eligible.length, interrupted: false, requestedProgressMs };
  }

  onEnemyKilled(x: number, y: number): number {
    const state = this.findFieldState(x, y);
    if (!state) return 1;

    if (this.runtime.has('kill-switch')) {
      const rank = this.runtime.rank('kill-switch');
      const result = advanceKillSwitch(
        state.killSwitchKills,
        1,
        MOD_BALANCE.bombsite.killSwitch.killsRequired[rank]
      );
      state.killSwitchKills = result.remainingKills;
      if (result.triggers > 0) {
        const requested = MOD_BALANCE.bombsite.killSwitch.countdownReductionMs[rank] * result.triggers;
        const removed = this.callbacks.reduceCountdown(state.site, requested);
        if (removed > 0) {
          GameplayTelemetryRecorder.recordModEffect('kill-switch', 'countdownMs', removed);
          this.showPulse(state.site, 0xffcf58, 120, 280, 'support');
        }
      }
    }

    let multiplier = 1;
    if (this.runtime.has('danger-close')) {
      multiplier *= MOD_BALANCE.bombsite.dangerClose.creditMultiplier[this.runtime.rank('danger-close')];
    }
    if (this.runtime.has('blood-beacon')) {
      multiplier *= MOD_BALANCE.bombsite.bloodBeacon.creditMultiplier[this.runtime.rank('blood-beacon')];
    }
    return multiplier;
  }

  recordBonusCredits(amount: number): void {
    if (amount > 0) GameplayTelemetryRecorder.recordModEffect('bombsite-economy', 'credits', amount);
  }

  countermeasureCharges(site: BombSiteRuntime | null): number | null {
    if (!site || !this.runtime.has('countermeasure-array')) return null;
    return this.stateBySite.get(site.id)?.countermeasures ?? null;
  }

  spawnCadenceMultiplier(): number {
    if (!this.runtime.has('critical-mass-charge')) return 1;
    return MOD_BALANCE.bombsite.criticalMass.spawnCadenceMultiplier[this.runtime.rank('critical-mass-charge')];
  }

  objectiveAssigneeBonus(): number {
    if (!this.runtime.has('blood-beacon')) return 0;
    return MOD_BALANCE.bombsite.bloodBeacon.objectiveAssigneeBonus[this.runtime.rank('blood-beacon')];
  }

  playerFireRateMultiplier(x: number, y: number): number {
    const state = this.findFieldState(x, y);
    if (!state) return 1;
    let bonus = 0;
    if (this.runtime.has('combat-uplink')) bonus += MOD_BALANCE.bombsite.combatUplink.fireRateBonus[this.runtime.rank('combat-uplink')];
    bonus += this.finalCountdownBonus(state);
    return 1 + bonus;
  }

  playerMoveSpeedMultiplier(x: number, y: number): number {
    const state = this.findFieldState(x, y);
    return state ? 1 + this.finalCountdownBonus(state) : 1;
  }

  cooldownAccelerationBonus(x: number, y: number, kind: 'defense' | 'mine' | 'shield'): number {
    const state = this.findFieldState(x, y);
    if (!state) return 0;
    let bonus = this.finalCountdownBonus(state);
    if (kind === 'mine' && this.runtime.has('munitions-relay')) {
      bonus += MOD_BALANCE.bombsite.munitionsRelay.rechargeBonus[this.runtime.rank('munitions-relay')];
    }
    if (kind === 'shield' && this.runtime.has('emergency-shielding')) {
      bonus += MOD_BALANCE.bombsite.emergencyShielding.rechargeBonus[this.runtime.rank('emergency-shielding')];
    }
    return bonus;
  }

  turretFireRateMultiplier(x: number, y: number): number {
    if (!this.runtime.has('sentry-uplink') || !this.findFieldState(x, y)) return 1;
    return 1 + MOD_BALANCE.bombsite.sentryUplink.turretFireRateBonus[this.runtime.rank('sentry-uplink')];
  }

  fenceDamageMultiplier(x1: number, y1: number, x2: number, y2: number): number {
    if (!this.runtime.has('capacitor-field')) return 1;
    for (const state of this.stateBySite.values()) {
      if (this.isActive(state.site)
        && segmentIntersectsBombsiteField(state.site, x1, y1, x2, y2, MOD_BALANCE.bombsite.fieldRadius)) {
        return 1 + MOD_BALANCE.bombsite.capacitorField.fenceDamageBonus[this.runtime.rank('capacitor-field')];
      }
    }
    return 1;
  }

  destroy(): void {
    for (const state of this.stateBySite.values()) this.destroyFieldVisual(state.visual);
    this.stateBySite.clear();
    this.exposures.clear();
    this.pulls.clear();
    this.totems.destroy();
    for (const object of this.temporaryObjects) {
      this.scene.tweens.killTweensOf(object);
      object.destroy();
    }
    this.temporaryObjects.clear();
  }

  private updateArcSurge(state: ActiveSiteState, now: number, enemies: Enemy[], weaponDamage: number): void {
    if (!this.runtime.has('arc-surge')) return;
    if (now < state.nextArcAt) {
      if (state.nextArcAt - now <= 240 && state.arcChargingFor !== state.nextArcAt) {
        state.arcChargingFor = state.nextArcAt;
        this.totems.charge(state.site.id, 0x63efff, now, state.nextArcAt - now, 'electric');
      }
      return;
    }
    const rank = this.runtime.rank('arc-surge');
    state.nextArcAt = now + MOD_BALANCE.bombsite.arcSurge.intervalMs[rank];
    state.arcChargingFor = 0;
    const damage = weaponDamage * MOD_BALANCE.bombsite.arcSurge.weaponDamageMultiplier[rank];
    const applied = this.damageEnemiesInRadius(state.site, enemies, MOD_BALANCE.bombsite.fieldRadius, damage, 'arc-surge');
    this.showPulse(state.site, 0x63efff, MOD_BALANCE.bombsite.fieldRadius, 430, 'electric');
    if (applied > 0) this.callbacks.playCue('electric');
  }

  private updateUnstableReactor(state: ActiveSiteState, now: number, enemies: Enemy[], player: Player, weaponDamage: number): void {
    if (!this.runtime.has('unstable-reactor')) return;
    const config = MOD_BALANCE.bombsite.unstableReactor;
    const rank = this.runtime.rank('unstable-reactor');
    if (state.unstablePulseAt > 0 && now >= state.unstablePulseAt) {
      state.unstablePulseAt = 0;
      state.nextUnstableWarningAt = now + config.intervalMs[rank];
      const damage = weaponDamage * config.enemyWeaponDamageMultiplier[rank];
      this.damageEnemiesInRadius(state.site, enemies, config.outerRadius, damage, 'unstable-reactor');
      if (isInsideBombsiteField(state.site, player.x, player.y, config.innerRadius)) {
        if (this.callbacks.damagePlayer(config.playerDamage[rank])) {
          GameplayTelemetryRecorder.recordModEffect('unstable-reactor', 'playerDamage', config.playerDamage[rank]);
        }
      }
      this.showPulse(state.site, 0xff7a32, config.outerRadius, 520, 'damage');
      this.callbacks.playCue('heavy');
      return;
    }
    if (state.unstablePulseAt === 0 && now >= state.nextUnstableWarningAt) {
      state.unstablePulseAt = now + config.warningMs;
      this.showWarning(state.site, config.innerRadius, 'REACTOR PULSE', 0x91ff3f, config.warningMs);
      this.callbacks.playCue('warning');
    }
  }

  private updateEventHorizon(state: ActiveSiteState, now: number, enemies: Enemy[]): void {
    if (!this.runtime.has('event-horizon-array')) return;
    const config = MOD_BALANCE.bombsite.eventHorizon;
    const rank = this.runtime.rank('event-horizon-array');
    if (state.gravityPulseAt > 0 && now >= state.gravityPulseAt) {
      state.gravityPulseAt = 0;
      state.nextGravityWarningAt = now + config.intervalMs[rank];
      let pulled = 0;
      for (const enemy of enemies) {
        if (!enemy.active || enemy.isDead() || !isInsideBombsiteField(state.site, enemy.x, enemy.y, config.outerRadius)) continue;
        const resistance = enemy.stats.type === 'star' ? 0.35 : enemy.stats.type === 'tank' ? 0.5 : 1;
        this.pulls.set(enemy, {
          site: state.site,
          until: now + config.pullDurationMs[rank] * resistance,
          speed: config.pullSpeed[rank] * resistance
        });
        pulled += 1;
      }
      if (pulled > 0) GameplayTelemetryRecorder.recordModEffect('event-horizon-array', 'pulls', pulled);
      this.showPulse(state.site, 0xc36cff, config.outerRadius, 650, 'control');
      this.callbacks.playCue('gravity');
      return;
    }
    if (state.gravityPulseAt === 0 && now >= state.nextGravityWarningAt) {
      state.gravityPulseAt = now + config.warningMs;
      this.showWarning(state.site, config.killRingRadius, 'EVENT HORIZON', 0xc36cff, config.warningMs);
    }
  }

  private updateSecondSun(state: ActiveSiteState, now: number, enemies: Enemy[], weaponDamage: number): void {
    if (!this.runtime.has('second-sun')) return;
    const config = MOD_BALANCE.bombsite.secondSun;
    const rank = this.runtime.rank('second-sun');
    const crossed = countdownStagesCrossed(state.previousTimerMs, state.site.timerMs, config.thresholdsMs, state.secondSunStages);
    for (const stage of crossed) {
      state.secondSunStages.add(stage);
      const damage = weaponDamage * config.weaponDamageMultiplier[stage] * config.rankDamageMultiplier[rank];
      this.damageEnemiesInRadius(state.site, enemies, config.radius[stage], damage, 'second-sun');
      if (stage >= 1) {
        for (const enemy of enemies) {
          if (!enemy.active || enemy.isDead() || !isInsideBombsiteField(state.site, enemy.x, enemy.y, config.radius[stage])) continue;
          enemy.slowFactor = Math.min(enemy.slowFactor, config.slowFactor);
          enemy.slowedUntil = Math.max(enemy.slowedUntil, now + config.slowDurationMs);
          if (stage === 2) enemy.defuseInterruptedUntil = Math.max(enemy.defuseInterruptedUntil, now + 450);
        }
      }
      this.showPulse(state.site, stage === 2 ? 0xff542f : 0xffa238, config.radius[stage], 440 + stage * 120, 'damage');
      this.callbacks.announce(`SECOND SUN // STAGE ${stage + 1}`);
      this.callbacks.playCue(stage === 2 ? 'heavy' : 'warning');
      GameplayTelemetryRecorder.recordModEffect('second-sun', 'triggers', 1);
    }
  }

  private updateGroundCharge(state: ActiveSiteState, now: number, enemies: Enemy[], weaponDamage: number): void {
    if (now >= state.groundChargedUntil || now < state.nextGroundTickAt) return;
    state.nextGroundTickAt = now + MOD_BALANCE.bombsite.groundZero.chargedTickMs;
    const damage = weaponDamage * MOD_BALANCE.bombsite.groundZero.chargedDamageMultiplier;
    this.damageEnemiesInRadius(state.site, enemies, MOD_BALANCE.bombsite.fieldRadius, damage, 'ground-zero');
    this.showPulse(state.site, 0xff8a38, MOD_BALANCE.bombsite.fieldRadius, 260, 'damage');
  }

  private updateFieldStatuses(now: number, activeSites: BombSiteRuntime[], enemies: Enemy[], weaponDamage: number): void {
    const pressureRank = this.runtime.rank('pressure-field');
    const hotRank = this.runtime.rank('hot-zone');
    const hotEnabled = this.runtime.has('hot-zone');
    for (const enemy of enemies) {
      if (!enemy.active || enemy.isDead()) continue;
      const inside = activeSites.some((site) => isInsideBombsiteField(site, enemy.x, enemy.y, MOD_BALANCE.bombsite.fieldRadius));
      if (!inside) {
        this.exposures.delete(enemy);
        continue;
      }
      if (this.runtime.has('pressure-field')) {
        enemy.slowFactor = Math.min(enemy.slowFactor, MOD_BALANCE.bombsite.pressureField.slowFactor[pressureRank]);
        enemy.slowedUntil = Math.max(enemy.slowedUntil, now + MOD_BALANCE.bombsite.pressureField.refreshMs);
      }
      if (!hotEnabled) continue;
      const exposure = this.exposures.get(enemy) ?? { stacks: 0, nextTickAt: now + MOD_BALANCE.bombsite.hotZone.tickMs, lastSeenAt: now };
      exposure.lastSeenAt = now;
      if (now >= exposure.nextTickAt) {
        exposure.stacks = Math.min(MOD_BALANCE.bombsite.hotZone.maxStacks[hotRank], exposure.stacks + 1);
        exposure.nextTickAt = now + MOD_BALANCE.bombsite.hotZone.tickMs;
        const damage = weaponDamage * MOD_BALANCE.bombsite.hotZone.weaponDamageMultiplierPerStack[hotRank] * exposure.stacks;
        const applied = enemy.takeDamage(damage, 'bombSite');
        if (applied > 0) {
          GameplayTelemetryRecorder.recordModEffect('hot-zone', 'damage', applied);
          const state = this.findFieldState(enemy.x, enemy.y);
          if (state && now >= state.nextHotVisualAt) {
            state.nextHotVisualAt = now + 520;
            this.totems.flash(state.site.id, 0xff6748, now, 'damage');
          }
        }
      }
      this.exposures.set(enemy, exposure);
    }
    for (const [enemy, exposure] of this.exposures) {
      if (!enemy.active || enemy.isDead() || now - exposure.lastSeenAt > MOD_BALANCE.bombsite.fieldScanIntervalMs * 2) this.exposures.delete(enemy);
    }
  }

  private applyGravityPulls(now: number): void {
    const ringRadius = MOD_BALANCE.bombsite.eventHorizon.killRingRadius;
    for (const [enemy, pull] of this.pulls) {
      if (!enemy.active || enemy.isDead() || now >= pull.until || !this.isActive(pull.site)) {
        this.pulls.delete(enemy);
        continue;
      }
      const dx = enemy.x - pull.site.x;
      const dy = enemy.y - pull.site.y;
      const distanceSquared = dx * dx + dy * dy;
      const inverseDistance = distanceSquared > 1 ? 1 / Math.sqrt(distanceSquared) : 1;
      const radialX = distanceSquared > 1 ? dx * inverseDistance : 1;
      const radialY = distanceSquared > 1 ? dy * inverseDistance : 0;
      const targetX = pull.site.x + radialX * ringRadius;
      const targetY = pull.site.y + radialY * ringRadius;
      const targetDx = targetX - enemy.x;
      const targetDy = targetY - enemy.y;
      const targetDistanceSquared = targetDx * targetDx + targetDy * targetDy;
      if (targetDistanceSquared <= 9) {
        enemy.setVelocity(0, 0);
        continue;
      }
      const inverseTargetDistance = 1 / Math.sqrt(targetDistanceSquared);
      enemy.setVelocity(targetDx * inverseTargetDistance * pull.speed, targetDy * inverseTargetDistance * pull.speed);
    }
  }

  private applyShockwave(
    site: BombSiteRuntime,
    enemies: readonly Enemy[],
    radius: number,
    speed: number,
    staggerMs: number,
    damage: number,
    modId: string
  ): void {
    let totalDamage = 0;
    for (const enemy of enemies) {
      if (!enemy.active || enemy.isDead()) continue;
      const dx = enemy.x - site.x;
      const dy = enemy.y - site.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radius * radius) continue;
      if (damage > 0) totalDamage += enemy.takeDamage(damage, 'bombSite');
      const resistance = enemy.stats.type === 'star' ? 0.2 : enemy.stats.type === 'tank' ? 0.35 : enemy.stats.type === 'disruptor' ? 0.65 : 1;
      const inverseDistance = distanceSquared > 1 ? 1 / Math.sqrt(distanceSquared) : 1;
      enemy.setVelocity((distanceSquared > 1 ? dx : 1) * inverseDistance * speed * resistance, (distanceSquared > 1 ? dy : 0) * inverseDistance * speed * resistance);
      enemy.defuseInterruptedUntil = Math.max(enemy.defuseInterruptedUntil, this.scene.time.now + staggerMs * resistance);
    }
    if (totalDamage > 0) GameplayTelemetryRecorder.recordModEffect(modId, 'damage', totalDamage);
    GameplayTelemetryRecorder.recordModEffect(modId, 'triggers', 1);
    this.showPulse(
      site,
      modId === 'ground-zero' ? 0xff8a32 : 0x69efff,
      radius,
      modId === 'ground-zero' ? 720 : 460,
      modId === 'ground-zero' ? 'damage' : 'push'
    );
  }

  private damageEnemiesInRadius(site: BombSiteRuntime, enemies: readonly Enemy[], radius: number, damage: number, modId: string): number {
    let applied = 0;
    for (const enemy of enemies) {
      if (!enemy.active || enemy.isDead() || !isInsideBombsiteField(site, enemy.x, enemy.y, radius)) continue;
      applied += enemy.takeDamage(damage, 'bombSite');
    }
    if (applied > 0) GameplayTelemetryRecorder.recordModEffect(modId, 'damage', applied);
    GameplayTelemetryRecorder.recordModEffect(modId, 'triggers', 1);
    return applied;
  }

  private finalCountdownBonus(state: ActiveSiteState): number {
    if (!this.runtime.has('final-countdown') || state.site.timerMs > MOD_BALANCE.bombsite.finalCountdown.thresholdMs) return 0;
    return MOD_BALANCE.bombsite.finalCountdown.bonus[this.runtime.rank('final-countdown')];
  }

  private findFieldState(x: number, y: number): ActiveSiteState | null {
    let nearest: ActiveSiteState | null = null;
    let nearestDistanceSquared = MOD_BALANCE.bombsite.fieldRadius * MOD_BALANCE.bombsite.fieldRadius;
    for (const state of this.stateBySite.values()) {
      if (!this.isActive(state.site)) continue;
      const dx = x - state.site.x;
      const dy = y - state.site.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= nearestDistanceSquared) {
        nearest = state;
        nearestDistanceSquared = distanceSquared;
      }
    }
    return nearest;
  }

  private isActive(site: BombSiteRuntime): boolean {
    return site.state === BombSiteState.Armed || site.state === BombSiteState.BeingDefused;
  }

  private shouldShowField(): boolean {
    return TOTEM_VISUAL_MODS.some((id) => this.runtime.has(id));
  }

  private createFieldVisual(site: BombSiteRuntime): FieldVisual {
    const radius = MOD_BALANCE.bombsite.fieldRadius;
    const ring = this.scene.add.circle(site.x, site.y, radius, 0x38dfff, 0.018)
      .setStrokeStyle(2, 0x58eaff, 0.32)
      .setDepth(3);
    const markings = this.scene.add.graphics().setPosition(site.x, site.y).setDepth(3);
    markings.lineStyle(1, 0xff67ce, 0.2);
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2;
      markings.lineBetween(
        Math.cos(angle) * (radius - 12),
        Math.sin(angle) * (radius - 12),
        Math.cos(angle) * radius,
        Math.sin(angle) * radius
      );
    }
    const pulse = this.scene.tweens.add({
      targets: ring,
      alpha: { from: 0.28, to: 0.62 },
      duration: 1350,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    return { ring, markings, pulse };
  }

  private updateFieldVisual(state: ActiveSiteState, now: number): void {
    if (!state.visual) return;
    const urgent = state.site.timerMs <= MOD_BALANCE.bombsite.finalCountdown.thresholdMs;
    state.visual.ring.setStrokeStyle(urgent ? 3 : 2, urgent ? 0xff6ac8 : 0x58eaff, urgent ? 0.58 : 0.32);
    state.visual.markings.setRotation(now * (urgent ? 0.00013 : 0.00006));
  }

  private destroyFieldVisual(visual: FieldVisual | null): void {
    if (!visual) return;
    visual.pulse.remove();
    visual.ring.destroy();
    visual.markings.destroy();
  }

  private showPulse(
    site: BombSiteRuntime,
    color: number,
    radius: number,
    duration: number,
    kind: BombsiteTotemEffectKind = 'support'
  ): void {
    if (this.totems.trigger(site.id, color, radius, this.scene.time.now, duration, kind)) return;
    const ring = this.track(this.scene.add.circle(site.x, site.y, 18, color, 0.08).setStrokeStyle(4, color, 0.95).setDepth(12));
    this.scene.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration,
      ease: 'Cubic.Out',
      onComplete: () => this.destroyTemporary(ring)
    });
  }

  private showWarning(site: BombSiteRuntime, radius: number, labelText: string, color: number, duration: number): void {
    const kind: BombsiteTotemEffectKind = labelText === 'EVENT HORIZON' ? 'control' : 'damage';
    this.totems.charge(site.id, color, this.scene.time.now, duration, kind);
    const ring = this.track(this.scene.add.circle(site.x, site.y, radius, color, 0.035).setStrokeStyle(3, color, 0.9).setDepth(12));
    const label = this.track(this.scene.add.text(site.x, site.y - radius - 18, labelText, {
      fontFamily: 'Orbitron, sans-serif', fontSize: '15px', color: '#f5ffff', stroke: '#050811', strokeThickness: 5
    }).setOrigin(0.5).setDepth(13));
    this.scene.tweens.add({ targets: [ring, label], alpha: { from: 0.95, to: 0.25 }, duration: 120, yoyo: true, repeat: Math.max(1, Math.floor(duration / 240) - 1) });
    this.scene.time.delayedCall(duration, () => {
      this.destroyTemporary(ring);
      this.destroyTemporary(label);
    });
  }

  private drawElectricArc(x1: number, y1: number, x2: number, y2: number, color: number): void {
    const arc = this.track(this.scene.add.graphics().setDepth(13));
    arc.lineStyle(3, color, 0.98);
    arc.beginPath();
    arc.moveTo(x1, y1);
    arc.lineTo((x1 + x2) * 0.5 + Phaser.Math.Between(-14, 14), (y1 + y2) * 0.5 + Phaser.Math.Between(-14, 14));
    arc.lineTo(x2, y2);
    arc.strokePath();
    this.scene.tweens.add({ targets: arc, alpha: 0, duration: 180, onComplete: () => this.destroyTemporary(arc) });
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.temporaryObjects.add(object);
    return object;
  }

  private destroyTemporary(object: Phaser.GameObjects.GameObject): void {
    if (!this.temporaryObjects.delete(object)) return;
    this.scene.tweens.killTweensOf(object);
    object.destroy();
  }
}
