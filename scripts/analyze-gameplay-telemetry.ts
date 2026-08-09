import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameplayEncounterMetrics, GameplayRunMetrics } from '../src/game/telemetry/GameplayTelemetryRecorder.ts';

interface TelemetryExport {
  schemaVersion: number;
  exportedAt: string;
  activeRun: GameplayRunMetrics | null;
  completedRuns: GameplayRunMetrics[];
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.log('Usage: npm run telemetry:report -- <exported-gameplay-metrics.json>');
  process.exit(0);
}

const payload = JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as TelemetryExport;
const runs = [...(payload.completedRuns ?? []), ...(payload.activeRun ? [payload.activeRun] : [])];
const encounters = runs.flatMap((run) => run.encounters ?? []);
const rounds = encounters.filter((encounter) => encounter.kind === 'round');
const bosses = encounters.filter((encounter) => encounter.kind === 'boss' && encounter.boss);
const sum = (values: number[]): number => values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
const ratio = (numerator: number, denominator: number): string => denominator > 0 ? (numerator / denominator).toFixed(2) : '0.00';

console.log(`N3ONDefense actual gameplay telemetry exported ${payload.exportedAt ?? 'unknown'}`);
console.log(`Runs: ${runs.length} | Round encounters: ${rounds.length} | Boss encounters: ${bosses.length}`);

const activeMinutes = sum(encounters.map((encounter) => encounter.activeDurationMs)) / 60_000;
const totalSpawns = sum(rounds.map((encounter) => encounter.enemySpawns));
const totalKills = sum(rounds.map((encounter) => encounter.enemyKills));
const totalDrops = sum(encounters.flatMap((encounter) => Object.values(encounter.pickupDrops ?? {}))) as number;
const totalCollected = sum(encounters.flatMap((encounter) => Object.values(encounter.pickupsCollected ?? {}))) as number;
const enemyDrops = sum(encounters.map((encounter) => encounter.pickupDropsBySource?.enemy ?? 0));
console.table([{
  activeMinutes: activeMinutes.toFixed(1),
  enemySpawns: totalSpawns,
  enemyKills: totalKills,
  killsPerMinute: ratio(totalKills, activeMinutes),
  peakActiveEnemies: Math.max(0, ...rounds.map((encounter) => encounter.peakActiveEnemies)),
  pickupDrops: totalDrops,
  enemyDropRate: `${ratio(enemyDrops * 100, totalKills)}%`,
  pickupCollectionRate: `${(Number(ratio(totalCollected * 100, totalDrops))).toFixed(1)}%`
}]);

const enemyTypes = new Set(rounds.flatMap((encounter) => Object.keys(encounter.enemyMetrics ?? {})));
const enemyRows = [...enemyTypes].sort().map((type) => {
  const metrics = rounds.map((encounter) => encounter.enemyMetrics[type as keyof typeof encounter.enemyMetrics]).filter(Boolean);
  const spawned = sum(metrics.map((entry) => entry!.spawned));
  const killed = sum(metrics.map((entry) => entry!.killed));
  const totalTtk = sum(metrics.map((entry) => entry!.totalTtkMs));
  const health = sum(metrics.map((entry) => entry!.totalSpawnHealth));
  const killSources: Record<string, number> = {};
  for (const metric of metrics) for (const [source, count] of Object.entries(metric!.killSources)) killSources[source] = (killSources[source] ?? 0) + (count ?? 0);
  const leadingSource = Object.entries(killSources).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
  return {
    type,
    spawned,
    killed,
    survivalCount: spawned - killed,
    averageSpawnHealth: ratio(health, spawned),
    averageTtkSeconds: ratio(totalTtk / 1000, killed),
    leadingKillSource: leadingSource,
    creditsAwarded: sum(metrics.map((entry) => entry!.creditsAwarded))
  };
});
console.log('\nENEMY OUTCOMES');
console.table(enemyRows);

const enemyDamageBySource: Record<string, number> = {};
const enemyKillsBySource: Record<string, number> = {};
for (const encounter of rounds) {
  for (const metrics of Object.values(encounter.enemyMetrics)) {
    if (!metrics) continue;
    for (const [source, damage] of Object.entries(metrics.damageBySource)) enemyDamageBySource[source] = (enemyDamageBySource[source] ?? 0) + (damage ?? 0);
    for (const [source, kills] of Object.entries(metrics.killSources)) enemyKillsBySource[source] = (enemyKillsBySource[source] ?? 0) + (kills ?? 0);
  }
}
console.log('\nDAMAGE / KILLS BY SOURCE');
console.table([...new Set([...Object.keys(enemyDamageBySource), ...Object.keys(enemyKillsBySource)])].sort().map((source) => ({
  source,
  damage: Math.round(enemyDamageBySource[source] ?? 0),
  kills: enemyKillsBySource[source] ?? 0,
  damageShare: `${ratio((enemyDamageBySource[source] ?? 0) * 100, sum(Object.values(enemyDamageBySource)))}%`
})));

const pickupTypes = new Set(encounters.flatMap((encounter) => [
  ...Object.keys(encounter.pickupDrops ?? {}),
  ...Object.keys(encounter.pickupsCollected ?? {}),
  ...Object.keys(encounter.pickupsExpired ?? {})
]));
console.log('\nPICKUP OUTCOMES');
console.table([...pickupTypes].sort().map((type) => {
  const dropped = sum(encounters.map((encounter) => encounter.pickupDrops[type as keyof typeof encounter.pickupDrops] ?? 0));
  const collected = sum(encounters.map((encounter) => encounter.pickupsCollected[type as keyof typeof encounter.pickupsCollected] ?? 0));
  const expired = sum(encounters.map((encounter) => encounter.pickupsExpired[type as keyof typeof encounter.pickupsExpired] ?? 0));
  return { type, dropped, collected, expired, dropsPer100Kills: ratio(dropped * 100, totalKills), collectionRate: `${ratio(collected * 100, dropped)}%` };
}));

const pickupSources = new Set(encounters.flatMap((encounter) => Object.keys(encounter.pickupDropsBySourceAndType ?? {})));
console.log('\nPICKUP SOURCES');
console.table([...pickupSources].sort().map((source) => {
  const byType: Record<string, number> = {};
  for (const encounter of encounters) {
    const sourceData = encounter.pickupDropsBySourceAndType[source as keyof typeof encounter.pickupDropsBySourceAndType] ?? {};
    for (const [type, count] of Object.entries(sourceData)) byType[type] = (byType[type] ?? 0) + (count ?? 0);
  }
  return { source, total: sum(Object.values(byType)), ...byType };
}));

console.log('\nBOSS OUTCOMES');
console.table(bosses.map((encounter) => ({
  round: encounter.round,
  archetype: encounter.boss!.archetype,
  maximumHealth: encounter.boss!.maximumHealth,
  defeated: encounter.boss!.defeated,
  ttkSeconds: encounter.boss!.ttkMs === null ? null : (encounter.boss!.ttkMs / 1000).toFixed(2),
  effectivePlayerDps: encounter.boss!.ttkMs ? (encounter.boss!.maximumHealth / (encounter.boss!.ttkMs / 1000)).toFixed(1) : null,
  creditDrops: encounter.boss!.creditsDropped,
  rewards: `${encounter.creditsEarned}c/${encounter.coreTokensEarned}t/${encounter.plasmaChipsEarned}p`
})));

const abilityNames = new Set(encounters.flatMap((encounter) => Object.keys(encounter.abilitiesUsed ?? {})));
console.log('\nPLAYER OUTPUT / ABILITY USE');
console.table([{
  shotsFired: sum(encounters.map((encounter) => encounter.shotsFired)),
  shotEnergySpent: sum(encounters.map((encounter) => encounter.shotEnergySpent)).toFixed(1),
  potentialWeaponDamageFired: Math.round(sum(encounters.map((encounter) => encounter.potentialWeaponDamageFired))),
  ...Object.fromEntries([...abilityNames].sort().map((ability) => [ability, sum(encounters.map((encounter) => encounter.abilitiesUsed[ability as keyof typeof encounter.abilitiesUsed] ?? 0))]))
}]);

const playerDamageSources = new Set(encounters.flatMap((encounter) => Object.keys(encounter.playerDamageBySource ?? {})));
console.log('\nPLAYER DAMAGE TAKEN');
console.table([...playerDamageSources].sort().map((source) => ({
  source,
  hits: sum(encounters.map((encounter) => encounter.playerHitsBySource[source as keyof typeof encounter.playerHitsBySource] ?? 0)),
  damage: Math.round(sum(encounters.map((encounter) => encounter.playerDamageBySource[source as keyof typeof encounter.playerDamageBySource] ?? 0)))
})));

const warnings: string[] = [];
if (rounds.length > 0 && totalKills / Math.max(1, activeMinutes) > 80) warnings.push('Enemy kill throughput exceeds 80 kills per active minute. Review enemy health and spawn pressure.');
if (enemyRows.some((row) => Number(row.averageTtkSeconds) < 0.35 && row.killed >= 10)) warnings.push('At least one enemy type averages below 0.35 seconds TTK.');
if (bosses.some((encounter) => encounter.boss!.defeated && (encounter.boss!.ttkMs ?? Infinity) < 15_000)) warnings.push('At least one boss died in under 15 seconds.');
if (totalDrops > 0 && totalCollected / totalDrops < 0.2) warnings.push('Fewer than 20% of dropped pickups were collected.');
console.log('\nTUNING WARNINGS');
console.log(warnings.length > 0 ? warnings.map((warning) => `- ${warning}`).join('\n') : 'No configured warning threshold was crossed.');
