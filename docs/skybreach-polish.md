# SkyBreach difficulty parity, Dreadnought scaling and combat polish

Completed locally on October 5, 2026. This report supersedes the durability, drone offense, boss scheduling and encounter restrictions in the earlier SkyBreach reports. Validation: **855 automated tests, production build, and 299 browser assertions passed**. [Compact evidence](skybreach-polish-validation.json).

## Scope and shared code

All gameplay additions in this pass belong to SkyBreach. The necessary shared changes are an extraction of Arena's existing enemy-stat and boss-stage calculations into `ArenaCombatScaling.ts`, two optional anomaly entry-snapshot fields, and exporting the existing `HeistProjectile` TypeScript interface. Arena now calls the extracted calculation; its balance settings, encounters, presentation and progression are unchanged. HEIST's interface export emits no runtime code. An existing source-level test now checks the shared call site, with numerical preservation covered separately.

The earlier mistaken investigation of System Infusions performed reads and ran tests; it made no code changes. This pass does not change Infusions, LYRA, campaign rules, Access Card prices/quotas, fees, reward formulas or deployment configuration. The validation results below were collected locally before the requested commit and push; production deployment was not verified.

## Tested health benchmarks

These are real values from the current Arena formulas. Local boss selection happens before converting to the existing combat position. Supreme uses the constellation belonging to that selected boss round. Boss 30's benchmark is one ordinary Arena boss, not the combined Trinity health.

| Entry mode / round | Nearest local boss | Combat position | Arena boss / each hardpoint HP | Core HP |
| --- | ---: | ---: | ---: | ---: |
| Normal 6 | 5 | 5 | 5,472 | 10,944 |
| Normal 8 | 10 | 10 | 6,916 | 13,832 |
| Normal 11 | 10 | 10 | 6,916 | 13,832 |
| Normal 14 | 15 | 15 | 8,360 | 16,720 |
| Overdrive 8 | 10 | 40 | 20,500 | 41,000 |
| Overdrive 14 | 15 | 45 | 22,400 | 44,800 |
| Supreme 24 | 25 / Capricornus | 133 | 48,384 | 96,768 |
| Supreme 29 | 30 / Centaurus | 148 | 52,640 | 105,280 |

Normal 14, Overdrive 8 and Supreme 24 were also exercised through actual Arena → SkyBreach → Arena handoffs. All eight rows have explicit automated boundary tests; every local round is checked for nearest scheduled-boss selection.

## Implementation report

1. **Current-round scaling:** Entry captures the Arena's actual curve, destroyed-site contribution, active combat phase, Contract health modifier, pressure count, reward multiplier and nearest-boss benchmark. Existing mode, local round, protocol and shared player/Mod runtime continue in the session. `arenaEnemyScaling` and `scaleArenaEnemyStats` serve both Arena spawns and SkyBreach. Mode/stage is applied once. The captured phase preserves Arena's existing 0.9 pre-plant interpolation.

2. **Removed scaling:** Drone 1.35, interceptor 1.65, strike 2.8, tank 1.5 and AA 1.8 health multipliers are removed. Hardpoints no longer receive 14% of the entry-position family-only boss health; the core no longer receives 75%. The old SkyBreach-only Contract multiplier on boss HP is removed because Arena bosses do not apply that modifier. Supreme's previously omitted boss-stage adjustment now comes from the shared calculation.

3. **Ordinary enemies:** Drones use drone base stats; fighters use shooter base stats; tanks and AA use tank base stats. HP, damage and speed receive the same captured Arena scaling and rounding. Zeppelin health retains its explicitly identified heavy-class factor of seven on top of the scaled tank base; its damage uses the same current-round pipeline. Reinforcements use these same spawns. Artillery damage continues to use the entry-round damage scaling. Existing curve caps still apply: consecutive late rounds can legitimately share values.

4. **Boss selection:** `arenaBossBenchmark` uses `round(currentLocalRound / 5) * 5`, clamped to the current mode's scheduled 5–30 bosses. It resolves that boss round's campaign protocol and combat position, then uses `getBossHealth` plus Arena's existing stage delta. Boss weapon damage uses the actual entry round and entry protocol through `arenaBossDamage`.

5. **Hardpoints:** Each of the seven required major weapons receives exactly **H**, the selected Arena benchmark health. They remain independently targetable and retire their own queued attacks when destroyed.

6. **Core:** The reactor receives exactly **2H** and remains invulnerable, including to Echo, until all seven weapons are destroyed. That doubling is never applied to hardpoints. Total required durability is consequently 9H before incidental damage interactions.

7. **Real benchmark examples:** The table above records the eight requested cases. F6 in a DEV SkyBreach scene displays mode, entry round, enemy multipliers, selected boss round/protocol, H and 2H. `n3onGame.scene.keys['anomaly-skybreach'].getScalingDiagnostics()` additionally exposes per-weapon health/fire counts, reinforcement selection and bounded projectile counts.

8. **Boss offense:** `DreadnoughtCrossfire` schedules at most two families per combination: cannon/broadside, missile/cannon, artillery/broadside, cannon/escort or missile/escort. Secondary attacks begin 600–1,000 ms later. Combinations have a 5.2-second interval before bounded pressure scaling. Pending cues, bursts, ordinary aircraft, missiles and artillery markers all have limits. Slow lateral drift varies amplitude and reverses smoothly, changing firing geometry.

9. **Forward weapons:** The old path used weak attachments and cycled through isolated families. Both forward cannons now participate in the opening combination after a 400 ms muzzle warning, with a living-owner check and an offset muzzle origin. The left fires heavy shells; the right fires rapid kinetic bursts. A reset-counter browser check observed both fire during the opening, and the full fixture observed all seven weapon mounts fire. Destroying the front weapon cancels its remaining burst.

10. **Destruction:** A destroyed weapon exposes a persistent cached procedural wreck with jagged plating, cracks, charred recesses, machinery, exposed conduits and internal lights. A separate cached electrical layer flickers blue arcs/yellow sparks; smoke remains until final ship destruction. The shared mechanical debris system supplies the initial rupture. Wrecks follow the moving hull and retire with it.

11. **Projectiles and warnings:** Heavy shell, kinetic, plasma and flak textures are baked once; seekers reuse the Arena missile body, bounded steering, trail and impact effects. Physical shots have visible bodies and no continuous neon trails. Short lock/muzzle markers replace the ordinary long trajectory lines. Artillery retains the shared impact telegraph. Destroying a weapon cancels unlaunched fire; already-fired projectiles remain active.

12. **Drones:** The old shooting branch explicitly excluded drones while their orbit kept them away from contact damage. SkyBreach now reuses `DroneBurstWeapon` for player acquisition and three-shot bursts, with attack, bank-away and reposition phases. Disabling a drone suppresses fire. The browser verified an actual drone projectile reaching the shared player-damage path.

13. **Tanks:** Patrols retain their three-vehicle road formation and ground scroll layer. Attacks reuse `TANK_HOMING_MISSILE_BALANCE`, `getTankHomingMissileSpeed` and `steerTankHomingMissile`: the same range, cooldown, lifetime, speed, turn limit, interceptable missile health and mode-scaled missile damage as Arena. The existing Arena missile damage rule is mode-based; this pass does not add a new round multiplier to it. Player projectiles can intercept seekers. One live seeker per tank is allowed.

14. **Banking:** Fighters select among five cached perspective frames per aircraft type. The generated wings change projected span, shear and shading; a smoothed roll value and slight vertical squash augment world rotation. Corkscrew and rolling-entry maneuvers explicitly drive roll; other maneuvers derive it from heading changes. No SVG/Canvas tree is generated per frame.

15. **Corkscrew Assault:** Opposed left/right groups converge into phase-offset looping paths while progressing down the corridor. Group and slot offsets form intertwined crossings; cached roll frames show alternating wing perspective. Fighters fire during the maneuver and transition into their normal return-pass steering afterward.

16. **Airships:** The heavy-class health factor remains tied to current-round Arena scaling. Two additional seeded airship opportunities supplement the authored Zeppelin sector, with alternating entry sides, a 28-second cooldown and at most one ordinary live airship. Offense rotates plasma, seeker and flak volleys while retaining bounded drone launches. Some boss reinforcement plans include an airship.

17. **Encounter variation:** A seeded eleven-sector plan preserves the opening, service window and final approach while varying middle-sector order, flight patterns, recovery duration and airship opportunities. The reusable movement library includes banked dives, scissors, pincers, spirals, rolling entries, escort breaks and existing return passes. Each boss seed selects three reinforcement roles: drones, one fighter class and one of airship/AA/tanks. All roles do not appear in every boss fight.

18. **City:** The cached scrolling city texture now contains continuous roads, intersections/crosswalks, repeated city blocks, roof edges/windows, landing pads, rooftop machinery, vents, antennas, signs and light conduits. Existing layered clouds, elevated structures, bridges and scrolling defensive platforms supply haze and depth. Tanks track the rendered road coordinates below the cloud decks; AA remains attached to its elevated platform.

19. **Performance:** The existing ordinary-enemy ceiling remains 24. New hostile shots are capped at 160, including at most 12 seekers; queued boss cues cap at four, bursts at eight and artillery markers at four. Shared destruction retains 168 fragments and 96 bursts. Source SkyBreach textures total 2,898,544 pixels, approximately 11.06 MiB of RGBA source storage, not measured GPU residency. The final six-second Supreme 24 sample contained 24 ordinary enemies plus six surviving hardpoints and the core. Its 360 raw frame intervals averaged **16.6525 ms**, p95 **16.9 ms**, maximum **17.1 ms**. Scene update work averaged **0.493 ms** and renderer CPU **2.550 ms**. This is a short absolute observation, not a before/after performance claim.

20. **Validation:** All 855 automated tests and the production build pass. Fifteen new tests include the eight requested benchmarks, nearest-round coverage across the campaign, numerical preservation across 12,960 role/mode/round/phase/Contract/destroyed-site combinations, all 128 surviving-hardpoint subsets, seeded plans, long bounded flight paths and heavy drift. Browser evidence totals 299 assertions: 251 integration checks across Normal 14/Overdrive 8/Supreme 24, 41 focused combat/debug checks, and seven post-stress retirement checks. Integration covers physical loot, escrow, successful and failed returns, Access Card use/cancellation/HEIST redirection, shared abilities/ammo/Supreme effects, and all authored sectors. No page errors or unhandled rejections were captured. Scene-owned visuals, attack queues, seekers and projectiles retired successfully.

21. **Limits:** Assisted fixtures use invulnerability, accelerated hardpoint destruction, controlled encounter setup and raised ordinary-enemy HP for performance samples. The stress composition includes more simultaneous airships than normal production spawning permits. These checks do not establish unassisted Dreadnought completion time, physical-controller feel, subjective audio balance, low-end GPU performance or a full-flight soak. With seven H-health weapons plus a 2H core, actual build-dependent kill times need player feedback before any further tuning. No unrelated economy, fee, reward or campaign change is included.

## Reproduction

Use an isolated DEV browser on debugging port 9225 and Vite on 5173. Run fixtures sequentially, without builds/source edits during performance sampling. The normal integration fixture covers the default three modes; `__skyTestModes` can select the tested local rounds above.

```powershell
npm.cmd test
npm.cmd run build
node scripts/run-layout-audit.mjs artifacts/sky-parity-integration.json ./audit-skybreach.browser.js
```

For the focused fixture, reload, set `__skyPreview=true` and `__skyTestModes=[['supreme',24]]`, then run the existing fixture to prepare a real Arena handoff and Dreadnought. Run `audit-skybreach-polish.browser.js`, capture the paused scene, and run `audit-skybreach-polish-retirement.browser.js`. `summarize-skybreach-polish.mjs` consumes the named reports and successful build/test logs; it is not a fresh-checkout prerequisite. [Reviewed Supreme screenshot](../artifacts/sky-polish-supreme.png). Raw reports and browser profiles stay in ignored `artifacts/`.
