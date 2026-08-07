import type { CosmeticOption } from '../game/types.ts';

export const COSMETICS: CosmeticOption[] = [
  { id: 'player-cyan', category: 'playerColor', label: 'Cyan Operative', currency: 'credits', cost: 0, color: 0x00f5ff },
  { id: 'player-pink', category: 'playerColor', label: 'Rose Strike', currency: 'credits', cost: 450, color: 0xff4df2 },
  { id: 'player-lime', category: 'playerColor', label: 'Lime Phantom', currency: 'credits', cost: 550, color: 0x5cff7a },
  { id: 'player-circle', category: 'playerShape', label: 'Circle Frame', currency: 'credits', cost: 0, color: 0x00f5ff },
  { id: 'player-square', category: 'playerShape', label: 'Square Frame', currency: 'credits', cost: 300, color: 0x61f4ff },
  { id: 'player-triangle', category: 'playerShape', label: 'Triangle Frame', currency: 'credits', cost: 450, color: 0xff8fd6 },
  { id: 'player-star', category: 'playerShape', label: 'Star Frame', currency: 'coreTokens', cost: 3, color: 0xffd45c },
  { id: 'projectile-cyan', category: 'projectileColor', label: 'Pulse Cyan', currency: 'credits', cost: 0, color: 0x4ef9ff },
  { id: 'projectile-orange', category: 'projectileColor', label: 'Thermal Orange', currency: 'credits', cost: 650, color: 0xff9b3d },
  { id: 'projectile-red', category: 'projectileColor', label: 'Crimson Arc', currency: 'coreTokens', cost: 3, color: 0xff3d58 },
  { id: 'trail-cyan', category: 'trailColor', label: 'Ion Trail', currency: 'credits', cost: 300, color: 0x48e2ff },
  { id: 'trail-purple', category: 'trailColor', label: 'Nova Trail', currency: 'credits', cost: 520, color: 0xac5dff },
  { id: 'bomb-purple', category: 'bombColor', label: 'Violet Detonation', currency: 'credits', cost: 700, color: 0xbe62ff },
  { id: 'bomb-red', category: 'bombColor', label: 'Scarlet Detonation', currency: 'coreTokens', cost: 4, color: 0xff4d4d },
  { id: 'turret-default', category: 'turretSkin', label: 'Sentinel Cyan', currency: 'credits', cost: 0, color: 0x4ffcff },
  { id: 'turret-orange', category: 'turretSkin', label: 'Sentinel Ember', currency: 'credits', cost: 500, color: 0xff9a33 },
  { id: 'fence-default', category: 'fenceStyle', label: 'Cyan Lattice', currency: 'credits', cost: 0, color: 0x41d8ff },
  { id: 'fence-green', category: 'fenceStyle', label: 'Green Lattice', currency: 'credits', cost: 450, color: 0x59ff9b },
  { id: 'dash-cyan', category: 'dashTrail', label: 'Dash Ion', currency: 'credits', cost: 0, color: 0x57f8ff },
  { id: 'dash-pink', category: 'dashTrail', label: 'Dash Bloom', currency: 'credits', cost: 550, color: 0xff5ae6 }
];
