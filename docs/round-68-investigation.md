# Round 68 investigation

Broader follow-up: [Layout costs across the game](layout-performance-audit.md), covering all Arena visual families, HEIST views, major menus, and the remaining repeated decoration work.

Follow-up completed: [Rounds 68 through 148 and the Centaurus ending](endgame-validation.md). That extended validation also found and fixed HEIST decal Text objects escaping scene shutdown. The measurements below document the original wall-rendering investigation.

The reproduced slowdown came from static wall artwork being triangulated and submitted again every frame. The correction caches that artwork once per encounter using the renderer's existing RenderTexture ownership pattern. No enemy budgets, difficulty, effects, art commands, rewards, or save formats were reduced or changed.

The user's exact seed and loadout were unavailable. These findings reproduce the same 67-to-68 symptom in a consecutive Supreme Gemini run with base seed **550055**; they establish the cause in that reproduction, rather than claiming to identify an unseen original session with certainty.

## 1. Root cause and comparison

Round 67 generated `split`, seed 797032688, with 16 walls. Round 68 generated `chambers`, seed 1102662311, with 40 walls. `ArenaVisualRenderer.drawWalls()` left detailed static Graphics live: bevels, rounded paths, panels, bolts, shadows, and vents replayed on every rendered frame. The backdrop already used a cache, but wall artwork did not.

This was one growing wall Graphics command buffer, so the root GameObject count alone understated its rendering cost.

Ten-second browser CPU profiles of both rounds identified `GraphicsWebGLRenderer`, Earcut triangulation (`isEarHashed`, `indexCurve`, `earcut`, `earcutLinked`), and path batching as dominant work. Round 68 renderer CPU fell from **27.29 to 10.00 ms per render** in the initial window and **28.68 to 10.51 ms** in the sustained window after caching walls. Scene-update CPU remained below 1 ms in both versions. The 68 snapshot had fewer dynamic bodies than 67, despite worse frame time. This is CPU work in the rendering path; it is not a direct GPU-timer measurement.

The same symptom occurred on other dense layouts: round 59 took 39.33 ms per frame, recovered to 17.08 at 60, then round 65 took 44.80 and recovered to 18.06 at 66. Round 69 also recovered before the fix. That pattern and clean retirement checks distinguish layout cost from monotonic accumulation.

| Consecutive Supreme comparison | Before mean frame | After mean frame |
| --- | ---: | ---: |
| 59 | 39.334 ms | 16.792 ms |
| 60 | 17.077 ms | 16.876 ms |
| 65 | 44.803 ms | 16.821 ms |
| 66 | 18.065 ms | 16.779 ms |
| 67, first 20 seconds | 17.288 ms | 16.865 ms |
| 67, next 20 seconds | 17.327 ms | 16.736 ms |
| 68, first 20 seconds | 29.289 ms | 16.863 ms |
| 68, next 20 seconds | 30.685 ms | 16.694 ms |
| 69, next 20 seconds | 17.067 ms | 16.679 ms |
| 70 | 19.288 ms | 16.794 ms |

Round 68's combined p95 frame interval improved from **35.00 to 16.68 ms**. Its first/sustained Scene.update CPU changed from **0.959/0.922 to 0.747/0.762 ms**. The after-run's 16 ordinary encounter means were all **16.67–16.99 ms**.

## 2. Checkpoint and save behavior

Supreme Cassiopeia unlocks when the saved Supreme highest completed round reaches **68**. This check occurs after completing 68, not when entering it. There is no unique 67-to-68 initialization save path. Normal checkpoints unlock at five-round intervals; Overdrive constellation starts use their existing progression thresholds.

The baseline recorded these actual synchronous costs:

| Phase | Profile saves | Save CPU, total / maximum call | Other work |
| --- | ---: | ---: | --- |
| 67 completion | 5 | 10.8 / 2.5 ms | JSON serialization 1.2 ms total; storage writes 1.1 ms total |
| 68 initialization | 0 | 0 | Round creation 182.6 ms inside Loading |
| 68 first 20 seconds | 0 | 0 | No storage writes |
| 68 sustained window | 0 | 0 | One telemetry storage write, 0.9 ms; serialization 1.2 ms |
| 68 completion | 4 | 8.3 / 2.7 ms | JSON serialization 1.3 ms total; storage writes 0.7 ms total |

Afterward, round creation measured 157.3 ms in the 68 Loading phase. Completion saves remained similar: 9.6 ms total after 67 and 8.0 ms after 68. Nested save/import/write/JSON timings overlap and must not be summed into independent frame costs.

`PlayerProfileStore.save()` uses `LocalSaveManager.importProfile()`, which normalizes/migrates, preserves a backup, writes, verifies by reading back, and refreshes the index. Multiple reward/progression writes exist at completion, but the measured individual calls did not explain a sustained 30 ms frame interval. Save correctness and scheduling were therefore preserved. Telemetry retains its existing bounded run history and idle/boundary persistence. This isolated offline fixture did not make authenticated backend save requests; it cannot validate live-service latency.

## 3. Resource audit

At the first-window endpoints, baseline 67/68 had respectively **1,299/1,329 DisplayList roots, 28/20 dynamic bodies, 39/37 colliders, 0/0 timers, 6/20 tweens, and 31/4 active trails**. There were four hazard controllers and one HUD in each. Static bodies rose with the actual wall layout, **16 to 40**. Projectile/FX/trail capacities were identical across these two rounds: **720/248/972**. No boss controller or premium reveal remained in ordinary gameplay. Scene/game listener counts were **61/22** in each sample. Heap dropped from approximately 247 MB to 151 MB across these endpoints rather than growing through the slowdown.

Recursive scene snapshots also record nested GameObject types (including Text, Graphics, Containers, and emitters), UpdateLists, pending physics removals, delayed insertion queues, camera counts, input listeners, retained arrays/Maps/Sets, DOM nodes, texture counts, sound instances, and generation ownership. Runtime diagnostics cover hazard slots, bomb-related scene collections, smashables, pickups, deployables, projectile/FX/trail reserves, destruction fragments, infusion effects, queued boss work, audio voices/loops, and HUD ownership. `ModRuntime` owns maps/sets of gameplay values, rather than registering a separate emitter listener per card.

Both complete comparison runs passed 20 internal generation-boundary audits and 16 stopped-scene checkpoints. Internal retirement left one player body and the intended warm reserves; all active projectiles, trails, FX, enemies, boss/event/anomaly controllers, hazards, smashables, deployables, pickups, round audio, HUDs, timers, colliders, and stale owners returned to zero. At the subsequent stopped-scene checkpoint, display/update entries, physics bodies, colliders, delayed callbacks, tweens, and input listeners were zero. Global baselines were constant: **21 resize, 19 game, 18 window, 14 document listeners**. Heap snapshots and CPU GC samples show normal collection, not a retained-generation finding; they are not a complete heap dominator proof.

## 4. Correction and regression detection

Wall art now draws once into one encounter-owned 2400×1600 RenderTexture at the original depth. The temporary Graphics is destroyed immediately. Animated wall nodes and the existing ambient pulse continue separately. `ArenaVisualRenderer.destroy()` retires the new texture through the same owner as its other cached layers. This applies to generated Arena layouts in every mode and boss setup, rather than checking for round 68.

Development diagnostics expose cached wall count and zero live wall Graphics, with an assertion that the temporary source is gone. `ArenaLifecycleProfiler` now records throughout an encounter into its existing fixed 600-frame ring. Previously it stopped after frame 600 and could hide later degradation; allocation deltas now also cover the whole generation. Resume sampling remains bounded at 180 frames.

The progression analyzer checks consecutive rounds, retirement, listener stability, exact physical loot, and sustained 68 against the warm 60–67 median. That final check detects the original baseline slowdown and passes the corrected run. The baseline still passes its lifecycle checks.

## 5. HEIST camera

The removed `HeistCameraPresentation` selected zoom 1.18 or 1.08 from room/vault openness, interpolated zoom every update, and added movement/facing look-ahead. Arena used native follow at zoom 0.9. `GameplayCamera.ts` now supplies the same 0.9 zoom and 0.08 follow interpolation to both scene setups. HEIST no longer updates zoom or manually replaces the follow transform while traversing rooms. Scene bounds, impact shake, and other camera effects retain their existing owners; Arena anomaly-return restoration remains intact.

## 6. HEIST grenade capability

Arena already checked smashable direct contact with seven pixels of forgiveness, but its armed proximity branch queried enemies, bosses, and Flux Cores. HEIST queried only enemies, and its grenade explosion damaged a loot container only at exact center-point contact; containers were absent from splash damage.

`SmashableCombatQuery` provides explicit direct-contact and radius queries. Arena props and HEIST's environment props implement it; HEIST's unopened, lootable containers expose the same capability. Both scenes call the shared grenade helper after retaining their existing enemy target priorities, arming delay, and check cadence. Walls never implement the capability. Props use the existing 32-pixel blast reach so a fuse cannot trigger where its splash cannot land; the enemy fuse radius remains unchanged.

HEIST explosion splash now visits eligible nearby containers through `damageContainer()`, preserving cracks, audio, destruction, physical loot rolls, collection, and extraction. Exact direct hits keep full damage and are excluded from the additional splash pass. The existing splash multiplier, projectile speed, lifetime, bounce behavior, and enemy damage rules are unchanged.

## 7. Sustained validation

The comparison comprises two uninterrupted **55–70** Supreme Gemini runs, each about **9.3 minutes**, with 20-second ordinary combat samples and an additional 20 seconds in 67–69. Each includes four bosses, eight Arcade events, four HEIST entries/returns, physical loot collection, premium reveals, and repeated Options/resize returns. No reload or forced GC occurs within a run. WebGL was active in isolated headless Edge. Initial enemies use existing count/weight budgets and ordinary spawning continues. Outcomes are accelerated using DEV controls after each sample; this is not an hours-long manual-play claim. Comparison loadouts have no equipped Mods so the separate extended fixture can measure richer gameplay independently.

The separate extended Normal run completed **21–26** in **162.307 seconds**, including the 25 checkpoint and boss. All **58 gameplay checks** passed, as did six disk progression/wallet/card comparisons and seven generation retirements. Mean frame intervals ranged **16.96–18.62 ms** with Scene.update CPU **0.88–1.17 ms**.

Extended Overdrive Andromeda completed **44–49** in **159.767 seconds**, including the boss at 45 and the Perseus checkpoint unlock at 48. All **59 gameplay checks**, six disk comparisons, and seven generation retirements passed. Mean frame intervals ranged **17.88–19.64 ms**, with Scene.update CPU **0.96–1.25 ms**. Neither checkpoint produced a lasting increase.

Both extended runs used five rank-three Mods, armed bombs, fence/turret/mine placement, forced overlapping gas/bomblet phases and ignition, 18 initial pickups per encounter, alternating grenade/scattershot ammo, smashable destruction, and two pause/Options/store excursions. They use a fresh isolated profile with tutorials acknowledged. An automated defender applies normal enemy damage to assigned defusers after one second of defuse progress so unattended objectives cannot end the fixture; enemy pressure limits and spawn scheduling are unchanged. Player invulnerability and replenished placement energy are also fixture controls. Their heavier workload is not a matched FPS comparison with the unmodified baseline. The extra benchmark defender adds one constant game listener during these runs, removed afterward.

The equipped-Mod Supreme Gemini run completed **55–70**, with **249 gameplay checks**, **16 disk-save comparisons**, **20 generation retirements**, four bosses, eight Arcade events, six pause/Options/store excursions, and three successful HEIST visits/returns. The fixture equips Split Current, Jailbroke Turrets, Emergency Shield, Eventide Arsenal, and Singularity Chamber at rank three. Its fresh Supreme progression retains the prerequisite regular Overdrive completion. Disk checks confirmed Cassiopeia locked after 67 and unlocked after 68.

| Extended Supreme window | First 20 seconds | Next 20 seconds |
| --- | ---: | ---: |
| 67 | 23.362 ms | 16.920 ms |
| 68 | 17.768 ms | 16.666 ms |
| 69 | 18.705 ms | 16.790 ms |

The run's encounter means ranged **17.20–21.27 ms**, with Scene.update CPU **0.99–1.36 ms**; round 70 averaged **20.29 ms**. The deliberately overlapping initial hazard/deployable/bomb workload can exceed a 16.7 ms budget. There was no lasting increase at 68. These extended results are a broader workload check, not an assertion that every possible effect combination now sustains 60 FPS.

The first HEIST visit physically walked all **109 connected facility nodes**, without teleporting between traversal waypoints. All **6,508 zoom observations** were exactly **0.9**. At the physical-loot checkpoint, its profiler had sampled 20,662 frames: the latest 600-frame window averaged **16.667 ms**, total average scene-update work was **0.536 ms**, render CPU **10.454 ms**, and the physics update envelope **0.186 ms**. Subsequent visits repeated grenade, collection, Options, extraction, and return checks. Across three visits, **21 containers** passed real projectile proximity tests outside direct-contact range, after the normal 150 ms arming interval. Each received the expected **13.72 splash damage**; separate one-damage direct shots applied exactly one damage. Normal destruction handlers then released the remaining loot, and collected totals matched the expected rolls. The fixture uses slow-moving shots to isolate the fuse from direct impact and DEV controls to accelerate destruction, ambush completion, and extraction outcomes.

One **harness interruption is retained in the evidence**: at round 69, a naturally scheduled Arcade event was active (`arcadeControllers = 2`), so the game's existing eligibility gate rejected the attempted fourth HEIST entry. The fixture originally treated that legitimate refusal as an error. It now resolves an active event before requesting HEIST. The same live Arena generation was resumed without a page reload or replaying earlier rounds; the expired fourth attempt was skipped, 69 completed, and the run continued through 70. Its total **1,109.945 seconds** includes that diagnostic interruption and the full facility walk. The three completed HEIST returns were followed by further Arena rounds. The unchanged comparison run separately completed four HEIST returns and 55–70 without an interruption.

All completed runs passed retirement and listener checks. The extended fixture's constant extra game listener disappeared at final teardown: the browser returned to **19 game listeners**, with only Round Finished active.

## 8. Evidence and reproduction

[Machine-readable measurements](round-68-measurements.json) contain per-round frame/update measurements, boundary save/render costs, resource snapshots, and CPU-profile summaries. Raw browser reports and CPU profiles are in the ignored local `artifacts` directory.

Final validation: **`npm.cmd run build` passed; all 654 tests passed**. Tests cover shared prop geometry/fuse reach, camera setup parity, and detection of late-frame slowdown with bounded profiler storage, alongside the existing suite. [Build log](../artifacts/progression-build.txt), [test log](../artifacts/progression-tests.txt), [Arena capture](../artifacts/arena-walls-after.png), and [HEIST capture](../artifacts/heist-camera-after.png) are saved locally. The two captures were visually inspected; they retain the authored wall detail and the configured HUD.

Use an isolated test browser profile: the fixture awards rewards, creates test profiles, and changes settings. With the DEV server and an Edge/Chromium debugging target on port 9225:

```powershell
$env:N3ON_SOAK_ROUNDS='16'
$env:N3ON_SOAK_OPTIONS='{"startRound":55,"protocol":"supreme-gemini","sampleMs":20000,"sustainedMs":20000,"heists":true}'
node scripts/run-mixed-session.mjs artifacts/progression-after.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/progression-after.json --progression
```

Set `enhanced:true` for the separate five-Mod/deployable/hazard/menu/HEIST fixture. CPU capture can run alongside the comparison using `node scripts/capture-progression-cpu.mjs 68 artifacts/round-68-after-cpu.json`. The initial before/after `physics.step` metric covers only Arcade catch-up steps; the extended probe additionally wraps `World.update` to include the inline first step. Scene.update, physics, renderer CPU, and full frame intervals are distinct measurements.

The extended mode parameters were Normal `startRound:21, rounds:6, heists:false`; Overdrive `startRound:44, rounds:6, protocol:"overdrive-andromeda", heists:false`; and Supreme `startRound:55, rounds:16, protocol:"supreme-gemini", heists:true`. All used `sampleMs:20000`; Supreme also used `sustainedMs:20000`. `resumeExisting:true` continues a live interrupted fixture and retains the interruption record and prior measurements. `scripts/summarize-progression-investigation.mjs before after normal overdrive supreme` rebuilds the checked-in measurement document after running the analyzers.

Frame tables use Phaser's step delta, with its existing smoothing enabled; p95 values are smoothed intervals, not raw browser hitch percentiles. Browser long-task records and CPU profiles provide separate evidence about synchronous stalls. No timing/smoothing setting was changed for the comparison.

## 9. Remaining measured limits

The cache adds about **14.65 MiB** of RGBA texture storage while its encounter is alive, excluding driver overhead. It retires at the same boundary as other Arena visuals. Remaining live Graphics and dynamic effects still consume roughly 10–11 ms of render CPU in the corrected 68 sample. Loading retains approximately 0.16 seconds of synchronous round setup on this machine. Save migration/verification and telemetry serialization are still synchronous and could become material with much larger collections or slower storage; the measured 68 checkpoint is not evidence of that ceiling being reached.

The 16.7 ms result is limited by this test display/browser cadence and is not a guarantee for every GPU, seed, loadout, or live backend. The full exact user session remains unavailable. The existing successful lifecycle architecture and pool budgets were preserved.
