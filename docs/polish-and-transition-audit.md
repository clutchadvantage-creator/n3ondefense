# Presentation, transition, and interface audit

This completed pass follows the [layout performance audit](layout-performance-audit.md). Arena visual setup averaged 60.2% less CPU time across the matched layout sweep, while sustained gameplay and the Centaurus ending passed validation. It protects the preceding pass's small RenderTexture caches, round ownership, pool preparation, native camera follow, collision geometry, combat density, and progression. The work is targeted refinement of the existing game.

The subsequent [facility, presentation, and usability audit](facility-and-presentation-audit.md) records HEIST corner clearance, facility and hazard refinements, robotic motion, Options resizing, and renewed ending validation. It also documents remaining initialization hitches and the browser-version change between measurement sessions.

## Findings and changes

- **Setup latency:** inclusive setup instrumentation isolated the dominant cost to WebGL triangulation of the static stadium artwork. Twelve matched setup cases averaged 139.8 ms, with 113.0 ms inside the backdrop bake. A detailed follow-up attributed 81.7 ms to filled-path processing. Text creation averaged only 1.4–2.4 ms, so prewarming fonts would not address the main hitch.
- **Small setup correction:** the exact stadium drawing commands now rasterize once through Phaser's Canvas path renderer, then copy into the existing private RenderTexture with the existing labels. The temporary canvas texture and stamp are destroyed immediately, including failure paths. No scene activation, round handoff, pool, or live render loop was replaced. Twelve final-code setup cases averaged 58.6 ms. Full sweep measurements are recorded separately below.
- **Neon graffiti:** the previous muted colors made most wall tags resemble faded labels. All finishes now use the existing neon palette, with a soft baked light streak, contrasting underline, crisp glints, and a small cached text glow. Higher text resolution preserves lettering. Up to two selected floor panels share the existing six-to-nine decal allowance; they have no drips, align to the panel grid, remain well separated, and avoid structures, smashables, objectives, and spawn areas. Floor marks sit below walls and gameplay objects.
- **Options navigation:** a visible Back button complements Escape and controller Back. Splash replay now carries HEIST's paused-scene return flag, preserving its existing world. Ending a deployment from Options asks for confirmation and uses Arena's existing quit/save/retirement path before retiring HEIST. Back cancels that confirmation. Switching, importing, resetting, or restoring profiles is unavailable while a deployment remains active or paused; export remains available and the screen explains where to manage profiles.
- **Working camera-shake setting:** the save schema already had a camera-shake preference, but Options did not expose it and the effects ignored it. Options now provides the toggle. All authored camera-shake calls consult the active profile at the effect boundary. Enabled durations, intensities, and non-restarting explosion behavior are unchanged; attack warnings and VFX remain visible when motion is disabled.
- **Store controller Back:** the stores labeled their exit “MAIN MENU,” which the shared controller Back resolver did not recognize. “BACK TO MAIN MENU” makes the destination and action explicit and restores the existing controller path.

## Transition findings

The existing Loading steps validate the session, registry, shared texture availability, audio, and input. Layout generation, physics setup, HUD creation, combat preparation, and the large artwork bake occur during Arena initialization. The existing round lifecycle keeps simulation gated until startup presentation completes; the expensive bake is not repeated during live gameplay.

The stadium bake was necessary work using an unnecessarily expensive path renderer. Its seed-specific geometry and decoration make a cache of previous arenas an inappropriate first fix. The correction reduces the synchronous work without retaining old worlds or introducing asynchronous ownership. Splitting the rest of initialization across frames would require cancellation and partial-initialization handling; that larger change was deliberately deferred until the smaller correction was measured.

The tradeoff is a temporary 2400 x 1600 canvas and texture upload during construction. Each RGBA pixel surface at that size represents approximately 14.65 MiB; actual peak CPU/GPU memory was not measured. Removing the temporary texture releases its GPU resource and returns its canvas to Phaser's pool, which resets the canvas to 1 x 1. The existing private stadium RenderTexture remains the live renderer. Setup timings are inclusive CPU measurements; nested calls must not be added together.

Ordinary-to-boss transitions reuse the same renderer and benefit from the same correction. The normal run measured combat reserve preparation at 2.48 ms per call (maximum 4.5 ms) and HUD setup at 8.24 ms (maximum 18.6 ms), substantially smaller than the former bake. The existing reserves are already prepared before activation; adding another prewarm layer was not justified. Save/progression boundary writes remain synchronous and durable. Reward ordering, premium-reveal acknowledgement, anomaly return, paused-game restoration, and ending completion continue through their established owners.

## Screen and presentation review

Main Menu and mode selection retain their deployment console and protocol/checkpoint structure. Garage, Mod Collection, card dossiers, stores, profile selection, leaderboards, pause screens, rewards, and credits keep their current purpose and visual hierarchy. The fixes above address verified navigation and settings failures rather than restyling every screen.

Arena floor panels, obstacle faces and trims, bombsites, hazard telegraphs, pickups, explosion layers, shield/dash effects, boss warnings, and anomaly portals already share layered mechanical/neon presentation. Additional moving glows, world overlays, or stronger hazard lighting were not added: their readability and measured runtime behavior are valuable. HEIST retains its colder industrial identity; the shared decal palette is the presentation change there.

## Validation

Build and all **655 tests passed** after the code changes, including a deterministic floor-placement test over 60 seeds. The navigation fixture passed **34 real-browser checks**; the extended screen fixture passed **26 more**, including owned-card dossiers, Garage/Mod Collection returns, local-profile Continue, all Options tabs at 1280 x 720 and 960 x 600, and scrolling the camera setting fully into view.

All **128 layout/view comparisons passed**, including 108 accepted generated layouts, three authored hub-spoke rendering cases, nine HEIST views, and eight menu screens. Complete gameplay layout JSON remained identical. Accepted Arena layouts averaged **134.388 → 53.451 ms** of visual setup, a **60.2% reduction**. Renderer CPU averaged **0.420 → 0.452 ms/frame** with the refined graffiti; the maximum measured Arena layout renderer CPU was 0.706 ms/frame. This remains approximately **86% below the original pre-optimization renderer CPU cost**. These are layout renderer timings, not total frame time or an FPS percentage.

[Paired layout measurements](polish-layout-measurements.json) retain every case and regression result. Thirty-three final-code destruction/shutdown cycles verified release of **627 private GPU textures**, with no retained Text canvases or scene roots. The temporary stadium canvas texture was absent immediately after every construction. HEIST view renderer CPU ranged from 0.982 to 1.147 ms/frame; mean raw intervals across HEIST and menu samples remained approximately 16.66–16.67 ms. DOM-heavy screen costs are reflected in raw frame timing, not fully represented by Phaser renderer CPU. The final graffiti screenshots were reviewed at normal gameplay scale and across the full venue; selected floor marks remain subtle and leave the playfield readable.

The first final-code mixed run completed **normal rounds 1–12 in 222.9 seconds**, passing **171 gameplay assertions, 14 encounter retirements, and 12 disk-save comparisons**. It exercised all six Arcade types, two HEIST returns, three Pause/Options/Store visits, two bosses, physical rewards, and four Mod reveals. Mean smoothed Phaser deltas were 16.787 ms across the first four encounters and 16.956 ms across the last four. This assisted fixture preserves normal pressure limits and uses the same rank-three Mod setup, invulnerability, supplied ability energy, and accelerated outcomes described in the baseline audit.

The normal run's maximum raw Loading→Arena interval was **128.8 ms**; ordinary→boss introduction reached **155.7 ms**. HEIST entry reached 166.7 ms and return 57.4 ms. Options return intervals were at most 21.4 ms. A **318.1 ms first-debrief interval** remains separately recorded: its cause is unconfirmed and is not attributed to the layout bake. Per-call inclusive profile saving averaged 2.858 ms (max 3.7 ms); the storage write itself averaged 0.020 ms. These measured save costs did not dominate the setup latency.

The separate final-code late run completed **Supreme rounds 137–148 and the Centaurus ending in 484.8 seconds**, passing **194 gameplay assertions, 24 finale assertions, 16 encounter retirements, and 13 disk-save comparisons**. It used the exact preceding late fixture options, including its seeded test profile, regular Overdrive prerequisite, and starting highest round 136. Coverage included all six Arcade outcomes, two HEIST returns, three Pause/Options/Store visits, two ordinary bosses, and five Mod reveals. Golden Hunt completed early and contributed only 18 continuous frames; the other five events each supplied approximately eight seconds. This is not a sustained eight-second measurement of all six events.

| Observed late-run transition maximum | Previous layout pass | This pass |
| --- | ---: | ---: |
| Loading → Arena initialization | 267.8 ms | 154.6 ms |
| Encounter → boss introduction | 220.0 ms | 172.4 ms |

These are observed raw frame maxima from one pair of matched runs, not guaranteed latency ceilings. The corrected late run also recorded HEIST entry at 146.3 ms, HEIST return at 51.3 ms, Options return at 25.3 ms, and debrief entry at 107.0 ms. Synchronous initialization still produces visible hitches.

Continuous late-run raw frame means were **16.898 ms in Defense, 16.954 ms in Defusing, 16.722 ms in HEIST, and 16.669 ms in boss combat**. Their histogram p95 intervals were 19, 20, 18, and 17 ms respectively; histogram percentiles round upward to whole milliseconds. The longest Defense interval was 57.2 ms. All sustained gameplay analyzer budgets passed, including the 20 ms raw mean and 34 ms raw p95 checks for phases with at least 120 frames.

| Sustained ending sample | Raw mean frame interval | Raw p95 interval |
| --- | ---: | ---: |
| Centaurus ordinary, 40 seconds | 16.752 ms | 17.4 ms |
| Three bosses, first 20 seconds | 16.667 ms | 16.8 ms |
| Three bosses, second 20 seconds | 16.667 ms | 16.8 ms |
| Three bosses, third 20 seconds | 16.680 ms | 16.8 ms |
| Two bosses remaining, 20 seconds | 16.667 ms | 16.8 ms |
| One boss remaining, 20 seconds | 16.667 ms | 16.9 ms |

All three bosses remained alive and active throughout the 60-second sample, with player fire withheld. Completion stayed false after the first two deaths and persisted after the third. The authored credits, terminal debrief, actual Garage return, and independent browser reload preserved completion and Supreme highest round 148. The camera-shake toggle was verified to suppress and restore the actual helper, then its disabled preference survived the same reload in both normalized settings and disk storage. Combat measurements used camera shake enabled.

Across both gameplay runs, **24 ordinary rounds plus Centaurus passed 365 gameplay assertions, 24 finale assertions, 30 encounter retirements, and 25 disk-save comparisons**. All 25 quiescent checkpoints had zero Arena/HEIST Text canvas owners and stable resize/game/window/document listener counts of 21/21/18/14. The extra game listener belongs to the continuous frame recorder and is removed when the fixture finishes. These are assisted runtime checks, not unassisted campaign clears or a new consecutive round-68-to-148 soak. The matched setup diagnosis includes round 68, the layout sweep includes early/middle/late progression, and prior round-68 evidence remains in the linked audits.

The first normal debrief's 318.1 ms interval coincided with a recorded 310 ms long task. Five isolated debrief construction cycles after a fresh reload did not reproduce it: first construction took 11.3 ms, repeats took 4.1–5.1 ms, and the maximum observed frame interval was 17.1 ms. All five retired their visual roots and Text canvases. That fixture uses a synthetic first-round debrief payload and does not reproduce the complete preceding combat/reward/retirement workload. The original spike remains unresolved; these results do not identify its cause or establish that it is fixed.

[Compact validation measurements](polish-validation-measurements.json) retain both fixture configurations, gameplay analyses, all 60 menu/screen checks, texture lifetime results, the debrief follow-up, and reload verification. Raw gameplay evidence and analyses are [normal run](../artifacts/polish-mixed-normal.json), [normal analysis](../artifacts/polish-mixed-normal.summary.json), [late run](../artifacts/polish-mixed-late.json), and [late analysis](../artifacts/polish-mixed-late.summary.json).

The Canvas-only prototype passed 36 WebGL screenshot comparisons across all twelve visual families and zooms 1.0, 0.9, and 0.65. Its largest mean RGB difference was 0.737/255, with at most 0.328% of pixels differing by more than 40 in a channel. Native antialiasing accounts for differences; the comparison does not claim pixel identity. Graffiti changes are intentional and receive separate visual review.

## Remaining debt and recommended next work

1. Trace the first real combat-to-debrief completion, including browser garbage collection and preceding reward/retirement work, to locate the intermittent 318 ms spike. Isolated screen construction did not reproduce it.
2. Measure first deployment and transition latency on a slower integrated GPU/CPU. The current test machine cannot establish performance on every device, and synchronous setup is not eliminated.
3. Run a dedicated onboarding playtest with new keyboard and controller players. The tutorial registry currently interleaves live action gates and hard pauses across many mechanics before its separate HUD explanation. It has replay, skip, binding-aware prompts, and unavailable-action fallbacks, but the learning sequence and interruptions deserve focused design work. This pass does not claim a completed tutorial audit or unassisted first-run validation.
4. Audit Options resizing while already open and modal/scroll recovery across all compact viewports. Opening at supported compact sizes is checked here; rebuilding the full Options layout on arbitrary resize is separate work.
5. Make browser regression fixtures and baseline capture easier to reproduce from a fresh checkout. Raw WebGL screenshots and before-run artifacts are ignored local evidence; compact JSON and scripts are retained with the code.

Additional bounded debt: particle density remains an internal saved preference, with several VFX reading it at construction. Exposing it as a live control needs a parity pass. Options also schedules an extra persistence call after `setSettings` already saves; this small redundancy is retained here with the existing durability policy and should be measured during a dedicated settings-write cleanup.

Online leaderboard rendering and return navigation can be checked locally. Authenticated score submission, network failure recovery, physical controller hardware, and browser audio output need their respective integration/manual environments; this report does not imply those were exercised end to end.

## Reproduction and evidence

Use an isolated DEV test profile, Vite on port 5173, and an isolated WebGL browser with remote debugging on port 9225. The paired layout sweep used the same 1576 x 908 viewport at DPR 1 and normal 0.9 gameplay zoom as its baseline; Edge reported an NVIDIA GeForce RTX 5070 through ANGLE/Direct3D11. Run fixtures sequentially and do not edit imported modules during measurement.

```powershell
node scripts/run-layout-audit.mjs artifacts/polish-layout-after.json
node scripts/analyze-polish-layouts.mjs
node scripts/run-layout-audit.mjs artifacts/polish-lifetime.json ./verify-layout-lifetime.browser.js
node scripts/run-layout-audit.mjs artifacts/polish-menu-flows.json ./audit-menu-flows.browser.js
node scripts/run-layout-audit.mjs artifacts/polish-screen-details.json ./audit-screen-details.browser.js
```

The layout analyzer requires the preserved previous optimized baseline at `artifacts/layout-after.json`. Canvas-only art comparisons require the preserved renderer modules under `artifacts/polish-baseline/`; their [36-comparison result](../artifacts/polish-canvas-art.json) and the [final graffiti review](../artifacts/polish-art-review.json) are local evidence, not fresh-checkout prerequisites for building the game. The focused setup records are [before](../artifacts/polish-setup-before.json), [detailed diagnosis](../artifacts/polish-setup-detail.json), and [final code](../artifacts/polish-setup-after.json).

Repeat either gameplay fixture using its recorded options; replace `normal` with `late` in both the selector and output paths for the ending run:

```powershell
$fixture = (Get-Content docs/polish-validation-measurements.json -Raw | ConvertFrom-Json).normal
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/polish-mixed-normal.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/polish-mixed-normal.json --progression
```

After the late fixture, `node scripts/verify-polish-save.mjs` verifies the completed profile and camera setting across reload. The debrief follow-up runs with `node scripts/run-layout-audit.mjs artifacts/polish-debrief-setup.json ./audit-debrief-setup.browser.js`. Once all corresponding raw records and gameplay summaries exist, `node scripts/summarize-polish-validation.mjs` refreshes the compact validation record.

`npm.cmd run build` and `npm.cmd test` passed on the final production code: [build output](../artifacts/polish-build.txt), [655-test output](../artifacts/polish-tests.txt). Raw artifacts are ignored local evidence; the compact measurements and reproduction scripts are retained with the code.
