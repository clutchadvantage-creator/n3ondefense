# Flux Core support, lava recovery and Supreme boss performance

Verified October 13, 2026. Results: [lava-recovery-validation.json](lava-recovery-validation.json).

Flux Core deployment now checks the entire 76×92 footprint against exposed lava. Stable panels and supported portions of moving decks remain eligible. Containers on a moving deck travel onto its receiver, including their floor-hatch visuals. New floor events avoid existing containers. Unexpected support loss retires the container without loot or laser-shutdown credit and schedules a replacement within the existing deployment cycle.

Lava survivors launch along a 720ms ballistic arc with a brief tumble, fire, smoke, cinders, an eruption ring and landing feedback. Recovery prefers a 112px throw, retaining the existing local 224px safety limit and a shorter safe fallback in tight spaces. The base visual height is 108px. Damage and enemy-attack vulnerability are unchanged. Circular sweep corners now agree with actual support, preventing a safely landed large boss from immediately falling again. Blocked recovery searches retry at most every 200ms while the floor restores.

Recovery presentation uses cached SVG textures and fixed pools: 88 display objects with particles enabled, 34 with particles disabled. The active floor clock drives all effects. No new timers, physics bodies, tweens, runtime textures or shaders are created. All three controlled boss frames recover their full layered pose. Pause freezes the sequence; teardown destroys every owned effect. Camera impulses respect the existing screen-shake option. Existing damage audio and unassigned dedicated-audio hooks remain unchanged.

## Supreme round 26 diagnosis

The busy artillery reproduction showed large rendering cost from projectile trails. The existing reusable sample pool still asked Phaser to reconstruct and tessellate a full vector circle for every tiny dot every frame. Artillery volleys plus fence splitting and turrets can retain thousands of these samples.

WebGL now submits one textured quad per sample using the existing white-circle texture and Phaser's standard pipeline. It keeps sample timing, radius, color, fade, additive blend, camera/container transforms and pool lifecycle. Canvas retains the vector fallback. Projectile artwork, damage, ammunition behavior, fire rate, enemy counts and difficulty remain unchanged. The generic infusion hint also stops overwriting the controlled-boss hint every frame, avoiding two redundant text-texture rebuilds.

On the same isolated RTX 5070 / Edge WebGL browser at 1600×1000, a fixed 6,000-dot comparison measured **60.53ms → 0.40ms mean render CPU** (p95 **62.60ms → 0.60ms**). This isolates the trail renderer; it is not a whole-game FPS claim.

The live fixture uses full permanent upgrades, five rank-three Supreme mods, Ascension artillery, native enemy pressure, primary and secondary attacks, floor activity, then five turrets, five fences and one mine. Each sample runs for 12 seconds. The final build recorded:

| Scenario | Mean frame ms | p95 frame ms | Peak projectiles |
| --- | ---: | ---: | ---: |
| Operative | 16.67 | 17.0 | 18 |
| Controlled artillery | 16.69 | 17.0 | 74 |
| Artillery with active floors | 16.74 | 17.1 | 102 |
| Artillery with deployed defenses | 22.69 | 29.0 | 759 |

The defense sample reached 5,903 retained trail samples. Trail rendering averaged 0.24ms per frame, compared with 11.14ms in the earlier vector fast-path defense sample. Live combat outcomes vary; these samples are not identical event replays. The final heavy sample still had one 41ms frame, so this does not establish hitch-free play on every loadout or lower-end hardware. The initial CPU-profiler capture is diagnostic only; its single long hitch is excluded from the fixed-renderer comparison.

## Verification

- 1,029 automated tests and production build pass.
- 193 live integration checks cover deployed Flux support, lava rejection, moving-container visuals, replacement without rewards, operative and all three controlled bosses, damage, recovery, pause, reduced effects, pool reuse, teardown, projectile cosmetics and anomaly return.
- Seven WebGL pixel checks verify trail interior palette/alpha, diameter, parent transforms and expired-pixel cleanup. Unit tests cover texture binding after a batch flush and Canvas fallback.
- Recovery apex artwork reviewed in the hardware-rendered browser.

Reproduce with an isolated hardware-enabled DEV browser on CDP port 9225:

```powershell
npm.cmd test
npm.cmd run build
node scripts/run-layout-audit.mjs artifacts/lava-recovery-integration.json ./audit-lava-recovery.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/supreme-boss-batched-trails.json ./audit-supreme-boss-performance.browser.js 1600x1000
$env:N3ON_LAYOUT_OPTIONS='{"benchmark":true}'
node scripts/run-layout-audit.mjs artifacts/trail-rendering.json ./audit-trail-rendering.browser.js 1600x1000
```
