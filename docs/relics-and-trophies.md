# Relics, trophies and infusion collection

Implemented October 14, 2026. Verification results: [collection-validation.json](collection-validation.json).

## Collection and progression

Identity Cipher and Blacksite Core each contain three unique interlocking fragments. Completing Identity Cipher authorizes Cosmetic Infusions; completing Blacksite Core authorizes Banned Technology. Both tabs remain visible before authorization and show the required reconstruction and current fragment count. Category checks run in the save store as well as the UI, so a blocked installation cannot spend Plasma Chips.

Previously installed infusions remain functional, as requested. New installations and replacements require the corresponding completed relic. Removing a legacy infusion warns that reinstalling it requires reconstruction. Fence Rail remains compatible and is explicitly marked **DESIGN REVIEW PENDING**; this update does not redesign its gameplay.

The Operator Garage has a Trophies & Relics wing, a four-slot Trophy Showcase and a two-slot Blacksite Vault beside the Mod rack. Earned items can be featured or removed. Adding an item to a full display replaces its oldest selection. Selections persist per operative profile across runs, modes and sessions. Compact screens paginate the trophy grid.

| Trophy | Requirement |
| --- | --- |
| Demolition Expert | Detonate 1,000 bombsites |
| Exterminator | Destroy 5,000 enemies |
| Anomaly Explorer | Enter 100 anomaly portals |
| Boss Breaker | Defeat 100 Arena bosses |
| Automated Warfare | Deploy 1,000 turrets |
| Untouchable | Complete 25 cumulative flawless rounds |
| Speed Demon | Perform 1,000 dashes |
| Mod Collector | Discover 50 unique Mods |
| Veteran Operative | Reach Round 30 in any mode, per the user's clarification |
| Credit Tycoon | Earn 1,000,000 lifetime Credits |

Existing lifetime statistics backfill bombsites, kills, bosses, discovered Mods, highest round and earned Credits. Previously untracked portal entries, placements, dashes and flawless rounds start at zero; no historical activity is guessed. Confirmed anomaly entries and successful abilities increment counters. Anomaly kills join the existing batched lifetime combat counter. Damage to controlled boss frames and damage during anomaly excursions disqualify the enclosing round from flawless credit.

## Fragments and rewards

Arena enemy/boss/arcade reward rolls, shared anomaly enemy rewards, Heist security containers, SkyBreach Dreadnought rewards and eligible smashable loot rolls can produce fragments. All difficulty protocols use the existing Mod rarity calculations. The combined fragment chance is the effective probability of any Epic Mod, doubled for boss/anomaly sources and capped at 35%. The random selection excludes owned and already-spawned fragments; completed relics leave the pool. Mod odds and rewards remain independent.

Fragments use larger cached vector art, a hovering motion, a pulsing rim and a bounded glint. Arena fragments ride moving panels and use the existing fall driver. Pieces lost to lava grant nothing and remain eligible for later drops. Fragment ownership is permanent even if an anomaly extraction subsequently fails.

Save version 21 adds collection state without replacing existing cards, currencies, settings or progression. A collected fragment and its reveal receipt commit together using the existing verified persistent-write path. A rejected write rolls back ownership, keeps the physical pickup and retries after two seconds of active gameplay. Display changes and reveal acknowledgments also use verified writes.

## Reveals and art

Gameplay never launches a collection modal. Main Menu and Garage present pending receipts after other modals and tutorials have closed. Fragment pieces rotate and snap into their matching grey silhouettes; queued pieces reveal in order as 1/3, 2/3 and 3/3 even when all three were collected before returning. The final piece shows permanent category authorization. Trophy reveals use the same deferred queue.

Continue acknowledges one receipt after the animation. View Later or Escape preserves it for the next visit. Actual browser reloads retain ownership, display choices and pending receipts, including partially acknowledged queues.

Thirty SVG textures cover ten colored/locked trophies, two completed/locked relics and six complementary fragments. They rasterize once at boot; combat uses cached images rather than runtime SVG rendering or filters. Pickup, snap, reconstruction and trophy audio hooks intentionally remain null until recordings are supplied. Future recordings must enter the existing AudioManager catalog/options before being assigned in `CollectionAudio.ts`.

## Performance and verification

At most six fragment pickups exist in a scene. They allocate six root containers with four children each, no physics bodies, no per-pickup timers and no tweens. Animation runs on the existing active scene update, pauses with gameplay, and retires with the scene/round. Drop probabilities cache by source for the current encounter. Celebration tweens exist only in Menu/Garage and are removed on closure or shutdown.

- All 1,066 automated tests and the production build pass.
- Live isolated-profile checks cover category gates and spending, physical acquisition, duplicate suppression, deferred reveals, progression, displays, Heist/SkyBreach entry and failed extraction, floor riders/falls, failed-write rollback/retry and damaged-round rejection.
- Two actual browser reloads verify saved ownership, queue order, selections and acknowledged receipt removal. Veteran Operative remains locked at 29 and unlocks at 30.
- Locked/earned Garage, trophy and relic views plus both locked infusion tabs were captured at 1600×1000, 1280×720 and 800×600. Text bounds were checked and representative screenshots visually inspected.
- A short Supreme round 26 comparison on hardware WebGL (RTX 5070, 1600×1000) measured 240 frames per condition. Fragment animation disabled/enabled p95 frame times were 16.67/16.68ms. A separate 1,000-call six-pickup update probe peaked at 0.10ms; p95 was below the browser timer's resolution.

These measurements cover the incremental collection workload, not a guarantee for low-end GPUs or a maximum-mod artillery stress run. No existing combat caps or performance settings were raised.

Reproduce with an isolated hardware-enabled development browser on CDP port 9225, using the local app at port 5182:

```powershell
npm.cmd test
npm.cmd run build
node scripts/run-layout-audit.mjs artifacts/collection-browser.json ./audit-collection.browser.js 1600x1000
node scripts/run-layout-audit.mjs artifacts/collection-gameplay.json ./audit-collection-gameplay.browser.js 1600x1000
node scripts/audit-collection-layout.mjs
node scripts/audit-collection-persistence.mjs
```

These fixtures create test profiles. Keep them isolated from a personal browser profile. The catalogs, pure progress model, artwork, pickup driver and presentation live in `src/game/collection/`; tuning and future additions should start there.
