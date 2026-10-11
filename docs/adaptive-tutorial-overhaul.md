# Adaptive tutorial and boss walking audio

Implementation report, October 11, 2026.

## Tutorial audit findings

- The old director saved action completion only while the matching instructional step was waiting. Actions performed early or during a transition delay were lost.
- Saved sequence positions conflated having heard an explanation with having performed an action. An unavailable-action Continue could complete equipment teaching; a failed purchase attempt could complete Store teaching.
- Returning scenes reconstructed the rigid sequence and sometimes selected step zero even when every step was already known. Menu navigation and Back were also restricted by the current teaching stage.
- Menu recovery used highest round reached as proof of Round 3 completion. Another legacy migration accepted the certification briefing as training completion.
- Window timers and scene callbacks could outlive the presentation they belonged to. Startup also needs to wait until Phaser has marked a newly created scene active.

## Resulting architecture

`TutorialProgress.ts` is the central reducer. Each profile's existing tutorial save now contains versioned `learning` data: stable objective states, independent delivered/acknowledged message records, unique successful training round IDs, and presentation preferences. The previous version-3 fields remain compatibility projections.

Authoritative actions are recorded independently of the visible lesson. Repeated events are idempotent. Delivery is saved when an explanation appears; dismissing an action explanation leaves its objective pending. Existing loadout and purchased-upgrade evidence can satisfy actions without requiring another purchase or re-equipment.

The director separately evaluates eligibility, safe presentation, and completion. It skips known messages/actions, reevaluates newly eligible lessons after actions, and cancels transient presentation on pause, exit, defeat, or profile changes. Delayed callbacks verify ownership. Explicit replay preserves accomplishments and rewards.

Store, Garage, and Collection can explain their existing systems on early visits. Equivalent formal/contextual explanations share identities. The contextual-guidance preference suppresses optional early introductions. Menus and Back remain usable; completing a lesson no longer automatically navigates elsewhere.

The first return to the menu with incomplete training presents the requested passive **RWG TRAINING RECORD / PROGRESS ARCHIVED** notice. Its acknowledgement is unobstructed, it has no forced deployment target, and its delivery survives reload.

## Milestones, rewards, and migration

Successful Normal Arena outcomes in `PlayerProfileStore.recordRoundCompletion` own training progress. Wins in rounds 1, 2, and 3 must all be present. Attempts, deaths, repeated round-one victories, and the certification dialogue do not clear training.

The third required win makes the existing training package eligible. The existing package transaction still owns granting exactly three Common Mods and persisting its claimed flag together with inventory. Normal post-training Garage/Collection/equipment and Store teaching remain, with already completed work skipped.

Migration preserves existing completed/skipped profiles and old one-round curriculum clearance. Older individual steps and message history are retained. Old fallback equipment/purchase steps require real save evidence before claiming the action. Authoritative campaign completion and already claimed packages reconcile legacy clearance; highest round merely attempted does not. No separate storage, reward implementation, or LYRA voice dependency was introduced.

## Boss walking audio

The supplied `public/assets/audio/soundeffects/bosswalkingsound.mp3` uses a shared decoded WebAudio buffer with independent playback for each moving legged boss. Arena supplies the three main boss archetypes, simultaneous finale bosses, applicable mini-bosses, and player-controlled boss frames.

Actual position changes drive playback. Idle aiming, pushing against an immovable wall, and spawn/teleport discontinuities do not start footsteps. Movement fades in; stopping fades over 280 ms and stops the source. Starting again during the fade restores the same voice instead of stacking recordings. Defeat, removal, pause, hidden/unfocused pages, and round teardown release playback.

**Options → Audio → Enemies & Bosses → Boss Walking** uses the existing saved per-sound mixer. Effective volume follows Master × SFX × Boss Walking, with spatial attenuation/panning. Old saves receive the standard channel default while keeping their other mixer settings. Mute and lifecycle diagnostics include the new sound.

## Changed files

| Area | Files |
| --- | --- |
| Tutorial state, rules, presentation | `src/game/tutorial/{TutorialProgress,TutorialDirector,TutorialRegistry,TutorialTypes,TutorialOverlay}.ts`, `src/style.css` |
| Persistence and migration | `src/game/save/{LocalSaveTypes,SaveValidator}.ts`, `src/game/state/PlayerProfileStore.ts`, `src/game/systems/SaveSystem.ts`, `src/game/progression/CampaignLegacyMigration.ts` |
| Scene integration | `src/game/scenes/{Arena,MainMenu,OperatorGarage,ModCollection,UpgradeStore}Scene.ts` |
| Existing voice mapping | `src/game/lyra/LyraTutorialScript.ts` (retires the obsolete forced-restart line mapping; retains LYRA and other recordings) |
| Walking sound and mixer | `src/game/systems/{BossWalkingAudio,AudioManager}.ts`, `src/game/config/audio.ts`, supplied MP3 |
| Automated regressions | `tests/{tutorial,tutorial-director,boss-walking-audio,campaign-legacy-migration,lyra,music-lifecycle}.test.mjs` |
| Browser verification | `scripts/audit-adaptive-tutorial.browser.js`, `scripts/audit-tutorial-interruptions.browser.js`, `scripts/verify-adaptive-tutorial-reload.mjs`, `scripts/audit-boss-walking-audio.browser.js` |

## Verification

- Full Node suite: 958 tests passing. Covers separate message/action states, out-of-order completion, interruption saves, unique round wins, package idempotency, legacy migration, profile isolation, stale callbacks, existing LYRA content, audio fades/restarts/retirement, and mixer-save defaults.
- Production build: `npm run build` passes TypeScript and Vite.
- Real Edge browser: 54 checks covering fresh introduction, actual movement/fire methods, deaths in rounds 1/2/3, Store access while the archive notice is present, successful purchase, actual round-completion/package paths, Garage/Collection access, installation, profile switching, and repeated reward reconciliation.
- Actual page reload: eight checks verify completed-profile identity, exact reward card identities, equipment, and quiet completed menu. Separate refresh during the visible archive notice preserves unfinished progress exactly and does not replay its introduction or notice.
- Interruption fixture: 24 checks verify real Pause/Resume, death → Try Again → deployment confirmation, Pause → Quit, early Garage/empty Collection, rapid screen changes, and unobstructed notice dismissal.
- Walking audio: 44 checks verify the real decoded clip, Options channel, all three hostile archetypes and all three controlled frames for movement, fade, stop, restart, individual Master/SFX/channel mute, pause/resume, focus/hidden hooks, and scene retirement. Unit tests additionally cover simultaneous owners, death/removal, teleport rejection, and late decoding after cleanup.

Browser fixtures invoke real scene buttons and game methods, with deterministic setup, assisted deaths/victories, invulnerability, and brief physics/update controls. These are integration checks, not a human-played three-round campaign. Physical-controller ergonomics, subjective speaker/headphone mix, browser process crashes during storage writes, and remote profile synchronization are not claimed as tested. Persistence here is the game's existing local profile save system.

Run browser scripts only against an isolated DEV browser on localhost:5180 with CDP port 9225; they create test profiles. Run `audit-adaptive-tutorial` before the reload script; run `audit-tutorial-interruptions` before reload with `--partial`. Reports are written under ignored `artifacts/`.
