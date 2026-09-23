# ECHO implementation and validation

Echo now uses **two presses**, as requested in the follow-up: press the assigned input once to begin recording, then press it again to return and replay. Releasing the input does not finish the recording. After four seconds, recording completes automatically. The default keyboard binding is **Left Alt**. The existing Controls screen explains this behavior and supports rebinding and reset.

The operative can move, aim, shoot, and use other abilities while recording. Snap-back immediately frees the real player to act alongside the replay. Echo grants no invulnerability, resource restoration, collision immunity, or enemy-aggro changes.

## Runtime architecture

`src/game/echo/EchoRules.ts` holds the balance/configuration and final damage rule. Defaults are four seconds of recording, twelve seconds of cooldown, normal-speed replay, and 50% damage. Configuration is accepted by the scene adapter and normalized by the timeline; the initial bounded implementation caps recording at four seconds. Future systems have explicit duration, cooldown, replay-speed, and damage configuration hooks. No Echo Mod cards, Supreme affixes, skill tree, or additional clones were added.

`EchoTimeline.ts` is independent of Phaser. It records only position, rotation, a dash flag, and weapon events. Movement uses a preallocated 60 Hz timeline with interpolation between actual observed player poses. The fixed buffer has 242 slots, including endpoint headroom, and occupies 9,680 bytes. A normal full recording uses 241 samples. There are 512 reusable weapon-event entries; this is a recording reserve, not a combat projectile or enemy limit. Overflow is counted and rejects additional recorded events without changing the live attack. Tests exercise the reserve beyond supported live firing rates.

The first press records the initial transform. Release rearms the next input edge but does not stop recording. A fresh second press or the four-second limit finalizes the recording, validates and restores the origin, and starts the twelve-second cooldown. The cooldown therefore overlaps playback. Key repeat and a continuously held button cannot create a second activation. A press during cooldown is ignored rather than buffered. Movement and weapon cursors advance only during active gameplay updates, so pause freezes recording, playback, and cooldown together.

Playback follows the historical route and shortest angular interpolation. Dash is reproduced as rapid recorded movement and wider holographic separation; it does not invoke dash again or spend its resources. The hologram has no physics body, target selection, AI, objective interaction, or pickup collection. Recording data is cleared on completion and cancellation, while the bounded reserve is reused for the next activation.

`EchoRuntime.ts` owns scene presentation and the player-body adapter. It reuses the equipped operative texture, frame, dimensions, and origin in three translucent cyan/magenta/white images. A short recorded route, origin marker, paired departure/arrival rings, dash separation, and a brief exit flicker communicate the temporal replay. The route updates at 20 Hz and retains at most 32 displayed segments. Presentation uses existing textures and eight reusable game objects; it creates no new texture cache, per-frame tween, timer, or physics body. HUD text updates at 10 Hz or immediately on state changes.

## Weapons, damage, and rewards

Both Arena and HEIST record the actual accepted primary-fire event after cadence and resource validation. Each event preserves its relative time, muzzle position, aim angle, ammo type, equivalent live damage after shot-time modifiers/crit, speed, ricochet allowance, grenade sequence, and projectile appearance/collision configuration. A later pickup expiration or change of the live weapon cannot reinterpret that event.

Replay calls each scene's existing pooled projectile path:

- **Normal rounds:** historical trajectory and the existing collision/impact behavior. Premium projectile artwork retains its normalized collision footprint under the spectral tint.
- **Scattershot:** the existing seven-pellet spread and per-pellet damage/speed/lifetime. Recorded trigger events expand through the same pellet configuration.
- **Grenade Rounds:** the existing sequence-dependent bounce count, velocity retention, arc, proximity arming, fuse, direct hit, splash, and environment interaction. The replay does not advance or consume the player's current ammo mode.

The final damage rule is:

```text
multiplier = clamp(calculatedEchoMultiplier, 0, 0.70)
maximumAppliedDamage = recordedEquivalentLiveAttackDamage × multiplier
appliedEchoDamage = min(requestedDamage, maximumAppliedDamage, remainingTargetHealth)
```

At the default multiplier, a recorded 100-damage attack deals 50 before remaining-health limits. A future requested multiplier of 0.95 produces at most 70. Each projectile carries an immutable damage stamp; fence-split and grenade-splash descendants carry correspondingly scaled equivalent damage. Enemy and boss health-write boundaries enforce the cap again, so multiplying projectile damage after creation cannot bypass it. Missing or invalid provenance fails closed. Environmental projectile damage is also capped before processing.

Echo is an explicit damage source and Arena projectile telemetry owner. Primary fire remains player-associated for the existing collision routing. Echo shots do not call the live energy, heat, temporary-ammo, deployable, or shot-trigger path. They are not recordable as fresh weapon events, and they cannot trigger Split Current recursion. Existing enemy retirement owns kill counting and rewards exactly once; Echo does not generate a parallel reward or pickup transaction.

## Input, HUD, audio, and ownership

`controls.ts` adds Echo to the shared action list with `Keyboard:AltLeft`. Old saves receive that default through existing normalization. Custom bindings persist through the existing profile settings, and the existing reset action restores Left Alt. Ability holds now use browser `KeyboardEvent.code`, preserving left/right modifier identity and reliable multi-key state. Both edges of assigned keys suppress browser defaults while gameplay owns the input.

Controller input can assign Echo to an unused standard-controller button through the same Controls capture flow. Existing fire, interaction, pause, and operative button mappings remain reserved. No conflicting controller default was introduced. HUD prompts use the assigned Xbox, PlayStation, or generic label; an unassigned controller Echo shows `UNBOUND`. The current save schema retains one custom binding per ability, so choosing a controller custom binding replaces that ability's keyboard/mouse custom binding. Separate saved binding slots per device were not introduced.

Binding capture suspends normal menu navigation while listening, so a controller button cannot simultaneously change the Options tab. The binding grid's reset row and short Echo instructions sit beneath all six rebindable abilities.

The existing Combat Command Deck now has an Echo module alongside Fence, Turret, Mine, and Shield. It shows the current binding, `REC` or `PLAY` in the small state badge, recording elapsed time, a recording progress ring, cooldown time, and the existing ready styling. It creates no separate notification panel and does not touch Mod reveals or celebrations.

`echoRecord`, `echoSnap`, and `echoComplete` are registered in **Audio → Operative & Abilities**. They route through existing Master, SFX, and individual sound-volume controls. They currently use short synthesized placeholder tones through AudioManager, so there are no missing sound-file requests. These are sound effects, not LYRA TTS dialogue.

Arena and HEIST each own one runtime. Recording and playback cancel immediately on round completion, death/failure, and anomaly handoff. Arena retires Echo projectiles before capturing the suspended-world baseline. Existing round cleanup and scene shutdown retire remaining pooled projectiles and destroy Echo presentation. HEIST return creates no continuing clone in Arena. Menu, retry, and profile changes use the same scene/encounter retirement paths. No delayed Echo callback can address a previous world.

## Validation and evidence

Validation results and fixture options are recorded in [echo-validation-measurements.json](echo-validation-measurements.json). Raw browser images and reports remain local under `artifacts/`.

The focused browser fixture exercises the real Arena renderer at round 68 and the actual HEIST handoff. It checks two-press activation, one-second recordings, mixed shot-time ammo, real normal/scatter collision damage, real grenade bounce/direct/splash damage, premium projectile collision parity, the enemy and boss final cap, single kill rewards, unchanged energy/heat/ammo/deployables, full-body safe return after inserting collision at the origin, world bounds, pause, failure, handoff, and shutdown. One hundred activation/retirement cycles per scene retain the same buffers, scene-root count, and shutdown-listener count.

The controls fixture passed **24 checks** using actual Options focus/capture/reset actions, synthetic browser keyboard events, and a mocked standard gamepad. It checks keyboard rebinding, reserved controls, controller capture, persistence, old-key rejection, release-independent recording, the automatic four-second trigger, a second tap ending early, pause during recording and replay, full cooldown, and held-input rearming. A separate browser reload retained the rebound Z key in normalized settings and disk storage. A separate CDP fixture passed **14 checks at actual browser/canvas sizes of 1280×720 and 960×600**, verifying the controls, instructions, and all five HUD slots. Its screenshots were reviewed.

The assisted progression fixture runs normal pressure limits, five rank-three Mods, overlapping hazards, drones, live special ammo, deployables, events, HEIST, rewards, stores, and saves. Its optional `includeEcho` adapter sends a short controller press whenever Echo becomes ready; it does not hold the button or shorten the production cooldown. Every replay records its duration, sample count, shot count, and overflow diagnostic. Invulnerability, supplied ability energy, assisted defuser kills, and accelerated event/boss outcomes remain explicit fixture controls.

Final numerical run results are listed in the compact evidence record. Earlier hold/release prototype measurements are superseded by the two-press runs. These are assisted runtime checks, not unassisted campaign clears, every possible seed/loadout combination, or a guarantee of 60 FPS on all hardware. The ending fixture withholds real-player fire during the three-boss pressure sample; its Echo activations there measure movement/presentation, while earlier ordinary combat includes Echo weapon replay.

The focused automated tests cover timing, early second presses, untouched automatic completion, cooldown, key repeat, fixed sampling at several frame rates, interpolation, mixed ammo/timestamps, bounded extreme fire reserves, safe-return fallback, damage caps, cleanup, anti-recursion, migration/rebinding/reset, and controller mapping. HUD and Options layout assertions were updated for the new slot and binding row. All **734 tests**, the production build, and the itch build passed on the final code. The focused Arena/HEIST fixture passed **80 checks**.

The additional requested bombsite safety, three-round tutorial retirement, and splash notice are detailed in [bombsite-spawn-and-training-fixes.md](bombsite-spawn-and-training-fixes.md). Their validation includes 600 generated arenas, 1,260 real enemy spawns, and the Store-to-Garage teaching handoff. They do not alter Echo input or damage rules.

Remaining manual checks: physical keyboard/OS Alt behavior outside synthetic browser events, physical controller hardware, subjective audio balance/listening, and movement readability on different displays and lower-end GPUs. The hologram and compact control screens were captured for visual review. Placeholder Echo tones can later be replaced through the existing audio entries.

## LYRA recording inventory

[Every missing custom voice line and its exact text](lyra-missing-voice-lines.md) is included in this pass's final report. The registry has **62 messages: 17 mapped custom recordings and 45 without custom VO**. All 17 files exist; there are no unmapped audio files in the LYRA folder.

The inventory also includes **20 distinct controller transcripts across nine recorded tutorial IDs**, **five templates affected by rebound ability keys**, and **twelve recorded action-gated IDs** that can switch to TTS when the unavailable-action explanation is appended. It explains language/file-failure/development-preview fallbacks and supplies suggested filenames for the missing recordings. An existing `module?s` punctuation typo was corrected to `module’s` before generating the recording script. No new dialogue or replacement voice files were invented.

## Files and reproduction

| Area | Files |
| --- | --- |
| New ability core | `src/game/echo/EchoRules.ts`, `EchoTimeline.ts`, `EchoRuntime.ts` |
| Input and settings | `src/game/config/controls.ts`, `src/game/input/ActionInput.ts`, `PlayerInput.ts`, `UiNavigationController.ts`, `src/game/scenes/OptionsScene.ts` |
| Arena and HEIST | `src/game/scenes/ArenaScene.ts`, `src/game/anomalies/heist/HeistScene.ts` |
| Damage and attribution | `src/game/enemies/Enemy.ts`, `src/game/bosses/Boss.ts`, `src/game/telemetry/GameplayTelemetryRecorder.ts`, `src/game/systems/FluxCoreSystem.ts` |
| Presentation and sound | `src/game/systems/Hud.ts`, `AudioManager.ts`, `src/game/config/audio.ts` |
| Tests and browser fixtures | `tests/echo.test.mjs`, `tests/hud-layout.test.mjs`, `tests/options-tabs.test.mjs`, `scripts/audit-echo.browser.js`, `audit-echo-controls.browser.js`, `progression-exercises.js` |
| Voice inventory | `src/game/tutorial/TutorialRegistry.ts`, `scripts/audit-lyra-voice-coverage.mjs`, `docs/lyra-missing-voice-lines.md`, `docs/lyra-voice-coverage.json` |
| Completion evidence | This report, `scripts/summarize-echo-validation.mjs`, `docs/echo-validation-measurements.json` |

Use an isolated DEV profile, Vite on port 5173, and a WebGL test browser exposing CDP on port 9225. Run browser fixtures sequentially and keep production modules unchanged during timing measurements.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run build:itch
node scripts/run-layout-audit.mjs artifacts/echo-browser.json ./audit-echo.browser.js
node scripts/run-layout-audit.mjs artifacts/echo-controls.json ./audit-echo-controls.browser.js
node scripts/audit-echo-compact.mjs
node --experimental-strip-types scripts/audit-lyra-voice-coverage.mjs
```

Repeat a progression run with its exact recorded options; substitute `late` for `normal` to run rounds 137–148 and the Centaurus ending:

```powershell
$fixture = (Get-Content docs/echo-validation-measurements.json -Raw | ConvertFrom-Json).normal
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/echo-normal.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/echo-normal.json --progression
node scripts/summarize-echo-validation.mjs
```
