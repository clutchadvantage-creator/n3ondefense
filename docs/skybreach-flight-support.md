# SkyBreach health relief, seeking rockets and city combat presentation

October 13, 2026. Follow-up to [difficulty and city grounding](skybreach-balance-and-city.md).

## Health relief

The previous shared eight-second health/energy gate could postpone critical health after an energy drop. Scheduled pickups also started far above the player, and a fixed 28 HP restore had little effect on upgraded health pools.

- An additional enemy-kill health roll grows from 8% at 75% HP to 50% at 25% HP. Pickup-chance Mods still apply, with a 65% ceiling for this additional roll. Normal enemy loot rolls remain intact.
- At 35% HP or lower, health uses its own 4.5-second enemy-drop spacing, with at least 1.8 seconds between any two resources. With no health present, a 4–6 active-second drought offers a timed health pickup, subject to 6.5 seconds since the previous health drop. This also works in boss phases without kills.
- Critical health appears within 140px horizontally and approximately 140px ahead of the player, clamped to the play area. Ordinary timed health arrives 240px ahead. Neither pickup is automatically collected.
- At most one health and one energy pickup coexist. Collecting one does not immediately refill its slot. Critical health does not continually postpone the ambient energy schedule.
- SkyBreach health restores the larger of the existing base amount or 22% of maximum HP, then applies equipped health-pickup Mods and existing resource caps. Arena and HEIST retain their original amounts.

## Mine charges become rockets

The existing mine button launches a seeking rocket in SkyBreach; the HUD labels it **ROCKET**. No new binding or aim action is required. The exact Arena `MineChargeRack` instance remains authoritative, including current charges, capacity, recharge progress and deployment delay. Energy cost, damage, blast radius, arming time and existing radial damage rules come from the equipped mine configuration.

Full Rack Salvo retains its hold/tap controls, full-rack charge consumption, energy discount and stagger. Magnetic Payload retains its pre-detonation pull and rank-three slow. Anchored AA and Dreadnought weapons cannot be pulled from their structures. Rockets exclude the armored reactor, choose the closest living target, reacquire after death and brake on approach to avoid circling a close target indefinitely. Swept contact handles travel between frames. Rocket flight, arming and delayed detonation use active mission time, so pausing does not expire them.

Rendering is limited to 32 reusable rocket/exhaust pairs. When full, launch is denied without spending charges or energy. Untriggered rockets expire eight seconds after arming; leaving the anomaly discards their render/model references. The Arena resumes with ordinary mines and the same charge rack.

## AA, hardpoints and streets

AA buildings and ground shadows now belong to the city rather than the turret's decoration list. A destroyed turret leaves its building intact, with a rooftop wreck and smoke that continue scrolling to the edge. Reusable AA sites are capped at 24; overload spawns beyond that scenery budget become aircraft instead of floating turrets. City structures still have no collision bodies.

AA and Dreadnought hardpoints use staged white-hot ignition, an elliptical shockwave, fire, smoke, a tumbling cannon assembly and secondary electrical/mechanical fragments. Eight fixed celebration slots share the established mechanical destruction pool. Debris and burst pools are warmed during scene setup. Reduced particles use fewer smoke layers and omit mechanical fragments. Existing AudioManager sound effects and volume rules apply. No per-death textures, physics debris, runtime filters, timers or tweens were added by these effects.

The ground texture is now a continuous six-lane highway: three lanes each way, median, shoulders, direction arrows, gantry exit signs and neon N3ONDEFENSE, FLUX CORE, LYRA LINK and RWG ARMORY billboards. The 512×2048 texture is baked once and scrolled beneath the existing vertical city. Tank lanes, gameplay camera and collision rules remain unchanged.

## Verification

All 1,038 automated tests and the production build pass. Six browser fixtures pass 479 checks across Normal, Overdrive, Supreme, reduced particles, city scrolling and supplies. [Recorded validation](skybreach-flight-support-validation.json) includes the fixture counts and performance samples. Focused tests cover seeded health odds, critical drought relief, resource caps, energy availability, target selection, re-acquisition, arming, contact and long-fuse guidance. Browser fixtures cover actual Arena handoff, three/five-charge racks, costs, Full Rack Salvo, Magnetic Payload, visible HUD labeling, building survival, staged effects, resource restoration, offscreen health placement, bounded stress and return cleanup.

At 1600×1000 on the RTX 5070, the five-second crowded-combat samples measured:

| Scenario | Median frame | 95th percentile | Maximum frame |
| --- | ---: | ---: | ---: |
| Normal round 9 | 16.7ms | 16.9ms | 17.0ms |
| Supreme round 26 | 16.7ms | 16.9ms | 17.0ms |
| Normal, reduced particles | 16.7ms | 16.9ms | 17.3ms |

Reproduce in the isolated hardware-enabled DEV browser on port 9225:

```powershell
node scripts/run-layout-audit.mjs artifacts/skybreach-flight-normal.json ./audit-skybreach-flight-support.browser.js 1600x1000
$env:N3ON_LAYOUT_OPTIONS='{"mode":"supreme"}'
node scripts/run-layout-audit.mjs artifacts/skybreach-flight-supreme.json ./audit-skybreach-flight-support.browser.js 1600x1000
$env:N3ON_LAYOUT_OPTIONS='{"particles":false}'
node scripts/run-layout-audit.mjs artifacts/skybreach-flight-reduced.json ./audit-skybreach-flight-support.browser.js 1600x1000
```

The stress sample starts at the mode's live enemy cap, 32 rockets, 160 hostile shots and eight destruction effects. It is a short assisted desktop measurement, not a guarantee for low-end hardware or every loadout. Tuning still benefits from human completion-rate and health-pickup observations.
