# SkyBreach Pass 2 and Anomaly Access Cards

The [difficulty parity and combat polish report](skybreach-polish.md) supersedes the SkyBreach scaling, offense, presentation and encounter details below. Access Card behavior remains unchanged.

SkyBreach now uses forward flight combat, denser mixed encounters, mounted AA, a wider view, and a stronger Dreadnought. Access Cards provide destination choice and Flux-fee bypass at an existing portal. LYRA/TTS remain disabled; this pass uses procedural Canvas/SVG artwork and no Blender assets.

## Flight and combat

- Mouse and right-stick aiming cannot rotate SkyBreach fire. Fire points forward, banking up to approximately 14 degrees with lateral movement. The crosshair is hidden. Arena and HEIST retain their existing aiming.
- Fences cannot deploy or spend energy in SkyBreach; their HUD status reads OFFLINE. Mines, turrets, shield, dash, ammo, Echo and the shared combat systems remain available. Arena/HEIST fences retain their existing implementation.
- The world width increases from 1,200 to 1,440 units; height fits the viewport within 900–1,260 units. The player display shrinks from 68 to 62 world units while retaining its 12-unit collision radius. This increases visible space and reduces apparent unit size.
- Ground platforms scroll at 49 rather than 42 units/second. Background layers increase from 12/29/46 to 14/34/54. Telegraph timing is retained.
- Formation intervals decrease from 9 seconds to 5.5 in early sectors and 4.5 later. First-wave delay drops from 1.8 to 0.65 seconds. Recovery/approach windows shrink from 14/16 to 7/8 seconds; the complete authored flight lasts 231 seconds before the boss. Active ordinary-enemy capacity gains three slots, with a minimum of nine and maximum of 24.
- Interceptors execute crossing, diagonal, split, staggered, V and sine passes, then peel off. Drones combine swarming drift with bounded steering; strike fighters advance before a slower strafing attack. The Zeppelin remains a slow heavy weapons platform with drone launches and repeated escort waves; only one Zeppelin is deployed per flight. Tanks stay on the ground. Movement lives in `SkyBreachMotion.ts` and continues through physics bodies and existing slow effects.
- Mounted AA batteries join selected mixed-threat sectors on side platforms. They share projectile/telegraph systems, warn for 900 ms, then fire a three-shot spread. They count against the existing bounded enemy population.

## Presentation and durability

New detailed platform and AA textures, vented industrial superstructures, antennae, service bridges and layered clouds frame the corridor. Background layers expand to fill the viewport beyond the gameplay lane. Textures are generated once and reused; moving decoration belongs to the existing scene lifecycle.

Health factors relative to the reused enemy base stats are drone 1.35, interceptor 1.65, strike 2.8, tank 1.5, Zeppelin 7, AA 1.8. Ordinary shooting gaps tighten to 2.2 seconds, or 1.8 for the Zeppelin, before existing pressure scaling. These are tuning choices, not measured difficulty targets.

Each Dreadnought hardpoint increases from 9% to 14% of the inherited boss-health reference; its core increases from 50% to 75%. Weapon-family scheduling tightens from 4.8 to 3.1 seconds and escort scheduling from 7.5 to 4.5, retaining the 1.3 pressure cap. Destroyed weapons still stop their queued attacks. The exposed core adds a five-shot defensive volley after a 1.4-second opening, then every 2.2 seconds before pressure scaling. The seven-hardpoint shield structure, physical boss loot and extraction lifecycle are retained.

## Access Cards

`AnomalyAccessCards.ts` owns card types, price, normalization and use eligibility. Save version 20 adds owned HEIST/SkyBreach counts plus a UTC day and separate combined purchase/use counters. Older saves receive empty inventory while preserving progression, wallets and Mods. Inventory and quotas travel with profile exports and restores.

Both cards cost **50,000 Credits**. Each profile may buy **three total cards** and use **three total cards** per UTC day, across both types. At 00:00 UTC the counters reset; owned cards remain. Clock rollback cannot grant a fresh quota. This is a local profile system, not server enforcement.

The Upgrades Store has an Access Cards category, available through either Store entry route. It displays quantities, price and quotas, with a security-clearance HEIST card and a sky-blue flight/cloud SkyBreach card. Cards have no Mod stats or ranks. The category is absent from the Cosmetics tab.

Interacting with a ready portal pauses Arena simulation and opens a keyboard/mouse/controller-compatible dialog: pay the offered Flux fee, use an owned matching card, redirect with the other card, or cancel. Card choices that repeat the last event actually started are disabled. Confirmation revalidates ownership, quota, history, scene availability and gameplay eligibility. Successful card entry consumes one card and one use; cancellation consumes nothing, and subsequent anomaly failure does not refund the card.

Card purchases and uses require a verified persistent save write. Rejected writes restore the in-memory wallet/inventory and deny the transaction, rather than granting consumables from a session-only fallback. Other save operations retain their existing policy.

Normal entry still costs the rolled **35–90 Flux**. Card entry spends no Flux, but retains the portal's nominal fee in the encounter session so existing fee-dependent reward formulas remain unchanged. Reward positions remain 1–90; Supreme difficulty retains its approved compressed 61–148 range. Exchange rates, upgrade prices, Mod prices and HEIST coefficients are unchanged.

## Rotation and lifecycle

Cards never create an opportunity, change spawn odds, or convert an Arcade event. The eight-entry uniform pool, common timer, round handoff and boss exclusions remain. Per the Pass 2 brief, the temporary three-training-round availability gate is removed; tutorial completion/replay no longer filters events. Actual gameplay pauses still freeze the clock.

A portal offer does not update played history. Confirmed entry records the anomaly actually entered, including redirects, and the next draw excludes it. Declining an offer leaves history unchanged. Both successful and failed excursions retain their entered destination in history.

## Validation and limits

- 806 automated tests passed, including migration, normalization, daily rollover/rollback, card eligibility, rotation/history and motion behavior.
- Production TypeScript/Vite build passed.
- The assisted live SkyBreach fixture passed 216 checks across Normal, Overdrive and Supreme: card cancellation/redirection, Flux entry, AA fire, every authored module, boss families/core protection, destroyed-weapon cancellation, core volleys, ammo/deployables, Supreme effects, physical pickups, success banking, failure discard and Arena restoration.
- The Store fixture passed 22 checks using actual local profile storage: insufficient funds, real purchases, price/caps, reload, write-failure rollback for purchase/use, daily reset and Cosmetics exclusion.
- The shared scheduler fixture exercised all 24 event/mode combinations at round 1 with training unfinished, plus cooldown, boss exclusion and debrief/Continue timer handoff.
- A final focused fixture passed 103 checks, including controller-open without accidental confirmation, explicit OFFLINE status, and HEIST card redirection. Runnable fixtures are in `scripts/audit-skybreach.browser.js`, `scripts/audit-access-cards.browser.js`, and `scripts/audit-anomaly-scheduling.browser.js`; raw evidence is in ignored `artifacts/` reports. [Compact validation evidence](skybreach-pass2-validation.json).

These are assisted gameplay checks, with forced opportunities, invulnerability, accelerated boss destruction and selected test builds. They do not establish unassisted difficulty, broad device performance or subjective feel. The next pass should use human keyboard/controller playthroughs to tune flight-path readability, build-dependent time to kill, and the core-phase pressure. Local clock/save editing and restoring old exports can bypass local quotas; account-wide or server-verified consumable limits are outside this pass. Existing Currency Exchange versus permanent-upgrade affordability remains unchanged for separate review.
