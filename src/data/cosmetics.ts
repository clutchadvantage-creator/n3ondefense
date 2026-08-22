import type { CosmeticOption } from '../game/types.ts';
import type { CosmeticPriceTier } from '../game/economy/types.ts';

export const getCosmeticPriceTier = (item: CosmeticOption): CosmeticPriceTier => item.priceTier
  ?? (item.currency === 'plasmaChips' ? 'prestige' : item.currency === 'coreTokens' ? 'rare' : 'standard');

export const isPremiumCosmetic = (item: CosmeticOption): boolean => getCosmeticPriceTier(item) === 'prestige';

export interface CosmeticPurchaseCosts { credits: number; coreTokens: number; plasmaChips: number }

export const getCosmeticPurchaseCosts = (item: CosmeticOption): CosmeticPurchaseCosts => {
  const costs: CosmeticPurchaseCosts = { credits: 0, coreTokens: 0, plasmaChips: 0 };
  costs[item.currency] = Math.max(0, Math.floor(item.cost));
  for (const currency of ['credits', 'coreTokens', 'plasmaChips'] as const) {
    costs[currency] += Math.max(0, Math.floor(item.additionalCosts?.[currency] ?? 0));
  }
  return costs;
};

export const COSMETICS: CosmeticOption[] = [
  { id: 'player-cyan', category: 'playerColor', label: 'Cyan Operative', currency: 'credits', cost: 0, color: 0x00f5ff },
  { id: 'player-pink', category: 'playerColor', label: 'Rose Strike', currency: 'credits', cost: 450, color: 0xff4df2 },
  { id: 'player-lime', category: 'playerColor', label: 'Lime Phantom', currency: 'credits', cost: 550, color: 0x5cff7a },
  { id: 'player-amber', category: 'playerColor', label: 'Amber Vanguard', currency: 'credits', cost: 625, color: 0xffbd45 },
  { id: 'player-violet', category: 'playerColor', label: 'Violet Specter', currency: 'credits', cost: 800, color: 0x9d6cff },
  { id: 'player-white', category: 'playerColor', label: 'Prism White', currency: 'credits', cost: 650, color: 0xf1fbff },
  { id: 'player-red', category: 'playerColor', label: 'Crimson Operative', currency: 'credits', cost: 725, color: 0xff506d },
  { id: 'player-prism', category: 'playerColor', label: 'Prism Operative', currency: 'coreTokens', cost: 220, additionalCosts: { credits: 7_500 }, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'player-circle', category: 'playerShape', label: 'Circle Frame', currency: 'credits', cost: 0, color: 0x00f5ff, visualShape: 'circle', textureKey: 'player-circle' },
  { id: 'player-square', category: 'playerShape', label: 'Square Frame', currency: 'credits', cost: 300, color: 0x61f4ff, visualShape: 'square', textureKey: 'player-square' },
  { id: 'player-triangle', category: 'playerShape', label: 'Triangle Frame', currency: 'credits', cost: 450, color: 0xff8fd6, visualShape: 'triangle', textureKey: 'player-triangle' },
  { id: 'player-star', category: 'playerShape', label: 'Star Frame', currency: 'credits', cost: 600, color: 0xffd45c, visualShape: 'star', textureKey: 'player-star' },
  { id: 'player-hexagon', category: 'playerShape', label: 'Hex Core Frame', currency: 'credits', cost: 700, color: 0x6bffde, visualShape: 'hexagon', textureKey: 'player-hexagon' },
  { id: 'player-diamond', category: 'playerShape', label: 'Diamond Vector', currency: 'credits', cost: 825, color: 0xff70c8, visualShape: 'diamond', textureKey: 'player-diamond' },
  { id: 'player-cross', category: 'playerShape', label: 'Crossguard Frame', currency: 'credits', cost: 775, color: 0xffe879, visualShape: 'cross', textureKey: 'player-cross' },
  { id: 'player-spaceship', category: 'playerShape', label: 'Starhopper Frame', currency: 'coreTokens', cost: 180, additionalCosts: { credits: 6_000 }, color: 0x62eaff, visualShape: 'spaceship', textureKey: 'player-spaceship', priceTier: 'prestige' },
  { id: 'player-clover', category: 'playerShape', label: 'Lucky Clover Frame', currency: 'credits', cost: 975, color: 0x66ff91, visualShape: 'clover', textureKey: 'player-clover' },
  { id: 'player-ice-cream', category: 'playerShape', label: 'Neon Scoop Frame', currency: 'credits', cost: 1_100, color: 0xff9edc, visualShape: 'iceCream', textureKey: 'player-ice-cream' },
  { id: 'player-airplane', category: 'playerShape', label: 'Skywing Frame', currency: 'credits', cost: 1_250, color: 0x7cecff, visualShape: 'airplane', textureKey: 'player-airplane' },
  { id: 'player-ufo', category: 'playerShape', label: 'Orbit Saucer Frame', currency: 'coreTokens', cost: 240, additionalCosts: { credits: 8_500, plasmaChips: 40 }, color: 0x8dffcf, visualShape: 'ufo', textureKey: 'player-ufo', priceTier: 'prestige' },
  {
    id: 'player-critical-crunch', category: 'playerShape', label: 'CRITICAL CRUNCH', currency: 'credits', cost: 10_000,
    additionalCosts: { coreTokens: 220 }, color: 0xffd84f, accentColor: 0xff5bce, visualShape: 'cerealBox',
    textureKey: 'player-premium-critical-crunch', priceTier: 'prestige', previewScale: 0.94,
    description: 'Weaponized breakfast technology: folded carton armor, counterfeit cereal graphics, nutrition telemetry, and a deeply suspicious mascot.'
  },
  {
    id: 'player-probe-ably-fine', category: 'playerShape', label: 'PROBE-ABLY FINE', currency: 'credits', cost: 12_000,
    additionalCosts: { coreTokens: 250 }, color: 0x8cffc9, accentColor: 0x70eaff, visualShape: 'alienHead',
    textureKey: 'player-premium-probe-fine', priceTier: 'prestige', previewScale: 0.96,
    description: 'An oversized alien command cranium with reflective void eyes, cybernetic glyphs, and absolutely normal intentions.'
  },
  {
    id: 'player-midlife-crisis-mk4', category: 'playerShape', label: 'MIDLIFE CRISIS Mk. IV', currency: 'credits', cost: 20_000,
    additionalCosts: { coreTokens: 400, plasmaChips: 90 }, color: 0xff4d72, accentColor: 0x62efff, visualShape: 'hypercar',
    textureKey: 'player-premium-midlife-crisis', priceTier: 'prestige', previewScale: 0.96,
    description: 'A needlessly expensive low-slung hypercar frame with active aero, oversized intakes, racing hardware, and weaponized underglow.'
  },
  {
    id: 'player-highly-tactical', category: 'playerShape', label: 'HIGHLY TACTICAL', currency: 'credits', cost: 13_000,
    additionalCosts: { coreTokens: 270, plasmaChips: 25 }, color: 0x67ff70, accentColor: 0x7cecff, visualShape: 'cyberLeaf',
    textureKey: 'player-premium-highly-tactical', priceTier: 'prestige', previewScale: 0.94,
    description: 'A seven-bladed botanical combat platform threaded with luminous veins and highly classified recreational circuitry.'
  },
  {
    id: 'player-tug-life', category: 'playerShape', label: 'TUG LIFE', currency: 'credits', cost: 10_500,
    additionalCosts: { coreTokens: 220 }, color: 0xffb94f, accentColor: 0x61efff, visualShape: 'tugboat',
    textureKey: 'player-premium-tug-life', priceTier: 'prestige', previewScale: 0.94,
    description: 'A compact harbor bruiser with a fendered hull, raised wheelhouse, deck rails, navigation lamps, radar, and more torque than dignity.'
  },
  {
    id: 'player-air-superiority-complex', category: 'playerShape', label: 'AIR SUPERIORITY COMPLEX', currency: 'credits', cost: 18_000,
    additionalCosts: { coreTokens: 350, plasmaChips: 65 }, color: 0x65eaff, accentColor: 0xff5fca, visualShape: 'stealthWing',
    textureKey: 'player-premium-air-superiority', priceTier: 'prestige', previewScale: 0.94,
    description: 'A broad tailless stealth interceptor with a radically different flying-wing silhouette, twin intakes, split control surfaces, and cold engine light.'
  },
  {
    id: 'player-eye-dont-like-that', category: 'playerShape', label: "EYE DON'T LIKE THAT", currency: 'credits', cost: 20_000,
    additionalCosts: { coreTokens: 400, plasmaChips: 90 }, color: 0xeaf7ff, accentColor: 0xff4b81, visualShape: 'eyeball',
    textureKey: 'player-premium-eye-dont-like-that', priceTier: 'prestige', previewScale: 0.98,
    description: 'A sleepless surveillance organ with concentric iris hardware, a light-swallowing pupil, glossy reflections, and crawling corrupted veins.'
  },
  {
    id: 'player-roll-model', category: 'playerShape', label: 'ROLL MODEL', currency: 'credits', cost: 15_000,
    additionalCosts: { coreTokens: 300, plasmaChips: 45 }, color: 0xb66cff, accentColor: 0x68f4ff, visualShape: 'wheelchair',
    textureKey: 'player-premium-roll-model', priceTier: 'prestige', previewScale: 0.94,
    description: 'A neon racing wheelchair with performance rims, visible spokes, reinforced seating, articulated footrests, and compact boost hardware.'
  },
  {
    id: 'player-ribbit-exe', category: 'playerShape', label: 'RIBBIT.EXE', currency: 'credits', cost: 11_000,
    additionalCosts: { coreTokens: 230, plasmaChips: 20 }, color: 0x70ff79, accentColor: 0x6eefff, visualShape: 'frog',
    textureKey: 'player-premium-ribbit-exe', priceTier: 'prestige', previewScale: 0.96,
    description: 'A wide-eyed cyber frog with powerful rear legs, webbed hardware, toxic markings, expressive optics, and one extremely executable grin.'
  },

  { id: 'projectile-cyan', category: 'projectileColor', label: 'Pulse Cyan', currency: 'credits', cost: 0, color: 0x4ef9ff },
  { id: 'projectile-orange', category: 'projectileColor', label: 'Thermal Orange', currency: 'credits', cost: 650, color: 0xff9b3d },
  { id: 'projectile-red', category: 'projectileColor', label: 'Crimson Arc', currency: 'credits', cost: 725, color: 0xff3d58 },
  { id: 'projectile-lime', category: 'projectileColor', label: 'Reactor Lime', currency: 'credits', cost: 575, color: 0x72ff72 },
  { id: 'projectile-violet', category: 'projectileColor', label: 'Void Violet', currency: 'credits', cost: 750, color: 0xa570ff },
  { id: 'projectile-gold', category: 'projectileColor', label: 'Solar Gold', currency: 'credits', cost: 825, color: 0xffd84d },
  { id: 'projectile-prism', category: 'projectileColor', label: 'Prism Pulse', currency: 'coreTokens', cost: 190, additionalCosts: { credits: 6_500 }, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'projectile-shape-pulse', category: 'projectileShape', label: 'Pulse Round', currency: 'credits', cost: 0, color: 0x4ef9ff, visualShape: 'pulse', textureKey: 'projectile-pulse' },
  { id: 'projectile-shape-missile', category: 'projectileShape', label: 'Micro Missile', currency: 'credits', cost: 700, color: 0xff9b3d, visualShape: 'missile', textureKey: 'projectile-missile' },
  { id: 'projectile-shape-lightning', category: 'projectileShape', label: 'Lightning Bolt', currency: 'credits', cost: 850, color: 0xffed62, visualShape: 'lightning', textureKey: 'projectile-lightning' },
  { id: 'projectile-shape-orb', category: 'projectileShape', label: 'Photon Orb', currency: 'credits', cost: 525, color: 0xc77dff, visualShape: 'orb', textureKey: 'projectile-orb' },
  { id: 'projectile-shape-sword', category: 'projectileShape', label: 'Arcblade', currency: 'credits', cost: 900, color: 0xbcefff, visualShape: 'sword', textureKey: 'projectile-sword' },
  { id: 'projectile-shape-bubbles', category: 'projectileShape', label: 'Bubble Cluster', currency: 'credits', cost: 650, color: 0x7cecff, visualShape: 'bubbles', textureKey: 'projectile-bubbles' },
  { id: 'projectile-shape-balloons', category: 'projectileShape', label: 'Balloon Barrage', currency: 'credits', cost: 900, color: 0xff79d7, visualShape: 'balloons', textureKey: 'projectile-balloons' },
  { id: 'projectile-shape-carrot', category: 'projectileShape', label: 'Rocket Carrot', currency: 'credits', cost: 800, color: 0xff9d48, visualShape: 'carrot', textureKey: 'projectile-carrot' },

  { id: 'trail-cyan', category: 'trailColor', label: 'Ion Trail', currency: 'credits', cost: 300, color: 0x48e2ff },
  { id: 'trail-purple', category: 'trailColor', label: 'Nova Trail', currency: 'credits', cost: 520, color: 0xac5dff },
  { id: 'trail-pink', category: 'trailColor', label: 'Rose Wake', currency: 'credits', cost: 575, color: 0xff62d7 },
  { id: 'trail-lime', category: 'trailColor', label: 'Toxic Wake', currency: 'credits', cost: 675, color: 0x6dff91 },
  { id: 'trail-gold', category: 'trailColor', label: 'Solar Wake', currency: 'credits', cost: 750, color: 0xffcf5a },
  { id: 'trail-prism', category: 'trailColor', label: 'Prism Wake', currency: 'plasmaChips', cost: 70, additionalCosts: { credits: 7_500, coreTokens: 200 }, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'bomb-purple', category: 'bombColor', label: 'Violet Detonation', currency: 'credits', cost: 700, color: 0xbe62ff },
  { id: 'bomb-red', category: 'bombColor', label: 'Scarlet Detonation', currency: 'credits', cost: 825, color: 0xff4d4d },
  { id: 'bomb-cyan', category: 'bombColor', label: 'Cryo Detonation', currency: 'credits', cost: 750, color: 0x4eeaff },
  { id: 'bomb-green', category: 'bombColor', label: 'Emerald Detonation', currency: 'credits', cost: 825, color: 0x55ff8c },
  { id: 'bomb-gold', category: 'bombColor', label: 'Solar Detonation', currency: 'credits', cost: 900, color: 0xffc94f },
  { id: 'bomb-prism', category: 'bombColor', label: 'Prism Detonation', currency: 'coreTokens', cost: 260, additionalCosts: { credits: 9_500 }, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },
  {
    id: 'bomb-death-signal',
    category: 'bombColor',
    label: 'Death Signal',
    currency: 'credits',
    cost: 12_000,
    additionalCosts: { coreTokens: 250 },
    color: 0x62efff,
    accentColor: 0xff56ce,
    previewColor: 0x62efff,
    previewEffect: 'skull-form-dissolve',
    previewRenderer: 'bomb-death-signal',
    bombExplosionEffect: 'death-signal',
    priceTier: 'prestige',
    description: 'A spectral cyber-skull forms from the detonation plasma, ignites its eyes, then fractures into corrupted arcade data.'
  },
  {
    id: 'bomb-neon-bloom',
    category: 'bombColor',
    label: 'Neon Bloom',
    currency: 'credits',
    cost: 10_000,
    additionalCosts: { coreTokens: 220 },
    color: 0xff64d7,
    accentColor: 0x6af7ff,
    previewColor: 0xff64d7,
    previewEffect: 'flower-burst-dissolve',
    previewRenderer: 'bomb-neon-bloom',
    bombExplosionEffect: 'neon-bloom',
    priceTier: 'prestige',
    description: 'The blast violently blooms into a multicolored cyber-flower storm of rotating blossoms, petals, pollen, and digital fragments.'
  },
  {
    id: 'bomb-neon-bats',
    category: 'bombColor',
    label: 'Nightwing Swarm',
    currency: 'credits',
    cost: 18_000,
    additionalCosts: { coreTokens: 350, plasmaChips: 50 },
    color: 0xb05cff,
    accentColor: 0xff4fc8,
    previewColor: 0xb05cff,
    previewEffect: 'neon-bat-swarm',
    previewRenderer: 'bomb-neon-bats',
    bombExplosionEffect: 'neon-bats',
    priceTier: 'prestige',
    description: 'The bombsite fractures into a neon night swarm. Cyber-bats spiral outward and flap through the blast haze before dissolving.'
  },
  {
    id: 'bomb-witch-signal',
    category: 'bombColor',
    label: 'Hexcaster Signal',
    currency: 'plasmaChips',
    cost: 90,
    additionalCosts: { credits: 20_000, coreTokens: 400 },
    color: 0x75ff73,
    accentColor: 0xc65cff,
    previewColor: 0x75ff73,
    previewEffect: 'witch-face-apparition',
    previewRenderer: 'bomb-witch-signal',
    bombExplosionEffect: 'witch-signal',
    priceTier: 'prestige',
    description: 'A grinning neon witch in a towering hat erupts over the bombsite, cackling in violet static before burning out.'
  },

  { id: 'turret-default', category: 'turretSkin', label: 'Sentinel Cyan', currency: 'credits', cost: 0, color: 0x4ffcff },
  { id: 'turret-orange', category: 'turretSkin', label: 'Sentinel Ember', currency: 'credits', cost: 500, color: 0xff9a33 },
  { id: 'turret-pink', category: 'turretSkin', label: 'Sentinel Rose', currency: 'credits', cost: 625, color: 0xff65d8 },
  { id: 'turret-green', category: 'turretSkin', label: 'Sentinel Reactor', currency: 'credits', cost: 725, color: 0x63ff8e },
  { id: 'turret-violet', category: 'turretSkin', label: 'Sentinel Void', currency: 'credits', cost: 800, color: 0xa978ff },
  { id: 'turret-prism', category: 'turretSkin', label: 'Prism Sentinel', currency: 'coreTokens', cost: 225, additionalCosts: { credits: 8_500 }, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'fence-default', category: 'fenceStyle', label: 'Cyan Lattice', currency: 'credits', cost: 0, color: 0x41d8ff },
  { id: 'fence-green', category: 'fenceStyle', label: 'Green Lattice', currency: 'credits', cost: 450, color: 0x59ff9b },
  { id: 'fence-pink', category: 'fenceStyle', label: 'Rose Lattice', currency: 'credits', cost: 575, color: 0xff59ce },
  { id: 'fence-amber', category: 'fenceStyle', label: 'Amber Lattice', currency: 'credits', cost: 650, color: 0xffb74d },
  { id: 'fence-violet', category: 'fenceStyle', label: 'Void Lattice', currency: 'credits', cost: 725, color: 0x9a6cff },
  { id: 'fence-prism', category: 'fenceStyle', label: 'Prism Lattice', currency: 'coreTokens', cost: 210, additionalCosts: { credits: 7_500 }, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige' },

  { id: 'dash-cyan', category: 'dashTrail', label: 'Dash Ion', currency: 'credits', cost: 0, color: 0x57f8ff, dashTrailEffect: 'ion' },
  { id: 'dash-pink', category: 'dashTrail', label: 'Dash Bloom', currency: 'credits', cost: 550, color: 0xff5ae6, dashTrailEffect: 'ion' },
  { id: 'dash-green', category: 'dashTrail', label: 'Dash Reactor', currency: 'credits', cost: 625, color: 0x5dff91, dashTrailEffect: 'ion' },
  { id: 'dash-amber', category: 'dashTrail', label: 'Dash Flare', currency: 'credits', cost: 700, color: 0xffb248, dashTrailEffect: 'ion' },
  { id: 'dash-violet', category: 'dashTrail', label: 'Dash Rift', currency: 'credits', cost: 825, color: 0xa26cff, dashTrailEffect: 'ion' },
  { id: 'dash-prism', category: 'dashTrail', label: 'Prism Dash', currency: 'coreTokens', cost: 200, additionalCosts: { credits: 7_000 }, color: 0xffffff, colorMode: 'prism', priceTier: 'prestige', dashTrailEffect: 'ion' },
  { id: 'dash-firestorm', category: 'dashTrail', label: 'Firestorm Wake', currency: 'credits', cost: 8_500, additionalCosts: { coreTokens: 180 }, color: 0xff6a24, accentColor: 0xffd35c, priceTier: 'prestige', dashTrailEffect: 'fire-smoke', description: 'A long, turbulent wake of hot neon flame, embers, and rolling smoke.' },
  { id: 'dash-grass', category: 'dashTrail', label: 'Neon Mower', currency: 'credits', cost: 6_500, additionalCosts: { coreTokens: 140 }, color: 0x69ff58, accentColor: 0xe5ff69, priceTier: 'prestige', dashTrailEffect: 'grass-clippings', description: 'Sprays bright green cyber-grass clippings into the operative wake.' },
  { id: 'dash-bubbles', category: 'dashTrail', label: 'Bubble Drive', currency: 'credits', cost: 7_500, additionalCosts: { coreTokens: 160 }, color: 0x5feaff, accentColor: 0xff81df, priceTier: 'prestige', dashTrailEffect: 'bubbles', description: 'Leaves buoyant, iridescent bubbles tumbling behind every dash.' },
  { id: 'dash-plasma', category: 'dashTrail', label: 'Plasma Rift', currency: 'coreTokens', cost: 240, additionalCosts: { credits: 11_000, plasmaChips: 55 }, color: 0xb75cff, accentColor: 0x64f5ff, priceTier: 'prestige', dashTrailEffect: 'plasma', description: 'Tears open a vivid plasma wake threaded with cyan electrical arcs.' },
  { id: 'dash-jet-plume', category: 'dashTrail', label: 'Afterburner Plume', currency: 'plasmaChips', cost: 95, additionalCosts: { credits: 15_000, coreTokens: 300 }, color: 0x55eaff, accentColor: 0xffb44f, priceTier: 'prestige', dashTrailEffect: 'jet-plume', description: 'A focused jet-engine afterburner with shock diamonds and a dense exhaust plume.' },
  { id: 'dash-stars', category: 'dashTrail', label: 'Starfall Wake', currency: 'coreTokens', cost: 320, additionalCosts: { credits: 16_000 }, color: 0xffed68, accentColor: 0xff71d6, priceTier: 'prestige', dashTrailEffect: 'stars', description: 'Fires spinning neon stars outward in a bright arcade constellation.' }
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
