# Facility, presentation, and usability audit

This follows the [presentation and transition pass](polish-and-transition-audit.md). It improves HEIST movement and room identity, facility traps, bombsites, stadium advertising, robotic motion, and Options resizing. The existing private RenderTexture helper, Canvas stadium bake, encounter ownership, reserves, camera follow, combat limits, and progression remain in place. The two framework corrections are supported by reproduced failures: circular corner clearance and HEIST radar scratch-data retirement.

## HEIST movement and facility

The wall runtime already normalized intersecting wall rectangles and generated exposed faces before this pass. Removing wall overlaps again would not have addressed the reproduced snag. The shared sweep treated the player's expanded wall bounds as square collision corners. A radius-12 circle could consequently stop on a route that had physical clearance. The conservative box now supplies the broad-phase rejection; corner candidates use a swept circle intersection and tangent projection. Side contacts retain their existing fast path, with the same two bounded slide passes and Arcade integration. Neither walls nor passage widths were reduced.

The real-browser fixture uses `SweptPlayerBody.preUpdate`, Arcade wall separation, and body `postUpdate`. Across seeds 17, 81337, and 550055, **1,656 physically clear corner approaches were blocked before and all passed afterward**. The representative premature stop was 4.35 pixels. All **2,124 corridor traversals** passed both versions, including both directions and three lateral offsets. Tests also cover corner quadrants, high-speed wall crossings, physical nonpenetration, and bounded tangent velocity. This is controlled movement coverage, not a claim about every possible input trajectory.

A separate comparison of **100 seeds** preserved accepted seeds, maze nodes and edges, wall rectangles, vault doors, entry, and extraction. Every seed retained five fire, five spike, and five catch traps. Fire positions intentionally change to solid wall faces; trap timing and hazard budgets do not change.

Existing side chambers now receive five facility identities: coolant exchange, signal relay, security control, bonded storage, and maintenance. Twenty-four selected chambers receive quiet floor schematics, room labels, equipment codes, and wall instrumentation. Placement favors side branches and avoids trap rooms, entry, extraction, and vault approaches. Raised fixtures fit inside the existing wall footprint; walkable floor details are flat. The 100-seed test checks deterministic placement and fixture containment. No new rooms, blockers, loot allowance, or maze routes were necessary.

Wall caps now repeat their industrial panel texture at its authored pitch instead of stretching vents and hardware across long merged runs. Ground-level footings make the collision footprint easier to read beneath the existing projected upper walls. Existing exposed-edge facades, foreground fading, visibility zones, and colder lighting remain. Room details use ten fixed shared textures and the existing facility owner. This brings clearer purpose and landmarks to the facility without filling the movement lanes with props.

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

The matched sweep uses a 1552 × 903 headless Edge viewport, DPR 1, WebGL, and normal 0.9 gameplay zoom. Edge reports an NVIDIA GeForce RTX 5070 through ANGLE/Direct3D11. Its fresh baseline avoids comparing a different viewport against the preceding pass. All **128 comparisons passed**: 108 generated Arena layouts across rounds 1/30/148, three authored hub-spoke drafts, nine HEIST views, and eight menu screens. Arena layout JSON remained identical. Authored drafts cover hub-spoke artwork and are not represented as accepted generated layouts.

| Measurement | Before | After |
| --- | ---: | ---: |
| Arena layout renderer CPU, mean | 0.427 ms/frame | 0.453 ms/frame |
| Arena visual setup, full sweep mean | 51.956 ms | 65.462 ms |
| Focused 12-case visual setup, including round 68 | 62.483 ms | 68.625 ms |
| HEIST view renderer CPU, observed range | 1.028–1.321 ms/frame | 1.218–1.550 ms/frame |

The new artwork is not cost-free. Arena's maximum measured layout renderer cost was 0.678 ms/frame, and its full-sweep maximum setup was 102.8 ms. The focused comparison attributes most additional setup to the stadium bake; lettering also costs more. Baseline and detailed setup timings include diagnostic wrappers and should not be mixed with the full-sweep timings. These remain small repeated rendering costs, but HEIST's richer caps and room details add measurable renderer CPU. Raw frame comparisons passed the existing budget; renderer CPU is not total frame time or a GPU timer measurement.

The existing Arena small-art texture allowance passed. A separate six-cycle HEIST/trap/two-bombsite fixture alternated explicit destruction and Phaser shutdown. It verified that **4,251 previously live private GPU textures** were invalid after retirement, with zero scene roots and zero Text canvas owners. Shared texture count stayed at 102 after each cycle. The fixture's maximum live private texture area was 11,035,152 pixels, approximately **42.1 MiB of RGBA pixel storage**, including pre-existing HEIST tile surfaces. This is neither an incremental allocation measurement nor total/peak GPU memory. The five room floor/cabinet texture pairs add approximately 1.06 MiB of shared RGBA pixels; the enemy frames add approximately 0.36 MiB over their previous single frames.

WebGL screenshots were reviewed before/after for wall surfaces, room fixtures, trap states, shadow position at four headings, bombsite depth, shore details, ad lettering, and compact Options. The changes intentionally alter artwork; this pass makes no pixel-parity claim. [Layout measurements](quality-layout-measurements.json) retain every paired case. [Validation measurements](quality-validation-measurements.json) retain fixture options, checks, timing summaries, and resource results. Raw screenshots and browser traces remain ignored local artifacts.

## Gameplay validation

The corrected normal fixture completed rounds 1–12 in **222.2 seconds**, passing **172 gameplay assertions**, 14 retirement boundaries, and 12 disk-save comparisons. It exercised all six Arcade events, two HEIST returns, three Pause/Options/Store cycles, two bosses, physical rewards, and four Mod reveals. The first and last four ordinary encounters averaged 16.903 and 17.052 ms in smoothed Phaser deltas. Twelve quiescent checkpoints retained zero Arena/HEIST Text canvases, with resize/game/window/document listener counts fixed at 21/21/18/14.

An earlier 12-round attempt failed retirement validation because HEIST retained its last radar-contact entries. Those records are preserved as `artifacts/quality-mixed-normal-radar-retention.json` and its summary, and are excluded from qualification. The correction clears that scratch array in the existing shutdown callback. The corrected run verified zero retained radar entries at every checkpoint. The analyzer was not relaxed.

The final Supreme 137–148/Centaurus run is still being validated. Its final results and reload verification will be recorded here before this pass is marked complete.

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
