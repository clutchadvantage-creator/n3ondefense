import { GAME_VERSION } from '../config/version.ts';
import type { ArenaTemplate, EnemyType, PickupType } from '../types.ts';
import type { BossArchetype } from '../config/bossBalance.ts';
import type { ModDropSource, RunProtocolId, EquippedModSnapshot } from '../mods/types.ts';
import type { ModFocusSignalId, RunContractId } from '../economy/types.ts';

export type CombatDamageSource = 'weapon' | 'turret' | 'mine' | 'fence' | 'hazard' | 'bomb' | 'splitCurrent' | 'unknown';
export type PlayerDamageSource = 'enemy-contact' | 'enemy-projectile' | 'enemy-death-mine' | 'laser' | 'bomblet' | 'boss';
export type PickupDropSource = 'enemy' | 'arena-support' | 'site-recovery' | 'boss-damage' | 'boss-support';
export type EncounterKind = 'round' | 'boss';
export type EncounterOutcome = 'completed' | 'playerDead' | 'bombDefused' | 'bossDefeated' | 'quit' | 'replaced';
export type TelemetryAbility = 'dash' | 'shield' | 'fence' | 'turret' | 'mine';
export type EnergyAction = TelemetryAbility | 'shot';
export type AbilityDenialReason = 'energy' | 'cooldown' | 'active-limit' | 'invalid-placement' | 'already-active';
export type ProjectileOwner = 'weapon' | 'turret' | 'enemy' | 'boss';
export type ProjectileMissReason = 'expired' | 'wall' | 'fence-split';
export type SpawnBlockReason = 'count-cap' | 'weight-cap' | 'composition';
export type ResourceGainSource = PickupDropSource | 'natural-regen' | 'site-recovery-direct' | 'emergency-capacitor';
export type BuffName = 'damageBoost' | 'speedBoost' | 'rapidFire';
export type BossAttackKind =
  | 'artillery-basic'
  | 'artillery-super'
  | 'storm-basic'
  | 'storm-super'
  | 'brawler-contact'
  | 'brawler-pounce'
  | 'brawler-super';

type TtkBucket = 'under500' | 'under1000' | 'under2000' | 'under4000' | 'under8000' | 'over8000';

interface EnemyTypeMetrics {
  spawned: number;
  killed: number;
  totalSpawnHealth: number;
  /** Spawn-to-death lifetime retained for comparison with revision-one exports. */
  totalTtkMs: number;
  minimumTtkMs: number | null;
  maximumTtkMs: number;
  ttkBuckets: Record<TtkBucket, number>;
  engagedKills: number;
  totalTimeToFirstDamageMs: number;
  totalCombatTtkMs: number;
  minimumCombatTtkMs: number | null;
  maximumCombatTtkMs: number;
  combatTtkBuckets: Record<TtkBucket, number>;
  killSources: Partial<Record<CombatDamageSource, number>>;
  damageBySource: Partial<Record<CombatDamageSource, number>>;
  overkillBySource: Partial<Record<CombatDamageSource, number>>;
  creditsAwarded: number;
  coreTokensAwarded: number;
}

interface ProjectileMetrics {
  fired: number;
  hits: number;
  criticalShots: number;
  criticalHits: number;
  damageApplied: number;
  overkillDamage: number;
  expired: number;
  wallHits: number;
  fenceSplits: number;
  splitChildrenCreated: number;
  blockedHits: number;
}

interface ResourceRestorationMetrics {
  collections: number;
  requested: number;
  applied: number;
  wasted: number;
  bySource: Partial<Record<ResourceGainSource, { requested: number; applied: number; wasted: number }>>;
}

interface EnergyMetrics {
  starting: number;
  ending: number;
  timeAtZeroMs: number;
  timeBelow25PercentMs: number;
  regenerationRequested: number;
  regenerationApplied: number;
  regenerationWasted: number;
  deniedActions: Partial<Record<EnergyAction, number>>;
  deniedEnergyShortfall: Partial<Record<EnergyAction, number>>;
  abilityDenials: Partial<Record<TelemetryAbility, Partial<Record<AbilityDenialReason, number>>>>;
}

interface TurretDeploymentMetrics {
  id: string;
  placedAtActiveMs: number;
  removedAtActiveMs: number | null;
  lifetimeMs: number;
  maximumHealth: number;
  damage: number;
  fireRate: number;
  range: number;
  shots: number;
  hits: number;
  damageApplied: number;
  overkillDamage: number;
  damageTaken: number;
  destroyed: boolean;
  survivedEncounter: boolean;
}

interface TurretMetrics {
  placements: number;
  destroyed: number;
  survivedEncounter: number;
  shots: number;
  hits: number;
  damageApplied: number;
  overkillDamage: number;
  damageTaken: number;
  totalLifetimeMs: number;
  deployments: TurretDeploymentMetrics[];
}

interface SpawnPressureMetrics {
  spawnAttempts: number;
  blockedAttempts: Partial<Record<SpawnBlockReason, number>>;
  estimatedBlockedDelayMs: Partial<Record<SpawnBlockReason, number>>;
  activeEnemyTimeMs: number;
  activeWeightTimeMs: number;
  peakActiveWeight: number;
  timeAtCountCapMs: number;
  timeAtWeightCapMs: number;
}

interface BombSiteTelemetry {
  armed: number;
  destroyed: number;
  defuseAttempts: number;
  defuseInterruptions: number;
  defuseCompleted: number;
  defuseActiveMs: number;
  defuseProgressAppliedMs: number;
  defuseProgressBlockedMs: number;
  defuseStartedAtActiveMs: number | null;
}

interface ObjectiveMetrics {
  sitesArmed: number;
  sitesDestroyed: number;
  maxConcurrentBombs: number;
  activeBombTimeMs: number;
  activeDefuserTimeMs: number;
  peakSimultaneousDefusers: number;
  defuseAttempts: number;
  defuseInterruptions: number;
  successfulDefuses: number;
  defuseActiveMs: number;
  defuseProgressAppliedMs: number;
  defuseProgressBlockedMs: number;
  sites: Record<string, BombSiteTelemetry>;
}

interface BossAttackMetrics {
  casts: number;
  projectiles: number;
  playerIntersections: number;
  playerHits: number;
  blockedHits: number;
  damage: number;
}

interface BossMetrics {
  archetype: BossArchetype;
  maximumHealth: number;
  damageBySource: Partial<Record<CombatDamageSource, number>>;
  creditsDropped: number;
  defeated: boolean;
  ttkMs: number | null;
  attacks: Partial<Record<BossAttackKind, BossAttackMetrics>>;
}

export interface GameplayEncounterMetrics {
  /** Revision 1 encounters predate the detailed resource/projectile instrumentation. */
  metricsRevision: 1 | 2;
  kind: EncounterKind;
  round: number;
  seed: number;
  layout: ArenaTemplate;
  startedAt: string;
  endedAt: string | null;
  activeDurationMs: number;
  outcome: EncounterOutcome | null;
  peakActiveEnemies: number;
  enemySpawns: number;
  enemyKills: number;
  enemyMetrics: Partial<Record<EnemyType, EnemyTypeMetrics>>;
  recentKillSamples: Array<{
    type: EnemyType;
    /** Spawn-to-death lifetime retained under the original key. */
    ttkMs: number;
    timeToFirstDamageMs: number | null;
    combatTtkMs: number | null;
    maximumHealth: number;
    finalSource: CombatDamageSource;
    damageBySource: Partial<Record<CombatDamageSource, number>>;
  }>;
  shotsFired: number;
  shotEnergySpent: number;
  potentialWeaponDamageFired: number;
  weaponDamageAtStart: number;
  weaponFireRateAtStart: number;
  weaponCritChanceAtStart: number;
  weaponHeatPerShotAtStart: number;
  projectiles: Record<ProjectileOwner, ProjectileMetrics>;
  maximumPlayerHealth: number;
  endingPlayerHealth: number;
  maximumPlayerEnergy: number;
  endingPlayerEnergy: number;
  energyRegenPerSecond: number;
  energy: EnergyMetrics;
  abilitiesUsed: Partial<Record<TelemetryAbility, number>>;
  abilityEnergySpent: Partial<Record<TelemetryAbility, number>>;
  pickupDrops: Partial<Record<PickupType, number>>;
  pickupDropsBySource: Partial<Record<PickupDropSource, number>>;
  pickupDropsBySourceAndType: Partial<Record<PickupDropSource, Partial<Record<PickupType, number>>>>;
  pickupsCollected: Partial<Record<PickupType, number>>;
  pickupsExpired: Partial<Record<PickupType, number>>;
  pickupsActiveAtEnd: Partial<Record<PickupType, number>>;
  restoration: { health: ResourceRestorationMetrics; energy: ResourceRestorationMetrics };
  buffUptimeMs: Partial<Record<BuffName, number>>;
  modDrops: Array<{ modId: string; rarity: string; source: ModDropSource; duplicate: boolean }>;
  playerDamageBySource: Partial<Record<PlayerDamageSource, number>>;
  playerHitsBySource: Partial<Record<PlayerDamageSource, number>>;
  minimumPlayerHealth: number;
  minimumPlayerEnergy: number;
  turrets: TurretMetrics;
  spawnPressure: SpawnPressureMetrics;
  objectives: ObjectiveMetrics;
  creditsEarned: number;
  coreTokensEarned: number;
  plasmaChipsEarned: number;
  boss: BossMetrics | null;
  derived: {
    spawnsPerActiveMinute: number;
    killsPerActiveMinute: number;
    averageEnemyTtkMs: number | null;
    averageCombatTtkMs: number | null;
    averageTimeToFirstDamageMs: number | null;
    averageActiveEnemies: number;
    averageActiveWeight: number;
    pickupCollectionRate: number | null;
    weaponAccuracy: number | null;
    turretAccuracy: number | null;
  };
}

export interface GameplayRunMetrics {
  schemaVersion: 1;
  metricsRevision: 1 | 2;
  runId: string;
  gameVersion: string;
  startedAt: string;
  endedAt: string | null;
  outcome: EncounterOutcome | null;
  baseSeed: number;
  protocol: RunProtocolId;
  contract: RunContractId | null;
  modFocus: ModFocusSignalId | null;
  upgrades: Record<string, number>;
  equippedMods: EquippedModSnapshot[];
  encounters: GameplayEncounterMetrics[];
}

export interface StoredTelemetry {
  schemaVersion: 1;
  metricsRevision: 2;
  activeRun: GameplayRunMetrics | null;
  completedRuns: GameplayRunMetrics[];
}

const STORAGE_KEY = 'n3ondefense.gameplay-telemetry.v1';
const MAX_COMPLETED_RUNS = 5;
const MAX_KILL_SAMPLES_PER_ENCOUNTER = 60;
const emptyStoredTelemetry = (): StoredTelemetry => ({ schemaVersion: 1, metricsRevision: 2, activeRun: null, completedRuns: [] });
const increment = <T extends string>(record: Partial<Record<T, number>>, key: T, amount = 1): void => {
  record[key] = (record[key] ?? 0) + amount;
};
const emptyBuckets = (): Record<TtkBucket, number> => ({ under500: 0, under1000: 0, under2000: 0, under4000: 0, under8000: 0, over8000: 0 });
const bucketFor = (durationMs: number): TtkBucket => durationMs < 500 ? 'under500' : durationMs < 1000 ? 'under1000' : durationMs < 2000 ? 'under2000' : durationMs < 4000 ? 'under4000' : durationMs < 8000 ? 'under8000' : 'over8000';
const emptyProjectileMetrics = (): ProjectileMetrics => ({ fired: 0, hits: 0, criticalShots: 0, criticalHits: 0, damageApplied: 0, overkillDamage: 0, expired: 0, wallHits: 0, fenceSplits: 0, splitChildrenCreated: 0, blockedHits: 0 });
const emptyRestoration = (): ResourceRestorationMetrics => ({ collections: 0, requested: 0, applied: 0, wasted: 0, bySource: {} });
const emptyObjectiveMetrics = (): ObjectiveMetrics => ({ sitesArmed: 0, sitesDestroyed: 0, maxConcurrentBombs: 0, activeBombTimeMs: 0, activeDefuserTimeMs: 0, peakSimultaneousDefusers: 0, defuseAttempts: 0, defuseInterruptions: 0, successfulDefuses: 0, defuseActiveMs: 0, defuseProgressAppliedMs: 0, defuseProgressBlockedMs: 0, sites: {} });
const emptyTurretMetrics = (): TurretMetrics => ({ placements: 0, destroyed: 0, survivedEncounter: 0, shots: 0, hits: 0, damageApplied: 0, overkillDamage: 0, damageTaken: 0, totalLifetimeMs: 0, deployments: [] });
const emptySpawnPressure = (): SpawnPressureMetrics => ({ spawnAttempts: 0, blockedAttempts: {}, estimatedBlockedDelayMs: {}, activeEnemyTimeMs: 0, activeWeightTimeMs: 0, peakActiveWeight: 0, timeAtCountCapMs: 0, timeAtWeightCapMs: 0 });

const createEnemyMetrics = (): EnemyTypeMetrics => ({
  spawned: 0, killed: 0, totalSpawnHealth: 0,
  totalTtkMs: 0, minimumTtkMs: null, maximumTtkMs: 0, ttkBuckets: emptyBuckets(),
  engagedKills: 0, totalTimeToFirstDamageMs: 0, totalCombatTtkMs: 0,
  minimumCombatTtkMs: null, maximumCombatTtkMs: 0, combatTtkBuckets: emptyBuckets(),
  killSources: {}, damageBySource: {}, overkillBySource: {}, creditsAwarded: 0, coreTokensAwarded: 0
});

const createSiteMetrics = (): BombSiteTelemetry => ({ armed: 0, destroyed: 0, defuseAttempts: 0, defuseInterruptions: 0, defuseCompleted: 0, defuseActiveMs: 0, defuseProgressAppliedMs: 0, defuseProgressBlockedMs: 0, defuseStartedAtActiveMs: null });
const createBossAttackMetrics = (): BossAttackMetrics => ({ casts: 0, projectiles: 0, playerIntersections: 0, playerHits: 0, blockedHits: 0, damage: 0 });

const ensureEncounterRevision = (encounter: GameplayEncounterMetrics): GameplayEncounterMetrics => {
  // Populate safe runtime defaults without relabeling legacy measurements as if
  // those counters had actually been observed during play.
  encounter.metricsRevision ??= 1;
  encounter.projectiles ??= { weapon: emptyProjectileMetrics(), turret: emptyProjectileMetrics(), enemy: emptyProjectileMetrics(), boss: emptyProjectileMetrics() };
  for (const owner of ['weapon', 'turret', 'enemy', 'boss'] as ProjectileOwner[]) encounter.projectiles[owner] ??= emptyProjectileMetrics();
  encounter.endingPlayerHealth ??= encounter.minimumPlayerHealth ?? encounter.maximumPlayerHealth;
  encounter.endingPlayerEnergy ??= encounter.minimumPlayerEnergy ?? encounter.maximumPlayerEnergy;
  encounter.energy ??= { starting: encounter.maximumPlayerEnergy, ending: encounter.endingPlayerEnergy, timeAtZeroMs: 0, timeBelow25PercentMs: 0, regenerationRequested: 0, regenerationApplied: 0, regenerationWasted: 0, deniedActions: {}, deniedEnergyShortfall: {}, abilityDenials: {} };
  encounter.pickupsActiveAtEnd ??= {};
  encounter.restoration ??= { health: emptyRestoration(), energy: emptyRestoration() };
  encounter.buffUptimeMs ??= {};
  encounter.turrets ??= emptyTurretMetrics();
  encounter.spawnPressure ??= emptySpawnPressure();
  encounter.objectives ??= emptyObjectiveMetrics();
  for (const metrics of Object.values(encounter.enemyMetrics ?? {})) {
    if (!metrics) continue;
    metrics.engagedKills ??= 0;
    metrics.totalTimeToFirstDamageMs ??= 0;
    metrics.totalCombatTtkMs ??= 0;
    metrics.minimumCombatTtkMs ??= null;
    metrics.maximumCombatTtkMs ??= 0;
    metrics.combatTtkBuckets ??= emptyBuckets();
    metrics.overkillBySource ??= {};
  }
  if (encounter.boss) encounter.boss.attacks ??= {};
  encounter.derived ??= { spawnsPerActiveMinute: 0, killsPerActiveMinute: 0, averageEnemyTtkMs: null, averageCombatTtkMs: null, averageTimeToFirstDamageMs: null, averageActiveEnemies: 0, averageActiveWeight: 0, pickupCollectionRate: null, weaponAccuracy: null, turretAccuracy: null };
  return encounter;
};

const deriveEncounter = (encounter: GameplayEncounterMetrics): void => {
  const minutes = encounter.activeDurationMs / 60_000;
  const drops = Object.values(encounter.pickupDrops).reduce((sum, value) => sum + (value ?? 0), 0);
  const collected = Object.values(encounter.pickupsCollected).reduce((sum, value) => sum + (value ?? 0), 0);
  const enemyMetrics = Object.values(encounter.enemyMetrics).filter((metrics): metrics is EnemyTypeMetrics => Boolean(metrics));
  const totalLifetime = enemyMetrics.reduce((sum, metrics) => sum + metrics.totalTtkMs, 0);
  const engagedKills = enemyMetrics.reduce((sum, metrics) => sum + metrics.engagedKills, 0);
  const totalCombatTtk = enemyMetrics.reduce((sum, metrics) => sum + metrics.totalCombatTtkMs, 0);
  const totalTimeToFirstDamage = enemyMetrics.reduce((sum, metrics) => sum + metrics.totalTimeToFirstDamageMs, 0);
  encounter.derived = {
    spawnsPerActiveMinute: minutes > 0 ? encounter.enemySpawns / minutes : 0,
    killsPerActiveMinute: minutes > 0 ? encounter.enemyKills / minutes : 0,
    averageEnemyTtkMs: encounter.enemyKills > 0 ? totalLifetime / encounter.enemyKills : null,
    averageCombatTtkMs: engagedKills > 0 ? totalCombatTtk / engagedKills : null,
    averageTimeToFirstDamageMs: engagedKills > 0 ? totalTimeToFirstDamage / engagedKills : null,
    averageActiveEnemies: encounter.activeDurationMs > 0 ? encounter.spawnPressure.activeEnemyTimeMs / encounter.activeDurationMs : 0,
    averageActiveWeight: encounter.activeDurationMs > 0 ? encounter.spawnPressure.activeWeightTimeMs / encounter.activeDurationMs : 0,
    pickupCollectionRate: drops > 0 ? collected / drops : null,
    weaponAccuracy: encounter.projectiles.weapon.fired > 0 ? encounter.projectiles.weapon.hits / encounter.projectiles.weapon.fired : null,
    turretAccuracy: encounter.projectiles.turret.fired > 0 ? encounter.projectiles.turret.hits / encounter.projectiles.turret.fired : null
  };
};

export class GameplayTelemetryRecorder {
  private static state: StoredTelemetry | null = null;
  private static flushTimer: number | null = null;

  static beginRun(input: { runId: string; startedAt: number; baseSeed: number; protocol: RunProtocolId; contract: RunContractId | null; modFocus: ModFocusSignalId | null; upgrades: Record<string, number>; equippedMods: EquippedModSnapshot[] }): void {
    const state = this.getState();
    if (state.activeRun?.runId === input.runId) return;
    if (state.activeRun) this.archiveActiveRun('replaced');
    state.activeRun = {
      schemaVersion: 1, metricsRevision: 2, runId: input.runId, gameVersion: GAME_VERSION,
      startedAt: new Date(input.startedAt).toISOString(), endedAt: null, outcome: null,
      baseSeed: input.baseSeed, protocol: input.protocol, contract: input.contract, modFocus: input.modFocus,
      upgrades: { ...input.upgrades }, equippedMods: input.equippedMods.map((mod) => ({ ...mod })), encounters: []
    };
    this.persistNow();
  }

  static beginEncounter(input: { kind: EncounterKind; round: number; seed: number; layout: ArenaTemplate; maximumPlayerHealth: number; maximumPlayerEnergy: number; weaponDamage: number; weaponFireRate: number; weaponCritChance: number; weaponHeatPerShot: number; energyRegenPerSecond: number }): void {
    const run = this.activeRun();
    if (!run) return;
    const current = run.encounters.at(-1);
    if (current && !current.endedAt) this.endEncounter('replaced');
    run.encounters.push({
      metricsRevision: 2, kind: input.kind, round: input.round, seed: input.seed, layout: input.layout,
      startedAt: new Date().toISOString(), endedAt: null, activeDurationMs: 0, outcome: null,
      peakActiveEnemies: 0, enemySpawns: 0, enemyKills: 0, enemyMetrics: {}, recentKillSamples: [],
      shotsFired: 0, shotEnergySpent: 0, potentialWeaponDamageFired: 0,
      weaponDamageAtStart: input.weaponDamage, weaponFireRateAtStart: input.weaponFireRate,
      weaponCritChanceAtStart: input.weaponCritChance, weaponHeatPerShotAtStart: input.weaponHeatPerShot,
      projectiles: { weapon: emptyProjectileMetrics(), turret: emptyProjectileMetrics(), enemy: emptyProjectileMetrics(), boss: emptyProjectileMetrics() },
      maximumPlayerHealth: input.maximumPlayerHealth, endingPlayerHealth: input.maximumPlayerHealth,
      maximumPlayerEnergy: input.maximumPlayerEnergy, endingPlayerEnergy: input.maximumPlayerEnergy,
      energyRegenPerSecond: input.energyRegenPerSecond,
      energy: { starting: input.maximumPlayerEnergy, ending: input.maximumPlayerEnergy, timeAtZeroMs: 0, timeBelow25PercentMs: 0, regenerationRequested: 0, regenerationApplied: 0, regenerationWasted: 0, deniedActions: {}, deniedEnergyShortfall: {}, abilityDenials: {} },
      abilitiesUsed: {}, abilityEnergySpent: {}, pickupDrops: {}, pickupDropsBySource: {}, pickupDropsBySourceAndType: {}, pickupsCollected: {}, pickupsExpired: {}, pickupsActiveAtEnd: {},
      restoration: { health: emptyRestoration(), energy: emptyRestoration() }, buffUptimeMs: {}, modDrops: [],
      playerDamageBySource: {}, playerHitsBySource: {}, minimumPlayerHealth: input.maximumPlayerHealth, minimumPlayerEnergy: input.maximumPlayerEnergy,
      turrets: emptyTurretMetrics(), spawnPressure: emptySpawnPressure(), objectives: emptyObjectiveMetrics(),
      creditsEarned: 0, coreTokensEarned: 0, plasmaChipsEarned: 0, boss: null,
      derived: { spawnsPerActiveMinute: 0, killsPerActiveMinute: 0, averageEnemyTtkMs: null, averageCombatTtkMs: null, averageTimeToFirstDamageMs: null, averageActiveEnemies: 0, averageActiveWeight: 0, pickupCollectionRate: null, weaponAccuracy: null, turretAccuracy: null }
    });
    this.persistSoon();
  }

  static recordActiveFrame(deltaMs: number, activeEnemies: number, playerHealth: number, playerEnergy: number, input: { activeWeight?: number; activeCountCap?: number; activeWeightCap?: number; activeBombs?: number; activeDefusers?: number; buffs?: Partial<Record<BuffName, boolean>> } = {}): void {
    const encounter = this.activeEncounter();
    if (!encounter || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    const appliedDelta = Math.min(deltaMs, 250);
    encounter.activeDurationMs += appliedDelta;
    encounter.peakActiveEnemies = Math.max(encounter.peakActiveEnemies, Math.max(0, Math.floor(activeEnemies)));
    encounter.minimumPlayerHealth = Math.min(encounter.minimumPlayerHealth, Math.max(0, playerHealth));
    encounter.minimumPlayerEnergy = Math.min(encounter.minimumPlayerEnergy, Math.max(0, playerEnergy));
    encounter.endingPlayerHealth = Math.max(0, playerHealth);
    encounter.endingPlayerEnergy = Math.max(0, playerEnergy);
    encounter.energy.ending = encounter.endingPlayerEnergy;
    if (playerEnergy <= 0.01) encounter.energy.timeAtZeroMs += appliedDelta;
    if (playerEnergy <= encounter.maximumPlayerEnergy * 0.25) encounter.energy.timeBelow25PercentMs += appliedDelta;

    const activeWeight = Math.max(0, input.activeWeight ?? activeEnemies);
    encounter.spawnPressure.activeEnemyTimeMs += Math.max(0, activeEnemies) * appliedDelta;
    encounter.spawnPressure.activeWeightTimeMs += activeWeight * appliedDelta;
    encounter.spawnPressure.peakActiveWeight = Math.max(encounter.spawnPressure.peakActiveWeight, activeWeight);
    if ((input.activeCountCap ?? Infinity) > 0 && activeEnemies >= (input.activeCountCap ?? Infinity)) encounter.spawnPressure.timeAtCountCapMs += appliedDelta;
    if ((input.activeWeightCap ?? Infinity) > 0 && activeWeight >= (input.activeWeightCap ?? Infinity)) encounter.spawnPressure.timeAtWeightCapMs += appliedDelta;

    const activeBombs = Math.max(0, Math.floor(input.activeBombs ?? 0));
    const activeDefusers = Math.max(0, Math.floor(input.activeDefusers ?? 0));
    encounter.objectives.maxConcurrentBombs = Math.max(encounter.objectives.maxConcurrentBombs, activeBombs);
    encounter.objectives.activeBombTimeMs += activeBombs * appliedDelta;
    encounter.objectives.activeDefuserTimeMs += activeDefusers * appliedDelta;
    encounter.objectives.peakSimultaneousDefusers = Math.max(encounter.objectives.peakSimultaneousDefusers, activeDefusers);
    for (const [buff, active] of Object.entries(input.buffs ?? {}) as Array<[BuffName, boolean]>) if (active) increment(encounter.buffUptimeMs, buff, appliedDelta);
  }

  static activeEncounterElapsedMs(): number { return this.activeEncounter()?.activeDurationMs ?? 0; }

  static recordEnergyRegeneration(requested: number, applied: number): void {
    const energy = this.activeEncounter()?.energy;
    if (!energy) return;
    energy.regenerationRequested += Math.max(0, requested);
    energy.regenerationApplied += Math.max(0, applied);
    energy.regenerationWasted += Math.max(0, requested - applied);
  }

  static recordEnergyDenied(action: EnergyAction, required: number, available: number): void {
    const energy = this.activeEncounter()?.energy;
    if (!energy) return;
    increment(energy.deniedActions, action);
    increment(energy.deniedEnergyShortfall, action, Math.max(0, required - available));
    if (action !== 'shot') this.recordAbilityDenied(action, 'energy');
    this.persistSoon();
  }

  static recordAbilityDenied(ability: TelemetryAbility, reason: AbilityDenialReason): void {
    const energy = this.activeEncounter()?.energy;
    if (!energy) return;
    const reasons = energy.abilityDenials[ability] ?? (energy.abilityDenials[ability] = {});
    increment(reasons, reason);
  }

  static recordEnemySpawn(type: EnemyType, maximumHealth: number): number {
    const encounter = this.activeEncounter();
    if (!encounter) return 0;
    const metrics = encounter.enemyMetrics[type] ?? (encounter.enemyMetrics[type] = createEnemyMetrics());
    metrics.spawned += 1;
    metrics.totalSpawnHealth += Math.max(0, maximumHealth);
    encounter.enemySpawns += 1;
    this.persistSoon();
    return encounter.activeDurationMs;
  }

  static recordSpawnAttempt(result: 'spawned' | SpawnBlockReason, estimatedDelayMs: number): void {
    const pressure = this.activeEncounter()?.spawnPressure;
    if (!pressure) return;
    pressure.spawnAttempts += 1;
    if (result !== 'spawned') {
      increment(pressure.blockedAttempts, result);
      increment(pressure.estimatedBlockedDelayMs, result, Math.max(0, estimatedDelayMs));
    }
  }

  static recordEnemyKill(input: { type: EnemyType; maximumHealth: number; spawnedAtActiveMs: number; firstDamagedAtActiveMs: number | null; finalSource: CombatDamageSource; damageBySource: Partial<Record<CombatDamageSource, number>>; credits: number; coreTokens: number }): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    const metrics = encounter.enemyMetrics[input.type] ?? (encounter.enemyMetrics[input.type] = createEnemyMetrics());
    const lifetimeMs = Math.max(0, encounter.activeDurationMs - input.spawnedAtActiveMs);
    const firstDamagedAtActiveMs = Number.isFinite(input.firstDamagedAtActiveMs)
      ? input.firstDamagedAtActiveMs
      : null;
    const timeToFirstDamageMs = firstDamagedAtActiveMs === null ? null : Math.max(0, firstDamagedAtActiveMs - input.spawnedAtActiveMs);
    const combatTtkMs = firstDamagedAtActiveMs === null ? null : Math.max(0, encounter.activeDurationMs - firstDamagedAtActiveMs);
    metrics.killed += 1;
    metrics.totalTtkMs += lifetimeMs;
    metrics.minimumTtkMs = metrics.minimumTtkMs === null ? lifetimeMs : Math.min(metrics.minimumTtkMs, lifetimeMs);
    metrics.maximumTtkMs = Math.max(metrics.maximumTtkMs, lifetimeMs);
    metrics.ttkBuckets[bucketFor(lifetimeMs)] += 1;
    if (combatTtkMs !== null && timeToFirstDamageMs !== null) {
      metrics.engagedKills += 1;
      metrics.totalTimeToFirstDamageMs += timeToFirstDamageMs;
      metrics.totalCombatTtkMs += combatTtkMs;
      metrics.minimumCombatTtkMs = metrics.minimumCombatTtkMs === null ? combatTtkMs : Math.min(metrics.minimumCombatTtkMs, combatTtkMs);
      metrics.maximumCombatTtkMs = Math.max(metrics.maximumCombatTtkMs, combatTtkMs);
      metrics.combatTtkBuckets[bucketFor(combatTtkMs)] += 1;
    }
    increment(metrics.killSources, input.finalSource);
    metrics.creditsAwarded += input.credits;
    metrics.coreTokensAwarded += input.coreTokens;
    encounter.enemyKills += 1;
    encounter.recentKillSamples.push({ type: input.type, ttkMs: lifetimeMs, timeToFirstDamageMs, combatTtkMs, maximumHealth: input.maximumHealth, finalSource: input.finalSource, damageBySource: { ...input.damageBySource } });
    if (encounter.recentKillSamples.length > MAX_KILL_SAMPLES_PER_ENCOUNTER) encounter.recentKillSamples.shift();
    this.persistSoon();
  }

  static recordEnemyDamage(type: EnemyType, source: CombatDamageSource, applied: number, overkill = 0): void {
    const encounter = this.activeEncounter();
    if (!encounter || applied <= 0) return;
    const metrics = encounter.enemyMetrics[type] ?? (encounter.enemyMetrics[type] = createEnemyMetrics());
    increment(metrics.damageBySource, source, applied);
    if (overkill > 0) increment(metrics.overkillBySource, source, overkill);
  }

  static recordShot(damage: number, energySpent: number, critical = false): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    encounter.shotsFired += 1;
    encounter.shotEnergySpent += Math.max(0, energySpent);
    encounter.potentialWeaponDamageFired += Math.max(0, damage);
    this.recordProjectileFired('weapon', critical);
  }

  static recordProjectileFired(owner: ProjectileOwner, critical = false): void {
    const metrics = this.activeEncounter()?.projectiles[owner];
    if (!metrics) return;
    metrics.fired += 1;
    if (critical) metrics.criticalShots += 1;
  }

  static recordProjectileHit(owner: ProjectileOwner, damageApplied: number, overkill = 0, critical = false, blocked = false): void {
    const metrics = this.activeEncounter()?.projectiles[owner];
    if (!metrics) return;
    metrics.hits += 1;
    metrics.damageApplied += Math.max(0, damageApplied);
    metrics.overkillDamage += Math.max(0, overkill);
    if (critical) metrics.criticalHits += 1;
    if (blocked) metrics.blockedHits += 1;
  }

  static recordProjectileMiss(owner: ProjectileOwner, reason: ProjectileMissReason, splitChildren = 0): void {
    const metrics = this.activeEncounter()?.projectiles[owner];
    if (!metrics) return;
    if (reason === 'expired') metrics.expired += 1;
    else if (reason === 'wall') metrics.wallHits += 1;
    else {
      metrics.fenceSplits += 1;
      metrics.splitChildrenCreated += Math.max(0, Math.floor(splitChildren));
    }
  }

  static recordAbilityUse(ability: TelemetryAbility, energySpent: number): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    increment(encounter.abilitiesUsed, ability);
    increment(encounter.abilityEnergySpent, ability, Math.max(0, energySpent));
    this.persistSoon();
  }

  static recordPickupDropped(type: PickupType, source: PickupDropSource): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    increment(encounter.pickupDrops, type);
    increment(encounter.pickupDropsBySource, source);
    const sourceMetrics = encounter.pickupDropsBySourceAndType[source] ?? (encounter.pickupDropsBySourceAndType[source] = {});
    increment(sourceMetrics, type);
    this.persistSoon();
  }

  static recordPickupCollected(type: PickupType, source?: PickupDropSource, requested = 0, applied = 0): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    increment(encounter.pickupsCollected, type);
    if (type === 'health' || type === 'energy') this.recordResourceGain(type, source ?? 'enemy', requested, applied, true);
    this.persistSoon();
  }

  static recordResourceGain(resource: 'health' | 'energy', source: ResourceGainSource, requested: number, applied: number, collection = false): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    const metrics = encounter.restoration[resource];
    const safeRequested = Math.max(0, requested);
    const safeApplied = Math.max(0, applied);
    const wasted = Math.max(0, safeRequested - safeApplied);
    if (collection) metrics.collections += 1;
    metrics.requested += safeRequested;
    metrics.applied += safeApplied;
    metrics.wasted += wasted;
    const bySource = metrics.bySource[source] ?? (metrics.bySource[source] = { requested: 0, applied: 0, wasted: 0 });
    bySource.requested += safeRequested;
    bySource.applied += safeApplied;
    bySource.wasted += wasted;
  }

  static recordPickupExpired(type: PickupType): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    increment(encounter.pickupsExpired, type);
    this.persistSoon();
  }

  static recordModDrop(modId: string, rarity: string, source: ModDropSource, duplicate: boolean): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    encounter.modDrops.push({ modId, rarity, source, duplicate });
    this.persistSoon();
  }

  static recordPlayerDamage(source: PlayerDamageSource, amount: number): void {
    const encounter = this.activeEncounter();
    if (!encounter || amount <= 0) return;
    increment(encounter.playerHitsBySource, source);
    increment(encounter.playerDamageBySource, source, amount);
    this.persistSoon();
  }

  static recordTurretPlaced(id: string, config: { maximumHealth: number; damage: number; fireRate: number; range: number }): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    encounter.turrets.placements += 1;
    encounter.turrets.deployments.push({ id, placedAtActiveMs: encounter.activeDurationMs, removedAtActiveMs: null, lifetimeMs: 0, maximumHealth: config.maximumHealth, damage: config.damage, fireRate: config.fireRate, range: config.range, shots: 0, hits: 0, damageApplied: 0, overkillDamage: 0, damageTaken: 0, destroyed: false, survivedEncounter: false });
  }

  static recordTurretShot(id: string): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    encounter.turrets.shots += 1;
    const deployment = encounter.turrets.deployments.find((entry) => entry.id === id);
    if (deployment) deployment.shots += 1;
    this.recordProjectileFired('turret');
  }

  static recordTurretHit(id: string, applied: number, overkill = 0): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    encounter.turrets.hits += 1;
    encounter.turrets.damageApplied += Math.max(0, applied);
    encounter.turrets.overkillDamage += Math.max(0, overkill);
    const deployment = encounter.turrets.deployments.find((entry) => entry.id === id);
    if (deployment) { deployment.hits += 1; deployment.damageApplied += Math.max(0, applied); deployment.overkillDamage += Math.max(0, overkill); }
    this.recordProjectileHit('turret', applied, overkill);
  }

  static recordTurretDamaged(id: string, applied: number): void {
    const encounter = this.activeEncounter();
    if (!encounter || applied <= 0) return;
    encounter.turrets.damageTaken += applied;
    const deployment = encounter.turrets.deployments.find((entry) => entry.id === id);
    if (deployment) deployment.damageTaken += applied;
  }

  static recordTurretDestroyed(id: string): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    const deployment = encounter.turrets.deployments.find((entry) => entry.id === id);
    if (!deployment || deployment.destroyed) return;
    deployment.destroyed = true;
    deployment.removedAtActiveMs = encounter.activeDurationMs;
    deployment.lifetimeMs = Math.max(0, encounter.activeDurationMs - deployment.placedAtActiveMs);
    encounter.turrets.destroyed += 1;
  }

  static recordBombArmed(siteId: string): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    const site = encounter.objectives.sites[siteId] ?? (encounter.objectives.sites[siteId] = createSiteMetrics());
    site.armed += 1;
    encounter.objectives.sitesArmed += 1;
  }

  static recordBombDestroyed(siteId: string): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    const site = encounter.objectives.sites[siteId] ?? (encounter.objectives.sites[siteId] = createSiteMetrics());
    site.destroyed += 1;
    encounter.objectives.sitesDestroyed += 1;
  }

  static recordDefuseStarted(siteId: string): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    const site = encounter.objectives.sites[siteId] ?? (encounter.objectives.sites[siteId] = createSiteMetrics());
    if (site.defuseStartedAtActiveMs !== null) return;
    site.defuseStartedAtActiveMs = encounter.activeDurationMs;
    site.defuseAttempts += 1;
    encounter.objectives.defuseAttempts += 1;
  }

  static recordDefuseStopped(siteId: string): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    const site = encounter.objectives.sites[siteId] ?? (encounter.objectives.sites[siteId] = createSiteMetrics());
    if (site.defuseStartedAtActiveMs === null) return;
    const duration = Math.max(0, encounter.activeDurationMs - site.defuseStartedAtActiveMs);
    site.defuseActiveMs += duration;
    site.defuseStartedAtActiveMs = null;
    site.defuseInterruptions += 1;
    encounter.objectives.defuseActiveMs += duration;
    encounter.objectives.defuseInterruptions += 1;
  }

  static recordDefuseProgress(siteId: string, appliedMs: number, blockedMs: number, activeDefusers: number): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    const site = encounter.objectives.sites[siteId] ?? (encounter.objectives.sites[siteId] = createSiteMetrics());
    site.defuseProgressAppliedMs += Math.max(0, appliedMs);
    site.defuseProgressBlockedMs += Math.max(0, blockedMs);
    encounter.objectives.defuseProgressAppliedMs += Math.max(0, appliedMs);
    encounter.objectives.defuseProgressBlockedMs += Math.max(0, blockedMs);
    encounter.objectives.peakSimultaneousDefusers = Math.max(encounter.objectives.peakSimultaneousDefusers, Math.max(0, activeDefusers));
  }

  static recordDefuseCompleted(siteId: string): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    const site = encounter.objectives.sites[siteId] ?? (encounter.objectives.sites[siteId] = createSiteMetrics());
    site.defuseCompleted += 1;
    encounter.objectives.successfulDefuses += 1;
  }

  static startBoss(archetype: BossArchetype, maximumHealth: number): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    encounter.boss = { archetype, maximumHealth, damageBySource: {}, creditsDropped: 0, defeated: false, ttkMs: null, attacks: {} };
    this.persistSoon();
  }

  static recordBossDamage(source: CombatDamageSource, amount: number): void {
    const boss = this.activeEncounter()?.boss;
    if (!boss || amount <= 0) return;
    increment(boss.damageBySource, source, amount);
  }

  static recordBossAttackCast(attack: BossAttackKind): void {
    const boss = this.activeEncounter()?.boss;
    if (!boss) return;
    const metrics = boss.attacks[attack] ?? (boss.attacks[attack] = createBossAttackMetrics());
    metrics.casts += 1;
  }

  static recordBossProjectileFired(attack: BossAttackKind): void {
    const boss = this.activeEncounter()?.boss;
    if (!boss) return;
    const metrics = boss.attacks[attack] ?? (boss.attacks[attack] = createBossAttackMetrics());
    metrics.projectiles += 1;
    this.recordProjectileFired('boss');
  }

  static recordBossAttackIntersection(attack: BossAttackKind, damage: number, blocked: boolean): void {
    const boss = this.activeEncounter()?.boss;
    if (!boss) return;
    const metrics = boss.attacks[attack] ?? (boss.attacks[attack] = createBossAttackMetrics());
    metrics.playerIntersections += 1;
    if (blocked) metrics.blockedHits += 1;
    else { metrics.playerHits += 1; metrics.damage += Math.max(0, damage); }
  }

  static recordBossCreditDrop(): void {
    const boss = this.activeEncounter()?.boss;
    if (!boss) return;
    boss.creditsDropped += 1;
    this.persistSoon();
  }

  static recordBossDefeated(): void {
    const encounter = this.activeEncounter();
    if (!encounter?.boss) return;
    encounter.boss.defeated = true;
    encounter.boss.ttkMs = encounter.activeDurationMs;
  }

  static recordEncounterEndState(input: { playerHealth: number; playerEnergy: number; activePickups: Partial<Record<PickupType, number>> }): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    encounter.endingPlayerHealth = Math.max(0, input.playerHealth);
    encounter.endingPlayerEnergy = Math.max(0, input.playerEnergy);
    encounter.energy.ending = encounter.endingPlayerEnergy;
    encounter.pickupsActiveAtEnd = { ...input.activePickups };
  }

  static endEncounter(outcome: EncounterOutcome, rewards?: { credits?: number; coreTokens?: number; plasmaChips?: number }): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    for (const site of Object.values(encounter.objectives.sites)) {
      if (site.defuseStartedAtActiveMs === null) continue;
      const duration = Math.max(0, encounter.activeDurationMs - site.defuseStartedAtActiveMs);
      site.defuseActiveMs += duration;
      encounter.objectives.defuseActiveMs += duration;
      site.defuseStartedAtActiveMs = null;
    }
    for (const deployment of encounter.turrets.deployments) {
      if (deployment.removedAtActiveMs !== null) continue;
      deployment.removedAtActiveMs = encounter.activeDurationMs;
      deployment.lifetimeMs = Math.max(0, encounter.activeDurationMs - deployment.placedAtActiveMs);
      deployment.survivedEncounter = true;
      encounter.turrets.survivedEncounter += 1;
    }
    encounter.turrets.totalLifetimeMs = encounter.turrets.deployments.reduce((sum, deployment) => sum + deployment.lifetimeMs, 0);
    encounter.outcome = outcome;
    encounter.endedAt = new Date().toISOString();
    encounter.creditsEarned = Math.max(0, Math.floor(rewards?.credits ?? encounter.creditsEarned));
    encounter.coreTokensEarned = Math.max(0, Math.floor(rewards?.coreTokens ?? encounter.coreTokensEarned));
    encounter.plasmaChipsEarned = Math.max(0, Math.floor(rewards?.plasmaChips ?? encounter.plasmaChipsEarned));
    deriveEncounter(encounter);
    this.persistNow();
  }

  static finishRun(outcome: EncounterOutcome): void {
    const state = this.getState();
    if (!state.activeRun) return;
    if (this.activeEncounter()) this.endEncounter(outcome);
    this.archiveActiveRun(outcome);
    this.persistNow();
  }

  static exportToJsonFile(): boolean {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false;
    const state = this.getState();
    const exportedAt = new Date().toISOString();
    const payload = { schemaVersion: 1, metricsRevision: 2, exportedAt, activeRun: state.activeRun, completedRuns: state.completedRuns };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `n3ondefense-gameplay-metrics-${exportedAt.replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }

  static snapshot(): StoredTelemetry { return structuredClone(this.getState()); }

  static resetForTests(): void {
    this.state = emptyStoredTelemetry();
    if (this.flushTimer !== null && typeof window !== 'undefined') window.clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private static activeRun(): GameplayRunMetrics | null { return this.getState().activeRun; }

  private static activeEncounter(): GameplayEncounterMetrics | null {
    const encounter = this.activeRun()?.encounters.at(-1) ?? null;
    return encounter && !encounter.endedAt ? ensureEncounterRevision(encounter) : null;
  }

  private static archiveActiveRun(outcome: EncounterOutcome): void {
    const state = this.getState();
    const run = state.activeRun;
    if (!run) return;
    run.outcome = outcome;
    run.endedAt = new Date().toISOString();
    state.completedRuns.unshift(run);
    state.completedRuns = state.completedRuns.slice(0, MAX_COMPLETED_RUNS);
    state.activeRun = null;
  }

  private static getState(): StoredTelemetry {
    if (this.state) return this.state;
    this.state = emptyStoredTelemetry();
    if (typeof localStorage === 'undefined') return this.state;
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<StoredTelemetry> | null;
      if (parsed?.schemaVersion === 1 && Array.isArray(parsed.completedRuns)) {
        const normalizeRun = (run: GameplayRunMetrics): GameplayRunMetrics => {
          run.metricsRevision ??= 1;
          run.encounters = (run.encounters ?? []).map((encounter) => ensureEncounterRevision(encounter));
          return run;
        };
        this.state = {
          schemaVersion: 1,
          metricsRevision: 2,
          activeRun: parsed.activeRun && typeof parsed.activeRun === 'object' ? normalizeRun(parsed.activeRun as GameplayRunMetrics) : null,
          completedRuns: (parsed.completedRuns as GameplayRunMetrics[]).slice(0, MAX_COMPLETED_RUNS).map(normalizeRun)
        };
      }
    } catch {
      this.state = emptyStoredTelemetry();
    }
    return this.state;
  }

  private static persistSoon(): void {
    if (typeof window === 'undefined' || this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => { this.flushTimer = null; this.persistNow(); }, 1200);
  }

  private static persistNow(): void {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.getState())); } catch {
      // Telemetry is non-critical and must never interrupt gameplay or saves.
    }
  }
}
