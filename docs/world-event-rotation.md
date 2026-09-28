# Equal Arcade and anomaly rotation

All six Arcade events and both anomalies now share one random draw. Every registered entry has equal probability at each opportunity, independently of mode, difficulty position, local round, tutorial completion, and previous selections. With the current eight entries, each has **12.5%** probability: Golden Hunt, Mini-Boss, Neon Circuit, Hot Package, Packet Snatcher, Redline, HEIST, and SkyBreach. Repeats are allowed. There is no preliminary success/miss roll and no separate portal chance.

`WorldEventRotation.ts` owns scheduling. Arena supplies the complete Arcade and anomaly registries without filtering or weighting, so future registered entries join the same equal pool. The controllers own their live event, charging, presentation, combat, and rewards; they no longer run separate opportunity timers. The old mode-based rolls, recent-event exclusion, minimum-round filtering, and anomaly-only cooldown are removed. Both controllers are enabled independently of teaching and replay state.

The common initial wait is 28–52 seconds of eligible gameplay, using the previous Arcade initial timing. After a successful start, all entries receive the same 105-second cooldown, counted while no event is active. Actual gameplay pauses, boss encounters, the Supreme finale, and an active event hold the scheduler. Anomaly charging, portal availability, and the excursion itself occupy that event slot. This keeps the prior boss-fight exclusion and prevents overlapping events without restricting the selection pool by difficulty.

If an entry cannot find safe placement, the same selection retries after one eligible second. It is not rerolled into an easier-to-place event. The selected entry, remaining delay, and random draw cursor survive the debrief/Continue/Loading path, including intervening boss rounds. New deployments begin fresh. This state is carried by the live deployment, not account progression, and does not require a save migration.

Anomaly charging, the 35–90 Flux fee, portal lifetime, encounter difficulty scaling, rewards, combat mechanics, and LYRA voice disable remain unchanged. Equal selection does not guarantee equal counts in a short run, nor does it guarantee every selected event can immediately spawn on obstructed geometry.

## Focused validation

All **795 tests** and the production build passed. Six rotation tests check equal selection intervals, no second chance roll, repeats, short-round continuity, paused/excluded time, pending placement across encounters, malformed state, and fresh deployment behavior. Existing assertions requiring the old teaching suppression and weighted scheduling were retired.

The isolated DEV browser passed **94 checks** in approximately 6.3 seconds after setup. At local round 1 in each of Normal, Overdrive, and Supreme, all eight entries started through the production shared scheduler despite unfinished teaching and a pending replay. This is 24 starts. The same chosen seeds selected the same entries in every mode. All starts used real generated Arena geometry and real event controllers; each received the common cooldown and held off another event while active. HEIST and SkyBreach charged through the ordinary kill handler and produced valid entry fees.

The browser additionally exercised the real debrief Continue action in all three modes. Countdown, pending selection, and random cursor survived Loading into round 2. A boss-exclusion check held the countdown unchanged. Test controls were a due countdown, seeds selected to cover all entries, paused simulation during start assertions, assisted kill-charge callbacks, and synthetic round-completion payloads. These are focused scheduling/start checks, not full event clears, natural-frequency measurements, or performance soaks.

Compact evidence: [world-event-rotation-validation.json](world-event-rotation-validation.json). Raw evidence and build/test logs are local ignored artifacts `world-event-rotation.json`, `world-event-build.txt`, and `world-event-tests.txt`.

With an isolated DEV browser on port 9225 and Vite on 5173:

```powershell
node scripts/run-layout-audit.mjs artifacts/world-event-rotation.json ./audit-anomaly-scheduling.browser.js
```

This policy supersedes the separate anomaly scheduling policy recorded in [the earlier investigation](anomaly-spawn-investigation.md).
