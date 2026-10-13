# SkyBreach difficulty, supplies and city grounding

October 11, 2026. Supersedes the fixed hardpoint health and perpetual SkyBreach resource refill described in earlier polish reports.

## Audit findings

- The dreadnought assigned a full same-mode Arena boss benchmark to **each** of seven weapons, plus twice that benchmark to its core: nine Arena bosses of total health, regardless of the entering operative's build.
- Ordinary round health and damage curves cap at 2.1× and 1.65× before mode multipliers. Permanent upgrades, multiplicative Mods, critical damage, cooling and Plasma Recalibration can continue increasing player output after those curves stop growing.
- The existing mode ladder remains authoritative: Normal's health/damage reductions, Overdrive's stronger campaign position, and Supreme's stage multipliers. Supreme already assumes substantial progression.
- Real Arena stat construction in the browser produced approximately 77 sustained weapon DPS for a starter, 357 with full upgrades alone, 775 with the tested rank-three standard loadout, and 3,989 with the tested Supreme loadout. The report includes equipped slots and recalibrations rather than estimating strength from rarity.

## Permanent loadout response

`CombatPower.ts` measures heat-limited weapon throughput, effective critical damage, weighted deployable output, maximum health, energy capacity and energy regeneration. It uses actual resolved upgrade/Mod stats, including recalibrations and existing engine limits. It does not change any Mod, upgrade or player stat.

Difficulty is captured at round/boss setup and carried into anomalies. Current health, current energy, temporary buffs, kills and time spent fighting cannot increase the captured difficulty. Defensive strength affects damage/pressure, not enemy health. Conditional Mod procs are deliberately omitted from the conservative output estimate.

| Mode | Offensive threshold, relative to starter | Maximum added enemy/boss HP | Maximum added damage | Maximum added spawn pressure |
| --- | ---: | ---: | ---: | ---: |
| Normal | 1.5× | 45% | 8% | 8% |
| Overdrive | 6× | 55% | 8% | 10% |
| Supreme | 18× | 30% | 8% | 6% |

The thresholds preserve beginner Normal and let upgrades matter in Overdrive. Supreme only responds above its substantially higher expected output. In the measured Supreme rank-three build, the added enemy HP is **12.2%** and spawn pressure **2.6%**. Caps are safeguards, not automatic increases. Arena spawn counts and weight limits use the same pressure adjustment as cadence; existing safe-spawn rules remain in force. Arena bosses and HEIST enemies receive the captured health/damage response once. Player-controlled boss frames keep their existing operative-based rules.

## Dreadnought

The entire ship receives one budget based on the nearest scheduled same-mode Arena boss and the captured build. Its baseline is 95% of that benchmark. Above the baseline's reference output (baseline HP / 50 seconds), health grows with output to the power of **0.65**, capped at six benchmarks. Strong builds still reduce kill time; low-output builds no longer inherit nine bosses' health.

Seven hardpoints share 70% of the total, with the remaining 30% in the shielded core. Integer rounding preserves the exact total. Destroying weapons still removes their attacks, and all seven must be disabled before the core takes damage.

Examples at local round 15, using Arena's actual stat builder:

| Mode / build | Previous total HP | New total HP | Weapon DPS | HP / weapon DPS |
| --- | ---: | ---: | ---: | ---: |
| Normal / starter | 75,240 | 7,942 | 77 | 103.4 s |
| Normal / full upgrades | 75,240 | 20,486 | 357 | 57.4 s |
| Normal / rank-three strong | 75,240 | 30,399 | 775 | 39.2 s |
| Overdrive / full upgrades | 201,600 | 28,925 | 357 | 81.0 s |
| Overdrive / rank-three strong | 201,600 | 42,921 | 775 | 55.4 s |
| Supreme / rank-three Supreme | 358,848 | 117,345 | 3,989 | 29.4 s |

These are damage-budget projections, not measured encounter durations. They exclude aiming/travel, energy shortages, misses, damage buffs, conditional procs and actual deployable damage. The assisted integration tests validate mechanics, not human difficulty or every possible build combination.

Attack combination interval falls from 5.2 to 3.8 seconds before mode pressure. Core volleys fall from 2.2 to 1.65 seconds. Heavy/kinetic burst intervals fall from 420/170 to 320/135 ms. Telegraphs, the two-family combination limit, projectile ceilings and destroyed-weapon cancellation remain intact. Overdrive/Supreme formation cadence now observes mode cadence; beginner Normal retains its previous formation timing.

## Supplies

The [October 13 flight-support update](skybreach-flight-support.md) supersedes the shared health cooldown and fixed health restore below with bounded, need-aware relief. It also adds mine-rack rockets, independent AA buildings, staged weapon destruction and six-lane highways.

- The first scheduled resource arrives after 8–13 active seconds. Subsequent scheduled drops use randomized intervals around 12–20 seconds, shortened by up to three seconds when resources are low.
- Health/energy preference is weighted toward need. Neither kind is guaranteed on every event.
- At most one health and one energy pickup can coexist. Enemy drops share that budget and an eight-second minimum resource-drop spacing.
- Collection does not trigger a refill. Recovery sectors can offer one supply when empty after a ten-second gap.
- Existing Arena restore amounts and Mod effects remain authoritative. Resources scroll away, expire, and stop spawning during return/destruction. Pauses do not advance their schedule.

## City and arena lasers

Buildings are approximately 45–49% taller, with larger foreground scale. Three bands move outward and reposition against the actual visible screen edges, including ultrawide margins. Full opaque facades end in foundation strips and contact shadows. Street and foundation motion are shared so buildings do not slide over the ground; depth ordering includes rooftop AA towers. Clouds retain separate motion. Gameplay camera rules, aircraft hitboxes and collision bounds remain unchanged.

Security laser patterns use the generated arena's inner perimeter instead of global world dimensions. Each beam is geometrically clipped, preserving its angle, with a 13-pixel margin for glow and relay rings. Rendering, hit tests and hazard hijacking share those clipped segments. Targets outside the perimeter cannot take laser damage. Interior obstacles retain their previous laser behavior.

## Verification

- Automated tests cover bounded and monotonic loadout response, stable snapshots, shared Arena/SkyBreach scaling, the ship budget, faster bounded attack scheduling, 100 seeded supply runs, pickup need weighting, pause behavior and all nine laser patterns.
- Browser fixtures exercise real Arena entry, shared resource collection, rapid kill drops, offscreen retirement, all-mode boss destruction/return, and city construction/cleanup at desktop and ultrawide sizes.
- `scripts/audit-loadout-difficulty.browser.js` reproduces the build matrix using Arena's real stat creation. `scripts/run-layout-audit.mjs` accepts an optional `WIDTHxHEIGHT` argument for a browser viewport held throughout the fixture.
- Final test/build counts and compact browser evidence are recorded in `skybreach-balance-validation.json`.
- Return validation now ignores the default visible flag on registered, never-started anomaly scenes. The all-mode rerun captures console errors and finishes with none. Existing immediate-return resource diagnostics still warn about transient Arena timers/tweens; the tested anomaly render objects, projectile references, player body and resize listeners clean up correctly.
