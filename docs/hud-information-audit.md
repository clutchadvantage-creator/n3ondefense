# HUD information and notification audit

Non-Mod announcements, weekly challenge completions, Arcade objectives and results, Redline telemetry, and anomaly charging/entry prompts now share one reusable angular panel. Live event rows remain readable while a temporary notice is displayed. Mod card reveals, celebrations, Supreme acknowledgements, and Mod-specific presentation remain independent.

The bounded queue holds at most 12 pending notices, preserves equal-priority ordering, suppresses repeats, and retires with its encounter. Weekly completion observes pending combat progress without granting rewards or forcing per-kill saves. Future anomaly types can use the same notification API; the Sky Breach fixture payload does not implement that event.

Hazard countdowns remain a separate tactical feed. Options exposes visibility and Small/Medium/Large text, defaulting to visible/Medium. Health, energy, bomb objectives and event entry prompts remain available when that feed is disabled. Compact screens use two columns with a 24-pixel outer margin. The final correction fixes a two-pixel inset failure found at 960 × 600.

The final focused browser fixture passed **72 checks**, including live combat weekly completion, queue reuse, simultaneous Arcade/anomaly state, preserved Mod presentation, mouse/controller settings, 1552 × 903 / 1280 × 720 / 960 × 600 layouts, encounter replacement and shutdown. Independent reload verified Tactical OFF/Large in both normalized settings and disk storage. Screenshot review covered the compact layout and Options controls. The fixture now checks profile creation explicitly; its former name exceeded the profile length limit and could silently reuse an existing profile.

The final HUD code completed assisted Supreme rounds **137–148 plus Centaurus in 489.6 seconds**. The analyzer passed **194 gameplay checks, 24 finale checks, 16 retirement boundaries and 13 disk-save comparisons**. Coverage included all six Arcade types, two HEIST visits, three Pause/Options/Store cycles, two ordinary bosses, and seven Mod reveals. All 13 quiescent checkpoints retained stable listeners and no Arena/HEIST Text canvases. Defense/Defusing raw means were 16.693/16.706 ms, both with 17 ms histogram p95. The three consecutive 20-second three-boss samples averaged 16.667, 16.666 and 16.680 ms. These are assisted runtime checks on the existing test machine, not an unassisted campaign clear or a new round-68-to-148 soak.

Build passed. At this boundary, 678 of 679 tests passed; the sole failure was the asset registry expecting the two queued menu tracks, addressed by the following [menu presentation pass](menu-presentation-audit.md). That completed pass passed all 685 tests and a combined-code twelve-round normal run. The earlier six-round normal run omitted three Arcade types and is not claimed as a passing full-coverage run.

[Compact evidence](hud-information-measurements.json) retains the focused checks, reload record, exact late fixture options and gameplay analysis. Raw ignored evidence: `artifacts/hud-information-browser.json`, `artifacts/hud-final-late.json`, and its `.summary.json`. Run fixtures sequentially in an isolated DEV browser on port 9225, with Vite on 5173:

```powershell
node scripts/run-layout-audit.mjs artifacts/hud-information-browser.json ./audit-hud-information.browser.js
node scripts/verify-hud-save.mjs
$fixture = (Get-Content docs/hud-information-measurements.json -Raw | ConvertFrom-Json).late
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/hud-final-late.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/hud-final-late.json --progression
```
