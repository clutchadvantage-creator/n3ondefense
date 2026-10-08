# Weekly Operations / Mission Deck

## A. Source changes

- `src/game/progression/WeeklyOperations.ts`: compatible track resolution, frozen mission selection, first-completion timestamps, preview versus collection.
- `WeeklyMissionLibrary.ts`: eligible mission templates, categories, icons and per-deck target ranges.
- `WeeklyRewardCampaigns.ts`: campaign configuration, earned receipts, eligibility, display states and history.
- `WeeklyRewardDelivery.ts`: existing inventory/wallet adapters and durable future entitlements.
- `src/game/state/PlayerProfileStore.ts`, `systems/SaveSystem.ts`: authoritative event counters, campaign reservations, atomic collection and ownership queries.
- `src/game/save/LocalSaveTypes.ts`, `SaveValidator.ts`: additive defaults and export/import normalization. The existing v20 format and storage namespace remain compatible.
- `src/game/scenes/MainMenuScene.ts`, `ui/WeeklyRewardView.ts`: stable panel navigation, mission presentation, currency artwork and featured reward details.
- `ArenaScene.ts`: count successful anomaly returns at their existing guarded commit, and flush pending combat progress when full-deck completion is announced.
- `WeeklyCompletionTracker.ts`: collection guidance points to Main Menu, which already owns reward collection.

## B. Challenges and tracking

There are thirteen templates: enemy destruction, round completion, bomb detonation, Credits earned, boss encounter victories, Arcade events, Golden Enemies, Arcade mini-bosses, Neon Circuits, successful Heists, successful SkyBreach runs, Mod upgrades and currency exchanges. Titles are separate from explicit numerical objectives. Cards retain segmented bars and add category glyphs, progress totals, green completion states and brief completion accents.

Selection is deterministic for each UTC week and deck, uses three distinct categories, and stores mission IDs when assigning the week. Eligibility changes never reroll an assigned deck. Combat is always available; optional systems enter the pool after training/established play; Mod upgrade missions require an owned upgradeable card. Mission selection uses the authoritative profile and does not scan inventory during ordinary progress polling.

Current legacy weeks retain their objective IDs, targets, baselines, absolute highest-round behavior and rewards. Creative titles and explicit objective descriptions apply immediately. Expanded selection starts on a new assignment/reset. Keep published template IDs stable; add a new ID for a materially different objective.

Regular progress continues counting all existing eligible gameplay. The second deck retains the internal ID `overdrive` and visible label **OVERDRIVE CHALLENGES**. Both Overdrive and Supreme Overdrive contribute. There is no third deck or Supreme-only ledger. Menu purchases/exchanges cannot be attributed to a live difficulty, so their missions are Regular-only.

The new counters use existing successful Store transactions, `recordRoundCompletion(..., 'boss')`, the Trinity completion path, and the guarded successful anomaly-return path. Failed exchanges/upgrades, failed anomaly runs and duplicate return callbacks do not produce progress. Existing combat/Arcade counters retain their owners and batching.

## C. UI and rewards

Arrows no longer restart Main Menu. The panel shell, header and arrow objects remain mounted; only the selected cached content container fades/slides for 240 ms. Rapid input cancels obsolete page tweens. Stable focus IDs retain keyboard/controller navigation. Reduced motion switches instantly. There are at most two cached deck pages; one minute timer updates clocks and refreshes changed data, including weekly and campaign boundaries.

Standard reward entries use the actual shared gameplay pickup/Mod renderer, with individual amounts and names. No extra images or special-reward assets were created. Featured rewards appear only when configured or when previously earned delivery is pending. Their detail cards support hover and keyboard/controller activation. The campaign clock is separate from the weekly reset clock. Claimed historical rewards remain in inventory and the history query without permanently occupying the mission deck.

All eight existing standard reward packages, including currency amounts and random-Mod eligibility, remain unchanged. Standard collection remains automatic when Main Menu resolves the deck. Completion does not pause combat or introduce a full-screen reward popup.

## D. Featured campaign configuration

Edit `WEEKLY_REWARD_CAMPAIGNS` in `src/game/progression/WeeklyRewardCampaigns.ts`. **The production array is empty. No campaign, item or example reward is activated.**

Each scheduled campaign has a stable `campaignId`, title, description, absolute UTC `startsAt`/`endsAt` timestamps ending in `Z`, `enabled`, optional `eligibleDecks`, optional `sharedReward` and optional `overdriveBonus`. Omit reward entries for zero/one-reward campaigns. Schedule nonoverlapping enabled windows; `validateWeeklyRewardCampaigns` checks IDs, dates, overlap and reward metadata.

Each reward defines `rewardId`, `type`, `inventoryRef`, `displayName`, `iconRef`, positive integer `amount`, `enabled`, optional deck eligibility, rarity and tooltip. Existing adapters support cosmetics, specific Mods and all four currencies. `entitlement` is a persisted ownership record for a future feature that explicitly reads it. It does not invent an equipable cosmetic. Use existing inventory IDs and artwork. Supported icon references are existing Phaser texture keys, `mod:<existing Mod ID>`, or `pickup:credits`, `pickup:coreToken`, `pickup:plasmaChip`, `pickup:fluxCore`.

Eligibility:

| Full deck completed during campaign | Featured grants |
| --- | --- |
| Regular | Shared reward |
| Overdrive (including Supreme play) | Shared reward **and** optional Overdrive bonus |
| Later deck/week in same campaign | Only featured rewards still missing |

There is no reward choice. Standard weekly currencies continue independently. An item already owned is recognized without inserting duplicate cosmetic ownership, and its campaign receipt is still recorded. Unknown cosmetic/Mod references remain pending for a corrected inventory adapter rather than becoming a fake grant.

## E. Persistence and boundaries

`progress.weeklyRewardCampaigns` stores profile-local receipts keyed by `(campaignId, rewardId)` and durable entitlement ownership. The weekly track stores `completedAt`; reservations are created during authoritative progress commits, separately from Main Menu delivery. A completed deck announced by the HUD flushes pending combat counters immediately.

Campaign earning uses **start inclusive, end exclusive** UTC boundaries and the first observed authoritative full-deck completion. A deck completed before the campaign starts does not retroactively qualify. Legacy already-claimed tracks without a completion timestamp are not assigned a fictional completion time.

Earned receipts copy reward definitions and eligibility. They survive later weeks, expiration, campaign disabling/removal, exports and reloads. Main Menu can therefore deliver an earned reward after the earning window closes. `AVAILABLE` means eligible but incomplete; `EARNED` means delivery pending; `CLAIMED` means ownership and receipt were persisted together. `getWeeklyRewardHistory()` also exposes `EXPIRED` for configured historical rewards that were not earned. Expiration never removes earned ownership.

Collection builds a candidate save, applies standard rewards and supported featured grants, and writes the inventory/wallet/claim markers together with persistent-storage verification. A failed write restores the previous in-memory wallet/inventory/claim state. Reopening retries earned receipts. Repeated clicks, deck switches, refreshes and later weeks cannot grant the same campaign/reward twice. A future feature can query `SaveSystem.getWeeklyEntitlementAmount(inventoryRef)` for its actual saved entitlement.

The legacy root Regular track and nested `overdrive` track remain in place. New fields default safely; unrelated wallet balances, upgrades, Mods/ranks/infusions, loadouts, profile identity and progression are retained. Campaign claims are not part of the weekly reset.

## F. Automated verification

- `npm test`: full existing suite plus `tests/weekly-campaigns.test.mjs`.
- `npm run build`: TypeScript and production Vite build.
- Campaign tests cover mission eligibility and thresholds, legacy progress, frozen selections, all existing standard reward amounts, 0/1/2 featured entries, shared/bonus eligibility, both completion orders, three weeks, date boundaries, history states, inventory adapters, pending grants, profile isolation, serialization and idempotency.
- `scripts/audit-weekly-operations.browser.js`: real Phaser panel and profile storage, keyboard/controller navigation, rapid switching, cached object counts, actual Store metric adapters, reward details, forced persistent-write failures, rollback/retry, profile reload and reduced motion. Test campaign metadata is injected only into the isolated DEV process and removed afterward.

Final results: **894/894 automated tests passed**, production build passed, and **138/138 browser assertions passed** (46 at each of three viewports). No unresolved test failures. Reports are in ignored local artifacts: `artifacts/weekly-tests.log`, `weekly-build.log`, `weekly-1280x720.json`, `weekly-1366x768.json`, and `weekly-1600x1000.json`.

## G. Browser QA

Review Regular and Overdrive at 1280×720, 1366×768 and 1600×1000, including two featured rewards and the five-entry standard package. Check full titles/objectives, bars, reward art, separate countdowns, focus retention and detail readability. The reproducible browser fixture creates isolated test profiles; it removes DEV-only Voice Lab controls while testing production menu input because those controls are absent from production builds.

## H. Limits and future work

- No live featured campaign is enabled. Future rewards need approved inventory references/artwork and campaign configuration.
- Drone/weapon/ability kill attribution, pickup-specific counters and recalibration missions are intentionally absent from the selectable pool. They need reliable dedicated attribution before being offered; no progress is fabricated.
- Future entitlement types have durable ownership/query support, but a corresponding future feature must implement its display/equip behavior. Existing cosmetics and Mods use their real inventories today.
- Saves and campaign time use the existing local profile/browser clock. Cross-device claims and server-authoritative time are outside this local architecture. If browser storage is unavailable, a rejected grant stays pending; data never successfully written to storage cannot survive closing the browser.
