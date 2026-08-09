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

interface EnemyTypeMetrics {
  spawned: number;
  killed: number;
  totalSpawnHealth: number;
  totalTtkMs: number;
  minimumTtkMs: number | null;
  maximumTtkMs: number;
  ttkBuckets: Record<'under500' | 'under1000' | 'under2000' | 'under4000' | 'under8000' | 'over8000', number>;
  killSources: Partial<Record<CombatDamageSource, number>>;
  damageBySource: Partial<Record<CombatDamageSource, number>>;
  creditsAwarded: number;
  coreTokensAwarded: number;
}

interface BossMetrics {
  archetype: BossArchetype;
  maximumHealth: number;
  damageBySource: Partial<Record<CombatDamageSource, number>>;
  creditsDropped: number;
  defeated: boolean;
  ttkMs: number | null;
}

export interface GameplayEncounterMetrics {
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
    ttkMs: number;
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
  maximumPlayerHealth: number;
  maximumPlayerEnergy: number;
  energyRegenPerSecond: number;
  abilitiesUsed: Partial<Record<'dash' | 'shield' | 'fence' | 'turret' | 'mine', number>>;
  abilityEnergySpent: Partial<Record<'dash' | 'shield' | 'fence' | 'turret' | 'mine', number>>;
  pickupDrops: Partial<Record<PickupType, number>>;
  pickupDropsBySource: Partial<Record<PickupDropSource, number>>;
  pickupDropsBySourceAndType: Partial<Record<PickupDropSource, Partial<Record<PickupType, number>>>>;
  pickupsCollected: Partial<Record<PickupType, number>>;
  pickupsExpired: Partial<Record<PickupType, number>>;
  modDrops: Array<{ modId: string; rarity: string; source: ModDropSource; duplicate: boolean }>;
  playerDamageBySource: Partial<Record<PlayerDamageSource, number>>;
  playerHitsBySource: Partial<Record<PlayerDamageSource, number>>;
  minimumPlayerHealth: number;
  minimumPlayerEnergy: number;
  creditsEarned: number;
  coreTokensEarned: number;
  plasmaChipsEarned: number;
  boss: BossMetrics | null;
  derived: {
    spawnsPerActiveMinute: number;
    killsPerActiveMinute: number;
    averageEnemyTtkMs: number | null;
    pickupCollectionRate: number | null;
  };
}

export interface GameplayRunMetrics {
  schemaVersion: 1;
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

interface StoredTelemetry {
  schemaVersion: 1;
  activeRun: GameplayRunMetrics | null;
  completedRuns: GameplayRunMetrics[];
}

const STORAGE_KEY = 'n3ondefense.gameplay-telemetry.v1';
const MAX_COMPLETED_RUNS = 5;
// Full-run counts and distributions are never sampled; only the recent
// per-kill examples are bounded to keep browser-local telemetry compact.
const MAX_KILL_SAMPLES_PER_ENCOUNTER = 60;
const emptyStoredTelemetry = (): StoredTelemetry => ({ schemaVersion: 1, activeRun: null, completedRuns: [] });
const increment = <T extends string>(record: Partial<Record<T, number>>, key: T, amount = 1): void => {
  record[key] = (record[key] ?? 0) + amount;
};

const createEnemyMetrics = (): EnemyTypeMetrics => ({
  spawned: 0,
  killed: 0,
  totalSpawnHealth: 0,
  totalTtkMs: 0,
  minimumTtkMs: null,
  maximumTtkMs: 0,
  ttkBuckets: { under500: 0, under1000: 0, under2000: 0, under4000: 0, under8000: 0, over8000: 0 },
  killSources: {},
  damageBySource: {},
  creditsAwarded: 0,
  coreTokensAwarded: 0
});

const deriveEncounter = (encounter: GameplayEncounterMetrics): void => {
  const minutes = encounter.activeDurationMs / 60_000;
  const drops = Object.values(encounter.pickupDrops).reduce((sum, value) => sum + (value ?? 0), 0);
  const collected = Object.values(encounter.pickupsCollected).reduce((sum, value) => sum + (value ?? 0), 0);
  const totalTtk = Object.values(encounter.enemyMetrics).reduce((sum, metrics) => sum + (metrics?.totalTtkMs ?? 0), 0);
  encounter.derived = {
    spawnsPerActiveMinute: minutes > 0 ? encounter.enemySpawns / minutes : 0,
    killsPerActiveMinute: minutes > 0 ? encounter.enemyKills / minutes : 0,
    averageEnemyTtkMs: encounter.enemyKills > 0 ? totalTtk / encounter.enemyKills : null,
    pickupCollectionRate: drops > 0 ? collected / drops : null
  };
};

export class GameplayTelemetryRecorder {
  private static state: StoredTelemetry | null = null;
  private static flushTimer: number | null = null;

  static beginRun(input: {
    runId: string;
    startedAt: number;
    baseSeed: number;
    protocol: RunProtocolId;
    contract: RunContractId | null;
    modFocus: ModFocusSignalId | null;
    upgrades: Record<string, number>;
    equippedMods: EquippedModSnapshot[];
  }): void {
    const state = this.getState();
    if (state.activeRun?.runId === input.runId) return;
    if (state.activeRun) this.archiveActiveRun('replaced');
    state.activeRun = {
      schemaVersion: 1,
      runId: input.runId,
      gameVersion: GAME_VERSION,
      startedAt: new Date(input.startedAt).toISOString(),
      endedAt: null,
      outcome: null,
      baseSeed: input.baseSeed,
      protocol: input.protocol,
      contract: input.contract,
      modFocus: input.modFocus,
      upgrades: { ...input.upgrades },
      equippedMods: input.equippedMods.map((mod) => ({ ...mod })),
      encounters: []
    };
    this.persistNow();
  }

  static beginEncounter(input: {
    kind: EncounterKind;
    round: number;
    seed: number;
    layout: ArenaTemplate;
    maximumPlayerHealth: number;
    maximumPlayerEnergy: number;
    weaponDamage: number;
    weaponFireRate: number;
    weaponCritChance: number;
    weaponHeatPerShot: number;
    energyRegenPerSecond: number;
  }): void {
    const run = this.activeRun();
    if (!run) return;
    const current = run.encounters.at(-1);
    if (current && !current.endedAt) this.endEncounter('replaced');
    run.encounters.push({
      kind: input.kind,
      round: input.round,
      seed: input.seed,
      layout: input.layout,
      startedAt: new Date().toISOString(),
      endedAt: null,
      activeDurationMs: 0,
      outcome: null,
      peakActiveEnemies: 0,
      enemySpawns: 0,
      enemyKills: 0,
      enemyMetrics: {},
      recentKillSamples: [],
      shotsFired: 0,
      shotEnergySpent: 0,
      potentialWeaponDamageFired: 0,
      weaponDamageAtStart: input.weaponDamage,
      weaponFireRateAtStart: input.weaponFireRate,
      weaponCritChanceAtStart: input.weaponCritChance,
      weaponHeatPerShotAtStart: input.weaponHeatPerShot,
      maximumPlayerHealth: input.maximumPlayerHealth,
      maximumPlayerEnergy: input.maximumPlayerEnergy,
      energyRegenPerSecond: input.energyRegenPerSecond,
      abilitiesUsed: {},
      abilityEnergySpent: {},
      pickupDrops: {},
      pickupDropsBySource: {},
      pickupDropsBySourceAndType: {},
      pickupsCollected: {},
      pickupsExpired: {},
      modDrops: [],
      playerDamageBySource: {},
      playerHitsBySource: {},
      minimumPlayerHealth: input.maximumPlayerHealth,
      minimumPlayerEnergy: input.maximumPlayerEnergy,
      creditsEarned: 0,
      coreTokensEarned: 0,
      plasmaChipsEarned: 0,
      boss: null,
      derived: { spawnsPerActiveMinute: 0, killsPerActiveMinute: 0, averageEnemyTtkMs: null, pickupCollectionRate: null }
    });
    this.persistSoon();
  }

  static recordActiveFrame(deltaMs: number, activeEnemies: number, playerHealth: number, playerEnergy: number): void {
    const encounter = this.activeEncounter();
    if (!encounter || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    encounter.activeDurationMs += Math.min(deltaMs, 250);
    encounter.peakActiveEnemies = Math.max(encounter.peakActiveEnemies, Math.max(0, Math.floor(activeEnemies)));
    encounter.minimumPlayerHealth = Math.min(encounter.minimumPlayerHealth, Math.max(0, playerHealth));
    encounter.minimumPlayerEnergy = Math.min(encounter.minimumPlayerEnergy, Math.max(0, playerEnergy));
  }

  static activeEncounterElapsedMs(): number {
    return this.activeEncounter()?.activeDurationMs ?? 0;
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

  static recordEnemyKill(input: {
    type: EnemyType;
    maximumHealth: number;
    spawnedAtActiveMs: number;
    finalSource: CombatDamageSource;
    damageBySource: Partial<Record<CombatDamageSource, number>>;
    credits: number;
    coreTokens: number;
  }): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    const metrics = encounter.enemyMetrics[input.type] ?? (encounter.enemyMetrics[input.type] = createEnemyMetrics());
    const ttkMs = Math.max(0, encounter.activeDurationMs - input.spawnedAtActiveMs);
    metrics.killed += 1;
    metrics.totalTtkMs += ttkMs;
    metrics.minimumTtkMs = metrics.minimumTtkMs === null ? ttkMs : Math.min(metrics.minimumTtkMs, ttkMs);
    metrics.maximumTtkMs = Math.max(metrics.maximumTtkMs, ttkMs);
    const bucket = ttkMs < 500 ? 'under500' : ttkMs < 1000 ? 'under1000' : ttkMs < 2000 ? 'under2000' : ttkMs < 4000 ? 'under4000' : ttkMs < 8000 ? 'under8000' : 'over8000';
    metrics.ttkBuckets[bucket] += 1;
    increment(metrics.killSources, input.finalSource);
    metrics.creditsAwarded += input.credits;
    metrics.coreTokensAwarded += input.coreTokens;
    encounter.enemyKills += 1;
    encounter.recentKillSamples.push({
      type: input.type,
      ttkMs,
      maximumHealth: input.maximumHealth,
      finalSource: input.finalSource,
      damageBySource: { ...input.damageBySource }
    });
    if (encounter.recentKillSamples.length > MAX_KILL_SAMPLES_PER_ENCOUNTER) encounter.recentKillSamples.shift();
    this.persistSoon();
  }

  static recordEnemyDamage(type: EnemyType, source: CombatDamageSource, amount: number): void {
    const encounter = this.activeEncounter();
    if (!encounter || amount <= 0) return;
    const metrics = encounter.enemyMetrics[type] ?? (encounter.enemyMetrics[type] = createEnemyMetrics());
    increment(metrics.damageBySource, source, amount);
  }

  static recordShot(damage: number, energySpent: number): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    encounter.shotsFired += 1;
    encounter.shotEnergySpent += Math.max(0, energySpent);
    encounter.potentialWeaponDamageFired += Math.max(0, damage);
  }

  static recordAbilityUse(ability: 'dash' | 'shield' | 'fence' | 'turret' | 'mine', energySpent: number): void {
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
    const sourceMetrics = encounter.pickupDropsBySourceAndType[source]
      ?? (encounter.pickupDropsBySourceAndType[source] = {});
    increment(sourceMetrics, type);
    this.persistSoon();
  }

  static recordPickupCollected(type: PickupType): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    increment(encounter.pickupsCollected, type);
    this.persistSoon();
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

  static startBoss(archetype: BossArchetype, maximumHealth: number): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
    encounter.boss = { archetype, maximumHealth, damageBySource: {}, creditsDropped: 0, defeated: false, ttkMs: null };
    this.persistSoon();
  }

  static recordBossDamage(source: CombatDamageSource, amount: number): void {
    const boss = this.activeEncounter()?.boss;
    if (!boss || amount <= 0) return;
    increment(boss.damageBySource, source, amount);
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

  static endEncounter(outcome: EncounterOutcome, rewards?: { credits?: number; coreTokens?: number; plasmaChips?: number }): void {
    const encounter = this.activeEncounter();
    if (!encounter) return;
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
    const payload = { schemaVersion: 1, exportedAt, activeRun: state.activeRun, completedRuns: state.completedRuns };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `n3ondefense-gameplay-metrics-${exportedAt.replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }

  static snapshot(): StoredTelemetry {
    return structuredClone(this.getState());
  }

  static resetForTests(): void {
    this.state = emptyStoredTelemetry();
    if (this.flushTimer !== null && typeof window !== 'undefined') window.clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private static activeRun(): GameplayRunMetrics | null {
    return this.getState().activeRun;
  }

  private static activeEncounter(): GameplayEncounterMetrics | null {
    const encounter = this.activeRun()?.encounters.at(-1) ?? null;
    return encounter && !encounter.endedAt ? encounter : null;
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
        this.state = {
          schemaVersion: 1,
          activeRun: parsed.activeRun && typeof parsed.activeRun === 'object' ? parsed.activeRun as GameplayRunMetrics : null,
          completedRuns: parsed.completedRuns.slice(0, MAX_COMPLETED_RUNS) as GameplayRunMetrics[]
        };
      }
    } catch {
      this.state = emptyStoredTelemetry();
    }
    return this.state;
  }

  private static persistSoon(): void {
    if (typeof window === 'undefined' || this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.persistNow();
    }, 1200);
  }

  private static persistNow(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.getState()));
    } catch {
      // Telemetry is non-critical and must never interrupt gameplay or saves.
    }
  }
}
