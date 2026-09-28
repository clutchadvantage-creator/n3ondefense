# Boss encounter rules correction

Boss encounters contain no playable bombsites and no ordinary arena hazards. `ArenaScene.initializeBossRound()` now omits security lasers, gas, bomblets, floor/wall fire traps and the Flux hazard system. The boss update branch no longer advances those systems. Existing encounter retirement removes the preceding ordinary round's hazard owners before the boss initializes. This applies to ordinary bosses and the terminal Trinity initializer.

Boss attacks, warnings, projectiles and their damage remain active. Destructible scenery remains. Ordinary rounds retain their normal hazard progression.

The existing support-wave code already spawns `shooter`, the standard medium gunner (base size 24), through the normal enemy factory and difficulty scaling. That behavior, support caps, timing and rewards remain unchanged. No new support waves were added to Trinity, which retains its existing behavior.

The empty bombsite manager and fresh `BombsiteModSystem` query owner remain necessary combat dependencies. They create no playable bombsites or planted fields in boss encounters; they let turrets, fences and shared queries receive neutral field modifiers without the previous undefined-reference crash.

The short browser regression runner checks no bombsites/hazard owners at intro and during combat, medium shooter support, real READY/F input, targeting, repeated placement, pause/resume and cleanup. It also checks an ordinary Normal 16 encounter with all expected arena hazard owners, then another boss launch to exercise retirement. Terminal coverage uses the existing DEV finale entry, not a campaign clear. Support-wave timing is advanced by the fixture so this check does not need a long wait.

Reproduce with `node scripts/audit-boss-input-turret.mjs artifacts/boss-rules-browser.json`, using an isolated DEV browser on port 9225 and Vite on 5173. Run browser fixtures sequentially.

Validation passed **151 browser checks with zero exceptions**, the production build, and all **784 unit tests**. Cases: fresh Normal boss 5, ordinary Normal 16, Normal boss 5 after ordinary play, Overdrive boss 5, Supreme boss 5 with simulated controller confirmation, Supreme boss 30, and DEV terminal Trinity. These are assisted short checks, not campaign clears or physical-controller testing. Local evidence is in `artifacts/boss-rules-browser.json`, `artifacts/boss-rules-build.txt`, and `artifacts/boss-rules-tests.txt`.
