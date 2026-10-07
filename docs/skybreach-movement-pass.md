# SkyBreach movement and combat feedback

Historical pass. The [difficulty parity and combat polish report](skybreach-polish.md) supersedes its scaling, drone offense, flight-pattern, boss and environment details.

The supplied movement guide is choreography reference only. All ships, drones, tanks, platforms, textures, colors, and environment art remain the existing game assets.

## Behavior

- Fighters accelerate into committed attack passes, bank toward a flank, climb, and reacquire for another pass. Entry formations retain their positions; crossing/diagonal passes and S-turns vary their paths. Strike aircraft turn more slowly and commit to heavier passes. Zeppelins hold an upper combat position.
- Surviving aircraft no longer switch to an exit at nine seconds or disappear at 34 seconds. Boundary steering recovers overshoots without teleporting. Authored recovery sections and the boss transition still explicitly clear the previous encounter.
- Drones independently orbit, hover, bob, and make lateral corrections. Local avoidance spreads close neighbors, including exact overlaps. Steering phases are unique per spawn; movement uses active simulation time.
- Tanks spawn in compact patrols of three: one lead vehicle with two abreast behind it. A road must clear before another patrol enters, and a patrol waits if the encounter cap has fewer than three free slots. Groups follow the existing industrial texture's road lanes in the lower combat region below the cloud decks, at the ground layer's scrolling speed. They have no platform decoration. AA retains its existing elevated platform, rendering depth, and faster platform scroll. Ground emplacements leave with their terrain; they are not returning aircraft.
- Existing enemy health, projectile damage, modifiers, drops, encounter caps, fees, and rewards retain their shared owners.

## Reused feedback and lifecycle

SkyBreach now instantiates the arena's `MechanicalDestructionVfx` using the anomaly's existing circle pool and particle preference. Role deaths emit the existing drone/shooter/tank debris profiles; destroyed Dreadnought hardpoints also emit the tank profile. The shared component retains its 168-fragment and 96-burst limits, pooling, degradation, and expiration. Scene shutdown discards its references after Phaser destroys scene-owned render objects.

Shared hit flashes and projectile impacts remain in place. Successful damage requests the existing `hit` cue, limited to one per 85 ms in active mission time. Deaths use the existing `enemyDeath` audio path, including its interval throttle and four-voice pool. Existing boss explosion effects and cues remain intact. Arena and HEIST implementations are unchanged.

## Verification

Completed: 808 automated tests, 223 existing live integration checks across all three modes, 19 focused live movement/destruction checks, and the production build. No check failures remained.

- Pure movement tests cover all seven aircraft formations and three entry positions over two simulated minutes, repeated return passes, bounded movement, exact-overlap drone separation, pause behavior, and ground/platform scroll rates.
- `scripts/audit-skybreach.browser.js` verifies existing Normal/Overdrive/Supreme combat, boss progression, extraction/failure, and Arena restoration.
- `scripts/audit-skybreach-movement.browser.js` runs after the existing fixture's preview setup. It checks live persistence past 34 seconds, repeated passes, drone spacing, tank/AA staging, role deaths, shared sound dispatch, bounded pooled VFX, effect expiration, and return cleanup.

Browser fixtures use isolated test profiles, invulnerability, and accelerated or controlled encounter setup; they verify integration rather than human difficulty balance. The more persistent and aggressive enemies still need player feedback for feel tuning.
