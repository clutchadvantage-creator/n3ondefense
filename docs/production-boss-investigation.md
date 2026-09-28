# Production boss investigation and selective recovery

The final public-site check on September 27, 2026 found the repaired Blender boss implementation deployed. Only boss assets and presentation code were recovered. The pre-Blender arena, stadium, floor, coastline, camera projection, generation geometry and environment renderer remain in place.

## What the live site was serving

The initial inspection of [n3ondefense.org](https://n3ondefense.org/) returned `index-DkYHi-ZQ.js` and `ArenaScene-D_9NhhH8.js`. The Arena bundle instantiated complete `rwg-<archetype>-leg` images and lacked the repaired split-leg implementation. This confirmed the reported old locomotion. The implementation matched the initial Blender boss work in `046f5e3869cb6c24d526934ed8cf3dd2fb997f58`, preceding `7e1622012103f7120bc9e2305c6e28aa9f8cbf8e` ("Repaired boss movement"). The exact Vercel deployment commit could not be established from public bundle contents alone.

At that inspection, local and remote main were still the pre-Blender commit `e38bcedde97e6487fc8582eabe1cb3f79c7a1f2f`. Thus the served application and repository main did not agree. Vercel returned a cached response; that alone does not establish why the rollback had not become the served deployment. No Vercel project/deployment metadata was available to identify the cause.

During this work, commit `e32e08b61d0cbc2ffcf57fd96960207770f82afa` ("Major progression overhaul") appeared locally and on origin/main. A fresh public request then returned `index-Bp-Rzr5O.js`. Its served [Arena bundle](https://n3ondefense.org/assets/ArenaScene-DaK1UnS2.js) matched the locally built repaired-boss bundle byte for byte:

`SHA256 6A33EFABF4542992B51FD32B73B3C91482C1BA98BDFE3DD42BCD90A07C1B98AB`

This later observation supersedes the initial live-build finding. It verifies the Arena JavaScript bundle, not an authenticated backend rollout or every client cache. No commit, push or deployment was performed by the coding agent.

## Recovery scope

The recovery source was `backup-before-preblender-restore`, still at `c07c7f11290ea3f50f9ef83478dd0532a3006ec3`. The repaired boss visual modules match the repaired-leg revision. Recovered files comprise the boss Blender source/authoring script, boss PNGs, `Boss.ts`, the component loader and the two leg-rig modules. Boot preloads these assets; ordinary bosses, Trinity and the Arcade mini-boss receive existing wall/obstacle rectangles for visual clearance.

No stadium or regular-enemy assets were recovered. No Blender rendering was run. Boss attack-pattern and balance files, movement AI and procedural arena generation were not copied from the backup. The existing health/reward/attack systems remain their owners; campaign scaling changes are documented separately. The backup branch remains intact.

## Locomotion and clearance

The Blender source contains component scenes with mesh geometry, bevels, materials, cameras and lights. It is not a runtime skeletal armature or a baked walking clip. The old implementation moved whole, already-bent leg pictures. Increasing their rotation alone could not create independently planted feet or articulate the knee. The repair uses the same authored mechanical parts as upper leg, lower leg, joint and foot sprites, with world-space foot contacts and a bounded two-link solver.

| Quantity | Recovered implementation |
| --- | --- |
| World collision diameter | 68 px, centered; independent of transparent texture padding |
| Chassis sprite canvas | 160 × 160 px; visible chassis occupies only part of it |
| Authored chassis housing width | Approximately 51–56 px at 40 px/model unit, excluding weapons and legs |
| Six-leg open stance | 180 px between outer foot centers; foot artwork extends beyond those centers |
| Upper / lower link | 44 / 48 px |
| Preferred reach | 72 px; constrained poses try 60, 48, 36, 24 and 12 px |
| Generator's important-passage minimum | 140 px, unchanged |

The 140-pixel generation rule comes from two ordinary-enemy movement lanes plus spacing and navigation padding. It is not a requirement that all visible boss legs fit inside its collider. Boss movement retains its existing direct steering and Arcade wall collisions; the presentation solver does not change velocity, choose AI targets or widen paths. It bends individual legs around supplied walls, limits foot swing speed, retains supporting contacts through turns and resets contacts on teleportation. A short rejected corner pose holds the last clear rendered pose instead of blinking the leg off. This is bounded visual accommodation, not proof that all seeds and every extreme corner can never show an artifact.

## Short validation

Five deterministic locomotion tests cover open stance, stationary contacts, a 140-pixel corridor, turns/reversals, support feet, wall clearance, bounded steps, airborne movement and teleport reset. All 780 game tests and the production build passed with the recovered code.

A short browser geometry fixture requested all twelve archetypes with one seed each and early/middle/late local rounds. The validator accepted eight distinct families across twelve generated layouts; fallback cases remain labeled. Across 26,316 simulated movement frames, planted-foot sliding and foot intersections were zero. Twenty individual foot poses were temporarily rejected; the longest hold was five frames (83 ms at the simulated 60 Hz). The routes use a test pathfinder with 36-pixel padding; they do not prove production boss AI can traverse every route autonomously.

Actual Arena combat supplied four-second, invulnerable-player samples of Artillery at Normal 5, Storm Mage at Normal 10 and Void Brawler at Normal 15. No boss outcomes were forced during these samples. Each retained a 68-pixel world collider and the 0.9 gameplay zoom. Raw frame means were approximately 16.667 ms, p95 16.8–16.9 ms and maximum 17.0 ms. Each scene retired with zero visual roots and an inactive boss. These short samples are smoke checks, not sustained campaign or low-end-device performance evidence.

The final screenshots center the camera on each moving boss for inspection, temporarily removing camera bounds without changing zoom or production camera code: [Artillery](../artifacts/recovered-artillery.png), [Storm Mage](../artifacts/recovered-storm-mage.png), [Void Brawler](../artifacts/recovered-void-brawler.png). They were visually reviewed for the articulated pose and retained arena artwork. Compact results are in [boss-recovery-validation.json](boss-recovery-validation.json); raw screenshots/reports are local ignored evidence.

Reproduction in an isolated DEV profile with Vite on 5173 and browser debugging on 9225:

```powershell
node scripts/run-layout-audit.mjs artifacts/campaign-boss-topology.json ./audit-boss-topology-locomotion.browser.js
node scripts/run-layout-audit.mjs artifacts/campaign-recovered-bosses.json ./audit-recovered-bosses.browser.js
```

Run fixtures sequentially. This recovery introduces no Blender environment dependency into the game build.
