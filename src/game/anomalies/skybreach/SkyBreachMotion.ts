import type { Formation, SkyRole } from './SkyBreachDirector.ts';

/** Forward fire banks gently with lateral movement; no pointer/stick aim input. */
export const skyForwardAim = (x: number, y: number, lateral: number) => ({
  x: x + Math.max(-1, Math.min(1, lateral)) * 45, y: y - 180
});

export const SKY_DURABILITY: Record<SkyRole, number> = {
  drone: 1.35, interceptor: 1.65, strike: 2.8, tank: 1.5, zeppelin: 7, aa: 1.8
};

/** Velocity patterns preserve physics knockback/slow and use active simulation age. */
export function flightVelocity(role: SkyRole, pattern: Formation, age: number,
  direction: number, phase: number, speed: number, y: number, targetDx: number) {
  if (role === 'tank') return { x: 0, y: 38 };
  if (role === 'aa') return { x: 0, y: 49 };
  if (role === 'zeppelin') return { x: Math.sin(age * .45) * 18, y: y < 245 ? 38 : 6 };
  const side = direction || (phase % 2 ? -1 : 1);
  if (age > 9) return { x: side * speed * .8, y: speed * 1.25 };
  if (role === 'drone') return {
    x: Math.max(-speed * .55, Math.min(speed * .55, targetDx * .65)) + Math.sin(age * 3 + phase) * speed * .38,
    y: speed * .9
  };
  if (role === 'strike') return { x: age < 2 ? 0 : side * Math.sin((age - 2) * .7) * speed * .65,
    y: speed * (age < 2 ? .8 : .3) };
  if (pattern === 'crossing') return { x: direction * speed * 1.05, y: speed * .55 };
  if (pattern === 'diagonal') return { x: side * speed * .7, y: speed * 1.05 };
  if (pattern === 'split') return { x: side * speed * (age < 2.4 ? .8 : -.65), y: speed * .85 };
  if (pattern === 'staggered') return { x: age < 1.8 + phase * .15 ? 0 : side * speed * .95, y: speed * .75 };
  if (pattern === 'v') return { x: age < 3 ? 0 : side * speed * .48, y: speed * 1.1 };
  return { x: Math.sin(age * 1.8 + phase) * speed * .48, y: speed * 1.05 };
}
