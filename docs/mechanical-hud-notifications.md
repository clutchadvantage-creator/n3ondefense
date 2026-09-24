# Mechanical HUD notifications and LYRA recordings

The permanent bottom-right Combat Command Deck now houses one retractable tactical screen. Existing ability slots, input prompts, cooldowns, resources, radar, and objective displays retain their owners and behavior. Normal gameplay announcements, live Arcade/anomaly state, LYRA gameplay subtitles, and hazard information use the same screen. Mod card reveals and celebrations remain independent.

## Display and event identity

`MechanicalNotificationView.ts` creates an angular metallic frame, a small TACTICAL tab, inset illuminated display, scanlines, mechanical rails, and one reusable content area. It anchors to the existing `calculateHudLayout(...).abilities` rectangle and uses the same HUD preferences. A geometry mask clips everything at the upper edge of the permanent deck; draw depth 999 places it beneath the existing HUD at 1000. Camera compensation keeps both the mask and display in screen space as gameplay zoom changes.

Deployment takes 320 ms; retraction takes 300 ms. Smooth vertical travel moves the physical screen without bouncing it. Content animation has its own clock and does not move the frame. Readable active time starts after deployment. Ordinary durations default to 3.5 seconds and normalize to 2.5–6 seconds. Live warnings remain active according to gameplay state.

| Existing system | Animated treatment |
| --- | --- |
| Redline | Semicircular tachometer, red zone, smoothed rotating RPM needle, percentage readout; live event RPM drives the gauge |
| Hot Package / Supply Pod | Parachute and crate descent, landing bounce, canopy collapse, SUPPLY DROP readout; authored event title retained |
| Packet Snatcher | Original geometric masked-thief silhouette with moving data packets disappearing into its grasp |
| Golden Hunt | Radar sweep with marked targets |
| Mini-Boss | Threat silhouette inside a pulsing warning triangle |
| Neon Circuit | Data pulses moving along circuit traces |
| Anomaly / HEIST | Scanning portal/radar motif with the current entry, charging, fee, or objective text |
| Bombsite disarm | Vertical live progress gauge and percentage, site label, and critical red accent |
| Weekly, rewards, progression | Success seal with a restrained confirmation pulse |
| Security hazards | Animated electrical/data traces with the existing live warning text |
| General messages and LYRA | Technical console motif with a restrained activity indicator |

The old Redline dial was recovered from the repository version preceding its removal (`101cf4e`). Its 40-tick semicircle, red-zone colors, transform-only needle, and smoothing informed the smaller shared-screen implementation. Redline's existing edge rails remain atmospheric world framing; no separate RPM widget or result popup is recreated. Its controller supplies actual RPM to the new screen.

The registry contains six Arcade events. **Hot Package** is the supply-drop event and **Packet Snatcher** is the thief event. No separate Overload event exists in this registry, and none was invented. Outcomes continue to use the shared success/failure presentation; dedicated Redline results retain their authored score/rank text.

## Queue, priorities, and live state

The existing `HudInformationSystem` remains the scene/encounter owner and producer API. `HudNotificationQueue` now owns the pure `HIDDEN → DEPLOYING → ACTIVE → RETRACTING` state machine. `MechanicalNotificationView` only renders its current state. Exactly one notice is presented at a time.

Distinct queued outcomes are retained and sorted by priority, preserving equal-priority submission order. A repeated keyed signal replaces its queued entry; active and recently completed duplicates are suppressed. The former twelve-entry eviction rule was removed so a concurrent burst cannot silently discard a distinct reward or completion. Repetitive live timers update one map entry instead of creating messages. Ending an Arcade event cancels obsolete start/stage announcements while preserving completion results.

Bombsite disarm has priority 100. Current LYRA subtitles have priority 60. These can retract an ordinary message early, save its remaining active time, and resume it afterward. Critical preemption takes at most the remaining retraction plus deployment time. Normal queued results take their turn before background live state. When no result is queued, Arcade, anomaly, and hazard states rotate through the same display in five-second slots. They never become stacked cards or simultaneous footers.

New integrations can supply an animation type, priority, key, duration, and live metadata without constructing another UI owner. This leaves room for future rival/Battle information without adding networking or multiplayer behavior now.

## Disarm truth and lifecycle

Arena's existing HUD update supplies the focused actively defused site's `defuseMs`, divided by the same protocol-adjusted `getEnemyDefuseDuration(OBJECTIVE_CONFIG.defuseRequiredMs, protocol)` used by the actual defuse transaction. The vertical bar therefore reflects gameplay accumulation, interruption, decay, and protocol duration rather than an independent animation timer. With multiple sites under disarm, the existing objective focus selects the earliest detonation timer; the display identifies that site and reports the number of affected sites.

Leaving `BeingDefused` removes the live warning and retracts it. A resumed attempt can deploy again. The existing world-space bombsite warning and top objective status remain as positional/objective information; this pass adds no second screen-space disarm gauge.

The system has no animation timers, tweens, DOM nodes, or gameplay input handlers. Phaser scene pause/sleep clears its queue, live state, and presentation; an in-scene gameplay pause suspends rendering and its clock. Round completion, defeat, boss completion, and HEIST success/failure/return clear old work before any fresh terminal result. Encounter destruction and scene shutdown release the display, mask, private textures, hidden hazard text sources, and resize/scene listeners. Arena and HEIST own independent instances. Existing tutorial and Mod presentation gates also suspend rendering and its clock.

Hazard producers retain their existing Text-based state interface, but those source objects are absent from the display list. Only the shared screen renders their text. They are explicitly destroyed by the information owner. Tactical Information visibility and text-size preferences remain supported.

## LYRA recordings

Sixteen new files were matched to stable IDs in `LyraRegistry.ts`: health/defuse warnings; charge planted; Arcade completion/failure; pickup/anomaly/Arcade/hazard context; two Garage ambient lines; Store/Garage menu guidance; and three Store lessons. The original files were preserved. The registry now has **33 registered custom recordings and 29 messages still without custom recordings**. All 33 files loaded and decoded in the browser.

| Message ID | Supplied file |
| --- | --- |
| `warning.health` | `operativehealthlyra.mp3` |
| `warning.defuse` | `defusewarninglyra.mp3` |
| `tactical.planted` | `tacticalplantedlyra.mp3` |
| `event.arcade.complete` | `eventarcadecompletelyra.mp3` |
| `event.arcade.failed` | `eventarcadefailedlyra.mp3` |
| `context.pickup` | `contextpickuplyra.mp3` |
| `context.anomaly` | `contextanomalylyra.mp3` |
| `context.arcade` | `contextarcadelyra.mp3` |
| `context.hazard` | `contexthazardlyra.mp3` |
| `ambient.garage.1` | `ambientgarage1lyra.mp3` |
| `ambient.garage.2` | `ambientgarage2lyra.mp3` |
| `tutorial.onboarding.menu-store.store` | `tutorialonboardingmenu-storelyra.mp3` |
| `tutorial.onboarding.menu-garage.garage` | `tutorialonboardingmenu-garagelyra.mp3` |
| `tutorial.onboarding.store.credits` | `tutorialonboardingstorecreditslyra.mp3` |
| `tutorial.onboarding.store.card` | `tutorialonboardingstorecardlyra.mp3` |
| `tutorial.onboarding.store.action` | `tutorialonboardingstoreactionlyra.mp3` |

Recorded tutorial text is guarded against the actual displayed instruction, including the five newly recorded menu/Store lessons. Changed controls or appended unavailable-action guidance still use the existing local TTS/text fallback. This pass maps supplied audio to the established transcripts; browser decoding does not constitute a human listening/transcription review.

[Updated missing-recording checklist and exact text](lyra-missing-voice-lines.md) includes the 29 missing IDs, 20 controller variants, five rebound-key templates, and fourteen unavailable-action variants. The machine-readable inventory is [lyra-voice-coverage.json](lyra-voice-coverage.json).

Restart Vite after adding audio files: audio-directory watching is intentionally disabled to avoid Windows file-lock crashes. The already-running server returned its HTML fallback for the new paths; a fresh isolated server served and decoded them correctly. Production and itch builds include the new files.

## Validation

All **740 automated tests**, the production build, and the itch build passed. Queue tests cover deployment timing, readable hold time, FIFO/priority ordering, duplicate coalescing, distinct-outcome retention, real-time warning preemption/resume, live rotation, cancellation, and cleanup. Recording tests verify registered IDs/files and tutorial transcript guards.

The real-browser feature fixture passed **96 checks**, including all six Arcade treatments, mechanical deployment/retraction, a burst of 20 distinct outcomes plus 200 repeated signals, actual Arena disarm progress at 25% and 75%, interruption/resumption, 100 reuse cycles, real Arena round completion, HEIST entry/failure/return, shutdown, and loading/decoding every recording. No player profile was used; the fixture creates isolated test profiles.

The responsive fixture passed **48 checks** at actual browser/canvas sizes 1280×720, 960×600, 640×480, and 1920×800, each at camera zooms 0.65, 0.9, and 1.15. It verifies deck anchoring, panel/text bounds, all five ability slots, and live progress. Screenshots at the normal 0.9 zoom were reviewed, including the compact disarm warning.

Thirty alternating explicit-destroy and scene-shutdown cycles released **420 previously live private GPU textures**. Every cycle left zero visual roots, zero retained Text canvas owners, and baseline resize listeners. Each display owns fourteen small baked textures; repeated notifications allocate no replacement artwork.

Twelve isolated 1.5-second measurements covered hidden state and all eleven content treatments. Active display renderer CPU averaged **0.047–0.089 ms/frame**, update CPU **0.041–0.070 ms/frame**, and raw intervals approximately **16.666–16.670 ms** on the test machine. Hidden renderer/update means were 0.007/0.021 ms. These are isolated CPU measurements, not GPU timings or universal device guarantees.

The normal fixture completed **rounds 1–12 in 221.7 seconds**, passing **171 gameplay assertions, 14 encounter retirements, and 12 disk-save comparisons**. Coverage included all six Arcade types, two HEIST returns, three Pause/Options/Store visits, two bosses, physical rewards, four Mod reveals, and 17 Echo replays. Continuous raw means were **16.677 ms in Defense, 16.715 ms in Defusing, 16.682 ms in HEIST, and 16.667 ms in boss combat**, each with a histogram p95 of 17 ms. The largest Defense interval was 41.4 ms. The first/final four encounters averaged 16.834/16.925 ms of smoothed Phaser frame time. All analyzer budgets passed.

The fixtures use normal pressure limits, seed 550055, five rank-three Mods, drones, Echo, special ammo, overlapping hazards, and deployables. Invulnerability, supplied ability energy, assisted defuser kills, and accelerated event/boss outcomes are explicit test controls. They are assisted runtime checks rather than unassisted campaign clears. The late fixture starts with Supreme highest round 136 and the existing Overdrive prerequisite, completes 137–148, and then launches Centaurus.

Late-run results are recorded after the ending fixture completes.

## Preserved presentations and limits

Mod drops, reveals, celebrations, Supreme reveals, and acknowledgements retain their dedicated presentation. Teaching overlays remain their own interaction flow, and LYRA's menu subtitle area remains on menus that have no combat deck. World-space damage/pickup feedback, bombsite markers, HEIST interaction prompts, permanent objective displays, and ability readiness remain contextual gameplay UI. No floating replacement toast or top-center event panel is created.

Physical controller hardware, subjective voice listening, and lower-end hardware performance still require their respective manual environments. Synthetic/controller input and the prior ability implementation are not changed by this pass.

## Changed files and reproduction

- Renderer: new `src/game/ui/MechanicalNotificationView.ts`.
- Owner/queue: `src/game/ui/HudInformationSystem.ts`, `HudNotificationQueue.ts`.
- Gameplay integration: `src/game/scenes/ArenaScene.ts`, `src/game/anomalies/heist/HeistScene.ts`, `src/game/arcade/ArcadeHudView.ts`, `src/game/arcade/visuals/RedlineVisualController.ts`.
- Voice registration/documentation: `src/game/lyra/LyraRegistry.ts`, `public/assets/audio/lyra/README.md`, the sixteen supplied MP3 files, `scripts/audit-lyra-voice-coverage.mjs`, and generated voice inventories.
- Tests: `tests/hud-notifications.test.mjs`, `tests/lyra.test.mjs`.
- Browser fixtures: `scripts/audit-mechanical-hud.browser.js`, `scripts/audit-mechanical-hud-compact.mjs`, `scripts/audit-mechanical-hud-cost.browser.js`.
- Retained evidence: this report, `scripts/summarize-mechanical-hud.mjs`, and `docs/mechanical-hud-measurements.json`.

Use an isolated DEV browser with WebGL and CDP port 9225. Run fixtures sequentially and keep production modules unchanged during timing measurements. This pass used an isolated Vite server on port 5174 to pick up the added audio, with an RTX 5070 reported through ANGLE/Direct3D11.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run build:itch
node scripts/run-layout-audit.mjs artifacts/mechanical-hud-browser.json ./audit-mechanical-hud.browser.js
node scripts/audit-mechanical-hud-compact.mjs
node scripts/run-layout-audit.mjs artifacts/mechanical-hud-cost.json ./audit-mechanical-hud-cost.browser.js
node --experimental-strip-types scripts/audit-lyra-voice-coverage.mjs
```

Raw JSON, screenshots, and logs under `artifacts/` are ignored local evidence. Retained compact results are in `docs/mechanical-hud-measurements.json`.

Repeat the exact normal fixture from its retained options; substitute `late` in the selector and paths for Supreme 137–148 plus Centaurus:

```powershell
$fixture = (Get-Content docs/mechanical-hud-measurements.json -Raw | ConvertFrom-Json).normal
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/mechanical-hud-normal.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/mechanical-hud-normal.json --progression
```

After the late run, `node scripts/verify-polish-save.mjs artifacts/mechanical-hud-ending-reload.json` checks the completed profile through a separate reload. Once both summaries and the focused reports exist, `node scripts/summarize-mechanical-hud.mjs` refreshes the compact evidence record.
