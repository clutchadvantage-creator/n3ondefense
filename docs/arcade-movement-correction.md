# Instant operative movement with short collision rebounds

Code verified October 14, 2026; verification record completed October 15. Implementation: `87040da`. Machine-readable results: [arcade-movement-validation.json](arcade-movement-validation.json).

## Cause and correction

The last pre-rebound implementation, `10a2af5`, assigned velocity directly from current input. Commit `fbb95f7` replaced that assignment with exponential steering at 1.6 per second during a 0.82-physics-second operative momentum window. It also substituted lighter drag during that window. Releases and reversals therefore fought retained collision velocity instead of immediately controlling the operative.

`ArenaScene.updatePlayerMovement` now sends its original keyboard normalization, analog magnitude and speed multipliers to `SweptPlayerBody.driveFromInput`. Ordinary input assigns velocity immediately. The original native damping remains unchanged; stronger friction is not used to conceal inertia. Enemy and Ascension-controlled boss movement retain their separate existing momentum behavior.

`OperativeRebound` holds only the current input command, a temporary collision response and 12 reusable contact slots. A new solid impact above 90px/s produces an outward response along the contact normal, lasting at most **0.10 physics seconds**, with a response speed of **140–360px/s**. These bounds apply only to the bounce, not ordinary movement, upgrades or Dash launch speeds. Release, changed direction or a meaningful speed change cancels the response immediately. Expiry restores the current command without an acceleration ramp. Blocked travel still consumes the response clock, including tight corners.

Each surface/body contact is latched independently. A bounce's own separation cannot rearm a held-wall contact. Intentional retreat or sufficient separation rearms it; a different surface can respond immediately. This prevents repeated held-wall impulses without a global cooldown. No extra collision query, world, timer or per-step contact allocation was added.

## Preserved interactions

Existing continuous sweeps, safe-position correction after Arcade overlap separation, high-speed containment and floor travel tracing remain active. Grounded enemies exchange momentum through the existing contact adapter; the operative receives only its short response. Drones remain ordinary Arcade bodies and are excluded by the existing airborne filter. Damage, shields and iframes still use the original contact-damage path.

Free Dash retains its impulse, timer, costs and input rules. A Dash collision can return control immediately; subsequent releases remain immediate even before the original Dash timer ends. New Dash activations reset collision state. Boost, movement Mods, field multipliers, friendly fence/deployable passage, Relay, Echo, Fence Rail guards, lava support/recovery and controlled boss movement remain on their existing paths. Explicit relocation clears response state and contact locks. No saves, progression, UI, audio or anomaly movement rules changed.

Bombsite detonation still sets Arcade `timeScale` to **0.35 for 850ms**. Its existing scheduling produces roughly 2.86 fixed physics steps per real frame. All **14** original detonation scenarios retain identical initial velocity, immediate post-detonation velocity, physics-substep sequences and peak displacement speed versus the saved `10a2af5` baseline. Post-collision trajectories intentionally use the new short response. The response duration is measured in physics time, so detonation can shorten it in real time.

## Verification

- **1,076 automated tests pass; production build passes.** Ten focused tests cover immediate commands, release/reversal, normalization, boosted wall holds, zero residual velocity, corners, repeated contacts, grounded bodies, high-speed sweeps and relocation.
- **55 live movement checks pass** through actual input translation, Arcade bodies and the rendered game loop. These include keyboard/analog control, Mods/Boost, one bounce during a sustained wall hold, Dash collision reversal followed by release, thin-wall containment, drones, incoming enemies, shield handling and nonduplicated contact damage.
- **58 contact/floor/boss checks and 20 ability checks pass**, including moving support, lava falls, recovery, controlled artillery, friendly fences/mines/turrets, enemy fence attacks, Relay, Echo, pause, reduced effects and round recreation.
- The detonation fixture passes all 30 assertions across 14 scenarios. The performance fixture passes its four budget/lifecycle checks across five Supreme round 26 samples.

Two fixture assumptions required correction: the older friendly-passability check expected a single velocity assignment to keep the operative coasting, and the new movement fixture initially demanded more empty runway than some generated fortress layouts provide. The fixtures now hold movement input and reserve only the required test footprint. Both reruns pass.

## Performance and limits

Five-second hardware samples used Edge/ANGLE, an RTX 5070, 1600×1000, Supreme round 26, full upgrades and rank-three Supreme Mods. Native spawn limits and collision budgets were unchanged.

| Scenario | Mean / p95 frame time | Mean complete Arcade update CPU |
| --- | ---: | ---: |
| Operative | 16.67 / 17.00ms | 0.096ms |
| Controlled artillery | 16.67 / 16.90ms | 0.137ms |
| Artillery with floor activity | 16.72 / 16.90ms | 0.139ms |
| Artillery with defenses | 17.42 / 21.60ms | 0.193ms |
| Synthetic enemy knockback bursts | 16.67 / 17.00ms | 0.195ms |

One floor-activity frame reached 33.9ms. Population peaked at 32 enemies and 140 projectiles; extra broad-phase visits peaked at 119 against the existing 768-per-frame budget. These measurements preceded the final constant-cost blocked-expiry and Dash-input-ownership fixes, which were subsequently covered by automated and live input/ability checks. These are short desktop samples, not an identical combat replay or a guarantee for low-end hardware or every extreme loadout. The existing work budgets can skip extra body contacts under extreme crowding, while original colliders remain active. Dedicated rebound audio still awaits an asset. Automated input checks do not replace subjective player feedback on bounce feel.

Reproduce using an isolated DEV browser on CDP port 9225, reloading between browser fixtures:

```powershell
npm.cmd test
npm.cmd run build
node scripts/run-layout-audit.mjs artifacts/arcade-movement-browser.json ./audit-arcade-movement.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/arcade-movement-contacts.json ./audit-kinetic.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/arcade-movement-abilities.json ./audit-kinetic-abilities.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/arcade-movement-slingshot.json ./audit-kinetic-slingshot.browser.js 1600x1000
$env:N3ON_LAYOUT_OPTIONS='{"sampleMs":5000,"kinetic":true,"kineticStress":true}'
node scripts/run-layout-audit.mjs artifacts/arcade-movement-performance.json ./audit-supreme-boss-performance.browser.js 1600x1000
```
