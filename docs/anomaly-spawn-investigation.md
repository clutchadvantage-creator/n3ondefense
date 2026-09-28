# Anomaly opportunity investigation

**Historical investigation:** the subsequent [equal Arcade/anomaly rotation](world-event-rotation.md) supersedes the timing, odds, and separate countdown implementation described here. This report retains the findings and evidence from the preceding fix. The browser fixture now validates the shared rotation.

The SkyBreach implementation is committed as `ad997c4bb1db7c41a70ecbcad99bbb1dea488338`. Its addition did not change the existing anomaly scheduling values. The follow-up removes the unwanted teaching and minimum-round gates and preserves anomaly opportunity time across rounds. Both anomalies are now eligible from the first ordinary round regardless of unfinished teaching or replay state. They remain optional, random activities in the normal event rotation, with mutual exclusion against active Arcade events and bosses.

## Restrictions found before the correction

- Arena creates a new `AnomalyController` each encounter. Its initial opportunity is scheduled after **72–138 seconds** of controller update time. Finishing a round discards that timer. Repeated rounds shorter than 72 seconds therefore never reach an opportunity.
- At that opportunity, the roll succeeds only **10% in Normal, 14% in Overdrive, or 18% in Supreme**. A failed roll waits another 105 seconds inside the same encounter.
- Creation is disabled until `firstRunStage === 'complete'` and no tutorial replay is pending. Completing the three combat-training rounds alone is insufficient: outstanding Store or Garage/Mod Collection teaching can keep anomalies disabled. Skipping onboarding can also complete that stage. Disabling LYRA voice does not disable or complete teaching.
- Bosses, the Supreme finale, and active Arcade events exclude a new signal. An ineligible opportunity is postponed ten seconds. Pauses, active tutorials, and inactive encounter phases also prevent controller updates.
- Successful rolls still need a reachable location with clearance from walls, bombsites, the player, enemies, deployables, and pickups. Eighty random candidates are attempted; failure waits another 105 seconds.
- A signal must absorb 13–26 subsequent kills, depending on difficulty position, before becoming an entry portal. Round completion removes an unfinished signal. An opened portal expires after 50 seconds.

For Normal, assuming uninterrupted eligibility and valid placement, the probability of a first signal before a round ends is approximately:

| Controller time before round end | First-signal probability |
| --- | ---: |
| 60 seconds | 0% |
| 90 seconds | 2.73% |
| 120 seconds | 7.27% |
| 150 seconds | 10% |

These are calculations from the uniform initial delay and the first roll, not measured player round lengths. They exclude charging success, placement failures, and competing events. HEIST and SkyBreach share that opportunity; adding another type does not double its frequency.

The configured 330-second cooldown previously could not schedule another opportunity after resolution: the controller returned early in `resolved`, and the next encounter created a fresh instance.

## Short runtime check

An isolated DEV browser created a completed-teaching Normal round-4 profile and one real generated Arena. Forty controller seeds (`Math.imul(index, 0x9e3779b1) >>> 0`, indices 1–40) received at most 150 seconds of accelerated controller time in 250 ms steps. Gameplay eligibility was overridden to isolate scheduling; the real location validator was retained. Chance rolls, type selection, and pricing were not overridden, and no force-spawn or force-charge methods were used.

One of those deterministic seeds produced a SkyBreach signal at 131.75 seconds. Calling the ordinary kill-charge handler to its required target opened a portal priced at 80 Flux. A separately disabled controller remained unscheduled after five simulated minutes. Four checks passed, including isolated profile creation, charging, valid pricing, and teaching suppression. Raw local evidence: `artifacts/anomaly-scheduling-investigation.json`.

This establishes a working natural scheduling/charging path in the sampled layout. It is not a statistical estimate of the configured odds, an unassisted playthrough, or proof of valid placement on every layout. The earlier SkyBreach integration report separately covers paid entries and returns for both anomaly scenes.

## Implemented correction and validation

The user's clarification establishes that anomalies must remain available independently of teaching. Arena now enables the anomaly controller without consulting tutorial completion or replay flags, and both definitions allow round 1. Soft teaching prompts no longer suppress controller updates; an actual gameplay pause still pauses gameplay. No anomaly teaching sequence was added, and LYRA voice remains disabled.

`AnomalyOpportunityClock` stores remaining eligible gameplay time. Its snapshot travels through Arena completion, the debrief's Continue action, transition validation, Loading, and the next Arena. Boss and Arcade exclusions hold that timer. Finishing an encounter without a signal preserves the initial or retry delay. Retiring a signal starts the existing cooldown once; repeated cleanup does not restart it. Boss encounter retirement also retains the snapshot. New deployments start a fresh schedule; no account-save migration or persistent unlock is involved.

The existing 72–138-second initial delay, 105-second retry, 10%/14%/18% mode chances, 330-second cooldown, one opportunity per encounter, charging rules, location clearance, and 35–90 Flux pricing remain. Consequently several rounds without a portal are still possible. This change removes systematic suppression and timer starvation; it does not guarantee an event every round. HEIST/SkyBreach rewards and Arcade reward balance are unchanged.

All **794 tests** and the production build passed. Five scheduling tests cover repeated short rounds, excluded gameplay, retry/cooldown carryover, invalid input, fresh clocks, and round-1 eligibility. The existing music lifecycle fixture now supplies the real countdown-normalization module to its dependency harness.

A short browser fixture passed **24 checks** in approximately 2.2 seconds after setup. It used an isolated profile and real generated Arena, with round-1 seeded chance/type selection and real placement. HEIST and SkyBreach both appeared despite unfinished teaching and a pending replay; ordinary kill-charge handling opened valid portals at 89/82 Flux. The fixture deliberately supplied an already-due countdown and selected successful seeds; it does not measure natural event frequency or simulate a full combat round. It also verified the boss/Arcade holds and repeated cleanup, then activated the actual debrief Continue button and confirmed that a remaining 40-second delay survived Loading into boss round 5.

Compact results: [anomaly-scheduling-validation.json](anomaly-scheduling-validation.json). Reproduce the short browser check with `node scripts/run-layout-audit.mjs artifacts/anomaly-scheduling-fixed.json ./audit-anomaly-scheduling.browser.js` in the isolated DEV browser on port 9225, with Vite on 5173. Raw build/test logs are local artifacts `anomaly-scheduling-build.txt` and `anomaly-scheduling-tests.txt`. The earlier full SkyBreach integration report covers paid entries, combat, success/failure returns, and scene cleanup; it was not repeated as a deep campaign soak.
