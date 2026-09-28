# Equal Arcade and anomaly rotation

All six Arcade events and both anomalies share one random draw, independently of mode, difficulty position, local round, and tutorial completion. The first draw gives each entry **12.5%** probability: Golden Hunt, Mini-Boss, Neon Circuit, Hot Package, Packet Snatcher, Redline, HEIST, and SkyBreach. Subsequent draws exclude the last event that actually started and give each of the other seven entries **1/7 (approximately 14.29%)** probability. An event can return after a different event, but cannot appear twice consecutively. There is no preliminary success/miss roll and no separate portal chance.

`WorldEventRotation.ts` owns scheduling. Arena supplies the complete Arcade and anomaly registries without mode filtering or weighting, so future registered entries join the same pool. The scheduler applies only the immediate-repeat exclusion. The controllers own their live event, charging, presentation, combat, and rewards; they no longer run separate opportunity timers. The old mode-based rolls, two-event Arcade-only history, minimum-round filtering, and anomaly-only cooldown are removed. Both controllers are enabled independently of teaching and replay state.

The common initial wait is 28–52 seconds of eligible gameplay, using the previous Arcade initial timing. After a successful start, all entries receive the same 105-second cooldown, counted while no event is active. Actual gameplay pauses, boss encounters, the Supreme finale, and an active event hold the scheduler. Anomaly charging, portal availability, and the excursion itself occupy that event slot. This keeps the prior boss-fight exclusion and prevents overlapping events without restricting the selection pool by difficulty.

If an entry cannot find safe placement, the same selection retries after one eligible second. It is not rerolled into an easier-to-place event and does not replace the last-started history. The selected entry, remaining delay, random draw cursor, and last-started event survive the debrief/Continue/Loading path, including intervening boss rounds. Success, failure, or declining a started event all prevent its immediate repeat. New deployments begin fresh. This state is carried by the live deployment, not account progression, and does not require a save migration.

Anomaly charging, the 35–90 Flux fee, portal lifetime, encounter difficulty scaling, rewards, combat mechanics, and LYRA voice disable remain unchanged. Equal selection does not guarantee equal counts in a short run, nor does it guarantee every selected event can immediately spawn on obstructed geometry.

## Focused validation

All **798 tests** and the production build passed after adding repeat protection. Nine rotation tests check equal selection intervals, no second chance roll, immediate-repeat exclusion, equal odds among the remaining seven entries, return after an intervening event, serialized history across rounds, short-round continuity, paused/excluded time, pending placement across encounters, malformed state, and fresh deployment behavior. Existing assertions requiring the old teaching suppression and weighted scheduling were retired. This focused follow-up did not repeat the earlier browser sweep reported below; its build/test logs are `artifacts/world-event-no-repeat-build.txt` and `artifacts/world-event-no-repeat-tests.txt`.

The isolated DEV browser passed **94 checks** in approximately 6.3 seconds after setup. At local round 1 in each of Normal, Overdrive, and Supreme, all eight entries started through the production shared scheduler despite unfinished teaching and a pending replay. This is 24 starts. The same chosen seeds selected the same entries in every mode. All starts used real generated Arena geometry and real event controllers; each received the common cooldown and held off another event while active. HEIST and SkyBreach charged through the ordinary kill handler and produced valid entry fees.

The browser additionally exercised the real debrief Continue action in all three modes. Countdown, pending selection, and random cursor survived Loading into round 2. A boss-exclusion check held the countdown unchanged. Test controls were a due countdown, seeds selected to cover all entries, paused simulation during start assertions, assisted kill-charge callbacks, and synthetic round-completion payloads. These are focused scheduling/start checks, not full event clears, natural-frequency measurements, or performance soaks.

Compact evidence: [world-event-rotation-validation.json](world-event-rotation-validation.json). Raw evidence and build/test logs are local ignored artifacts `world-event-rotation.json`, `world-event-build.txt`, and `world-event-tests.txt`.

With an isolated DEV browser on port 9225 and Vite on 5173:

```powershell
node scripts/run-layout-audit.mjs artifacts/world-event-rotation.json ./audit-anomaly-scheduling.browser.js
```

This policy supersedes the separate anomaly scheduling policy recorded in [the earlier investigation](anomaly-spawn-investigation.md).
