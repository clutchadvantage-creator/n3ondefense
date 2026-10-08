import type { SystemInfusionId } from './types.ts';

/** Behavior configuration lives here; normal Mod stat modifiers remain independent. */
export const SYSTEM_INFUSION_TUNING = {
  targetRadius: 54, scanMs: 100, holdMs: 800,
  relay: { cooldownMs: 5000, landingRadius: 44 },
  grid: { range: 540, maxLinks: 16 },
  designator: { durationMs: 4000, cooldownMs: 8000 },
  ascension: { turrets: 3, durationMs: 60000, cooldownMs: 45000, healthScale: 1, fireRateScale: 0.75, ejectProtectionMs: 250 },
  cascade: { range: 350, delayMs: 140, maxMines: 24 },
  redeploy: { range: 500, cooldownMs: 4000, selectionMs: 8000 },
  power: { range: 450, maxDevices: 4, energyPerDevicePerSecond: 6, turretRate: 1.5, fenceRate: 1.35, pulseMs: 100 },
  hijack: { durationMs: 5000, cooldownMs: 15000, range: 800 },
  rail: { cooldownMs: 4000, entryRange: 160, speed: 1800 },
  fence: { thickness: 5, navigationClearance: 30, attackDelayMs: 850 },
  targeting: { controllerCone: 0.14, acquisitionMs: 180, consumptionMs: 150 }
} as const;

export interface SystemInfusionDefinition {
  id: SystemInfusionId;
  name: string;
  description: string;
  category: string;
  icon: string;
  plasmaCost: number;
  cosmeticOnly: false;
  requirements: string;
  hooks: readonly string[];
}
const definition = (id: SystemInfusionId, name: string, category: string, description: string,
  requirements: string, hooks: string[]): SystemInfusionDefinition =>
  ({ id, name, category, description, requirements, hooks, icon: '◆', plasmaCost: 180, cosmeticOnly: false });

export const SYSTEM_INFUSIONS: readonly SystemInfusionDefinition[] = [
  definition('relay-jump', 'Relay Jump', 'Turret / Mobility', 'Select any living turret in the arena and press the Infusion control to jump beside it. 5s cooldown.', 'Living player turret and safe landing.', ['interact']),
  definition('gridlink', 'Gridlink', 'Fence / Infrastructure', 'Nearby fence endpoints link into a live defensive network. Links reach 540 units.', 'Living player fence endpoints and clear geometry.', ['deployables-changed', 'fence-damage']),
  definition('target-designator', 'Target Designator', 'Turret / Command', 'Aim at an enemy or boss and press the Infusion control: turrets prioritize it for 4s. 8s cooldown.', 'Living enemy in normal turret firing range.', ['interact', 'turret-target']),
  definition('ascension-protocol', 'Ascension Protocol', 'Turret / Conversion', 'Select a turret and hold the Infusion control to sacrifice 3 turrets and pilot a random boss for 60s. Fire for primary; Boost for secondary. 45s cooldown.', 'Three living player turrets; deliberate hold. Chassis has separate integrity.', ['interact', 'possession-update']),
  definition('detonator-link', 'Detonator Link', 'Mine / Control', 'Aim at your mine and press the Infusion control to detonate it using its normal blast.', 'Active player mine.', ['interact', 'mine-detonation']),
  definition('cascade', 'Cascade', 'Mine / Network', 'Mine blasts chain through nearby mines, one every 0.14s within 350 units.', 'Active player mines; each triggers once.', ['mine-detonation']),
  definition('magnetic-redeploy', 'Magnetic Redeploy', 'Mine / Utility', 'Select a mine, then press the Infusion control at a valid new location within 500 units. Hold to select when Detonator Link is installed. 4s per mine.', 'Stationary mine not already detonating; normal placement rules.', ['interact']),
  definition('power-bus', 'Power Bus', 'Boost / Deployables', 'During Boost, power up to 4 devices within 450 units: faster turrets, pulsing fences, instant mine arming. Each draws 6 Energy/s.', 'Boost active and sufficient Energy.', ['boost-update']),
  definition('hazard-hijack', 'Hazard Hijack', 'Arena / Environment', 'Use the Infusion control on a marked security laser relay to hijack its network for 5s. 15s cooldown.', 'Active, unsuppressed arena security lasers. Other hazards keep their normal rules.', ['interact', 'hazard-update']),
  definition('fence-rail', 'Fence Rail', 'Fence / Mobility', 'Select a nearby fence endpoint and press the Infusion control once to zip automatically along its network. Invulnerable during travel. 4s cooldown.', 'Living player fence endpoint within 160 units and safe landing. Gridlink extends the route.', ['interact', 'deployables-changed'])
];
export const SYSTEM_INFUSION_BY_ID = new Map(SYSTEM_INFUSIONS.map(entry => [entry.id, entry]));
