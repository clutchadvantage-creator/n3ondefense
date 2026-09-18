# Menu soundtrack and profile presentation

The out-of-run soundtrack now plays **Neon Serenity → Neon Dub Pulse → repeat**, beginning on Splash and retaining its track and playhead across Profile, Main Menu, Garage, Mod Collection, stores, currency exchange and Options. The two tracks are separate from the existing shuffled gameplay playlist.

The existing AudioManager owns the decision. Its single game observer consults RunTransitionManager's pending deployment, session registry and active/paused/sleeping world ownership. Results and round debrief retain gameplay audio; menus opened above a retained world cannot start the menu soundtrack. Returning to an out-of-run menu restores the retained menu playhead. HEIST keeps its dedicated recording and resumes the gameplay track when it ends.

Music uses the existing master/music controls. Starts fade in over 250 ms, and natural track endings fade out over 250 ms. Context changes pause the outgoing voice before the replacement starts; there is no overlapping crossfade. Retired track callbacks cannot advance another playlist, missing assets stop after one failed deck, and blocked autoplay retries on interaction. Playback request generations also prevent a delayed callback from an earlier visit from changing current playback. Two regression tests reproduced the pending-HEIST and reused-voice races before their corrections.

The normal Splash Continue route now opens a separate **two-second Profile presentation**. A single large tank uses the existing authored enemy drawing commands, baked into one private 1152 × 1152 RenderTexture. The background is dark, with a staged progress bar and four short status messages. Profile's DOM is mounted at handoff, not underneath the presentation. The existing once-per-session Splash skip and Options replay return routes are preserved. Combat Loading, deployment confirmation, saves, difficulty and encounter ownership are unchanged.

The private portrait represents approximately 5.06 MiB of RGBA pixel storage, not total GPU memory. Its temporary Graphics source is immediately destroyed. Scene shutdown releases the portrait and text. There are no new presentation timers, combat enemies or persistent artwork caches.

## Validation

- Build and all **685 tests passed**, including six executable music ownership/playback tests. The production controllers are exercised with controllable media promises for autoplay rejection, stale callbacks, deck failures, retained worlds and cleanup.
- **53 real-browser presentation checks passed**. The normal Splash-to-Profile interval measured **2061 ms**. Checks covered loaded/advancing audio, both natural track endings (by seeking near the end), menu continuity, the actual Options volume control, Arena deployment, paused Options, HEIST audio ownership, actual quit, twelve rapid menu changes, and the shared controller resolver's Splash Continue route.
- Four interrupted presentation cycles at 1280 × 720 and 960 × 600 verified that the formerly live private GPU texture was invalid after shutdown, with zero retained Text canvases or scene roots. Screenshots were reviewed at the normal and compact sizes.
- **11 additional browser checks passed** through actual player-death and bomb-defused Results routes. Results retained gameplay music; Main Menu restored menu music. Opening the store after defeat also correctly entered the out-of-run soundtrack state.
- The final production code completed assisted **normal rounds 1–12 in 222.6 seconds**, passing **171 gameplay assertions, 14 encounter retirements and 12 disk-save comparisons**. Coverage included all six Arcade events, two HEIST returns, three Pause/Options/Store cycles, two bosses and four independent Mod reveals. All twelve quiescent checkpoints retained stable listeners and no Arena/HEIST Text canvases.

Continuous raw means were **16.660 ms in Defense, 16.708 ms in Defusing, 16.658 ms in HEIST and 16.666 ms in boss combat**, each with a 17 ms histogram p95. The maximum Defense interval was 38.7 ms. All sustained analyzer budgets passed; these measurements do not claim hitch-free transitions or performance on every device.

The preceding [HUD validation](hud-information-audit.md) additionally completed Supreme rounds 137–148 and Centaurus with the final HUD rendering code, before the menu soundtrack changes. That ending run is preserved separately rather than described as a new combined-code ending soak. Mod reveal/celebration presentation remains independent of the notification panel.

The browser checks ran in isolated headless Edge with WebGL on the existing RTX 5070 test machine. The normal presentation viewport was 1528 × 811 at DPR 1; the compact checks explicitly resized the canvas. Automatic playback was enabled in this test browser. Autoplay rejection/retry was tested with controlled promises; actual browser policy still determines whether a gesture is required. Playback state was verified, not audible speaker output. Controller checks used the shared focus/action resolver, not physical hardware. No captured runtime errors occurred in the successful fixtures.

## Reproduction

Use an isolated DEV browser/profile with remote debugging on port 9225 and Vite on 5173. Run fixtures sequentially and avoid editing imported modules during gameplay measurements. The cold-boot runner resets only the isolated browser's Splash session flag and reloads before waiting for Splash:

```powershell
node scripts/run-menu-presentation.mjs
node scripts/run-layout-audit.mjs artifacts/menu-return-browser.json ./audit-menu-return.browser.js
$fixture = (Get-Content docs/menu-presentation-measurements.json -Raw | ConvertFrom-Json).normal
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/menu-hud-final-normal.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/menu-hud-final-normal.json --progression
node scripts/summarize-menu-presentation.mjs
```

[Compact measurements](menu-presentation-measurements.json) retain the exact fixture options, all 64 browser checks and gameplay analysis. Raw reports, screenshots and build/test output under `artifacts/` are ignored local evidence. Earlier draft browser assertions and the pre-correction music race test failures are not counted as passing final validation.
