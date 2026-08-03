import type { WeaponStats } from '../game/types';
import { WEAPON_BALANCE } from '../game/config/balance';

export const starterWeapon: WeaponStats = {
  name: WEAPON_BALANCE.name,
  damage: WEAPON_BALANCE.damage,
  fireRate: WEAPON_BALANCE.fireRate,
  projectileSpeed: WEAPON_BALANCE.projectileSpeed,
  critChance: WEAPON_BALANCE.critChance,
  heatPerShot: WEAPON_BALANCE.heatPerShot,
  maxHeat: WEAPON_BALANCE.maxHeat,
  cooldownRate: WEAPON_BALANCE.cooldownRate
};
