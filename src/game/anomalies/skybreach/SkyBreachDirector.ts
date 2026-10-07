import { SeededRandom } from '../../systems/SeededRandom.ts';
/** Authored flight, in active simulation time. No timers survive scene retirement. */
export type SkyRole = 'drone' | 'tank' | 'interceptor' | 'strike' | 'zeppelin' | 'aa';
export type Formation = 'line' | 'v' | 'staggered' | 'dual-column' | 'split' | 'crossing' | 'diagonal'
  | 'corkscrew' | 'banked-dive' | 'scissors' | 'pincer' | 'spiral' | 'escort-break' | 'rolling-entry';
export const SKY_PATTERNS: readonly Formation[] = ['line','v','staggered','split','crossing','diagonal',
  'corkscrew','banked-dive','scissors','pincer','spiral','escort-break','rolling-entry'];
/** A compact ground patrol: one lead vehicle and two abreast behind it. */
export const tankGroupSlots = (height:number) => [
  { offsetX:0,y:height*.58+80 },
  { offsetX:-48,y:height*.58 },
  { offsetX:48,y:height*.58 }
];
export interface FlightModule {
  name: string; duration: number; role?: SkyRole; formation?: Formation;
  secondary?: SkyRole; artillery?: boolean; recovery?: boolean; emplacements?: boolean; airship?: boolean;
}
export const SKY_FLIGHT: readonly FlightModule[] = [
  { name: 'OUTER AIR PATROL', duration: 22, role: 'interceptor', formation: 'v' },
  { name: 'CROSSING CONTACTS', duration: 22, role: 'interceptor', formation: 'crossing' },
  { name: 'DRONE PICKET', duration: 22, role: 'drone', formation: 'split' },
  { name: 'ARMORED CONVOY', duration: 24, role: 'tank', formation: 'dual-column', secondary: 'strike', emplacements: true },
  { name: 'ANTI-AIR CORRIDOR', duration: 24, role: 'interceptor', formation: 'diagonal', artillery: true, emplacements: true },
  { name: 'SERVICE WINDOW', duration: 7, recovery: true },
  { name: 'STRIKE ESCORT', duration: 24, role: 'strike', formation: 'staggered', secondary: 'drone' },
  { name: 'WAR ZEPPELIN', duration: 28, role: 'zeppelin', formation: 'line', secondary: 'interceptor', emplacements: true },
  { name: 'SIEGE BATTERY', duration: 24, role: 'tank', formation: 'dual-column', artillery: true, emplacements: true },
  { name: 'ELITE INTERDICTION', duration: 26, role: 'strike', formation: 'v', secondary: 'interceptor', emplacements: true },
  { name: 'FINAL APPROACH', duration: 8, recovery: true }
];

/** Curated acts retain an opening, recovery and finale; seed varies the middle and escorts. */
export function skyFlightPlan(seed: number): readonly FlightModule[] {
  const random = new SeededRandom(seed ^ 0x5b17);
  const modules = SKY_FLIGHT.map(module => ({ ...module }));
  const early = random.shuffle(modules.slice(1,5));
  modules.splice(1,4,...early);
  modules[1] = { ...modules[1], name:'CORKSCREW ASSAULT', role:'interceptor', formation:'corkscrew', secondary:'drone' };
  for (const i of [0,2,3,4,6,7,8,9]) {
    if(modules[i].role==='interceptor'||modules[i].role==='strike') modules[i].formation=random.pick(SKY_PATTERNS.filter(p=>p!=='corkscrew'));
  }
  // Two additional airship opportunities, distinct from the authored heavy encounter.
  modules[random.pick([2,3,4])].airship=true;
  modules[random.pick([6,8,9])].airship=true;
  modules[5].duration=random.pick([7,9,11]);
  modules[10].duration=random.pick([7,8,9]);
  return modules;
}

export function skyReinforcementPlan(seed: number): readonly SkyRole[] {
  const random = new SeededRandom(seed ^ 0xd4ead);
  return ['drone', random.pick(['interceptor','strike'] as const), random.pick(['zeppelin','aa','tank'] as const)];
}

export class SkyBreachDirector {
  readonly modules: readonly FlightModule[];
  constructor(seed = 0) { this.modules = skyFlightPlan(seed); }
  elapsed = 0;
  index = -1;
  private nextWave = 0;
  private sequence = 0;
  update(dt: number, enter: (module: FlightModule, index: number) => void,
    wave: (module: FlightModule, sequence: number) => void): void {
    this.elapsed += Math.max(0, Math.min(dt, .1));
    let boundary = 0, next = this.modules.length;
    for (let i = 0; i < this.modules.length; i++) {
      boundary += this.modules[i].duration;
      if (this.elapsed < boundary) { next = i; break; }
    }
    if (next !== this.index) {
      this.index = next;
      this.nextWave = this.elapsed + .65;
      if (!this.complete) enter(this.modules[next], next);
    }
    if (!this.complete && this.elapsed >= this.nextWave) {
      const module = this.modules[this.index];
      this.nextWave = this.elapsed + (this.index < 3 ? 5.5 : 4.5);
      if (!module.recovery) wave(module, this.sequence++);
    }
  }
  get complete(): boolean { return this.index >= this.modules.length; }
}

/** Entry coordinates and flight direction, shared by every formation consumer. */
export function formationSlots(pattern: Formation, count: number, width: number, height: number, mirror = false) {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / (count + 1);
    let x = width * (.15 + t * .7), y = 115 - i * 26, vx = 0, vy = 1;
    if (pattern === 'v') y = 140 - Math.abs(i - (count - 1) / 2) * 46;
    if (pattern === 'staggered') y = 115 - (i % 2) * 65;
    if (pattern === 'dual-column') { x = width * (i % 2 ? .7 : .3); y = 115 - Math.floor(i / 2) * 70; }
    if (['split','crossing','corkscrew','scissors','pincer','rolling-entry'].includes(pattern)) {
      x = i % 2 ? width - 35 : 35; y = height * (.22 + t * .3);
      vx = i % 2 ? -1 : 1; vy = pattern === 'crossing' ? .3 : .6;
    }
    if (pattern === 'diagonal') { x = 35 + i * 70; y = 100 - i * 36; vx = .65; }
    return { x: mirror ? width - x : x, y, vx: mirror ? -vx : vx, vy, group: i % 2 ? -1 : 1, slot: Math.floor(i/2) };
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
      this.nextAt = now + (attack === 'escorts' ? 4500 : 3100) / Math.min(1.3, Math.max(1, pressure));
      return attack;
    }
    return null;
  }
}

export interface DreadnoughtCue { family: DreadnoughtAttack; delayMs: number }
const CROSSFIRES: readonly (readonly DreadnoughtCue[])[] = [
  [{family:'cannon',delayMs:0},{family:'broadside',delayMs:600}],
  [{family:'missile',delayMs:0},{family:'cannon',delayMs:900}],
  [{family:'artillery',delayMs:0},{family:'broadside',delayMs:650}],
  [{family:'cannon',delayMs:0},{family:'escorts',delayMs:1000}],
  [{family:'missile',delayMs:0},{family:'escorts',delayMs:850}]
];
/** Two coordinated families at most, with an intentional gap between combinations. */
export class DreadnoughtCrossfire {
  private cursor = 0;
  private nextAt = 0;
  next(now:number, alive:ReadonlySet<HardpointId>, pressure:number): readonly DreadnoughtCue[] {
    if(now<this.nextAt)return [];
    this.nextAt=now+5200/Math.max(1,Math.min(1.3,pressure));
    if(!alive.size)return [{family:'escorts',delayMs:0}];
    for(let i=0;i<CROSSFIRES.length;i++) {
      const cues=CROSSFIRES[this.cursor++%CROSSFIRES.length].filter(c=>c.family==='escorts'||attackWeapons(c.family,alive).length>0);
      if(cues.some(c=>c.family!=='escorts'))return cues;
    }
    return [{family:'escorts',delayMs:0}];
  }
}
