# Projectile cosmetics, premium effects and mechanical Arena floors

Implemented and verified 2026-10-12. Machine-readable results: [dynamic-floor-validation.json](dynamic-floor-validation.json).

## Projectile identity and cosmetic effects

Grenade Rounds and Scattershot retain equipped artwork, authored dimensions and native palette in Arena and shared anomaly combat (including Heist). Echo retains its recorded artwork and existing cyan replay treatment; Weapon Sync inherits equipped art for special ammunition. Visual profiles and ammunition collision dimensions are independent. Existing speed, seven-pellet spread, damage, arc, bounce, fuse, ricochet and lifetime rules remain authoritative.

All eight legacy bombsite signatures now use cached vector layers and a shared scene-clock renderer: Violet Plasma, Scarlet Heat, Cryo Shatter, Emerald Ion, Solar Flare, Prism Spectrum, Death Signal and Neon Bloom. Ignition, rising themed artwork, shockwaves, fragments and afterglow replace the old effects. Completed Halloween/Tug Life implementations, IDs, prices, saves, audio and damage remain compatible. Six pooled celebrations are allowed (four with particles disabled); crowded/reduced effects use fewer fragments. SVG shading/glow is baked into textures at boot without runtime filters.

Applicable operative, turret and mine families now supply matching fences through the existing `fenceStyle` catalog/equipped slot. Cached pylons and fixed beam/pip objects provide activation, current, shock, damage, expiry and Rail feedback. Combat retirement adds bounded endpoint impacts, including generated links; shutdown creates no effects. Endpoints, health, obstruction, damage and Link/Rail mechanics remain authoritative. Witch, Bats and Pumpkin each now have six pieces (18 seasonal items), including fences. Existing holiday calendar and owned-item availability remain intact.

## Mechanical floor architecture

- `DynamicFloorModel`: seeded cassette placement, phases, translated deck footprints and actual exposed gaps. Each cassette has a hatch and adjacent stationary receiver covering its recessed storage channel. The deck physically slides beneath the receiver.
- `DynamicFloorVisual`: cached deck, receiver, lava and ember textures follow the model. No timers, tweens, input or physics bodies.
- `DynamicFloorActors`: adapters for existing players, bosses, enemies, deployables and pickups. Entire footprints ride the deck until reaching the receiver. Sweeps stop walking enemies at edges; lost support/knockback cause falls. Drones are exempt. Dash crosses gaps but unsupported landings fall.
- `DynamicFloorConnectivity`: existing GridPathfinder validates fully open hatches with static walls and live fences. Full-open gaps contain every intermediate opening, covering the entire slide. Spawn/objective connectivity and the player's current safe region remain accessible. Invalid candidates are rejected; events with no valid candidates are skipped.

Phases: stable → warning → unlock → retract → exposed lava → restoration warning → return → lock. The first warning also displays an instruction to move off amber panels. A sparse navigation overlay changes only on phase transitions or 8px displacement. Only nearby enemies and paths crossing affected regions are invalidated; the existing per-frame path-query budget remains. No per-frame full-map rebuild.

Only active Arena gameplay advances the clock. Pause and anomaly suspension freeze it; round retirement releases drivers, visuals and navigation. Training rounds 1–3 exclude the system. Boss arenas default to disabled, and roaming bosses request restoration/suspend new events. `bossesEnabled` is an explicit opt-in for future encounter tuning; controlled boss frames already participate as the player.

## Support, recovery and abilities

Falling suspends movement, attacks, planting and abilities. Existing health/death handling applies lava damage; survivors visibly eject onto nearby valid floor. Recovery excludes walls, fences, bombsites, pending gaps, floor fire and occupied landing spots. With no local landing, the floor restores instead of teleporting the actor across the map. Environmental grace adds no immunity to enemy attacks.

Turrets, landed mines, death mines and pickups ride or fall. Falling deployables cannot attack; lost mines do not award explosions and lost pickups do not award resources. Placement, Relay landings, Echo origins/returns, Link and Rail reject unsafe/warned support. Fences remain rigid: events avoid existing segments and new segments avoid planned openings. Unexpected lost support retires the segment and dependent links.

Airborne bullets, missiles and scatter pellets cross gaps. Grenades landing over a gap request their existing detonation without consuming an invisible floor bounce. Ground mine damage, magnetic attraction, brawler ground attacks and floor-fire contact respect gaps; wall jets remain airborne. Anomaly portals avoid cassette footprints; return navigation checks support and resets teleport tracking.

## Central tuning

Configuration: [`src/game/config/dynamicFloor.ts`](../src/game/config/dynamicFloor.ts).

| Setting | Normal | Overdrive | Supreme |
| --- | ---: | ---: | ---: |
| First warning after active round time | 70s | 60s | 55s |
| Scheduled interval, initial → minimum | 52s → 32s | 47s → 29s | 43s → 27s |
| Maximum simultaneous panels | 2 | 3 | 4 |
| Maximum pattern complexity | 2 | 3 | 3 |

Intensity grows over 180 seconds after the first delay. Events cannot overlap. Shared timing: 3.2s warning, 0.45s unlock, 1.6s slide each way, 6.5–10s exposed, 1.5s restoration warning and 0.6s lock. At most 12 candidate cassettes; 112×96 hatches; minimum 88% solid arena bounds; objective exclusion 124px and spawn exclusion 88px. Patterns alternate separated openings and nearby rows/clusters within mode caps.

Player/controlled-frame damage: 35% of maximum health. Ordinary enemy damage: 80 + 55% of maximum health. Fall: 420ms; ejection: 720ms with a 108px base arc and a preferred 112px throw; recovery search: at most 224px; repeat environmental protection: 1.4s. Long frame stalls are capped at 100ms simulation advance to preserve warning/fall presentation.

Warning/restoration use existing `beep` through AudioManager and its volume settings. Lava uses existing player-damage audio, including controlled frames. The centralized audio map has phase/ejection hooks. Dedicated unlock, slide, heavy machinery/locking, lava ambience and ejection assets are **not supplied**; those slots deliberately remain silent. Register future assets through the existing audio catalog/settings, then assign the hooks. No new audio loops or unrelated substitutes were introduced.

## Verification and limits

- Full automated suite and production build pass. Tests cover continuous/partial support, sweeps, riders, knockback, drones, large footprints, damage/recovery, dash landings, fences, connectivity, cleanup, archetypes, boss policy and bounded navigation work.
- Live isolated-profile audit deploys Normal round 9 through menu/loading; checks pooled normal/grenade/scatter art and collision, Echo/Weapon Sync in Arena and Heist, themed fence placement, all celebrations, player/tank/drone/deployable/controlled-boss behavior, grenade contact, placement, pause, reconstruction, anomaly return and round teardown/recreation.
- Halloween purchases, previews, persistence, calendar rollover and equipped combat presentation pass with 18 items. Floor and legacy explosion/fence artwork were inspected in hardware-rendered browser screenshots.
- Hardware WebGL measurements compare floor-disabled, warning/slide, open/reconstruction and laser controls in Normal rounds 9/14 at 1600×1000. The validation JSON records frame times, floor update costs and event-validation timings.

These desktop RTX 5070 measurements cover ordinary Normal combat pressure, not low-end hardware or maximum-mod Supreme loadouts. Retain conservative timing and boss exclusion initially; use active-round duration/fall telemetry before reducing delays. Lava uses bounded top-down glow/embers rather than screen-wide distortion. Dynamic floors belong to Arena; anomaly scenes retain existing terrain.

The [October 13 follow-up](lava-recovery-and-boss-performance.md) adds full-footprint Flux Core support, a fiery ballistic recovery, exact circular corner sweeps, throttled blocked-recovery searches, and Supreme round 26 artillery stress measurements. Its validation and limits are recorded separately from the initial Normal-mode measurements above.

Reproduce with `npm.cmd test`, `npm.cmd run build`, and an isolated hardware-enabled DEV browser on CDP port 9225:

```powershell
node scripts/run-layout-audit.mjs artifacts/dynamic-floor-browser.json ./audit-dynamic-floor.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/halloween-fences-browser.json ./audit-halloween.browser.js 1600x1000
$env:N3ON_LAYOUT_OPTIONS='{"rounds":[9,14],"sampleMs":5000,"dynamicFloor":true}'
node scripts/run-layout-audit.mjs artifacts/dynamic-floor-performance.json ./audit-normal-performance.browser.js 1600x1000
```
