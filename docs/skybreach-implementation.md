# SkyBreach — first implementation pass

SkyBreach is a second paid anomaly in the existing Arena opportunity registry. It suspends the current Arena, runs an aerial encounter, and returns through the same guarded success/failure lifecycle as HEIST. It does not advance campaign rounds or award a campaign boss checkpoint. LYRA, recorded voice, and TTS remain disabled.

## Architecture and reuse

`AnomalyScenes.ts` maps anomaly IDs to their scene owners. Portal labels, launches, return banners, reward telemetry, active-run detection, and Options retirement now use the selected anomaly. The shared 35–90 Flux entry transaction is unchanged.

The existing HEIST combat implementation now exports `AnomalyCombatScene`, with hooks for world construction, navigation, enemies, mission objectives, and presentation. `HeistScene` retains its default facility implementation; `SkyBreachScene` supplies the aerial world. The shared class deliberately remains in `heist/HeistScene.ts` in this pass to avoid a second copy of the combat loop and unrelated file relocation. Its HEIST-specific mission methods are not invoked by SkyBreach.

Both anomalies reuse Player, PlayerInput, the transferred ModRuntime, weapon and ammo controllers, Echo, mine rack, ability configurations, shield, turrets, fences, projectile pools, spatial queries, grenade physics, ricochet, fence splitting, pickup motion/presentation/SFX, provisional physical loot, HUD, notifications, and Arena restoration. The artillery marker was extracted from `BossEncounter` without changing the existing boss's drawing commands or attack timing.

## Flight and presentation

All new artwork is generated with Canvas drawing commands into a finite set of shared textures. No Blender or external image assets are used. The RWG player aircraft has a layered wing/fuselage silhouette, cockpit, separate engine housings, vents, weapon pods, seams, illuminated panels, and animated exhaust. Its collision radius remains 12 world pixels. Aim, responsive XY movement, energy costs, dash, shield, weapon cadence, and ammo stay under existing owners.

The [final WebGL review sheet](../artifacts/skybreach-final-review.png) shows the player, Dreadnought, Zeppelin, both new fighters, and reused tank/drone art. Positions were arranged and simulation paused for inspection; this image is not evidence of an unassisted fight.

Three scrolling layers and recycled military platforms give the battlefield different apparent depths. The environment is restrained behind enemy fire and the existing HUD. The source texture set contains 2,318,272 pixels, approximately 8.84 MiB at four bytes per pixel. This is source pixel storage, not measured total GPU memory. Shared source textures remain cached; per-scene TileSprites, aircraft, markers, effects, and HUD objects retire with the scene.

Turrets retain their combat objects and stats but appear as allied escort pods moving beside the player. Mines retain their existing premium ordnance visuals and damage/arming/rack rules, with aerial collision participation. Fences retain their existing two-node energy-barrier presentation, damage, projectile splitting, and slowing. They are fixed in the combat area rather than scrolling away with the distant ground.

## Encounters and enemies

The director sequences eleven authored modules over 266 seconds of active simulation: patrol, crossing attack, drone picket, armored convoy, anti-air corridor, recovery, strike escort, War Zeppelin, siege battery, elite interdiction, and final approach. Pausing does not advance this clock. The final boss has no artificial defeat timer; the intended total is roughly five to eight minutes, but actual unassisted completion time remains a playtest question.

Line, V, staggered, dual-column, split-entry, crossing, and diagonal formations share one helper. Density derives from the entering Arena profile and mode, within a SkyBreach ceiling of 24 ordinary enemies. Supplied formations increase from three aircraft in early Normal to seven at late Supreme. Old formations retire on departure or after 34 seconds. Recovery sections retire remaining ordinary contacts and enemy fire, then supply ordinary health/energy pickups.

Existing drone and tank artwork/stats are reused with aerial pursuit and scrolling-convoy adapters. Interceptors make fast weaving passes. Strike fighters hold farther forward and show a targeting line before a missile-like projectile spread. War Zeppelins have segmented armor, gondolas, paired animated turbines, slower movement, multiple guns, and bounded drone releases. A Zeppelin uses ordinary enemy drops; it does not grant a boss reward burst. Tank and aircraft projectile behavior here is an aerial adapter, not a claim that every Arena AI behavior has been ported.

## Dreadnought

The moving hull has seven separately targetable weapons: two forward cannons, two broadside guns, two missile batteries, and one artillery mount. Each has its own health, hit feedback, damage smoke, disabled wreck, and destruction effect. The central reactor rejects damage—including Echo—until all seven weapons are destroyed. Armor panels then open and the notification area announces the exposed core.

A bounded scheduler alternates cannon sweeps, missile strike warnings, broadside lanes, artillery, and escorts, with gaps between weapon families. Queued cannon shots and strike markers retain their owning weapon; destroying that weapon cancels its unlaunched attack. Already-fired projectiles remain real projectiles. After the core opens, escorts continue while the hull moves. Core defeat clears hostile pressure and runs seven staged explosions through the existing explosion renderer, followed by the physical boss haul.

Boss rewards use `getBossRewards` at the approved reward position, the entering reward multiplier, the Credit-value Mod multiplier, and the existing guaranteed boss Mod roll with protocol, Signal, and Contract context. This anomaly does not also grant the ordinary campaign milestone-completion package. Collecting the physical haul reveals the return portal; interacting at that portal completes extraction.

## Difficulty and escrow

The entry snapshot captures the Arena's health/damage/speed curve, density profile, Contract health modifier, and reward multiplier. Mode and constellation multipliers are applied through the existing mode configuration. Boss health and damage derive from the existing boss helpers. Player-facing local round, reward position, and difficulty position remain separate: for example, Supreme 26 uses reward position 86 and combat position 136.

There is no new wallet. Ordinary currency pickups and the boss haul enter the existing pending-loot container. Arena commits it only after a successful, matching return session. Death discards pending currency and Mods, preserves the preexisting wallet, and uses the established HEIST failure-ejection behavior. Mod ownership and dedicated reveal/celebration handling remain with Arena after a successful return. Entry fees remain spent on failure.

## Mod translation and explicit limitations

Transferred stat modifiers, calibrated stats, weapon damage/cadence/critical effects, Split Current/Fractured Current, Emergency Capacitor, Nanite Fuel, Magnetic Service, Full Rack Salvo, Magnetic Payload, Sentry Dominion, Jailbroke Turrets, and deployable stat modifiers continue through their existing owners. SkyBreach also uses `SupremeModEffectSystem` for Singularity Chamber and the existing Crown of Stars pickup-surge state. Hull attachments do not move under Magnetic Payload; ordinary aircraft can be pulled and slowed. Suppression excludes the boss hardpoints/core.

No card is unequipped or silently replaced. These effects have no applicable target in SkyBreach:

- **Priority Targeting:** there are no bomb defusers to mark or prioritize.
- **Emergency Shield** and **Bomb Chronometer:** there is no planted charge.
- **Arc Surge, Defuse Feedback, Pressure Field, Combat Uplink, Countermeasure Array, Kill Switch, Hot Zone, Capacitor Field, Sentry Uplink, Munitions Relay, Emergency Shielding, Final Countdown, Danger Close, Critical Mass (`critical-mass-charge`), Unstable Reactor, Blood Beacon, Ground Zero, Event Horizon, and Second Sun:** their bombsite-specific triggers do not execute without bombsites.
- **Eventide Arsenal, Triune Bastion, and Final Protocol:** their bomb-duration/site-pulse portions have no target; their weapon, shield, fence, and energy modifiers still apply.
- **Gas Mask** and **Quantum Carapace's gas filter:** there is no security gas; Quantum Carapace's health/healing portions still apply.
- Bomb-detonation cosmetic infusions have no bomb detonation to decorate. Existing equipped projectile, pickup, dash, and enemy-death finishes remain in the shared combat path. The aerial craft/escort presentation replaces the operative/turret body artwork during the excursion.

Echo recordings do not cross the anomaly boundary; this is the established anomaly policy. A fresh Echo runtime operates inside SkyBreach and is retired before Arena restoration. Active Arena deployables stay suspended in Arena; deployables created in SkyBreach retire on exit. This pass does not claim exhaustive validation of every Mod rank, calibration, infusion, and loadout combination.

## Validation and practical limits

The production build and all **789 unit tests passed**. The final browser fixture passed **189 checks**, covering six SkyBreach visits (success and failure in each mode) plus one HEIST regression visit. See [compact validation measurements](skybreach-validation.json) for individual checks and timings. The short browser fixture uses a separate DEV profile, assisted invulnerability, supplied ability energy, simulated controller input, accelerated director positions, and accelerated boss damage. It exercises Normal 4, Overdrive 16, and Supreme 26. These are functional integration checks, not unassisted five-to-eight-minute clears.

The fixture checks fee deduction, shared build state, frozen Arena clock, aircraft hit radius, movement, dash, shield, deployables, normal/scatter/grenade projectiles, Rapid Fire, the existing 22-shot/sec ceiling, all enemy roles, artillery markers, physical pickups, provisional rewards, hardpoint targeting, core protection, destruction, and return. It also visits every director module and checks a HEIST entry/escrow/return after the shared refactor. Pure tests exercise all 128 subsets of surviving boss weapons and formation/director invariants.

Three approximately three-second mixed-threat samples at 1256 × 708 measured raw step intervals using `performance.now()`:

| Entry | Frames | Mean interval | p95 |
| --- | ---: | ---: | ---: |
| Normal 4 | 181 | 16.607 ms | 17.0 ms |
| Overdrive 16 | 180 | 16.621 ms | 17.0 ms |
| Supreme 26 | 180 | 16.624 ms | 17.0 ms |

Each sample initially contains one of every ordinary enemy role, deployables, and artillery. These are not maximum-density samples. Separate short firing checks emitted 17 player projectiles per mode over approximately 850 ms while requesting a 45/sec weapon rate; the shared 22/sec maximum and frame scheduling remained authoritative. GPU timing and total GPU memory were not measured.

Performance samples are deliberately short. They do not establish worst-case Supreme performance, integrated-GPU performance, or hitch-free initialization. Physical controller hardware and browser audio output still require manual testing. Full-length pacing, relative anomaly reward appeal, and readability with unusually large saved HUD layouts should receive the next playtest; no unrelated economy or Arena balance changes were made. Source builds/tests are recorded in local `artifacts/skybreach-build.txt` and `artifacts/skybreach-tests.txt`; the final raw integration record is `artifacts/skybreach-runtime-final.json`.

## Reproduction

Use Vite on port 5173 and an isolated hardware-WebGL DEV browser with remote debugging on port 9225. Run the fixture alone, after a fresh reload, without builds or source edits during its frame samples.

```powershell
node scripts/run-layout-audit.mjs artifacts/skybreach-runtime-final.json ./audit-skybreach.browser.js
node scripts/summarize-skybreach-validation.mjs
npm.cmd test
npm.cmd run build
```

For manual DEV entry, `forceAnomaly('skybreach')` selects the opportunity; `forceAnomalyCharge()` opens the portal through the existing development control. Normal gameplay chooses from the shared eligible anomaly registry. Raw screenshots and browser logs under `artifacts/` are local ignored evidence; code, tests, and compact results are retained.
