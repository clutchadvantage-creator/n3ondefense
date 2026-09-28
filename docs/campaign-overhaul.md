# 30/30/30 campaign implementation report

The approved campaign overhaul is implemented on the pre-Blender baseline `e38bcedde97e6487fc8582eabe1cb3f79c7a1f2f`. Commit `e32e08b61d0cbc2ffcf57fd96960207770f82afa` appeared during final validation. The separately approved recovery restores only Blender boss presentation; the arena environment remains unchanged. See the [production investigation](production-boss-investigation.md).

## Campaign structure and checkpoints

Normal, Overdrive and Supreme each have local rounds 1–30. Rounds 5, 10, 15, 20, 25 and 30 are boss encounters themselves; there is no ordinary fifth round before them. Successful boss completion permanently opens every start through that boss round within that mode. For example, Boss 10 opens starts 1–10, including arbitrary starts such as 7. Selection, Garage presets and availability checks use this model.

Normal Boss 30 unlocks Overdrive. Overdrive Boss 30 unlocks Supreme. Completion returns through the existing result flow rather than automatically starting another mode. Supreme 30 is Centaurus: ordinary boss, Trinity, ending and credits. Final completion requires all three Trinity deaths; the first two do not complete the campaign. Ordinary boss progression and rewards persist through the existing physical-loot collection completion gate, not immediately on the fatal hit.

## Difficulty and hazards

Player-facing rounds, reward positions and difficulty positions are separate:

| Mode | Displayed round | Reward position | Combat / HEIST difficulty position |
| --- | --- | --- | --- |
| Normal | 1–30 | 1–30 | 1–30 |
| Overdrive | 1–30 | 31–60 | 31–60 |
| Supreme | 1–30 | 61–90 | `61 + 3 × (local round − 1)`, or 61–148 |

Existing mode and constellation modifiers apply at their existing boundaries. Enemy/spawn curves, defusers, boss scaling, hazard pressure and reserve preparation receive the combat position. This preserves the old Supreme terminal difficulty input without retaining its old reward endpoint.

Normal introduces lasers at round 1, bomblets at 6, gas at 11 and fire at 16. Overdrive and Supreme start with the full hazard set. Ordinary Normal drones begin at 11 with selection weight 0.015, rising to 0.045; the cap is one through round 20 and two afterward. Event/Redline drones retain their separate behavior.

Supreme stages advance automatically: Leo 1–3, Gemini 4–6, Cassiopeia 7–9, Aquila 10–12, Ursa 13–15, Scorpius 16–18, Taurus 19–21, Virgo 22–24, Capricornus 25–27, Delphinus 28–29 and Centaurus 30. Operations displays local numbers and the appropriate constellation.

## Tutorials and LYRA

The first three successful training rounds lead to Garage/Mod Collection, equipping a Mod, then the Store's currency, purchase and exchange teaching. Combat, collection and Store completion persist independently. Completed teaching groups retire from the queue; replay does not reenroll the player or grant packages again. Unavailable purchases/equipment have progression fallbacks rather than requiring an impossible action. The exchange explanation does not force a transaction.

Visible deployment prompts now say START GAME. Stable internal tutorial IDs/events retain their old `start-local` names for save compatibility. Mod-specific reveal/celebration presentation remains independent.

The [complete missing-voice inventory](lyra-missing-voice-lines.md) lists exact text for all **35 message IDs without matching custom VO**, out of 66 IDs (31 working custom recordings). Four new campaign teaching entries need recordings. Two existing files also need replacement because their recorded START LOCAL wording no longer matches:

- `tutorial.onboarding.menu-welcome.start-local` / `lyrastartlocal.mp3`.
- `tutorial.onboarding.menu-resume-training.start-local` / `lyrareturntotraining.mp3`.

Those mismatched files are not played against different displayed text. Browser TTS, or the existing text-only fallback when unavailable/disabled, handles the current wording. Original audio files and their transcript records were not falsely relabeled as new recordings. Binding/controller variants are also enumerated in the inventory.

## Mods, rewards and economy

Currency and Mod rarity curves use approved reward positions 1–90. Supreme gameplay drops remain Supreme-only; previously owned cards are retained. The approved Overdrive-completion package is an explicit Supreme-card exception after Supreme unlocks. Weekly menu rewards exclude Supreme cards.

The removed ordinary fifth-round completion bonus and guaranteed milestone Mod are awarded on successful boss completion, in addition to existing boss loot. New one-time packages are three distinct Common Mods after training, two Epic plus one Legendary after Normal, and two Supreme plus one Legendary after Overdrive. Eligibility and persistent claimed flags are distinct. Package cards and claim flags are prepared together and saved before presentation; a failed save rolls back that pair in memory. Existing ownership is not treated as evidence of a prior package claim.

HEIST retains its approved Credit coefficients, other currencies, Mods, 35–90 Flux fee, generated container count, requirement to open all containers, provisional loot, extraction, enemy caps, mini-boss and escape/ambush mechanics. Rewards use positions 1–90; its separately approved difficulty axis ends at 148. Existing caps remain the maximum. Neither reviewed Credit-reduction alternative was implemented. Currency Exchange rates, permanent-upgrade prices and Mod prices are unchanged. See the [economy worksheet](campaign-economy-review.md) and [HEIST decision review](heist-campaign-economy-review.md).

## Saves

Save version 19 stores mode-local campaign records, boss victories, access and independent package eligibility/claims. Migration archives legacy progression and grandfathers earned access where older saves lack boss-specific proof. It does not invent boss-victory records. New progression requires the new victory path.

Old Normal/Overdrive starts are preserved within the new range, with higher earned positions mapped to 30. Supreme access maps by constellation identity and legacy thresholds. Existing ending completion remains complete. Qualifying migrated players receive unclaimed packages once through profile activation/import/restore paths. Existing cards, balances and preferences remain; legitimate package grants are the intentional inventory addition. Legacy numerical fields remain for migration/reference and are not new unlock authority.

## Online and menu

START GAME is the sole campaign launch action. It requests authorization automatically using the existing profile-linked anonymous identity. A compatible response supplies the run seed and mode/local start. Service failure or an incompatible old backend allows local play; an offline-started run is never later promoted into a verified submission. Authorized runs retain existing queued-submission behavior if connectivity subsequently drops.

TRY AGAIN requests a fresh authorization. Pause-menu restart completes the previous tracked run and requests a fresh one, preserving that action's existing Normal-round-one/no-setup-fee behavior. Cancelled menu launches and stale asynchronous responses cannot activate or overwrite a newer run. BATTLE // COMING SOON stays unavailable, flashes red and uses the existing unavailable sound. No PvP implementation was added.

Campaign version 2 has separate Normal, Overdrive and Supreme boards; version 1 scores remain Legacy. The existing highest-round, enemy and bomb-target categories remain. A shared category registry and three-panel paging prepare the client for additional score kinds after their server contracts exist; no new score type or combined 1–90 ranking was introduced.

Server migration, filtering and contiguous cleared-round/boss validation are implemented and locally tested. A newly entered death round does not count as cleared. See [deployment compatibility and rollout](campaign-online-deployment.md). The coding agent did not deploy the backend or database. The public Arena bundle was observed updating during this session, but that does not verify backend migration.

## Regression testing and performance

The production build and **780 game tests** passed. **25 backend tests** passed using isolated SQLite and local Python 3.14; production's Python 3.13/PostgreSQL environment was not exercised. Six short browser fixtures passed **166 assertions** in total:

- 76 boundary/save/reward checks, including boss death versus victory, arbitrary starts, mode gates and package persistence/rollback.
- 23 mocked online-contract/ranking/race checks and eight real-menu controls with mocked authorization/handoff.
- 22 training/HEIST/regression checks, including actual fee deduction and the same-Arena return.
- 21 ending checks, including all three Trinity deaths, credits construction, the real Skip action, terminal debrief and save reload.
- 16 restored-boss rendering/collider/retirement checks.

The progression fixtures use test profiles, invulnerability, accelerated outcomes and shortened reveal timing. The ending check constructs credits and uses their Skip control; it is not a full uninterrupted credits-duration measurement. HEIST opens all containers through their damage path and accelerates extraction; it is not a timed unassisted escape.

Four-second ordinary samples at Normal 11, Overdrive 21 and Supreme 29 averaged about 20.0 ms with p95 about 20.2 ms in that browser run. Three subsequent four-second boss samples averaged 16.667 ms with p95 16.8–16.9 ms. These are separate short raw-frame observations, not matched before/after performance evidence. The twelve-layout gait check is detailed in the boss report. There was no new full campaign soak or claim of proven late-game stability, following the request to keep testing brief.

[Compact validation](campaign-validation.json) retains assertions and timings. Browser fixture scripts, economy analyses and focused tests are tracked; raw screenshots and logs in `artifacts/` remain ignored local evidence. Run browser fixtures sequentially in an isolated DEV profile, with Vite on 5173 and debugging on 9225. The summary script requires the named raw reports; it is not a fresh-checkout build prerequisite.

## Preserved systems

Arena/environment artwork, camera projection/aim conversion, layout geometry, pooling, spatial indexing, prewarming, encounter retirement owners, dedicated Mod reveals, Echo, existing weapon/deployable behavior and HEIST mechanics remain in place. Boss recovery includes no stadium assets or Blender arena renderer. Combat balance receives the approved campaign-axis changes; no additional boss attack redesign or economy adjustment was bundled into recovery.

## Issues found but not changed

- Four Flux exchange for 120,000 Credits, exceeding the 99,766-Credit total permanent-upgrade cost. A HEIST-only reduction would not fix this relationship; the user explicitly reserved it for a separate economy review.
- Existing pause-menu restart resets to Normal round 1 without a new setup charge. Its leaderboard ownership is fixed, but this behavior was not redesigned.
- Legacy protocol constants/reference helpers remain where migration and compatibility use them. Live campaign decisions use the new model.
- The old DEV-only anomaly-return helper supplies a zero entry fee, which conflicts with the authoritative 35–90 validator. The new validation fixture uses a valid paid entry; the old helper was not changed.
- Server verification remains statistical validation of client reports, not authoritative boss simulation. Registered accounts, credential recovery, real network-failure integration, physical controllers and audio-output listening require their respective future/manual work.

## Remaining decisions and release requirements

No unresolved HEIST balance choice remains. Existing profile-linked anonymous identities are retained; registered sign-in/recovery would need the separate account design the user has not yet selected. Before treating the leaderboard rollout as complete, verify the migration/API on production's configured database/runtime. Future Battle mode and new score types remain future work.
