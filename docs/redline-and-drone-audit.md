# Redline, Flying Drones, exchange controls, and anomaly pricing

The four-part pass is complete. Redline now rewards movement and aggressive combat; Flying Drones join advanced Arena waves through the shared enemy system; exchange controls support hold repeat and cumulative shortcuts; and anomaly entry quotes use a shared **35–90 Flux Core** range.

The final production build and **670 tests passed**. Focused browser fixtures passed **302 assertions**. Separate normal and late-Supreme runs completed **24 ordinary rounds plus Centaurus**, passing **366 gameplay assertions, 24 finale assertions, 30 encounter retirements, and 25 disk-save comparisons**. Completion and Supreme highest round 148 survived an independent browser reload. These are assisted runtime checks, with controls and limits described below.

The work preserves the lifecycle, pools, layout caches, progression, and physical reward infrastructure documented in the [layout audit](layout-performance-audit.md) and [presentation audit](polish-and-transition-audit.md). The new measurements are sustained regression checks, not a matched before/after performance comparison.

## Redline behavior

The former hold-circle mechanic is removed. The existing activation flow, immediate `overloadEvent` audio, and 52-second event duration remain. Actual player displacement, dashes, kills, and kill chains build RPM; inactivity drains it, and damage causes a recoverable RPM/score loss. Running into a wall does not count as movement. Movement alone builds the initial zone; combat sustains the upper zones.

| State | RPM | Kill-score multiplier | Event pressure |
| --- | --- | --- | --- |
| Building | 0–39 | 1× | No additional drones |
| Boost | 40–69 | 1.5× | Occasional reinforcement |
| Redline | 70–89 | 2× | Faster reinforcement and priority targets |
| Critical Redline | 90–100 | 3× | Controlled pressure, more frequent targets |

Critical adds 1.5 energy per active second when the player's reservoir is below its existing maximum. This is an event-local addition, with no permanent stat mutation. The first Critical transition announces the benefit. Later target notices queue behind that announcement.

Regular kill chains last 3.2 seconds; a priority kill extends the window to 4.8 seconds. Priority drones use the same body, health, weapon, and movement components as ordinary drones, with brighter red art, target brackets, 20% faster movement, and an 11-second escape deadline. Killing one grants 20 RPM and a score bonus. Escape removes the enemy and marker without awarding a kill or loot.

Event ownership allows at most four temporary drones, including at most one priority target. Every spawn also checks the existing encounter count and weight budgets. A full encounter can therefore delay event reinforcements. Normal-mode Redline can use these event-owned drones; ordinary Normal waves cannot.

| Rank | Score requirement | Physical reward rolls | Amount scale |
| --- | --- | ---: | ---: |
| D | Below 1,200 | 1, Credits only | 0.65× |
| C | 1,200 | 2 | 1× |
| B | 3,500 | 2 | 1.15× |
| A | 7,500 | 3 | 1.3× |
| S | 12,000 and at least 4 seconds Critical | 4 | 1.5× |

Ranks above D use the existing weighted currency, Mod, and special-ammo reward infrastructure. Amount scaling applies where a reward has an amount; it does not multiply Mod rarity. Poor performance completes with a small reward. A high score without the Critical-time requirement remains A.

At the deadline, event drones and their pooled projectiles retire immediately. Ordinary encounter drones remain. The gauge falls, then shows rank, score, peak RPM, Redline/Critical time, longest chain, and targets destroyed. After the brief 3.3-second terminal presentation, the existing reward owner creates the physical drops. Death, round end, replacement, and scene shutdown use the same cleanup path.

The tachometer uses a private baked dial, a transformed needle, and text updates limited to ten per second. Thin edge lights pulse without covering hazards or projectiles. The final live and result screenshots were reviewed for placement and readability. See [RedlineEvent](../src/game/arcade/events/RedlineEvent.ts), [RedlineMomentum](../src/game/arcade/events/RedlineMomentum.ts), and [RedlineVisualController](../src/game/arcade/visuals/RedlineVisualController.ts).

## Shared Flying Drone family

[FlyingDrone](../src/game/enemies/drone/FlyingDrone.ts) extends the existing Enemy body and damage model. [DroneFlight](../src/game/enemies/drone/DroneFlight.ts) separates a replaceable movement strategy, mutable flight state, burst weapon, and variant configuration. Arena supplies spawn context, difficulty scaling, projectile-pool access, and the normal reward/death pipeline. A browser fixture instantiated the same drone in a second Phaser scene with an injected movement strategy and verified health and physics behavior. This supplies a reuse point for future Sky Breach movement; Sky Breach gameplay is not implemented here.

The strafe shooter maintains medium range with smooth acceleration, changing lateral offsets, and bounded flight. It bypasses ground pathfinding and wall/player physical colliders, never receives bombsite defusing assignments, and stays inside Arena bounds. It enters from the perimeter away from the player, fades in briefly, and waits before firing. Three-shot bursts commit their aim, use visible pooled projectiles, and emit at most one shot per update after a stall. Existing mode scaling controls health, damage, speed, and cadence.

Natural composition lives in the existing [balance spawn profile](../src/game/config/balance/index.ts). Normal has zero drone weight and zero natural slots at every round. Overdrive's simultaneous natural limit rises from one to two to three across rounds 1–10, 11–20, and 21 onward; its actual first deployment starts at round 5. Supreme's actual entry begins at round 51, where it allows four and uses a higher composition weight. The overall encounter count and weight ceilings are unchanged.

| Interaction | Result |
| --- | --- |
| Player bullets, scattershot, grenade direct/splash damage | Existing enemy hit and damage pipeline |
| Automated turret | Acquires drones and fires normal pooled shots |
| Ground mine trigger, mine damage, magnetic mine pull | Excludes airborne enemies |
| Electric fence field | Excludes airborne enemies |
| Floor laser | Passes below airborne enemies |
| Bomblet airstrike explosion | Damages drones |
| Ground wall, bombsite, player overlap | No ground collision or defusing assignment |
| Enemy projectile hitting the player | Existing damage rules; projectiles still respect walls |
| Ordinary drone death | Normal Credits, kill/progression counters, Mod eligibility, pickup chances, and pooled mechanical destruction |

Death resolves loot onto nearby valid ground, with a bounded search used only at death. This keeps physical pickups and Mod rewards collectible when the drone dies over a wall. Escaping event targets use removal rather than death and receive none of these rewards.

The shared quad-fan chassis has four cached mechanical poses. Standard, reinforcement, and priority variants use the same drawing routine with baked illumination colors; white armor stays readable instead of receiving a muddy whole-sprite tint. The priority brackets are one shared texture. There are no per-drone timers, tweens, or persistent debris.

## Exchange and anomaly transactions

`−STEP` and `+STEP` change exactly one valid source batch immediately. Holding repeats after 360 ms, then every 80 ms. Pointer release, leaving the button, blur, pause/sleep, control destruction, console close, and pair changes cancel the hold. Controller confirm uses the same opt-in behavior and stops on release or focus change. Repetition uses the existing update/repeater infrastructure rather than surviving timers.

The first x5/x10 shortcut replaces the untouched one-batch default. Subsequent shortcuts add batches: **1 → x10 → 10 → x10 → 20 → x5 → 25 → +STEP → 26 → −STEP → 25**. All amounts remain valid whole batches within affordability bounds. A wallet below one batch leaves the minimum quote visible with adjustment/confirmation disabled. Quote text updates in place, and the existing transaction lock and wallet validation remain authoritative. Directed rates and anti-arbitrage rules in `CurrencyExchange.ts` were not changed.

[AnomalyPricing](../src/game/anomalies/AnomalyPricing.ts) is the shared source of truth for whole entry fees, inclusive bounds, normalization, and randomized generation. All 56 integer costs from **35 through 90** are possible. Forced quotes normalize before publication; invalid direct transaction/session values are rejected. The fallback is 60.

The portal rolls once and uses that quote for its HUD, entry confirmation, affordability check, round/wallet deduction, runtime HEIST session, and telemetry. Reopening/regenerating obtains another valid quote. HEIST validates incoming session fees and uses the shared fallback/normalization in its reward service. Future anomaly types can import the same rules. No balance migration, historical telemetry rewrite, or unrelated exchange-rate change was introduced.

## Focused browser and automated validation

| Fixture | Passed assertions | Coverage |
| --- | ---: | --- |
| Anomaly pricing | 118 | Ten portal activations, endpoints, invalid/forced/random costs, displayed and deducted parity, insufficient funds, repeated entry protection, telemetry/session parity |
| Exchange input | 23 | Single steps, cumulative shortcuts, pointer/controller hold and cancellation, repeated opens, pair changes, affordability, actual quoted transaction |
| Drone interactions and full Redline | 75 | Natural composition, real wave cap enforcement, defenses/hazards/damage/drops, targets, event ownership, full timer and shutdown |
| Drone art, reuse, and lifetime | 57 | Shared poses, another scene/movement strategy, 18 explicit-destroy/shutdown cycles |
| Actual progression checkpoints | 29 | Normal 5, Overdrive 5 and 25, Pegasus 50, Supreme Leo 51, and Normal's Redline exception |

The exchange raw report also contains one screenshot entry; it is not counted as an assertion. The lifetime fixture verified that **18 private gauge WebGL textures** became invalid after retirement, with no remaining Text canvas owners, scene roots, target markers, or drone physics bodies. Shared drone atlases remain game-owned for reuse.

The full interaction fixture selected 2,000 enemy types per matrix case and exercised the real wave spawner under controlled randomness. Its original matrix includes synthetic Overdrive/Supreme round-1 boundary cases. The separate real-checkpoint fixture validates actual entry rounds and measured natural limits of 0/1/3/3/4 respectively. Each real checkpoint supplied eight seconds of mixed-wave flight at approximately 16.67 ms mean raw frame intervals, with p95 values of 16.8–16.9 ms. Its Normal event check clears the preceding saturated test wave to provide room for event reinforcements.

A fresh Overdrive round-30 encounter ran Redline's full timer and terminal presentation continuously. Assisted kills every 1.4 seconds, circular gamepad movement, invulnerability, and restored energy maintained pressure. The result was **27,742 points, S rank, 100 peak RPM, 42.4 seconds Critical, and a longest chain of 37**. Priority kills were tested separately. First, middle, and final frame windows remained approximately 16.7 ms, with p95 at 16.8–16.9 ms and a maximum of 24 ms. That recorded fixture included one partial initial interval in each sample, slightly biasing means downward; the later checkpoint sampler skips the first STEP. These values are not evidence of a performance gain.

Unit coverage includes 10,001 pricing samples, inclusive endpoints, invalid inputs, all directed exchange pairs, score/chain/reward behavior, natural composition across rounds 1–148, 32 long deterministic steering simulations, and burst spacing after stalled frames. The entire repository suite passed, not just the new tests.

## Sustained progression and ending

Both fixtures use seed 550055, five rank-three Mods, ordinary pressure limits, armed bombs, multiple defenses, special ammo, overlapping hazards, supplied placement energy, invulnerability, assisted defuser kills, and accelerated event/boss outcomes. The optional `includeDrones` control primes advanced encounters with the natural drone allowance within the existing count/weight budget; it does not grant Normal natural drones. Boss encounters continue through their existing ownership and enemy retirement.

| Run | Duration | Gameplay checks | Retirements | Disk-save comparisons |
| --- | ---: | ---: | ---: | ---: |
| Normal rounds 1–12 | 223.1 s | 172 | 14 | 12 |
| Supreme rounds 137–148 plus Centaurus | 483.3 s | 194 | 16 | 13 |

Each run covered all six Arcade types, two HEIST returns, three Pause/Options/Store cycles, two ordinary bosses, physical rewards, and four Mod reveals. Normal events were approximately two-second regression samples; late events each supplied approximately eight seconds. The separate full Redline fixture establishes full-duration event coverage.

The late test profile starts with the regular Overdrive prerequisite and Supreme highest round 136, then actually completes 137–148 before launching the finale. Three bosses remained alive and active throughout the 60-second sample, with player fire withheld. Completion stayed false after the first two deaths and persisted after the third, through authored credits, terminal debrief, the actual Garage return, and an independent reload.

| Sustained ending sample | Raw mean interval | Raw p95 interval |
| --- | ---: | ---: |
| Centaurus ordinary, 40 seconds | 16.694 ms | 16.8 ms |
| Three bosses, first 20 seconds | 16.666 ms | 16.8 ms |
| Three bosses, second 20 seconds | 16.666 ms | 16.8 ms |
| Three bosses, third 20 seconds | 16.680 ms | 16.8 ms |
| Two bosses remaining, 20 seconds | 16.680 ms | 16.8 ms |
| One boss remaining, 20 seconds | 16.666 ms | 16.8 ms |

Continuous late Defense/Defusing means were **16.712/16.802 ms**, with histogram p95 of **17/18 ms**. Boss combat averaged **16.671 ms** with p95 **17 ms**. All six late Arcade phases averaged **16.649–16.766 ms** with p95 **17–18 ms**. Normal Defense/Defusing means were **16.678/16.666 ms**. Histogram percentiles round upward to whole milliseconds. All sustained gameplay analyzer budgets passed: 20 ms raw mean and 34 ms raw p95 for eligible phases with at least 120 frames.

Smoothed Phaser encounter means are recorded separately: Normal's first/last four encounters averaged 16.821/16.841 ms; late Supreme averaged 16.943/16.884 ms. These are not raw frame percentiles. All 25 quiescent checkpoints had zero Arena/HEIST Text canvas owners and stable resize/game/window/document listener counts of 21/21/19/14. The continuous frame recorder accounts for the extra game listener and removes it on completion.

Setup hitches remain. Late-run maxima included **170.7 ms Loading → Arena**, **154.8 ms boss introduction**, and **220.7 ms HEIST entry**. Defense's longest ordinary interval was **44.8 ms**, despite its 17 ms p95. These observations do not establish hitch-free transitions, performance on integrated graphics, every seed/loadout, or a new consecutive round-68-to-148 campaign soak. The prior investigations retain that historical coverage. Human difficulty/reward tuning, physical controller hardware, and audible browser output still require playtesting; programmatic audio activation and controller input paths were checked here.

## Evidence and reproduction

[Compact measurements](redline-validation-measurements.json) retain fixture options, assertion results, phase distributions, ending samples, reload verification, and raw-evidence hashes. Raw JSON and screenshots under `artifacts/` are local ignored evidence. Measurements used an isolated Edge 153 WebGL browser at **1552 × 903, DPR 1**, reporting **NVIDIA GeForce RTX 5070 through ANGLE/Direct3D11**. CPU throttling was disabled.

Use an isolated DEV browser/test profile, Vite on port 5173, and remote debugging on 9225. Run fixtures sequentially. Do not edit watched source or scripts during a browser measurement: Vite reloads invalidate the run. Initial fixture setup failures involving a saturated spawn budget, browser readiness, a test defense blocking a test shot, an armed test bomb, and a live-edit reload were excluded. Only the completed final reports above contribute validation counts or performance claims.

```powershell
npm.cmd run build
npm.cmd test
node scripts/run-layout-audit.mjs artifacts/anomaly-pricing-browser.json ./audit-anomaly-pricing.browser.js
node scripts/run-layout-audit.mjs artifacts/redline-exchange-input.json ./audit-exchange-input.browser.js
node scripts/run-layout-audit.mjs artifacts/drone-art-lifetime-final.json ./audit-drone-art-lifetime.browser.js
node scripts/run-layout-audit.mjs artifacts/redline-drone-final.json ./audit-redline-drone.browser.js
```

The current full drone fixture defaults to the real advanced checkpoint matrix; the recorded original synthetic matrix is preserved in the compact evidence. The focused checkpoint command is:

```powershell
$env:N3ON_LAYOUT_OPTIONS = '{"matrixOnly":true,"sampleMs":8000,"matrix":[["normal",5],["overdrive",5],["overdrive",25],["overdrive-pegasus",50],["supreme-leo",51]]}'
node scripts/run-layout-audit.mjs artifacts/drone-real-checkpoints.json ./audit-redline-drone.browser.js
Remove-Item Env:N3ON_LAYOUT_OPTIONS
```

Repeat the campaign runs using their exact recorded options. Replace `normal` with `late` in both selector and paths for the ending:

```powershell
$fixture = (Get-Content docs/redline-validation-measurements.json -Raw | ConvertFrom-Json).normal
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/redline-mixed-normal.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/redline-mixed-normal.json --progression
```

Immediately after the late run, before creating another test profile, run `node scripts/verify-polish-save.mjs artifacts/redline-save-reload.json`. This existing verifier also toggles camera shake through Options and verifies its persistence. The final production [build output](../artifacts/redline-build.txt), [670-test output](../artifacts/redline-tests-final.txt), [normal analysis](../artifacts/redline-mixed-normal.summary.json), and [late analysis](../artifacts/redline-mixed-late.summary.json) are retained locally. With the corresponding raw reports, logs, and browser environment record available, `node scripts/summarize-redline-validation.mjs` rebuilds the compact measurements.
