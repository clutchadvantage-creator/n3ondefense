# Combat behavior, audio organization, and hazard/VFX audit

This focused pass follows the [combat polish](combat-polish-audit.md) and [menu presentation](menu-presentation-audit.md) work. It changes ground-enemy target acquisition, organizes the existing individual audio controls, synchronizes shared fire hazards, and adds bounded projectile effects. Combat density, difficulty progression, Mod presentation, and the preceding static-art caches retain their existing owners.

## Enemy targeting and recovery

The distant-enemy problem was in `ArenaScene.updateEnemyPatrol`: when no bombsite was active, enemies chose nearby random patrol points, and only switched to the operative inside 260 pixels. That was a target-acquisition limit, rather than an attack-range limit.

Without an active planted bomb, ground combat enemies now target the operative regardless of distance. Shooters pursue until their preferred local spacing and fire within 560 pixels. Other ground types use the existing navigation and contact-combat path. Tanks retain their separate missile launch range and cooldown. Drones keep their existing flight controller. Arcade units with explicitly owned movement continue through their event controller.

An active planted site retains the existing objective selection and defuser assignments. The transition between having and not having a planted objective invalidates old paths; survivors resume operative pursuit as soon as the objective ends.

Existing separation and sampled stuck recovery remain. Movement is sampled every 240 ms; repeated negligible progress clears the route and activates lateral recovery. Blocked or empty paths no longer trigger unrestricted per-frame path searches. Expensive path queries are limited to eight per update, with the existing staggered 360–650 ms refresh interval and local fallback steering. This is a scheduling budget, not an enemy-count cap.

The focused browser fixture exercised all seven enemy types from the opposite corner of a validated 2340 × 1540 arena, over 2,300 pixels away. Every type began moving and made sustained progress over five seconds. The fixture selects the production maximum dimensions inside the isolated test browser and retains the normal generator/validator. It also checks objective handoff, stuck recovery, and the eight-query budget.

## Individual audio controls

Options retains all existing sound keys and adds `droneFlight`, for **74 individually adjustable channels**. The eight expandable groups are:

- Weapons & Combat
- Operative & Abilities
- Enemies & Bosses
- Arena Hazards
- Pickups & Rewards
- Arcade Events
- Anomalies
- Interface & Cosmetics

Master, Music, and SFX volume remain pinned above the scrolling categories. Expansion survives tab changes, resizing, and reuse of the Options scene; it is not written to the profile for persistence across browser reloads. Category activation restores controller focus to the same header. Existing saved per-sound values retain their keys.

The actual dedicated drone asset is `soundeffects/dronesound.mp3`. Its existing five-channel spatial flight/rotor mixer now receives the `droneFlight` individual gain. Drone deaths retain the shared Enemy Death channel. No unused drone sound controls or duplicate drone audio instances were introduced. Browser checks mute and restore actual spatial gain, and a separate reload preserves independently set weapon and drone volumes.

## Shared fire and burning

Arena and HEIST both use `SharedFireTrapSystem`. Telegraph and ignition remain warnings; the active state owns the full flame, direct contact damage, and one borrowed audio voice. The active state ends before contact is evaluated at the shutdown boundary. Its voice stops at the same boundary instead of finishing the source clip. Pause follows the existing world-audio pause/resume path; death, encounter retirement, and anomaly handoffs clear exposure and owned voices.

The wall contact region follows the three tapered jets with a 12-pixel operative-body allowance. Full jets appear together on active-state entry, removing the former mismatch between growing artwork and a full-length damage rectangle. Cooling smoke and embers remain cosmetic.

| Fire rule | Value |
| --- | --- |
| Active flame duration | 1,100 ms |
| Direct pulse interval | 520 ms |
| Base pulse before shared mode scaling | 17 HP |
| Round-one Normal pulse after its existing 0.7 multiplier | 11.9 HP |
| Full round-one Normal activation | 35.7 HP: 27.46% of 130 base HP |
| Resolved Normal pulse-cadence DPS | 22.88 HP/s |
| Burn duration after last contact | 1,250 ms |
| Burn pulse | 2 HP every 550 ms; ordinarily two pulses, 4 HP total |

The finite activation has an immediate first pulse; pulse-cadence DPS and total activation damage are different measures. Existing round and protocol scaling still applies to direct fire; the pre-mode pulse cap is 27.2 HP. Later rounds and higher protocols are therefore stronger than the round-one Normal example.

`BurningStatus` refreshes on contact and delivers its modest tail only after leaving the flame, preventing burn ticks from consuming direct-hit invulnerability windows. Reentry refreshes the tail rather than stacking statuses. Flame/ember art follows the operative through the existing two fire Graphics batches. There are no additional timers, physics bodies, or per-contact emitters.

The browser fixture drives both shared environment configurations at simulated 15, 30, 60, and 144 FPS. It verifies actual `Player.takeDamage` health loss with the normal invulnerability window, active-state audio ownership, direct-damage shutdown, burn damage/expiry, pause, and death cleanup. Actual HEIST entry and return are covered separately by the mixed gameplay fixtures.

## Projectile artwork and bounded effects

`BootScene` creates a dedicated `tank-homing-missile` texture with a mechanical body, nose, fins, panel detail, and illuminated propulsion. Its doubled drawing resolution retains the existing displayed size and **30 × 11.67 world-pixel physics body**. Speed, homing turn rate, launch range/cooldown, health, lifetime, interception, damage, and blast radius keep their existing rules.

`ProjectileImpactVfx` follows the existing muzzle-flash approach: two reusable Graphics batches and preallocated slots. Full particle presentation allows **48 impacts and 192 smoke samples**; the existing reduced-particle preference uses 24/96. New emissions recycle slots, including replacing the oldest cosmetic sample under saturation. They do not allocate new display objects, tweens, timers, or emitters.

Missiles record world-space exhaust positions every 30 ms. Smoke lasts 650 ms, so the trail retains the actual curved path; short propulsion streaks animate within the same batch. Interception/impact adds a bounded flash, directional debris, sparks, and smoke alongside the existing blast presentation.

Player and turret bullets use a 140 ms impact with a brief white flash, directional sparks, and tiny fragments. Scattershot shares the compact effect. Grenade explosions retain their existing path. Ricochet wall hits emit the effect while preserving the reflected projectile. No normal-bullet camera shake is added.

The focused checks verify actual hit damage and projectile retirement, turret and Scattershot impacts, ricochet survival, no bullet camera shake, missile collision dimensions, retained smoke positions, and interception cleanup. A 10,000-emission saturation test retains exactly the preallocated slots; all samples expire and scene shutdown leaves no display roots or owned combat audio.

## Validation

Build and **689 tests passed**. The final focused browser fixture passed **118 checks**. Its initial exploratory attempts exposed fixture-state assumptions on reuse; the retained final result starts from a fresh browser. Production changes did not occur during the recorded gameplay measurements.

Normal rounds **1–12** completed uninterrupted in **221.8 seconds**, passing **171 gameplay assertions, 14 encounter retirements, and 12 disk-save comparisons**. Coverage includes all six Arcade types, two bosses, physical boss rewards, four Mod reveals, two HEIST visits/returns, and three Arena Pause/Options/Store cycles. The continuous raw Defense, Defusing, HEIST, and boss-combat means were 16.656, 16.672, 16.668, and 16.665 ms, respectively, with 17 ms histogram p95 values. Histogram percentiles round upward to whole milliseconds. Focused smoothed Phaser encounter means ranged from 16.759 to 16.893 ms.

The separate late fixture completed **Supreme rounds 137–148 and Centaurus in 489.6 seconds**, passing **194 gameplay assertions, 24 finale assertions, 16 encounter retirements, and 13 disk-save comparisons**. It starts from a test profile with the regular Overdrive prerequisite and Supreme highest round 136, then completes the remaining ordinary rounds. Coverage includes all six Arcade events, two HEIST returns, two ordinary bosses, five Mod reveals, and three Arena Pause/Options/Store cycles.

Late ordinary encounter means ranged from **16.704 to 17.856 ms** using smoothed Phaser deltas. Continuous raw Defense, Defusing, HEIST, and boss-combat means were **16.800, 17.149, 16.679, and 16.678 ms**, with histogram p95 values of **19, 21, 17, and 17 ms**. The six Arcade phases had raw means of 16.650–16.835 ms. Golden Hunt supplied about seven seconds; this does not claim eight full seconds for every event.

| Sustained ending sample | Raw mean frame interval | Raw p95 |
| --- | ---: | ---: |
| Centaurus ordinary, 40 seconds | 16.736 ms | 17.1 ms |
| Three bosses, first 20 seconds | 16.667 ms | 16.8 ms |
| Three bosses, second 20 seconds | 16.680 ms | 16.8 ms |
| Three bosses, third 20 seconds | 16.722 ms | 16.9 ms |
| Two bosses remaining, 20 seconds | 16.667 ms | 16.8 ms |
| One boss remaining, 20 seconds | 16.665 ms | 16.8 ms |

All three bosses remained alive and active during the full 60-second test, with player fire withheld. Completion stayed false after the first two deaths and persisted after the third, the authored credits, terminal debrief, and actual Garage action. An independent browser reload preserved completion, Supreme highest round 148, and separately set weapon/drone volume values in both normalized state and disk storage.

Together, the two runs cover **24 ordinary rounds plus Centaurus, 365 gameplay assertions, 24 finale assertions, 30 encounter retirements, and 25 disk-save comparisons**. At the 25 quiescent checkpoints, resize/game/window/document listener counts stayed fixed at **22/23/19/16**. Retirement checks found no stale encounter owners or active round audio. The continuous recorder contributes a game listener and removes it on completion.

Both sustained gameplay analyzers passed. Transition hitches remain: the normal run's largest observed handoff was **198.6 ms**, and the late run recorded **268.2 ms** on HEIST entry. These are retained as transition costs, not hidden inside steady-combat averages. The late run's largest Defense interval was 36.7 ms despite its 19 ms p95. The ending browser reported an RTX 5070 through ANGLE/Direct3D11, at a 1528 × 811 game viewport and DPR 1; this is not a hardware-independent performance guarantee.

These are assisted fixtures: invulnerability, supplied ability energy, five rank-three Mods, assisted defuser kills, and accelerated event/boss outcomes preserve normal pressure limits while exercising the runtime. They are not unassisted campaign clears or a new consecutive round-68-to-148 soak. The tests establish behavior and measured performance on the test machine, not hitch-free transitions or a guarantee for every device and loadout. Audible output and physical controller hardware still need manual playtesting.

## Reproduction and evidence

Use Vite on port 5173 and an isolated WebGL browser/test profile with remote debugging on port 9225. Start the focused fixture after a fresh page reload. Run fixtures sequentially and do not edit imported modules during measurement.

```powershell
node scripts/run-layout-audit.mjs artifacts/combat-behavior-browser.json ./audit-combat-behavior.browser.js
```

Repeat the normal or late gameplay run using its exact retained options:

```powershell
$fixture = (Get-Content docs/combat-behavior-measurements.json -Raw | ConvertFrom-Json).late
$env:N3ON_SOAK_ROUNDS = [string]$fixture.options.rounds
$env:N3ON_SOAK_OPTIONS = $fixture.options | ConvertTo-Json -Compress -Depth 10
node scripts/run-mixed-session.mjs artifacts/combat-behavior-late.json ./benchmark-progression-session.browser.js
node scripts/analyze-mixed-session.mjs artifacts/combat-behavior-late.json --progression
```

[Compact measurements](combat-behavior-measurements.json) retain exact configurations and analyses. After the late run, `node scripts/verify-combat-behavior-save.mjs` checks completion and audio preferences across reload. `node scripts/summarize-combat-behavior.mjs` refreshes the compact report after all raw records exist.

Raw evidence is retained in [focused browser checks](../artifacts/combat-behavior-browser.json), [normal analysis](../artifacts/combat-behavior-normal.summary.json), [late analysis](../artifacts/combat-behavior-late.summary.json), and [ending reload verification](../artifacts/combat-behavior-ending-reload.json). Build/test logs are [build](../artifacts/combat-behavior-build.txt) and [689 tests](../artifacts/combat-behavior-tests.txt). Raw files and screenshots under `artifacts/` are ignored local evidence; the scripts, audit, and compact JSON are retained with the code.

The principal implementation files are [ArenaScene](../src/game/scenes/ArenaScene.ts), [OptionsScene](../src/game/scenes/OptionsScene.ts), [AudioManager](../src/game/systems/AudioManager.ts), [audio configuration](../src/game/config/audio.ts), [fire balance](../src/game/config/fireHazards.ts), [SharedFireTrapSystem](../src/game/hazards/SharedFireTrapSystem.ts), [BurningStatus](../src/game/hazards/BurningStatus.ts), the [HEIST scene](../src/game/anomalies/heist/HeistScene.ts) and [trap wrapper](../src/game/anomalies/heist/HeistTrapSystem.ts), [BootScene](../src/game/scenes/BootScene.ts), [ProjectileImpactVfx](../src/game/vfx/ProjectileImpactVfx.ts), and the shared button focus-ID option in [utils/ui](../src/game/utils/ui.ts).
