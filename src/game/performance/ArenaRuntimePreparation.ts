import type { RunProtocolId } from '../mods/types.ts';

export interface ArenaCombatWarmupPlan {
  projectiles: number;
  fxCircles: number;
  trailSamples: number;
  destructionFragments: number;
}

/**
 * Capacity prepared before a generation becomes playable. These are retained
 * object counts, not gameplay caps: combat may still grow beyond them and no
 * projectile, split child, or effect is suppressed.
 */
export const arenaCombatWarmupPlan = (
  protocol: RunProtocolId,
  round: number,
  particlesEnabled: boolean
): ArenaCombatWarmupPlan => {
  const safeRound = Math.max(1, Math.floor(round));
  const supreme = protocol.startsWith('supreme-');
  const overdrive = !supreme && protocol !== 'normal';
  const baseProjectiles = supreme ? 480 : overdrive ? 300 : 180;
  const roundReserve = Math.min(supreme ? 240 : 160, Math.floor(safeRound / 5) * 20);
  const projectiles = Math.min(768, baseProjectiles + roundReserve);
  const fxBase = particlesEnabled ? (supreme ? 176 : overdrive ? 128 : 88) : 56;
  return {
    projectiles,
    fxCircles: Math.min(256, fxBase + Math.floor(safeRound / 10) * 12),
    trailSamples: Math.min(1024, Math.max(320, Math.floor(projectiles * 1.35))),
    destructionFragments: particlesEnabled ? (supreme ? 144 : overdrive ? 112 : 80) : 24
  };
};
