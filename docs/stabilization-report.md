# N3ONDefense stabilization — September 7, 2026

Follow-ups: [Round 68 investigation](round-68-investigation.md), [rounds 68 through 148 and the Centaurus ending](endgame-validation.md), and [layout performance across the game](layout-performance-audit.md). The measurements below describe the earlier stabilization pass.

The stabilization preserves `RoundRuntimeLifecycle`, `EncounterResourceRegistry`, generation guards, prewarm, pool maintenance, boss flow, anomaly suspension/return, and the existing SceneManager transitions. No balance, enemy cap, hazard, reward roll, save schema, trail quality, or ordinary visual-quality setting was reduced.

Two browser runs each completed 32 ordinary rounds and 40 round/boss lifecycle boundaries without reloading during either run. The final-code run took 619.628 seconds and included 16 arcade events, eight bosses and physical boss-loot collections, eight HEIST visits and returns, 19 premium Mod reveals, 32 Round Finished presentations, and 31 Loading transitions. Both runs passed the resource and performance analyzer. The final-code measurements below include the ammo activation and input-prompt corrections.

## Confirmed causes and corrections

1. **HEIST HUD instances escaped scene ownership.** HEIST already constructed the shared `Hud`, but shutdown did not detach the HUD's global ScaleManager resize listener. Each visit retained the old HUD through that listener. Baseline quiescent resize listeners increased from 21 to 25 across four visits. `Hud` now owns its shutdown subscription and idempotent destruction, including external resize detachment even when Phaser has already destroyed the display tree. This does not introduce another encounter lifecycle.

2. **Dormant projectile capacity remained physics workload.** Disabling a pooled body left it in Arcade's dynamic-body collection. Ordinary baseline rounds registered 680–700 unused projectile bodies alongside active bodies; Arcade still scanned them and included the collection in its world bookkeeping. Arena and HEIST now remove retired bodies from the physics world and re-add them on reuse. Images remain scene-owned so framework destruction remains safe. Prewarm and the existing pools retain their intended capacities. These physics images do not have Sprite animation `preUpdate` work.

3. **HEIST enemy death did not own its collider pair.** Each enemy added wall and vault-door colliders, but destroying the enemy did not destroy those colliders. They survived until scene shutdown and accumulated collision work during the HEIST. The enemy's destroy event now retires both colliders. After the soak kills the ambush enemies, HEIST returns to one player body and two player/world colliders.

4. **Premium reveal completion could lose the next encounter.** A premium reveal emits completion before Phaser processes the owner's queued resume. The Arena idle callback rejected the still-paused owner and permanently dropped its round handoff. The baseline reproduced a stalled rewarding phase at round 18. The existing generation-guarded handoff now accepts its paused owner. Consecutive premium cards also wait until the next owner-clock turn before launching the same reveal scene key, so Phaser can first finish the outgoing scene's stop/resume queue. The presenter's existing timer is included in its busy state and teardown.

5. **Physical currency presentation scaled with reward units.** Credits were bundled, but Core Tokens, Plasma Chips, and Flux Cores became individual pickups. Baseline HEIST stress drops produced 708–736 loose pickup roots and thousands of nested drawing objects. `PhysicalLootService` now creates exact integer denominations for all four currencies. HEIST uses at most four bundles per individual reward roll, at most 12 live currency stacks per kind, and at most 64 pickup roots including collection animations. Overflow currency merges into the nearest live stack of that kind; if no slot is available, the reward remains queued. Every Mod remains an individual reward at its original drop location and waits for a presentation slot when necessary. Collection remains the only point that changes provisional haul totals. Currency roots are pooled with at most 48 retained slots; collection labels reuse at most eight Text objects. Timed grenade/scattershot pickups remain individual because each activates a powerup and their collectors do not consume a quantity.

6. **Shared HUD configuration still had divergent screen geometry.** Scroll factor zero cancels camera translation but does not cancel HEIST's changing camera zoom. The shared HUD root now cancels that zoom at render time, preserving saved pixel geometry and startup animation. HEIST objective annotations join the same root and use the actual panel bounds for spacing. Arena and HEIST share the same radar range. Returning from HEIST Options refreshes saved HUD, aim, bindings, and controller settings; waking the preserved Arena refreshes its current settings too. Switching input devices updates HEIST ability prompts. No separate HUD implementation or extra HUD camera was added.

7. **Wall runs overlapped at junctions.** Collinear merging alone left intersecting rectangles, internal facades, and protruding faces. `normalizeHeistWallJunctions` partitions the occupied wall union into disjoint rectangles; branches stop flush at the owning run. Only exposed union edges receive dimensional facades. Rendering, static colliders, and wall queries consume that same normalized geometry. The occupied footprint, doors, rooms, and routes remain intact.

8. **Dash correction ran in the wrong integration phase and only in Arena.** The previous Arena callback inspected motion after Arcade had integrated the body, and HEIST lacked that correction. The shared Player now uses `SweptPlayerBody`, which applies the existing sweep before committing displacement on every physics substep. It queries enabled static walls/closed doors and world bounds, stops before the nearest hit, and preserves tangential displacement. This also covers high-speed ordinary movement and compounded boosts. Simultaneous corner entry now projects each blocked axis independently rather than treating two perpendicular constraints as one unit normal.

## Browser measurements

The baseline artifact is [mixed-soak-before.json](../artifacts/mixed-soak-before.json). It aborted at ordinary round 18 after 21 round/boss boundaries and 17 completed result transitions; it did **not** complete 30 encounters. The final after-run is [mixed-soak-after.json](../artifacts/mixed-soak-after.json), with its [analysis](../artifacts/mixed-soak-after.summary.json). The earlier successful run is also retained as [mixed-soak-after-first.json](../artifacts/mixed-soak-after-first.json), with its [analysis](../artifacts/mixed-soak-after-first.summary.json).

| Resource / transition | Baseline | Final completed after-run |
| --- | --- | --- |
| Ordinary rounds / lifecycle boundaries reached | 18 / 21; handoff stalled | 32 / 40; completed |
| Quiescent resize listeners | 21 → 25 over four HEIST visits | 21 throughout eight visits |
| Quiescent game / window / document listeners | Resize leak established separately | 19 / 18 / 14, constant |
| Loose HEIST currency/Mod pickup roots at stress checkpoint | 708–736 | 20; configured ceiling 64 |
| Dormant projectiles registered in Arcade World | 680–700 during ordinary combat | 0; reusable capacity preserved |
| Dynamic bodies at internal post-cleanup boundary | Warm pool bodies remained registered | 1 retained player body |
| Projectile / FX / trail capacity at boundary | Retained warm capacity | 680–700 / 236 / 918–945, no late-cycle increase |
| Pooled audio voices / active round voices at boundary | — | 166 / 0 |
| Stale encounter owners / cleanup failures | Handoff failure reproduced | 0 / 0 |

The HEIST counts are pickup roots, not a claim that the entire facility contains only 20 GameObjects. In the first after-run the representative HEIST scene had 154 Containers and 126 Graphics including its normal world and HUD, versus 2,191–2,275 Containers and 809–837 Graphics in baseline stress checkpoints. The after-run also allowed active HEIST combat; the baseline harness had accidentally left its input gate paused.

At every Round Finished checkpoint, stopped Arena, HEIST, Loading, Options, and premium-reveal scenes had zero DisplayList and UpdateList entries, pending update entries, dynamic/static/pending bodies, colliders, timers, delayed calls, tweens, and gameplay input listeners. Arena was sleeping and invisible during HEIST. Only Arena was active or rendering nonempty content during ordinary combat; result/reveal/loading scenes retired before combat resumed.

The internal lifecycle boundary snapshot occurs before scene shutdown: it intentionally retains 1,064–1,084 display entries for the warm reserve and one player body. Its transient UpdateList entries disappear with framework processing/shutdown; the subsequent stopped-scene checkpoint is zero. Boss, hazard, event, anomaly, reveal, HUD, active projectile/FX/trail/destruction, and round audio diagnostics all returned to zero. This distinguishes reusable capacity from active work.

The SceneManager audit also records direct Maps/Sets/arrays. Gameplay collections and reveal objects clear. Earned Mod IDs remain progression data. DEV boundary/checkpoint histories are numeric snapshots bounded by their existing 256/1,024 entry limits. HEIST can retain up to five buff-label strings in its last payload; those strings hold no Phaser objects or callbacks and perform no work after shutdown.

The early performance window is samples 9–16 after warmup, matched against 25–32. Both windows repeat Supreme rounds 54–57 twice and the same eight-round settings/resize cycle.

| Final completed after-run timing | Early | Late |
| --- | ---: | ---: |
| Mean frame interval | 21.923 ms | 22.280 ms |
| Mean Arena scene update CPU | 0.757 ms | 0.809 ms |
| Mean per-sample p95 frame interval | 22.301 ms | 23.338 ms |
| Mean per-sample p95 update CPU | 1.075 ms | 1.138 ms |

The final late mean frame interval was 1.6% higher than the matched early window, with 0.052 ms more scene-update CPU. The first completed run independently measured 20.231 → 20.167 ms per frame and 0.643 → 0.720 ms scene-update CPU. Both kept the same resource baselines and completed all transitions.

This showed no progressive frame degradation in the exercised workload. Scene-update timing excludes Phaser physics/render callbacks; the frame interval includes the complete browser frame. The baseline's original update instrumentation targeted `scene.update` instead of Phaser's cached `sys.sceneUpdate`, so its CPU measurements are invalid. Combined with the baseline input-gate limitation and early abort, this prevents an honest before/after FPS speedup claim. The listener/body/loot counts and failed handoff remain direct baseline evidence.

## Verification and reproduction

`npm.cmd run build` and all **651** tests pass. [Build output](../artifacts/build.txt) and [test output](../artifacts/all-tests.txt) are saved locally. Geometry tests cover L/T/four-way junctions, disjoint rectangles, exterior edges, unchanged occupied union, and valid routes/doors across 24 generated facilities. Currency tests conserve integer totals through one million units, preserve individual Mods, and preserve timed-powerup activation counts.

[Browser verification](../artifacts/browser-verification.json) records 30 checks using real Phaser objects: perpendicular/shallow/parallel/corner/boundary movement; 30 repeated impacts; stacked speed pickups and Mods; closed/open doors; multiple physics substeps before sprite synchronization; actual DOM keyboard and browser gamepad polling through the shared dash action; HUD scale 1.4/text scale 1.2/edge position 0.2 at world zooms 1, 1.08, 1.18, and 1.4; idempotent HUD listener removal; and a physical pool stress case with 400 currency rewards plus 80 individual Mods collected exactly once. Its maximum was 64 simultaneous physical roots, 48 retained currency slots, and eight labels. Later rewards reused those slots.

An additional [premium handoff verification](../artifacts/premium-handoff-verification.json) awarded two consecutive Supreme cards while ending a real Arena round. It activated each actual Continue button handler, waited for the full outgoing tweens, and reached Round Finished in 9.005 seconds. Both cards completed, and the reveal scene had zero display objects and tweens afterward. This covers normal acknowledgement and animated dismissal in addition to the accelerated reveal completion used by the long soak.

The mixed browser runner uses real Phaser update, physics, rendering, controller input, rewards, and scene transitions. DEV controls accelerate outcomes after eight-second mature-combat samples, exercise event success and container damage, collect physical rewards, and advance bosses/reveals. It is a roughly ten-minute accelerated session, not a claim of hours of manual play. Initial pressure uses existing count/weight budgets; it does not lower difficulty or ordinary load. No reload or forced garbage collection occurs within a run. Every HEIST visits the actual Options return path and alternates non-default HUD scales 1.4/0.85 with 1280×800/1440×900 resizing.

Run in an **isolated browser profile**, because the harness intentionally awards loot and changes test-profile settings. Start the DEV server, then Edge/Chromium with remote debugging on port 9225 and the DEV page open. On Windows the tested browser command is:

```powershell
Start-Process -WindowStyle Hidden -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--headless=new --remote-debugging-port=9225 --user-data-dir="C:\Users\clutc\Documents\projects\ProjectX\.soak-browser" --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --window-size=1440,900 http://127.0.0.1:5173'
npm.cmd run performance:mixed:live
node scripts/analyze-mixed-session.mjs artifacts/mixed-soak-after.json
node scripts/dev-cdp-eval.mjs 9225 "import('/scripts/verify-stabilization.ts').then(m=>m.verifyStabilization(n3onGame))"
node scripts/dev-cdp-eval.mjs 9225 --file scripts/verify-premium-handoff.browser.js
```

The runner calls `n3onRoundLifecycleSoak`, `n3onRoundLifecycleReport`, `n3onEncounterLifecycleReport`, `n3onArenaPreparation`, and `n3onArenaPerformanceReport`, in addition to scene/ownership/runtime diagnostics. It records recursive GameObject types, physics/removal queues, controllers, audio, pools, listeners, retained collection sizes, and scene activity at each meaningful transition. Browser inspector listener counts avoid wrapping EventTarget or retaining application callbacks. Browser exceptions and incomplete coverage produce a failing exit code; the analyzer checks retirement, exact rewards, bounded capacity, and matched early/late timing. The browser profile and raw artifacts are ignored by Git and Vite's watcher so locked browser cache files cannot interrupt the DEV session.
