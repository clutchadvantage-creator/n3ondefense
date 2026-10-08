import type { WeeklyOperationDeck, WeeklyOperationDefinition, WeeklyOperationStat } from './WeeklyOperations.ts';

export type MissionCategory = 'combat' | 'survival' | 'demolition' | 'economy' | 'arcade' | 'anomaly' | 'workshop';
export type MissionSystem = 'combat' | 'arcade' | 'anomalies' | 'mod-upgrade' | 'exchange';
export interface WeeklyMissionEligibility { systems: readonly MissionSystem[] }
export interface WeeklyMissionTemplate {
  id: string;
  title: string;
  objective: string;
  statKey: WeeklyOperationStat;
  category: MissionCategory;
  icon: string;
  requiredSystems: readonly MissionSystem[];
  /** Absence from a deck means that deck cannot reliably attribute this event. */
  targets: Partial<Record<WeeklyOperationDeck, readonly [number, number]>>;
}

export const WEEKLY_MISSION_LIBRARY: readonly WeeklyMissionTemplate[] = [
  { id: 'extermination', title: 'EXTERMINATION PROTOCOL', objective: 'Destroy {target} enemies.', statKey: 'enemiesDestroyed', category: 'combat', icon: 'X', requiredSystems: ['combat'], targets: { regular: [500, 800], overdrive: [3000, 5000] } },
  { id: 'frontline', title: 'FRONTLINE SURVIVOR', objective: 'Complete {target} rounds.', statKey: 'roundsCompleted', category: 'survival', icon: 'S', requiredSystems: ['combat'], targets: { regular: [12, 18], overdrive: [40, 75] } },
  { id: 'demolition', title: 'CONTROLLED COLLAPSE', objective: 'Detonate {target} bomb sites.', statKey: 'bombSitesDestroyed', category: 'demolition', icon: 'D', requiredSystems: ['combat'], targets: { regular: [20, 30], overdrive: [70, 85] } },
  { id: 'credits', title: 'CREDIT RUNNER', objective: 'Earn {target} Credits.', statKey: 'totalCreditsEarned', category: 'economy', icon: 'C', requiredSystems: ['combat'], targets: { regular: [25000, 30000] } },
  { id: 'bosses', title: 'TITAN BREAKER', objective: 'Win {target} boss encounters.', statKey: 'bossesDefeated', category: 'combat', icon: 'B', requiredSystems: ['combat'], targets: { regular: [2, 3], overdrive: [5, 8] } },
  { id: 'arcade', title: 'SIGNAL INTERCEPT', objective: 'Complete {target} Arcade events.', statKey: 'arcadeEventsCompleted', category: 'arcade', icon: 'A', requiredSystems: ['arcade'], targets: { regular: [3, 5], overdrive: [8, 12] } },
  { id: 'golden', title: 'GOLDEN TRACE', objective: 'Destroy {target} Golden Enemies.', statKey: 'goldenEnemiesKilled', category: 'arcade', icon: 'G', requiredSystems: ['arcade'], targets: { regular: [10, 20], overdrive: [30, 40] } },
  { id: 'miniboss', title: 'GIANT KILLER', objective: 'Defeat {target} Arcade mini-bosses.', statKey: 'arcadeMiniBossesKilled', category: 'arcade', icon: 'B', requiredSystems: ['arcade'], targets: { regular: [2, 3], overdrive: [4, 5] } },
  { id: 'circuit', title: 'NEON CIRCUIT', objective: 'Complete {target} Neon Circuits.', statKey: 'neonCircuitsCompleted', category: 'arcade', icon: 'N', requiredSystems: ['arcade'], targets: { regular: [2, 3], overdrive: [6, 8] } },
  { id: 'heist', title: 'VAULT GHOST', objective: 'Extract from {target} successful Heists.', statKey: 'heistsCompleted', category: 'anomaly', icon: 'H', requiredSystems: ['anomalies'], targets: { regular: [1, 2], overdrive: [2, 3] } },
  { id: 'skybreach', title: 'SKYLINE BREACH', objective: 'Complete {target} SkyBreach runs.', statKey: 'skyBreachesCompleted', category: 'anomaly', icon: 'V', requiredSystems: ['anomalies'], targets: { regular: [1, 2], overdrive: [2, 3] } },
  { id: 'mods', title: 'SYSTEM REFORGE', objective: 'Upgrade a Mod {target} time(s).', statKey: 'modUpgrades', category: 'workshop', icon: 'M', requiredSystems: ['mod-upgrade'], targets: { regular: [1, 1] } },
  { id: 'exchange', title: 'LIQUID ASSETS', objective: 'Complete {target} currency exchange(s).', statKey: 'currencyExchanges', category: 'economy', icon: 'C', requiredSystems: ['exchange'], targets: { regular: [1, 2] } }
];

const hash = (key: string): number => {
  let result = 2166136261;
  for (const char of key) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
};

export const selectWeeklyMissions = (deck: WeeklyOperationDeck, week: number, eligibility: WeeklyMissionEligibility): string[] => {
  const pool = WEEKLY_MISSION_LIBRARY.filter(item => item.targets[deck]
    && item.requiredSystems.every(system => eligibility.systems.includes(system)))
    .sort((a, b) => hash(`${week}:${deck}:${a.id}`) - hash(`${week}:${deck}:${b.id}`));
  const categories = new Set<MissionCategory>();
  return pool.filter(item => {
    if (categories.has(item.category)) return false;
    categories.add(item.category);
    return true;
  }).slice(0, 3).map(item => item.id);
};

export const resolveWeeklyMission = (id: string, deck: WeeklyOperationDeck, week: number): WeeklyOperationDefinition | undefined => {
  const item = WEEKLY_MISSION_LIBRARY.find(entry => entry.id === id);
  const range = item?.targets[deck];
  if (!item || !range) return undefined;
  const target = range[0] + hash(`${week}:${deck}:${id}:target`) % (range[1] - range[0] + 1);
  return { id: `mission:${deck}:${id}`, title: item.title,
    description: item.objective.replace('{target}', target.toLocaleString('en-US')),
    statKey: item.statKey, category: item.category, icon: item.icon, target, progressMode: 'rotation' };
};

/** Legacy objective identity, thresholds and progress remain unchanged mid-week. */
export const presentWeeklyMission = (definition: WeeklyOperationDefinition): WeeklyOperationDefinition => {
  const item = WEEKLY_MISSION_LIBRARY.find(entry => entry.statKey === definition.statKey);
  return { ...definition, title: item?.title ?? 'DEEP DEPLOYMENT', category: item?.category ?? 'survival', icon: item?.icon ?? 'S',
    description: item ? item.objective.replace('{target}', definition.target.toLocaleString('en-US'))
      : `Complete Round ${definition.target} or higher.` };
};
