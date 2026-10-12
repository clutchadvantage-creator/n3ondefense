import type { CosmeticOption } from '../game/types.ts';

export const HALLOWEEN_SETS = {
  witch: { label: 'HEXCRAFT', color: 0xc375ff, accentColor: 0x9dff77, frame: 'witchFrame', projectile: 'witchBolt' },
  bats: { label: 'NIGHTSWARM', color: 0xc077ff, accentColor: 0x55eeff, frame: 'batFrame', projectile: 'batShard' },
  pumpkin: { label: 'JACK-O-REACTOR', color: 0xff942e, accentColor: 0x77ffcc, frame: 'pumpkinFrame', projectile: 'pumpkinSeed' }
} as const;

/** Existing Witch/Bats explosion IDs stay in cosmetics.ts for save compatibility. */
export const HALLOWEEN_COSMETICS: CosmeticOption[] = Object.entries(HALLOWEEN_SETS).flatMap(([key, set]) => {
  const halloweenSet = key as keyof typeof HALLOWEEN_SETS;
  const shared = { holiday: 'halloween', halloweenSet, priceTier: 'prestige', currency: 'credits', color: set.color, accentColor: set.accentColor } as const;
  const effect = `halloween-${halloweenSet}` as const;
  return [
    { ...shared, id: `player-${effect}`, category: 'playerShape', label: `${set.label} Operative`, cost: 16_000, additionalCosts: { coreTokens: 320, plasmaChips: 45 },
      visualShape: set.frame, textureKey: `player-premium-${effect}`, nativeTextureKey: `player-premium-${effect}-native`,
      description: halloweenSet === 'witch' ? 'A spell-forged combat witch with a towering circuit-woven hat, spectral optics, armored robes and twin arcane thrusters.' : halloweenSet === 'bats' ? 'A nocturnal interceptor with scalloped plasma wings, articulated spars, fang armor and a luminous sonar core.' : 'An armored jack-o\'-lantern reactor with carved plasma optics, segmented copper plating, vine circuitry and twin vector engines.' },
    { ...shared, id: `turret-${effect}`, category: 'turretSkin', label: `${set.label} Sentry`, cost: 14_000, additionalCosts: { coreTokens: 280, plasmaChips: 35 }, turretSkinEffect: effect,
      description: halloweenSet === 'witch' ? 'A levitating hex cannon above a runic containment pedestal. Its crystal muzzle charges with every shot.' : halloweenSet === 'bats' ? 'A bat-wing sonar sentry with fang barrels, layered wing armor and a pulsing midnight core.' : 'A grinning pumpkin siege turret on a heavy reactor mount, with copper cooling fins and a mint-plasma cannon.' },
    { ...shared, id: `mine-${effect}`, category: 'mineFrame', label: `${set.label} Mine`, cost: 11_000, additionalCosts: { coreTokens: 220, plasmaChips: 20 }, mineFrameEffect: effect, textureKey: `mine-${effect}`,
      description: halloweenSet === 'witch' ? 'A sealed cyber-cauldron with bubbling reactor glass, a spell-lock and three magnetic feet.' : halloweenSet === 'bats' ? 'A folded-wing roost trap with ultrasonic sensors, fanged clamps and a luminous arming gem.' : 'A squat jack-o\'-lantern charge with a pressure-lit grin, mechanical stem and reinforced petal feet.' },
    { ...shared, id: `projectile-${effect}`, category: 'projectileShape', label: `${set.label} ${halloweenSet === 'witch' ? 'Hex Bolt' : halloweenSet === 'bats' ? 'Fang' : 'Seed'}`, cost: 12_000, additionalCosts: { coreTokens: 240, plasmaChips: 25 },
      visualShape: set.projectile, textureKey: `projectile-premium-${effect}`, preserveNativePalette: true,
      description: halloweenSet === 'witch' ? 'A faceted spell crystal carried by a crescent-shaped containment cage and a luminous rune trail.' : halloweenSet === 'bats' ? 'A razor-wing bat dart with an obsidian body, bright sonar eyes and two neon-edged fins.' : 'A molten pumpkin seed in a copper sabot, split by mint plasma and trailed by ember fins.' }
  ];
});

HALLOWEEN_COSMETICS.push({
  id: 'bomb-pumpkin-reactor', category: 'bombColor', label: 'Jack-o-Reactor', holiday: 'halloween', halloweenSet: 'pumpkin',
  currency: 'credits', cost: 20_000, additionalCosts: { coreTokens: 400, plasmaChips: 90 }, priceTier: 'prestige',
  color: 0xff942e, accentColor: 0x77ffcc, bombExplosionEffect: 'pumpkin-reactor', previewRenderer: 'bomb-pumpkin-reactor',
  description: 'A colossal jack-o\'-lantern erupts from a reactor seal, laughs through molten teeth, then bursts into a spiraling harvest of neon embers.'
});
