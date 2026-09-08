# Layout performance audit

This extends the [round 68 investigation](round-68-investigation.md) and [endgame validation](endgame-validation.md) to the shared layout renderer, early and middle progression, and noncombat screens. The completed layout sweep reduced average Arena layout renderer CPU from **3.251 to 0.420 ms per frame**, about **87%**, without changing accepted geometry, combat budgets, or the authored art commands. Both live mixed-gameplay runs and the Centaurus ending passed validation. Brief initialization hitches remain and are quantified below.

## Cause and correction

The wall cache already applies to every Arena layout, including boss arenas. Four other pieces of unchanged artwork still replayed Graphics paths every frame: perimeter indicator circles, narrow venue light strips, graffiti paint, and detailed obstacle faces. In the baseline, these repeatedly paid for path processing and triangulation even when nothing in their geometry changed. The cost consumed combat headroom on both sparse and dense maps.

The renderer now caches these shapes in small textures at their original world positions and depths. Perimeter indicators share one texture; venue strips share two color textures and retain the existing pulse animation and additive blending. Each obstacle retains its complete face, outline, hardware, and contact shadow. Graffiti retains its Text object, typography, rotation, and opacity, with its unchanged paint layer cached separately.

Small caches render at twice their display resolution to preserve smooth edges. A native-resolution draft showed rougher circular edges during visual review and was replaced before final validation. The change adds no world-sized decoration layer: the largest tested additional texture area was **973,600 pixels**, approximately **3.71 MiB of RGBA storage**. This is texture pixel storage, not a measurement of total GPU memory.

`bakeStaticGraphics.ts` is a drawing helper, not a lifetime manager. Callers attach each result to the existing scene or container owner. Temporary Graphics are destroyed immediately, including error paths. Existing encounter destruction and Phaser scene shutdown release the private RenderTextures. No cache of past layouts, new encounter owner, visual quality setting, difficulty reduction, or capacity limit was added.

## Layout and screen coverage

The before/after WebGL sweep used the same 1576 x 908 Edge viewport at DPR 1 and the normal 0.9 gameplay camera zoom. The isolated browser reported an NVIDIA GeForce RTX 5070 through ANGLE/Direct3D11. The sweep requested all 12 Arena archetypes with three seeds at rounds 1, 30, and 148: **108 actual generated layouts**. Each case used the real generator, validator, and renderer; the analyzer confirmed that the complete generated layout was identical before and after.

Generation can choose a validated fallback, so requested and accepted archetypes are recorded separately. All sampled hub-spoke requests fell back, including a separate search of seeds 1 through 120. Its radial artwork was therefore measured in **three explicitly labeled authored-draft rendering cases**, without changing production validation or claiming that these drafts were accepted gameplay layouts. Together these checks cover all 12 visual families.

| Accepted visual family | Cases | Before renderer CPU | After renderer CPU |
| --- | ---: | ---: | ---: |
| Open field | 12 | 3.471 ms | 0.363 ms |
| Islands | 17 | 3.251 ms | 0.555 ms |
| Split | 21 | 3.111 ms | 0.353 ms |
| Fortress | 8 | 3.277 ms | 0.356 ms |
| Ring | 9 | 3.332 ms | 0.396 ms |
| Canyon | 5 | 3.234 ms | 0.357 ms |
| Maze | 9 | 3.061 ms | 0.360 ms |
| Chambers | 3 | 3.328 ms | 0.554 ms |
| Asymmetric clusters | 9 | 3.265 ms | 0.601 ms |
| Perimeter | 9 | 3.366 ms | 0.365 ms |
| Crossroads | 6 | 3.203 ms | 0.390 ms |
| Hub-spoke artwork, authored draft | 3 | 3.197 ms | 0.349 ms |

The sweep also sampled **nine HEIST views** across three seeds: entry, vault, and escape, with normal facility presentation updates. Their renderer CPU remained approximately **1.04-1.21 ms per frame**. HEIST keeps its existing cached tiles and walls.

Eight major screens were sampled: Main Menu, Garage, Options, Upgrade Store, Cosmetics Store, Mod Collection, Leaderboards, and Local Profiles. Mean raw frame intervals stayed approximately **16.66-16.67 ms**. The most expensive Phaser screen was Mod Collection at 2.82 ms of renderer CPU. Upgrade Store, Cosmetics Store, and Local Profiles primarily render DOM content, so their small Phaser CPU numbers are not total browser rendering costs. Their DOM content was mounted during sampling and retired to the same 23-node baseline after shutdown.

All **128 paired layout/view comparisons passed**. These are 1.2-second samples after settling, designed to isolate repeatable layout draw costs. They do not replace sustained combat and transition checks.

## Artwork and resource checks

The actual WebGL output was compared against preserved pre-change renderer sources at zoom 1.0, 0.9, and 0.65, with ambient opacity held constant. All **36 comparisons** across the 12 visual families passed. The largest mean RGB channel difference was **0.164 on a 0-255 scale**; the largest fraction of pixels differing by more than 40 in a channel was 0.211%. These comparisons allow rasterization differences; they do not claim pixel identity. Before/after screenshots were also reviewed for clipping, shadows, lettering, and circular edges.

A separate 33-cycle check exercised both explicit encounter destruction and Phaser scene shutdown. It verified that **618 previously live private GPU textures** were no longer valid WebGL textures after retirement. Every cycle also left zero scene roots and zero Text canvas owners. All 108 generated-layout cases separately verified that renderer destruction left no visual roots or canvas owners.

The resource and artwork results are preserved in [layout-resource-and-art-checks.json](layout-resource-and-art-checks.json). The paired measurements and regression checks are in [layout-cost-measurements.json](layout-cost-measurements.json).

## Live gameplay validation

Both gameplay fixtures use seed 550055, five rank-three Mods, ordinary pressure limits, armed bombs, deployables, special ammo, and overlapping hazards. Player invulnerability, replenished placement energy, assisted defuser kills, and accelerated event/boss outcomes are test controls. The late fixture starts a separate test profile with the regular Overdrive prerequisite and Supreme highest round 136, then actually completes 137-148 before launching Centaurus. These are assisted runtime checks rather than unassisted campaign clears.

The final-code normal run completed **rounds 1-32 uninterrupted in 587.5 seconds**. Its analyzer passed **419 gameplay assertions, 38 encounter-retirement boundaries, and 32 disk-save comparisons**. It exercised all six Arcade event types across 16 event appearances, four HEIST returns, eight Pause/Options/Store cycles, six ordinary bosses, physical boss rewards, and 11 Mod reveals. Every quiescent checkpoint had zero Arena/HEIST canvas owners and stable resize/game/window/document listener counts of 21/20/18/14.

With the enhanced combat fixture, ordinary encounter frame means ranged from **16.666 to 19.342 ms**. The first 11 encounters averaged 16.986 ms per frame and the final 11 averaged 17.439 ms as normal-round difficulty increased. The later sustained windows at rounds 1, 16, and 32 averaged **16.667, 16.722, and 16.722 ms** respectively. These results passed the existing progression performance checks; the initial overlap can still exceed a 16.67 ms frame budget.

A separate final-code run completed **Supreme rounds 137-148 and the Centaurus ending uninterrupted in 483.3 seconds**. It passed **194 gameplay assertions, 24 finale assertions, 16 encounter-retirement boundaries, and 13 disk-save comparisons**. Coverage included eight-second samples of all six Arcade events, two HEIST returns, three Pause/Options/Store cycles, and two ordinary bosses before the finale. Its 13 quiescent checkpoints retained no Arena/HEIST canvas owners, with listener counts fixed at 21/21/18/14; the extra game listener was the continuous frame recorder, which was removed when the fixture finished.

Late ordinary encounter means ranged from **16.694 to 17.646 ms per frame**. The first four encounters averaged 17.104 ms and the last four averaged 16.962 ms. Round 148's first ten seconds averaged 16.722 ms; its next twenty seconds averaged 16.821 ms.

| Sustained terminal sample | Mean frame interval | Raw p95 interval |
| --- | ---: | ---: |
| Centaurus ordinary, 40 seconds | 16.799 ms | 18.0 ms |
| Three bosses, first 20 seconds | 16.666 ms | 16.8 ms |
| Three bosses, second 20 seconds | 16.667 ms | 16.9 ms |
| Three bosses, third 20 seconds | 16.694 ms | 16.9 ms |
| Two bosses remaining, 20 seconds | 16.666 ms | 16.8 ms |
| One boss remaining, 20 seconds | 16.667 ms | 16.9 ms |

The three bosses remained alive and active for the full 60-second sample, with player fire withheld during that sample. Completion stayed false after the first two boss deaths and persisted after the third. The authored credits, terminal debrief, actual Garage action, and an independent browser reload all preserved completion and Supreme highest round 148.

Continuous raw frame recording also covered the work between focused samples. The six Arcade phases averaged **16.667-16.914 ms**, with p95 intervals of 17-19 ms. HEIST averaged **16.777 ms**, and credits averaged **16.664 ms**. Active defense/defusing phases averaged 16.896/16.986 ms, with p95 intervals of 19/20 ms. Individual hitches remain: the longest recorded boss-combat interval was **57.6 ms**, despite its 17 ms p95. The analyzer passed all sustained gameplay budgets.

Across the two clean runs, this is **44 ordinary rounds plus Centaurus, 613 gameplay assertions, 24 finale assertions, 54 encounter retirements, and 45 save comparisons**. [Compact gameplay measurements](layout-gameplay-measurements.json) include the complete phase distributions and reload verification. Raw evidence and analyses are [normal gameplay](../artifacts/layout-mixed-normal.json), [normal analysis](../artifacts/layout-mixed-normal.summary.json), [late gameplay and finale](../artifacts/layout-mixed-late.json), and [late analysis](../artifacts/layout-mixed-late.summary.json).

A setup attempt overlapped the final 2.6 seconds of the separate texture-lifetime fixture with the start of combat. That five-round attempt is excluded from performance validation and retained as `artifacts/layout-mixed-setup-excluded.json`. Both browser runners now reject starting while another fixture is active.

## Setup costs and practical limits

The improvement targets work repeated during gameplay. Baking still has a setup cost inside the existing encounter initialization/Loading flow. Arena visual construction averaged **121.4 ms before and 134.4 ms after**, with corrected cases ranging from 111.4 to 172.5 ms. The small caches add roughly 13 ms once per encounter while saving roughly 2.83 ms on each rendered frame. Generation itself took 0.4-12.1 ms in the corrected sweep. These are CPU timings on the test machine, not GPU timer measurements.

The continuous late run observed a **267.8 ms** maximum interval when moving from Loading into Arena initialization, and **220.0 ms** when replacing an ordinary encounter with a boss introduction. Those isolated setup intervals are retained in the evidence. They are not the repeated layout-rendering cost addressed by this change, and the results do not claim that scene changes are hitch-free.

The evidence supports stable layout costs in the measured cases. It does not establish hitch-free transitions, every possible seed/loadout combination, or 60 FPS on every device. Raw frame intervals, smoothed Phaser deltas, layout renderer CPU, and setup CPU are kept distinct in the evidence.

## Reproduction

Use an isolated DEV browser with WebGL, a test profile, remote debugging on port 9225, and Vite on port 5173. Do not run multiple browser fixtures together or edit imported production modules during a measurement.

```powershell
node scripts/run-layout-audit.mjs artifacts/layout-after.json
node scripts/analyze-layout-audit.mjs artifacts/layout-before.json artifacts/layout-after.json
node scripts/run-layout-audit.mjs artifacts/layout-art-final.json ./verify-layout-art.browser.js
node scripts/run-layout-audit.mjs artifacts/layout-lifetime.json ./verify-layout-lifetime.browser.js
```

The comparison commands use the preserved before-run JSON and baseline renderer modules in `artifacts/layout-baseline/`. Raw reports and screenshots under `artifacts/` are local ignored evidence; compact measurements under `docs/` are retained with the code. The layout analyzer checks geometry equality, relative renderer cost, raw frame regression, retirement, all 12 visual families, and a 4 MiB allowance for additional small-art RGBA pixels. These are verification budgets, not runtime limits or reduced gameplay settings.

The live gameplay runners additionally exercise the existing generation, save, reward, physics, and listener checks. The late run's continuous frame analyzer checks sustained gameplay phases with at least 120 frames against a 20 ms raw mean and a 34 ms raw p95; histogram percentiles round upward to whole milliseconds. Initialization and phase-change intervals remain visible in the report rather than being treated as combat frames.

To repeat either recorded gameplay fixture, take its exact options from the compact measurements (replace `normal` with `late` for the ending run):

```powershell
$fixture = (Get-Content docs/layout-gameplay-measurements.json -Raw | ConvertFrom-Json).normal
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/layout-mixed-normal.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/layout-mixed-normal.json --progression
```

Build and all **654 tests passed** after the final rendering changes: [build output](../artifacts/layout-build.txt), [test output](../artifacts/layout-tests.txt).
