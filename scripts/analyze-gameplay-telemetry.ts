import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameplayEncounterMetrics, GameplayRunMetrics } from '../src/game/telemetry/GameplayTelemetryRecorder.ts';

interface TelemetryExport {
  schemaVersion: number;
  metricsRevision?: number;
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
const detailedEncounters = encounters.filter((encounter) => encounter.metricsRevision === 2);
const rounds = encounters.filter((encounter) => encounter.kind === 'round');
const detailedRounds = detailedEncounters.filter((encounter) => encounter.kind === 'round');
const bosses = encounters.filter((encounter) => encounter.kind === 'boss' && encounter.boss);
const sum = (values: number[]): number => values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
const ratio = (numerator: number, denominator: number): string => denominator > 0 ? (numerator / denominator).toFixed(2) : '0.00';

console.log(`N3ONDefense actual gameplay telemetry exported ${payload.exportedAt ?? 'unknown'}`);
console.log(`Runs: ${runs.length} | Round encounters: ${rounds.length} | Boss encounters: ${bosses.length}`);
console.log(`Detailed revision-2 encounters: ${detailedEncounters.length}/${encounters.length}`);

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
  const engagedKills = sum(metrics.map((entry) => entry!.engagedKills ?? 0));
  const totalCombatTtk = sum(metrics.map((entry) => entry!.totalCombatTtkMs ?? 0));
  const totalTimeToFirstDamage = sum(metrics.map((entry) => entry!.totalTimeToFirstDamageMs ?? 0));
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
    averageLifetimeSeconds: ratio(totalTtk / 1000, killed),
    averageTravelToFirstHitSeconds: engagedKills > 0 ? ratio(totalTimeToFirstDamage / 1000, engagedKills) : 'legacy data',
    averageCombatTtkSeconds: engagedKills > 0 ? ratio(totalCombatTtk / 1000, engagedKills) : 'legacy data',
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
  const activeAtEnd = sum(encounters.map((encounter) => encounter.pickupsActiveAtEnd?.[type as keyof typeof encounter.pickupsActiveAtEnd] ?? 0));
  return { type, dropped, collected, expired, activeAtEnd, dropsPer100Kills: ratio(dropped * 100, totalKills), collectionRate: `${ratio(collected * 100, dropped)}%` };
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

console.log('\nENERGY PRESSURE BY ENCOUNTER');
if (detailedEncounters.length === 0) console.log('No revision-2 resource-pressure data is present in this export.');
else console.table(detailedEncounters.map((encounter) => {
  const abilitySpent = sum(Object.values(encounter.abilityEnergySpent ?? {}));
  const denied = sum(Object.values(encounter.energy?.deniedActions ?? {}));
  const energyRestoration = encounter.restoration?.energy;
  return {
    encounter: `${encounter.kind} R${encounter.round}`,
    durationSeconds: (encounter.activeDurationMs / 1000).toFixed(1),
    maximum: encounter.maximumPlayerEnergy,
    minimum: Number(encounter.minimumPlayerEnergy).toFixed(1),
    ending: Number(encounter.endingPlayerEnergy ?? encounter.minimumPlayerEnergy).toFixed(1),
    secondsAtZero: ((encounter.energy?.timeAtZeroMs ?? 0) / 1000).toFixed(2),
    secondsBelow25Percent: ((encounter.energy?.timeBelow25PercentMs ?? 0) / 1000).toFixed(2),
    shotSpent: Number(encounter.shotEnergySpent ?? 0).toFixed(1),
    abilitySpent: abilitySpent.toFixed(1),
    regenApplied: Number(encounter.energy?.regenerationApplied ?? 0).toFixed(1),
    regenWasted: Number(encounter.energy?.regenerationWasted ?? 0).toFixed(1),
    pickupAndEffectRestored: Number(energyRestoration?.applied ?? 0).toFixed(1),
    restorationWasted: Number(energyRestoration?.wasted ?? 0).toFixed(1),
    deniedActions: denied,
    deniedDetail: Object.entries(encounter.energy?.deniedActions ?? {}).map(([action, count]) => `${action}:${count}`).join(' ') || 'none'
  };
}));

const projectileOwners = ['weapon', 'turret', 'enemy', 'boss'] as const;
console.log('\nPROJECTILE ACCURACY / WASTE');
if (detailedEncounters.length === 0) console.log('No revision-2 projectile data is present in this export.');
else console.table(projectileOwners.map((owner) => {
  const entries = detailedEncounters.map((encounter) => encounter.projectiles?.[owner]).filter(Boolean);
  const fired = sum(entries.map((entry) => entry!.fired));
  const hits = sum(entries.map((entry) => entry!.hits));
  return {
    owner,
    fired,
    hits,
    accuracy: fired > 0 ? `${ratio(hits * 100, fired)}%` : 'n/a',
    criticalShots: sum(entries.map((entry) => entry!.criticalShots)),
    criticalHits: sum(entries.map((entry) => entry!.criticalHits)),
    damageApplied: Math.round(sum(entries.map((entry) => entry!.damageApplied))),
    overkill: Math.round(sum(entries.map((entry) => entry!.overkillDamage))),
    expired: sum(entries.map((entry) => entry!.expired)),
    wallHits: sum(entries.map((entry) => entry!.wallHits)),
    fenceSplits: sum(entries.map((entry) => entry!.fenceSplits)),
    blockedHits: sum(entries.map((entry) => entry!.blockedHits))
  };
}));

console.log('\nTURRET DEPLOYMENT PERFORMANCE');
if (detailedEncounters.length === 0) console.log('No revision-2 turret-deployment data is present in this export.');
else console.table(detailedEncounters.map((encounter) => {
  const turret = encounter.turrets;
  return {
    encounter: `${encounter.kind} R${encounter.round}`,
    placements: turret?.placements ?? 0,
    destroyed: turret?.destroyed ?? 0,
    survived: turret?.survivedEncounter ?? 0,
    shots: turret?.shots ?? 0,
    hits: turret?.hits ?? 0,
    accuracy: (turret?.shots ?? 0) > 0 ? `${ratio((turret?.hits ?? 0) * 100, turret?.shots ?? 0)}%` : 'n/a',
    damageApplied: Math.round(turret?.damageApplied ?? 0),
    damageTaken: Math.round(turret?.damageTaken ?? 0),
    averageLifetimeSeconds: (turret?.placements ?? 0) > 0 ? ratio((turret?.totalLifetimeMs ?? 0) / 1000, turret!.placements) : 'n/a'
  };
}));

console.log('\nSPAWN PRESSURE / OBJECTIVES');
if (detailedRounds.length === 0) console.log('No revision-2 spawn/objective pressure data is present in this export.');
else console.table(detailedRounds.map((encounter) => ({
  round: encounter.round,
  averageActive: Number(encounter.derived?.averageActiveEnemies ?? 0).toFixed(2),
  peakActive: encounter.peakActiveEnemies,
  averageWeight: Number(encounter.derived?.averageActiveWeight ?? 0).toFixed(2),
  peakWeight: Number(encounter.spawnPressure?.peakActiveWeight ?? 0).toFixed(2),
  spawnAttempts: encounter.spawnPressure?.spawnAttempts ?? 0,
  blockedCountCap: encounter.spawnPressure?.blockedAttempts?.['count-cap'] ?? 0,
  blockedWeightCap: encounter.spawnPressure?.blockedAttempts?.['weight-cap'] ?? 0,
  blockedComposition: encounter.spawnPressure?.blockedAttempts?.composition ?? 0,
  secondsAtCountCap: ((encounter.spawnPressure?.timeAtCountCapMs ?? 0) / 1000).toFixed(1),
  sitesArmed: encounter.objectives?.sitesArmed ?? 0,
  sitesDestroyed: encounter.objectives?.sitesDestroyed ?? 0,
  maxConcurrentBombs: encounter.objectives?.maxConcurrentBombs ?? 0,
  defuseAttempts: encounter.objectives?.defuseAttempts ?? 0,
  defuseInterruptions: encounter.objectives?.defuseInterruptions ?? 0,
  defuseProgressSeconds: ((encounter.objectives?.defuseProgressAppliedMs ?? 0) / 1000).toFixed(2),
  shieldBlockedSeconds: ((encounter.objectives?.defuseProgressBlockedMs ?? 0) / 1000).toFixed(2)
})));

console.log('\nRESTORATION VALUE / WASTE');
if (detailedEncounters.length === 0) console.log('No revision-2 restoration data is present in this export.');
else console.table((['health', 'energy'] as const).map((resource) => {
  const metrics = detailedEncounters.map((encounter) => encounter.restoration?.[resource]).filter(Boolean);
  const requested = sum(metrics.map((entry) => entry!.requested));
  const applied = sum(metrics.map((entry) => entry!.applied));
  const wasted = sum(metrics.map((entry) => entry!.wasted));
  return {
    resource,
    collections: sum(metrics.map((entry) => entry!.collections)),
    requested: requested.toFixed(1),
    applied: applied.toFixed(1),
    wasted: wasted.toFixed(1),
    usefulShare: requested > 0 ? `${ratio(applied * 100, requested)}%` : 'n/a'
  };
}));

console.log('\nBUFF UPTIME');
const buffNames = new Set(detailedEncounters.flatMap((encounter) => Object.keys(encounter.buffUptimeMs ?? {})));
if (detailedEncounters.length === 0) console.log('No revision-2 buff-uptime data is present in this export.');
else console.table([...buffNames].sort().map((buff) => ({
  buff,
  activeSeconds: (sum(detailedEncounters.map((encounter) => encounter.buffUptimeMs?.[buff as keyof typeof encounter.buffUptimeMs] ?? 0)) / 1000).toFixed(1),
  activeShare: activeMinutes > 0 ? `${ratio(sum(detailedEncounters.map((encounter) => encounter.buffUptimeMs?.[buff as keyof typeof encounter.buffUptimeMs] ?? 0)) * 100, activeMinutes * 60_000)}%` : 'n/a'
})));

console.log('\nBOSS ATTACK EFFECTIVENESS');
const detailedBosses = bosses.filter((encounter) => encounter.metricsRevision === 2);
if (detailedBosses.length === 0) console.log('No revision-2 boss-attack data is present in this export.');
else console.table(detailedBosses.flatMap((encounter) => Object.entries(encounter.boss?.attacks ?? {}).map(([attack, metrics]) => ({
  round: encounter.round,
  attack,
  casts: metrics?.casts ?? 0,
  projectiles: metrics?.projectiles ?? 0,
  playerIntersections: metrics?.playerIntersections ?? 0,
  playerHits: metrics?.playerHits ?? 0,
  blockedHits: metrics?.blockedHits ?? 0,
  damage: Math.round(metrics?.damage ?? 0)
}))));

const playerDamageSources = new Set(encounters.flatMap((encounter) => Object.keys(encounter.playerDamageBySource ?? {})));
console.log('\nPLAYER DAMAGE TAKEN');
console.table([...playerDamageSources].sort().map((source) => ({
  source,
  hits: sum(encounters.map((encounter) => encounter.playerHitsBySource[source as keyof typeof encounter.playerHitsBySource] ?? 0)),
  damage: Math.round(sum(encounters.map((encounter) => encounter.playerDamageBySource[source as keyof typeof encounter.playerDamageBySource] ?? 0)))
})));

const warnings: string[] = [];
if (rounds.length > 0 && totalKills / Math.max(1, activeMinutes) > 80) warnings.push('Enemy kill throughput exceeds 80 kills per active minute. Review enemy health and spawn pressure.');
if (enemyRows.some((row) => Number(row.averageCombatTtkSeconds) < 0.75 && row.killed >= 10)) warnings.push('At least one enemy type averages below 0.75 seconds engaged combat TTK.');
if (bosses.some((encounter) => encounter.boss!.defeated && (encounter.boss!.ttkMs ?? Infinity) < 15_000)) warnings.push('At least one boss died in under 15 seconds.');
if (totalDrops > 0 && totalCollected / totalDrops < 0.2) warnings.push('Fewer than 20% of dropped pickups were collected.');
if (encounters.some((encounter) => (encounter.energy?.timeAtZeroMs ?? 0) >= 1000)) warnings.push('At least one encounter spent one second or longer at zero energy.');
if (encounters.some((encounter) => sum(Object.values(encounter.energy?.deniedActions ?? {})) > 0)) warnings.push('At least one gameplay action was rejected because the player lacked energy.');
if (sum(Object.values(enemyDamageBySource)) > 0 && (enemyDamageBySource.turret ?? 0) / sum(Object.values(enemyDamageBySource)) > 0.5) warnings.push('Turrets contributed more than 50% of normal-enemy damage.');
if (bosses.some((encounter) => encounter.boss?.defeated && sum(Object.values(encounter.boss.attacks ?? {}).map((metrics) => metrics?.playerHits ?? 0)) === 0 && Object.keys(encounter.boss.attacks ?? {}).length > 0)) warnings.push('At least one defeated boss landed no direct attacks on the player.');
console.log('\nTUNING WARNINGS');
console.log(warnings.length > 0 ? warnings.map((warning) => `- ${warning}`).join('\n') : 'No configured warning threshold was crossed.');
