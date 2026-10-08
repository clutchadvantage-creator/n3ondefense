# System Infusion overhaul

Implemented in the existing Arena/Mod architecture. Infusion IDs, inventory/save format, five-slot ownership rules, turret balance, and hostile boss balance remain intact. This update does not modify SkyBreach.

Infusions use **C** on keyboard or **right-stick click (RS / R3)** on controller. Planting remains **E / A / Cross**. Selecting an Infusion target alone does not block planting. Boss possession lasts **60 seconds**, or until chassis destruction.

October 8 follow-up validation: **871 automated tests passed**, production build passed, and browser checks verified E/A planting with nearby and distant selected turrets, release without teleport, explicit C teleport, controller rail activation, and possession surviving past 20 seconds until its full minute expires. `scripts/audit-infusion-planting.browser.js` reproduces the planting regression using real Arena input and bombsites after the main Infusion browser fixture. C and right-stick click are reserved core controls so an old custom ability binding cannot trigger an ability at the same time.

## Behavior and reuse

- **Shared targeting:** `SystemInfusionRuntime` owns persistent selection; one retained `SystemInfusionTargetReticle` renders floor rings, crosshair brackets, rotating ticks, acquisition contraction, and immediate consumption feedback. Mouse aim and controller direction acquire targets; neutral aim retains selection. Destroyed, expired, unequipped, consumed, and encounter-invalidated targets clear safely. Relay Jump, Ascension Protocol, Target Designator, Detonator Link, Magnetic Redeploy, Hazard Hijack, and Fence Rail use it. Magnetic Redeploy retains its selected-mine reticle and separate destination marker.
- **Relay Jump:** every living player turret in the arena is eligible, with existing safe-landing checks and cooldown. Invalid selected turrets fall back to another living turret when available.
- **Fences:** a cached obstruction mask augments the existing A*, line-of-sight, smoothing, and stuck-recovery queries. Swept circle/segment collision prevents ground enemies from crossing between frames. Enemies detour or approach an unavoidable barrier and attack its existing health using their own damage/cooldown after sustained contact. Shock remains active at the collision boundary. Base fences and Gridlink share this behavior; friendly operative/chassis movement stays unrestricted. Existing airborne behavior is preserved.
- **Fan Shot:** every projectile branch now checks the runtime's combined base/generated fence list. Children retain ownership, damage share, boss attack metadata, and crossed-fence history; the existing two-distinct-fence split limit remains. Unequipping Gridlink removes generated geometry.
- **Fence Rail:** one interaction snaps to the selected endpoint and locks a route over actual connected segments. Stable breadth-first order chooses the last terminal at the greatest hop distance; a closed loop uses the last reachable node without repeating edges. Controls cannot steer off the route. Central player damage rejection applies only during travel, and exit/cancellation removes it immediately. Broken upcoming links stop travel at the preceding node. Existing impact effects supply bounded entry/travel/exit feedback.
- **Boss Possession:** Ascension Protocol sacrifices three turrets and transfers the existing operative into a real, explicitly player-owned `BossEncounter`. The old allied tank is removed. Operative identity/health stay intact; incoming attacks and expanded physical-hazard hit tests damage chassis integrity. Existing enemy and boss weapon damage attribution supplies kills, progression, rewards, and statistics. Mechanical chassis ignore gas. HUD shows integrity and remaining time; normal Fire and Boost inputs control attacks. Existing camera, boss assets, articulated rigs, attack/VFX systems, projectile pools, scaling, and destruction are reused.

| Existing boss | Primary | Secondary (Boost input) |
| --- | --- | --- |
| Arc Siege Engine | Existing cannon burst | Rockets; orbital strike when its existing cooldown permits |
| Volt Sovereign | Charged ranged projectile | Existing delayed spread volley |
| Phase Mauler | Aimed close-range slam | Existing telegraphed pounce |

Normal movement input drives each chassis at its existing movement speed. Autonomous pursuit/teleports do not drive the controlled instance. Expiry, chassis destruction, anomaly transition, round retirement, restart, and enemy-boss victory restore the operative and retire owned presentation. Defeating the player chassis cannot complete the enemy boss objective. The boss victory path now restores control before loot collection.

## Files

| Area | Changed files |
| --- | --- |
| Infusions | `src/game/mods/SystemInfusions.ts`, `SystemInfusionRuntime.ts`, new `SystemInfusionTargetReticle.ts` |
| Fence movement | New `src/game/abilities/FenceObstruction.ts`, `src/game/systems/GridPathfinder.ts` |
| Arena/control | `src/game/scenes/ArenaScene.ts`, `src/game/entities/Player.ts`, `src/game/bosses/Boss.ts`, `BossEncounter.ts` |
| Hazards/HUD | `src/game/hazards/SharedFireTrapSystem.ts`, `src/game/systems/LaserSecuritySystem.ts`, `BombletHazardSystem.ts`, `Hud.ts` |
| Automated coverage | `tests/system-infusions.test.mjs`, `enemy-navigation-and-frames.test.mjs`, new `fence-obstruction.test.mjs`, `infusion-combat-body.test.mjs` |
| Browser coverage | New `scripts/audit-infusion-overhaul.browser.js`, `audit-infusion-combat.browser.js`, `audit-infusion-boss.browser.js`, `audit-infusion-load.browser.js` |

## Validation

- Complete existing automated suite: **868 passed, zero failed or skipped**. Includes swept collisions, sealed/detour paths, query isolation, persistent interaction selection, map-wide controller targeting, turns in both rail directions, interruption/immunity lifetime, damage routing, and independent hostile/chassis hazard rules.
- `npm run build`: TypeScript and Vite production build pass. `git diff --check` passes. The project has no separate lint script.
- Real browser Arena fixtures: **71 checks** at Normal 14, **71** at Supreme 24, **84** in Normal boss round 10 (including actual enemy-boss victory and loot), **21** additional live-control/combat checks. All passed. Covered all three forms, sacrifice, primary/secondary attacks, independent health, expiry/destruction, enlarged laser/bomblet hits, enemy projectile hits, direct rocket splash, kill progression, fencing, normal/fan branches, controller/keyboard rail entry, pause, broken-link cancellation, and scene reuse. No browser errors in the supplemental live combat run.
- Inspected reticle and chassis HUD screenshots. Also exercised live keyboard chassis movement; controller tests use the real input adapter with simulated standard gamepad state.
- Focused browser CPU sample: 120 enemies, eight base fences, 16 generated links, 300 updates. Infusion update plus obstruction averaged **0.052 ms**, p95 **0.20 ms** (empty-fence comparison: 0.015 ms mean). The mask remained cached throughout. This measures these systems only, not full-frame rendering or sustained campaign performance.

Browser fixtures create isolated DEV profiles. Run the overhaul fixture before combat/load fixtures using `scripts/run-layout-audit.mjs`; the boss fixture runs its prerequisite itself. Local reports and screenshots are under ignored `artifacts/infusion-*` paths.

## Gameplay tuning and limits

Central tuning remains in `SystemInfusions.ts`: rail **1800 units/s**, entry range **160**, cooldown **4 s**; fence contact delay **850 ms**, navigation clearance **30**; chassis duration **60 s**, cooldown **45 s**, health scale **1.0**, operative weapon damage and **75%** of operative fire rate, ejection protection **250 ms**; targeting acquisition **180 ms**, consumption **150 ms**. The [combat polish follow-up](combat-balance-polish.md) restores deployables and shield during possession and documents the accompanying balance changes.

Evaluate late-game chassis strength, each form's existing movement speed, controller selection in crowded/collinear networks, fence durability under concentrated attacks, and rail readability during extended play. Links destroyed by combat stay broken until source topology changes. Dense networks retain the existing 16-link cap. Ejection searches nearby clear positions and falls back to the chassis's current position if the neighborhood is saturated, with the short transition protection window. Physical-controller feel and long-session/low-end GPU performance still need human playtesting; the bounded automated samples do not establish those results.
