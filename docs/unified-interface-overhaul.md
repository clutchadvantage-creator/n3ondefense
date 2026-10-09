# Unified interface and operator configurations

## Audit

The presentation benchmark is `ModCollectionUi.ts`: chamfered chassis, dark inset glass, cyan primary / magenta utility / green return / amber warning accents, Orbitron headings, Rajdhani body copy, structural rails and status readouts. `PauseMenuUi.ts` already uses this language. Preserve both, changing the collection title to **MOD COLLECTION**.

Existing presentation owners:

| Surface | Implementation / intended integration |
| --- | --- |
| Mod archive and library | `ModCollectionUi`, `ModCardView`, `ModDatabaseViewer`; preserve authored card art |
| Garage and stations | `OperatorGarageScene`, `GarageEnvironment`; retain responsive workstation layout |
| Presets | `GarageState`, `garage/types`, `PlayerProfileStore`; replace partial loads with validated transactions |
| Deployment and constellation | Garage overlays and `OperationsConfiguration`; preserve progression validators |
| Signals / Contracts | `RunConfigurationConsoleUi`; preserve launch-time cost and persistence behavior |
| Locker | `GearLockerUi`, `CosmeticPreview`; reuse actual owned cosmetic assets |
| Exchange | `EconomyConsoleUi`; preserve calculations and analytics |
| Main menu / Weekly Operations | Existing generated branding, supplied background, hover mission tray; retain behavior |
| Settings / leaderboards / loading / results | Phaser scenes, shared `createButton`, existing debrief presentation |
| Store / profiles / feedback | DOM views with scoped CSS; share static terminal tokens and control treatments |
| Confirmation / tutorials / HUD | `localSaveUi`, tutorial CSS, existing HUD and Pause components; polish chrome without moving gameplay targets |

The preset audit found three slots with owned card references and run selections, but no cosmetics, naming controls, overwrite guard, or active/modified tracking. Existing loads silently skipped invalid cards and locked protocols. The save stays profile-owned; no new inventory, currency, progression or monetization system is needed.

## Implementation stages

- [x] Shared static terminal detailing and consistent controls; collection title.
- [x] Versioned complete presets, naming, validation, atomic persistence and compatibility.
- [x] Configuration card previews, deployment and constellation polish, Garage integration.
- [x] Remaining menu, DOM, modal, tutorial and HUD polish through shared presentation.
- [x] Automated regressions, production build and browser verification.

## Compatibility decisions

- Keep `config-a`, `config-b`, `config-c` and existing profile storage identifiers.
- Capture all five owned Mod instance references. Ranks/calibrations remain live inventory state. Record infusion links without copying or reinstalling paid infusions.
- Capture all ten existing cosmetic categories by stable ID; never add cosmetic ownership.
- Capture selected protocol/mode, starting round, Contract, Signal and the existing retain-deployment toggle. Audio, display and other global preferences are excluded.
- Legacy presets keep their Mod/run references and default names. Fields that never existed in a legacy preset leave the corresponding current selection unchanged on load.
- Reject a missing/locked/invalid component before changing the active configuration. Keep the saved preset available for correction.
- Contract/Signal costs remain payable at deployment through the existing launch transaction.

## Delivered UI

`TerminalChrome.ts` supplies static inset borders, corner brackets, structural rails, color tokens and a configuration panel. The existing shared `createButton` keeps its hit area, navigation registration, hover, press and disabled behavior; it adds this detailing to ordinary controls. Mod Collection's richer authored controls keep their existing construction.

- **Mod Collection:** requested title and unchanged subtitle, artwork, inventory actions and navigation.
- **Garage:** framed wallet rows, clearer configuration hierarchy, long mode names fitted below their row labels, shared station controls and existing Mod artwork.
- **Configuration Presets:** three complete preview cards, naming/renaming, explicit overwrite confirmation, active/modified/invalid states, actual Mod icons/rarities/Infusions, ten cosmetic thumbnails and timestamps. Narrow screens page through slots; short screens provide Deployment / Mods / Cosmetics tabs.
- **Deployment:** larger checkpoint tiles, boss accents, clearance indicators, reserved pagination space, mode motif and actual run cost/readiness. Eligibility still uses the existing progression service.
- **Constellations:** additional structural framing, existing active/locked/unlocked states, clearance bars and names. Small layouts fit the complete ladder. Changing family retains the outer workstation.
- **Library, Locker, Signals/Contracts and Exchange:** shared workstation frames/buttons preserve their distinct layouts. Exchange fixes an existing undefined text-width value that hid balances. Compact windows page through financial panels with mouse-wheel and keyboard/controller-accessible scroll controls. Existing exchange prices and transactions are unchanged.
- **Settings, local leaderboards, debrief and confirmation panels:** shared static frame details. Existing scrolling, actions and routes remain.
- **Store, profiles, feedback and tutorials:** scoped shared CSS for controls, focus, status rows and panel accents. Store category labels receive enough sidebar width to avoid splitting ordinary words.
- **Main menu, Weekly Operations and Pause:** retain their established artwork/layouts and behavior; shared controls inherit the common treatment. The supplied menu background and generated title remain intact.
- **HUD:** inset and fastener details reuse the existing frame graphics; no new update loop or gameplay hit target.

Overlay page changes replace the content container while retaining the outer shell. Destroying the retired content runs its cleanup handlers, including Exchange wallet subscriptions. Preset thumbnails are static, and animated cosmetic previews honor browser reduced-motion preferences.

## Configuration data and persistence

The format is versioned **inside each preset** (`version: 2`); the existing profile version, storage keys, slot IDs and inventory ownership remain compatible.

| Stored data | Meaning |
| --- | --- |
| `id`, `name`, `saved`, `savedAt`, `version` | Existing slot identity, custom label, timestamp and format |
| `cardSlots` | Exact owned instances in weapon, player, defense, bombSite and wildcard |
| `cardModIds` | Definition metadata for previews and readable missing-item messages; never ownership |
| `infusionIds` | Captured Infusion links for those instances |
| `cosmetics` | Equipped `playerColor`, `playerShape`, `projectileColor`, `projectileShape`, `trailColor`, `bombColor`, `turretSkin`, `mineFrame`, `fenceStyle`, `dashTrail` |
| `protocol`, `campaignStartRound`, `normalStartRound` | Existing mode/protocol identity and starting checkpoint selections |
| `contract`, `modFocus`, `savedDeploymentEnabled` | Contract, Signal and retain-deployment setting |
| Garage `activePresetId` | Most recently loaded configuration; compare current selections to report modifications |

Names are limited to 24 characters, whitespace-normalized, stripped of markup delimiters/control characters, and rendered as text. Blank names retain a sensible existing/default name. Each slot is updated independently and persisted through the current player profile.

Saving never equips items or spends currency. Loading validates every reference first, then commits all equipment and deployment selections together through `PlayerProfileStore`. If persistent storage fails, the previous configuration is restored and a failure is shown. Invalid loads retain the saved preset and current setup; a scrollable dialog lists every unavailable component.

Ranks and upgrades stay on the live owned Mod instances. A changed Infusion link requires correction/resaving rather than silently reinstalling a paid Infusion. Cosmetic validation accepts owned items and the same default equipment already allowed by the save system. No inventory entries, currency or progression are granted.

Legacy presets keep their saved Mod references and run setup, receive default names where needed, and leave uncaptured cosmetics/Infusions/retain settings alone. Invalid imported values are retained as validation issues rather than silently replaced with usable defaults. Newer unsupported formats and incomplete version-2 records are rejected safely. Successfully resaving clears stale validation issues.

## Verification

Story: Garage action → preset validation → player profile transaction → local persistence → restored Garage/preview state. This feature uses local storage; no backend, account or environment variable is involved.

- `npm test`: **924 passed, 0 failed**, including the complete preset round trip, instance identity/rank preservation, names, overwrite, invalid/missing/locked components, legacy saves and modified-state cases.
- `npm run build`: passed TypeScript and production Vite build.
- `scripts/audit-unified-interface.browser.js`: real local browser flow using the actual naming form, focus manager, SaveSystem, profile store and persistent reload. Includes storage failure injection, overwrite cancellation/confirmation, slot isolation, scrollable validation, stable overlay lifecycle, exact exchange charging and finite financial text geometry.
- Visual and interaction passes at **1920×1080, 1280×720, 960×720 and 640×480**. The compact flow checks all financial pages and scroll controls as well as preset content tabs.
- Separate DOM checks cover naming focus, Tab containment, Escape, controller-layer availability, Store mode switching and Profile Continue at desktop/compact sizes; no uncaught exceptions in that pass.
- Browser artifacts and screenshots are under ignored `artifacts/unified-*`; test/build logs are `artifacts/unified-interface-tests.log` and `artifacts/unified-interface-build.log`.

The local verification uses isolated QA profiles. Physical-controller hardware, an unassisted full campaign and the deployed production site were not exercised for this UI change. Controller behavior was checked through the real navigation layer. No new continuous animation loops were added; repeated workstation refreshes were checked for stable object counts and retiring subscriptions, rather than making an unmeasured FPS claim.

## Main implementation owners

- `src/game/ui/TerminalChrome.ts`, `src/game/utils/ui.ts`, `src/ui/terminal.css`: shared presentation.
- `src/game/ui/ConfigurationPresetsView.ts`, `src/ui/PresetNameDialog.ts`: cards, naming/overwrite and validation dialogs.
- `src/game/garage/GarageState.ts`, `src/game/garage/types.ts`: schema, normalization, validation, snapshot/apply and active status.
- `src/game/state/PlayerProfileStore.ts`, `src/game/systems/SaveSystem.ts`: persistent transactions and public facade.
- `src/game/scenes/OperatorGarageScene.ts`, `src/game/garage/EconomyConsoleUi.ts`: workstation lifecycle, deployment/constellations and responsive financial views.
- `src/data/cosmetics.ts`, `src/game/save/SaveValidator.ts`, `src/game/cosmetics/CosmeticPreview.ts`: existing default equipment eligibility and static thumbnail reuse.
- `tests/configuration-presets.test.mjs`, updated Garage/collection tests, and the browser audit: regression coverage.
