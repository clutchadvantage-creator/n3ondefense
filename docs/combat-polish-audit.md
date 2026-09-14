# Combat, drone, audio, and destruction polish

This focused pass preserves Redline's event duration, scoring, rewards, escalation, tachometer, and lifecycle. It changes drone durability and speed, the small warning indicators on event drones, shared mechanical death presentation, and proximity audio. The preceding [Redline audit](redline-and-drone-audit.md) remains the record of the larger feature pass.

## Durability and movement

Drone base health is **72 → 140**, below the tank's 190 and the star's 260. Base speed is **145 → 167**, a **15.2% increase**. The existing strafe controller, acceleration response, sweeping paths, range behavior, and variant speed ratios remain intact. Existing round, contract, and mode scaling still apply to these shared base values.

Supreme's existing enemy-health curve receives a shared **1.08 multiplier**, an 8% increase across its stages and family fallback. Boss-health scaling is unchanged. Normal and regular Overdrive receive no general enemy-health increase. No spawn count, spawn weight, weapon damage, reward value, or currency rule was changed. These are initial tuning values; automated assistance does not replace the player's judgment of difficulty and time to kill with their own loadout.

## Physical Redline warning lamps

Redline variants now draw the same cyan fan accents, sensor, and armor as the standard drone. Two small lamp housings carry alternating red strobes and a faint local glow. They are baked into the existing four-pose atlas, adding no per-drone light objects, Graphics paths, timers, or tweens. Priority brackets remain distinct. Arena assigns the normal drone material color to all variants, including restoration after a damage flash.

The final three-variant atlas was reviewed at gameplay size and at twice that size. The effect reads as warning hardware attached to the chassis, while the main body retains its existing colors.

## Shared mechanical deaths

Ordinary enemies gain one requested mechanical fragment per death; the heavier drone now requests the tank's eight-fragment tier. The shared death renderer adds two short electrical streaks, one small soft smoke puff, and one brief residual electrical arc. They accompany the existing impact flash and gears/bolts/nuts. Spark, arc, and smoke lifetimes are **180, 240, and 430 ms** respectively. Existing debris still bounces and fades on its established schedule.

All accents reuse the same fragment pool and its occupancy-based reduction policy. The limits remain **168 fragments and 96 bursts**. Three tiny textures are baked during Boot; there are no new physics particles or runtime Graphics objects. Reduced-particle behavior still retains the core impact and skips the optional fragments and accents. Boss and player destruction retain their authored emission profiles.

Drones already reached `killEnemy` and its normal sound, reward, telemetry, Mod eligibility, pickup, and destruction work. The verified audio weakness was in the shared sound pool: four copies of `bang.mp3` could remain occupied by the recording's quiet tail, causing later kills to omit a new impact. The clip is 1.8135 seconds long, with its strong impact near the start. The pool now reclaims the oldest voice only after its first 350 ms, preserving fresh impacts, the four-voice maximum, and the 45 ms minimum interval. Dense simultaneous kills still intentionally share bounded audio; this does not promise a separate sound for every same-frame death.

Drone ambience releases before shared death feedback, and a destruction hook also releases it for escape, event cleanup, and scene retirement. Drones keep the ordinary death, scoring, loot, event, and radar-removal paths.

## Proximity audio and ownership

The actual asset is `public/assets/audio/soundeffects/dronesound.mp3`. Browser decoding measured **48.6 seconds**, rather than the approximate eight seconds in the request. The recording varies substantially in level and has different head/tail levels, so it is treated as a non-seamless recording. It plays once with a short tail fade, then retriggers only after its source ends and only while its owner remains eligible. Copies from one owner never stack.

[DroneAudioPool](../src/game/systems/DroneAudioPool.ts) owns **five reusable gain/pan channels** inside the existing AudioManager. All channels share one decoded AudioBuffer. At the measured 48 kHz stereo output rate, its float PCM data occupies **18,662,400 bytes, about 17.8 MiB total**. This is decoded sample storage, not total browser memory, and is not multiplied by five. Single-use WebAudio source nodes are disconnected on retirement; the five spatial channels remain available for reuse.

Every **100 ms**, eligible drones are ranked within a **720-world-unit radius**. Volume falls with squared proximity and respects the existing master/SFX mix. Stereo pan follows horizontal direction relative to the player; the current Arena camera is unrotated. Existing owners have a small distance preference to prevent constant switching between nearly equidistant drones. A meaningfully closer drone can replace a lower-priority owner. Radius exits and replacements fade over roughly 40 ms, with the channel available on the next proximity update. Death/removal and shutdown stop immediately.

Pause, sleep, tutorial/reveal gates, encounter retirement, and scene shutdown stop the spatial sources. Resume may start a fresh source for a still-live nearby drone. The asynchronous decode completion only installs the shared buffer; it cannot start playback after a scene was retired. Round-audio diagnostics include these sources and the five retained channels.

## Validation

The final production build and **674 tests passed**. New tests cover durability bounds, Supreme versus boss scaling, five-channel priority, attenuation/pan, non-stacking retriggers, death/radius/scene cleanup, mute, and delayed decode completion.

The focused real-browser interaction fixture passed **58 assertions** across regular Overdrive round 25 and Supreme round 148. It checked seven nearby drones sharing five channels, closest-owner selection, actual gain and stereo panners, and nonzero PCM output through a WebAudio AnalyserNode. It exercised radius exit/reentry, actual drone death through the reward pipeline, death playback with all four original voices occupied by quiet tails, rapid multi-drone deaths, Redline termination with ordinary owners alive, pause/resume, and scene shutdown. Every shutdown left zero drone owners, zero drone sources, zero round-audio activity, and zero Text canvas owners.

That fixture holds scene updates and physics still during exact distance/damage assertions. It uses real audio decoding, WebAudio nodes, enemy bodies, event controllers, rewards, and cleanup, but does not represent unassisted play. A separate **57-assertion** art/reuse/lifetime fixture verified the variant atlases and 18 explicit-destroy/shutdown cycles. A visual gallery sampled actual shared destruction at 64, 176, 320, and 640 ms and verified complete expiration. An 80-death burst check stayed within both existing effect ceilings.

The additional live-flight sweep passed **23 assertions** at Overdrive rounds 5, 25, and 50 and Supreme Leo round 51. Each supplied ten seconds of real mixed-wave movement at approximately **16.666 ms mean raw frame intervals**, with p95 **16.8–16.9 ms**. This sweep uses invulnerability and controlled spawn selection, leaving live steering, attacks, and ordinary encounter budgets intact. Together the focused fixtures passed **139 browser assertions**.

The sustained test completed **Supreme rounds 137–148 and Centaurus in 482.5 seconds**, passing **194 gameplay assertions, 24 finale assertions, 16 encounter retirements, and 13 disk-save comparisons**. It uses the preceding audit's exact assisted fixture: seed 550055, five rank-three Mods, armed bombs, deployables, special ammo, overlapping hazards, invulnerability, supplied placement energy, assisted defuser kills, and accelerated event/boss outcomes. The optional drone pressure setup fills natural drone slots within the existing encounter budgets. This is an assisted regression run, not an unassisted campaign clear.

Coverage includes all six Arcade events, two HEIST returns, three Pause/Options/Store visits, two ordinary bosses, physical rewards, and four Mod reveals. Golden Hunt completed after approximately 4.9 seconds; the other five event samples supplied approximately eight seconds each. Redline's continuous phase averaged **16.662 ms**, with histogram p95 **17 ms**. Defense/Defusing averaged **16.740/16.685 ms**, with histogram p95 **18/17 ms**. Histogram percentiles round upward to whole milliseconds.

| Sustained terminal sample | Raw mean interval | Raw p95 interval |
| --- | ---: | ---: |
| Centaurus ordinary, 40 seconds | 16.680 ms | 16.9 ms |
| Three bosses, first 20 seconds | 16.666 ms | 16.9 ms |
| Three bosses, second 20 seconds | 16.680 ms | 16.8 ms |
| Three bosses, third 20 seconds | 16.666 ms | 16.8 ms |
| Two bosses remaining, 20 seconds | 16.666 ms | 16.8 ms |
| One boss remaining, 20 seconds | 16.664 ms | 16.8 ms |

The bosses remained alive and active for the full three-boss sample, with player fire withheld. Completion stayed false until the last boss died, then persisted through the authored credits, terminal debrief, Garage return, and independent browser reload at Supreme highest round 148.

All sustained analyzer budgets passed, including the 20 ms raw mean and 34 ms raw p95 checks for eligible gameplay phases with at least 120 frames. Smoothed Phaser encounter means, measured separately, averaged **16.914 ms** across the first four rounds and **16.818 ms** across the last four. The results show no sustained regression against the existing validation budgets; they do not establish a performance improvement. Every quiescent checkpoint had zero active round audio, stale encounter owners, mechanical fragments, and Arena/HEIST Text canvas owners. The retained audio-channel count stayed **171**, including the five new drone channels. Resize/game/window/document listeners stayed **21/21/19/14** at all 13 quiescent checkpoints; the temporary continuous-frame recorder is removed after the fixture.

Brief hitches remain: Defense reached **40.9 ms** for one interval, and HEIST entry reached **251.2 ms**. These measurements do not establish hitch-free transitions, every seed/loadout combination, integrated-GPU performance, or a new full round-68-to-148 soak. The browser was Edge 153 at **1552 × 903, DPR 1**, reporting **NVIDIA GeForce RTX 5070 through ANGLE/Direct3D11**, without CPU throttling.

Audio signal production and lifecycle were tested in the browser. Physical speakers/headphones, subjective mix balance, and a human difficulty playtest remain manual checks. The recording's conservative retrigger behavior is not a claim of an inaudible seamless loop.

## Evidence and reproduction

Use an isolated DEV test profile and WebGL browser with Vite on 5173 and remote debugging on 9225. Run fixtures sequentially, and do not edit watched modules or scripts during measurement. The Vite server was restarted because its previously running public-asset index returned HTML for the newly added sound; after restart the actual asset decoded successfully.

```powershell
npm.cmd run build
npm.cmd test
node scripts/run-layout-audit.mjs artifacts/combat-polish-browser.json ./audit-combat-polish.browser.js
node scripts/run-layout-audit.mjs artifacts/combat-polish-art-lifetime.json ./audit-drone-art-lifetime.browser.js
node scripts/run-layout-audit.mjs artifacts/combat-polish-vfx-art.json ./audit-combat-polish-visual.browser.js
$env:N3ON_LAYOUT_OPTIONS = '{"matrixOnly":true,"sampleMs":10000,"matrix":[["overdrive",5],["overdrive",25],["overdrive-pegasus",50],["supreme-leo",51]]}'
node scripts/run-layout-audit.mjs artifacts/combat-polish-checkpoints.json ./audit-redline-drone.browser.js
Remove-Item Env:N3ON_LAYOUT_OPTIONS
```

Run the sustained ending fixture from its recorded options in [compact measurements](combat-polish-measurements.json):

```powershell
$fixture = (Get-Content docs/combat-polish-measurements.json -Raw | ConvertFrom-Json).late
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/combat-polish-mixed-late.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/combat-polish-mixed-late.json --progression
node scripts/verify-polish-save.mjs artifacts/combat-polish-save-reload.json
```

The existing reload verifier also checks the camera-shake setting through Options. Raw JSON, audio analysis, and screenshots under `artifacts/` are local ignored evidence. Compact measurements retain the assertions, exact fixture options, timing distributions, ending results, and reload check. With the corresponding raw records and logs present, `node scripts/summarize-combat-polish.mjs` refreshes that file. Build/test outputs are [build](../artifacts/combat-polish-build.txt) and [674 tests](../artifacts/combat-polish-tests.txt).
