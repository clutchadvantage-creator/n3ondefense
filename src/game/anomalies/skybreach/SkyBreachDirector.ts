/** Authored flight, in active simulation time. No timers survive scene retirement. */
export type SkyRole = 'drone' | 'tank' | 'interceptor' | 'strike' | 'zeppelin';
export type Formation = 'line' | 'v' | 'staggered' | 'dual-column' | 'split' | 'crossing' | 'diagonal';
export interface FlightModule {
  name: string; duration: number; role?: SkyRole; formation?: Formation;
  secondary?: SkyRole; artillery?: boolean; recovery?: boolean;
}
export const SKY_FLIGHT: readonly FlightModule[] = [
  { name: 'OUTER AIR PATROL', duration: 22, role: 'interceptor', formation: 'v' },
  { name: 'CROSSING CONTACTS', duration: 22, role: 'interceptor', formation: 'crossing' },
  { name: 'DRONE PICKET', duration: 22, role: 'drone', formation: 'split' },
  { name: 'ARMORED CONVOY', duration: 24, role: 'tank', formation: 'dual-column', secondary: 'strike' },
  { name: 'ANTI-AIR CORRIDOR', duration: 24, role: 'interceptor', formation: 'diagonal', artillery: true },
  { name: 'SERVICE WINDOW', duration: 14, recovery: true },
  { name: 'STRIKE ESCORT', duration: 24, role: 'strike', formation: 'staggered', secondary: 'drone' },
  { name: 'WAR ZEPPELIN', duration: 28, role: 'zeppelin', formation: 'line', secondary: 'interceptor' },
  { name: 'SIEGE BATTERY', duration: 24, role: 'tank', formation: 'dual-column', artillery: true },
  { name: 'ELITE INTERDICTION', duration: 26, role: 'strike', formation: 'v', secondary: 'interceptor' },
  { name: 'FINAL APPROACH', duration: 16, recovery: true }
];

export class SkyBreachDirector {
  elapsed = 0;
  index = -1;
  private nextWave = 0;
  update(dt: number, enter: (module: FlightModule, index: number) => void,
    wave: (module: FlightModule, sequence: number) => void): void {
    this.elapsed += Math.max(0, Math.min(dt, .1));
    let boundary = 0, next = SKY_FLIGHT.length;
    for (let i = 0; i < SKY_FLIGHT.length; i++) {
      boundary += SKY_FLIGHT[i].duration;
      if (this.elapsed < boundary) { next = i; break; }
    }
    if (next !== this.index) {
      this.index = next;
      this.nextWave = this.elapsed + 1.8;
      if (!this.complete) enter(SKY_FLIGHT[next], next);
    }
    if (!this.complete && this.elapsed >= this.nextWave) {
      const module = SKY_FLIGHT[this.index];
      this.nextWave = this.elapsed + (module.role === 'zeppelin' ? 40 : 9);
      if (!module.recovery) wave(module, Math.floor(this.elapsed / 9));
    }
  }
  get complete(): boolean { return this.index >= SKY_FLIGHT.length; }
}

/** Entry coordinates and flight direction, shared by every formation consumer. */
export function formationSlots(pattern: Formation, count: number, width: number, height: number, mirror = false) {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / (count + 1);
    let x = width * (.15 + t * .7), y = 115 - i * 26, vx = 0, vy = 1;
    if (pattern === 'v') y = 140 - Math.abs(i - (count - 1) / 2) * 46;
    if (pattern === 'staggered') y = 115 - (i % 2) * 65;
    if (pattern === 'dual-column') { x = width * (i % 2 ? .7 : .3); y = 115 - Math.floor(i / 2) * 70; }
    if (pattern === 'split' || pattern === 'crossing') {
      x = i % 2 ? width - 35 : 35; y = height * (.22 + t * .3);
      vx = i % 2 ? -1 : 1; vy = pattern === 'crossing' ? .3 : .6;
    }
    if (pattern === 'diagonal') { x = 35 + i * 70; y = 100 - i * 36; vx = .65; }
    return { x: mirror ? width - x : x, y, vx: mirror ? -vx : vx, vy };
  });
}

export const DREADNOUGHT_WEAPONS = ['cannon-left', 'cannon-right', 'broadside-left', 'broadside-right',
  'missile-left', 'missile-right', 'artillery'] as const;
export type HardpointId = typeof DREADNOUGHT_WEAPONS[number];
export type DreadnoughtAttack = 'cannon' | 'broadside' | 'missile' | 'artillery' | 'escorts';
const ATTACK_ORDER: readonly DreadnoughtAttack[] = ['cannon', 'missile', 'broadside', 'artillery', 'escorts'];
export const coreExposed = (alive: ReadonlySet<HardpointId>): boolean => alive.size === 0;
export const attackWeapons = (attack: DreadnoughtAttack, alive: ReadonlySet<HardpointId>): HardpointId[] =>
  DREADNOUGHT_WEAPONS.filter(id => alive.has(id) && id.startsWith(attack));
/** One weapon family at a time, then a recovery gap. Destroyed families are skipped. */
export class DreadnoughtScheduler {
  private cursor = 0;
  private nextAt = 0;
  next(now: number, alive: ReadonlySet<HardpointId>, pressure: number): DreadnoughtAttack | null {
    if (now < this.nextAt) return null;
    for (let i = 0; i < ATTACK_ORDER.length; i++) {
      const attack = ATTACK_ORDER[this.cursor++ % ATTACK_ORDER.length];
      if (attack !== 'escorts' && !attackWeapons(attack, alive).length) continue;
      this.nextAt = now + (attack === 'escorts' ? 7500 : 4800) / Math.min(1.3, Math.max(1, pressure));
      return attack;
    }
    return null;
  }
}
