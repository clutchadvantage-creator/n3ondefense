export const MINE_DEPLOYMENT_DELAY_MS = 150;

export type MineChargeAvailability = 'ready' | 'deployment-delay' | 'empty';

export interface MineChargeRackSnapshot {
  currentCharges: number;
  maxCharges: number;
  nextChargeRemainingMs: number;
  rechargeDurationMs: number;
}

/**
 * Authoritative rack shared by individual deployment and Full Rack Salvo,
 * independently from Mine entities already deployed in the arena.
 *
 * Recharge is intentionally lazy (advanced by ArenaScene's clock when queried), so
 * the rack does not create timers or listeners that can survive a scene restart.
 */
export class MineChargeRack {
  private currentCharges = 0;
  private maxCharges = 0;
  private nextChargeAt = 0;
  private nextDeploymentAt = 0;

  reset(maxCharges: number, fill = true): void {
    this.maxCharges = normalizeChargeCount(maxCharges);
    this.currentCharges = fill ? this.maxCharges : 0;
    this.nextChargeAt = 0;
    this.nextDeploymentAt = 0;
  }

  availability(now: number, rechargeDurationMs: number): MineChargeAvailability {
    this.advance(now, rechargeDurationMs);
    if (this.currentCharges <= 0) return 'empty';
    if (now < this.nextDeploymentAt) return 'deployment-delay';
    return 'ready';
  }

  spend(now: number, rechargeDurationMs: number): boolean {
    return this.spendMany(now, rechargeDurationMs, 1);
  }

  spendMany(now: number, rechargeDurationMs: number, requestedCharges: number): boolean {
    const chargeCount = normalizeChargeCount(requestedCharges);
    if (chargeCount <= 0 || this.availability(now, rechargeDurationMs) !== 'ready') return false;
    if (this.currentCharges < chargeCount) return false;

    const wasFull = this.currentCharges === this.maxCharges;
    this.currentCharges -= chargeCount;
    this.nextDeploymentAt = now + MINE_DEPLOYMENT_DELAY_MS;

    // Spending another charge while the rack is already recharging must not
    // discard the progress toward the next charge.
    if (wasFull || this.nextChargeAt <= 0) {
      this.nextChargeAt = now + normalizeDuration(rechargeDurationMs);
    }
    return true;
  }

  snapshot(now: number, rechargeDurationMs: number): MineChargeRackSnapshot {
    const duration = normalizeDuration(rechargeDurationMs);
    this.advance(now, duration);
    return {
      currentCharges: this.currentCharges,
      maxCharges: this.maxCharges,
      nextChargeRemainingMs: this.currentCharges < this.maxCharges
        ? Math.max(0, this.nextChargeAt - now)
        : 0,
      rechargeDurationMs: duration
    };
  }

  accelerateRecharge(now: number, maximumRemainingMs: number): void {
    if (this.currentCharges >= this.maxCharges || this.nextChargeAt <= 0) return;
    this.nextChargeAt = Math.min(this.nextChargeAt, now + Math.max(0, maximumRemainingMs));
  }

  accelerateRechargeBy(amountMs: number): void {
    if (this.currentCharges >= this.maxCharges || this.nextChargeAt <= 0) return;
    this.nextChargeAt -= Math.max(0, Number.isFinite(amountMs) ? amountMs : 0);
  }

  private advance(now: number, rechargeDurationMs: number): void {
    if (this.currentCharges >= this.maxCharges) {
      this.currentCharges = this.maxCharges;
      this.nextChargeAt = 0;
      return;
    }

    const duration = normalizeDuration(rechargeDurationMs);
    if (this.nextChargeAt <= 0) this.nextChargeAt = now + duration;
    while (this.currentCharges < this.maxCharges && now >= this.nextChargeAt) {
      this.currentCharges += 1;
      this.nextChargeAt += duration;
    }
    if (this.currentCharges >= this.maxCharges) this.nextChargeAt = 0;
  }
}

function normalizeChargeCount(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function normalizeDuration(value: number): number {
  return Math.max(1, Number.isFinite(value) ? value : 1);
}
