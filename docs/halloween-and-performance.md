# Halloween collections and Normal combat performance

## Delivered

Three complete five-piece Halloween collections: **HEXCRAFT** (Witch), **NIGHTSWARM** (Bats), and **JACK-O-REACTOR** (Pumpkin). Each includes an operative frame, turret, mine, projectile and bombsite signature. Existing Witch/Bats bomb IDs and prices are preserved. All additions are cosmetic; collision bodies, damage, targeting and combat balance remain unchanged.

Authored SVG supplies both storefront art and preloaded combat textures. Bombsite celebrations last 4.2 seconds: rising character/reveal, independent jaws/hands/wing motion, orbiting accents, a second burst and dispersal. They use reusable display objects, scene time and the existing six-slot effect cap (four with particles disabled). Overlapping signatures reduce detail automatically. No per-frame textures, timers, tweens or physics objects are created. Scene teardown destroys the owned visuals; the existing round handoff waits for the finale. Existing AudioManager routing and volume controls apply.

The seasonal store uses inclusive local-calendar dates every year:

| Holiday | Store window |
| --- | --- |
| Halloween | October 1–November 1 |
| Christmas | December 5–January 3 |
| July 4 | June 24–July 5 |

The Halloween collection is featured in-season, with five-piece ownership progress and direct set navigation. Calendar rollover refreshes an open store and cancels a stale purchase confirmation. The purchase service also rejects unowned out-of-season items without spending currency. Owned pieces remain in the full catalog and can be equipped year-round. Christmas and July windows support future tagged items; this change authors only the three requested Halloween sets.

## Performance finding and fix

The Normal round 9+ CPU profile showed `TutorialDirector.ownsProfile()` calling the persisted profile-summary path on weapon-fired, enemy-damaged and kill events. That path repeatedly read the profile index and parsed/normalized **every saved profile**, sometimes several times per event. The work scales with combat events, save size and profile count.

`PlayerProfileStore.getLoadedProfileId()` now exposes the live session identity without storage access or allocations. The tutorial director uses it for ownership checks, preserving protection against callbacks from an old/deleted profile. Persistence, save validation and profile-menu refresh behavior are unchanged.

The laser diagnosis compared current clipped pinwheels, the pre-clipping implementation and lasers disabled. Spikes persisted with the old implementation and with lasers off. No laser bounds, hazard timing, spawn caps or difficulty changes were needed for this fix.

## Verification

- **979 tests passed**, including repeated combat events with a failing persisted-summary stub, profile switching/clearing, tutorial idempotency, save compatibility, seasonal boundaries and complete set coverage.
- **Production build passed** (`npm run build`).
- **111 browser checks passed**: readable card artwork/names, actual store confirmation and exact multi-currency charge, no duplicate charge, equip and saved-profile reload, calendar rollover, next-year recurrence, combat textures/placement, ordinary collision radius, real bombsite detonation, round-handoff hold, animated phases, reduced detail and bounded reuse.
- Live visual review of all 15 pieces and the Witch, Bats and Pumpkin Arena celebrations.

Normal combat measurement used Edge/WebGL on RTX 5070, 1576×908, seed 550055, half-max permanent upgrades, no mods, existing enemy count/weight caps, simulated movement/firing and an invulnerable test operative. Five-second windows include instrumentation overhead. Combat outcomes vary, so these are controlled diagnostic observations, not a guarantee for other hardware or every loadout. The initial software-renderer attempt was excluded.

| Normal scenario | Mean frame ms before → after | p95 frame ms before → after | Mean update CPU ms before → after |
| --- | --- | --- | --- |
| Round 9, natural | 18.66 → 16.67 | 33.40 → 17.10 | 7.05 → 0.98 |
| Round 9, clipped pinwheel | 20.01 → 16.67 | 34.30 → 17.00 | 7.23 → 0.97 |
| Round 14, natural | 19.87 → 16.67 | 37.50 → 17.00 | 9.11 → 1.00 |
| Round 14, clipped pinwheel | 21.36 → 16.67 | 33.90 → 17.00 | 10.99 → 1.01 |

Each Halloween signature, plus six overlapping signatures, was measured over a paused Arena to isolate presentation cost across the full animation. Mean frames remained 16.67 ms; six overlapping effects added about 0.09 ms render CPU over the 2.16 ms baseline and used 0.05 ms mean effect-update CPU. Display-object count stayed constant after warmup, and all effects expired. This complements the live-combat measurement above; it does not simulate six simultaneous detonations with a full enemy wave.

Detailed measured results and browser assertions: [halloween-and-performance-validation.json](halloween-and-performance-validation.json).

## Reproduce locally

Use the existing isolated DEV browser/CDP workflow on port 9225; do not use a real player profile. Fixtures create their own local test profiles. Run one at a time:

```powershell
node scripts/run-layout-audit.mjs artifacts/normal-performance.json ./audit-normal-performance.browser.js
node scripts/run-layout-audit.mjs artifacts/halloween-audit.json ./audit-halloween.browser.js 1366x768
node scripts/run-layout-audit.mjs artifacts/halloween-performance.json ./audit-halloween-performance.browser.js
```

The effects performance fixture intentionally uses the paused Arena left by the Halloween integration fixture. The Normal fixture defaults to rounds 9 and 14 with natural, forced clipped-pinwheel and laser-off windows. Its optional `legacyLaserModule` is only for diagnostic A/B comparisons with a locally prepared historical module; it is not required for regular verification.
