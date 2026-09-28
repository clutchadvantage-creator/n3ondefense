# Boss intro input and turret crash

Baseline: `4c75108` (LYRA voice disabled). The separately requested pickup consistency work is documented in [pickup-consistency.md](pickup-consistency.md). No push or deployment was performed.

## Boss READY input

Boss initialization runs before `ArenaScene.create()` constructs `GameplayPointerLock`. The intro's existing `hidePrompt()` and `release()` calls therefore cannot reach that controller on a fresh scene launch.

Two consequences were reproduced:

- The controller constructed an empty, visible full-screen button at CSS z-index 10000. `document.elementFromPoint()` at READY returned that button. A CDP mouse click captured the mouse instead of starting the fight.
- Loading's real CLICK TO DEPLOY action already captures the mouse. Hiding the empty overlay alone still left that capture active during the boss intro; an actual mouse click could not activate READY.

`GameplayPointerLock.constructor()` now creates its capture prompt hidden and recognizes capture inherited from Loading. The latter also lets the first ordinary-round Escape/unlock reach the existing pause callback. `ArenaScene.create()` releases inherited capture immediately after creating the controller when the encounter is in its intro. Existing explicit gameplay capture prompts, READY handlers and pause logic remain in charge. No synthetic pause cycle was added.

## F turret crash

On a freshly reloaded browser, Normal boss 5 reproduced this exception after a real F-key placement:

```text
TypeError: Cannot read properties of undefined (reading 'turretFireRateMultiplier')
    at ArenaScene.updateAbilities
    at ArenaScene.update
    at Systems.step
```

The turret was successfully constructed and registered. Its first target query reached an uninitialized `bombsiteMods`. Only ordinary rounds constructed `BombsiteModSystem`; bosses created an empty `BombSiteManager` but omitted its effects/query owner. A previously played ordinary round could mask the fault by leaving a destroyed owner in the scene field. Fence and enemy-reward queries also depended on that owner.

`ArenaScene.initializeBombsiteMods()` now contains the existing constructor and callbacks unchanged. Both ordinary initialization and `initializeBossRound()` call it after creating their bombsite manager. Bosses have no planted sites, so the existing field queries naturally return neutral multipliers. Each encounter receives a fresh owner and the existing retirement path destroys it. Turret stats, targeting priority, F binding, Mod formulas and rewards were not changed. No catch suppresses combat errors.

The two regressions involve encounter initialization order but need distinct fixes: DOM/capture ownership and a missing combat dependency.

## Focused verification

The repeatable browser check is `scripts/audit-boss-input-turret.mjs`. It uses real CDP mouse and keyboard input through Loading, plus one simulated standard gamepad. Test controls are an isolated profile, invulnerability, supplied placement energy, reset cooldowns, deterministic aim and an ordinary enemy spawn. Geometry validation and combat firing remain production code. This is a short regression check, not a campaign or performance soak.

```powershell
node scripts/audit-boss-input-turret.mjs artifacts/boss-input-turret.json
```

Use an isolated DEV browser on port 9225 and Vite on 5173; run browser fixtures sequentially. Physical controller hardware and audio output require manual verification.

The final run passed **109 checks with zero browser exceptions**. Coverage was fresh Normal boss 5, ordinary Normal 4, Normal boss 5 again after ordinary play, Overdrive boss 5, Supreme boss 5 with simulated controller confirmation, and Supreme boss 30. These launches used the real Loading deployment button. All mouse-start cases began without pause/unpause; all intros had released mouse capture and unobstructed command buttons. The controller case then switched to mouse capture for F-key testing.

Each case exercised denied wall/edge placements, valid placement near walls/edges and other deployables, repeated turrets, real projectile registration, keyboard movement, Escape pause/resume, turret destruction and scene retirement. Ordinary-round checks also covered bombsite exclusion and nearby placement with active enemies. Bosses cast attacks during the samples. The fresh-start crash was reproduced in a boss encounter; it was not reproduced in the tested ordinary encounter. This does not establish all skins, loadouts or maps, an unassisted boss victory, terminal Trinity completion, or physical controller behavior.

Build and all **784 unit tests passed**. Local raw records: `artifacts/boss-turret-before.json`, `artifacts/boss-input-turret.json`, `artifacts/boss-pickup-build.txt`, and `artifacts/boss-pickup-tests.txt`. The browser script is retained for reproduction; raw artifacts are ignored local evidence.
