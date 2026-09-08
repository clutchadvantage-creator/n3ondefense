# Endgame validation

This follows the [round 68 investigation](round-68-investigation.md). Validation covered **every Supreme round from 68 through 148**, then the **Centaurus level 100 ending**, across the recorded segments described below. The sampled combat showed no progressive, sustained frame-time cliff. The extended audit found and fixed an additional HEIST Text resource leak. The corrected segment and finale passed the analyzer, and campaign completion survived a browser reload.

## What counts as the ending

The configured Supreme progression has two distinct numbers: the highest completed round that unlocks a protocol, and that protocol's starting level. Remaining in Gemini past round 100 continues the endless run. The official ending is **Centaurus level 100**, unlocked by completing **Supreme round 148**.

| Protocol | Unlock after Supreme round | Starting level |
| --- | ---: | ---: |
| Cassiopeia | 68 | 60 |
| Aquila | 78 | 65 |
| Ursa Major | 88 | 70 |
| Scorpius | 98 | 75 |
| Taurus | 108 | 80 |
| Virgo | 118 | 85 |
| Capricornus | 128 | 90 |
| Delphinus | 138 | 95 |
| Centaurus | 148 | 100 |

These values come from `src/game/progression/SupremeProgression.ts`; no progression requirements were changed.

## Validation procedure

An isolated headless Edge browser ran WebGL with seed 550055. A fresh test profile started with the prerequisite regular Overdrive clear and Supreme highest round 67. The first recorded segment completed **68 through 101** consecutively in Supreme Gemini. Editing an imported benchmark script caused a Vite reload during round 102. The completed checkpoints were preserved, and the corrected-code segment completed **102 through 148**, using that same profile's actual saved highest round 101. This is a segmented test; the complete 68-to-ending path was not tested uninterrupted on the final code.

Each ordinary round has 20 seconds of active combat. Milestones 68, 78, 88, 98, 108, 118, 128, 138, and 148 have another 20-second sustained window; the corrected segment also establishes a fresh sustained reference at 102. Ordinary bosses run for ten seconds before their outcome is accelerated.

The five rank-three Mods, armed bomb, normal fence/turret/mine placement, grenade/scattershot ammo, pickups, smashable destruction, and overlapping gas/bomblet/ignition exercise match the preceding enhanced fixture. Normal enemy pressure limits and spawn scheduling remain unchanged. Player invulnerability, replenished placement energy, damage to assigned defusers, and accelerated outcomes are benchmark controls. This measures actual live gameplay work and lifecycle transitions; it is not a manual, unassisted campaign clear.

Every completed round checks in-memory progression against the physical save, wallet/card consistency, and encounter retirement. Each applicable protocol unlock is checked immediately before and after its threshold. HEIST returns occur periodically, with container grenade/reward and Options checks. The full facility traversal was already measured in the earlier report and is not repeated in this run. Pause, Options, and Store returns also occur periodically.

After round 148, the same earned profile launched Centaurus through Loading and its normal deploy action. Its ordinary encounter ran for 40 seconds at the maximum protocol pressure. The three actual boss encounters then ran simultaneously for 60 seconds, followed by 20-second windows with two and one bosses remaining. Boss attacks, physics, and player movement remained active; the fixture withheld player fire during the boss windows to keep them alive. Fatal damage used each boss's normal damage/death callbacks. Completion remained false after the first two deaths, persisted after the third, survived the authored 18-second credits, and remained set after the terminal debrief's actual Garage action. The saved highest round remained 148. A subsequent browser reload independently verified both saved values.

The analyzer compares each late milestone's sustained frame mean against its segment's initial sustained reference with a 30% plus 2 ms allowance, checks early/late update costs, and verifies retirement, listeners, all gameplay assertions, and the ending. Phaser frame deltas retain their existing smoothing; they are not raw hitch percentiles. The finale additionally records unsmoothed step intervals. CPU render timings are not GPU timers.

## Completed measurements

The 34-round segment covered about 18 minutes between its first active checkpoint and final quiescent checkpoint. The corrected 47-round segment completed uninterrupted in **25.1 minutes** before launching Centaurus. The finale adds 140 seconds of measured combat and the normal credits. Its handoff also contained an overnight wait at a premium Mod prompt, described below; the final report's approximately 6-hour-40-minute wall-clock duration includes that wait and is not continuous gameplay time.

| Supreme round | First 20-second mean frame | Next 20-second mean frame | Code segment |
| --- | ---: | ---: | --- |
| 68 | 20.376 ms | 16.877 ms | Before HEIST Text fix |
| 78 | 18.993 ms | 16.729 ms | Before HEIST Text fix |
| 88 | 20.071 ms | 16.694 ms | Before HEIST Text fix |
| 98 | 20.755 ms | 16.819 ms | Before HEIST Text fix |
| 102 | 19.676 ms | 17.167 ms | Corrected reference |
| 108 | 21.803 ms | 16.735 ms | Corrected |
| 118 | 20.453 ms | 16.666 ms | Corrected |
| 128 | 18.772 ms | 16.722 ms | Corrected |
| 138 | 18.552 ms | 16.736 ms | Corrected |
| 148 | 18.775 ms | 16.666 ms | Corrected |

Both segments include the earlier wall-rendering correction. With the enhanced combat overlap, the corrected ordinary encounter means ranged from **17.599 to 21.250 ms**, with Scene.update means of **0.936 to 1.226 ms**. The first 16 encounters averaged 19.194 ms per frame and 1.124 ms per update; the last 16 averaged 19.078 and 1.042 ms. These measurements support stable cost across progression, while showing that the initial heavy workload still exceeds a 16.67 ms frame budget.

| Final encounter sample | Duration | Mean frame | Mean Scene.update |
| --- | ---: | ---: | ---: |
| Centaurus ordinary combat | 40 seconds | 18.903 ms | 0.975 ms |
| Three bosses, first window | 20 seconds | 16.736 ms | 0.729 ms |
| Three bosses, second window | 20 seconds | 16.680 ms | 0.710 ms |
| Three bosses, third window | 20 seconds | 16.919 ms | 0.701 ms |
| Two bosses remaining | 20 seconds | 16.694 ms | 0.675 ms |
| One boss remaining | 20 seconds | 16.671 ms | 0.633 ms |

The three-boss windows had raw step-interval p95 values of 17.0, 16.9, and 18.6 ms, with maxima of 30.4, 39.5, and 42.8 ms. Stable means therefore do not imply hitch-free rendering.

The corrected segment and finale passed **565 gameplay assertions, 24 finale assertions, 48 disk-persistence comparisons, and 58 encounter-retirement boundaries**. Coverage included nine ordinary bosses, 23 arcade events, three HEIST returns, six Arena Pause/Options/Store cycles, and 22 grenade-container checks. All nine protocol unlock thresholds passed across the two segments. The terminal debrief recorded all three bosses defeated, offered the actual Garage return, omitted Continue to Next Round, and cleared the completed run session.

At all 48 corrected quiescent checkpoints, resize/game/window/document listeners remained **21/20/18/14**, and stopped gameplay scenes had no remaining canvas owners. Active Arena textures varied from 170 at round 102 to 177 at 148, while DOM nodes stayed at 40. Sampled heap changed from 108.6 to 113.2 MB; these are snapshots subject to garbage collection, not a full retained-heap proof. Cached wall textures and encounter owners passed every retirement check.

Round 148 completion made four profile-save calls totaling **10.4 ms**, with **2.9 ms** for the longest call. A telemetry storage write in its sustained window took 3.0 ms. Save work did not produce a lasting slowdown in that window. Progress, wallet, and card values matched the physical save throughout the corrected segment and ending.

The evidence covers this seed, loadout, browser, and assisted fixture. It supports the late-game progression and lifecycle fixes without establishing a universal 60 FPS guarantee or recreating the user's unavailable original seed.

## Additional issue found

The broader audit found **18 retained HEIST decal Text objects per visit**, missed by DisplayList-only retirement checks. After two visits, CanvasPool still held 36 off-display Text owners and their textures (110,630 canvas pixels in that snapshot). These were not the full-size cached Arena wall textures: those continued to retire correctly. The leak did not explain the measured frame interval, but would accumulate across repeated HEIST entries.

`createEnvironmentDecalText()` intentionally returns an off-display object for callers that bake its artwork. HEIST used those labels as live facility decorations, yet did not register them with the DisplayList. Its normal scene shutdown therefore missed them; the facility's separate manual destroy path was not used by scene shutdown. `HeistFacility.ts` now registers the returned labels with `scene.add.existing`, which both displays the authored decals and lets the existing scene owner destroy their Text canvases and textures. No new shutdown owner, capacity limit, or balance change was introduced.

The live fixture now rejects off-display HEIST text owners, and every stopped-scene checkpoint also checks CanvasPool ownership. All three corrected HEIST visits passed: their live labels had a display owner, and shutdown left zero HEIST canvas owners. The 22 grenade-container checks also passed armed-bomb operation, outside-contact range, exact splash/direct damage, and preserved loot behavior. Build and all **654 tests** passed after the production correction.

## Reproduction and durable evidence

The first extended attempt lost its browser before a final report was saved and is not counted as a completed validation run. The runner now writes a partial report after each completed round, at a stopped-scene boundary outside combat measurement windows. Final evidence is written only after the full run finishes.

The recorded before-fix report remains marked **failed/incomplete**: it contains the known retained HEIST Text objects and ends at 101, short of its original full-run scope. It is evidence for those completed rounds and the resource finding, not a passing full-run result.

After all corrected rounds completed, the finale harness initially timed out while a legitimate premium Mod reveal was awaiting acknowledgment. The game remained in the same live Arena generation at its normal reward gate. Resuming that generation acknowledged the reveal and completed the boss handoff, all boss samples, credits, debrief, and Garage return without reloading. The report preserves this interruption and the original 40-second Centaurus sample. The fixture now acknowledges premium reveals while waiting for this handoff. This was a harness omission; no production handoff change was needed for this pause.

Recorded evidence:

- [Before-fix segment measurements](endgame-before-fix-measurements.json), including the retained Text finding and reload interruption.
- [Corrected segment and finale measurements](endgame-after-measurements.json), with a passing analyzer result and the premium-reveal interruption retained.
- [Raw corrected report](../artifacts/progression-endgame-after.json) and [analyzer output](../artifacts/progression-endgame-after.summary.json).
- [Independent save verification after reload](../artifacts/endgame-save-reload.json).
- [Build output](../artifacts/endgame-build.txt) and [654-test output](../artifacts/endgame-tests.txt).

The compact measurement files are repository artifacts; the larger files under `artifacts/` are local, ignored evidence. The command below reproduces a fresh full-scope test; the recorded evidence above used the two documented segments.

With the DEV server on port 5173 and an isolated debugging browser on port 9225:

```powershell
$env:N3ON_SOAK_ROUNDS='81'
$env:N3ON_SOAK_OPTIONS='{"startRound":68,"initialHighestRound":67,"protocol":"supreme-gemini","sampleMs":20000,"sustainedMs":20000,"sustainedRounds":[68,78,88,98,108,118,128,138,148],"enhanced":true,"heists":true,"heistEvery":16,"fullHeistTraversal":false,"menuEvery":8,"bossSampleMs":10000,"finishCampaign":true}'
node scripts/run-mixed-session.mjs artifacts/progression-endgame.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/progression-endgame.json --progression
node scripts/summarize-endgame-investigation.mjs
```

The recorded corrected segment uses `rounds:47`, `startRound:102`, `reuseProfile:true`, and `sustainedRounds:[102,108,118,128,138,148]`, writing `artifacts/progression-endgame-after.json`. Reusing a profile is accepted only when its saved highest Supreme round is exactly the requested start minus one. Analyze that path and run `node scripts/summarize-endgame-investigation.mjs endgame-after` to produce the corrected-segment measurements.

During a run, `node scripts/summarize-endgame-investigation.mjs --status` reads only the last completed disk checkpoint, without interrupting the browser's combat sample.
