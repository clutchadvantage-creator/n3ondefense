# LYRA communications, training, and recorded voice

LYRA now uses the existing tutorial, action events, notification console, profile saves, input presentation, and music mixer. The first-run route teaches the core loop in round 1, defensive abilities in round 2, and releases the player into normal operation in round 3. The 17 supplied recordings are registered, and the default keyboard/mouse instructions derive from their exact supplied transcripts. The game also uses `public/ndfavicon.png` as its favicon, including relative-path builds.

## Existing systems retained

`TutorialDirector`, `TutorialRegistry`, `TutorialEventBus`, and the existing overlay already supplied persistent action gates, skipping, replay, binding-aware prompts, target highlighting, and unavailable-action fallbacks. Those remain the owners of teaching progress. Arena's round lifecycle and Loading own deployment; LYRA does not introduce another simulation or transition owner. `HudInformationSystem` remains the combat notification destination, `AudioManager` owns music gain, and the existing profile/save validator owns persistence.

Mod drops, reveals, celebrations, Supreme reveals, and acknowledgements remain independent. LYRA is suppressed during their presentation. Contextual explanations of recalibration and infusion occur at their existing menu actions; they do not replace Mod presentations or misrepresent infusion as a stat upgrade.

## Communications and voice

`src/game/lyra/LyraRegistry.ts` contains stable message IDs and data for mode, priority, scene restrictions, expiry, cooldown, once policies, and ambient weighting. Tutorial entries are derived from the existing tutorial registry. Modes are GUIDANCE, TACTICAL, WARNING, SYSTEM, EVENT, AMBIENT, and reserved NARRATIVE. Priority descends from critical warnings through required teaching, tactical information, events, contextual help, system messages, and ambient comments.

`LyraQueue.ts` bounds pending messages to 12, expires obsolete messages, suppresses repeats, and cancels active/pending communications at unsafe scene boundaries. Required teaching suppresses optional context and ambient chatter. Low-health and defusing warnings depend on actual state and are cancelled when that state resolves. Queue interruptions cancel the previous voice before starting another.

`LyraComms.ts` selects local recorded audio first, enabled local browser speech second, and text last. Provider callbacks are guarded against late completion after cancellation. Missing resources, playback failures, unavailable voices, and missing start/end callbacks cannot strand the queue or ducked music. Recordings use their decoded duration for the playback watchdog; the longest supplied line is 35.43 seconds and is not cut off by the former shorter timeout.

`LyraVoiceProviders.ts` keeps file playback, browser speech, and text independent. Browser speech uses only voices identified by the browser as local. Voice-name preferences are configurable, with locale and English fallbacks; no particular installed voice is required. The isolated Windows/Edge browser selected **Microsoft Zira - English (United States)**, a local `en-US` voice, and real speech-start events were observed. Automated checks do not constitute a human listening review.

`LyraTutorialScript.ts` is the canonical source of the 17 supplied filenames and exact transcripts. `TutorialCopy.ts` resolves control tokens into prose and compact input chips separately. Default controls reproduce the authored script, including “LEFT MOUSE BUTTON,” “MIDDLE MOUSE BUTTON,” and “SPACE BAR.” When a controller or remapped binding changes an instruction, an exact transcript guard prevents the default-control recording from speaking the wrong button. The accurate instruction uses local TTS or text instead. Switching devices during a step updates both presentation and speech. Completing an action advances immediately and cancels the remaining line; the player is not forced to wait through a joke or recording.

Important speech smoothly ducks music, with less reduction for warnings and none for ambient lines. It leaves individual combat SFX gain intact and restores music when speech ends, is interrupted, or its scene retires. In combat, subtitles use the shared notification console. Required tutorial text remains visible even when optional voice and subtitles are disabled. Live tutorial instructions do not consume combat pointer input.

## Teaching and contextual guidance

- Round 1: meet LYRA, preview monitor, Start Local, Arena introduction, movement, aiming, firing, Health/Energy, planting, and first hostile contact. Movement completion requires actual displacement rather than merely holding a direction.
- Round 2: shield, dash, mines, electric fences, turrets, and a short field-awareness acknowledgement. Existing actual ability/placement events advance the gates.
- Round 3: the supplied calibration-complete line and release into ordinary play. Existing debrief/Loading paths continue between training rounds.
- Contextual teaching: first pickup, anomaly access, Arcade objective, active security hazard, recalibration, infusion, and Supreme availability. Planting and Arcade outcomes have separate tactical/event messages; health and disarm warnings observe live state.
- Ambient foundation: three short Garage/store lines, weighted choice, recent-history suppression, 15-minute per-line cooldown, and randomized 3–6-minute scheduling attempts during safe downtime. Required guidance and unsafe contexts suppress them.

HUD highlighting projects the actual target bounds through the camera before converting them to overlay coordinates. This corrects the ability highlight under the existing inverse-zoom HUD root and retains responsive placement. Compact screenshot review also found that a CSS display rule overrode the Continue button's `hidden` attribute on action-gated steps. Hidden tutorial elements now remain hidden, so live steps show the required action without a misleading Continue control.

The Supreme monitor supports a local muted video, explicit playback, Continue/Skip, and media cleanup. Until the user supplies the separate recording, it shows a readable tactical briefing. Place that file in **`public/assets/video/lyra/`**, then set `LYRA_ADVANCED_PREVIEW` to its public-relative path. No footage or broken media URL is fabricated.

## Settings, saves, and development tools

Options → Audio exposes LYRA voice, volume, local browser TTS, subtitles, music ducking, and ambient comments. The existing contextual-guidance preference remains in Gameplay. Settings normalize safely for old saves and preserve unrelated mixer channels.

Tutorial schema version 3 is retained with an optional curriculum marker, completed training-round count, and delivered contextual-message IDs. Fresh profiles receive curriculum 4; existing profiles without the marker retain their existing route and are not enrolled in mandatory new training. Hints become permanently seen only after their reading/playback window completes. Replay uses the existing Options flow without resetting progression or currency. Starting a run or replaying after defeat resets the communications queue's once-per-run history.

The DEV-only LYRA panel lists installed local voices; configures voice, rate, and pitch; previews a message by ID through the provider chain, recorded provider, or TTS; inspects context/queue/provider; forces safe ambient chatter; resets cooldowns/seen hints; and replays or resets training while preserving progression. Local development preferences are separate from gameplay content. The panel is dynamically imported only in DEV and does not appear in production.

The application adapter installs one event-bus subscription and one lightweight poststep adapter. Expensive DOM/settings work is limited to four checks per second. Scene shutdown/pause/sleep, profile changes, document visibility, and application disposal cancel communications; listener teardown and pending DEV imports are guarded. No new recurring Graphics effects or world textures are introduced.

## Adding content

1. Add a stable ID and message definition to `LYRA_MESSAGES` in `LyraRegistry.ts`, including its mode, priority, valid scenes, and repeat/expiry policy.
2. Trigger that ID from an existing authoritative game event or scene adapter. Keep prose out of gameplay handlers.
3. Place original recordings beneath `public/assets/audio/lyra/` (optional `tutorial/`, `warnings/`, `events/`, `system/`, `ambient/`, or `anomalies/` folders), then add the locale/ID/path to `LYRA_RECORDINGS`. For these 17 tutorial lines, edit the single canonical entry in `LyraTutorialScript.ts` instead.
4. For control-specific recordings, retain the exact recorded transcript so changed bindings fall back correctly. Additional languages can use stable IDs and locale manifests; full localization is not implemented.
5. Restart Vite after adding audio files: this project's audio-directory watcher is deliberately disabled to avoid Windows file-lock errors. Preview the line in the DEV panel from a safe menu or Garage.

## Validation

Both standard and itch builds and all **705 tests pass**. Sixteen focused LYRA unit tests cover priorities, interruptions, expiry, bounded queues, cooldown/seen policies, unavailable providers, asynchronous voice discovery, cancelled callbacks, failed-recording cleanup, settings normalization, existing-profile compatibility, round pacing, and transcript/control parity.

The browser fixtures pass **159 checks**: 59 tutorial/provider checks, 59 supplied-recording checks, 22 menu/settings checks, and 19 defeat/replay checks. They exercise the real Start Local and deployment controls, the first two round handoffs, third-round release, actual shield/dash/placement methods, input-presentation switching, voice/text settings, music ducking, Mod reveal suppression, missing audio, ambient interruption, saved hint history, and replay without currency/progression resets. The focused hostile-contact check applies real enemy damage and emits its tutorial signal; it is not itself an end-to-end projectile-collision check. Sustained gameplay is tested separately.

All 17 files decode and start through the recorded provider. Default-control text matches every supplied transcript. The longest recording, `lyratrainingcomplete.mp3`, has a decoded duration of **35.434 seconds** and observed playback of **35.467 seconds**. Both controller and remapped shield instructions select accurate local speech instead of the mismatched recording. The real welcome overlay selects the supplied welcome recording. The favicon check verifies the link and actual PNG response; standard and itch output resolve the correct absolute/relative asset paths.

All **34 full-transcript layout cases** pass at actual browser viewports of 1280 × 720 and 960 × 600. Text fits without clipping or scrolling, hidden controls remain unrendered, and retirement returns to the menu's existing hidden tutorial-owner baseline. Full-browser screenshots were reviewed for the welcome/preview, mine instruction, and long completion text. These rendering cases use the real overlay with synthetic target positions; the integrated tutorial fixture separately verifies shield highlight projection against actual HUD bounds at both sizes.

Two actual defeat/replay cycles cover three deployment attempts. Active warning speech, pending communications, and music ducking clear on defeat; the actual Replay Local and deployment controls start the next attempt; a run-once fixture message becomes eligible again. Scene listener counts and the single menu communications owner remain stable. An independent reload preserves nondefault LYRA settings and completed-hint history in both normalized runtime state and disk storage.

The gameplay runs use the preceding combat-behavior fixture options and seed 550055, with LYRA voice, subtitles, and local TTS enabled. The isolated Edge/WebGL browser uses a 1528 × 811 viewport at DPR 1 and reports an NVIDIA GeForce RTX 5070 through ANGLE/Direct3D11. Training is marked complete for these combat measurements; its integration is checked by the separate tutorial fixture.

| Assisted gameplay run | Duration | Gameplay assertions | Encounter retirements | Disk-save comparisons |
| --- | ---: | ---: | ---: | ---: |
| Normal rounds 1–12 | 217.7 s | 171 | 14 | 12 |
| Supreme rounds 137–148 plus Centaurus | 493.2 s | 194 | 16 | 13 |

Both runs cover all six Arcade event types, two HEIST returns apiece, three Pause/Options/Store visits apiece, and two ordinary bosses apiece. The late run includes approximately eight seconds of every Arcade type and **24 additional finale assertions**. All sustained gameplay budgets pass, including the continuous phase checks against a 20 ms raw mean and 34 ms raw p95 for phases with at least 120 frames.

| Continuous phase | Normal raw mean / p95 | Late raw mean / p95 |
| --- | ---: | ---: |
| Defense | 16.787 / 18 ms | 16.779 / 18 ms |
| Defusing | 16.822 / 19 ms | 16.866 / 18 ms |
| HEIST | 16.667 / 17 ms | 16.652 / 17 ms |
| Boss combat | 16.667 / 17 ms | 16.669 / 17 ms |

Histogram p95 intervals round upward to whole milliseconds. These are raw frame intervals, not Phaser's smoothed deltas or isolated renderer CPU timings. Late Arcade means range from 16.650 to 16.736 ms. The longest recorded late Defusing interval is 40.0 ms despite its 18 ms p95; passing the sustained budget does not mean every frame meets 16.67 ms.

Centaurus ordinary combat's 40-second sample averages **16.707 ms**, raw p95 **17.1 ms**. Three successive 20-second samples with all three bosses alive average **16.667, 16.666, and 16.681 ms**, each with a 17.0 ms raw p95. Two-boss and one-boss samples average **16.666 and 16.667 ms**. Player fire is withheld during the three-boss sample. Completion remains false after the first two deaths, then persists after the third through credits, terminal debrief, the actual Garage action, and an independent browser reload. Supreme highest round remains 148, and delivered LYRA hints and settings survive that reload.

All 25 quiescent checkpoints retain no Arena/HEIST Text canvas owners. Within each run, resize/game/window/document listener counts stay fixed: **22/26/19/17** in normal and **22/26/22/17** in late. These are separate browser sessions and include the fixture's instrumentation; the evidence supports no accumulation within either run, not identical session baselines. All 30 encounter retirements pass the existing ownership checks.

Setup hitches remain visible. The maximum normal HEIST entry interval is **330.9 ms**; the late run records **210.1 ms** for HEIST entry, **156.7 ms** entering boss introduction, and **155.3 ms** from Loading into Arena. The harness's direct initial Arena construction from Splash takes 239.8/238.6 ms in normal/late. These are observed intervals, not latency ceilings or proof that LYRA caused the setup cost. This pass does not claim hitch-free transitions.

The normal run preceded the isolated replay-after-fail history-reset correction; that path is covered by the dedicated retry fixture. Both gameplay runs preceded the final tutorial-only hidden-control CSS correction. The tutorial and all compact cases were rerun after that correction, and both builds and tests were rerun. The combat fixtures have training completed, so the corrected tutorial control is absent from their measured play.

[Compact validation measurements](lyra-validation-measurements.json) retain configurations, assertions, provider evidence, phase timing, and reload records. Local raw evidence includes [normal gameplay](../artifacts/lyra-normal.json), [normal analysis](../artifacts/lyra-normal.summary.json), [late gameplay](../artifacts/lyra-late.json), [late analysis](../artifacts/lyra-late.summary.json), [recordings](../artifacts/lyra-recordings.json), [compact layouts](../artifacts/lyra-compact.json), and [ending reload](../artifacts/lyra-ending-reload.json).

## Limits and deferred work

The supplied transcripts are the source of truth; files were decoded and playback was exercised, but this pass does not claim a human transcription or listening audit. Physical controller hardware, voice quality on other operating systems, and unassisted first-time-player learning still need manual evaluation. Controller presentation switching and remapped-control fallback were exercised programmatically.

The supplied Supreme video remains pending. Its missing-media presentation is tested; playback of that future asset cannot be verified yet. No live cloud TTS service, API key, remote speech dependency, or full localization system was added.

The assisted gameplay fixtures retain normal combat pressure but use invulnerability, supplied energy, assisted defuser kills, and accelerated event/boss outcomes. They cannot establish performance on every device, every loadout, or every possible seed, and they are not a new uninterrupted round-68-through-148 campaign. Synchronous setup hitches remain a separate previously documented limitation.

## Principal files and reproduction

Core: `src/game/lyra/{LyraTypes,LyraQueue,LyraRegistry,LyraTutorialScript,LyraVoiceProviders,LyraComms,installLyra,LyraDevPanel}.ts`.

Teaching: `src/game/tutorial/{TutorialRegistry,TutorialDirector,TutorialOverlay,TutorialCopy,TutorialProgress,TutorialTypes}.ts`; Arena/Main Menu/Loading integration; HUD target projection and notification presentation; Options and `AudioManager`; save types/validator/defaults; `src/style.css`; application installation; asset READMEs and `index.html`.

Use an isolated DEV test profile, Vite on port 5173, and WebGL Edge with remote debugging on port 9225. Run browser fixtures sequentially, reload between independent fixtures, and do not edit imported production modules during measurement.

```powershell
npm.cmd run build
npm.cmd run build:itch
npm.cmd test
node scripts/run-layout-audit.mjs artifacts/lyra-browser.json ./audit-lyra.browser.js
node scripts/run-layout-audit.mjs artifacts/lyra-recordings.json ./audit-lyra-recordings.browser.js
node scripts/run-layout-audit.mjs artifacts/lyra-extras.json ./audit-lyra-extras.browser.js
node scripts/verify-lyra-save.mjs artifacts/lyra-settings-reload.json
node scripts/run-layout-audit.mjs artifacts/lyra-retry.json ./audit-lyra-retry.browser.js
node scripts/audit-lyra-compact.mjs
```

For normal or late gameplay, use the exact retained fixture options (replace `normal` with `late` for the ending):

```powershell
$fixture = (Get-Content docs/lyra-validation-measurements.json -Raw | ConvertFrom-Json).normal
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/lyra-normal.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/lyra-normal.json --progression
```

After the late run, `node scripts/verify-lyra-save.mjs artifacts/lyra-ending-reload.json --ending` checks the completed profile across an independent reload. `node scripts/summarize-lyra-validation.mjs` refreshes the compact record after all named evidence exists. Raw screenshots, logs, and browser records under `artifacts/` are local ignored evidence. The compact measurements and fixtures are retained with the code.
