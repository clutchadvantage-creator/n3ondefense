export const SFX_DEFINITIONS = [
  { key: 'shot', label: 'Weapon Fire' },
  { key: 'boost', label: 'Boost' },
  { key: 'shieldOn', label: 'Shield Activation' },
  { key: 'shieldOff', label: 'Shield Deactivation' },
  { key: 'planting', label: 'Planting' },
  { key: 'hit', label: 'Enemy Hit' },
  { key: 'playerDamage', label: 'Player Damage' },
  { key: 'lowHealth', label: 'Low Health Warning' },
  { key: 'enemyDeath', label: 'Enemy Death' },
  { key: 'playerDeath', label: 'Player Death' },
  { key: 'place', label: 'Ability Place' },
  { key: 'placeTurret', label: 'Turret Placement' },
  { key: 'electricFence', label: 'Electric Fence Placement' },
  { key: 'placeMine', label: 'Mine Placement' },
  { key: 'unavailable', label: 'Ability Unavailable' },
  { key: 'mine', label: 'Mine Detonation' },
  { key: 'securityLaser', label: 'Security Lasers' },
  { key: 'bomblet', label: 'Bomblet Explosion' },
  { key: 'beep', label: 'Charge Beep' },
  { key: 'defuseAlarm', label: 'Defuse Alarm' },
  { key: 'disarm', label: 'Enemy Disarming' },
  { key: 'bomb', label: 'Explosion' },
  { key: 'gas', label: 'Gas Release' },
  { key: 'gasCanImpact', label: 'Gas Canister Impact' },
  { key: 'gasFizz', label: 'Gas Venting' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'healthPickup', label: 'Health Pickup' },
  { key: 'energyPickup', label: 'Energy Pickup' },
  { key: 'damageBoostPickup', label: 'Damage Boost Pickup' },
  { key: 'speedPickup', label: 'Speed Boost Pickup' },
  { key: 'fireRatePickup', label: 'Fire Rate Pickup' },
  { key: 'creditPickup', label: 'Credit Pickup' },
  { key: 'coreTokenPickup', label: 'Core Token Pickup' },
  { key: 'fluxCorePickup', label: 'Flux Core Pickup' },
  { key: 'ricochetPickup', label: 'Ricochet Rounds Pickup' },
  { key: 'grenadeRoundsPickup', label: 'Grenade Rounds Pickup' },
  { key: 'scattershotPickup', label: 'Scattershot Pickup' },
  { key: 'modPickup', label: 'Mod Pickup' },
  { key: 'fluxCore', label: 'Flux Core Energy' },
  { key: 'lasersOff', label: 'Security Lasers Offline' },
  { key: 'modCollection', label: 'Mod Acquired' },
  { key: 'legendaryMod', label: 'Legendary Mod' },
  { key: 'totemEntrance', label: 'Totem Entrance' },
  { key: 'totemPulse', label: 'Totem Pulse' },
  { key: 'miniBossSpawn', label: 'Mini-Boss Spawn' },
  { key: 'menuHover', label: 'Menu Hover' },
  { key: 'menu', label: 'Menu Select' },
  { key: 'itemLocked', label: 'Locked / Unavailable' },
  { key: 'runStart', label: 'Deployment Start' }
] as const;

export type AudioSfxName = typeof SFX_DEFINITIONS[number]['key'];

export const DEFAULT_AUDIO_VOLUME = 0.25;

export const createDefaultSoundVolumes = (): Record<AudioSfxName, number> => {
  const volumes = {} as Record<AudioSfxName, number>;
  for (const definition of SFX_DEFINITIONS) volumes[definition.key] = DEFAULT_AUDIO_VOLUME;
  return volumes;
};
