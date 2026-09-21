export const ECHO_BALANCE = Object.freeze({ recordingMs: 4000, cooldownMs: 12000, damageMultiplier: .5,
  absoluteDamageCap: .7, sampleHz: 60, maximumShots: 512, returnSearchRadius: 384 });

export interface EchoConfig { recordingMs: number; cooldownMs: number; damageMultiplier: number; replaySpeed: number; }
export const DEFAULT_ECHO_CONFIG: Readonly<EchoConfig> = Object.freeze({ ...ECHO_BALANCE, replaySpeed: 1 });
export interface EchoDamageStamp { readonly equivalentDamage: number; readonly multiplier: number; }
const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
export function echoMultiplier(value: number): number { return Math.max(0, Math.min(.70, finite(value))); }
export function stampEchoDamage(equivalentDamage: number, multiplier: number): EchoDamageStamp {
  return Object.freeze({ equivalentDamage: Math.max(0, finite(equivalentDamage)), multiplier: echoMultiplier(multiplier) });
}
/** Called at the final health-write boundary. Unknown/missing provenance fails closed. */
export function authoritativeEchoDamage(requested: number, stamp?: EchoDamageStamp, scale = 1): number {
  if (!stamp) return 0;
  return Math.max(0, Math.min(finite(requested), finite(stamp.equivalentDamage) * Math.max(0, finite(scale)) * echoMultiplier(stamp.multiplier)));
}
export function normalizeEchoConfig(config: Partial<EchoConfig> = {}): EchoConfig {
  return { recordingMs: Math.max(1, Math.min(ECHO_BALANCE.recordingMs, finite(config.recordingMs ?? ECHO_BALANCE.recordingMs))),
    cooldownMs: Math.max(0, finite(config.cooldownMs ?? ECHO_BALANCE.cooldownMs)),
    damageMultiplier: echoMultiplier(config.damageMultiplier ?? ECHO_BALANCE.damageMultiplier),
    replaySpeed: Math.max(.25, Math.min(4, finite(config.replaySpeed ?? 1, 1))) };
}

export interface EchoPoint { x: number; y: number; }
/** Used only on activation/return; validates the complete operative body in either world. */
export function nearestSafeEchoOrigin(x: number, y: number, valid: (x: number, y: number) => boolean,
  fallbackX: number, fallbackY: number, out: EchoPoint): boolean {
  if (valid(x, y)) { out.x = x; out.y = y; return true; }
  for (let radius = 4; radius <= ECHO_BALANCE.returnSearchRadius; radius += 4) {
    const points = Math.max(16, Math.ceil(Math.PI * 2 * radius / 8));
    for (let i = 0; i < points; i++) {
      const px = x + Math.cos(i * Math.PI * 2 / points) * radius;
      const py = y + Math.sin(i * Math.PI * 2 / points) * radius;
      if (valid(px, py)) { out.x = px; out.y = py; return true; }
    }
  }
  if (valid(fallbackX, fallbackY)) { out.x = fallbackX; out.y = fallbackY; return true; }
  return false;
}
