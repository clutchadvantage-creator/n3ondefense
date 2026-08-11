import type { CosmeticOption } from '../game/types.ts';
import type { CosmeticPriceTier } from '../game/economy/types.ts';

export const getCosmeticPriceTier = (item: CosmeticOption): CosmeticPriceTier => item.priceTier
  ?? (item.currency === 'coreTokens' ? 'rare' : 'standard');

export const COSMETICS: CosmeticOption[] = [
  { id: 'player-cyan', category: 'playerColor', label: 'Cyan Operative', currency: 'credits', cost: 0, color: 0x00f5ff },
  { id: 'player-pink', category: 'playerColor', label: 'Rose Strike', currency: 'credits', cost: 450, color: 0xff4df2 },
  { id: 'player-lime', category: 'playerColor', label: 'Lime Phantom', currency: 'credits', cost: 550, color: 0x5cff7a },
  { id: 'player-amber', category: 'playerColor', label: 'Amber Vanguard', currency: 'credits', cost: 625, color: 0xffbd45 },
  { id: 'player-violet', category: 'playerColor', label: 'Violet Specter', currency: 'credits', cost: 800, color: 0x9d6cff },
  { id: 'player-white', category: 'playerColor', label: 'Prism White', currency: 'coreTokens', cost: 3, color: 0xf1fbff },
  { id: 'player-red', category: 'playerColor', label: 'Crimson Operative', currency: 'credits', cost: 725, color: 0xff506d },
  { id: 'player-prism', category: 'playerColor', label: 'Prism Operative', currency: 'coreTokens', cost: 7, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'player-circle', category: 'playerShape', label: 'Circle Frame', currency: 'credits', cost: 0, color: 0x00f5ff, visualShape: 'circle', textureKey: 'player-circle' },
  { id: 'player-square', category: 'playerShape', label: 'Square Frame', currency: 'credits', cost: 300, color: 0x61f4ff, visualShape: 'square', textureKey: 'player-square' },
  { id: 'player-triangle', category: 'playerShape', label: 'Triangle Frame', currency: 'credits', cost: 450, color: 0xff8fd6, visualShape: 'triangle', textureKey: 'player-triangle' },
  { id: 'player-star', category: 'playerShape', label: 'Star Frame', currency: 'coreTokens', cost: 3, color: 0xffd45c, visualShape: 'star', textureKey: 'player-star' },
  { id: 'player-hexagon', category: 'playerShape', label: 'Hex Core Frame', currency: 'credits', cost: 700, color: 0x6bffde, visualShape: 'hexagon', textureKey: 'player-hexagon' },
  { id: 'player-diamond', category: 'playerShape', label: 'Diamond Vector', currency: 'credits', cost: 825, color: 0xff70c8, visualShape: 'diamond', textureKey: 'player-diamond' },
  { id: 'player-cross', category: 'playerShape', label: 'Crossguard Frame', currency: 'coreTokens', cost: 4, color: 0xffe879, visualShape: 'cross', textureKey: 'player-cross' },
  { id: 'player-spaceship', category: 'playerShape', label: 'Starhopper Frame', currency: 'coreTokens', cost: 6, color: 0x62eaff, visualShape: 'spaceship', textureKey: 'player-spaceship', priceTier: 'prestige' },
  { id: 'player-clover', category: 'playerShape', label: 'Lucky Clover Frame', currency: 'credits', cost: 975, color: 0x66ff91, visualShape: 'clover', textureKey: 'player-clover' },
  { id: 'player-ice-cream', category: 'playerShape', label: 'Neon Scoop Frame', currency: 'credits', cost: 1_100, color: 0xff9edc, visualShape: 'iceCream', textureKey: 'player-ice-cream' },
  { id: 'player-airplane', category: 'playerShape', label: 'Skywing Frame', currency: 'coreTokens', cost: 5, color: 0x7cecff, visualShape: 'airplane', textureKey: 'player-airplane' },

  { id: 'projectile-cyan', category: 'projectileColor', label: 'Pulse Cyan', currency: 'credits', cost: 0, color: 0x4ef9ff },
  { id: 'projectile-orange', category: 'projectileColor', label: 'Thermal Orange', currency: 'credits', cost: 650, color: 0xff9b3d },
  { id: 'projectile-red', category: 'projectileColor', label: 'Crimson Arc', currency: 'coreTokens', cost: 3, color: 0xff3d58 },
  { id: 'projectile-lime', category: 'projectileColor', label: 'Reactor Lime', currency: 'credits', cost: 575, color: 0x72ff72 },
  { id: 'projectile-violet', category: 'projectileColor', label: 'Void Violet', currency: 'credits', cost: 750, color: 0xa570ff },
  { id: 'projectile-gold', category: 'projectileColor', label: 'Solar Gold', currency: 'coreTokens', cost: 4, color: 0xffd84d },
  { id: 'projectile-prism', category: 'projectileColor', label: 'Prism Pulse', currency: 'coreTokens', cost: 6, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'projectile-shape-pulse', category: 'projectileShape', label: 'Pulse Round', currency: 'credits', cost: 0, color: 0x4ef9ff, visualShape: 'pulse', textureKey: 'projectile-pulse' },
  { id: 'projectile-shape-missile', category: 'projectileShape', label: 'Micro Missile', currency: 'credits', cost: 700, color: 0xff9b3d, visualShape: 'missile', textureKey: 'projectile-missile' },
  { id: 'projectile-shape-lightning', category: 'projectileShape', label: 'Lightning Bolt', currency: 'coreTokens', cost: 4, color: 0xffed62, visualShape: 'lightning', textureKey: 'projectile-lightning' },
  { id: 'projectile-shape-orb', category: 'projectileShape', label: 'Photon Orb', currency: 'credits', cost: 525, color: 0xc77dff, visualShape: 'orb', textureKey: 'projectile-orb' },
  { id: 'projectile-shape-sword', category: 'projectileShape', label: 'Arcblade', currency: 'credits', cost: 900, color: 0xbcefff, visualShape: 'sword', textureKey: 'projectile-sword' },
  { id: 'projectile-shape-bubbles', category: 'projectileShape', label: 'Bubble Cluster', currency: 'credits', cost: 650, color: 0x7cecff, visualShape: 'bubbles', textureKey: 'projectile-bubbles' },
  { id: 'projectile-shape-balloons', category: 'projectileShape', label: 'Balloon Barrage', currency: 'coreTokens', cost: 4, color: 0xff79d7, visualShape: 'balloons', textureKey: 'projectile-balloons' },
  { id: 'projectile-shape-carrot', category: 'projectileShape', label: 'Rocket Carrot', currency: 'credits', cost: 800, color: 0xff9d48, visualShape: 'carrot', textureKey: 'projectile-carrot' },

  { id: 'trail-cyan', category: 'trailColor', label: 'Ion Trail', currency: 'credits', cost: 300, color: 0x48e2ff },
  { id: 'trail-purple', category: 'trailColor', label: 'Nova Trail', currency: 'credits', cost: 520, color: 0xac5dff },
  { id: 'trail-pink', category: 'trailColor', label: 'Rose Wake', currency: 'credits', cost: 575, color: 0xff62d7 },
  { id: 'trail-lime', category: 'trailColor', label: 'Toxic Wake', currency: 'credits', cost: 675, color: 0x6dff91 },
  { id: 'trail-gold', category: 'trailColor', label: 'Solar Wake', currency: 'coreTokens', cost: 3, color: 0xffcf5a },
  { id: 'trail-prism', category: 'trailColor', label: 'Prism Wake', currency: 'coreTokens', cost: 6, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'bomb-purple', category: 'bombColor', label: 'Violet Detonation', currency: 'credits', cost: 700, color: 0xbe62ff },
  { id: 'bomb-red', category: 'bombColor', label: 'Scarlet Detonation', currency: 'coreTokens', cost: 4, color: 0xff4d4d },
  { id: 'bomb-cyan', category: 'bombColor', label: 'Cryo Detonation', currency: 'credits', cost: 750, color: 0x4eeaff },
  { id: 'bomb-green', category: 'bombColor', label: 'Emerald Detonation', currency: 'credits', cost: 825, color: 0x55ff8c },
  { id: 'bomb-gold', category: 'bombColor', label: 'Solar Detonation', currency: 'coreTokens', cost: 5, color: 0xffc94f },
  { id: 'bomb-prism', category: 'bombColor', label: 'Prism Detonation', currency: 'coreTokens', cost: 8, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'turret-default', category: 'turretSkin', label: 'Sentinel Cyan', currency: 'credits', cost: 0, color: 0x4ffcff },
  { id: 'turret-orange', category: 'turretSkin', label: 'Sentinel Ember', currency: 'credits', cost: 500, color: 0xff9a33 },
  { id: 'turret-pink', category: 'turretSkin', label: 'Sentinel Rose', currency: 'credits', cost: 625, color: 0xff65d8 },
  { id: 'turret-green', category: 'turretSkin', label: 'Sentinel Reactor', currency: 'credits', cost: 725, color: 0x63ff8e },
  { id: 'turret-violet', category: 'turretSkin', label: 'Sentinel Void', currency: 'coreTokens', cost: 4, color: 0xa978ff },
  { id: 'turret-prism', category: 'turretSkin', label: 'Prism Sentinel', currency: 'coreTokens', cost: 8, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'fence-default', category: 'fenceStyle', label: 'Cyan Lattice', currency: 'credits', cost: 0, color: 0x41d8ff },
  { id: 'fence-green', category: 'fenceStyle', label: 'Green Lattice', currency: 'credits', cost: 450, color: 0x59ff9b },
  { id: 'fence-pink', category: 'fenceStyle', label: 'Rose Lattice', currency: 'credits', cost: 575, color: 0xff59ce },
  { id: 'fence-amber', category: 'fenceStyle', label: 'Amber Lattice', currency: 'credits', cost: 650, color: 0xffb74d },
  { id: 'fence-violet', category: 'fenceStyle', label: 'Void Lattice', currency: 'coreTokens', cost: 3, color: 0x9a6cff },
  { id: 'fence-prism', category: 'fenceStyle', label: 'Prism Lattice', currency: 'coreTokens', cost: 7, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'dash-cyan', category: 'dashTrail', label: 'Dash Ion', currency: 'credits', cost: 0, color: 0x57f8ff },
  { id: 'dash-pink', category: 'dashTrail', label: 'Dash Bloom', currency: 'credits', cost: 550, color: 0xff5ae6 },
  { id: 'dash-green', category: 'dashTrail', label: 'Dash Reactor', currency: 'credits', cost: 625, color: 0x5dff91 },
  { id: 'dash-amber', category: 'dashTrail', label: 'Dash Flare', currency: 'credits', cost: 700, color: 0xffb248 },
  { id: 'dash-violet', category: 'dashTrail', label: 'Dash Rift', currency: 'coreTokens', cost: 4, color: 0xa26cff },
  { id: 'dash-prism', category: 'dashTrail', label: 'Prism Dash', currency: 'coreTokens', cost: 7, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' }
];

const COSMETICS_BY_ID = new Map(COSMETICS.map((cosmetic) => [cosmetic.id, cosmetic]));

export const getCosmeticById = (id: string | null | undefined): CosmeticOption | undefined =>
  id ? COSMETICS_BY_ID.get(id) : undefined;

const prismCategoryPhase: Partial<Record<CosmeticOption['category'], number>> = {
  playerColor: 0,
  projectileColor: 0.12,
  trailColor: 0.24,
  bombColor: 0.38,
  turretSkin: 0.52,
  fenceStyle: 0.68,
  dashTrail: 0.84
};

export const getPrismColor = (timeMs: number, phase = 0): number => {
  const hue = ((timeMs / 3200 + phase) % 1 + 1) % 1;
  const sector = hue * 6;
  const x = 1 - Math.abs(sector % 2 - 1);
  const [r, g, b] = sector < 1 ? [1, x, 0]
    : sector < 2 ? [x, 1, 0]
      : sector < 3 ? [0, 1, x]
        : sector < 4 ? [0, x, 1]
          : sector < 5 ? [x, 0, 1]
            : [1, 0, x];
  const channel = (value: number): number => Math.round((0.22 + value * 0.78) * 255);
  return (channel(r) << 16) | (channel(g) << 8) | channel(b);
};

export const isPrismCosmetic = (item: CosmeticOption | undefined): boolean => item?.colorMode === 'prism';

export const getCosmeticDisplayColor = (item: CosmeticOption, timeMs: number): number =>
  isPrismCosmetic(item) ? getPrismColor(timeMs, prismCategoryPhase[item.category] ?? 0) : item.color;

export const getCosmeticTextureKey = (id: string | null, fallback: string): string =>
  getCosmeticById(id)?.textureKey ?? fallback;
