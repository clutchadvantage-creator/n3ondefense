# Arena kinetic rebounds and the preserved bombsite slingshot

**Historical implementation:** The October 14 [arcade movement correction](arcade-movement-correction.md) supersedes the operative momentum, steering and prolonged banking described below. Current operative controls are immediate, with a short, cancellable collision response. The original measurements below remain as the historical record; enemy and controlled-frame behavior remains separate.

Implemented October 13, 2026. Results and before/after measurements are in [kinetic-rebound-validation.json](kinetic-rebound-validation.json). Central tuning is [kinetic.ts](../src/game/config/kinetic.ts).

## What produces the original launch

`ArenaScene.detonateSite` sets the existing Arcade `world.timeScale` to **0.35 for 850ms**. Phaser 3.90 multiplies its fixed-step scheduling interval by this value while retaining a 1/60-second integration step. The world therefore takes roughly **2.86 physics steps per real-time frame**. This is accelerated displacement, despite the original slow-motion naming. Detonation does not directly change the operative's velocity. Proximity does not supply a radial player impulse in this path.

During continuing Defense, input writes the movement velocity once per rendered frame. The physics steps then integrate that velocity with the existing damping. If the detonation finishes the round, Victory temporarily skips movement updates; that changes the decay profile. Speed Boost multiplies movement by 1.3, and Dash supplies its existing high initial velocity. These interactions explain why the launch varies with movement, upgrades and whether another bomb remains armed.

The detonation, its duration, input speed multipliers, Dash impulse, damage, blast radius, pre-contact damping and Arcade step schedule are unchanged. There is no new gameplay speed cap.

## Baseline and comparison

Before changing movement code, the isolated hardware browser measured actual detonation, Clock and Arcade body updates at deterministic 60 Hz on commit `10a2af5`. The same fixture was repeated after implementation. The near-site origin, per-frame positions, velocities and substep counts were retained. It covers standing, partial-stick walking, normal movement, Speed Boost, Dash, diagonal movement and an upgraded boosted loadout, each with a final-site Victory and continuing Defense variant: **14 scenarios**.

Below are continuing-Defense results. Speed is effective displacement per real-time second, not simply the body's velocity property. The ordinary test uses base movement 240; the upgraded case uses 900 before Speed Boost.

| Scenario | Peak before → after (px/s) | Displacement at 850ms before → after (px) |
| --- | ---: | ---: |
| Standing | 0 → 0 | 0 → 0 |
| Walking | 196.65 → 196.65 | 159.49 → 159.49 |
| Normal | 561.85 → 561.85 | 455.69 → 455.69 |
| Speed Boost | 730.40 → 730.40 | 592.39 → 592.39 |
| Dash | 2943.66 → 2943.66 | 522.37 → 522.37 |
| Diagonal | 561.85 → 561.85 | 329.53 → 305.87 |
| Upgraded Speed Boost | 2739.01 → 2739.01 | 1608.65 → 1378.27 |

All 14 peak speeds and immediate before/after detonation velocities match the baseline. All seven Victory displacement measurements at 850ms match too. Paths differ after wall contact: diagonal movement banks, and the upgraded launch turns back into the arena. Its total 1.5-second traveled distance increases from **1608.65 to 2212.42px**, instead of stopping against the boundary. Straight-line displacement is consequently smaller. The diagonal contact trades some travel for its reflected direction; its 1.5-second path is 404.26px versus 442.68px before.

## Movement and contact integration

The existing `SweptPlayerBody` remains the movement integrator. Arena opts into continuous reflected sweeps; Heist and SkyBreach retain the original player sweep. Ordinary ground enemies use their existing Arcade integration until a real contact or existing knockback gives them temporary momentum. Drones are exempt. AI bosses retain their existing movement and act as infinite-mass contact targets.

Only velocity directed into a surface is reflected. Tangential motion survives, producing banking at glancing angles. A smooth response curve keeps slow wall contact precise and produces strong high-speed reactions. Remaining travel is swept again after each collision. The numerical limits bound work and segment length rather than lowering velocity. A retained safe position also prevents Arcade's later overlap separation from pushing the next swept step through an adjacent wall. Explicit teleports clear that position.

| Parameter | Value |
| --- | --- |
| Response threshold / full response | 90 / 330 px/s into the surface |
| Maximum restitution: outer / inner / obstacle | 1.00 / 0.96 / 0.88 |
| Body-contact restitution | Up to 0.72, weighted by relative speed and mass |
| High-speed amplification | 0.08 within the restitution ceiling |
| Tangential retention | 0.99 |
| Operative momentum window / steering | 0.82 physics seconds / 1.6 per second |
| Enemy and controlled-frame window / steering | 0.62 physics seconds / 2.4 per second |
| Momentum decay | Exponential, 0.8 per physics second |
| Repeated normal damping | 0.30 within 55ms |
| Contact skin / corner epsilon | 0.35px / 0.000001 |
| Sweep limits | 12 iterations, 2048px per segment; leftover velocity retained |
| Broad-phase work | 768 visits and 96 contacts per rendered frame |
| Per-query visits | 128 for the operative/controlled frame, 24 for displaced enemies |

Effective masses: operative 1, grunt 0.65, shooter 0.85, defuser 0.7, disruptor 1.4, tank 4.5, star 7, controlled boss 9. Controlled frames additionally multiply wall restitution by 0.42. Body dimensions and combat radii remain authored values. Dynamic contacts use lightweight circular sweep proxies; this is not a rigid-body simulation.

Directional input steers retained momentum instead of replacing it on the next frame. A newly requested Dash still supplies its own intended impulse. A launched enemy can transfer momentum to another using the existing spatial grid. Legacy crowd nudges are omitted while that enemy is coasting, preventing repeated nudges from accumulating energy. Existing AI takes over when the window ends.

Existing contact damage still flows through player damage/shield/iframe handling, with controlled-frame enemy attack cooldowns retained. No impact damage was added. Bombsite mod shockwaves, emergency shield knockback, magnetic mine attraction, Supreme repulsor and controlled Brawler displacement now preserve their existing physical velocity through subsequent contacts. Ordinary mines, Grenade Rounds and Full Rack Salvo retain their damage, radius and projectile behavior; they do not gain generic blast knockback.

## Floors, infusions and presentation

Only static solid collision bodies enter wall sweeps. Floor gaps remain unsupported space, not rebound barriers. `DynamicFloorActors` receives each actual traveled ricochet segment and retains only the first lost-support point. This catches a path crossing lava and returning to solid ground in one frame, without incorrectly falling through a gap crossed only by the straight chord between endpoints. There are no growing path arrays or additional physics loops.

Panel support translation preserves momentum. Falls, ejection and explicit teleport resets clear stale contact energy. Forced ground-enemy motion can cross an edge and fall; ordinary enemy edge avoidance remains in charge otherwise. Dash keeps its supported-landing rules. Existing floor damage, local recovery, environmental grace and boss footprint checks remain authoritative.

Friendly fences, mines and turrets retain passability. Launched enemies still stop at and attack fences. Relay chooses its existing safe landing and resets momentum. Echo records the actual banked positions, replays that path and clears live velocity on return. Ascension uses the heavier body response and existing attack/ability controls. Shutdown, round retirement and owner recreation release contact callbacks and effects.

Impact feedback uses one batched Graphics layer and 12 fixed cosmetic afterimages: cyan rings, a short white flash, directional amber/cyan streaks and a compressed/stretched copy of the equipped artwork. The real sprite's geometry and appearance are not resized. All animation uses the scene clock; reduced effects omit afterimages and streaks. There are no per-impact timers, tweens, generated textures or new physics bodies. The dedicated impact-sound hook is intentionally silent until a recording is registered through AudioManager; existing audio settings and sounds remain unchanged.

## Verification and practical limits

All **1,057 automated tests** and the production build pass. Tests cover speed thresholds, reflection, tangents, moving-surface relative velocity, mass exchange, energy bounds, extreme travel, corners, crowd budgets, all 12 generated Arena archetypes, actual ricochet paths over lava, recovery, Dash and relocation. Existing combat, ammunition, floor, infusion and controlled-boss tests remain intact.

Browser fixtures deploy through the real menu/loading path in an isolated profile. They exercise actual Arcade contacts, low-speed wall holding, Dash, 265–8000px/s wall approaches, post-sweep separation containment, small/heavy enemies, shields and iframes, enemy chains, moving support, rebound-induced lava falls, controlled artillery, pooled effects, teardown, fences, deployables, Relay, Echo and full rendered boosted movement with live gamepad input. Additional existing floor tests cover all moving-floor actors, navigation, placement, projectile behavior and anomaly return.

Both normal and reduced-effects fixtures pass, including changing the particle setting through the Options-return handler while impacts are active. The extended lava audit covers all three controlled boss frames and their recovery presentation. A hardware-rendered outer-wall impact was visually inspected in `artifacts/kinetic-impact.png`.

Performance numbers and rendered-art review are recorded in the validation file. Hardware testing uses Edge/ANGLE on an RTX 5070 at 1600×1000. The Supreme 26 loadout includes full permanent upgrades, rank-three Supreme mods, controlled artillery and native spawn-pressure limits, followed by turrets, fences and mines. A separate synthetic force sample repeatedly launches up to 24 enemies to exercise contact work. The disabled-control sample retains the same runtime scaffolding and disables kinetic body responses; it is not a checkout of the old build, and live combat is not an identical event replay.

Six-second samples on the final physics implementation measured:

| Supreme round 26 scenario | Mean / p95 frame time | Mean complete Arcade update CPU | Disabled-control Arcade CPU |
| --- | ---: | ---: | ---: |
| Operative | 16.67 / 17.00ms | 0.083ms | 0.068ms |
| Controlled artillery | 16.67 / 17.00ms | 0.120ms | 0.114ms |
| Artillery and floor activity | 16.73 / 17.20ms | 0.120ms | 0.134ms |
| Artillery and deployed defenses | 16.93 / 18.90ms | 0.475ms | 0.489ms |
| Synthetic knockback bursts | 16.66 / 16.90ms | 0.202ms | — |

The defense sample reached **626 projectiles**, with one **48.2ms** frame; the other enabled samples had no frames over 33ms. Native population peaked at 31 enemies. The burst sample's peak extra broad-phase work was 95 visits, within the 768-visit budget. The complete Arcade update is measured through its registered scene-event listener, including the first physics step; wrapping `world.step` alone would miss that work. These results show a small physics cost on this machine, but do not establish hitch-free gameplay.

These are desktop measurements, not a low-end-device guarantee or a substitute for human movement-feel tuning. Work budgets deliberately bound extra body contacts under extreme crowding; original colliders remain in place when the extra budget is exhausted. Numerical sweep exhaustion stops remaining travel at a safe point for that step while retaining velocity. Dedicated rebound audio awaits an asset.

Reproduce with a hardware-enabled isolated DEV browser on CDP port 9225, reloading between fixtures:

```powershell
npm.cmd test
npm.cmd run build
node scripts/run-layout-audit.mjs artifacts/kinetic-slingshot-after.json ./audit-kinetic-slingshot.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/kinetic-browser.json ./audit-kinetic.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/kinetic-abilities.json ./audit-kinetic-abilities.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/kinetic-floor-browser.json ./audit-dynamic-floor.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/kinetic-lava-recovery.json ./audit-lava-recovery.browser.js 1600x1000
$env:N3ON_LAYOUT_OPTIONS='{"particles":false}'
node scripts/run-layout-audit.mjs artifacts/kinetic-reduced.json ./audit-kinetic.browser.js 1600x1000
$env:N3ON_LAYOUT_OPTIONS='{"sampleMs":6000,"kinetic":true,"kineticStress":true}'
node scripts/run-layout-audit.mjs artifacts/kinetic-performance-on.json ./audit-supreme-boss-performance.browser.js 1600x1000
$env:N3ON_LAYOUT_OPTIONS='{"sampleMs":6000,"kinetic":false}'
node scripts/run-layout-audit.mjs artifacts/kinetic-performance-off.json ./audit-supreme-boss-performance.browser.js 1600x1000
```
