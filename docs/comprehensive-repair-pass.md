# Arena, SkyBreach, Heist and Flux Core repair pass

Implemented and validated 2026-10-16 against baseline `b602e62`. Machine-readable measurements: [comprehensive-repair-validation.json](comprehensive-repair-validation.json).

## Arena Generation

The asymmetric generator built eight small rings out of eight wall segments each. Its required corridor openings left tiny wall stubs. Secondary equipment placement used small random rectangles and center/shared-face spacing checks, which missed diagonal corners and full collision footprints.

Only the open-field and asymmetric structural builders changed. Open-field uses three or four separated straight/L partitions; asymmetric uses four to six left-weighted straight/L/U installations. Other archetypes keep their structural generators. Secondary equipment now aligns to the existing 32px navigation grid, with full-rectangle clearance. Open-field requests four to seven equipment pieces instead of eight to fifteen; asymmetric requests two or three. Placement remains seeded and bounded to fifteen attempts per requested piece.

Clearance reuses the existing 140px corridor and 92px objective exclusion. The operative's collision diameter is 24px; the corridor setting already accommodates two large enemy footprints plus navigation padding. Walls and equipment retain real collisions, the existing renderer, objective connectivity validation, fingerprints and recent-layout rejection.

Validation covers 600 placement drafts across all twelve definitions, 480 actual before/after generated layouts, and 300 consecutive actual generated layouts. All returned layouts passed the existing validator; no consecutive fingerprints repeated. In twenty asymmetric seeds, average walls fell from 68 to 13.55 and sub-100px wall segments from 59.5 to zero. Actual sequential generation averaged 5.81ms (p95 14ms). The atlas and full rendered open-field/asymmetric examples were visually inspected.

Existing limitation: the validator already rejected all twenty forced hub-spoke, islands and crossroads attempts in this comparison. Those generators still fall back; fallback layouts can carry some of those archetype labels. Eleven accepted archetype labels appeared in the 300-layout sequence. This repair preserves all twelve definitions and their existing validation rather than claiming every authored archetype passed. Forced fallback counts overall declined from 84 to 78; open-field changed from one to two in its twenty-seed sample.

## SkyBreach

AA coordinates were coupled to rooftop sites, but the gun used combat depth while its tower remained behind unrelated city facades; Arcade post-update could also reapply stale displacement. Towers and guns now share a height-consistent depth order, and the gun's body anchor resets to its rooftop each update. Active and destroyed towers keep scrolling. Destroying AA still removes only the gun. Actual scrolling probes measured zero anchor error in Normal and Supreme; the rendered rooftops were inspected.

Ground tanks moved at 14px/s while roads moved at 49px/s; disabled tanks stopped entirely. Both now inherit the existing 49px/s ground scroll. Tank lane steering, attacks and statistics remain intact. Active and disabled tanks both crossed the existing lower retirement boundary and released their warnings/references in live checks.

Health used a need-based kill roll and emergency clock, but energy competed with health through a shared cooldown and ambient scheduling. Supply timing did not follow encounter pressure. Enemy drops could also consume scarce slots at impractical coordinates. All four combat supplies now arrive ahead of the operative within a short lateral move, scroll toward them, and use a 22-second lifetime plus offscreen retirement. Ordinary ammo previously retained Arena pickup bounce motion.

Supply tempo is `clamp(1 / actualSpawnCadence, 1, 1.4)`; the tested Supreme26 cadence is 0.6804, giving tempo 1.4. Recovery changes are local to SkyBreach:

| Setting | Before | After at tested Supreme26 |
| --- | --- | --- |
| Critical health kill cooldown | 4.5s | 3.21s |
| Health drought delay at <=35% HP | 4–6s; 6.5s per-health minimum | 2.86–4.29s; 4.64s per-health minimum |
| Energy kill eligibility | Shared 8s clock, repeatedly postponed by health | Independent 5.71s energy clock; common 1.8s separation |
| Additional energy kill roll | None | 5–30% as missing energy rises from 50–90%; pickup Mods cap at 40% |
| Energy drought at <=30% energy | No independent clock | 5–6.43s; 5.71s per-energy minimum |
| Ordinary ambient scheduling | 12–20s minus up to 3s for need | Same interval divided by tempo |
| Maximum offered recovery | One health + one energy | One health + one energy |
| Health amount | Greater of 28 HP or 22% maximum HP | Unchanged: 28.6/130 Normal; 50.6/230 upgraded Supreme |
| Energy amount | 50% maximum energy | Unchanged: 55/110 Normal; 80/160 upgraded Supreme |

The original moderate Normal recovery cadence is preserved. Existing health drop probabilities and Mod pickup multipliers remain. These are collectible drops, not regeneration or guaranteed full refills.

Ammo now has a separate, bounded supply scheduler: one offered grenade/scatter pickup, a 22.5s minimum interval divided by tempo (16.07s at Supreme26), an additional 10% kill roll modified by pickup chance and capped at 20%, and an ambient drought offer after 56.25–67.5s divided by tempo. The initial ambient offer uses 27–36s divided by tempo. Offers prefer the opposite ammunition. Repeating the current type waits until its last 11.25 seconds, while the opposite type remains available even with long-duration Mods. The tested fully upgraded build already grants 198s ammo duration versus the ordinary 45s; this duration, switching, damage, spread, grenade behavior and stack limits are unchanged.

Deterministic before/after opportunities per minute:

| Scenario | Health | Energy | Grenades | Scattershot |
| --- | --- | --- | --- | --- |
| Normal9 | 4.808 → 4.808 | 0.798 → 0.798 | 0.620 → 0.874 | 0.646 → 0.958 |
| Supreme26 | 11.470 → 14.150 | 2.958 → 7.864 | 1.242 → 1.390 | 1.232 → 1.454 |

Method: 100 seeds × five minutes, constant resource deficits, one kill per 1.4s/0.7s respectively, two-second collection delay and pickup-chance multiplier one. Normal deficits were 40% health/energy; Supreme deficits were 75% health/80% energy. These are supply opportunities under sustained demand, not actual healing rates or survival guarantees.

Live Normal9 and Supreme26 checks exercised actual pickup collection, scrolling, AA destruction, tank retirement and Arena return. Supreme used all permanent upgrades and five rank-three Mods. The eight-second Dreadnought/active-cap sample measured frame p95 16.9ms, maximum 17.2ms, and scene-update p95 0.8ms on RTX 5070. A separate matched five-second rocket/projectile/destruction stress comparison measured frame p95 16.9ms both before and after; pools stayed bounded. Enemy damage, density, attack cadence and operative weapon statistics were not rebalanced.

## Heist

Container spark paths used world coordinates inside a Graphics object located at the world origin. Scaling the effect scaled its position away from the container. The object now sits at the container and draws local coordinates.

An invisible vault barrier applies only to hostiles and remains after player doors open. Hostile routes exclude vault nodes. Spawn validation uses the body footprint; invalid spawns relocate to a valid facility node. Per-enemy last-safe positions and a bounded vault sweep catch forced relocation/knockback across the protected area. Player movement and vault access are unchanged.

Three independent sentry encounters reuse existing accessible side chambers and their smashables. Planning keeps the 184px central passage clear and avoids entry, extraction, trap and vault approaches. Five hundred layouts produced three valid rooms each. No new room geometry or unrelated smashable population was added.

Only actual enemy/prop damage within a room triggers its alarm. Entering alone does nothing. Red corner lamps and a soft room wash flash while the hatch opens and the sentry rises over 980ms. Each sentry then joins the existing targeting, damage and projectile systems. The three sentries do not displace normal patrol or escape reinforcement capacity.

Sentry health is exactly half the applicable elite-tank mini-boss health, using the same round/mode/loadout calculation once. The live Supreme26 case measured 1,200.54312 HP versus 2,401.08624 HP. They use scaled shooter damage, a 360px range and a 1.35s firing interval.

Destruction combines the existing pooled mechanical fragments, electrical/impact bursts, a 120ms secondary breakup and a 460ms turret collapse. It produces one existing Heist enemy-bonus loot roll at the sentry; collection remains provisional until extraction. Repeated damage/death events cannot rearm rooms or duplicate rewards. Alarm drawings are batched at 90ms, deployment/destruction use the scene clock, and no additional physics simulation or timer loop is introduced.

The live browser audit passed 43 checks covering both damage triggers, independent state, pause, deployment, attacks, damage, destruction, provisional physical loot collection, open-vault hostile collisions/relocation/navigation, container effect origin and cleanup/return. Active and destroyed sentry artwork was inspected. The destruction probe used 30 active fragments from the prewarmed 64-object pool, below the existing 168-fragment limit.

## Flux Core / Laser System

Previously, suppression checked only the nine-second shutdown deadline, and spawning the final core immediately marked the group engaged. Neither condition represented completed visual deployment.

The Flux lifecycle now owns permission to operate lasers. Waiting and spawning suppress the grid. Every surviving selected core must finish its existing 1,200ms rise plus 620ms window opening before engagement. Combat-destroyed slots count as fulfilled; lost floor support requires replacement. Partial destruction keeps lasers active. The final death clears current laser render/damage/audio state immediately and starts the unchanged nine-second shutdown once.

Timer expiry permits scheduling, never activation. Existing timing values remain: initial 4.2–7.2s wait, 1.4–3.4s stagger, nine-second shutdown, then the existing 15-second recovery grace plus 1.8–9s variance. The grace now occurs with lasers **off**, so total quiet time includes that wait and deployment. Gas remains an independent veto. Random counts remain one through six. Destroy/cleanup is idempotent and cannot release suppression through stale callbacks.

Live tests passed 55 checks across consecutive selected groups of 1, 3, 6 and 3, including actual shutters, partial kills, immediate final shutdown, exact timer duration, subsequent deployments and cleanup. Automated tests additionally cover early destruction during rise, interrupted support, failed placement, gas and randomized counts. Laser geometry, clipping, patterns and damage remain unchanged.

## Regression Results

- `npm.cmd test`: **1,094 passed, zero failed/skipped**. Includes operative movement/rebound/Dash, bomb physics, collision/navigation, hazards, pickup and anomaly lifecycle regressions.
- `npm.cmd run build`: passed TypeScript and production Vite build. No lint script is configured.
- Four live audits: zero errors; 146 explicit browser assertions, 480 validated comparison layouts and the 300-layout sequence. Rendering was checked in the hardware browser.
- No new dependencies or gameplay art assets. Static Arena geometry stays cached; new sentry effects reuse existing bounded pools.
- The validation is automated/assisted, not a claimed manual playthrough. Remaining manual check: play complete Supreme26 SkyBreach runs with a fully upgraded loadout across several seeds, including missed pickups and real ability expenditure, to judge tension and survival. Low-end hardware and longer unassisted sessions remain outside these RTX 5070 measurements.

## Changed Files

Paths below are relative to the repository root.

| File | Purpose |
| --- | --- |
| `src/game/systems/ArenaTopology.ts` | Targeted open-field/asymmetric structural formations. |
| `src/game/systems/ArenaGenerator.ts` | Use full-footprint equipment placement. |
| `src/game/systems/ArenaObstaclePlacement.ts` | Seeded grid placement and rectangle clearance. |
| `src/game/anomalies/skybreach/SkyBreachArt.ts` | Shared ground speed and AA tower/wreck depth. |
| `src/game/anomalies/skybreach/SkyBreachMotion.ts` | Shared 49px/s terrain/tank motion. |
| `src/game/anomalies/skybreach/SkyBreachScene.ts` | Rooftop body anchoring, supplies, ammo and cleanup integration. |
| `src/game/anomalies/skybreach/SkyBreachSupplies.ts` | Reachable placement and pressure/need-based recovery scheduling. |
| `src/game/anomalies/skybreach/SkyBreachAmmoSupplies.ts` | Bounded alternating ammunition offers. |
| `src/game/anomalies/heist/HeistFacility.ts` | Persistent hostile vault barrier and routing exclusion. |
| `src/game/anomalies/heist/HeistHostileGeometry.ts` | Hostile footprint validation and safe spawn recovery. |
| `src/game/anomalies/heist/HeistRoomPlan.ts` | Optional room limit for sentry selection; existing default retained. |
| `src/game/anomalies/heist/HeistSentryPlan.ts` | Three valid chambers and independent encounter state. |
| `src/game/anomalies/heist/HeistSentryRooms.ts` | Alarm, hatch, turret, pooled destruction and one-shot reward. |
| `src/game/anomalies/heist/HeistEnemyStats.ts` | Existing scaling shared with half-health sentries. |
| `src/game/anomalies/heist/HeistScene.ts` | Encounter integration, hostile containment, local bursts and cleanup. |
| `src/game/arena/ArenaSmashableSystem.ts` | Optional actual-damage callback for Heist room triggers. |
| `src/game/systems/FluxCoreSystem.ts` | Authoritative deployment gate, interrupted support and disposal. |
| `src/game/systems/LaserSecuritySystem.ts` | Immediate suppression helper using existing presentation/audio cleanup. |
| `src/game/scenes/ArenaScene.ts` | Invoke immediate laser suppression on Flux shutdown. |
| `tests/arena-structure-placement.test.mjs` | Seeded full-footprint and structural checks. |
| `tests/skybreach-repair-supplies.test.mjs` | Resource clocks/caps, reachable pickups, ammo duration and tank motion. |
| `tests/skybreach-motion.test.mjs` | Updated expected terrain-coupled tank velocity. |
| `tests/heist-repair.test.mjs` | Sentry planning/state/health and hostile vault geometry. |
| `tests/anomaly-heist.test.mjs` | Verify extracted scaling and preserved patrol capacity. |
| `tests/flux-core-lifecycle.test.mjs` | Real Flux lifecycle with lightweight presentation stubs. |
| `tests/flux-cores.test.mjs` | Updated centralized lifecycle assertions. |
| `tests/combat-audio.test.mjs` | Verify unchanged shutdown audio hook through the unified path. |
| `scripts/audit-arena-repair.browser.js` | Historical/current generator comparison and visual atlas. |
| `scripts/audit-skybreach-repair.browser.js` | Normal/maxed Supreme live supplies, motion, cleanup and performance. |
| `scripts/audit-heist-repair.browser.js` | Actual entry/combat/vault/loot/return checks. |
| `scripts/audit-flux-repair.browser.js` | Actual staggered core visuals, laser operation and repeated cycles. |
| `scripts/prepare-repair-baselines.mjs` | Read historical sources into ignored comparison artifacts. |
| `scripts/kinetic-audit-setup.js` | Isolated max-upgrade/Mod options and orderly scene retirement for audits. |
| `docs/comprehensive-repair-pass.md` | Findings, tuning, evidence and reproduction. |
| `docs/comprehensive-repair-validation.json` | Recorded metrics, checks and validation limits. |

Reproduce with a fresh isolated hardware-enabled DEV browser on CDP port 9225 and the app's Vite server. Run fixtures sequentially; reload the isolated page after the Flux fixture intentionally destroys its owner. Never run these profile-mutating DEV fixtures in a real player profile.

```powershell
npm.cmd test
npm.cmd run build
node scripts/prepare-repair-baselines.mjs b602e62
node scripts/run-layout-audit.mjs artifacts/repair-arena-browser.json ./audit-arena-repair.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/repair-sky-browser.json ./audit-skybreach-repair.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/repair-heist-browser.json ./audit-heist-repair.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/repair-flux-browser.json ./audit-flux-repair.browser.js 1600x1000
```
