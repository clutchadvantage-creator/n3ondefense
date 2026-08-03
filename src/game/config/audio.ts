export const SFX_DEFINITIONS = [
  { key: 'shot', label: 'Weapon Fire' },
  { key: 'boost', label: 'Boost' },
  { key: 'planting', label: 'Planting' },
  { key: 'hit', label: 'Enemy Hit' },
  { key: 'playerDamage', label: 'Player Damage' },
  { key: 'enemyDeath', label: 'Enemy Death' },
  { key: 'playerDeath', label: 'Player Death' },
  { key: 'place', label: 'Ability Place' },
  { key: 'mine', label: 'Mine Detonation' },
  { key: 'beep', label: 'Charge Beep' },
  { key: 'defuseAlarm', label: 'Defuse Alarm' },
  { key: 'bomb', label: 'Explosion' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'menu', label: 'Menu Select' }
] as const;

export type AudioSfxName = typeof SFX_DEFINITIONS[number]['key'];

export const createDefaultSoundVolumes = (): Record<AudioSfxName, number> => {
  const volumes = {} as Record<AudioSfxName, number>;
  for (const definition of SFX_DEFINITIONS) volumes[definition.key] = 1;
  return volumes;
};
