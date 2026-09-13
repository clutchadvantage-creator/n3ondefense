# Facility, presentation, and usability audit

This follows the [presentation and transition pass](polish-and-transition-audit.md). It improves HEIST movement and room identity, facility traps, bombsites, stadium advertising, robotic motion, and Options resizing. The existing private RenderTexture helper, Canvas stadium bake, encounter ownership, reserves, camera follow, combat limits, and progression remain in place. The two framework corrections are supported by reproduced failures: circular corner clearance and HEIST radar scratch-data retirement.

## HEIST movement and facility

The wall runtime already normalized intersecting wall rectangles and generated exposed faces before this pass. Removing wall overlaps again would not have addressed the reproduced snag. The shared sweep treated the player's expanded wall bounds as square collision corners. A radius-12 circle could consequently stop on a route that had physical clearance. The conservative box now supplies the broad-phase rejection; corner candidates use a swept circle intersection and tangent projection. Side contacts retain their existing fast path, with the same two bounded slide passes and Arcade integration. Neither walls nor passage widths were reduced.

The real-browser fixture uses `SweptPlayerBody.preUpdate`, Arcade wall separation, and body `postUpdate`. Across seeds 17, 81337, and 550055, **1,656 physically clear corner approaches were blocked before and all passed afterward**. The representative premature stop was 4.35 pixels. All **2,124 corridor traversals** passed both versions, including both directions and three lateral offsets. Tests also cover corner quadrants, high-speed wall crossings, physical nonpenetration, and bounded tangent velocity. This is controlled movement coverage, not a claim about every possible input trajectory.

A separate comparison of **100 seeds** preserved accepted seeds, maze nodes and edges, wall rectangles, vault doors, entry, and extraction. Every seed retained five fire, five spike, and five catch traps. Fire positions intentionally change to solid wall faces; trap timing and hazard budgets do not change.

Existing side chambers now receive five facility identities: coolant exchange, signal relay, security control, bonded storage, and maintenance. Twenty-four selected chambers receive quiet floor schematics, room labels, equipment codes, and wall instrumentation. Placement favors side branches and avoids trap rooms, entry, extraction, and vault approaches. Raised fixtures fit inside the existing wall footprint; walkable floor details are flat. The 100-seed test checks deterministic placement and fixture containment. No new rooms, blockers, loot allowance, or maze routes were necessary.

Wall caps now repeat their industrial panel texture at its authored pitch instead of stretching vents and hardware across long merged runs. Cropped Images share the four cap textures; partial panels end at the projected wall bounds. This avoids a private repeat texture per wall while preserving foreground fading and the existing destruction owner. Ground-level footings make the collision footprint easier to read beneath the existing projected upper walls. Their solid rectangles share one Graphics batch, using direct rectangle commands without path triangulation or a world-sized texture. Existing exposed-edge facades, foreground fading, visibility zones, and colder lighting remain. Room details use ten fixed shared textures and the existing facility owner. This brings clearer purpose and landmarks to the facility without filling the movement lanes with props.

## Hazards and combat presentation

HEIST fire nozzles previously used arbitrary offsets inside cells despite already sharing Arena's wall-nozzle artwork. They now mount on a sufficiently long room-facing wall span. A 100-seed check verifies clear flame lanes. The shared 980 ms warning, ignition, contact damage, two-nozzle concurrency, and cooldown behavior remain. The real-browser fixture confirms warning before damage and active flame contact inside the mounted lane.

Inactive spike traps now resemble closed floor shutters, with quiet seams and no exposed blades. Activation retains the full **620 ms warning** and displays the damage area and rising warning signal before extension. Damage remains 11, once per activation, within the existing radius. Catch traps retain their **320 ms warning** and **one-second restraint**, with closing metal jaws, a charging ring, and restraint anchors/cables. Their negative-coordinate polygon vertices now use the authored zero origin; the default half-size origin displaced both jaws above/left of their anchors. The fixture checks symmetric alignment at rest and during closure. Static trap plates use the existing small texture-baking helper; only the existing bounded hazard update animates active details.

Bombsites have a deeper base, visible front facets, service vents, rail accents, and a layered mechanical charge housing. Their existing rings, masts, armed pulses, labels, objective radii, and state transitions remain. Unchanging platform, rotor, sweep, and charge drawings are baked once. Animated drawings sit inside containers that preserve their original pivots; rotating a texture around its top-left corner would have been incorrect. Each site keeps the existing owner and destruction path.

The old enemy shadow was baked well below the sprite center and rotated around the chassis with the whole sprite. Its replacement is a soft, centered contact footprint. Six robot families now use four compact frames each for small suspension/hover changes and sensor accents. Tank tread segments advance with distance traveled and stop when the tank stops. All four frames have identical dimensions and origins. The browser check verifies distinct drawings, frame selection, unchanged body/display dimensions, and stationary tracks. These are frame changes on the existing enemy sprite, with no added enemy objects, per-enemy tweens, or live path drawing. Existing facing, AI, damage feedback, and collision sizing remain.

## Stadium and interface

The beach promenade gains small lit bollards and broken neon reflections in the existing stadium bake. Advertisements gain angled product panels, stronger brand hierarchy, fitted lettering, a cleaner border, and an emissive underline. The existing brands and seeded selection remain. **Periodic ad rotation was deliberately omitted:** the screens share the optimized static backdrop. Keeping the improved artwork there avoids extra live layers, periodic texture uploads, and another update/lifetime path for a small peripheral effect. Existing venue lights provide motion.

Options gains restrained frame details and a debounced resize handler. It rebuilds only its own presentation, preserving the active tab, scroll fraction, return flags, and an open deployment-quit confirmation. Binding capture cancels safely. A responsive feedback form retains its unsent draft; the Phaser rebuild waits until the form closes. Ability-binding controls now participate in controller focus and Back cancellation. Resize listeners and pending timers retire with Options.

The **51 resize/navigation assertions** cover repeated changes among 960 × 600, 1280 × 720, and 1440 × 900, every tab, binding capture, quit confirmation, feedback draft preservation, and return to the same paused Arena. The fixture constrains the actual game parent as well as its scale. All **60 preceding menu/screen checks** also pass, covering Options settings and profile protection, HEIST/Splash returns, Garage and Mod dossiers, store returns, local profiles, leaderboards, and controller Back. Controller input is simulated; physical hardware was not tested.

Main Menu/mode selection, Garage, stores, Mod Collection, profiles, leaderboards, pause, rewards, debrief, and credits retain their existing structure. Review found no reason to replace their established console hierarchy in this pass. Their existing navigation and representative screen costs remain in the browser fixtures. Online submission and network failure recovery are outside these local checks.

## Rendering, setup, and resources

The sweep uses a 1552 × 903 headless Edge viewport, DPR 1, WebGL, and normal 0.9 gameplay zoom. Edge reports an NVIDIA GeForce RTX 5070 through ANGLE/Direct3D11. The original paired sweep ran on Edge 152 on September 9. Edge had updated to 153 when validation resumed on September 13; the final comparison therefore includes a browser change and does not isolate code cost alone.

All **128 unique layout/view comparisons pass after the focused HEIST correction**: 108 generated Arena layouts across rounds 1/30/148, three authored hub-spoke drafts, nine HEIST views, and eight menu screens. Arena layout JSON remained identical. Authored drafts cover hub-spoke artwork and are not represented as accepted generated layouts.

The September 13 full sweep initially passed 127/128 comparisons. HEIST seed 17's entry view measured 1.597 ms of renderer CPU against its unchanged 1.486 ms allowance. The new individual footing rectangles contributed about 0.14 ms/frame. Combining them into one rectangle batch reduced that component to about 0.025 ms/frame in the nine-view follow-up, which passed every existing renderer and raw-frame budget. The final comparison retains the unchanged Arena/menu measurements from the full sweep and explicitly identifies the nine replacement HEIST samples. The failed sweep remains in the raw evidence; thresholds were not relaxed.

| Measurement | Baseline, Edge 152 | Initial artwork pass, Edge 152 | September 13 validation, Edge 153 |
| --- | ---: | ---: | ---: |
| Arena layout renderer CPU, mean | 0.427 ms/frame | 0.453 ms/frame | 0.510 ms/frame |
| Arena visual setup, full sweep mean | 51.956 ms | 65.462 ms | 70.784 ms |
| HEIST view renderer CPU, observed range | 1.028–1.321 ms/frame | 1.218–1.550 ms/frame | 1.383–1.542 ms/frame |

The new artwork is not cost-free. September 13's maximum Arena layout renderer CPU was 0.757 ms/frame and its maximum setup was 183.2 ms. Arena rendering code did not change between the two after sweeps. The earlier focused 12-case setup diagnosis, including round 68, averaged **62.483 → 68.625 ms**, attributing most added CPU to the stadium bake and lettering. Those instrumented timings should not be mixed with full-sweep setup timings. The final HEIST follow-up constructed its three facilities in 141.7, 65.7, and 64.4 ms, including first-use work in the first case. Raw frame comparisons pass; renderer CPU is not total frame time or a GPU timer measurement.

The existing Arena small-art texture allowance passed. A separate six-cycle HEIST/trap/two-bombsite fixture alternated explicit destruction and Phaser shutdown. It verified that **2,866 previously live private GPU textures** were invalid after retirement, with zero scene roots and zero Text canvas owners. Shared texture count stayed at 102 after each cycle. The cap correction removed 230–232 private repeat textures per facility, approximately 14.4–14.5 MiB of duplicate RGBA pixels. It adds roughly one shared-texture Image per wall on average; a seed-550055 check verified that all 469 panels cover exactly the 231 projected wall rectangles without overhang. The fixture's maximum live private texture area was 7,238,160 pixels, approximately **27.6 MiB of RGBA pixel storage**, including pre-existing HEIST tile surfaces. This is neither an incremental allocation measurement nor total/peak GPU memory. The five room floor/cabinet texture pairs add approximately 1.06 MiB of shared RGBA pixels; the enemy frames add approximately 0.36 MiB over their previous single frames.

WebGL screenshots were reviewed before/after for wall surfaces, room fixtures, trap states, shadow position at four headings, bombsite depth, shore details, ad lettering, and compact Options. The changes intentionally alter artwork; this pass makes no pixel-parity claim. [Layout measurements](quality-layout-measurements.json) retain every paired case. [Validation measurements](quality-validation-measurements.json) retain fixture options, checks, timing summaries, and resource results. Raw screenshots and browser traces remain ignored local artifacts.

## Gameplay validation

Both fixtures use seed 550055, five rank-three Mods, ordinary pressure limits, armed bombs, deployables, special ammunition, and overlapping hazards. Invulnerability, replenished placement energy, assisted defuser kills, accelerated event/boss outcomes, and assisted HEIST traversal are test controls. The late fixture creates a separate profile with the regular Overdrive prerequisite and Supreme highest round 136, then completes 137–148 before Centaurus. These are assisted runtime checks, not unassisted clears or a new consecutive round-68-to-148 soak. Round 68 is covered by the setup diagnosis and preceding investigations; corridor movement has separate real-body coverage.

The corrected normal fixture completed rounds 1–12 in **222.6 seconds**, passing **171 gameplay assertions**, 14 retirement boundaries, and 12 disk-save comparisons. It exercised all six Arcade events, two HEIST returns, three Pause/Options/Store cycles, two bosses, physical rewards, and four Mod reveals. The first and last four ordinary encounters averaged 16.940 and 17.026 ms in smoothed Phaser deltas. Twelve quiescent checkpoints retained zero Arena/HEIST Text canvases, with resize/game/window/document listener counts fixed at 21/21/18/14.

An earlier 12-round attempt failed retirement validation because HEIST retained its last radar-contact entries. Those records are preserved as `artifacts/quality-mixed-normal-radar-retention.json` and its summary, and are excluded from qualification. The correction clears that scratch array in the existing shutdown callback. The corrected run verified zero retained radar entries at every checkpoint. The analyzer was not relaxed. The September 13 normal run includes the shared cap textures and precedes only the final footing-batch correction; the final behavior/lifetime fixture and ending run exercise that correction.

The final-code Supreme fixture completed **rounds 137–148 and Centaurus in 484.2 seconds**, passing **194 gameplay assertions, 24 finale assertions, 16 retirement boundaries, and 13 disk-save comparisons**. It exercised all six Arcade events, two HEIST returns, three Pause/Options/Store cycles, two ordinary bosses, and 6 Mod reveals. The first and last four ordinary encounter means were 17.233 and 17.267 ms in smoothed Phaser deltas. Each Arcade event supplied approximately eight seconds of continuous frames.

| Sustained ending sample | Raw mean frame interval | Raw p95 interval |
| --- | ---: | ---: |
| Centaurus ordinary, 40 seconds | 16.722 ms | 16.9 ms |
| Three bosses, first 20 seconds | 16.736 ms | 16.9 ms |
| Three bosses, second 20 seconds | 16.680 ms | 16.9 ms |
| Three bosses, third 20 seconds | 16.763 ms | 17.4 ms |
| Two bosses remaining, 20 seconds | 16.708 ms | 16.9 ms |
| One boss remaining, 20 seconds | 16.666 ms | 16.9 ms |

All three bosses stayed alive and active during the full 60-second sample, with player fire withheld. Completion stayed false after the first two deaths and persisted after the third. Credits, terminal debrief, the actual Garage return, and an independent browser reload preserved completion and Supreme highest round 148. The camera-shake preference was changed through Options and survived reload in both normalized settings and disk storage.

| Continuous late gameplay phase | Raw mean interval | Histogram p95 | Longest interval |
| --- | ---: | ---: | ---: |
| Defense | 16.835 ms | 19 ms | 36.2 ms |
| Defusing | 17.023 ms | 20 ms | 40.5 ms |
| HEIST | 16.653 ms | 17 ms | 29.5 ms |
| Boss combat | 16.703 ms | 17 ms | 41.6 ms |

All sustained gameplay budgets passed, including the 20 ms raw mean and 34 ms raw p95 limits for phases with at least 120 frames. Histogram percentiles round upward to whole milliseconds. Individual hitches and synchronous transitions remain:

| Observed transition maximum | Normal run | Late run |
| --- | ---: | ---: |
| Initial scene to Arena | 271.9 ms | 263.2 ms |
| Loading to Arena | 193.1 ms | 228.6 ms |
| Encounter to boss introduction | 204.0 ms | 207.1 ms |
| HEIST entry | 222.5 ms | 215.3 ms |
| HEIST return | 91.4 ms | 88.6 ms |
| Options return to Arena | 29.2 ms | 32.7 ms |
| Debrief entry | 33.6 ms | 30.8 ms |

These are observed raw frame maxima, not guaranteed latency ceilings or isolated setup CPU. The September 13 browser build differs from the preceding pass, so these timings do not establish a causal before/after transition improvement. Reducing duplicate cap textures does not eliminate synchronous initialization.

Together, the two recorded runs cover **24 ordinary rounds plus Centaurus, 365 gameplay assertions, 24 finale assertions, 30 encounter retirements, and 25 disk-save comparisons**. All 25 quiescent checkpoints retained zero Arena/HEIST Text canvas owners and zero HEIST radar contacts, with resize/game/window/document listener counts fixed at 21/21/18/14. The extra game listener belongs to the continuous frame recorder and is removed when the fixture ends.

Raw evidence: [normal gameplay](../artifacts/quality-mixed-normal.json), [normal analysis](../artifacts/quality-mixed-normal.summary.json), [late gameplay](../artifacts/quality-mixed-late.json), [late analysis](../artifacts/quality-mixed-late.summary.json), and [reload verification](../artifacts/quality-save-reload.json). The earlier same-browser layout capture is [preserved separately](../artifacts/quality-layout-after-tiles.json).

## Remaining debt and limits

The cold first-debrief diagnostic now traces a real assisted combat completion, including browser GC events and markers around round completion, retirement, and debrief construction. It did not reproduce the preceding pass's 318.1 ms spike. Debrief creation took **8.406 ms** inside a **96.836 ms** animation callback, with most of that callback preceding construction. No individual recorded main-thread GC slice in the nearby window exceeded 1 ms. Nested trace slices must not be summed. This narrows the observed work but does not identify the cause of the original spike or establish that it is fixed. The traced one-round run is separate from performance qualification.

A synthetic **4× CPU-throttled** setup check completed all twelve layouts. Setup averaged **224.0 ms**, ranging from 191.8 to 349.2 ms. The runner restores throttling in `finally`. This demonstrates remaining synchronous setup sensitivity; it does not emulate an integrated GPU, memory bandwidth, thermal behavior, or an actual low-end device. First deployment and HEIST transitions still need testing on that hardware.

Onboarding still teaches movement, aim, fire, arming, enemy contact, and five abilities before its separate HUD sequence, alternating live gates and hard pauses. Energy is required before all resource feedback has been explained. Replay, skip, binding-aware prompts, and unavailable-action fallbacks are useful, but they do not establish teaching quality. A focused new-player keyboard/controller playtest should evaluate earlier Energy/objective feedback, fewer interruptions, and teaching optional abilities when useful. The sequence was not reordered without that evidence.

The saved particle preference is a boolean (`settings.particles`), not a complete live density control. Several VFX systems capture it at construction. Exposing it in Options needs a parity pass across Arena, HEIST, projectiles, portals, and stores; no misleading live toggle was added. Options also retains its redundant scheduled persistence after already-durable settings writes. Neither issue justified changing save durability during this presentation pass.

Recommended next work is a measured cold-transition investigation with deeper scene-queue/driver attribution, a lower-end hardware run that includes texture-memory pressure, and the focused onboarding playtest. The evidence does not establish hitch-free transitions, unassisted campaign completion, arbitrary sub-960 × 600 layouts, every seed/loadout, or 60 FPS on every device.

## Reproduction

Use an isolated DEV profile, Vite on port 5173, and WebGL Edge/Chrome debugging on port 9225. Run browser fixtures sequentially; do not edit imported production modules during measurement. Build and **all 660 tests pass** on the final production code: [build](../artifacts/quality-build.txt), [tests](../artifacts/quality-tests.txt).

```powershell
node scripts/run-layout-audit.mjs artifacts/quality-layout-after.json
node scripts/analyze-quality-layouts.mjs
node scripts/run-layout-audit.mjs artifacts/quality-movement-after.json ./audit-heist-movement.browser.js
node scripts/run-layout-audit.mjs artifacts/quality-behavior.json ./audit-quality-behavior.browser.js
node scripts/run-layout-audit.mjs artifacts/quality-options-resize.json ./audit-options-resize.browser.js
node scripts/run-layout-audit.mjs artifacts/quality-menu-flows.json ./audit-menu-flows.browser.js
node scripts/run-layout-audit.mjs artifacts/quality-screen-details.json ./audit-screen-details.browser.js
```

To regenerate the recorded comparison that combines the full sweep with the focused correction, use `node scripts/analyze-quality-layouts.mjs artifacts/quality-heist-footings-after.json`. A fresh full sweep of the current code can use the analyzer without that argument. The compact report identifies every source and retains the superseded HEIST results.

The paired analyzer requires the preserved `artifacts/quality-layout-before.json`. The 100-seed baseline comparison uses `node --experimental-strip-types scripts/verify-quality-geometry.mjs` and the preserved original layout module under `artifacts/quality-baseline/`; this is a local historical comparison, not a build prerequisite. Current movement, hazard, enemy, resource, and UI fixtures run against the current code without that historical source.

Repeat a gameplay fixture using its exact recorded options; use `late` instead of `normal` for the ending run:

```powershell
$fixture = (Get-Content docs/quality-validation-measurements.json -Raw | ConvertFrom-Json).normal
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/quality-mixed-normal.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/quality-mixed-normal.json --progression
```

After the ending run, `node scripts/verify-polish-save.mjs artifacts/quality-save-reload.json` verifies completion and the camera-shake preference across reload. `node scripts/trace-quality-debrief.mjs` performs the separate cold diagnostic; run it before the late fixture because it uses a separate test profile. To repeat the slower-CPU setup diagnostic, set `$env:N3ON_CPU_RATE = '4'`, run the setup fixture with `benchmark-setup-costs.browser.js`, and remove that environment variable afterward. Once all records exist, `node scripts/summarize-quality-validation.mjs` refreshes the compact evidence.
