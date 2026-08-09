# N3ONDefense gameplay telemetry

N3ONDefense records compact, local gameplay metrics for balance analysis. It does not send this data to a server and does not store online credentials, player names, or profile identifiers.

## Exporting play data

Use **Export Gameplay Metrics** on either the Round Finished or Mission Result screen. The browser downloads a file named similar to:

```text
n3ondefense-gameplay-metrics-2026-08-08T12-30-00-000Z.json
```

The export contains the active run, when present, and the five most recent completed runs. Full aggregate counts are retained. Only the optional per-enemy kill examples are capped at 60 samples per encounter to keep browser storage bounded. New exports include `metricsRevision: 2`; revision 1 files remain readable by the report tool, but naturally show no data for fields that were not recorded at the time.

## Recorded metrics

- Run seed, protocol, Contract, Mod focus, equipped Mods, and purchased upgrade levels
- Round, arena seed, layout archetype, active play duration, and outcome
- Enemy spawns, kills, peak active count, weighted active pressure, health, full lifetime, travel-to-first-hit, engaged-combat TTK, TTK buckets, kill source, damage source, and overkill
- Kill Credits and Core Tokens
- Pickup type, source, collection, expiration, end-of-encounter leftovers, actual restoration, and wasted restoration
- Mod drops, rarity, source, and duplicate state
- Weapon, turret, enemy, and boss projectile fire, hits, misses, criticals, damage, overkill, wall collisions, expiration, and fence splitting
- Energy capacity, starting/ending energy, regeneration requested/applied/wasted, time empty/low, action denials, and energy shortfall
- Ability use and denial reasons such as cooldown, insufficient energy, placement limit, invalid placement, or already active
- Per-turret configuration, lifetime, shots, hits, damage, incoming damage, destruction, and end-of-encounter survival
- Spawn attempts delayed by enemy-count, weighted-pressure, or composition safeguards, plus accumulated blocked time and pressure
- Bomb sites armed/destroyed, maximum concurrent armed sites, defuse attempts/interruption/progress, and shield-blocked defuse time
- Temporary buff uptime
- Player damage and hit count by source
- Boss archetype, maximum health, active-play TTK, damage by source, Credit drops, attack casts, projectile counts, player intersections, blocked hits, direct damage, and final rewards

Pause time is excluded from active duration and enemy TTK.

## Reading a report

Place the exported JSON anywhere accessible from the terminal and run:

```bash
npm run telemetry:report -- path/to/n3ondefense-gameplay-metrics.json
```

The report prints enemy throughput and separated lifetime/combat TTK, damage and kill sources, resource pressure, projectile efficiency, turret performance, spawn pressure, objective pressure, pickup restoration, buff uptime, boss attack effectiveness, and initial tuning warnings.

Projectile hit/fire ratios are diagnostic rather than strict accuracy percentages: fence-generated child projectiles can allow player hits to exceed original trigger pulls.
