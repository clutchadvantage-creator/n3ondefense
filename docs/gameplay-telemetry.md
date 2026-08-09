# N3ONDefense gameplay telemetry

N3ONDefense records compact, local gameplay metrics for balance analysis. It does not send this data to a server and does not store online credentials, player names, or profile identifiers.

## Exporting play data

Use **Export Gameplay Metrics** on either the Round Finished or Mission Result screen. The browser downloads a file named similar to:

```text
n3ondefense-gameplay-metrics-2026-08-08T12-30-00-000Z.json
```

The export contains the active run, when present, and the five most recent completed runs. Full aggregate counts are retained. Only the optional per-enemy kill examples are capped at 60 samples per encounter to keep browser storage bounded.

## Recorded metrics

- Run seed, protocol, Contract, Mod focus, equipped Mods, and purchased upgrade levels
- Round, arena seed, layout archetype, active play duration, and outcome
- Enemy spawns, kills, peak active count, health, active-play TTK, TTK buckets, kill source, and damage source
- Kill Credits and Core Tokens
- Pickup type, source, collection, and expiration counts
- Mod drops, rarity, source, and duplicate state
- Shots, potential weapon output, energy spent, and ability use
- Player damage and hit count by source
- Boss archetype, maximum health, active-play TTK, damage by source, Credit drops, and final rewards

Pause time is excluded from active duration and enemy TTK.

## Reading a report

Place the exported JSON anywhere accessible from the terminal and run:

```bash
npm run telemetry:report -- path/to/n3ondefense-gameplay-metrics.json
```

The report prints enemy throughput and TTK, damage and kill sources, pickup behavior, boss outcomes, player output, ability usage, and initial tuning warnings.
